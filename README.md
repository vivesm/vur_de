# YouTube Downloader by NegroLabs 2.0.0b

A simple YouTube Downloader with a graphical user interface that allows users to download video and/or audio files from YouTube.

## Features
- Download video and/or audio files from YouTube
- Select download location for the file
- Input validation and error handling
- Progress bar for downloads (removed in 1.0.0)

## Requirements
- Python 3.6+
- `pytube` library
- `urllib` library
- `tkinter` library

## Installation

1. Clone this repository or download the source code.
2. Install required dependencies:

pip install -r requirements.txt

## Usage
Run `python youtube_downloader.py` to start the application.

1. Enter a valid YouTube URL in the URL field.
2. Choose the file type(s) to download by checking the "Video" and/or "Audio" boxes.
3. Click the "Download" button to start the download process.
4. Select the destination folder for the downloaded file(s).

## Changelog
### Version 1.0.0
 - Added type annotations for function arguments and return types
 - Improved code organization and readability
 - Added file extension checks for audio files
 - Simplified code and reduced attack surface
 - Improved error handling and messages
 - Removed the progress bar from the UI

### Version 0.4.0
 - Improved error handling and input validation
 - Added download progress bar
 - Added "Video" or "Audio" label to downloaded file names
 - Prevented the window from being resized

### Version 0.2.0
 - Added input validation and error handling
 - Added the option to select the download location for the file
 - Added a button to clear the URL field
 - Improved GUI usability and appearance
 - Fixed a bug related to audio file downloads

### Version 0.1.0
 - Added a GUI to the application

### Version 0.0.1
 - Initial release with command line interface for audio downloads
