// Renderer process JavaScript

// State management
let currentFormat = 'audio';
let isDownloading = false;
let currentDownloadId = null;
let activeDownloads = new Map();
let queuePollingInterval = null;
let isShuffled = false;

// Theme management
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcon(newTheme);
    
    // Save to electron store
    window.electronAPI.updateSettings({ theme: newTheme });
}

function updateThemeIcon(theme) {
    const sunIcon = document.querySelector('.sun-icon');
    const moonIcon = document.querySelector('.moon-icon');
    
    if (theme === 'dark') {
        sunIcon.style.display = 'none';
        moonIcon.style.display = 'block';
    } else {
        sunIcon.style.display = 'block';
        moonIcon.style.display = 'none';
    }
}

// Queue sidebar management
let queueSidebarOpen = false;

function toggleQueueSidebar() {
    const sidebar = document.getElementById('queue-sidebar');
    queueSidebarOpen = !queueSidebarOpen;
    
    if (queueSidebarOpen) {
        sidebar.classList.add('open');
        startQueuePolling();
    } else {
        sidebar.classList.remove('open');
        stopQueuePolling();
    }
}

function startQueuePolling() {
    updateQueueStatus();
    queuePollingInterval = setInterval(updateQueueStatus, 2000);
}

function stopQueuePolling() {
    if (queuePollingInterval) {
        clearInterval(queuePollingInterval);
        queuePollingInterval = null;
    }
}

async function updateQueueStatus() {
    try {
        const status = await window.electronAPI.getQueueStatus();
        
        // Update counts
        document.getElementById('active-count').textContent = status.active.length;
        document.getElementById('pending-count').textContent = status.pending.length;
        document.getElementById('completed-count').textContent = status.completed.length;
        
        // Update badge
        const totalActive = status.active.length + status.pending.length;
        const badge = document.getElementById('queue-badge');
        if (totalActive > 0) {
            badge.textContent = totalActive;
            badge.style.display = 'block';
        } else {
            badge.style.display = 'none';
        }
        
        // Update queue sections
        updateQueueSection('active-downloads', status.active, 'active');
        updateQueueSection('pending-downloads', status.pending, 'pending');
        updateQueueSection('completed-downloads', status.completed, 'completed');
        
    } catch (error) {
        console.error('Error updating queue status:', error);
    }
}

function updateQueueSection(containerId, items, type) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    
    if (items.length === 0) {
        container.innerHTML = '<div class="queue-empty">No downloads</div>';
        return;
    }
    
    items.forEach(item => {
        container.appendChild(createQueueItem(item, type));
    });
}

function createQueueItem(item, type) {
    const template = document.getElementById('queue-item-template');
    const clone = template.content.cloneNode(true);

    const title = item.title || 'Unknown Title';
    const progress = item.progress || 0;

    clone.querySelector('.queue-item').id = `queue-item-${item.id}`;
    clone.querySelector('.queue-item-title').textContent = title;
    clone.querySelector('.queue-progress-fill').style.width = `${progress}%`;
    clone.querySelector('.queue-progress-text').textContent = `${progress}%`;

    const cancelButton = clone.querySelector('.cancel');
    if (type === 'active' || type === 'pending') {
        cancelButton.onclick = () => cancelQueueDownload(item.id);
    } else {
        cancelButton.onclick = () => removeHistoryItem(item.id);
    }

    if (type !== 'active') {
        clone.querySelector('.queue-item-progress').style.display = 'none';
    }

    return clone;
}

// Queue operations
async function pauseDownload(downloadId) {
    try {
        await window.electronAPI.pauseDownload(downloadId);
        updateQueueStatus();
    } catch (error) {
        console.error('Error pausing download:', error);
    }
}

async function resumeDownload(downloadId) {
    try {
        await window.electronAPI.resumeDownload(downloadId);
        updateQueueStatus();
    } catch (error) {
        console.error('Error resuming download:', error);
    }
}

async function cancelQueueDownload(downloadId) {
    try {
        await window.electronAPI.cancelDownload(downloadId);
        updateQueueStatus();
    } catch (error) {
        console.error('Error cancelling download:', error);
    }
}

async function removeHistoryItem(downloadId) {
    try {
        await window.electronAPI.removeDownloadHistory(downloadId);
        updateQueueStatus();
    } catch (error) {
        console.error('Error removing download from history:', error);
    }
}

// Preview functionality
let previewTimeout;
let fullPlaylistEntries = [];
let displayedPlaylistEntries = [];
let originalOrderEntries = [];

