import os
import sys
import json
from flask import Flask, render_template, request, jsonify, Response, stream_with_context, send_file, after_this_request
from flask_cors import CORS
import yt_dlp
import threading
import queue
import time
import logging
import tempfile
import shutil
from datetime import datetime
import zipfile
import sqlite3
from enum import Enum
from collections import deque
import uuid

app = Flask(__name__)
CORS(app)

# Set up logging
logging.basicConfig(level=logging.DEBUG)

# Download Status Enum
class DownloadStatus(Enum):
    PENDING = "pending"
    ACTIVE = "active"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"

# Initialize database
def init_db():
    conn = sqlite3.connect('downloads.db')
    conn.execute('''
        CREATE TABLE IF NOT EXISTS download_history (
            id TEXT PRIMARY KEY,
            url TEXT NOT NULL,
            title TEXT,
            artist TEXT,
            format TEXT NOT NULL,
            file_path TEXT,
            file_size INTEGER,
            status TEXT NOT NULL,
            error_message TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            completed_at DATETIME,
            expires_at DATETIME
        )
    ''')
    
    # Add expires_at column if it doesn't exist (for migration)
    try:
        conn.execute('ALTER TABLE download_history ADD COLUMN expires_at DATETIME')
    except:
        pass  # Column already exists
    conn.close()

# Initialize database on startup
init_db()

