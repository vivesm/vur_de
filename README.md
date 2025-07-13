# Vur-De Desktop App

A native desktop application for downloading YouTube videos and audio, built with Electron.

## Features

- 🎵 Download audio as MP3
- 🎬 Download video as MP4
- 👀 Real-time preview with thumbnails
- 📊 Download progress tracking
- 🎯 Native macOS/Windows/Linux app
- 🔒 Secure - runs locally on your computer
- 🚀 No IP blocking issues

## Requirements

- **yt-dlp** must be installed on your system
  - macOS: `brew install yt-dlp`
  - Windows: `pip install yt-dlp`
  - Linux: `pip install yt-dlp` or use your package manager

- **FFmpeg** (for audio conversion)
  - macOS: `brew install ffmpeg`
  - Windows: Download from [ffmpeg.org](https://ffmpeg.org)
  - Linux: `sudo apt install ffmpeg` or equivalent

## Installation

### For Users

1. Download the latest release for your platform from [Releases](https://github.com/vivesm/vur-de-electron/releases)
2. macOS: Open the `.dmg` file and drag Vur-De to Applications
3. Windows: Run the installer `.exe`
4. Linux: Make the `.AppImage` executable and run it

### For Developers

```bash
# Clone the repository
git clone https://github.com/vivesm/vur-de-electron.git
cd vur-de-electron

# Install dependencies
npm install

# Run in development mode
npm start

# Build for your platform
npm run build-mac    # For macOS
npm run build-win    # For Windows
npm run build-linux  # For Linux
```

## Usage

1. Launch Vur-De from your Applications folder
2. Paste a YouTube URL
3. Choose Audio (MP3) or Video (MP4)
4. Click Download
5. Files are saved to your Downloads folder (configurable in Settings)

## Settings

Access settings via the gear icon:
- **Download Location**: Choose where files are saved
- **Audio Quality**: 128-320 kbps
- **Keep Window on Top**: Always visible
- **Start Minimized**: Launch in system tray

## Troubleshooting

### "yt-dlp not installed" error
Install yt-dlp using the commands shown in the app or from [yt-dlp.org](https://github.com/yt-dlp/yt-dlp)

### Downloads fail
- Check your internet connection
- Ensure the YouTube URL is valid
- Try updating yt-dlp: `yt-dlp -U`

### No audio in downloaded videos
Install FFmpeg using the commands in the Requirements section

## Building from Source

### Prerequisites
- Node.js 16 or later
- npm or yarn
- Xcode (for macOS builds)

### Build Commands
```bash
# Install dependencies
npm install

# Run locally
npm start

# Build for production
npm run dist  # All platforms
npm run build-mac  # macOS only
npm run build-win  # Windows only
npm run build-linux  # Linux only
```

### Code Signing (macOS)
To sign the app for distribution:
1. Join Apple Developer Program
2. Create a Developer ID certificate
3. Set environment variables:
   ```bash
   export APPLE_ID="your-apple-id@example.com"
   export APPLE_ID_PASSWORD="your-app-specific-password"
   ```

## License

MIT

## Credits

Built with:
- [Electron](https://electronjs.org)
- [yt-dlp](https://github.com/yt-dlp/yt-dlp)
- [FFmpeg](https://ffmpeg.org)