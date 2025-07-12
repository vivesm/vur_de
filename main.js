const { app, BrowserWindow, ipcMain, shell } = require('electron');
const Store = require('electron-store');
const path = require('path');
const { spawn } = require('child_process');

const store = new Store();

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    icon: path.join(__dirname, 'icon.png')
  });

  mainWindow.loadFile('index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC handlers for settings
ipcMain.handle('get-settings', () => {
  return {
    apiKey: store.get('apiKey', ''),
    serverUrl: store.get('serverUrl', 'https://api.vur.de'),
    autoBackup: store.get('autoBackup', true)
  };
});

ipcMain.handle('save-settings', (event, settings) => {
  store.set('apiKey', settings.apiKey);
  store.set('serverUrl', settings.serverUrl);
  store.set('autoBackup', settings.autoBackup);
  return { success: true };
});

// IPC handler for opening external links
ipcMain.handle('open-external', (event, url) => {
  shell.openExternal(url);
});

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

// Download media
ipcMain.handle('download-media', async (event, options) => {
  const { url, format, quality } = options;
  const downloadPath = app.getPath('downloads');

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

  args.push(url);

  const ytDlpProcess = spawn('yt-dlp', args);

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