const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const fileList = document.getElementById('file-list');
const toast = document.getElementById('toast');
const adminBtn = document.getElementById('admin-btn');
const mainPanel = document.querySelector('.main-panel') || document.body;

// Search & Filter Elements
const searchInput = document.getElementById('search-input');
const filterPills = document.querySelectorAll('.filter-pills .pill');
const sortSelect = document.getElementById('sort-select');
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
const submitLogin = document.getElementById('submit-login');

// Preview Modal Elements
const previewModal = document.getElementById('preview-modal');
const previewTitle = document.getElementById('preview-title');
const previewBody = document.getElementById('preview-body');
const previewDownload = document.getElementById('preview-download');
const previewCopy = document.getElementById('preview-copy');
const previewMarkdown = document.getElementById('preview-markdown');
const previewShare = document.getElementById('preview-share');
const closePreview = document.getElementById('close-preview');

const sortCols = document.querySelectorAll('.sort-col');

let adminPassword = localStorage.getItem('cdn_admin_pwd') || '';
let allFiles = [];
let activeFilter = 'all';
let currentSortKey = 'date';
let currentSortDir = 'desc';
let searchQuery = '';

let appConfig = {
  brandName: 'dcron.in',
  brandSub: 'cdn',
  brandTitle: 'Asset Manager & Drop Zone',
  brandSubtitle: 'Public Object Storage & Asset CDN',
  showNavLinks: true,
  shortlinkBaseUrl: ''
};

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1)) + ' ' + sizes[i];
}

// Pseudo-column header sort toggle listeners
sortCols.forEach(col => {
  col.addEventListener('click', () => {
    const key = col.dataset.sort;
    if (currentSortKey === key) {
      currentSortDir = currentSortDir === 'desc' ? 'asc' : 'desc';
    } else {
      currentSortKey = key;
      currentSortDir = (key === 'name') ? 'asc' : 'desc';
    }

    sortCols.forEach(c => {
      c.classList.remove('active');
      const icon = c.querySelector('.sort-icon');
      if (icon) icon.className = 'sort-icon fa-solid fa-sort';
    });

    col.classList.add('active');
    const activeIcon = col.querySelector('.sort-icon');
    if (activeIcon) {
      activeIcon.className = `sort-icon fa-solid ${currentSortDir === 'desc' ? 'fa-arrow-down' : 'fa-arrow-up'}`;
    }

    renderFiles();
  });
});

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

// Immediate auth verification on form submit
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const pwd = pwdInput.value;
  if (!pwd) return;

  if (submitLogin) submitLogin.disabled = true;

  try {
    const res = await fetch('/api/auth/verify', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${pwd}`
      }
    });

    if (res.ok) {
      adminPassword = pwd;
      localStorage.setItem('cdn_admin_pwd', pwd);
      unlockUI();
      loginModal.classList.add('hidden');
      pwdInput.value = '';
      showToast('Admin Mode Unlocked');
    } else {
      pwdInput.style.borderColor = 'var(--accent-red, #ff5c5c)';
      setTimeout(() => { pwdInput.style.borderColor = ''; }, 1500);
      showToast('Invalid password');
      pwdInput.focus();
    }
  } catch (err) {
    showToast('Authentication check failed');
  } finally {
    if (submitLogin) submitLogin.disabled = false;
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

async function initAuth() {
  if (adminPassword) {
    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminPassword}` }
      });
      if (res.ok) {
        unlockUI();
      } else {
        adminPassword = '';
        localStorage.removeItem('cdn_admin_pwd');
        lockUI();
      }
    } catch (e) {
      lockUI();
    }
  }
}

async function loadConfig() {
  try {
    const res = await fetch('/api/config');
    if (res.ok) {
      appConfig = await res.json();
      applyConfig();
    }
  } catch (e) {
    console.error('Failed to load config:', e);
  }
}

function applyConfig() {
  document.title = `${appConfig.brandSub.toUpperCase()} — ${appConfig.brandName}`;
  const logoText = document.getElementById('brand-logo-text');
  if (logoText) {
    logoText.innerHTML = `${appConfig.brandName} <span class="logo__sub">/ ${appConfig.brandSub}</span>`;
  }
  const appHeaderTitle = document.querySelector('.app-header h2');
  if (appHeaderTitle) {
    appHeaderTitle.innerHTML = `<i class="fa-solid fa-hard-drive"></i> ${appConfig.brandTitle}`;
  }
  const appHeaderSubtitle = document.querySelector('.app-header .subtitle');
  if (appHeaderSubtitle) {
    appHeaderSubtitle.textContent = appConfig.brandSubtitle;
  }

  const cloudNavItems = document.querySelectorAll('.cloud-nav-item');
  cloudNavItems.forEach(item => {
    if (appConfig.showNavLinks === false) {
      item.style.display = 'none';
    } else {
      item.style.display = '';
    }
  });
}

