# Vur-De YouTube Downloader

A modern Python-based YouTube video/audio downloader with both CLI and web interfaces, powered by `yt-dlp`.

## Features

- **Dual Interface**: Command-line tool and beautiful web interface
- **Download Formats**: 
  - Audio extraction to MP3 with metadata and album art
  - Video download in MP4 format
- **Playlist Support**: Download multiple videos from playlists with configurable limits
- **Real-time Progress**: Live download progress updates in web interface
- **Visual Progress Tracking**: Checkmarks appear next to each video as they complete in playlists
- **Download Queue**: Advanced queue management with pause/resume capabilities
- **Metadata Support**: Automatic ID3 tag updates with artist, title, and album information
- **Thumbnail Embedding**: Album art automatically embedded in MP3 files
- **Custom Download Directory**: Specify where to save files (default: `/Volumes/MUSIC`)
- **Error Handling**: Graceful error handling with helpful messages
- **Dark Mode**: Toggle between light and dark themes

## Prerequisites

- Python 3.9+
- `yt-dlp` library
- Flask (for web interface)
- FFmpeg (required for audio extraction and format conversion)

## Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/yourusername/vur-de.git
   cd vur-de
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Install FFmpeg:
   - **macOS**: `brew install ffmpeg`
   - **Ubuntu/Debian**: `sudo apt-get install ffmpeg`
   - **Windows**: Download from [ffmpeg.org](https://ffmpeg.org/download.html)

## Usage

### Command Line Interface

Run the CLI tool:
```bash
python vur_de-v3.py
```

Follow the prompts:
1. Enter the YouTube URL
2. Choose format (1 for Audio/MP3, 2 for Video/MP4)
3. (Optional) Enter a custom download directory

### Web Interface

1. Start the Flask server:
   ```bash
   python app.py
   ```

2. Open your browser to `http://localhost:8080`

3. Features:
   - Paste YouTube URLs with one click
   - Preview video information before downloading
   - Real-time download progress with visual status indicators
   - Download files directly to your browser or save to custom directory
   - Support for playlists with customizable limits
   - Visual checkmarks for completed downloads in playlists
   - Download queue with multiple concurrent downloads
   - Dark/light theme toggle

## Web Interface Details

### Key Features

- **Instant Preview**: See video title, duration, and thumbnail before downloading
- **Visual Progress**: Live status indicators (⏳ pending → 🔄 downloading → ✅ completed → ❌ failed)
- **Playlist Support**: 
  - Download entire playlists or set custom limits
  - Visual checkmarks appear as each video completes
  - Failed downloads are clearly marked and tracked
- **Download Queue**: 
  - View active, pending, and completed downloads
  - Queue sidebar with download history
  - Support for multiple concurrent downloads
- **Default Directory**: Pre-configured to save to `/Volumes/MUSIC`
- **Error Recovery**: Playlist downloads continue even if individual videos fail
- **Dark Mode**: Toggle between light and dark themes
- **Responsive Design**: Works on desktop and mobile devices

### Technical Implementation

- **Server-Sent Events (SSE)**: Real-time progress updates without polling
- **Per-Download Queues**: Multiple users can download simultaneously without conflicts
- **Automatic Cleanup**: Old downloads are automatically cleaned up after 24 hours
- **Memory Management**: Periodic cleanup of completed downloads to prevent memory leaks

## Advanced Features

### Metadata Handling
- Automatically extracts and embeds metadata (artist, title, album)
- Embeds video thumbnails as album art in MP3 files
- Proper filename generation based on metadata

### Error Handling
- Network connection failures
- Private or age-restricted videos
- FFmpeg availability checks
- Custom directory validation

### Performance Optimizations
- Rate limiting for preview requests
- Efficient progress event streaming
- Automatic file cleanup
- Memory-efficient download tracking

## Troubleshooting

### Common Issues

1. **"FFmpeg not found" warning**
   - Install FFmpeg using the instructions above
   - Audio downloads will fail without FFmpeg

2. **Download stuck at "Starting download..."**
   - Check your internet connection
   - Verify the YouTube URL is valid and accessible
   - Check server logs for detailed error messages

3. **"Access denied" errors**
   - Video may be private, age-restricted, or region-blocked
   - Try a different video or check video availability

4. **Progress bar not updating**
   - Refresh the page and try again
   - Check browser console for errors

## Development

### Project Structure
```
vur-de/
├── app.py              # Flask web application
├── vur_de-v3.py       # CLI application
├── templates/
│   └── index.html     # Web interface
├── static/
│   └── style.css      # Styling
├── requirements.txt   # Python dependencies
└── README.md          # This file
```

### Recent Improvements
- **Visual Download Progress**: Added checkmarks to playlist items as they complete
- **Download Queue System**: Implemented advanced queue management with sidebar UI
- **Error Recovery**: Playlist downloads now continue even when individual videos fail
- **Default Directory**: Set `/Volumes/MUSIC` as the default download location
- **UI Enhancements**: 
  - Dark mode support
  - Visual status indicators for each download
  - Improved progress tracking for playlists
- Fixed progress bar updates with per-download progress queues
- Improved download button reliability and user feedback
- Fixed custom directory issues for web downloads
- Added proper ID3 tag support with mutagen library
- Implemented thumbnail embedding for MP3 files
- Added comprehensive error handling and user-friendly messages

## License

This project is provided as-is for educational purposes.