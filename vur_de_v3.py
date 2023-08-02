import os
import subprocess
import sys

def check_dependency(command, install_command):
    try:
        subprocess.check_output(command, stderr=subprocess.STDOUT, shell=True)
    except subprocess.CalledProcessError:
        print(f"Error: {command} not found. Install it with: {install_command}")
        sys.exit(1)

def download(youtube_url, script_dir, download_format):
    if download_format == 'a':
        command = f'yt-dlp -x --audio-format mp3 -o "{script_dir}/%(title)s.%(ext)s" {youtube_url}'
    else:
        command = f'yt-dlp -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]" -o "{script_dir}/%(title)s.%(ext)s" {youtube_url}'
    try:
        subprocess.check_output(command, shell=True)
        print("Download successful.")
    except Exception as e:
        print(f"An error occurred: {str(e)}")

def main():
    # Check for yt-dlp
    check_dependency("yt-dlp --version", "pip install yt-dlp")

    # Check for FFmpeg
    check_dependency("ffmpeg -version", "brew install ffmpeg")

    # Ask for the YouTube URL
    youtube_url = input("Please enter the YouTube URL: ")

    # Ask for the format
    while True:
        download_format = input("Enter 'a' to download as audio or 'v' to download as video: ")
        if download_format in ['a', 'v']:
            break
        print("Invalid format choice, please try again.")
    
    # Get the directory of the script
    script_dir = os.path.dirname(os.path.realpath(__file__))

    # Download the video as audio or video
    download(youtube_url, script_dir, download_format)

if __name__ == "__main__":
    main()
