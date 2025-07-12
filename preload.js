const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  checkYtDlp: () => ipcRenderer.invoke('check-ytdlp'),
  downloadMedia: (options) => ipcRenderer.invoke('download-media', options),
  onDownloadProgress: (callback) => {
    ipcRenderer.on('download-progress', (event, data) => callback(data));
  },
  onDownloadError: (callback) => {
    ipcRenderer.on('download-error', (event, error) => callback(error));
  }
});