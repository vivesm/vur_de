# Playlist Download Error Handling Fix

## Problem
When downloading playlists with unavailable videos (like "F*** You" in the example), the error message would disrupt the progress bar UI, making it appear that the download had failed even though other videos continued downloading successfully.

## Solution Implemented

### 1. Track Failed Downloads
- Added `failedDownloads` array to store errors during playlist processing
- Reset this array when starting a new download

### 2. Inline Error Notifications
- Instead of showing errors in the main error container, display them inline
- Errors appear temporarily in the status text with a warning icon (⚠️)
- After 3 seconds, the status updates to show "Processing playlist... (X failed)"
- This keeps the progress bar and UI flow intact

### 3. Summary at Completion
- When playlist download completes, show both successful and failed counts
- Display "Downloaded X of Y files" to make it clear some failed
- Show a dedicated failed downloads section with:
  - Red-tinted background box
  - List of failed video titles
  - Reason for failure (e.g., "Video unavailable")

### 4. Visual Improvements
- Failed downloads section styled to work in both light and dark modes
- Clear visual distinction between success and failure information
- Progress bar continues smoothly even when individual downloads fail

## Example Output
When a playlist with 137 videos has 3 failures:
```
Playlist download completed: 134 of 137 files
Total size: 523.45 MB

⚠️ 3 downloads failed:
• F*** You - Video unavailable
• Some Other Song - Video unavailable  
• Another Track - Download error
```

## Benefits
1. **Better UX**: Users see progress continue despite individual failures
2. **Clear feedback**: Know exactly which videos failed and why
3. **No disruption**: Progress bar and UI remain functional throughout
4. **Complete picture**: Final summary shows both successes and failures

## Testing
The fix handles various scenarios:
- Single video failures in large playlists
- Multiple consecutive failures
- Mix of successful and failed downloads
- Different error types (unavailable, region-blocked, etc.)

The progress bar now correctly shows overall progress and completes at 100% even when some videos fail to download.