# Download Queue Manager
class DownloadQueueManager:
    def __init__(self, max_concurrent=3):
        self.max_concurrent = max_concurrent
        self.queue = deque()
        self.active_downloads = {}
        self.completed_downloads = {}
        self.download_history = {}
        self.lock = threading.Lock()
        self.processing_thread = None
        self.start_processing()
    
    def add_to_queue(self, download_info):
        """Add a download to the queue"""
        download_id = str(uuid.uuid4())
        
        with self.lock:
            download_item = {
                'id': download_id,
                'url': download_info['url'],
                'format': download_info['format'],
                'status': DownloadStatus.PENDING.value,
                'added_at': datetime.now().isoformat(),
                'progress': 0,
                'playlist_limit': download_info.get('playlist_limit')
            }
            
            self.queue.append(download_item)
            self.download_history[download_id] = download_item
            
            # Save to database
            self._save_to_db(download_item)
            
        return download_id
    
    def get_queue_status(self):
        """Get current queue status"""
        with self.lock:
            # Update active downloads with latest progress
            for download_id, download_item in self.active_downloads.items():
                if download_id in progress_queues:
                    try:
                        # Peek at the latest progress without removing it
                        progress_queue = progress_queues[download_id]
                        temp_items = []
                        latest_progress = None
                        
                        # Get all items to find the latest
                        while not progress_queue.empty():
                            item = progress_queue.get_nowait()
                            temp_items.append(item)
                            latest_progress = item
                        
                        # Put them back
                        for item in temp_items:
                            progress_queue.put(item)
                        
                        # Update download item with latest progress
                        if latest_progress:
                            if latest_progress.get('status') == 'downloading':
                                download_item['progress'] = int(latest_progress.get('percent', '0%').replace('%', ''))
                                download_item['speed'] = latest_progress.get('speed', 'N/A')
                                download_item['eta'] = latest_progress.get('eta', 'N/A')
                            elif latest_progress.get('status') == 'starting':
                                download_item['title'] = latest_progress.get('title', 'Unknown')
                                download_item['artist'] = latest_progress.get('artist', '')
                    except:
                        pass
            
            return {
                'pending': list(self.queue),
                'active': dict(self.active_downloads),
                'completed': dict(self.completed_downloads),
                'history': dict(self.download_history)
            }
    
    def pause_download(self, download_id):
        """Pause a download"""
        with self.lock:
            if download_id in self.active_downloads:
                # Set cancellation flag
                if download_id in download_cancelled:
                    download_cancelled[download_id] = True
                
                # Update status
                self.active_downloads[download_id]['status'] = DownloadStatus.PAUSED.value
                self.download_history[download_id]['status'] = DownloadStatus.PAUSED.value
                
                # Move back to queue for later
                self.queue.appendleft(self.active_downloads[download_id])
                del self.active_downloads[download_id]
                
                self._update_db_status(download_id, DownloadStatus.PAUSED.value)
                return True
        return False
    
    def resume_download(self, download_id):
        """Resume a paused download"""
        with self.lock:
            for i, item in enumerate(self.queue):
                if item['id'] == download_id and item['status'] == DownloadStatus.PAUSED.value:
                    item['status'] = DownloadStatus.PENDING.value
                    self.download_history[download_id]['status'] = DownloadStatus.PENDING.value
                    self._update_db_status(download_id, DownloadStatus.PENDING.value)
                    return True
        return False
    
    def cancel_download(self, download_id):
        """Cancel a download"""
        with self.lock:
            # If in queue, remove it
            self.queue = deque([item for item in self.queue if item['id'] != download_id])
            
            # If active, cancel it
            if download_id in self.active_downloads:
                if download_id in download_cancelled:
                    download_cancelled[download_id] = True
                self.active_downloads[download_id]['status'] = DownloadStatus.CANCELLED.value
            
            # Update history
            if download_id in self.download_history:
                self.download_history[download_id]['status'] = DownloadStatus.CANCELLED.value
                self._update_db_status(download_id, DownloadStatus.CANCELLED.value)
            
            return True
    
    def start_processing(self):
        """Start the queue processing thread"""
        if not self.processing_thread or not self.processing_thread.is_alive():
            self.processing_thread = threading.Thread(target=self._process_queue, daemon=True)
            self.processing_thread.start()
    
    def _process_queue(self):
        """Process downloads from the queue"""
        while True:
            try:
                with self.lock:
                    # Check if we can start more downloads
                    if len(self.active_downloads) < self.max_concurrent and self.queue:
                        # Get next item from queue
                        download_item = None
                        for item in self.queue:
                            if item['status'] == DownloadStatus.PENDING.value:
                                download_item = item
                                break
                        
                        if download_item:
                            self.queue.remove(download_item)
                            download_item['status'] = DownloadStatus.ACTIVE.value
                            self.active_downloads[download_item['id']] = download_item
                            self.download_history[download_item['id']] = download_item
                            
                            # Start download thread
                            thread = threading.Thread(
                                target=self._execute_download,
                                args=(download_item,),
                                daemon=True
                            )
                            thread.start()
                
                time.sleep(1)  # Check queue every second
                
            except Exception as e:
                app.logger.error(f"Error in queue processing: {e}")
    
    def _execute_download(self, download_item):
        """Execute a download"""
        download_id = download_item['id']
        
        try:
            # Update status in database
            self._update_db_status(download_id, DownloadStatus.ACTIVE.value)
            
            # Call the existing download_video function
            download_video(
                download_item['url'],
                download_item['format'],
                download_id,
                download_item.get('playlist_limit')
            )
            
            # Monitor progress queue for completion
            timeout = 600  # 10 minutes timeout
            start_time = time.time()
            
            while time.time() - start_time < timeout:
                # Check if download was cancelled
                if download_cancelled.get(download_id, False):
                    break
                    
                # Check if download completed
                if download_id in completed_downloads:
                    with self.lock:
                        download_item['status'] = DownloadStatus.COMPLETED.value
                        download_item['completed_at'] = datetime.now().isoformat()
                        download_item['file_info'] = completed_downloads[download_id]
                        
                        self.completed_downloads[download_id] = download_item
                        if download_id in self.active_downloads:
                            del self.active_downloads[download_id]
                        
                        # Update database
                        self._update_db_completed(download_id, completed_downloads[download_id])
                    break
                    
                # Check progress queue for error
                if download_id in progress_queues:
                    try:
                        progress_data = progress_queues[download_id].get_nowait()
                        if progress_data.get('status') == 'error':
                            raise Exception(progress_data.get('message', 'Unknown error'))
                        # Put it back if not error
                        progress_queues[download_id].put(progress_data)
                    except queue.Empty:
                        pass
                        
                time.sleep(0.5)
            
        except Exception as e:
            app.logger.error(f"Error executing download {download_id}: {e}")
            with self.lock:
                download_item['status'] = DownloadStatus.FAILED.value
                download_item['error'] = str(e)
                if download_id in self.active_downloads:
                    del self.active_downloads[download_id]
                
                self._update_db_status(download_id, DownloadStatus.FAILED.value, str(e))
    
    def _save_to_db(self, download_item):
        """Save download to database"""
        try:
            conn = sqlite3.connect('downloads.db')
            conn.execute('''
                INSERT INTO download_history (id, url, format, status)
                VALUES (?, ?, ?, ?)
            ''', (
                download_item['id'],
                download_item['url'],
                download_item['format'],
                download_item['status']
            ))
            conn.commit()
            conn.close()
        except Exception as e:
            app.logger.error(f"Error saving to database: {e}")
    
    def _update_db_status(self, download_id, status, error_message=None):
        """Update download status in database"""
        try:
            conn = sqlite3.connect('downloads.db')
            if error_message:
                conn.execute('''
                    UPDATE download_history 
                    SET status = ?, error_message = ?
                    WHERE id = ?
                ''', (status, error_message, download_id))
            else:
                conn.execute('''
                    UPDATE download_history 
                    SET status = ?
                    WHERE id = ?
                ''', (status, download_id))
            conn.commit()
            conn.close()
        except Exception as e:
            app.logger.error(f"Error updating database: {e}")
    
    def _update_db_completed(self, download_id, file_info):
        """Update database when download completes"""
        try:
            conn = sqlite3.connect('downloads.db')
            
            # Extract info based on whether it's a playlist or single file
            if isinstance(file_info, dict):
                if file_info.get('is_playlist'):
                    title = file_info.get('playlist_title', 'Unknown Playlist')
                    file_path = json.dumps([f['filepath'] for f in file_info.get('files', [])])
                    file_size = sum(f['size'] for f in file_info.get('files', []))
                else:
                    title = file_info.get('title', 'Unknown')
                    file_path = file_info.get('filepath', '')
                    file_size = file_info.get('size', 0)
                
                artist = file_info.get('artist', '')
            else:
                title = 'Unknown'
                file_path = ''
                file_size = 0
                artist = ''
            
            # Set expiration to 24 hours from now
            conn.execute('''
                UPDATE download_history 
                SET status = ?, title = ?, artist = ?, file_path = ?, 
                    file_size = ?, completed_at = CURRENT_TIMESTAMP,
                    expires_at = datetime('now', '+24 hours')
                WHERE id = ?
            ''', (DownloadStatus.COMPLETED.value, title, artist, file_path, file_size, download_id))
            conn.commit()
            conn.close()
        except Exception as e:
            app.logger.error(f"Error updating completed download: {e}")

# Initialize the queue manager
download_queue = DownloadQueueManager(max_concurrent=3)

