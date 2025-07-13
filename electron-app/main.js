const { app, BrowserWindow, ipcMain, dialog, shell, Menu, Tray, nativeImage } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs').promises;
const Store = require('electron-store');
const { autoUpdater } = require('electron-updater');
const { v4: uuidv4 } = require('uuid');
const Database = require('./database');

// Initialize store for settings
const store = new Store();
const db = new Database();

// Keep a global reference of the window object
let mainWindow;
let tray;

// Default settings
const defaults = {
  downloadPath: app.getPath('downloads'),
  audioQuality: '192',
  videoQuality: 'best',
  keepWindowOnTop: false,
  startMinimized: false,
  theme: 'light'
};

// Initialize settings
Object.keys(defaults).forEach(key => {
  if (!store.has(key)) {
    store.set(key, defaults[key]);
  }
});

// Download Queue Manager
class DownloadQueueManager {
  constructor() {
    this.queue = [];
    this.activeDownloads = new Map();
    this.completedDownloads = new Map();
    this.maxConcurrent = 3;
    this.processes = new Map();
    this.downloadHistory = new Map();
  }

  async init() {
    const history = await db.getHistory();
    for (const item of history) {
      if (item.status === 'completed' || item.status === 'failed' || item.status === 'cancelled') {
        this.completedDownloads.set(item.id, item);
      }
    }
  }

  async loadHistory() {
    const history = await db.getHistory();
    for (const item of history) {
      if (item.status === 'completed') {
        this.completedDownloads.set(item.id, item);
      }
    }
  }

  async addToQueue(downloadInfo) {
    const isPlaylist = downloadInfo.url.includes('list=') || downloadInfo.url.includes('/playlist/');

    if (isPlaylist && downloadInfo.playlistItems && downloadInfo.playlistItems.length > 0) {
      // Case 1: A specific list of video IDs is provided (from a shuffled/modified preview)
      for (const videoId of downloadInfo.playlistItems) {
        const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
        try {
          const videoInfo = await this.getVideoInfo(videoUrl);
          const downloadId = uuidv4();
          const downloadItem = {
            id: downloadId,
            url: videoUrl,
            format: downloadInfo.format,
            quality: downloadInfo.quality,
            status: 'pending',
            progress: 0,
            addedAt: new Date().toISOString(),
            title: videoInfo.title || 'Unknown Title',
            error: null,
          };
          this.queue.push(downloadItem);
          await db.addDownload(downloadItem);
        } catch (error) {
          console.error(`Failed to get info for video ${videoId}:`, error);
          // Optionally, add a failed item to the history
        }
      }
    } else if (isPlaylist) {
      // Case 2: A playlist URL is provided, but no specific items (standard playlist download)
      const info = await this.getVideoInfo(downloadInfo.url, true, downloadInfo.playlistLimit);
      const limit = downloadInfo.playlistLimit || info.entries.length;
      const entries = info.entries.slice(0, limit);

      for (const entry of entries) {
        const videoUrl = `https://www.youtube.com/watch?v=${entry.id}`;
        const downloadId = uuidv4();
        const downloadItem = {
          id: downloadId,
          url: videoUrl,
          format: downloadInfo.format,
          quality: downloadInfo.quality,
          status: 'pending',
          progress: 0,
          addedAt: new Date().toISOString(),
          title: entry.title || 'Unknown Title',
          error: null
        };
        this.queue.push(downloadItem);
        await db.addDownload(downloadItem);
      }
    } else {
      // Case 3: A single video URL is provided
      const info = await this.getVideoInfo(downloadInfo.url);
      const downloadId = uuidv4();
      const downloadItem = {
        id: downloadId,
        url: downloadInfo.url,
        format: downloadInfo.format,
        quality: downloadInfo.quality,
        status: 'pending',
        progress: 0,
        addedAt: new Date().toISOString(),
        title: info.title || 'Unknown Title',
        error: null
      };
      this.queue.push(downloadItem);
      await db.addDownload(downloadItem);
    }

    this.processQueue();
    return { success: true };
  }

