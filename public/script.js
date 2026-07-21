const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const fileList = document.getElementById('file-list');
const toast = document.getElementById('toast');
const adminBtn = document.getElementById('admin-btn');
const mainPanel = document.querySelector('.main-panel') || document.body;

// Search & Filter Elements
const searchInput = document.getElementById('search-input');
const filterPills = document.querySelectorAll('.filter-pills .pill');
const assetCount = document.getElementById('asset-count');

// Progress Bar Elements
const progressContainer = document.getElementById('progress-container');
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');

// Modal Elements
const loginModal = document.getElementById('login-modal');
const loginForm = document.getElementById('login-form');
const pwdInput = document.getElementById('password-input');
const cancelLogin = document.getElementById('cancel-login');

// Preview Modal Elements
const previewModal = document.getElementById('preview-modal');
const previewTitle = document.getElementById('preview-title');
const previewBody = document.getElementById('preview-body');
const previewDownload = document.getElementById('preview-download');
const previewCopy = document.getElementById('preview-copy');
const closePreview = document.getElementById('close-preview');

let adminPassword = localStorage.getItem('cdn_admin_pwd') || '';
let allFiles = [];
let activeFilter = 'all';
let searchQuery = '';

// Initialize UI state
if (adminPassword) {
  unlockUI();
}

// Admin login toggle
adminBtn.addEventListener('click', () => {
  if (dropZone.classList.contains('hidden')) {
    loginModal.classList.remove('hidden');
    pwdInput.focus();
  } else {
    adminPassword = '';
    localStorage.removeItem('cdn_admin_pwd');
    lockUI();
    showToast('Logged out successfully');
  }
});

cancelLogin.addEventListener('click', () => {
  loginModal.classList.add('hidden');
  pwdInput.value = '';
});

loginForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const pwd = pwdInput.value;
  if (pwd) {
    adminPassword = pwd;
    localStorage.setItem('cdn_admin_pwd', pwd);
    unlockUI();
    loginModal.classList.add('hidden');
    showToast('Admin Mode Unlocked');
  }
});

function unlockUI() {
  dropZone.classList.remove('hidden');
  adminBtn.classList.add('unlocked');
  adminBtn.innerHTML = '<i class="fa-solid fa-lock-open"></i>';
  mainPanel.classList.add('admin-mode');
}

function lockUI() {
  dropZone.classList.add('hidden');
  adminBtn.classList.remove('unlocked');
  adminBtn.innerHTML = '<i class="fa-solid fa-lock"></i>';
  mainPanel.classList.remove('admin-mode');
}

// Search and Filter Listeners
searchInput.addEventListener('input', (e) => {
  searchQuery = e.target.value.toLowerCase().trim();
  renderFiles();
});

filterPills.forEach(pill => {
  pill.addEventListener('click', () => {
    filterPills.forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    activeFilter = pill.dataset.filter;
    renderFiles();
  });
});

// Lightbox Preview Modal Listeners
closePreview.addEventListener('click', () => {
  previewModal.classList.add('hidden');
  previewBody.innerHTML = '';
});

previewModal.addEventListener('click', (e) => {
  if (e.target === previewModal) {
    previewModal.classList.add('hidden');
    previewBody.innerHTML = '';
  }
});

// Fetch & Render Files
fetchFiles();

function fetchFiles() {
  fetch('/api/files')
    .then(res => {
      if (!res.ok) throw new Error('Failed to load files');
      return res.json();
    })
    .then(data => {
      allFiles = data;
      renderFiles();
    })
    .catch(err => console.error(err));
}

function renderFiles() {
  fileList.innerHTML = '';
  
  const filtered = allFiles.filter(file => {
    const nameMatch = file.name.toLowerCase().includes(searchQuery);
    const category = getCategory(file.name);
    const categoryMatch = activeFilter === 'all' || category === activeFilter;
    return nameMatch && categoryMatch;
  });

  assetCount.textContent = filtered.length;

  if (filtered.length === 0) {
    fileList.innerHTML = '<div style="text-align:center;color:var(--text-color);padding:2rem;font-family:var(--font-mono);">No matching assets found.</div>';
    return;
  }

  filtered.forEach(file => {
    const item = document.createElement('div');
    item.className = 'file-item';
    
    const size = (file.size / 1024).toFixed(1) + ' KB';
    const date = new Date(file.lastModified).toLocaleDateString();
    const publicUrl = `${window.location.protocol}//${window.location.host}/${file.name}`;
    
    const category = getCategory(file.name);
    let icon = 'fa-file';
    if (category === 'image') icon = 'fa-image';
    else if (category === 'video') icon = 'fa-video';
    else if (category === 'doc') icon = 'fa-file-lines';
    else if (category === 'archive') icon = 'fa-file-zipper';

    item.innerHTML = `
      <div class="file-info" onclick="openPreview('${file.name}', '${publicUrl}', '${category}')">
        <i class="fa-solid ${icon} file-icon"></i>
        <div class="file-details">
          <span class="file-name" title="${file.name}">${file.name}</span>
          <span class="file-meta">${size} • ${date}</span>
        </div>
      </div>
      <div class="file-actions">
        <button class="btn btn-copy" onclick="event.stopPropagation(); copyToClipboard('${publicUrl}')" title="Copy URL">
          <i class="fa-solid fa-link"></i>
        </button>
        <button class="btn btn-delete" onclick="event.stopPropagation(); deleteFile('${file.name}')" title="Delete">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </div>
    `;
    fileList.appendChild(item);
  });
}