# Store download progress
download_progress = {}
# Each download gets its own queue
progress_queues = {}
# Store download threads for cancellation
download_threads = {}
# Store cancellation flags
download_cancelled = {}
# Store last activity time for cleanup
download_last_activity = {}

# Create temp directory for downloads
TEMP_DIR = os.path.join(tempfile.gettempdir(), 'vur_de_downloads')
os.makedirs(TEMP_DIR, exist_ok=True)

# Clean up old files on startup (older than 24 hours)
def cleanup_old_files():
    try:
        current_time = time.time()
        for filename in os.listdir(TEMP_DIR):
            filepath = os.path.join(TEMP_DIR, filename)
            if os.path.isfile(filepath):
                file_age = current_time - os.path.getctime(filepath)
                if file_age > 86400:  # 24 hours in seconds
                    os.remove(filepath)
                    app.logger.info(f"Removed old file: {filename}")
    except Exception as e:
        app.logger.error(f"Error cleaning up old files: {e}")

# Run cleanup on startup
cleanup_old_files()

# Store completed downloads info
completed_downloads = {}

# Rate limiting for preview requests
preview_rate_limit = {}
PREVIEW_RATE_LIMIT_SECONDS = 2  # Allow 1 preview every 2 seconds per IP

# Cleanup old downloads from memory after 1 hour
def cleanup_old_downloads():
    """Remove old download entries from memory to prevent memory leaks"""
    try:
        current_time = datetime.now()
        downloads_to_remove = []
        
        for download_id, info in completed_downloads.items():
            # Parse timestamp and check if older than 1 hour
            timestamp = datetime.fromisoformat(info.get('timestamp', current_time.isoformat()))
            if (current_time - timestamp).seconds > 3600:  # 1 hour
                downloads_to_remove.append(download_id)
        
        # Remove old downloads
        for download_id in downloads_to_remove:
            del completed_downloads[download_id]
            app.logger.info(f"Removed old download entry: {download_id}")
            
    except Exception as e:
        app.logger.error(f"Error cleaning up old downloads: {e}")

# Cleanup expired downloads from disk and database
def cleanup_expired_downloads():
    """Remove expired downloads from disk and database"""
    try:
        conn = sqlite3.connect('downloads.db')
        cursor = conn.cursor()
        
        # Find expired downloads
        cursor.execute('''
            SELECT id, file_path FROM download_history 
            WHERE expires_at < datetime('now') 
            AND status = ? 
            AND file_path IS NOT NULL
        ''', (DownloadStatus.COMPLETED.value,))
        
        expired_downloads = cursor.fetchall()
        
        for download_id, file_path in expired_downloads:
            # Delete files from disk
            if file_path and os.path.exists(file_path):
                try:
                    # If it's a directory (for playlists), remove all files
                    if os.path.isdir(file_path):
                        shutil.rmtree(file_path)
                    else:
                        os.remove(file_path)
                    app.logger.info(f"Deleted expired file: {file_path}")
                except Exception as e:
                    app.logger.error(f"Error deleting file {file_path}: {e}")
            
            # Remove from completed_downloads if still there
            if download_id in completed_downloads:
                del completed_downloads[download_id]
        
        # Delete expired records from database
        cursor.execute('''
            DELETE FROM download_history 
            WHERE expires_at < datetime('now') 
            AND status = ?
        ''', (DownloadStatus.COMPLETED.value,))
        
        deleted_count = cursor.rowcount
        conn.commit()
        conn.close()
        
        if deleted_count > 0:
            app.logger.info(f"Cleaned up {deleted_count} expired downloads")
            
    except Exception as e:
        app.logger.error(f"Error cleaning up expired downloads: {e}")

# Cleanup old progress queues and related data
def cleanup_stale_downloads():
    """Remove stale download data to prevent memory leaks"""
    try:
        current_time = time.time()
        stale_threshold = 300  # 5 minutes
        
        downloads_to_remove = []
        
        # Check last activity time
        for download_id, last_activity in download_last_activity.items():
            if current_time - last_activity > stale_threshold:
                downloads_to_remove.append(download_id)
        
        # Remove stale download data
        for download_id in downloads_to_remove:
            if download_id in progress_queues:
                del progress_queues[download_id]
            if download_id in download_cancelled:
                del download_cancelled[download_id]
            if download_id in download_last_activity:
                del download_last_activity[download_id]
            if download_id in download_threads:
                del download_threads[download_id]
            app.logger.info(f"Cleaned up stale download data: {download_id}")
            
        # Clean up old preview rate limits
        ips_to_remove = []
        for ip, last_request in preview_rate_limit.items():
            if current_time - last_request > 60:  # Remove IPs older than 1 minute
                ips_to_remove.append(ip)
        
        for ip in ips_to_remove:
            del preview_rate_limit[ip]
            
    except Exception as e:
        app.logger.error(f"Error cleaning up stale downloads: {e}")

# Schedule periodic cleanup
def schedule_cleanup():
    cleanup_old_downloads()
    cleanup_old_files()
    cleanup_stale_downloads()  # Add stale download cleanup
    cleanup_expired_downloads()  # Add expired download cleanup
    # Schedule next cleanup in 30 minutes
    timer = threading.Timer(1800.0, schedule_cleanup)
    timer.daemon = True
    timer.start()

# Start the cleanup scheduler
schedule_cleanup()

