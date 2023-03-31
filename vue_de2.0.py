import os
import ssl
import pytube
import requests
from pytube.exceptions import VideoUnavailable, RegexMatchError
import tkinter as tk
import tkinter.ttk as ttk
from tkinter import filedialog, messagebox
from io import BytesIO
from PIL import Image, ImageTk

if (not os.environ.get('PYTHONHTTPSVERIFY', '') and
    getattr(ssl, '_create_unverified_context', None)): 
    ssl._create_default_https_context = ssl._create_unverified_context

class YouTubeDownloaderUI:
    def __init__(self, root):
        self.root = root
        self.root.title("Vur De")
        self.root.resizable(False, False)

        self.video_var = tk.BooleanVar()
        self.audio_var = tk.BooleanVar()

        self.create_widgets()
    
    def create_widgets(self):
        video_url_label = tk.Label(self.root, text="Link:")
        video_url_label.grid(row=0, column=0, padx=5, pady=5, sticky='e')
        self.video_url_entry = tk.Entry(self.root)
        self.video_url_entry.grid(row=0, column=1, padx=5, pady=5, sticky='w')
        self.video_url_entry.bind('<Return>', lambda _: self.update_thumbnail_and_title())

        button_frame = tk.Frame(self.root)
        button_frame.grid(row=0, column=2, padx=5, pady=5, sticky='w')

        verify_button = tk.Button(button_frame, text="Verify", command=self.update_thumbnail_and_title, takefocus=1)
        verify_button.pack(side=tk.RIGHT)

        clear_button = tk.Button(button_frame, text="ⓧ", command=self.clear_url, takefocus=1)
        clear_button.pack(side=tk.LEFT)

        file_type_label = tk.Label(self.root, text="Type:")
        file_type_label.grid(row=1, column=0, padx=5, pady=5, sticky='e')

        check_button_frame = tk.Frame(self.root)
        check_button_frame.grid(row=1, column=1, padx=5, pady=5, sticky='w')

        video_checkbox = tk.Checkbutton(check_button_frame, text="Video", variable=self.video_var)
        video_checkbox.pack(side=tk.LEFT)

        audio_checkbox = tk.Checkbutton(check_button_frame, text="Audio", variable=self.audio_var)
        audio_checkbox.pack(side=tk.RIGHT)

        download_button = tk.Button(self.root, text="Download", command=self.download_selected)
        download_button.grid(row=1, column=2, padx=5, pady=5, sticky='w')

        self.video_title_label = tk.Label(self.root, text="", wraplength=300)
        self.video_title_label.grid(row=3, column=0, columnspan=3, padx=5, pady=5)

        self.video_thumbnail_label = tk.Label(self.root)
        self.video_thumbnail_label.grid(row=4, column=0, columnspan=3, padx=5, pady=5)

    def validate_url(self, url: str) -> bool:
        try:
            pytube.YouTube(url)
        except (VideoUnavailable, RegexMatchError):
            return False
        return True

    def validate_input(self) -> bool:
        if not self.video_var.get() and not self.audio_var.get():
            messagebox.showerror("Error", "Please select at least one file type (Video or Audio) to download")
            return False
        return True

    def clear_url(self):
        self.video_url_entry.delete(0, tk.END)
        self.video_title_label.config(text="")
        self.video_thumbnail_label.config(image=None)
        self.video_thumbnail_label.image = None

        self.root.geometry("")
        self.root.update_idletasks()
        self.root.grid_propagate(True)

    def update_thumbnail_and_title(self):
        url = self.video_url_entry.get()
        if self.validate_url(url):
            yt = pytube.YouTube(url, on_progress_callback=None)
            title = yt.title
            self.video_title_label.config(text=title)

            thumbnail_url = yt.thumbnail_url
            try:
                response = requests.get(thumbnail_url, verify=False)
                img_data = response.content
                img = Image.open(BytesIO(img_data))
                img = img.resize((200, 112), Image.LANCZOS)
                thumbnail = ImageTk.PhotoImage(img)
                self.video_thumbnail_label.config(image=thumbnail)
                self.video_thumbnail_label.image = thumbnail
            except Exception as e:
                messagebox.showerror("Error", f"An error occurred while fetching the thumbnail:\n{str(e)}")
        else:
            self.video_title_label.config(text="")
            self.video_thumbnail_label.config(image=None)
    
    def download_video(self, yt: pytube.YouTube) -> str:
        video_streams = yt.streams.filter(progressive=True, file_extension='mp4').order_by('resolution').desc()
        if not video_streams:
            messagebox.showerror("Error", "No suitable video streams found")
            return ""

        save_path = filedialog.askdirectory(title="Select folder to save the video")
        if not save_path:
            return ""

        video_stream = video_streams.first()
        file_name = video_stream.default_filename
        file_path = os.path.join(save_path, file_name)

        try:
            video_stream.download(save_path)
            return file_path
        except Exception as e:
            messagebox.showerror("Error", f"An error occurred while downloading the video:\n{str(e)}")
            return ""
        
    def download_audio(self, yt: pytube.YouTube) -> str:
        audio_streams = yt.streams.filter(only_audio=True).order_by('abr').desc()
        if not audio_streams:
            messagebox.showerror("Error", "No suitable audio streams found")
            return ""

        save_path = filedialog.askdirectory(title="Select folder to save the audio")
        if not save_path:
            return ""

        audio_stream = audio_streams.first()
        file_name = f"{audio_stream.title}.mp3"
        file_path = os.path.join(save_path, file_name)

        try:
            audio_stream.download(save_path, filename=file_name)
            return file_path
        except Exception as e:
            messagebox.showerror("Error", f"An error occurred while downloading the audio:\n{str(e)}")
            return ""

    def download_selected(self):
        if not self.validate_input():
            return
        url = self.video_url_entry.get()
        try:
            yt = pytube.YouTube(url)
            downloaded = []
            if self.video_var.get():
                video_filepath = self.download_video(yt)
                if video_filepath:
                    downloaded.append("Video")
            if self.audio_var.get():
                audio_filepath = self.download_audio(yt)
                if audio_filepath:
                    downloaded.append("Audio")
            if downloaded:
                messagebox.showinfo("Download Complete", f"{' and '.join(downloaded)} downloaded successfully")
        except (VideoUnavailable, RegexMatchError):
            messagebox.showerror("Error", "Invalid URL or video not available for download")
        except Exception as e:
            messagebox.showerror("Error", f"An error occurred while downloading the content:\n{str(e)}")


def main():
    root = tk.Tk()
    app = YouTubeDownloaderUI(root)
    root.mainloop()

if __name__ == '__main__':
    main()
