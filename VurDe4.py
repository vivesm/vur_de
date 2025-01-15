#!/usr/bin/env python3
import os
import sys
import shutil
import subprocess
import threading
from PyQt5.QtWidgets import (
    QApplication, QWidget, QVBoxLayout, QHBoxLayout,
    QLabel, QLineEdit, QPushButton, QCheckBox, QFileDialog,
    QMessageBox, QProgressBar
)
from PyQt5.QtGui import QPixmap, QImage
from PyQt5.QtCore import Qt, pyqtSignal, QObject
import requests
from PIL import Image
from io import BytesIO


class WorkerSignals(QObject):
    """Signals to communicate with the main thread."""
    progress = pyqtSignal(int)  # Update progress bar
    error = pyqtSignal(str)     # Send error messages
    finished = pyqtSignal(str)  # Send completion messages


class DownloadWorker(threading.Thread):
    """Worker thread to handle downloads."""
    def __init__(self, url, folder, video, audio, signals):
        super().__init__()
        self.url = url
        self.folder = folder
        self.download_video = video
        self.download_audio = audio
        self.signals = signals

    def run(self):
        try:
            if self.download_video:
                self._download_with_ytdlp(download_audio=False)

            if self.download_audio:
                self._download_with_ytdlp(download_audio=True)

            self.signals.finished.emit("Download completed successfully!")
        except Exception as e:
            self.signals.error.emit(f"Error during download:\n{str(e)}")
            self.signals.progress.emit(0)

    def _download_with_ytdlp(self, download_audio):
        """Run yt-dlp to download video or audio."""
        command = ["yt-dlp", "-o", f"{self.folder}/%(title)s.%(ext)s", self.url]
        if download_audio:
            command += ["-x", "--audio-format", "mp3"]
        else:
            command += ["-f", "best"]

        process = subprocess.Popen(
            command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
        )

        # Monitor progress from yt-dlp output
        for line in iter(process.stdout.readline, ""):
            if "Downloading" in line or "%" in line:
                percent = self._extract_progress(line)
                if percent is not None:
                    self.signals.progress.emit(percent)

        process.communicate()

        if process.returncode != 0:
            raise Exception(process.stderr.read())

    def _extract_progress(self, line):
        """Extract progress percentage from yt-dlp output."""
        try:
            if "%" in line:
                return int(line.split("%")[0].split()[-1])
        except ValueError:
            pass
        return None


