const path = require('path');
const fs = require('fs');
const { app } = require('electron');

class Database {
  constructor() {
    this.dbPath = path.join(app.getPath('userData'), 'downloads.json');
    this.init();
  }

  init() {
    // Create file if it doesn't exist
    if (!fs.existsSync(this.dbPath)) {
      this.writeData({ downloads: [] });
    }
  }

  readData() {
    try {
      const data = fs.readFileSync(this.dbPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error reading database:', error);
      return { downloads: [] };
    }
  }

  writeData(data) {
    try {
      fs.writeFileSync(this.dbPath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Error writing database:', error);
    }
  }

  addDownload(download) {
    return new Promise((resolve, reject) => {
      try {
        const data = this.readData();
        const newDownload = {
          ...download,
          created_at: new Date().toISOString(),
          completed_at: null,
          expires_at: null
        };
        data.downloads.push(newDownload);
        this.writeData(data);
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  updateDownloadStatus(id, status, errorMessage = null) {
    return new Promise((resolve, reject) => {
      try {
        const data = this.readData();
        const download = data.downloads.find(d => d.id === id);
        if (download) {
          download.status = status;
          if (errorMessage) {
            download.error_message = errorMessage;
          }
          this.writeData(data);
        }
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  updateDownloadCompleted(id, fileInfo) {
    return new Promise((resolve, reject) => {
      try {
        const data = this.readData();
        const download = data.downloads.find(d => d.id === id);
        if (download) {
          download.status = 'completed';
          download.title = fileInfo.title || 'Unknown';
          download.artist = fileInfo.artist || '';
          download.file_path = fileInfo.filepath || '';
          download.file_size = fileInfo.size || 0;
          download.completed_at = new Date().toISOString();

          // Set expiration to 24 hours from now
          const expires = new Date();
          expires.setHours(expires.getHours() + 24);
          download.expires_at = expires.toISOString();

          this.writeData(data);
        }
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  getHistory() {
    return new Promise((resolve, reject) => {
      try {
        const data = this.readData();
        // Sort by created_at descending
        const sorted = data.downloads
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        resolve(sorted);
      } catch (error) {
        reject(error);
      }
    });
  }

  getDownload(id) {
    return new Promise((resolve, reject) => {
      try {
        const data = this.readData();
        const download = data.downloads.find(d => d.id === id);
        resolve(download || null);
      } catch (error) {
        reject(error);
      }
    });
  }

  removeDownload(id) {
    return new Promise((resolve, reject) => {
      try {
        const data = this.readData();
        data.downloads = data.downloads.filter(d => d.id !== id);
        this.writeData(data);
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  cleanupExpired() {
    return new Promise((resolve, reject) => {
      try {
        const data = this.readData();
        const now = new Date();

        // Filter out expired completed downloads
        data.downloads = data.downloads.filter(download => {
          if (download.status === 'completed' && download.expires_at) {
            return new Date(download.expires_at) > now;
          }
          return true;
        });

        this.writeData(data);
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  close() {
    // No-op for JSON file storage
  }
}

module.exports = Database;