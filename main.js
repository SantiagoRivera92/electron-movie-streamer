const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const axios = require('axios');
const fs = require('fs').promises;
const os = require('os');
const { rimraf } = require('rimraf');

let mainWindow;
let webtorrentProcess = null;
let mpvProcess = null;
let tempDir = null;
let subtitlePath = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'icon.png')
  });

  mainWindow.loadFile('index.html');
  
  mainWindow.on('closed', () => {
    cleanup();
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  cleanup();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

ipcMain.handle('search-movies', async (event, query) => {
  try {
    const url = `https://yts.lt/api/v2/list_movies.json?query_term=${encodeURIComponent(query)}&sort_by=seeds`;
    const response = await axios.get(url, { timeout: 10000 });
    return response.data.data?.movies || [];
  } catch (error) {
    console.error('Search error:', error);
    return [];
  }
});

ipcMain.handle('search-subtitles', async (event, { title, year, imdbId }) => {
  try {
    mainWindow.webContents.send('subtitle-progress', 'Searching for subtitles...');
    
    const searchQuery = imdbId || `${title} ${year}`;
    const url = `https://rest.opensubtitles.org/search/query-${encodeURIComponent(searchQuery)}/sublanguageid-eng`;
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'MovieStreamer v1.0'
      },
      timeout: 10000
    });

    if (response.data && response.data.length > 0) {
      const subtitle = response.data.sort((a, b) => 
        parseFloat(b.SubRating || 0) - parseFloat(a.SubRating || 0)
      )[0];
      
      mainWindow.webContents.send('subtitle-progress', 'Downloading subtitle...');
      
      const subResponse = await axios.get(subtitle.SubDownloadLink, {
        responseType: 'arraybuffer',
        timeout: 10000
      });
      
      let subContent = subResponse.data;
      if (subtitle.SubDownloadLink.endsWith('.gz')) {
        const zlib = require('zlib');
        subContent = zlib.gunzipSync(Buffer.from(subContent));
      }
      
      subtitlePath = path.join(os.tmpdir(), `subtitle_${Date.now()}.srt`);
      await fs.writeFile(subtitlePath, subContent);
      
      mainWindow.webContents.send('subtitle-progress', 'Subtitle downloaded successfully');
      return { success: true, path: subtitlePath };
    } else {
      mainWindow.webContents.send('subtitle-progress', 'No subtitles found');
      return { success: false, message: 'No subtitles found' };
    }
  } catch (error) {
    console.error('Subtitle search error:', error);
    mainWindow.webContents.send('subtitle-progress', 'Subtitle download failed');
    return { success: false, message: error.message };
  }
});

ipcMain.handle('start-stream', async (event, { hash, title, quality, useSubtitles, movieData }) => {
  try {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'movie-stream-'));
    
    if (useSubtitles && movieData) {
      await ipcMain.emit('search-subtitles-internal', event, {
        title: movieData.title,
        year: movieData.year,
        imdbId: movieData.imdb_code
      });
    }
    
    const magnet = `magnet:?xt=urn:btih:${hash}&dn=${encodeURIComponent(title)}`;
    const port = 8080;
    
    webtorrentProcess = spawn('webtorrent', [
      magnet,
      '--port', port.toString(),
      '--out', tempDir
    ]);

    let streamUrl = null;
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('Timeout waiting for stream'));
      }, 60000);

      webtorrentProcess.stdout.on('data', (data) => {
        const output = data.toString();
        console.log(output);
        
        mainWindow.webContents.send('stream-progress', output);
        
        if (output.includes('Server running at:')) {
          const match = output.match(/http:\/\/localhost:\d+\/\S+/);
          if (match) {
            streamUrl = match[0];
            clearTimeout(timeout);
            
            // Wait for peers
            setTimeout(() => {
              startMPV(streamUrl, title, useSubtitles);
              resolve({ success: true, url: streamUrl });
            }, 3000);
          }
        }
      });

      webtorrentProcess.stderr.on('data', (data) => {
        console.error('WebTorrent error:', data.toString());
        mainWindow.webContents.send('stream-progress', data.toString());
      });

      webtorrentProcess.on('close', (code) => {
        console.log(`WebTorrent exited with code ${code}`);
        if (!streamUrl) {
          clearTimeout(timeout);
          reject(new Error('WebTorrent failed to start'));
        }
      });
    });
  } catch (error) {
    cleanup();
    throw error;
  }
});

