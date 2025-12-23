async function start() {
  const { default: WebTorrent } = await import("webtorrent")
  const http = await import("http")

  const client = new WebTorrent()
  const magnet = process.argv[2]
  const port = Number.parseInt(process.argv[3]) || 8080
  const downloadPath = process.argv[4]

  client.add(magnet, { path: downloadPath }, (torrent) => {
    if (!torrent.files || torrent.files.length === 0) {
      console.error("[torrent-worker] No files found in torrent yet.");
      return;
    }
    const server = http.createServer((req, res) => {
      // Find the largest file (the movie)
      const file = torrent.files.reduce((a, b) => (a.length > b.length ? a : b))

      // Handle HTTP Range Headers for seeking
      const range = req.headers.range

      res.setHeader("Connection", "keep-alive")
      res.setHeader("Keep-Alive", "timeout=300, max=1000")
      res.setHeader("Accept-Ranges", "bytes")
      res.setHeader("Content-Type", "video/mp4")

      if (!range) {
        // No range requested, send the whole file (standard)
        res.writeHead(200, {
          "Content-Length": file.length,
        })
        file.createReadStream().pipe(res)
        return
      }

      // Parse Range: "bytes=0-100"
      const parts = range.replace(/bytes=/, "").split("-")
      const start = Number.parseInt(parts[0], 10)
      const end = parts[1] ? Number.parseInt(parts[1], 10) : file.length - 1

      // Get the largest contiguous downloaded chunk from the start
      let downloadedLength = 0
      try {
        // WebTorrent files have a buffer that tracks downloaded bytes
        // We need to check the actual downloaded amount
        if (file.downloaded !== undefined && file.downloaded !== null) {
          downloadedLength = file.downloaded
        } else if (file.length !== undefined) {
          // If file.downloaded isn't available, assume we can try serving it
          downloadedLength = file.length
        }
      } catch (err) {
        // Fallback: try to serve anyway
        downloadedLength = file.length
      }

      if (start >= downloadedLength && !file.done) {
        console.log(
          `[torrent-worker] Seek position ${start} beyond downloaded ${downloadedLength}, streaming as it downloads...`,
        )
        res.writeHead(206, {
          "Content-Range": `bytes ${start}-${file.length - 1}/${file.length}`,
          "Content-Length": file.length - start,
        })
        const stream = file.createReadStream({ start })
        stream.on("error", (err) => {
          console.error(`[torrent-worker] Stream error: ${err.message}`)
          if (!res.headersSent) {
            res.writeHead(500)
            res.end()
          } else {
            res.destroy()
          }
        })
        stream.pipe(res)
        return
      }

      const maxEnd = Math.min(end, file.length - 1)
      const chunksize = maxEnd - start + 1

      try {
        res.writeHead(206, {
          "Content-Range": `bytes ${start}-${maxEnd}/${file.length}`,
          "Content-Length": chunksize,
        })
        const stream = file.createReadStream({ start, end: maxEnd })
        stream.on("error", (err) => {
          console.error(`[torrent-worker] Stream error: ${err.message}`)
          if (!res.headersSent) {
            res.writeHead(500)
            res.end()
          } else {
            res.destroy()
          }
        })
        stream.pipe(res)
      } catch (err) {
        console.error(`[torrent-worker] Error creating stream: ${err.message}`)
        if (!res.headersSent) {
          res.writeHead(500)
          res.end()
        }
      }
    })

    // Add error handler for the server
    server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        console.error(`[torrent-worker] Port ${port} is already in use`)
        client.destroy()
        process.exit(1)
      } else {
        console.error(`[torrent-worker] Server error:`, err)
      }
    })

    server.listen(port, () => {
      console.log(`Server running at: http://localhost:${port}/0`)
    })

    torrent.on("error", (err) => {
      console.error("Torrent Error:", err.message)
    })
  })

  client.on("error", (err) => {
    console.error("[torrent-worker] WebTorrent error:", err.message)
    process.exit(1)
  })

  process.on("SIGTERM", () => {
    client.destroy()
    process.exit()
  })

  process.on("SIGINT", () => {
    client.destroy()
    process.exit()
  })
}

start().catch((err) => {
  console.error("Worker failed:", err)
  process.exit(1)
})
