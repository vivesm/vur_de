const { app, BrowserWindow, ipcMain, dialog, shell, Menu, Tray, nativeImage } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs').promises;
const Store = require('electron-store');
const { autoUpdater } = require('electron-updater');

// Initialize store for settings
const store = new Store();

// Keep a global reference of the window object
let mainWindow;
let tray;
let ytDlpProcess;

// Default settings
const defaults = {
  downloadPath: app.getPath('downloads'),
  audioQuality: '192',
  videoQuality: 'best',
  keepWindowOnTop: false,
  startMinimized: false
};

// Initialize settings
Object.keys(defaults).forEach(key => {
  if (!store.has(key)) {
    store.set(key, defaults[key]);
  }
});

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'assets/icon.png'),
    titleBarStyle: 'hiddenInset',
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

// Get video info
ipcMain.handle('get-video-info', async (event, url) => {
  return new Promise((resolve, reject) => {
    const ytdlp = spawn('yt-dlp', [
      '--dump-json',
      '--no-playlist',
      url
    ]);

    let data = '';
    let error = '';

    ytdlp.stdout.on('data', (chunk) => {
      data += chunk;
    });

    ytdlp.stderr.on('data', (chunk) => {
      error += chunk;
    });

    ytdlp.on('close', (code) => {
      if (code === 0) {
        try {
          const info = JSON.parse(data);
          resolve(info);
        } catch (e) {
          reject(new Error('Failed to parse video info'));
        }
      } else {
        reject(new Error(error || 'Failed to get video info'));
      }
    });
  });
});

// Download video/audio
ipcMain.handle('download-media', async (event, options) => {
  const { url, format, quality, playlistLimit } = options;
  const downloadPath = store.get('downloadPath');
  
  const args = [
    '--output', path.join(downloadPath, '%(title)s.%(ext)s'),
    '--no-check-certificate',
    '--no-cache-dir',
    '--newline'
  ];

  if (format === 'audio') {
    args.push(
      '--extract-audio',
      '--audio-format', 'mp3',
      '--audio-quality', quality || '192K'
    );
  } else {
    args.push(
      '--format', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best'
    );
  }

  if (playlistLimit) {
    args.push('--playlist-end', playlistLimit.toString());
  }

  args.push(url);

  ytDlpProcess = spawn('yt-dlp', args);

  // Send progress updates
  ytDlpProcess.stdout.on('data', (data) => {
    const output = data.toString();
    
    // Parse progress
    const progressMatch = output.match(/(\d+\.?\d*)%/);
    if (progressMatch) {
      const percent = parseFloat(progressMatch[1]);
      event.sender.send('download-progress', {
        percent,
        status: 'downloading',
        output
      });
    }

    // Parse download info
    if (output.includes('[download] Destination:')) {
      const filename = output.split('[download] Destination:')[1].trim();
      event.sender.send('download-info', { filename });
    }
  });

  ytDlpProcess.stderr.on('data', (data) => {
    console.error('yt-dlp error:', data.toString());
    event.sender.send('download-error', data.toString());
  });

  return new Promise((resolve, reject) => {
    ytDlpProcess.on('close', (code) => {
      if (code === 0) {
        event.sender.send('download-progress', {
          percent: 100,
          status: 'completed'
        });
        resolve({ success: true });
      } else {
        reject(new Error(`Download failed with code ${code}`));
      }
    });
  });
});

// Cancel download
ipcMain.handle('cancel-download', async () => {
  if (ytDlpProcess) {
    ytDlpProcess.kill('SIGTERM');
    return { success: true };
  }
  return { success: false, error: 'No active download' };
});

// Get settings
ipcMain.handle('get-settings', async () => {
  return {
    downloadPath: store.get('downloadPath'),
    audioQuality: store.get('audioQuality'),
    videoQuality: store.get('videoQuality'),
    keepWindowOnTop: store.get('keepWindowOnTop'),
    startMinimized: store.get('startMinimized')
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
app.whenReady().then(() => {
  createWindow();
  createTray();
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