class PyQtYouTubeDownloader(QWidget):
    def __init__(self):
        super().__init__()

        self.setWindowTitle("YouTube Downloader (yt-dlp)")
        self.setGeometry(300, 200, 600, 400)

        # Check for ffmpeg availability
        self.ffmpeg_installed = shutil.which("ffmpeg") is not None

        # Main Layout
        self.main_layout = QVBoxLayout()
        self.setLayout(self.main_layout)

        # Top Row: URL Entry + Buttons
        self.url_layout = QHBoxLayout()
        self.main_layout.addLayout(self.url_layout)

        self.url_label = QLabel("YouTube URL:")
        self.url_layout.addWidget(self.url_label)

        self.url_input = QLineEdit()
        self.url_layout.addWidget(self.url_input)

        self.verify_button = QPushButton("Verify")
        self.verify_button.clicked.connect(self.verify_video)
        self.url_layout.addWidget(self.verify_button)

        self.clear_button = QPushButton("Clear")
        self.clear_button.clicked.connect(self.clear_all)
        self.url_layout.addWidget(self.clear_button)

        # Middle Row: Checkboxes + Download Button
        self.options_layout = QHBoxLayout()
        self.main_layout.addLayout(self.options_layout)

        self.video_checkbox = QCheckBox("Video")
        self.video_checkbox.setChecked(True)
        self.options_layout.addWidget(self.video_checkbox)

        self.audio_checkbox = QCheckBox("Audio")
        self.options_layout.addWidget(self.audio_checkbox)

        self.download_button = QPushButton("Download")
        self.download_button.clicked.connect(self.start_download_thread)
        self.options_layout.addWidget(self.download_button)

        # Video Title + Thumbnail
        self.thumbnail_label = QLabel()
        self.thumbnail_label.setAlignment(Qt.AlignCenter)
        self.main_layout.addWidget(self.thumbnail_label)

        self.title_label = QLabel()
        self.title_label.setAlignment(Qt.AlignCenter)
        self.main_layout.addWidget(self.title_label)

        # Progress Bar
        self.progress_bar = QProgressBar()
        self.progress_bar.setValue(0)
        self.main_layout.addWidget(self.progress_bar)

    def show_error(self, message):
        """Display error messages."""
        QMessageBox.critical(self, "Error", message)

    def show_info(self, message):
        """Display informational messages."""
        QMessageBox.information(self, "Info", message)

    def verify_video(self):
        """Fetch video title and thumbnail using yt-dlp."""
        url = self.url_input.text().strip()
        if not url:
            self.show_error("Please enter a YouTube URL.")
            return

        try:
            # Run yt-dlp to fetch metadata
            command = [
                "yt-dlp", "--print", "%(title)s\n%(thumbnail)s", "--skip-download", url
            ]
            result = subprocess.run(
                command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True
            )
            output = result.stdout.strip().split("\n")
            if len(output) < 2:
                raise Exception("Could not retrieve video info.")

            # Update title and thumbnail
            title, thumbnail_url = output
            self.title_label.setText(title)
            self.load_thumbnail(thumbnail_url)
        except subprocess.CalledProcessError as e:
            self.show_error(f"Error verifying video:\n{e.stderr}")
        except Exception as e:
            self.show_error(f"Could not retrieve video info.\n{e}")

    def load_thumbnail(self, url):
        """Fetch and display the video thumbnail."""
        try:
            response = requests.get(url, stream=True, timeout=10)
            response.raise_for_status()

            img = Image.open(BytesIO(response.content))
            img.thumbnail((320, 180))
            img_data = BytesIO()
            img.save(img_data, format="PNG")
            qt_img = QImage.fromData(img_data.getvalue(), "PNG")
            pixmap = QPixmap.fromImage(qt_img)

            self.thumbnail_label.setPixmap(pixmap)
        except requests.exceptions.RequestException as e:
            self.show_error(f"Error loading thumbnail:\n{e}")

    def clear_all(self):
        """Clear all fields and reset the progress bar."""
        self.url_input.clear()
        self.thumbnail_label.clear()
        self.title_label.clear()
        self.progress_bar.setValue(0)

    def start_download_thread(self):
        """Start a new thread to download video/audio."""
        url = self.url_input.text().strip()
        if not url:
            self.show_error("Please verify a video first.")
            return

        if not self.video_checkbox.isChecked() and not self.audio_checkbox.isChecked():
            self.show_error("Please select at least one option (Video or Audio).")
            return

        if self.audio_checkbox.isChecked() and not self.ffmpeg_installed:
            self.show_error("ffmpeg is not installed. Cannot convert to MP3.")
            return

        folder = QFileDialog.getExistingDirectory(self, "Select Download Folder")
        if not folder:
            return  # User canceled

        # Create and start the worker thread
        self.signals = WorkerSignals()
        self.signals.progress.connect(self.update_progress)
        self.signals.error.connect(self.show_error)
        self.signals.finished.connect(self.show_info)

        self.worker = DownloadWorker(
            url, folder, self.video_checkbox.isChecked(), self.audio_checkbox.isChecked(), self.signals
        )
        self.worker.start()

    def update_progress(self, percent):
        """Update the progress bar."""
        self.progress_bar.setValue(percent)


def main():
    app = QApplication(sys.argv)
    window = PyQtYouTubeDownloader()
    window.show()
    sys.exit(app.exec_())


if __name__ == "__main__":
    main()
