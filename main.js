const { app, BrowserWindow, ipcMain, protocol } = require("electron")
const path = require("path")
const { spawn } = require("child_process")
const axios = require("axios")
const fs = require("fs").promises
const os = require("os")
const { rimraf } = require("rimraf")
const fsSync = require("fs")
const express = require("express")
const appExpress = express()

let mainWindow
let webtorrentProcess = null
let tempDir = null
let subtitlePath = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
      webSecurity: false, // Allow loading local resources
    },
    icon: path.join(__dirname, "icon.png"),
  })

  mainWindow.loadFile("index.html")

  mainWindow.on("closed", () => {
    cleanup()
    mainWindow = null
  })
}

// Register custom protocol for serving subtitles
app.whenReady().then(() => {
  // The old subtitle:// protocol won't work with the <track> element - use HTTP instead

  // Setup HTTP server for subtitles
  const subtitleServerPort = 9999
  appExpress.get("/subtitle", (req, res) => {
    if (subtitlePath) {
      res.sendFile(subtitlePath)
    } else {
      res.status(404).send("Subtitle not found")
    }
  })
  appExpress.listen(subtitleServerPort, () => {
    console.log(`Subtitle server running at http://localhost:${subtitleServerPort}`)
  })

  createWindow()
})

app.on("window-all-closed", () => {
  cleanup()
  if (process.platform !== "darwin") {
    app.quit()
  }
})

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

function srtToWebVtt(srtContent) {
  // Add WEBVTT header
  let vttContent = "WEBVTT\n\n"

  // Convert SRT content - mostly the same, but with the header
  const lines = srtContent.toString().split("\n")

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Convert SRT timestamp format (00:00:00,000 --> 00:00:00,000)
    // to WebVTT format (00:00:00.000 --> 00:00:00.000)
    if (line.includes("-->")) {
      vttContent += line.replace(/,/g, ".") + "\n"
    } else {
      vttContent += line + "\n"
    }
  }

  return vttContent
}

ipcMain.handle("search-movies", async (event, params) => {
  try {
    let query, page
    if (typeof params === "object" && params !== null) {
      query = params.query
      page = params.page || 1
    } else {
      query = params
      page = 1
    }
    const url = `https://yts.lt/api/v2/list_movies.json?query_term=${encodeURIComponent(query)}&sort_by=seeds&page=${page}`
    const response = await axios.get(url, { timeout: 10000 })
    const movies = response.data.data?.movies || []
    const totalPages = response.data.data?.movie_count
      ? Math.ceil(response.data.data.movie_count / (response.data.data.limit || 20))
      : 1
    return { movies, page, totalPages }
  } catch (error) {
    console.error("Search error:", error)
    return { movies: [], page: 1, totalPages: 1 }
  }
})

ipcMain.handle("search-subtitles", async (event, { title, year, imdbId }) => {
  try {
    mainWindow.webContents.send("subtitle-progress", "Searching for subtitles...")

    const searchQuery = imdbId || `${title} ${year}`
    const url = `https://rest.opensubtitles.org/search/query-${encodeURIComponent(searchQuery)}/sublanguageid-eng`

    const response = await axios.get(url, {
      headers: {
        "User-Agent": "MovieStreamer v1.0",
      },
      timeout: 10000,
    })

    if (response.data && response.data.length > 0) {
      const subtitle = response.data.sort(
        (a, b) => Number.parseFloat(b.SubRating || 0) - Number.parseFloat(a.SubRating || 0),
      )[0]

      mainWindow.webContents.send("subtitle-progress", "Downloading subtitle...")

      const subResponse = await axios.get(subtitle.SubDownloadLink, {
        responseType: "arraybuffer",
        timeout: 10000,
      })

      let subContent = subResponse.data
      if (subtitle.SubDownloadLink.endsWith(".gz")) {
        const zlib = require("zlib")
        subContent = zlib.gunzipSync(Buffer.from(subContent))
      }

      const vttContent = srtToWebVtt(subContent)

      subtitlePath = path.join(os.tmpdir(), `subtitle_${Date.now()}.vtt`)
      await fs.writeFile(subtitlePath, vttContent)

      const subtitleUrl = `http://localhost:9999/subtitle`
      console.log("[Subtitle] Downloaded to:", subtitlePath)
      console.log("[Subtitle] URL:", subtitleUrl)

      mainWindow.webContents.send("subtitle-progress", "Subtitle downloaded successfully")
      return { success: true, path: subtitleUrl }
    } else {
      mainWindow.webContents.send("subtitle-progress", "No subtitles found")
      return { success: false, message: "No subtitles found" }
    }
  } catch (error) {
    console.error("Subtitle search error:", error)
    mainWindow.webContents.send("subtitle-progress", "Subtitle download failed")
    return { success: false, message: error.message }
  }
})

