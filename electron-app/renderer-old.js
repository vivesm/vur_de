// Global variables
let currentFormat = 'audio';
let isDownloading = false;
let currentVideoInfo = null;

// Initialize the app
document.addEventListener('DOMContentLoaded', async () => {
    // Check if yt-dlp is installed
    const ytdlpCheck = await window.electronAPI.checkYtDlp();
    if (!ytdlpCheck.installed) {
        document.getElementById('ytdlp-warning').style.display = 'block';
        document.getElementById('download-btn').disabled = true;
        return;
    }

    // Load settings
    await loadSettings();

    // Set up event listeners
    setupEventListeners();

    // Focus on URL input
    document.getElementById('url-input').focus();
});

// Set up event listeners
function setupEventListeners() {
    // URL input change
    const urlInput = document.getElementById('url-input');
    urlInput.addEventListener('input', debounce(handleUrlChange, 500));

    // Enter key to download
    urlInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !isDownloading) {
            startDownload();
        }
    });

    // Listen for download progress
    window.electronAPI.onDownloadProgress(handleDownloadProgress);
    window.electronAPI.onDownloadError(handleDownloadError);
    window.electronAPI.onDownloadInfo(handleDownloadInfo);
    
    // Listen for preferences shortcut
    window.electronAPI.onShowPreferences(() => {
        toggleSettings();
    });
}

// Paste from clipboard
async function pasteFromClipboard() {
    try {
        const text = await navigator.clipboard.readText();
        document.getElementById('url-input').value = text;
        handleUrlChange();
    } catch (err) {
        console.error('Failed to read clipboard:', err);
    }
}

// Handle URL change
async function handleUrlChange() {
    const url = document.getElementById('url-input').value.trim();
    
    if (!url) {
        hidePreview();
        return;
    }

    // Basic YouTube URL validation
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be|music\.youtube\.com)\/.+/;
    if (!youtubeRegex.test(url)) {
        hidePreview();
        return;
    }

    // Show loading
    showPreviewLoading();

    try {
        // Get video info
        const videoInfo = await window.electronAPI.getVideoInfo(url);
        currentVideoInfo = videoInfo;
        showPreview(videoInfo);
    } catch (error) {
        console.error('Failed to get video info:', error);
        hidePreview();
        showError('Failed to get video information. Please check the URL.');
    }
}

// Show preview loading
function showPreviewLoading() {
    const container = document.getElementById('preview-container');
    const loading = document.getElementById('preview-loading');
    const content = document.getElementById('preview-content');
    
    container.style.display = 'block';
    loading.style.display = 'block';
    content.style.display = 'none';
}

// Show preview
function showPreview(videoInfo) {
    const container = document.getElementById('preview-container');
    const loading = document.getElementById('preview-loading');
    const content = document.getElementById('preview-content');
    
    loading.style.display = 'none';
    content.style.display = 'block';
    
    // Format duration
    const duration = formatDuration(videoInfo.duration);
    
    content.innerHTML = `
        <div class="video-preview">
            ${videoInfo.thumbnail ? `
                <div class="preview-thumbnail">
                    <img src="${videoInfo.thumbnail}" alt="Thumbnail">
                    <div class="duration-badge">${duration}</div>
                </div>
            ` : ''}
            <div class="preview-details">
                <h4>${videoInfo.title}</h4>
                <p class="preview-channel">${videoInfo.uploader || 'Unknown Channel'}</p>
                ${videoInfo.view_count ? `<p class="preview-views">${formatNumber(videoInfo.view_count)} views</p>` : ''}
            </div>
        </div>
    `;
}

// Hide preview
function hidePreview() {
    document.getElementById('preview-container').style.display = 'none';
}

// Format duration
function formatDuration(seconds) {
    if (!seconds) return '';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

// Format number
function formatNumber(num) {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
}

// Select format
function selectFormat(format) {
    currentFormat = format;
    document.querySelectorAll('.format-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.format === format);
    });
}

// Start download
async function startDownload() {
    const url = document.getElementById('url-input').value.trim();
    
    if (!url) {
        showError('Please enter a YouTube URL');
        return;
    }

    if (isDownloading) {
        showError('A download is already in progress');
        return;
    }

    isDownloading = true;
    showProgress();
    hideError();

    const downloadBtn = document.getElementById('download-btn');
    downloadBtn.disabled = true;
    downloadBtn.querySelector('span').textContent = 'Downloading...';

    try {
        const settings = await window.electronAPI.getSettings();
        const quality = currentFormat === 'audio' ? settings.audioQuality : settings.videoQuality;
        
        await window.electronAPI.downloadMedia({
            url,
            format: currentFormat,
            quality,
            playlistLimit: null // TODO: Add playlist support
        });
    } catch (error) {
        console.error('Download error:', error);
        showError('Download failed: ' + error.message);
        resetDownloadButton();
    }
}

