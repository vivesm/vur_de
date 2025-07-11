# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Vur-De is a YouTube video/audio downloader with both command-line and web interfaces, written in Python using the `yt-dlp` library.

## Commands

### Running the CLI Application
```bash
# Install required dependencies
pip install yt-dlp

# Run the CLI downloader
python vur_de-v3.py
```

### Running the Web Interface
```bash
# Install all dependencies
pip install -r requirements.txt

# Run the Flask server
python app.py
```

Then open your browser to `http://localhost:8080`

### Python Version
The project uses Python 3.9.16 (specified in `.python-version`).

## Architecture

### CLI Application (`vur_de-v3.py`)
Single-file Python application with:
1. **Dependency Checking**: Validates `yt-dlp` and checks for FFmpeg
2. **User Interface**: Interactive CLI prompts
3. **Download Logic**: Uses `yt-dlp` with format-specific options

### Web Application (`app.py`)
Flask-based web server with:
1. **Server-Sent Events (SSE)**: Real-time progress updates using EventSource API
2. **Per-Download Progress Queues**: Prevents conflicts between multiple downloads
3. **Background Threading**: Non-blocking download operations
4. **Automatic Cleanup**: Removes old files after 24 hours
5. **Memory Management**: Periodic cleanup of completed downloads

## Key Implementation Details

### Download Processing
- **Audio downloads**: 
  - Extracts audio and converts to MP3 using FFmpeg
  - Updates ID3 tags with artist, title, and album metadata
  - Embeds thumbnail as album art
  - Filename format: `Artist - Title - Album.mp3` (when metadata available)
- **Video downloads**: 
  - Downloads best quality MP4 with combined audio/video
  - Format: `bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]`

### Progress Tracking (Web Interface)
- Each download gets a unique ID and its own progress queue
- Progress events include: `starting`, `downloading`, `finished`, `completed`, `error`
- EventSource connection established before download starts to prevent missing events
- Heartbeat events sent every 5 seconds to keep connection alive

### Error Handling
- Network connection failures with user-friendly messages
- Private/age-restricted video detection
- FFmpeg availability checking with platform-specific install instructions
- Custom directory validation (existence, writability)
- Partial download cleanup on failure

### File Management
- Web downloads always use temp directory (`/tmp/vur_de_downloads/`)
- CLI allows custom download directories
- Automatic cleanup of files older than 24 hours
- ZIP file creation for playlist downloads

## External Dependencies

- **yt-dlp**: Core downloading functionality (required)
- **FFmpeg**: Audio extraction and format conversion (required for audio)
- **Flask**: Web framework for the interface
- **flask-cors**: CORS support for API access
- **mutagen**: ID3 tag manipulation (optional, for better metadata)

## Web Interface Features

### User Interface
- Modern, responsive design with gradient backgrounds
- Dark/light theme toggle with persistent preference
- Real-time video preview with thumbnail and duration
- Playlist preview showing videos with live status indicators
- One-click clipboard paste functionality
- Advanced options panel for custom settings
- Default download directory: `/Volumes/MUSIC`

### Download Features
- Visual progress indicators for playlist items (✓ for completed, ✗ for failed)
- Download queue sidebar showing active, pending, and completed downloads
- Support for multiple concurrent downloads (max 3)
- Real-time progress bar with speed and ETA
- Playlist support with configurable limits
- Error recovery - playlists continue downloading even if individual videos fail
- Download history stored in SQLite database

### Technical Features
- Per-download progress isolation
- Rate limiting on preview requests (1 per 2 seconds)
- Pre-connection for EventSource to ensure progress capture
- Proper button state management during downloads
- Comprehensive error messages for common issues

## Recent Updates (July 2025)

### New Features
1. **Visual Download Progress**: Checkmarks appear next to each video as they complete in playlists
2. **Download Queue System**: Sidebar UI for managing multiple downloads with pause/resume
3. **Dark Mode**: Toggle between light and dark themes with persistent preference
4. **Default Directory**: `/Volumes/MUSIC` set as default download location
5. **Error Recovery**: Playlist downloads continue even when individual videos fail

### Bug Fixes
1. **Progress Bar Breaking**: Fixed issue where progress bar would stop updating on failed videos
2. **Variable Reference Error**: Fixed "local variable 'title' referenced before assignment"
3. **YouTube Music Support**: Maintained compatibility with music.youtube.com URLs
4. **Download Button Reliability**: Fixed EventSource connection timing and variable references
5. **Custom Directory Issues**: Web interface properly handles custom directories
6. **ID3 Tag Support**: Added proper metadata handling with mutagen library

## Testing

To test the web interface manually:
1. Start the server: `python app.py`
2. Open browser to `http://localhost:8080`
3. Test with short video: `https://www.youtube.com/watch?v=jNQXAC9IVRw` (first YouTube video)
4. Check server.log for detailed debugging information