ipcMain.handle("start-stream", async (event, { hash, title, quality, useSubtitles, movieData }) => {
  try {
    // Clean up any existing stream first
    await cleanup()

    // 1. Setup temporary directory for movie chunks
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "movie-stream-"))

    // 2. Search for subtitles if requested
    let subtitleUrl = null
    if (useSubtitles && movieData) {
      const subResult = await searchSubtitlesInternal({
        title: movieData.title,
        year: movieData.year,
        imdbId: movieData.imdb_code,
      })
      if (subResult.success) {
        subtitleUrl = `http://localhost:9999/subtitle`
      }
    }

    const magnet = `magnet:?xt=urn:btih:${hash}&dn=${encodeURIComponent(title)}`
    // Use a random port between 8080-8180 to avoid conflicts
    const port = 8080 + Math.floor(Math.random() * 100)

    // 3. Define the path to your custom worker script
    const nodeBin = process.execPath
    const workerPath = path.join(__dirname, "torrent-worker.js")

    // 4. Spawn the worker using Electron-as-Node mode
    webtorrentProcess = spawn(nodeBin, [workerPath, magnet, port.toString(), tempDir], {
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
      },
    })

    let streamUrl = null

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup()
        reject(new Error("Timeout: Could not find enough peers to start the stream."))
      }, 60000)

      webtorrentProcess.stdout.on("data", (data) => {
        const output = data.toString()
        mainWindow.webContents.send("stream-progress", output)

        if (output.includes("Server running at:")) {
          const match = output.match(/http:\/\/localhost:\d+\/\S+/)
          if (match) {
            streamUrl = match[0]
            clearTimeout(timeout)

            console.log("[Main] Resolving with URL:", streamUrl)
            console.log("[Main] Subtitle URL:", subtitleUrl)
            const result = { success: true, url: streamUrl, subtitleUrl }
            console.log("[Main] Full result:", JSON.stringify(result, null, 2))
            resolve(result)
          }
        }
      })

      webtorrentProcess.stderr.on("data", (data) => {
        const errOutput = data.toString()
        console.error("[Worker STDERR]", errOutput)
        mainWindow.webContents.send("stream-progress", `[Log] ${errOutput}`)
      })

      webtorrentProcess.on("error", (err) => {
        clearTimeout(timeout)
        console.error("Failed to spawn worker:", err)
        reject(new Error(`Worker execution failed: ${err.message}`))
      })

      webtorrentProcess.on("close", (code, signal) => {
        console.log(`[Worker CLOSE] code: ${code}, signal: ${signal}`)
        if (!streamUrl) {
          clearTimeout(timeout)
          reject(new Error("Stream worker exited unexpectedly."))
        }
      })
    })
  } catch (error) {
    console.error("Stream Start Error:", error)
    cleanup()
    throw error
  }
})

async function searchSubtitlesInternal(data) {
  try {
    mainWindow.webContents.send("subtitle-progress", "Searching for subtitles...")

    const searchQuery = data.imdbId || `${data.title} ${data.year}`
    const url = `https://rest.opensubtitles.org/search/query-${encodeURIComponent(searchQuery)}/sublanguageid-eng`

    const response = await axios.get(url, {
      headers: {
        "User-Agent": "MovieStreamer v1.0",
      },
      timeout: 10000,
    })

    if (response.data && response.data.length > 0) {
      const subtitle = response.data.sort(
        (a, b) => Number.parseFloat(b.SubRating || 0) - Number.parseFloat(a.SubRating || 0),
      )[0]

      mainWindow.webContents.send("subtitle-progress", "Downloading subtitle...")

      const subResponse = await axios.get(subtitle.SubDownloadLink, {
        responseType: "arraybuffer",
        timeout: 10000,
      })

      let subContent = subResponse.data
      if (subtitle.SubDownloadLink.endsWith(".gz")) {
        const zlib = require("zlib")
        subContent = zlib.gunzipSync(Buffer.from(subContent))
      }

      const vttContent = srtToWebVtt(subContent)

      subtitlePath = path.join(os.tmpdir(), `subtitle_${Date.now()}.vtt`)
      await fs.writeFile(subtitlePath, vttContent)

      const subtitleUrl = `http://localhost:9999/subtitle`
      console.log("[Subtitle Internal] Downloaded to:", subtitlePath)
      console.log("[Subtitle Internal] URL:", subtitleUrl)

      mainWindow.webContents.send("subtitle-progress", "✓ Subtitle downloaded")
      return { success: true, path: subtitleUrl }
    } else {
      mainWindow.webContents.send("subtitle-progress", "✗ No subtitles found")
      return { success: false }
    }
  } catch (error) {
    console.error("Subtitle error:", error)
    mainWindow.webContents.send("subtitle-progress", "✗ Subtitle download failed")
    return { success: false }
  }
}

ipcMain.handle("stop-stream", async () => {
  cleanup()
  return { success: true }
})

async function cleanup() {
  if (webtorrentProcess) {
    try {
      webtorrentProcess.kill("SIGTERM")
      // Give it a moment to shut down gracefully
      await new Promise((resolve) => setTimeout(resolve, 500))

      // Force kill if still running
      if (!webtorrentProcess.killed) {
        webtorrentProcess.kill("SIGKILL")
      }
    } catch (error) {
      console.error("Error killing webtorrent process:", error)
    }
    webtorrentProcess = null
  }

  if (tempDir) {
    try {
      await rimraf(tempDir)
      console.log("Cleaned up temp directory")
    } catch (error) {
      console.error("Cleanup error:", error)
    }
    tempDir = null
  }

  if (subtitlePath) {
    try {
      await fs.unlink(subtitlePath)
      console.log("Cleaned up subtitle file")
    } catch (error) {
      console.error("Subtitle cleanup error:", error)
    }
    subtitlePath = null
  }
}

app.on("before-quit", () => {
  cleanup()
})