  async processQueue() {
    // Check if we can start more downloads
    if (this.activeDownloads.size >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    // Get next item from queue
    const nextItem = this.queue.find(item => item.status === 'pending');
    if (!nextItem) return;

    // Move to active
    nextItem.status = 'active';
    this.activeDownloads.set(nextItem.id, nextItem);
    this.queue = this.queue.filter(item => item.id !== nextItem.id);

    // Update database
    db.updateDownloadStatus(nextItem.id, 'active');

    // Start download
    this.executeDownload(nextItem);

    // Process next in queue
    if (this.queue.length > 0) {
      this.processQueue();
    }
  }

  async executeDownload(downloadItem) {
    const downloadPath = store.get('downloadPath');
    
    // Send initial info to renderer
    if (mainWindow) {
      mainWindow.webContents.send('download-started', {
        id: downloadItem.id,
        title: downloadItem.title,
        isPlaylist: false, // We are now handling videos individually
      });
    }

    const args = [
      '--output', path.join(downloadPath, '%(title)s.%(ext)s'),
      '--no-check-certificate',
      '--no-cache-dir',
      '--newline',
      '--progress-template', '%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s'
    ];

    if (downloadItem.format === 'audio') {
      args.push(
        '--extract-audio',
        '--audio-format', 'mp3',
        '--audio-quality', downloadItem.quality || '192K',
        '--embed-thumbnail',
        '--add-metadata'
      );
    } else {
      args.push(
        '--format', 'bestvideo[ext=mp4][vcodec^=avc]+bestaudio[ext=m4a]/best[ext=mp4][vcodec^=avc]/best[ext=mp4]'
      );
    }

    if (downloadItem.playlistLimit) {
      args.push('--playlist-end', downloadItem.playlistLimit.toString());
    }

    args.push(downloadItem.url);

    const ytDlpProcess = spawn('yt-dlp', args);
    this.processes.set(downloadItem.id, ytDlpProcess);

    let currentVideoIndex = 0;
    let currentVideoTitle = '';

    // Handle stdout
    ytDlpProcess.stdout.on('data', (data) => {
      const output = data.toString();
      
      // Parse download info
      if (output.includes('[download] Downloading video')) {
        const match = output.match(/Downloading video (\d+) of (\d+)/);
        if (match) {
          currentVideoIndex = parseInt(match[1]);
        }
      }

      // Parse title
      if (output.includes('[download] Destination:')) {
        const filename = output.split('[download] Destination:')[1].trim();
        currentVideoTitle = path.basename(filename, path.extname(filename));
      }

      // Parse progress
      const lines = output.split('\n');
      for (const line of lines) {
        if (line.includes('|')) {
          const [percent, speed, eta] = line.split('|');
          const percentMatch = percent.match(/(\d+\.?\d*)%/);
          
          if (percentMatch) {
            const percentValue = parseFloat(percentMatch[1]);
            downloadItem.progress = percentValue;
            
            // Send progress update
            if (mainWindow) {
              mainWindow.webContents.send('download-progress', {
                id: downloadItem.id,
                percent: percentValue,
                speed: speed?.trim() || 'N/A',
                eta: eta?.trim() || 'N/A',
                currentVideo: currentVideoIndex,
                totalVideos: downloadItem.totalVideos,
                currentTitle: currentVideoTitle
              });
            }
          }
        }
      }
    });

    // Handle stderr
    ytDlpProcess.stderr.on('data', (data) => {
      console.error('yt-dlp error:', data.toString());
    });

    // Handle process close
    ytDlpProcess.on('close', async (code) => {
      this.processes.delete(downloadItem.id);
      
      if (code === 0) {
        // Success
        downloadItem.status = 'completed';
        this.completedDownloads.set(downloadItem.id, downloadItem);
        
        // Get file info
        try {
          const files = await fs.readdir(downloadPath);
          const recentFiles = [];
          for (const f of files) {
            const filePath = path.join(downloadPath, f);
            const stats = await fs.stat(filePath);
            if (Date.now() - stats.ctimeMs < 60000) {
              recentFiles.push(f);
            }
          }
          
          if (recentFiles.length > 0) {
            downloadItem.files = recentFiles;
            downloadItem.fileSize = 0;
            for (const f of recentFiles) {
              const stats = await fs.stat(path.join(downloadPath, f));
              downloadItem.fileSize += stats.size;
            }
          }
        } catch (e) {
          console.error('Error getting file info:', e);
        }
        
        // Update database
        db.updateDownloadCompleted(downloadItem.id, {
          title: downloadItem.title,
          filepath: downloadPath,
          size: downloadItem.fileSize || 0
        });
        
        // Send completion
        if (mainWindow) {
          mainWindow.webContents.send('download-completed', {
            id: downloadItem.id,
            title: downloadItem.title,
            files: downloadItem.files
          });
        }
      } else {
        // Error
        this.handleDownloadError(downloadItem, `Process exited with code ${code}`);
      }
      
      // Remove from active
      this.activeDownloads.delete(downloadItem.id);
      
      // Process next in queue
      this.processQueue();
    });
  }

  handleDownloadError(downloadItem, error) {
    downloadItem.status = 'failed';
    downloadItem.error = error;
    
    // Update database
    db.updateDownloadStatus(downloadItem.id, 'failed', error);
    
    // Send error to renderer
    if (mainWindow) {
      mainWindow.webContents.send('download-error', {
        id: downloadItem.id,
        error: error
      });
    }
    
    // Remove from active
    this.activeDownloads.delete(downloadItem.id);
    this.processes.delete(downloadItem.id);
    
    // Process next in queue
    this.processQueue();
  }

  async getVideoInfo(url, isPlaylist = false, limit = null) {
    return new Promise((resolve, reject) => {
      const args = ['--dump-json'];
      if (isPlaylist) {
        args.push('--flat-playlist');
        if (limit) {
          args.push('--playlist-items', `1-${limit}`);
        }
      }
      args.push(url);

      console.log(`[yt-dlp] Executing: yt-dlp ${args.join(' ')}`);
      const ytdlp = spawn('yt-dlp', args);

      let data = '';
      let error = '';
      ytdlp.stdout.on('data', (chunk) => { data += chunk; });
      ytdlp.stderr.on('data', (chunk) => {
        error += chunk;
      });

      ytdlp.on('close', (code) => {
        console.log(`[yt-dlp] STDOUT: ${data}`);
        console.error(`[yt-dlp] STDERR: ${error}`);
        if (code === 0) {
          try {
            const lines = data.trim().split('\n').filter(Boolean);
            if (lines.length === 1 && lines[0].includes('"_type": "url"')) {
              const info = JSON.parse(lines[0]);
              return resolve(this.getVideoInfo(info.url, isPlaylist, limit));
            }
            
            if (isPlaylist) {
              const entries = lines.map(line => JSON.parse(line));
              const firstEntry = entries[0] || {};
              resolve({
                _type: 'playlist',
                title: firstEntry.playlist_title || 'Unknown Playlist',
                entries: entries,
                totalVideos: firstEntry.playlist_count || entries.length,
              });
            } else {
              resolve(JSON.parse(lines[0]));
            }
          } catch (e) {
            console.error('[yt-dlp] JSON Parse Error:', e);
            reject(new Error('Failed to parse video info'));
          }
        }
        else {
          reject(new Error(error || 'Failed to get video info'));
        }
      });
    });
  }

  pauseDownload(downloadId) {
    const process = this.processes.get(downloadId);
    if (process) {
      process.kill('SIGSTOP');
      const download = this.activeDownloads.get(downloadId);
      if (download) {
        download.status = 'paused';
        db.updateDownloadStatus(downloadId, 'paused');
      }
      return true;
    }
    return false;
  }

  resumeDownload(downloadId) {
    const process = this.processes.get(downloadId);
    if (process) {
      process.kill('SIGCONT');
      const download = this.activeDownloads.get(downloadId);
      if (download) {
        download.status = 'active';
        db.updateDownloadStatus(downloadId, 'active');
      }
      return true;
    }
    return false;
  }

  cancelDownload(downloadId) {
    // Cancel active download
    const process = this.processes.get(downloadId);
    if (process) {
      process.kill('SIGTERM');
      this.processes.delete(downloadId);
    }
    
    // Remove from queue
    this.queue = this.queue.filter(item => item.id !== downloadId);
    
    // Remove from active
    const activeDownload = this.activeDownloads.get(downloadId);
    if (activeDownload) {
      activeDownload.status = 'cancelled';
      this.activeDownloads.delete(downloadId);
      db.updateDownloadStatus(downloadId, 'cancelled');
    }
    
    // Process next in queue
    this.processQueue();
    
    return true;
  }

  getQueueStatus() {
    return {
      pending: this.queue.filter(item => item.status === 'pending'),
      active: Array.from(this.activeDownloads.values()),
      completed: Array.from(this.completedDownloads.values()).sort((a, b) => new Date(b.completed_at || b.addedAt) - new Date(a.completed_at || a.addedAt))
    };
  }
}

// Initialize download manager
let downloadManager;

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hidden',
    title: '',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'assets/icon.png'),
    titleBarStyle: 'hidden',
    show: !store.get('startMinimized', false)
  });

  // Load the index.html
  mainWindow.loadFile('index.html');

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Prevent window close, minimize to tray instead
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  // Create application menu
  createMenu();

  // Check for updates
  autoUpdater.checkForUpdatesAndNotify();
}

