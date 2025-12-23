// torrent-worker.js
async function start() {
  const { default: WebTorrent } = await import('webtorrent');
  const http = await import('http');
  
  const client = new WebTorrent();
  const magnet = process.argv[2];
  const port = parseInt(process.argv[3]) || 8080;
  const downloadPath = process.argv[4];

  client.add(magnet, { path: downloadPath }, (torrent) => {
    const server = http.createServer((req, res) => {
      // 1. Find the largest file (the movie)
      const file = torrent.files.reduce((a, b) => (a.length > b.length ? a : b));
      
      // 2. Handle HTTP Range Headers for seeking
      const range = req.headers.range;
      if (!range) {
        // No range requested, send the whole file (standard)
        res.writeHead(200, {
          'Content-Length': file.length,
          'Content-Type': 'video/mp4', // Most common, works for mkv too
        });
        file.createReadStream().pipe(res);
        return;
      }

      // Parse Range: "bytes=0-100"
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : file.length - 1;
      const chunksize = (end - start) + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${file.length}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'video/mp4',
      });

      // 3. Stream only the requested chunk
      file.createReadStream({ start, end }).pipe(res);
    });

    server.listen(port, () => {
      console.log(`Server running at: http://localhost:${port}/0`);
    });

    torrent.on('error', (err) => {
      console.error('Torrent Error:', err.message);
    });
  });

  process.on('SIGTERM', () => {
    client.destroy();
    process.exit();
  });
}

start().catch(err => {
  console.error('Worker failed:', err);
  process.exit(1);
});