// Fetch files from server
async function fetchFiles() {
  try {
    const res = await fetch('/api/files');
    if (!res.ok) throw new Error('Network response was not ok');
    allFiles = await res.json();
    renderFiles();
  } catch (err) {
    console.error('Error fetching files:', err);
    fileList.innerHTML = '<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><p>Failed to load assets</p></div>';
  }
}

function renderFiles() {
  fileList.innerHTML = '';
  
  let filtered = allFiles.filter(file => {
    const matchesFilter = activeFilter === 'all' || getCategory(file.name) === activeFilter;
    const matchesSearch = file.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  // Sort files
  filtered.sort((a, b) => {
    if (currentSortKey === 'name') {
      return currentSortDir === 'asc' 
        ? a.name.localeCompare(b.name) 
        : b.name.localeCompare(a.name);
    } else if (currentSortKey === 'size') {
      return currentSortDir === 'asc' 
        ? a.size - b.size 
        : b.size - a.size;
    } else if (currentSortKey === 'date') {
      return currentSortDir === 'asc' 
        ? new Date(a.lastModified) - new Date(b.lastModified) 
        : new Date(b.lastModified) - new Date(a.lastModified);
    }
    return 0;
  });

  assetCount.textContent = `${filtered.length} ${filtered.length === 1 ? 'file' : 'files'}`;

  if (activeFilter === 'image' || activeFilter === 'video') {
    fileList.classList.add('grid-view');
  } else {
    fileList.classList.remove('grid-view');
  }

  if (filtered.length === 0) {
    fileList.innerHTML = '<div class="empty-state"><i class="fa-solid fa-box-open"></i><p>No assets found</p></div>';
    return;
  }

  filtered.forEach(file => {
    const item = document.createElement('div');
    item.className = 'file-item';
    
    const isImage = getCategory(file.name) === 'image';
    const publicUrl = file.url || `/${file.name}`;
    const shortUrl = file.shortUrl || `/s/${file.shortCode}`;
    const size = formatBytes(file.size);
    const date = new Date(file.lastModified).toLocaleDateString(undefined, { 
      year: 'numeric', month: 'short', day: 'numeric' 
    });

    let iconHtml = '';
    if (isImage) {
      iconHtml = `<div class="file-thumb"><img src="${publicUrl}" alt="${file.name}" loading="lazy"></div>`;
    } else {
      iconHtml = `<div class="file-thumb default-icon">${getFileIcon(file.name)}</div>`;
    }

    item.innerHTML = `
      <div class="file-info">
        ${iconHtml}
        <div class="file-details">
          <span class="file-name" title="${file.name}">${file.name}</span>
          <span class="file-meta">${size} • ${date}</span>
        </div>
      </div>
      <div class="file-actions">
        <a class="btn btn-copy btn-download" href="${publicUrl}" target="_blank" download title="Download" onclick="event.stopPropagation();">
          <i class="fa-solid fa-download"></i>
        </a>
        <button class="btn btn-copy btn-direct" title="Copy Direct URL">
          <i class="fa-solid fa-link"></i>
        </button>
        <button class="btn btn-copy btn-markdown" title="Copy Markdown Snippet">
          <i class="fa-brands fa-markdown"></i>
        </button>
        <button class="btn btn-copy btn-short" title="Copy Shortlink (${shortUrl})">
          <i class="fa-solid fa-share-nodes"></i>
        </button>
        <button class="btn btn-delete" title="Delete">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </div>
    `;

    item.querySelector('.file-info').addEventListener('click', () => {
      openPreview(file);
    });

    const btnDirect = item.querySelector('.btn-direct');
    const btnMarkdown = item.querySelector('.btn-markdown');
    const btnShort = item.querySelector('.btn-short');
    const btnDelete = item.querySelector('.btn-delete');

    btnDirect.addEventListener('click', (e) => {
      e.stopPropagation();
      copyToClipboard(publicUrl, 'Direct URL copied!');
    });

    btnMarkdown.addEventListener('click', (e) => {
      e.stopPropagation();
      copyMarkdown(file.name, publicUrl);
    });

    btnShort.addEventListener('click', (e) => {
      e.stopPropagation();
      copyToClipboard(shortUrl, 'Shortlink copied!');
    });

    btnDelete.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteFile(file.name);
    });

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

function getFileIcon(filename) {
  const extMatch = filename.match(/\.([a-z0-9]+)$/i);
  const ext = extMatch ? extMatch[1].toLowerCase() : '';
  
  switch(ext) {
    case 'pdf': return '<i class="fa-solid fa-file-pdf"></i>';
    case 'doc':
    case 'docx': return '<i class="fa-solid fa-file-word"></i>';
    case 'zip':
    case 'tar':
    case 'gz':
    case 'rar':
    case '7z': return '<i class="fa-solid fa-file-zipper"></i>';
    case 'mp4':
    case 'webm':
    case 'mov': return '<i class="fa-solid fa-file-video"></i>';
    case 'mp3':
    case 'wav':
    case 'flac': return '<i class="fa-solid fa-file-audio"></i>';
    case 'js':
    case 'json':
    case 'html':
    case 'css': return '<i class="fa-solid fa-file-code"></i>';
    default: return '<i class="fa-solid fa-file"></i>';
  }
}

// Search & Filter listeners
searchInput.addEventListener('input', (e) => {
  searchQuery = e.target.value;
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

// Dropzone Drag/Drop
['dragenter', 'dragover'].forEach(eventName => {
  dropZone.addEventListener(eventName, (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  }, false);
});

['dragleave', 'drop'].forEach(eventName => {
  dropZone.addEventListener(eventName, (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
  }, false);
});

dropZone.addEventListener('drop', (e) => {
  const dt = e.dataTransfer;
  const files = dt.files;
  handleFiles(files);
});

dropZone.addEventListener('click', () => {
  fileInput.click();
});

fileInput.addEventListener('change', () => {
  handleFiles(fileInput.files);
});

const btnMobilePaste = document.getElementById('btn-mobile-paste');
if (btnMobilePaste) {
  btnMobilePaste.addEventListener('click', async (e) => {
    e.stopPropagation();
    try {
      const clipboardItems = await navigator.clipboard.read();
      let foundFile = false;
      for (const item of clipboardItems) {
        for (const type of item.types) {
          if (type.startsWith('image/')) {
            const blob = await item.getType(type);
            const ext = type.split('/')[1] || 'png';
            const file = new File([blob], `clipboard-${Date.now()}.${ext}`, { type });
            handleFiles([file]);
            foundFile = true;
            break;
          }
        }
        if (foundFile) break;
      }
      if (!foundFile) {
        showToast('No image found in clipboard');
      }
    } catch (err) {
      showToast('Clipboard access denied or unavailable');
    }
  });
}

function handleFiles(files) {
  if (files.length === 0) return;
  if (!adminPassword) {
    loginModal.classList.remove('hidden');
    pwdInput.focus();
    return;
  }

  const uploadQueue = Array.from(files);
  let completed = 0;

  progressContainer.classList.remove('hidden');
  progressBar.style.width = '0%';
  progressText.textContent = `Uploading 0/${uploadQueue.length}...`;

  function uploadNext() {
    if (uploadQueue.length === 0) {
      setTimeout(() => {
        progressContainer.classList.add('hidden');
        fetchFiles();
        showToast('Upload Complete!');
      }, 500);
      return;
    }

    const currentFile = uploadQueue.shift();
    uploadFileWithProgress(currentFile, (percent) => {
      const overallPercent = Math.round(((completed + (percent / 100)) / (completed + uploadQueue.length + 1)) * 100);
      progressBar.style.width = `${overallPercent}%`;
      progressText.textContent = `Uploading (${completed + 1}/${completed + uploadQueue.length + 1}) ${overallPercent}%`;
    }, (success) => {
      if (success) completed++;
      uploadNext();
    });
  }

  uploadNext();
}

function uploadFileWithProgress(file, onProgress, onComplete) {
  const formData = new FormData();
  formData.append('file', file);
  const folderInput = document.getElementById('upload-folder');
  if (folderInput && folderInput.value.trim()) {
    formData.append('folder', folderInput.value.trim());
  }

  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/upload', true);
  xhr.setRequestHeader('Authorization', `Bearer ${adminPassword}`);

  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable) {
      const percentComplete = (e.loaded / e.total) * 100;
      onProgress(percentComplete);
    }
  };

  xhr.onload = () => {
    if (xhr.status === 200) {
      try {
        const res = JSON.parse(xhr.responseText);
        if (res.shortUrl) {
          copyToClipboard(res.shortUrl, 'Shortlink copied to clipboard!');
        }
      } catch(e){}
      onComplete(true);
    } else if (xhr.status === 401) {
      lockUI();
      localStorage.removeItem('cdn_admin_pwd');
      showToast('Invalid Password. Logged out.');
      onComplete(false);
    } else {
      showToast(`Upload Failed for ${file.name}`);
      onComplete(false);
    }
  };

  xhr.onerror = () => {
    showToast(`Network Error uploading ${file.name}`);
    onComplete(false);
  };

  xhr.send(formData);
}

// Delete file
async function deleteFile(filename) {
  if (!confirm(`Are you sure you want to delete "${filename}"?`)) return;
  if (!adminPassword) {
    showToast('Unauthorized');
    return;
  }

  try {
    const res = await fetch(`/api/files/${encodeURIComponent(filename)}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${adminPassword}`
      }
    });

    if (res.ok) {
      showToast(`Deleted ${filename}`);
      fetchFiles();
    } else if (res.status === 401) {
      lockUI();
      localStorage.removeItem('cdn_admin_pwd');
      showToast('Invalid Password. Logged out.');
    } else {
      showToast('Delete failed');
    }
  } catch (err) {
    console.error('Error deleting file:', err);
    showToast('Error deleting file');
  }
}

// Preview Modal Logic
function openPreview(file) {
  const publicUrl = file.url || `/${file.name}`;
  const shortUrl = file.shortUrl || `/s/${file.shortCode}`;
  const category = getCategory(file.name);

  previewTitle.textContent = file.name;
  previewBody.innerHTML = '';

  if (category === 'image') {
    previewBody.innerHTML = `<img src="${publicUrl}" alt="${file.name}">`;
  } else if (category === 'video') {
    previewBody.innerHTML = `<video src="${publicUrl}" controls autoplay></video>`;
  } else {
    previewBody.innerHTML = `
      <div class="generic-preview">
        ${getFileIcon(file.name)}
        <p>${file.name}</p>
        <span>${formatBytes(file.size)}</span>
      </div>
    `;
  }

  previewDownload.href = publicUrl;
  previewCopy.onclick = () => copyToClipboard(publicUrl, 'Direct URL copied!');
  if (previewMarkdown) {
    previewMarkdown.onclick = () => copyMarkdown(file.name, publicUrl);
  }
  previewShare.onclick = () => copyToClipboard(shortUrl, 'Shortlink copied!');

  previewModal.classList.remove('hidden');
}

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

// Clipboard Helper with Fallback
function copyToClipboard(text, successMsg = 'Link copied to clipboard!') {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      showToast(successMsg);
    }).catch(() => {
      fallbackCopy(text, successMsg);
    });
  } else {
    fallbackCopy(text, successMsg);
  }
}

