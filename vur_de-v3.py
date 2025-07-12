import os
import sys
import shutil

def check_dependency(package_name, install_command):
    try:
        __import__(package_name)
    except ImportError:
        print(f"Error: {package_name} is not installed. Install it with: {install_command}")
        sys.exit(1)

def check_ffmpeg():
    if shutil.which('ffmpeg') is None:
        print("Warning: FFmpeg is not installed. Some functionalities may not work.")
        print("Install FFmpeg to enable audio extraction and format conversion.")
        if sys.platform == 'win32':
            print("You can download FFmpeg from https://ffmpeg.org/download.html")
        elif sys.platform == 'darwin':
            print("Install FFmpeg using Homebrew: brew install ffmpeg")
        else:
            print("Install FFmpeg using your package manager, e.g., sudo apt-get install ffmpeg")

def download(youtube_url, download_dir, download_format):
    import yt_dlp

    ydl_opts = {
        'outtmpl': os.path.join(download_dir, '%(title)s.%(ext)s'),
    }

    if download_format == 'a':
        ydl_opts.update({
            'format': 'bestaudio/best',
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
            }],
        })
    else:
        ydl_opts.update({
            'format': 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]',
        })

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([youtube_url])
        print("Download successful.")
    except yt_dlp.utils.DownloadError as e:
        print(f"Download error: {str(e)}")
    except Exception as e:
        print(f"An unexpected error occurred: {str(e)}")

def main():
    try:
        # Check for yt-dlp Python module
        check_dependency("yt_dlp", "pip install yt-dlp")

        # Check for FFmpeg availability
        check_ffmpeg()

        # Prompt user for YouTube URL
        youtube_url = input("Please enter the YouTube URL: ").strip()

        # Basic validation of the URL
        if not youtube_url.startswith(('http://', 'https://')):
            print("Invalid URL. Please enter a valid YouTube URL.")
            sys.exit(1)

        # Prompt user for download format
        while True:
            download_format = input("Enter 'a' to download as audio or 'v' to download as video: ").lower()
            if download_format in ['a', 'v']:
                break
            print("Invalid format choice, please try again.")

        # Prompt user for download directory
        download_dir = input("Enter the download directory (leave blank for current directory): ").strip()
        if not download_dir:
            download_dir = os.getcwd()
        else:
            if not os.path.isdir(download_dir):
                print(f"Directory '{download_dir}' does not exist. Creating it.")
                try:
                    os.makedirs(download_dir)
                except Exception as e:
                    print(f"Failed to create directory: {str(e)}")
                    sys.exit(1)

        # Start the download process
        download(youtube_url, download_dir, download_format)

    except KeyboardInterrupt:
        print("\nOperation cancelled by user.")
        sys.exit(0)

if __name__ == "__main__":
    main()