async function handleUrlInput() {
    const url = document.getElementById('url-input').value.trim();
    const clearBtn = document.getElementById('clear-btn');
    const playlistOptions = document.getElementById('playlist-options');
    
    clearBtn.style.display = url ? 'block' : 'none';
    
    clearTimeout(previewTimeout);
    
    if (!url) {
        hidePreview();
        playlistOptions.style.display = 'none';
        return;
    }
    
    if (url.includes('youtu.be')) {
        selectFormat('video');
    }
    
    if (url.includes('playlist') || url.includes('list=')) {
        playlistOptions.style.display = 'block';
    } else {
        playlistOptions.style.display = 'none';
    }
    
    previewTimeout = setTimeout(() => {
        if (url.startsWith('http://') || url.startsWith('https://')) {
            getAndRenderPreview(url);
        }
    }, 800);
}

async function getAndRenderPreview(url) {
    const previewSection = document.getElementById('preview-section');
    const previewLoading = document.getElementById('preview-loading');
    const previewContent = document.getElementById('preview-content');
    const playlistLimitInput = document.getElementById('playlist-limit');
    const playlistLimit = playlistLimitInput.value ? parseInt(playlistLimitInput.value) : null;

    previewSection.style.display = 'block';
    previewLoading.style.display = 'block';
    previewContent.style.display = 'none';
    
    try {
        const info = await window.electronAPI.getPreviewInfo(url, playlistLimit);
        
        previewLoading.style.display = 'none';
        previewContent.style.display = 'block';
        
        if (info.type === 'playlist') {
            fullPlaylistEntries = info.entries;
            // When we get a new playlist, reset the displayed entries
            updateDisplayedPlaylist();
        } else {
            fullPlaylistEntries = [];
            displayedPlaylistEntries = [];
            originalOrderEntries = [];
            previewContent.innerHTML = `
                <div class="preview-video">
                    <div class="preview-thumbnail">
                        <img src="${info.thumbnail}" alt="Thumbnail">
                    </div>
                    <div class="preview-details">
                        <h3>${info.title}</h3>
                        <p class="preview-channel">${info.channel}</p>
                        <p class="preview-info">${formatDuration(info.duration)} • ${formatViews(info.views)} views</p>
                    </div>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error getting preview:', error);
        previewLoading.style.display = 'none';
        previewContent.style.display = 'block';
        previewContent.innerHTML = '<p class="preview-error">Failed to load preview. The playlist might be private or unavailable.</p>';
    }
}

function updateDisplayedPlaylist() {
    const playlistLimitInput = document.getElementById('playlist-limit');
    let limit = playlistLimitInput.value ? parseInt(playlistLimitInput.value) : fullPlaylistEntries.length;
    limit = Math.min(limit, fullPlaylistEntries.length);

    originalOrderEntries = fullPlaylistEntries.slice(0, limit);
    displayedPlaylistEntries = [...originalOrderEntries];
    
    applyShuffle();
    renderPlaylistPreview();
}

function toggleShuffle() {
    isShuffled = document.getElementById('playlist-shuffle').checked;
    applyShuffle();
    renderPlaylistPreview();
}

function applyShuffle() {
    if (isShuffled) {
        // Fisher-Yates shuffle
        for (let i = displayedPlaylistEntries.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [displayedPlaylistEntries[i], displayedPlaylistEntries[j]] = [displayedPlaylistEntries[j], displayedPlaylistEntries[i]];
        }
    } else {
        displayedPlaylistEntries = [...originalOrderEntries];
    }
}

function replacePlaylistItem(index) {
    const availableEntries = fullPlaylistEntries.filter(fullEntry => 
        !displayedPlaylistEntries.some(displayedEntry => displayedEntry.id === fullEntry.id)
    );

    if (availableEntries.length > 0) {
        const randomIndex = Math.floor(Math.random() * availableEntries.length);
        const newItem = availableEntries[randomIndex];
        
        // Update the original order as well to maintain consistency when un-shuffling
        const oldItemId = displayedPlaylistEntries[index].id;
        const originalIndex = originalOrderEntries.findIndex(item => item.id === oldItemId);
        if(originalIndex !== -1) {
            originalOrderEntries[originalIndex] = newItem;
        }

        displayedPlaylistEntries[index] = newItem;
        renderPlaylistPreview();
    } else {
        showError("No more unique songs in the playlist to replace with.");
    }
}

function renderPlaylistPreview() {
    const previewContent = document.getElementById('preview-content');
    if (fullPlaylistEntries.length === 0) {
        previewContent.innerHTML = '';
        return;
    }

    const playlistTitle = fullPlaylistEntries[0].playlist_title || 'Playlist';
    const totalCount = fullPlaylistEntries.length;

    const itemsHtml = displayedPlaylistEntries.map((entry, index) => `
        <div class="preview-video-item" id="preview-item-${entry.id}">
            <div class="video-info">
                <div class="video-title" title="${entry.title}">${entry.title}</div>
                <div class="video-meta">${entry.uploader} • ${formatDuration(entry.duration)}</div>
            </div>
            <button class="replace-item-btn" onclick="replacePlaylistItem(${index})" title="Replace with another song">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M12 4L4 12M4 4L12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
            </button>
        </div>
    `).join('');

    previewContent.innerHTML = `
        <div class="preview-playlist">
            <h3>${playlistTitle}</h3>
            <p class="preview-count">${totalCount} videos in playlist</p>
            <div class="preview-videos">
                ${itemsHtml}
            </div>
            ${displayedPlaylistEntries.length < totalCount ? `<p class="preview-more">Showing ${displayedPlaylistEntries.length} of ${totalCount}</p>` : ''}
        </div>
    `;
}


function hidePreview() {
    document.getElementById('preview-section').style.display = 'none';
}

function formatDuration(seconds) {
    if (seconds === null || seconds === undefined) return 'N/A';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return [
        h > 0 ? h : null,
        m.toString().padStart(2, '0'),
        s.toString().padStart(2, '0')
    ].filter(Boolean).join(':');
}

function formatViews(views) {
    if (!views) return '0';
    if (views >= 1000000) return `${(views / 1000000).toFixed(1)}M`;
    if (views >= 1000) return `${(views / 1000).toFixed(0)}K`;
    return views.toString();
}

// Format selection
function selectFormat(format) {
    currentFormat = format;
    document.querySelectorAll('.format-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.format === format);
    });
}

// Clipboard functionality
async function pasteFromClipboard() {
    try {
        const text = await navigator.clipboard.readText();
        document.getElementById('url-input').value = text;
        handleUrlInput();
    } catch (err) {
        console.error('Failed to read clipboard:', err);
    }
}

function clearInput() {
    document.getElementById('url-input').value = '';
    handleUrlInput();
}

// Download functionality
async function startDownload() {
    const urlInput = document.getElementById('url-input');
    const url = urlInput.value.trim();
    
    if (!url) {
        showError('Please enter a YouTube URL');
        return;
    }
    
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        showError('Please enter a valid URL');
        return;
    }
    
    const playlistLimit = document.getElementById('playlist-limit').value;
    
    try {
        hideError();
        
        const result = await window.electronAPI.downloadMedia({
            url,
            format: currentFormat,
            quality: currentFormat === 'audio' ? document.getElementById('audio-quality').value : 'best',
            playlistLimit: playlistLimit ? parseInt(playlistLimit) : null,
            // Pass the currently displayed (and possibly shuffled/replaced) items
            playlistItems: displayedPlaylistEntries.length > 0 ? displayedPlaylistEntries.map(e => e.id) : null
        });
        
        if (result.success) {
            currentDownloadId = result.downloadId;
            urlInput.value = '';
            handleUrlInput();
            showSuccess('Download added to queue');
            updateQueueStatus();
        }
    } catch (error) {
        showError(error.message || 'Failed to start download');
    }
}

function cancelCurrentDownload() {
    if (currentDownloadId && activeDownloads.has(currentDownloadId)) {
        cancelQueueDownload(currentDownloadId);
    }
}

// Error/success messages
function showError(message) {
    const errorDiv = document.getElementById('error-message');
    const errorText = document.getElementById('error-text');
    errorText.textContent = message;
    errorDiv.style.display = 'flex';
    
    setTimeout(() => {
        errorDiv.style.display = 'none';
    }, 5000);
}

function hideError() {
    document.getElementById('error-message').style.display = 'none';
}

function showSuccess(message) {
    // Could add a success message UI element similar to error
    console.log('Success:', message);
}

// Settings management
async function openSettings() {
    const modal = document.getElementById('settings-modal');
    const settings = await window.electronAPI.getSettings();
    
    document.getElementById('download-path').value = settings.downloadPath;
    document.getElementById('audio-quality').value = settings.audioQuality;
    document.getElementById('keep-window-on-top').checked = settings.keepWindowOnTop;
    document.getElementById('start-minimized').checked = settings.startMinimized;
    
    modal.style.display = 'flex';
}

function closeSettings() {
    document.getElementById('settings-modal').style.display = 'none';
}

async function saveSettings() {
    const settings = {
        downloadPath: document.getElementById('download-path').value,
        audioQuality: document.getElementById('audio-quality').value,
        keepWindowOnTop: document.getElementById('keep-window-on-top').checked,
        startMinimized: document.getElementById('start-minimized').checked
    };
    
    await window.electronAPI.updateSettings(settings);
    closeSettings();
}

async function chooseDirectory() {
    const path = await window.electronAPI.chooseDirectory();
    if (path) {
        document.getElementById('download-path').value = path;
    }
}

async function openDownloadFolder() {
    await window.electronAPI.openDownloadFolder();
}

// History management
async function showHistory() {
    const modal = document.getElementById('history-modal');
    const historyList = document.getElementById('history-list');
    
    try {
        const history = await window.electronAPI.getDownloadHistory();
        
        if (history.length === 0) {
            historyList.innerHTML = '<p class="history-empty">No download history</p>';
        } else {
            historyList.innerHTML = history.map(item => `
                <div class="history-item">
                    <div class="history-item-header">
                        <h4>${item.title || 'Unknown'}</h4>
                        <span class="history-status status-${item.status}">${item.status}</span>
                    </div>
                    <div class="history-item-info">
                        <span>${item.format.toUpperCase()}</span>
                        <span>${new Date(item.created_at).toLocaleDateString()}</span>
                        ${item.file_size ? `<span>${(item.file_size / 1024 / 1024).toFixed(2)} MB</span>` : ''}
                    </div>
                    ${item.error_message ? `<div class="history-error">${item.error_message}</div>` : ''}
                </div>
            `).join('');
        }
        
        modal.style.display = 'flex';
    } catch (error) {
        console.error('Error loading history:', error);
    }
}

function closeHistory() {
    document.getElementById('history-modal').style.display = 'none';
}

// Event listeners for download progress
window.electronAPI.onDownloadStarted((data) => {
    activeDownloads.set(data.id, data);
    
    if (data.id === currentDownloadId) {
        const progressSection = document.getElementById('progress-section');
        const progressTitle = document.getElementById('progress-title');
        
        progressSection.style.display = 'block';
        progressTitle.textContent = data.isPlaylist ? 
            `Downloading playlist: ${data.title}` : 
            `Downloading: ${data.title}`;
    }
    
    updateQueueStatus();
});

window.electronAPI.onDownloadProgress((data) => {
    if (data.id === currentDownloadId) {
        const progressFill = document.getElementById('progress-fill');
        const progressPercent = document.getElementById('progress-percent');
        const progressSpeed = document.getElementById('progress-speed');
        const progressEta = document.getElementById('progress-eta');
        const progressDetails = document.getElementById('progress-details');
        
        progressFill.style.width = `${data.percent}%`;
        progressPercent.textContent = `${Math.round(data.percent)}%`;
        progressSpeed.textContent = data.speed || '-';
        progressEta.textContent = data.eta || '-';
        
        if (data.currentVideo && data.totalVideos) {
            progressDetails.textContent = `Video ${data.currentVideo} of ${data.totalVideos}`;
        }
    }
    
    // Update queue if sidebar is open
    if (queueSidebarOpen) {
        updateQueueStatus();
    }
});

window.electronAPI.onDownloadCompleted((data) => {
    activeDownloads.delete(data.id);
    
    if (data.id === currentDownloadId) {
        document.getElementById('progress-section').style.display = 'none';
        showSuccess(`Download completed: ${data.title}`);
        currentDownloadId = null;
    }
    
    updateQueueStatus();
});

window.electronAPI.onDownloadError((data) => {
    activeDownloads.delete(data.id);
    
    if (data.id === currentDownloadId) {
        document.getElementById('progress-section').style.display = 'none';
        showError(data.error || 'Download failed');
        currentDownloadId = null;
    }
    
    updateQueueStatus();
});

// Initialize app
async function init() {
    initTheme();
    
    const ytdlpCheck = await window.electronAPI.checkYtDlp();
    if (!ytdlpCheck.installed) {
        showError('yt-dlp is not installed. Please install yt-dlp to use this app.');
    }
    
    document.getElementById('url-input').addEventListener('input', handleUrlInput);
    document.getElementById('playlist-limit').addEventListener('input', updateDisplayedPlaylist);
    document.getElementById('playlist-shuffle').addEventListener('change', toggleShuffle);
    
    updateQueueStatus();
    
    window.electronAPI.onShowPreferences(() => {
        openSettings();
    });
    
    setInterval(updateQueueStatus, 5000);
}

// Start the app
init();