def update_id3_tags(filepath, title, artist, album):
    """Update ID3 tags for MP3 files"""
    try:
        from mutagen.mp3 import MP3
        from mutagen.id3 import ID3, TIT2, TPE1, TALB, APIC
        
        # Load the MP3 file
        audio = MP3(filepath, ID3=ID3)
        
        # Add ID3 tag if it doesn't exist
        try:
            audio.add_tags()
        except:
            pass  # Tags already exist
        
        # Set the tags
        audio.tags['TIT2'] = TIT2(encoding=3, text=title)
        if artist:
            audio.tags['TPE1'] = TPE1(encoding=3, text=artist)
        if album:
            audio.tags['TALB'] = TALB(encoding=3, text=album)
        
        # Save the tags
        audio.save()
        app.logger.info(f"Updated ID3 tags for {filepath}: {artist} - {title} - {album}")
        
    except ImportError:
        app.logger.warning("Mutagen not installed, skipping ID3 tag update")
    except Exception as e:
        app.logger.error(f"Error updating ID3 tags: {e}")

def create_progress_hook(download_id, playlist_index=None, playlist_total=None):
    def progress_hook(d):
        # Check if download was cancelled
        if download_id in download_cancelled and download_cancelled[download_id]:
            raise Exception("Download cancelled by user")
            
        # Get or create queue for this download
        if download_id not in progress_queues:
            progress_queues[download_id] = queue.Queue()
        progress_queue = progress_queues[download_id]
        
        if d['status'] == 'downloading':
            progress_data = {
                'status': 'downloading',
                'percent': d.get('_percent_str', 'N/A'),
                'speed': d.get('_speed_str', 'N/A'),
                'eta': d.get('_eta_str', 'N/A'),
                'filename': d.get('filename', 'Unknown')
            }
            if playlist_index:
                progress_data['playlist_index'] = playlist_index
                progress_data['playlist_total'] = playlist_total
            progress_queue.put(progress_data)
        elif d['status'] == 'finished':
            progress_data = {
                'status': 'finished',
                'filename': d.get('filename', 'Unknown')
            }
            if playlist_index:
                progress_data['playlist_index'] = playlist_index
                progress_data['playlist_total'] = playlist_total
            progress_queue.put(progress_data)
    return progress_hook

