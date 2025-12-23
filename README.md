# MovieStreamer

MovieStreamer is a cross-platform desktop application for searching and streaming movies instantly, built with Electron. It features a modern UI, fast search, and streaming via torrents.

## Features

- Search for movies instantly
- Stream movies directly from torrents
- Select video quality
- Download subtitles
- Cross-platform: Windows, Linux (.deb, .AppImage)
- Simple, modern user interface

## Screenshots

<!-- Add screenshots here if available -->

## Installation

### Download
- [Releases](https://github.com/SantiagoRivera92/electron-movie-streamer/releases)

### Linux (.deb)
1. Download the latest `.deb` file from the releases page.
2. Install via terminal:
   ```bash
   sudo dpkg -i movie-streamer_*.deb
   ```

### Windows
- Download and run the installer from the releases page.

### macOS
- I don't own a Mac. If you do and you want to contribute, feel free to build the app and I'll happily put it in the Releases section!

## Development

### Prerequisites
- [Node.js](https://nodejs.org/)
- [npm](https://www.npmjs.com/)
- [mpv](https://mpv.io/installation/)

### Setup
```bash
npm install
```

### Run in Development
```bash
npm start
```

### Build for Distribution
```bash
npm run dist
```

## Project Structure

```
Movie Streamer/
├── css/
│   └── styles.css
├── js/
│   └── app.js
├── index.html
├── main.js
├── preload.js
├── package.json
├── LICENSE
└── README.md
```

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## Author

[Santi Rivera](mailto:santirivera92@gmail.com)

## Contributing

Pull requests are welcome! For major changes, please open an issue first to discuss what you would like to change.

## Disclaimer

This project is for educational purposes only. Please ensure you comply with all applicable laws regarding streaming and copyright in your jurisdiction.