function createMenu() {
  const template = [
    {
      label: 'Vur-De',
      submenu: [
        {
          label: 'About Vur-De',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About Vur-De',
              message: 'Vur-De - YouTube Downloader',
              detail: 'Version ' + app.getVersion() + '\n\nDownload YouTube videos and audio with ease.',
              buttons: ['OK']
            });
          }
        },
        { type: 'separator' },
        {
          label: 'Preferences',
          accelerator: 'Cmd+,',
          click: () => {
            mainWindow.webContents.send('show-preferences');
          }
        },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: 'Cmd+Q',
          click: () => {
            app.isQuitting = true;
            app.quit();
          }
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectall' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forcereload' },
        { role: 'toggledevtools' },
        { type: 'separator' },
        { role: 'resetzoom' },
        { role: 'zoomin' },
        { role: 'zoomout' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'close' }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets/icon.png'));
  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Vur-De',
      click: () => {
        mainWindow.show();
      }
    },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip('Vur-De - YouTube Downloader');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
  });
}

// IPC Handlers

// Check if yt-dlp is installed
ipcMain.handle('check-ytdlp', async () => {
  return new Promise((resolve) => {
    const ytdlp = spawn('yt-dlp', ['--version']);
    
    ytdlp.on('error', () => {
      resolve({ installed: false });
    });

    ytdlp.stdout.on('data', (data) => {
      resolve({ installed: true, version: data.toString().trim() });
    });
  });
});