def download_video(url, format_type, download_id, playlist_limit=None):
    try:
        # Create queue for this download
        if download_id not in progress_queues:
            progress_queues[download_id] = queue.Queue()
        progress_queue = progress_queues[download_id]
        
        # Initialize cancellation flag and activity tracking
        download_cancelled[download_id] = False
        download_last_activity[download_id] = time.time()
        
        # Check if it's a playlist
        is_playlist = 'playlist' in url or 'list=' in url
        
        # Always use temp directory for web hosting
        download_dir = TEMP_DIR
        
        # Base options for extraction only
        extract_opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': True if is_playlist else False,
        }
        
        # Extract info without downloading
        with yt_dlp.YoutubeDL(extract_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            
            # Handle playlist
            if 'entries' in info:
                # It's a playlist
                playlist_title = info.get('title', 'Unknown Playlist')
                entries = info['entries'][:playlist_limit] if playlist_limit else info['entries']
                total_videos = len(entries)
                
                progress_queue.put({
                    'status': 'playlist_info',
                    'playlist_title': playlist_title,
                    'total_videos': total_videos
                })
                
                downloaded_files = []
                
                for idx, entry in enumerate(entries, 1):
                    # Check for cancellation
                    if download_cancelled.get(download_id, False):
                        progress_queue.put({'status': 'cancelled', 'message': 'Download cancelled by user'})
                        break
                        
                    if entry is None:
                        continue
                    
                    # Initialize variables with defaults to prevent reference errors
                    title = f"Unknown Video {idx}"
                    artist = "Unknown Artist"
                    album = ""
                    
                    try:
                        # Get the video URL
                        video_url = entry.get('url') or entry.get('webpage_url') or f"https://www.youtube.com/watch?v={entry.get('id')}"
                        
                        # Create download options for this specific video
                        video_ydl_opts = {
                            'quiet': False,
                            'no_warnings': False,
                            'progress_hooks': [create_progress_hook(download_id, idx, total_videos)],
                        }
                        
                        # Add format options
                        if format_type == 'audio':
                            video_ydl_opts.update({
                                'format': 'bestaudio/best',
                                'postprocessors': [{
                                    'key': 'FFmpegExtractAudio',
                                    'preferredcodec': 'mp3',
                                }, {
                                    'key': 'FFmpegMetadata',
                                    'add_metadata': True,
                                }, {
                                    'key': 'EmbedThumbnail',
                                    'already_have_thumbnail': False,
                                }],
                                'writethumbnail': True,  # Download thumbnail to embed as cover art
                            })
                        else:
                            video_ydl_opts.update({
                                'format': 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]',
                            })
                        
                        # First extract full metadata for this video
                        with yt_dlp.YoutubeDL({'quiet': True}) as info_ydl:
                            video_info = info_ydl.extract_info(video_url, download=False)
                        
                        # Get metadata
                        title = video_info.get('title', 'Unknown')
                        artist = video_info.get('artist', video_info.get('uploader', video_info.get('channel', '')))
                        album = video_info.get('album', '')
                        
                        # Clean filename components
                        def clean_filename(s):
                            # Remove problematic characters but keep more valid ones
                            return "".join(c for c in s if c.isalnum() or c in (' ', '-', '_', '.', '(', ')', '[', ']', ',')).strip()
                        
                        safe_title = clean_filename(title)
                        safe_artist = clean_filename(artist) if artist else ''
                        safe_album = clean_filename(album) if album else ''
                        
                        # Build filename based on available metadata
                        if safe_artist and safe_album:
                            base_filename = f"{safe_artist} - {safe_title} - {safe_album}"
                        elif safe_artist:
                            base_filename = f"{safe_artist} - {safe_title}"
                        else:
                            base_filename = safe_title
                        
                        # Set the output template
                        video_ydl_opts['outtmpl'] = os.path.join(download_dir, f"{base_filename}.%(ext)s")
                        
                        progress_queue.put({
                            'status': 'starting', 
                            'title': title,
                            'artist': artist,
                            'album': album,
                            'playlist_index': idx,
                            'playlist_total': total_videos
                        })
                        
                        # Download the video
                        with yt_dlp.YoutubeDL(video_ydl_opts) as video_ydl:
                            video_ydl.download([video_url])
                        
                        # Find the downloaded file
                        ext = 'mp3' if format_type == 'audio' else 'mp4'
                        expected_filename = f"{base_filename}.{ext}"
                        expected_path = os.path.join(download_dir, expected_filename)
                        
                        if os.path.exists(expected_path):
                            # Update ID3 tags if it's an MP3
                            if format_type == 'audio':
                                update_id3_tags(expected_path, title, artist, album)
                            
                            file_info = {
                                'filename': expected_filename,
                                'filepath': expected_path,
                                'title': title,
                                'artist': artist,
                                'album': album,
                                'size': os.path.getsize(expected_path)
                            }
                            downloaded_files.append(file_info)
                            
                            # Send file completed event
                            progress_queue.put({
                                'status': 'file_completed',
                                'file_info': file_info,
                                'playlist_index': idx,
                                'playlist_total': total_videos
                            })
                        else:
                            # Fallback: find the most recent file
                            files = sorted(
                                [f for f in os.listdir(download_dir) if f.endswith(f'.{ext}')],
                                key=lambda x: os.path.getctime(os.path.join(download_dir, x)),
                                reverse=True
                            )
                            if files:
                                filename = files[0]
                                filepath = os.path.join(download_dir, filename)
                                
                                # Update ID3 tags if it's an MP3
                                if format_type == 'audio':
                                    update_id3_tags(filepath, title, artist, album)
                                
                                file_info = {
                                    'filename': filename,
                                    'filepath': filepath,
                                    'title': title,
                                    'artist': artist,
                                    'album': album,
                                    'size': os.path.getsize(filepath)
                                }
                                downloaded_files.append(file_info)
                                
                                # Send file completed event
                                progress_queue.put({
                                    'status': 'file_completed',
                                    'file_info': file_info,
                                    'playlist_index': idx,
                                    'playlist_total': total_videos
                                })
                                
                    except Exception as e:
                        app.logger.error(f"Error downloading video {idx}/{total_videos}: {str(e)}")
                        # Get title from entry if available
                        error_title = entry.get('title', title) if entry else title
                        progress_queue.put({
                            'status': 'error',
                            'message': f"Failed to download video {idx}: {error_title}. Error: {str(e)}",
                            'playlist_index': idx,
                            'playlist_total': total_videos
                        })
                        # Continue with next video instead of stopping
                        continue
                
                # Store all downloaded files info
                completed_downloads[download_id] = {
                    'is_playlist': True,
                    'playlist_title': playlist_title,
                    'files': downloaded_files,
                    'format': format_type,
                    'timestamp': datetime.now().isoformat(),
                    'download_dir': download_dir
                }
                
                progress_queue.put({
                    'status': 'playlist_completed',
                    'playlist_title': playlist_title,
                    'download_id': download_id,
                    'total_files': len(downloaded_files),
                    'total_size': sum(f['size'] for f in downloaded_files)
                })
                
            else:
                # Single video download
                # Create download options
                download_opts = {
                    'quiet': False,
                    'no_warnings': False,
                    'progress_hooks': [create_progress_hook(download_id)],
                }
                
                # Add format options
                if format_type == 'audio':
                    download_opts.update({
                        'format': 'bestaudio/best',
                        'postprocessors': [{
                            'key': 'FFmpegExtractAudio',
                            'preferredcodec': 'mp3',
                        }, {
                            'key': 'FFmpegMetadata',
                            'add_metadata': True,
                        }, {
                            'key': 'EmbedThumbnail',
                            'already_have_thumbnail': False,
                        }],
                        'writethumbnail': True,  # Download thumbnail to embed as cover art
                    })
                else:
                    download_opts.update({
                        'format': 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]',
                    })
                
                # Extract full info first
                with yt_dlp.YoutubeDL({'quiet': True}) as info_ydl:
                    video_info = info_ydl.extract_info(url, download=False)
                
                # Get metadata
                title = video_info.get('title', 'Unknown')
                artist = video_info.get('artist', video_info.get('uploader', video_info.get('channel', '')))
                album = video_info.get('album', '')
                
                # Clean filename components
                def clean_filename(s):
                    # Remove problematic characters but keep more valid ones
                    return "".join(c for c in s if c.isalnum() or c in (' ', '-', '_', '.', '(', ')', '[', ']', ',')).strip()
                
                safe_title = clean_filename(title)
                safe_artist = clean_filename(artist) if artist else ''
                safe_album = clean_filename(album) if album else ''
                
                # Build filename based on available metadata
                if safe_artist and safe_album:
                    base_filename = f"{safe_artist} - {safe_title} - {safe_album}"
                elif safe_artist:
                    base_filename = f"{safe_artist} - {safe_title}"
                else:
                    base_filename = safe_title
                
                # Set the output template
                download_opts['outtmpl'] = os.path.join(download_dir, f"{base_filename}.%(ext)s")
                
                progress_queue.put({
                    'status': 'starting', 
                    'title': title,
                    'artist': artist,
                    'album': album
                })
                
                # Download the file
                with yt_dlp.YoutubeDL(download_opts) as download_ydl:
                    download_ydl.download([url])
                
                # Find the downloaded file
                ext = 'mp3' if format_type == 'audio' else 'mp4'
                expected_filename = f"{base_filename}.{ext}"
                filepath = os.path.join(download_dir, expected_filename)
                
                if not os.path.exists(filepath):
                    # Fallback: find the most recently created file
                    files = sorted(
                        [f for f in os.listdir(download_dir) if f.endswith(f'.{ext}')],
                        key=lambda x: os.path.getctime(os.path.join(download_dir, x)),
                        reverse=True
                    )
                    if files:
                        expected_filename = files[0]
                        filepath = os.path.join(download_dir, expected_filename)
                
                # Update ID3 tags if it's an MP3
                if format_type == 'audio' and os.path.exists(filepath):
                    update_id3_tags(filepath, title, artist, album)
                
                # Store download info
                completed_downloads[download_id] = {
                    'filename': expected_filename,
                    'filepath': filepath,
                    'title': title,
                    'artist': artist,
                    'album': album,
                    'format': format_type,
                    'timestamp': datetime.now().isoformat(),
                    'size': os.path.getsize(filepath) if os.path.exists(filepath) else 0,
                    'download_dir': download_dir
                }
                
                progress_queue.put({
                    'status': 'completed', 
                    'title': title,
                    'artist': artist,
                    'album': album,
                    'download_id': download_id,
                    'filename': expected_filename,
                    'size': completed_downloads[download_id]['size']
                })
            
    except Exception as e:
        # Clean up any partial downloads
        try:
            import glob
            pattern = os.path.join(TEMP_DIR, f"*{download_id}*")
            for file in glob.glob(pattern):
                try:
                    os.remove(file)
                    app.logger.info(f"Cleaned up partial download: {file}")
                except:
                    pass
        except:
            pass
            
        # Send more detailed error message
        error_msg = str(e)
        if 'Connection reset by peer' in error_msg:
            error_msg = "Network connection lost. Please check your internet connection and try again."
        elif 'HTTP Error 403' in error_msg:
            error_msg = "Access denied. The video may be private, age-restricted, or region-blocked."
        elif 'Video unavailable' in error_msg:
            error_msg = "Video is unavailable. It may have been removed or made private."
        elif 'ffmpeg' in error_msg.lower() or 'FFmpeg' in error_msg:
            error_msg = "FFmpeg error. Please ensure FFmpeg is installed for audio downloads."
            
        progress_queue.put({'status': 'error', 'message': error_msg})

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/preview', methods=['POST'])
def preview():
    """Preview video or playlist information without downloading"""
    try:
        # Rate limiting
        client_ip = request.remote_addr
        current_time = time.time()
        
        if client_ip in preview_rate_limit:
            last_request = preview_rate_limit[client_ip]
            if current_time - last_request < PREVIEW_RATE_LIMIT_SECONDS:
                return jsonify({'error': 'Too many requests. Please wait a moment.'}), 429
        
        preview_rate_limit[client_ip] = current_time
        
        data = request.json
        url = data.get('url', '').strip()
        page = data.get('page', 1)
        per_page = 10  # Show 10 items per page
        playlist_limit = data.get('playlist_limit', None)
        
        if not url.startswith(('http://', 'https://')):
            return jsonify({'error': 'Invalid URL'}), 400
        
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': True,  # Don't download, just extract info
        }
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            
            # Check if it's a playlist
            if 'entries' in info and info['entries']:
                # It's a playlist
                all_entries = info['entries']
                total_videos = len(all_entries)
                
                # If playlist_limit is set, only show entries that will be downloaded
                if playlist_limit and isinstance(playlist_limit, int):
                    all_entries = all_entries[:playlist_limit]
                    download_count = min(playlist_limit, total_videos)
                else:
                    download_count = total_videos
                
                # Calculate pagination
                start_idx = (page - 1) * per_page
                end_idx = start_idx + per_page
                page_entries = all_entries[start_idx:end_idx]
                
                entries_info = []
                for i, entry in enumerate(page_entries):
                    if entry:
                        entries_info.append({
                            'index': start_idx + i + 1,
                            'title': entry.get('title', 'Unknown'),
                            'duration': entry.get('duration', 0),
                            'uploader': entry.get('uploader', 'Unknown')
                        })
                
                total_pages = (len(all_entries) + per_page - 1) // per_page
                
                return jsonify({
                    'type': 'playlist',
                    'title': info.get('title', 'Unknown Playlist'),
                    'total_videos': total_videos,
                    'download_count': download_count,
                    'entries': entries_info,
                    'page': page,
                    'total_pages': total_pages,
                    'has_next': page < total_pages,
                    'has_prev': page > 1
                })
            else:
                # Single video
                return jsonify({
                    'type': 'video',
                    'title': info.get('title', 'Unknown'),
                    'artist': info.get('artist', info.get('uploader', 'Unknown')),
                    'album': info.get('album', ''),
                    'duration': info.get('duration', 0),
                    'thumbnail': info.get('thumbnail', ''),
                    'upload_date': info.get('upload_date', '')
                })
                
    except Exception as e:
        app.logger.error(f"Preview error: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/download', methods=['POST'])
def download():
    try:
        data = request.json
        app.logger.debug(f"Received download request: {data}")
        
        url = data.get('url', '').strip()
        format_type = data.get('format', 'video')
        playlist_limit = data.get('playlist_limit', None)  # Default to None (unlimited)
        
        # Validate URL
        if not url.startswith(('http://', 'https://')):
            app.logger.error(f"Invalid URL: {url}")
            return jsonify({'error': 'Invalid URL. Please enter a valid YouTube URL.'}), 400
        
        # Add to queue without directory parameter
        download_id = download_queue.add_to_queue({
            'url': url,
            'format': format_type,
            'playlist_limit': playlist_limit
        })
        
        app.logger.info(f"Download added to queue for URL: {url}")
        return jsonify({'message': 'Download added to queue', 'download_id': download_id})
        
    except Exception as e:
        app.logger.error(f"Error in download endpoint: {str(e)}")
        return jsonify({'error': f'Server error: {str(e)}'}), 500

@app.route('/progress/<download_id>')
def progress(download_id):
    app.logger.info(f"Progress endpoint connected for download: {download_id}")
    
    # Get or create queue for this download
    if download_id not in progress_queues:
        progress_queues[download_id] = queue.Queue()
    progress_queue = progress_queues[download_id]
    
    def generate():
        while True:
            try:
                # Get progress update with shorter timeout for more responsive heartbeats
                progress_data = progress_queue.get(timeout=5)
                yield f"data: {json.dumps(progress_data)}\n\n"
                
                # If download is completed, errored, cancelled, or playlist completed, stop streaming
                if progress_data.get('status') in ['completed', 'error', 'cancelled', 'playlist_completed']:
                    # Clean up queue after completion
                    if download_id in progress_queues:
                        del progress_queues[download_id]
                    # Clean up cancellation flag
                    if download_id in download_cancelled:
                        del download_cancelled[download_id]
                    break
                # Don't break on file_completed, just pass it through
                    
            except queue.Empty:
                # Send heartbeat to keep connection alive
                yield f"data: {json.dumps({'status': 'heartbeat'})}\n\n"
            except Exception as e:
                yield f"data: {json.dumps({'status': 'error', 'message': str(e)})}\n\n"
                # Clean up queue on error
                if download_id in progress_queues:
                    del progress_queues[download_id]
                break
    
    response = Response(stream_with_context(generate()), mimetype='text/event-stream')
    response.headers['Cache-Control'] = 'no-cache'
    response.headers['X-Accel-Buffering'] = 'no'  # Disable Nginx buffering
    return response

@app.route('/download/<download_id>')
def download_file(download_id):
    """Serve the downloaded file(s) to trigger browser download"""
    if download_id not in completed_downloads:
        return jsonify({'error': 'Download not found'}), 404
    
    download_info = completed_downloads[download_id]
    
    # For single files, redirect to the specific file download
    if not download_info.get('is_playlist'):
        return download_single_file(download_id, 0)
    
    # For playlists, create and serve ZIP file
    return download_playlist_zip(download_id)

@app.route('/download/<download_id>/<int:file_index>')
def download_single_file(download_id, file_index):
    """Serve a single downloaded file"""
    if download_id not in completed_downloads:
        return jsonify({'error': 'Download not found'}), 404
    
    download_info = completed_downloads[download_id]
    
    # Handle playlist file
    if download_info.get('is_playlist'):
        if file_index < 0 or file_index >= len(download_info['files']):
            return jsonify({'error': 'Invalid file index'}), 404
            
        file_info = download_info['files'][file_index]
        filepath = file_info['filepath']
        filename = file_info['filename']
        
        if not os.path.exists(filepath):
            return jsonify({'error': 'File not found'}), 404
            
        # Don't clean up individual files from playlists
        return send_file(
            filepath,
            as_attachment=True,
            download_name=filename,
            mimetype='audio/mpeg' if download_info['format'] == 'audio' else 'video/mp4'
        )
    
    # Handle single file (file_index should be 0)
    if file_index != 0:
        return jsonify({'error': 'Invalid file index'}), 404
        
    filepath = download_info['filepath']
    
    if not os.path.exists(filepath):
        return jsonify({'error': 'File not found'}), 404
    
    # Clean up single files after sending
    @after_this_request
    def cleanup(response):
        try:
            os.remove(filepath)
        except Exception as e:
            app.logger.error(f"Error cleaning up file: {e}")
        return response
    
    return send_file(
        filepath,
        as_attachment=True,
        download_name=download_info['filename'],
        mimetype='audio/mpeg' if download_info['format'] == 'audio' else 'video/mp4'
    )

def download_playlist_zip(download_id):
    """Create and serve a ZIP file containing all playlist files"""
    if download_id not in completed_downloads:
        return jsonify({'error': 'Download not found'}), 404
    
    download_info = completed_downloads[download_id]
    
    if not download_info.get('is_playlist'):
        return jsonify({'error': 'Not a playlist download'}), 404
    
    # Create a ZIP file containing all downloaded files
    zip_filename = f"{download_info['playlist_title'].replace(' ', '_')}.zip"
    zip_path = os.path.join(TEMP_DIR, zip_filename)
    
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for file_info in download_info['files']:
            if os.path.exists(file_info['filepath']):
                # Add file to zip with just the filename (not full path)
                zipf.write(file_info['filepath'], file_info['filename'])
    
    # Clean up after sending
    @after_this_request
    def cleanup(response):
        try:
            os.remove(zip_path)
            # Also clean up the individual files
            for file_info in download_info['files']:
                if os.path.exists(file_info['filepath']):
                    os.remove(file_info['filepath'])
        except Exception as e:
            app.logger.error(f"Error cleaning up files: {e}")
        return response
    
    return send_file(
        zip_path,
        as_attachment=True,
        download_name=zip_filename,
        mimetype='application/zip'
    )

@app.route('/download/info/<download_id>')
def get_download_info(download_id):
    """Get information about a completed download"""
    if download_id not in completed_downloads:
        return jsonify({'error': 'Download not found'}), 404
    
    download_info = completed_downloads[download_id]
    
    # Prepare response data
    if download_info.get('is_playlist'):
        files = []
        for idx, file_info in enumerate(download_info['files']):
            files.append({
                'index': idx,
                'filename': file_info['filename'],
                'title': file_info.get('title', 'Unknown'),
                'artist': file_info.get('artist', 'Unknown'),
                'album': file_info.get('album', ''),
                'size': file_info['size'],
                'download_url': f'/download/{download_id}/{idx}'
            })
        
        return jsonify({
            'is_playlist': True,
            'playlist_title': download_info['playlist_title'],
            'files': files,
            'total_size': sum(f['size'] for f in download_info['files']),
            'download_all_url': f'/download/{download_id}'
        })
    else:
        return jsonify({
            'is_playlist': False,
            'filename': download_info['filename'],
            'title': download_info.get('title', 'Unknown'),
            'artist': download_info.get('artist', 'Unknown'),
            'album': download_info.get('album', ''),
            'size': download_info['size'],
            'download_url': f'/download/{download_id}/0'
        })

@app.route('/cancel/<download_id>', methods=['POST'])
def cancel_download(download_id):
    """Cancel an ongoing download"""
    try:
        if download_id in download_cancelled:
            download_cancelled[download_id] = True
            app.logger.info(f"Download cancelled: {download_id}")
            
            # Send cancellation message to progress queue
            if download_id in progress_queues:
                progress_queues[download_id].put({'status': 'cancelled', 'message': 'Download cancelled by user'})
            
            return jsonify({'message': 'Download cancelled successfully'}), 200
        else:
            return jsonify({'error': 'Download not found or already completed'}), 404
            
    except Exception as e:
        app.logger.error(f"Error cancelling download: {str(e)}")
        return jsonify({'error': f'Failed to cancel download: {str(e)}'}), 500

@app.route('/check_ffmpeg')
def check_ffmpeg():
    import shutil
    has_ffmpeg = shutil.which('ffmpeg') is not None
    
    if not has_ffmpeg:
        if sys.platform == 'darwin':
            message = "FFmpeg not found. Install with: brew install ffmpeg"
        elif sys.platform == 'win32':
            message = "FFmpeg not found. Download from https://ffmpeg.org/download.html"
        else:
            message = "FFmpeg not found. Install with: sudo apt-get install ffmpeg"
    else:
        message = "FFmpeg is installed"
    
    return jsonify({'has_ffmpeg': has_ffmpeg, 'message': message})

@app.route('/queue/status')
def queue_status():
    """Get current queue status"""
    return jsonify(download_queue.get_queue_status())

@app.route('/queue/pause/<download_id>', methods=['POST'])
def pause_download_queue(download_id):
    """Pause a download"""
    success = download_queue.pause_download(download_id)
    if success:
        return jsonify({'message': 'Download paused', 'download_id': download_id})
    else:
        return jsonify({'error': 'Download not found or not active'}), 404

@app.route('/queue/resume/<download_id>', methods=['POST'])
def resume_download_queue(download_id):
    """Resume a paused download"""
    success = download_queue.resume_download(download_id)
    if success:
        return jsonify({'message': 'Download resumed', 'download_id': download_id})
    else:
        return jsonify({'error': 'Download not found or not paused'}), 404

@app.route('/queue/cancel/<download_id>', methods=['POST'])
def cancel_download_queue(download_id):
    """Cancel a download"""
    success = download_queue.cancel_download(download_id)
    if success:
        return jsonify({'message': 'Download cancelled', 'download_id': download_id})
    else:
        return jsonify({'error': 'Download not found'}), 404

@app.route('/queue/history')
def download_history():
    """Get download history from database"""
    try:
        conn = sqlite3.connect('downloads.db')
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT id, url, title, artist, format, file_size, status, 
                   error_message, created_at, completed_at
            FROM download_history
            ORDER BY created_at DESC
            LIMIT 100
        ''')
        
        history = []
        for row in cursor.fetchall():
            history.append(dict(row))
        
        conn.close()
        return jsonify({'history': history})
        
    except Exception as e:
        app.logger.error(f"Error fetching history: {e}")
        return jsonify({'error': 'Failed to fetch history'}), 500

@app.route('/queue/redownload/<download_id>', methods=['POST'])
def redownload_from_history(download_id):
    """Re-download a file from history"""
    try:
        conn = sqlite3.connect('downloads.db')
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT url, format
            FROM download_history
            WHERE id = ?
        ''', (download_id,))
        
        row = cursor.fetchone()
        conn.close()
        
        if row:
            # Add to queue
            new_download_id = download_queue.add_to_queue({
                'url': row['url'],
                'format': row['format']
            })
            
            return jsonify({
                'message': 'Re-download added to queue',
                'download_id': new_download_id,
                'original_id': download_id
            })
        else:
            return jsonify({'error': 'Download not found in history'}), 404
            
    except Exception as e:
        app.logger.error(f"Error re-downloading: {e}")
        return jsonify({'error': 'Failed to re-download'}), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=8080, threaded=True)