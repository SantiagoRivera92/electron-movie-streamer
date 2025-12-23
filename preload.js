const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  searchMovies: (query) => ipcRenderer.invoke('search-movies', query),
  searchSubtitles: (data) => ipcRenderer.invoke('search-subtitles', data),
  startStream: (data) => ipcRenderer.invoke('start-stream', data),
  stopStream: () => ipcRenderer.invoke('stop-stream'),
  onStreamProgress: (callback) => ipcRenderer.on('stream-progress', (event, data) => callback(data)),
  onSubtitleProgress: (callback) => ipcRenderer.on('subtitle-progress', (event, data) => callback(data)),
  onPlaybackEnded: (callback) => ipcRenderer.on('playback-ended', () => callback())
});
