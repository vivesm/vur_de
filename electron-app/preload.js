const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Check if yt-dlp is installed
  checkYtDlp: () => ipcRenderer.invoke('check-ytdlp'),
  
  // Get video information
  getPreviewInfo: (url, playlistLimit) => {
    console.log('preload getPreviewInfo called with:', url, playlistLimit);
    return ipcRenderer.invoke('get-preview-info', url, playlistLimit);
  },
  
  // Download media
  downloadMedia: (options) => ipcRenderer.invoke('download-media', options),
  
  // Queue operations
  pauseDownload: (downloadId) => ipcRenderer.invoke('pause-download', downloadId),
  resumeDownload: (downloadId) => ipcRenderer.invoke('resume-download', downloadId),
  cancelDownload: (downloadId) => ipcRenderer.invoke('cancel-download', downloadId),
  getQueueStatus: () => ipcRenderer.invoke('get-queue-status'),
  removeDownloadHistory: (downloadId) => ipcRenderer.invoke('remove-download-history', downloadId),
  getDownloadHistory: () => ipcRenderer.invoke('get-download-history'),
  
  // Settings management
  getSettings: () => ipcRenderer.invoke('get-settings'),
  updateSettings: (settings) => ipcRenderer.invoke('update-settings', settings),
  
  // Directory selection
  chooseDirectory: () => ipcRenderer.invoke('choose-directory'),
  openDownloadFolder: () => ipcRenderer.invoke('open-download-folder'),
  
  // Progress events
  onDownloadStarted: (callback) => {
    ipcRenderer.on('download-started', (event, data) => callback(data));
  },
  
  onDownloadProgress: (callback) => {
    ipcRenderer.on('download-progress', (event, data) => callback(data));
  },
  
  onDownloadCompleted: (callback) => {
    ipcRenderer.on('download-completed', (event, data) => callback(data));
  },
  
  onDownloadError: (callback) => {
    ipcRenderer.on('download-error', (event, error) => callback(error));
  },
  
  onDownloadInfo: (callback) => {
    ipcRenderer.on('download-info', (event, info) => callback(info));
  },
  
  onShowPreferences: (callback) => {
    ipcRenderer.on('show-preferences', () => callback());
  },
  
  // Remove listeners
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  }
});