import os
import pytube
from pytube.exceptions import VideoUnavailable, RegexMatchError
import tkinter as tk
import tkinter.ttk as ttk
from tkinter import filedialog, messagebox
import ssl
import certifi

ssl._create_default_https_context = ssl._create_unverified_context
ssl.create_default_context = ssl._create_unverified_context
ssl.get_default_verify_paths = lambda: ssl.Purpose.CLIENT_AUTH(certfile=certifi.where(), capath=None)

def validate_url(url: str) -> bool:
    try:
        pytube.YouTube(url)
    except (VideoUnavailable, RegexMatchError):
        return False
    return True

def validate_input() -> bool:
    if not validate_url(video_url_entry.get()):
        messagebox.showerror("Error", "Invalid URL")
        return False
    if not video_var.get() and not audio_var.get():
        messagebox.showerror("Error", "Please select at least one file type to download")
        return False
    return True

def download_video(yt: pytube.YouTube) -> str:
    video_stream = yt.streams.filter(progressive=True, file_extension='mp4').order_by('resolution').desc().first()
    filename = f"{yt.title} (Video).mp4"
    filepath = filedialog.asksaveasfilename(initialfile=filename, defaultextension=".mp4")
    if filepath:
        video_stream.download(output_path=os.path.dirname(filepath), filename=os.path.basename(filepath))
    return filepath

def download_audio(yt: pytube.YouTube) -> str:
    audio_stream = yt.streams.filter(only_audio=True).first()
    audio_filename = audio_stream.download()
    with open(audio_filename, "rb") as audio_file:
        base, ext = os.path.splitext(audio_file.name)
        new_filename = f"{yt.title} (Audio).mp3"
        with open(new_filename, "wb") as new_audio_file:
            new_audio_file.write(audio_file.read())
    os.remove(audio_filename)
    return new_filename

def download_selected() -> None:
    global video_url_entry, video_var, audio_var
    if not validate_input():
        return
    url = video_url_entry.get()
    try:
        yt = pytube.YouTube(url)
        downloaded = []
        if video_var.get():
            video_filepath = download_video(yt)
            if video_filepath:
                downloaded.append("Video")
        if audio_var.get():
            audio_filepath = download_audio(yt)
            if audio_filepath:
                downloaded.append("Audio")
        if downloaded:
            messagebox.showinfo("Download Complete", f"{' and '.join(downloaded)} downloaded successfully")
    except (VideoUnavailable, RegexMatchError):
        messagebox.showerror("Error", "Invalid URL or video not available for download")
    except Exception as e:
        messagebox.showerror("Error", f"An error occurred while downloading the content:\n{str(e)}")

def clear_url() -> None:
    global video_url_entry, progress_bar
    video_url_entry.delete(0, tk.END)
    progress_bar.stop()
    progress_bar.grid_forget()

def main():
    global video_url_entry, video_var, audio_var, progress_bar

    root = tk.Tk()
    root.title("YouTube Downloader")
    root.resizable(False, False)

    video_url_label = tk.Label(root, text="YouTube URL:")
    video_url_label.grid(row=0, column=0, padx=5, pady=5)
    video_url_entry = tk.Entry(root)
    video_url_entry.grid(row=0, column=1, padx=5, pady=5)
    clear_button = tk.Button(root, text="Clear", command=clear_url)
    clear_button.grid(row=0, column=2, padx=5, pady=5)
    video_var = tk.BooleanVar(value=True)
    video_check_button = tk.Checkbutton(root, text="Video", variable=video_var)
    video_check_button.grid(row=1, column=0, padx=5, pady=5, sticky='E')
    audio_var = tk.BooleanVar()
    audio_check_button = tk.Checkbutton(root, text="Audio", variable=audio_var)
    audio_check_button.grid(row=1, column=1, padx=5, pady=5, sticky='W')

    download_button = tk.Button(root, text="Download", command=download_selected)
    download_button.grid(row=1, column=2, padx=5, pady=5)

    progress_bar = ttk.Progressbar(root, mode='determinate', orient=tk.HORIZONTAL, length=200)

    root.mainloop()

if __name__ == '__main__':
    main()