function fallbackCopy(text, successMsg) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    document.execCommand('copy');
    showToast(successMsg);
  } catch (err) {
    showToast('Failed to copy text');
  }
  document.body.removeChild(textarea);
}

function copyMarkdown(filename, url) {
  const cat = getCategory(filename);
  const isImg = cat === 'image';
  const safeUrl = encodeURI(decodeURI(url)).replace(/\(/g, '%28').replace(/\)/g, '%29');
  const cleanName = filename.replace(/\[/g, '\\[').replace(/\]/g, '\\]');
  const snippet = isImg ? `![${cleanName}](${safeUrl})` : `[${cleanName}](${safeUrl})`;
  copyToClipboard(snippet, `Copied Markdown: ${snippet}`);
}

window.copyToClipboard = copyToClipboard;
window.copyMarkdown = copyMarkdown;

let toastTimeout;
function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

// Paste to upload support
document.addEventListener('paste', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
    return;
  }
  
  const items = (e.clipboardData || window.clipboardData).items;
  const files = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.kind === 'file') {
      const file = item.getAsFile();
      if (file) {
        if (file.type.startsWith('image/')) {
          const ext = file.type.split('/')[1] || 'png';
          const newName = `clipboard-${Date.now()}.${ext}`;
          const renamedFile = new File([file], newName, { type: file.type });
          files.push(renamedFile);
        } else {
          files.push(file);
        }
      }
    }
  }
  
  if (files.length > 0) {
    e.preventDefault();
    handleFiles(files);
  }
});

// App Startup
loadConfig();
initAuth();
fetchFiles();
