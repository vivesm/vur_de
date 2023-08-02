import os
import subprocess
import sys

def check_dependency(command, install_command):
    try:
        subprocess.check_output(command, stderr=subprocess.STDOUT, shell=True)
    except subprocess.CalledProcessError:
        print(f"Error: {command} not found. Install it with: {install_command}")
        sys.exit(1)

def download_as_audio(url, path):
    # Use yt-dlp to download
    os.system(f'yt-dlp -o "{path}/%(title)s.%(ext)s" --extract-audio --audio-format mp3 {url}')

def main():
    # Check for yt-dlp
    check_dependency("yt-dlp --version", "pip install yt-dlp")

    # Check for FFmpeg
    check_dependency("ffmpeg -version", "brew install ffmpeg")

    # Ask for the YouTube URL
    youtube_url = input("Please enter the YouTube URL: ")

    # Get the directory of the script
    script_dir = os.path.dirname(os.path.realpath(__file__))

    # Download the video as audio
    download_as_audio(youtube_url, script_dir)

if __name__ == "__main__":
    main()
