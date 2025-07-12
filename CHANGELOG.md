# Changelog

All notable changes to the Vur-De YouTube Downloader project will be documented in this file.

## [Unreleased] - 2025-07-11

### Added
- Per-download progress queues to isolate progress tracking for multiple simultaneous downloads
- Pre-connection mechanism for EventSource to ensure progress events aren't missed
- Proper ID3 tag support using mutagen library for MP3 metadata
- Thumbnail embedding as album art in MP3 files
- Comprehensive error messages for common failure scenarios:
  - Network connection failures
  - Private/age-restricted videos
  - FFmpeg availability issues
- Rate limiting for preview requests (1 request per 2 seconds per IP)
- Memory cleanup for old download entries (1-hour expiration)
- Automatic file cleanup for downloads older than 24 hours
- Download button state management with visual feedback

### Fixed
- **Critical**: Progress bar not updating during downloads
  - Root cause: Shared progress queue causing conflicts between downloads
  - Solution: Implemented per-download progress queues
- **Critical**: Download stuck at "Starting download..." 
  - Root cause: EventSource connecting after download started, missing initial events
  - Solution: Pre-connect EventSource before initiating download
- **Major**: Custom directory parameter breaking browser downloads
  - Root cause: Browser can't download from arbitrary directories
  - Solution: Web interface always uses temp directory, ignoring custom_dir parameter
- **Major**: Download button not re-enabling after errors
  - Root cause: Incorrect variable references in error handlers
  - Solution: Fixed variable names and proper state restoration
- **Minor**: Incorrect EventSource variable references causing JavaScript errors
- **Minor**: Missing button text restoration after download completion

### Changed
- Download button now shows "Connecting..." immediately when clicked
- EventSource heartbeat interval reduced from 30 to 5 seconds for better connection stability
- Improved filename generation to include artist and album metadata when available
- Enhanced error messages to be more user-friendly and actionable

### Technical Details
- Refactored `progress_hook` to use download-specific queues
- Updated `/progress/<download_id>` endpoint to accept specific download IDs
- Modified `performDownload` function to establish EventSource connection before download
- Added `update_id3_tags` function for proper MP3 metadata handling
- Implemented `cleanup_old_downloads` for memory management
- Added `schedule_cleanup` for periodic file and memory cleanup

## Previous Versions

### Web Interface Launch
- Initial Flask-based web interface implementation
- Server-Sent Events (SSE) for real-time progress updates
- Modern UI with gradient design and animations
- Playlist support with configurable download limits
- Video/playlist preview functionality