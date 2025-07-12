let currentFormat = 'audio';

// Check for yt-dlp on startup
window.electronAPI.checkYtDlp().then(result => {
    if (!result.installed) {
        document.getElementById('error-container').style.display = 'block';
        document.getElementById('error-text').textContent = 'Please install yt-dlp: brew install yt-dlp';
    }
});

function selectFormat(format) {
    currentFormat = format;
    document.querySelectorAll('.format-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.format === format);
    });
}

async function startDownload() {
    const url = document.getElementById('url-input').value.trim();
    if (!url) {
        showError('Please enter a YouTube URL');
        return;
    }

    document.getElementById('progress-container').style.display = 'block';
    document.getElementById('error-container').style.display = 'none';

    try {
        await window.electronAPI.downloadMedia({
            url,
            format: currentFormat,
            quality: '192'
        });
    } catch (error) {
        showError(error.message);
    }
}

function showError(message) {
    document.getElementById('error-container').style.display = 'block';
    document.getElementById('error-text').textContent = message;
}

// Listen for progress updates
window.electronAPI.onDownloadProgress(data => {
    if (data.percent) {
        document.getElementById('progress-fill').style.width = data.percent + '%';
        document.getElementById('status-text').textContent = `Downloading... ${Math.round(data.percent)}%`;
    }
    if (data.status === 'completed') {
        document.getElementById('status-text').textContent = 'Download completed!';
        setTimeout(() => {
            document.getElementById('progress-container').style.display = 'none';
            document.getElementById('url-input').value = '';
        }, 2000);
    }
});

window.electronAPI.onDownloadError(error => {
    showError('Download failed: ' + error);
    document.getElementById('progress-container').style.display = 'none';
});