function getCategory(filename) {
  if (filename.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i)) return 'image';
  if (filename.match(/\.(mp4|webm|mov)$/i)) return 'video';
  if (filename.match(/\.(pdf|txt|md|doc|docx|json)$/i)) return 'doc';
  if (filename.match(/\.(zip|tar|gz|rar|7z)$/i)) return 'archive';
  return 'other';
}

function openPreview(name, url, category) {
  previewTitle.textContent = name;
  previewDownload.href = url;
  previewCopy.onclick = () => copyToClipboard(url);

  previewBody.innerHTML = '';
  if (category === 'image') {
    previewBody.innerHTML = `<img src="${url}" alt="${name}">`;
  } else if (category === 'video') {
    previewBody.innerHTML = `<video src="${url}" controls autoplay style="max-width:100%;max-height:55vh;"></video>`;
  } else if (name.endsWith('.pdf')) {
    previewBody.innerHTML = `<iframe src="${url}"></iframe>`;
  } else {
    previewBody.innerHTML = `<div style="padding:2rem;text-align:center;color:var(--text-color);font-family:var(--font-mono);"><i class="fa-solid fa-file" style="font-size:3rem;margin-bottom:1rem;display:block;color:var(--blue-accent);"></i>No inline preview available.<br><span style="font-size:0.85rem;color:var(--text-light);">${name}</span></div>`;
  }

  previewModal.classList.remove('hidden');
}

// Drag & Drop
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
  dropZone.addEventListener(eventName, preventDefaults, false);
  document.body.addEventListener(eventName, preventDefaults, false);
});

function preventDefaults(e) {
  e.preventDefault();
  e.stopPropagation();
}

['dragenter', 'dragover'].forEach(eventName => {
  dropZone.addEventListener(eventName, () => dropZone.classList.add('dragover'), false);
});

['dragleave', 'drop'].forEach(eventName => {
  dropZone.addEventListener(eventName, () => dropZone.classList.remove('dragover'), false);
});

dropZone.addEventListener('drop', (e) => handleFiles(e.dataTransfer.files), false);
dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', function() {
  handleFiles(this.files);
});

function handleFiles(files) {
  if (!adminPassword) return showToast("Admin login required");
  const fileArray = [...files];
  if (fileArray.length === 0) return;

  progressContainer.classList.remove('hidden');
  let completed = 0;

  fileArray.forEach((file) => {
    uploadFileWithProgress(file, (percent) => {
      progressBar.style.width = `${percent}%`;
      progressText.textContent = `Uploading ${file.name} (${percent}%)`;
    }, () => {
      completed++;
      if (completed === fileArray.length) {
        progressContainer.classList.add('hidden');
        progressBar.style.width = '0%';
        showToast(`Uploaded ${fileArray.length} file(s)`);
        fetchFiles();
      }
    });
  });
}

function uploadFileWithProgress(file, onProgress, onComplete) {
  const formData = new FormData();
  formData.append('file', file);

  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/upload', true);
  xhr.setRequestHeader('Authorization', `Bearer ${adminPassword}`);

  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable) {
      const percent = Math.round((e.loaded / e.total) * 100);
      onProgress(percent);
    }
  };

  xhr.onload = () => {
    if (xhr.status === 401) {
      lockUI();
      localStorage.removeItem('cdn_admin_pwd');
      adminPassword = '';
      showToast('Invalid Password');
      progressContainer.classList.add('hidden');
      return;
    }
    if (xhr.status !== 200) {
      showToast('Upload failed');
      progressContainer.classList.add('hidden');
      return;
    }
    onComplete();
  };

  xhr.onerror = () => {
    showToast('Upload error');
    progressContainer.classList.add('hidden');
  };

  xhr.send(formData);
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast('Link copied to clipboard!');
  });
}

window.copyToClipboard = copyToClipboard;
window.openPreview = openPreview;
window.deleteFile = function(fileName) {
  if (!adminPassword) return showToast("Admin login required");
  if (confirm(`Are you sure you want to delete ${fileName}?`)) {
    fetch(`/api/files/${fileName}`, { 
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${adminPassword}`
      }
    })
    .then(res => {
      if (res.status === 401) {
        lockUI();
        localStorage.removeItem('cdn_admin_pwd');
        adminPassword = '';
        throw new Error('Invalid Password');
      }
      if (!res.ok) throw new Error('Failed to delete');
      showToast('File deleted');
      fetchFiles();
    })
    .catch(err => showToast(err.message));
  }
};

let toastTimeout;
function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}
