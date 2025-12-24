const { app, BrowserWindow, ipcMain, protocol } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const axios = require('axios');
const fs = require('fs').promises;
const os = require('os');
const { rimraf } = require('rimraf');
const fsSync = require('fs');

let mainWindow;
let webtorrentProcess = null;
let tempDir = null;
let subtitlePath = null;

protocol.registerSchemesAsPrivileged([
  { scheme: 'sub', privileges: { bypassCSP: true, stream: true, secure: true, supportFetchAPI: true } }
]);

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    icon: path.join(__dirname, 'icon.png')
  });

  mainWindow.loadFile('index.html');

  mainWindow.on('closed', async () => {
    await cleanup();
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // 2. Register File Protocol for Subtitles
  // This replaces the Express server entirely
  protocol.registerFileProtocol('sub', (request, callback) => {
    const url = request.url.replace('sub://', '');
    if (subtitlePath && fsSync.existsSync(subtitlePath)) {
      callback({ path: subtitlePath });
    } else {
      callback({ error: -6 }); // FILE_NOT_FOUND
    }
  });

  createWindow();
});

app.on('window-all-closed', async () => {
  await cleanup();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

/**
 * Robust SRT to WebVTT conversion
 */
function srtToWebVtt(srtContent) {
  let vttContent = "WEBVTT\n\n";
  const lines = srtContent.toString().split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Convert timestamp format: 00:00:20,000 -> 00:00:20.000
    if (line.includes("-->")) {
      vttContent += line.replace(/,/g, ".") + "\n";
    } else {
      vttContent += line + "\n";
    }
  }
  return vttContent;
}

// --- IPC HANDLERS ---

ipcMain.handle('search-movies', async (event, params) => {
  try {
    let query, page;
    if (typeof params === 'object' && params !== null) {
      query = params.query;
      page = params.page || 1;
    } else {
      query = params;
      page = 1;
    }
    const url = `https://yts.lt/api/v2/list_movies.json?query_term=${encodeURIComponent(query)}&sort_by=seeds&page=${page}`;
    const response = await axios.get(url, { timeout: 30000 });
    const movies = response.data.data?.movies || [];
    const totalPages = response.data.data?.movie_count ? Math.ceil(response.data.data.movie_count / (response.data.data.limit || 20)) : 1;
    return { movies, page, totalPages };
  } catch (error) {
    console.error('Search error:', error);
    return { movies: [], page: 1, totalPages: 1 };
  }
});

// Internal subtitle download logic used by both direct call and stream start
async function searchSubtitlesInternal(data) {
  try {
    mainWindow.webContents.send('subtitle-progress', 'Searching for subtitles...');

    const searchQuery = data.imdbId || `${data.title} ${data.year}`;
    const url = `https://rest.opensubtitles.org/search/query-${encodeURIComponent(searchQuery)}/sublanguageid-eng`;

    const response = await axios.get(url, {
      headers: { 'User-Agent': 'MovieStreamer v1.0' },
      timeout: 30000
    });

    if (response.data && response.data.length > 0) {
      const subtitle = response.data.sort((a, b) =>
        parseFloat(b.SubRating || 0) - parseFloat(a.SubRating || 0)
      )[0];

      mainWindow.webContents.send('subtitle-progress', 'Downloading...');

      const subResponse = await axios.get(subtitle.SubDownloadLink, {
        responseType: 'arraybuffer',
        timeout: 30000
      });

      let subContent = subResponse.data;
      if (subtitle.SubDownloadLink.endsWith('.gz')) {
        const zlib = require('zlib');
        subContent = zlib.gunzipSync(Buffer.from(subContent));
      }

      const vttData = srtToWebVtt(subContent);
      subtitlePath = path.join(app.getPath('userData'), `sub_${Date.now()}.vtt`);
      await fs.writeFile(subtitlePath, vttData);

      mainWindow.webContents.send('subtitle-progress', '✓ Subtitles ready');
      return { success: true };
    }
    mainWindow.webContents.send('subtitle-progress', '✗ No subtitles found');
    return { success: false };
  } catch (error) {
    console.error('Subtitle error:', error);
    mainWindow.webContents.send('subtitle-progress', '✗ Download failed');
    return { success: false };
  }
}

ipcMain.handle('search-subtitles', async (event, data) => {
  return await searchSubtitlesInternal(data);
});

ipcMain.handle('start-stream', async (event, { hash, title, useSubtitles, movieData }) => {
  try {
    await cleanup(); // Clear previous stream

    // 1. Setup temp directory
    const baseDir = path.join(app.getPath('userData'), 'Captures');
    if (!fsSync.existsSync(baseDir)) await fs.mkdir(baseDir, { recursive: true });
    tempDir = await fs.mkdtemp(path.join(baseDir, "movie-stream-"));

    // 2. Handle Subtitles
    let hasSub = false;
    if (useSubtitles && movieData) {
      const subRes = await searchSubtitlesInternal({
        title: movieData.title,
        year: movieData.year,
        imdbId: movieData.imdb_code
      });
      hasSub = subRes.success;
    }

    const magnet = `magnet:?xt=urn:btih:${hash}&dn=${encodeURIComponent(title)}`;
    const port = 8080 + Math.floor(Math.random() * 100);
    const workerPath = path.join(__dirname, 'torrent-worker.mjs');

    // 3. Spawn Worker
    webtorrentProcess = spawn(process.execPath, [
      workerPath, magnet, port.toString(), tempDir
    ], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
    });

    let streamUrl = null;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(async () => {
        await cleanup();
        reject(new Error('Timeout: Peers not found.'));
      }, 60000);

      // Move stderr handler inside Promise
      webtorrentProcess.stderr.on('data', (data) => {
        const errorMsg = data.toString();
        console.error('[Worker Error]', errorMsg);
        mainWindow.webContents.send('stream-progress', `ERROR: ${errorMsg}`);
      });

      // Move exit handler inside Promise so reject is defined
      webtorrentProcess.on('exit', (code, signal) => {
        console.error(`[Worker Exit] Code: ${code}, Signal: ${signal}`);
        if (code !== 0 && !streamUrl) {
          reject(new Error(`Worker exited with code ${code}. Check if WebTorrent is properly installed.`));
        }
      });

      webtorrentProcess.stdout.on('data', (data) => {
        const output = data.toString();
        mainWindow.webContents.send('stream-progress', output);

        if (output.includes('Server running at:')) {
          const match = output.match(/http:\/\/localhost:\d+\/\S+/);
          if (match) {
            streamUrl = match[0];
            clearTimeout(timeout);
            resolve({
              success: true,
              url: streamUrl,
              subtitleUrl: hasSub ? "sub://subtitle" : null
            });
          }
        }
      });

      webtorrentProcess.on('close', (code) => {
        if (!streamUrl) reject(new Error('Process closed prematurely.'));
      });
    });
  } catch (error) {
    await cleanup();
    throw error;
  }
});

ipcMain.handle('stop-stream', async () => {
  await cleanup();
  return { success: true };
});

async function cleanup() {
  if (webtorrentProcess) {
    try {
      webtorrentProcess.kill('SIGTERM');
      await new Promise(resolve => {
        const timeout = setTimeout(() => {
          if (webtorrentProcess) {
            webtorrentProcess.kill('SIGKILL');
          }
          resolve();
        }, 2000);

        webtorrentProcess.once('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    } catch (e) {
      console.error('Cleanup error:', e);
    }
    webtorrentProcess = null;
  }
  
  if (tempDir) {
    try { await rimraf(tempDir); } catch (e) { }
    tempDir = null;
  }

  if (subtitlePath) {
    try { await fs.unlink(subtitlePath); } catch (e) { }
    subtitlePath = null;
  }
}

app.on('before-quit', cleanup);