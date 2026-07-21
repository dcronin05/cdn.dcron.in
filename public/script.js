const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const fileList = document.getElementById('file-list');
const toast = document.getElementById('toast');
const adminBtn = document.getElementById('admin-btn');
const glassPanel = document.querySelector('.glass-panel');

// Modal Elements
const loginModal = document.getElementById('login-modal');
const loginForm = document.getElementById('login-form');
const pwdInput = document.getElementById('password-input');
const cancelLogin = document.getElementById('cancel-login');

let adminPassword = localStorage.getItem('cdn_admin_pwd') || '';

// Initialize UI state based on saved password
if (adminPassword) {
  unlockUI();
}

// Admin login prompt
adminBtn.addEventListener('click', () => {
  if (dropZone.classList.contains('hidden')) {
    loginModal.classList.remove('hidden');
    pwdInput.focus();
  } else {
    // Logout
    adminPassword = '';
    localStorage.removeItem('cdn_admin_pwd');
    lockUI();
    showToast('Logged out successfully');
  }
});

// Close modal
cancelLogin.addEventListener('click', () => {
  loginModal.classList.add('hidden');
  pwdInput.value = '';
});

// Handle login submission
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
  glassPanel.classList.add('admin-mode');
}

function lockUI() {
  dropZone.classList.add('hidden');
  adminBtn.classList.remove('unlocked');
  adminBtn.innerHTML = '<i class="fa-solid fa-lock"></i>';
  glassPanel.classList.remove('admin-mode');
}

// Initial fetch
fetchFiles();

// Drag and drop events
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

dropZone.addEventListener('drop', handleDrop, false);
dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', function() {
  handleFiles(this.files);
});

function handleDrop(e) {
  const dt = e.dataTransfer;
  const files = dt.files;
  handleFiles(files);
}

function handleFiles(files) {
  if (!adminPassword) return showToast("Admin login required");
  ([...files]).forEach(uploadFile);
}

function uploadFile(file) {
  const formData = new FormData();
  formData.append('file', file);

  fetch('/api/upload', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminPassword}`
    },
    body: formData
  })
  .then(response => {
    if (response.status === 401) {
      lockUI();
      localStorage.removeItem('cdn_admin_pwd');
      adminPassword = '';
      throw new Error('Invalid Password');
    }
    if (!response.ok) throw new Error('Upload failed');
    return response.json();
  })
  .then(data => {
    showToast(`Uploaded ${data.fileName}`);
    fetchFiles();
  })
  .catch(err => {
    showToast(err.message);
  });
}

function fetchFiles() {
  fetch('/api/files')
    .then(res => {
      if (!res.ok) throw new Error('Failed to load files');
      return res.json();
    })
    .then(data => {
      fileList.innerHTML = '';
      if (data.length === 0) {
        fileList.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:1rem;">No files uploaded yet.</div>';
      }
      data.forEach(file => {
        const item = document.createElement('div');
        item.className = 'file-item';
        
        const size = (file.size / 1024).toFixed(1) + ' KB';
        const date = new Date(file.lastModified).toLocaleDateString();
        
        let icon = 'fa-file';
        if (file.name.match(/\.(jpg|jpeg|png|gif|webp)$/i)) icon = 'fa-image';
        else if (file.name.match(/\.(mp4|webm)$/i)) icon = 'fa-video';
        else if (file.name.match(/\.(pdf)$/i)) icon = 'fa-file-pdf';
        else if (file.name.match(/\.(zip|tar|gz|rar)$/i)) icon = 'fa-file-zipper';

        const publicUrl = `https://${window.location.host}/${file.name}`;

        item.innerHTML = `
          <div class="file-info">
            <i class="fa-solid ${icon} file-icon"></i>
            <div class="file-details">
              <span class="file-name" title="${file.name}">${file.name}</span>
              <span class="file-meta">${size} • ${date}</span>
            </div>
          </div>
          <div class="file-actions">
            <button class="btn btn-copy" onclick="copyToClipboard('${publicUrl}')" title="Copy URL">
              <i class="fa-solid fa-link"></i>
            </button>
            <button class="btn btn-delete" onclick="deleteFile('${file.name}')" title="Delete">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        `;
        fileList.appendChild(item);
      });
    })
    .catch(err => console.error(err));
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast('Link copied to clipboard!');
  });
}

// Must attach to window because it's called from inline HTML
window.copyToClipboard = copyToClipboard;
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
