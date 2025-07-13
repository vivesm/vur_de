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

## For Developers

```bash
# Clone the repository
git clone https://github.com/vivesm/Vur-De.git
cd Vur-De

# Install dependencies
npm install

# Run in development mode
npm start

# Build for your platform
npm run build
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

## License

MIT

## Credits

Built with:
- [Electron](https://electronjs.org)
- [yt-dlp](https://github.com/yt-dlp/yt-dlp)
- [FFmpeg](https://ffmpeg.org)
