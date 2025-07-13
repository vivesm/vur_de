# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Vur-De is a desktop YouTube downloader built with Electron. It provides a native cross-platform application for downloading YouTube videos and audio using yt-dlp as the backend.

## Development Commands

```bash
# Install dependencies
npm install

# Run in development
npm start

# Build for specific platforms
npm run build-mac    # macOS DMG
npm run build-win    # Windows installer
npm run build-linux  # Linux AppImage

# Build for all platforms
npm run dist

# Install app dependencies after package.json changes
npm run postinstall
```

## Architecture Overview

### Process Architecture
- **Main Process** (`main.js`): Handles window management, IPC communication, native menus, and spawning yt-dlp processes
- **Renderer Process** (`renderer.js`): UI logic, download queue management, and user interactions
- **Preload Script** (`preload.js`): Secure bridge between main and renderer processes using contextBridge

### Key Components

1. **DownloadQueueManager** (in `renderer.js`)
   - Manages concurrent downloads (max 3)
   - Handles queue state and progress updates
   - Supports playlist downloads with configurable limits

2. **Database Module** (`database.js`)
   - SQLite-based download history
   - 24-hour retention for completed downloads
   - Tracks URL, title, format, file path, status, and timestamps

3. **Settings System**
   - Uses `electron-store` for persistence
   - Configurable download path, quality settings, theme
   - Window behavior options (always on top, start minimized)

### IPC Communication Channels
- `download:start` - Initiate download with URL and format
- `download:progress` - Progress updates from main to renderer
- `download:complete` - Download completion notification
- `download:error` - Error handling
- `queue:status` - Queue state updates
- `settings:update` - Settings synchronization
- `file:exists` - Check if file already exists
- `file:open` - Open file in default application
- `file:show` - Show file in file explorer

## External Dependencies

**Required System Tools:**
- `yt-dlp` - Core downloading functionality (must be in PATH)
- `FFmpeg` - Audio conversion for MP3 format (must be in PATH)

## Security Considerations

- Context isolation is enabled
- Node integration is disabled in renderer
- All Node.js APIs are exposed through preload script only
- File paths are validated before operations

## Common Development Tasks

### Adding New IPC Handlers
Main process handlers go in `main.js`:
```javascript
ipcMain.handle('channel:name', async (event, data) => {
  // Implementation
});
```

Renderer calls via preload API:
```javascript
const result = await window.api.invoke('channel:name', data);
```

### Modifying Download Logic
Download spawning logic is in `main.js` - search for `spawn('yt-dlp'`. The DownloadQueueManager in `renderer.js` manages the UI state.

### Database Schema Changes
Schema is defined in `database.js`. The database auto-creates on first run. Consider migration logic for schema updates.

### Building for Distribution
1. Ensure version is updated in `package.json`
2. For macOS code signing, set:
   - `APPLE_ID` environment variable
   - `APPLE_ID_PASSWORD` (app-specific password)
3. Run appropriate build command
4. Distributables appear in `dist/` directory

## Testing Approach

No automated tests are configured. Test manually by:
1. Running `npm start` for development testing
2. Testing download functionality with various YouTube URLs
3. Verifying settings persistence across app restarts
4. Testing error scenarios (invalid URLs, missing dependencies)

## File Structure Notes

- Old/backup files exist (`*-old.js`, `*-original.js`) - these are not used in production
- Icon is at `assets/icon.svg` - Electron Builder generates platform-specific formats
- Database is stored in user's app data directory via `electron-store`