// Get video info (for preview)
ipcMain.handle('get-preview-info', async (event, url, playlistLimit) => {
  console.log('ipcMain get-preview-info called with:', url, playlistLimit);
  try {
    const isPlaylist = url.includes('list=') || url.includes('/playlist/');
    const info = await downloadManager.getVideoInfo(url, isPlaylist, playlistLimit);
    
    // Format response for renderer
    if (info._type === 'playlist') {
      return {
        type: 'playlist',
        title: info.title || 'Unknown Playlist',
        totalVideos: info.totalVideos,
        entries: info.entries.map(entry => ({
          // Keep all original fields from yt-dlp and add a fallback for title
          ...entry,
          title: entry.title || 'Unknown Title',
        }))
      };
    } else {
      return {
        type: 'video',
        title: info.title || 'Unknown',
        channel: info.uploader || 'Unknown',
        duration: info.duration || 0,
        thumbnail: info.thumbnail || '',
        views: info.view_count || 0
      };
    }
  } catch (error) {
    console.error('Error in get-preview-info:', error);
    throw error;
  }
});

// Add download to queue
ipcMain.handle('download-media', async (event, options) => {
  return await downloadManager.addToQueue(options);
});

// Queue operations
ipcMain.handle('pause-download', async (event, downloadId) => {
  return downloadManager.pauseDownload(downloadId);
});

ipcMain.handle('resume-download', async (event, downloadId) => {
  return downloadManager.resumeDownload(downloadId);
});

ipcMain.handle('cancel-download', async (event, downloadId) => {
  return downloadManager.cancelDownload(downloadId);
});

ipcMain.handle('get-queue-status', async () => {
  return downloadManager.getQueueStatus();
});

// Remove download from history
ipcMain.handle('remove-download-history', async (event, downloadId) => {
  try {
    await db.removeDownload(downloadId);
    downloadManager.completedDownloads.delete(downloadId);
    return { success: true };
  } catch (error) {
    console.error('Error removing download from history:', error);
    return { success: false, error: error.message };
  }
});

// Get download history
ipcMain.handle('get-download-history', async () => {
  return await db.getHistory();
});

// Get settings
ipcMain.handle('get-settings', async () => {
  return {
    downloadPath: store.get('downloadPath'),
    audioQuality: store.get('audioQuality'),
    videoQuality: store.get('videoQuality'),
    keepWindowOnTop: store.get('keepWindowOnTop'),
    startMinimized: store.get('startMinimized'),
    theme: store.get('theme')
  };
});

// Update settings
ipcMain.handle('update-settings', async (event, settings) => {
  Object.keys(settings).forEach(key => {
    store.set(key, settings[key]);
  });
  
  // Apply window settings immediately
  if (mainWindow) {
    mainWindow.setAlwaysOnTop(settings.keepWindowOnTop || false);
  }
  
  return { success: true };
});

// Choose download directory
ipcMain.handle('choose-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    defaultPath: store.get('downloadPath')
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

// Open download folder
ipcMain.handle('open-download-folder', async () => {
  shell.openPath(store.get('downloadPath'));
});

// App event handlers
app.whenReady().then(async () => {
  downloadManager = new DownloadQueueManager();
  await downloadManager.init();
  
  createWindow();
  createTray();
  
  // Clean up expired downloads periodically
  setInterval(() => {
    db.cleanupExpired();
  }, 3600000); // Every hour
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  } else {
    mainWindow.show();
  }
});

app.on('before-quit', () => {
  db.close();
});

// Auto updater events
autoUpdater.on('update-available', () => {
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Update Available',
    message: 'A new version is available. It will be downloaded in the background.',
    buttons: ['OK']
  });
});

autoUpdater.on('update-downloaded', () => {
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Update Ready',
    message: 'Update downloaded. The application will restart to apply the update.',
    buttons: ['Restart Now', 'Later']
  }).then((result) => {
    if (result.response === 0) {
      autoUpdater.quitAndInstall();
    }
  });
});