ipcMain.on('search-subtitles-internal', async (event, data) => {
  try {
    mainWindow.webContents.send('subtitle-progress', 'Searching for subtitles...');
    
    const searchQuery = data.imdbId || `${data.title} ${data.year}`;
    const url = `https://rest.opensubtitles.org/search/query-${encodeURIComponent(searchQuery)}/sublanguageid-eng`;
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'MovieStreamer v1.0'
      },
      timeout: 10000
    });

    if (response.data && response.data.length > 0) {
      const subtitle = response.data.sort((a, b) => 
        parseFloat(b.SubRating || 0) - parseFloat(a.SubRating || 0)
      )[0];
      
      mainWindow.webContents.send('subtitle-progress', 'Downloading subtitle...');
      
      const subResponse = await axios.get(subtitle.SubDownloadLink, {
        responseType: 'arraybuffer',
        timeout: 10000
      });
      
      let subContent = subResponse.data;
      if (subtitle.SubDownloadLink.endsWith('.gz')) {
        const zlib = require('zlib');
        subContent = zlib.gunzipSync(Buffer.from(subContent));
      }
      
      subtitlePath = path.join(os.tmpdir(), `subtitle_${Date.now()}.srt`);
      await fs.writeFile(subtitlePath, subContent);
      
      mainWindow.webContents.send('subtitle-progress', '✓ Subtitle downloaded');
    } else {
      mainWindow.webContents.send('subtitle-progress', '✗ No subtitles found');
    }
  } catch (error) {
    console.error('Subtitle error:', error);
    mainWindow.webContents.send('subtitle-progress', '✗ Subtitle download failed');
  }
});

function startMPV(url, title, useSubtitles) {
  if (mpvProcess && !mpvProcess.killed) {
    console.log('MPV is already running.');
    return;
  }
  const mpvArgs = [
    url,
    `--title=${title}`,
    '--fs',
    '--cache=yes',
    '--demuxer-max-bytes=50M',
    '--demuxer-max-back-bytes=25M',
    '--cache-secs=5',
    '--force-seekable=yes'
  ];

  // Add subtitle file if available
  if (useSubtitles && subtitlePath) {
    mpvArgs.push(`--sub-file=${subtitlePath}`);
    mpvArgs.push('--sub-auto=fuzzy');
  }

  mpvProcess = spawn('mpv', mpvArgs);

  mpvProcess.on('close', (code) => {
    console.log(`MPV exited with code ${code}`);
    cleanup();
    mainWindow.webContents.send('playback-ended');
  });

  mpvProcess.stderr.on('data', (data) => {
    console.log('MPV:', data.toString());
  });
}

ipcMain.handle('stop-stream', async () => {
  cleanup();
  return { success: true };
});

async function cleanup() {
  if (webtorrentProcess) {
    webtorrentProcess.kill();
    webtorrentProcess = null;
  }
  
  if (mpvProcess) {
    mpvProcess.kill();
    mpvProcess = null;
  }
  
  if (tempDir) {
    try {
      await rimraf(tempDir);
      console.log('Cleaned up temp directory');
    } catch (error) {
      console.error('Cleanup error:', error);
    }
    tempDir = null;
  }
  
  if (subtitlePath) {
    try {
      await fs.unlink(subtitlePath);
      console.log('Cleaned up subtitle file');
    } catch (error) {
      console.error('Subtitle cleanup error:', error);
    }
    subtitlePath = null;
  }
}

app.on('before-quit', () => {
  cleanup();
});