// Cancel download
async function cancelDownload() {
    try {
        await window.electronAPI.cancelDownload();
        resetDownloadButton();
        hideProgress();
        showError('Download cancelled');
    } catch (error) {
        console.error('Failed to cancel download:', error);
    }
}

// Show progress
function showProgress() {
    document.getElementById('progress-container').style.display = 'block';
    document.querySelector('.cancel-btn').style.display = 'inline-block';
    document.getElementById('progress-fill').style.width = '0%';
    document.getElementById('progress-percentage').textContent = '0%';
    document.getElementById('status-text').textContent = 'Starting download...';
}

// Hide progress
function hideProgress() {
    document.getElementById('progress-container').style.display = 'none';
}

// Handle download progress
function handleDownloadProgress(data) {
    const { percent, status, output } = data;
    
    if (status === 'downloading' && percent) {
        document.getElementById('progress-fill').style.width = percent + '%';
        document.getElementById('progress-percentage').textContent = Math.round(percent) + '%';
        document.getElementById('status-text').textContent = 'Downloading...';
        
        // Parse speed from output
        const speedMatch = output.match(/at\s+([\d.]+\w+\/s)/);
        if (speedMatch) {
            document.getElementById('progress-speed').textContent = speedMatch[1];
        }
    } else if (status === 'completed') {
        document.getElementById('progress-fill').style.width = '100%';
        document.getElementById('progress-percentage').textContent = '100%';
        document.getElementById('status-text').textContent = 'Download completed!';
        document.getElementById('progress-speed').textContent = '';
        
        // Show success message
        setTimeout(() => {
            hideProgress();
            showSuccess('Download completed successfully!');
            resetDownloadButton();
        }, 1000);
    }
}

// Handle download error
function handleDownloadError(error) {
    showError('Download error: ' + error);
    resetDownloadButton();
    hideProgress();
}

// Handle download info
function handleDownloadInfo(info) {
    if (info.filename) {
        document.getElementById('status-text').textContent = 'Saving: ' + info.filename.split('/').pop();
    }
}

// Reset download button
function resetDownloadButton() {
    isDownloading = false;
    const downloadBtn = document.getElementById('download-btn');
    downloadBtn.disabled = false;
    downloadBtn.querySelector('span').textContent = 'Download';
    document.querySelector('.cancel-btn').style.display = 'none';
}

// Show error
function showError(message) {
    const errorContainer = document.getElementById('error-container');
    const errorText = document.getElementById('error-text');
    errorText.textContent = message;
    errorContainer.style.display = 'block';
    errorContainer.classList.add('show');
    
    setTimeout(() => {
        errorContainer.classList.remove('show');
        setTimeout(() => {
            errorContainer.style.display = 'none';
        }, 300);
    }, 5000);
}

// Hide error
function hideError() {
    const errorContainer = document.getElementById('error-container');
    errorContainer.classList.remove('show');
    setTimeout(() => {
        errorContainer.style.display = 'none';
    }, 300);
}

// Show success
function showSuccess(message) {
    // Create success element if it doesn't exist
    let successContainer = document.getElementById('success-container');
    if (!successContainer) {
        successContainer = document.createElement('div');
        successContainer.id = 'success-container';
        successContainer.className = 'success-message';
        successContainer.innerHTML = '<p id="success-text"></p>';
        document.querySelector('.main-content').appendChild(successContainer);
    }
    
    document.getElementById('success-text').textContent = message;
    successContainer.style.display = 'block';
    successContainer.classList.add('show');
    
    setTimeout(() => {
        successContainer.classList.remove('show');
        setTimeout(() => {
            successContainer.style.display = 'none';
        }, 300);
    }, 3000);
}

// Toggle settings
function toggleSettings() {
    const settingsContainer = document.getElementById('settings-container');
    const isVisible = settingsContainer.style.display === 'block';
    settingsContainer.style.display = isVisible ? 'none' : 'block';
    
    if (!isVisible) {
        loadSettings();
    }
}

// Load settings
async function loadSettings() {
    const settings = await window.electronAPI.getSettings();
    
    document.getElementById('download-path').value = settings.downloadPath;
    document.getElementById('audio-quality').value = settings.audioQuality;
    document.getElementById('keep-on-top').checked = settings.keepWindowOnTop;
    document.getElementById('start-minimized').checked = settings.startMinimized;
}

// Save settings
async function saveSettings() {
    const settings = {
        downloadPath: document.getElementById('download-path').value,
        audioQuality: document.getElementById('audio-quality').value,
        keepWindowOnTop: document.getElementById('keep-on-top').checked,
        startMinimized: document.getElementById('start-minimized').checked
    };
    
    await window.electronAPI.updateSettings(settings);
    showSuccess('Settings saved successfully!');
    toggleSettings();
}

// Choose download folder
async function chooseDownloadFolder() {
    const path = await window.electronAPI.chooseDirectory();
    if (path) {
        document.getElementById('download-path').value = path;
    }
}

// Debounce function
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}