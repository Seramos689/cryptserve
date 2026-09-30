const API = window.location.origin + '/api';

function getToken() {
  return localStorage.getItem('adminToken');
}

function setToken(t) {
  if (t) localStorage.setItem('adminToken', t);
  else localStorage.removeItem('adminToken');
}

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(API + path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

// ---------- Views ----------
const loginView = document.getElementById('loginView');
const appView = document.getElementById('appView');

function showApp() {
  loginView.hidden = true;
  appView.hidden = false;
  try {
    loadDashboard();
    loadNotifications();
    loadDeposits();
    loadWithdrawals();
  } catch (e) {
    console.error(e);
  }
}

function showLogin() {
  setToken(null);
  loginView.hidden = false;
  appView.hidden = true;
}

// Auto login check
(async () => {
  if (!getToken()) return;
  try {
    await api('/auth/me');
    showApp();
  } catch {
    showLogin();
  }
})();

// Login form
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('loginError');
  const btn = e.target.querySelector('button[type="submit"]');
  errEl.hidden = true;
  const prevText = btn ? btn.textContent : '';
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Signing in...';
  }
  try {
    const data = await api('/admin/login', {
      method: 'POST',
      body: JSON.stringify({
        username: document.getElementById('loginUser').value,
        password: document.getElementById('loginPass').value,
      }),
    });
    setToken(data.token);
    showApp();
  } catch (err) {
    let msg = err.message || 'Login failed';
    if (msg === 'Failed to fetch' || msg.includes('NetworkError') || msg.includes('fetch')) {
      msg = 'Cannot reach server. Start it with: node server.js in app/backend';
    }
    errEl.textContent = msg;
    errEl.hidden = false;
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = prevText || 'Sign In';
    }
  }
});

document.getElementById('logoutBtn').addEventListener('click', () => showLogin());

// Tabs
document.querySelectorAll('.nav-btn[data-tab]').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn[data-tab]').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'dashboard') loadDashboard();
    if (btn.dataset.tab === 'products') loadProducts();
    if (btn.dataset.tab === 'members') loadMembers();
    if (btn.dataset.tab === 'deposits') loadDeposits();
    if (btn.dataset.tab === 'withdrawals') loadWithdrawals();
    if (btn.dataset.tab === 'contacts') loadContacts();
    if (btn.dataset.tab === 'invites') loadInvites();
    if (btn.dataset.tab === 'admins') loadAdmins();
    if (btn.dataset.tab === 'settings') loadSettings();
  });
});

// ---------- Modal ----------
const modal = document.getElementById('modal');
const modalTitle = document.getElementById('modalTitle');
const modalBody = document.getElementById('modalBody');

function openModal(title, html) {
  modalTitle.textContent = title;
  modalBody.innerHTML = html;
  modal.hidden = false;
}
function closeModal() {
  modal.hidden = true;
  modalBody.innerHTML = '';
}
document.getElementById('modalClose').onclick = closeModal;
modal.addEventListener('click', (e) => {
  if (e.target === modal) closeModal();
});

// ---------- Dashboard ----------
async function loadDashboard() {
  try {
    const [users, products, contacts, txs] = await Promise.all([
      api('/users'),
      api('/products'),
      api('/contacts'),
      api('/transactions'),
    ]);
    document.getElementById('statMembers').textContent = users.length;
    document.getElementById('statProducts').textContent = products.length;
    document.getElementById('statContacts').textContent = contacts.length;
    document.getElementById('statTx').textContent = txs.length;

    const userMap = Object.fromEntries(users.map((u) => [u.id, u.name]));
    document.getElementById('recentTxBody').innerHTML = txs
      .slice(0, 15)
      .map(
        (t) => `
      <tr>
        <td><span class="badge ${t.type}">${t.type}</span></td>
        <td>${userMap[t.userId] || t.userId}</td>
        <td>$${Number(t.amount).toFixed(2)}</td>
        <td>${t.note || '—'}</td>
        <td>${new Date(t.createdAt).toLocaleString()}</td>
      </tr>`
      )
      .join('');
  } catch (e) {
    console.error(e);
  }
}

// ---------- Products ----------
async function loadProducts() {
  try {
    const products = await api('/products');
    document.getElementById('productsBody').innerHTML = products
      .map(
        (p) => `
      <tr>
        <td><img class="thumb" src="${p.image}" alt=""></td>
        <td><strong>${esc(p.name)}</strong><br><span class="muted" style="font-size:.8rem">${esc(p.description || '')}</span></td>
        <td>$${Number(p.price).toFixed(2)}</td>
        <td>${p.stock}</td>
        <td class="actions">
          <button class="btn-ghost btn-sm" onclick="editProduct('${p.id}')">Edit</button>
          <button class="btn-danger btn-sm" onclick="deleteProduct('${p.id}')">Delete</button>
        </td>
      </tr>`
      )
      .join('');
  } catch (e) {
    alert(e.message);
  }
}

function productImageFields(currentImage) {
  const imgVal = currentImage ? escAttr(currentImage) : '';
  const preview = currentImage
    ? `<img id="pImagePreview" class="product-image-preview" src="${escAttr(currentImage)}" alt="Preview">`
    : `<img id="pImagePreview" class="product-image-preview" hidden alt="Preview">`;
  return `
    <label>Product image</label>
    <div class="image-pick-row">
      <input type="file" id="pImageFile" accept="image/png,image/jpeg,image/jpg,image/gif,image/webp" title="Pick image from your computer">
      <span class="muted" style="font-size:.8rem">or paste a URL below</span>
    </div>
    ${preview}
    <label>Image URL (optional)</label>
    <input id="pImage" placeholder="https://... or leave empty if you picked a file" value="${imgVal}">
  `;
}

function wireProductImagePreview() {
  const fileInput = document.getElementById('pImageFile');
  const preview = document.getElementById('pImagePreview');
  const urlInput = document.getElementById('pImage');
  if (!fileInput || !preview) return;
  fileInput.addEventListener('change', () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      fileInput.value = '';
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      alert('Image must be under 8MB');
      fileInput.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      preview.src = reader.result;
      preview.hidden = false;
    };
    reader.readAsDataURL(file);
  });
  if (urlInput) {
    urlInput.addEventListener('input', () => {
      const v = urlInput.value.trim();
      if (v && !fileInput.files?.length) {
        preview.src = v;
        preview.hidden = false;
      }
    });
  }
}

async function resolveProductImage() {
  const fileInput = document.getElementById('pImageFile');
  const urlInput = document.getElementById('pImage');
  const file = fileInput && fileInput.files && fileInput.files[0];
  if (file) {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Failed to read image file'));
      reader.readAsDataURL(file);
    });
    const uploaded = await api('/upload', {
      method: 'POST',
      body: JSON.stringify({ dataUrl }),
    });
    return uploaded.url;
  }
  return (urlInput && urlInput.value.trim()) || '';
}

document.getElementById('addProductBtn').addEventListener('click', () => {
  openModal(
    'Add Product',
    `
    <label>Name</label><input id="pName" required>
    <label>Description</label><input id="pDesc">
    <label>Price (USD)</label><input id="pPrice" type="number" step="0.01" min="0" value="29">
    <label>Stock</label><input id="pStock" type="number" min="0" value="10">
    ${productImageFields('')}
    <div class="modal-actions">
      <button class="btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn-primary" onclick="saveProduct()">Save</button>
    </div>`
  );
  wireProductImagePreview();
});

window.editProduct = async function (id) {
  try {
    const p = await api('/products/' + id);
    openModal(
      'Edit Product',
      `
      <label>Name</label><input id="pName" value="${escAttr(p.name)}">
      <label>Description</label><input id="pDesc" value="${escAttr(p.description || '')}">
      <label>Price (USD)</label><input id="pPrice" type="number" step="0.01" value="${p.price}">
      <label>Stock</label><input id="pStock" type="number" value="${p.stock}">
      ${productImageFields(p.image || '')}
      <div class="modal-actions">
        <button class="btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn-primary" onclick="saveProduct('${p.id}')">Update</button>
      </div>`
    );
    wireProductImagePreview();
  } catch (e) {
    alert(e.message);
  }
};

window.saveProduct = async function (id) {
  const name = document.getElementById('pName').value.trim();
  const price = parseFloat(document.getElementById('pPrice').value);
  if (!name || isNaN(price)) return alert('Name and price required');
  const saveBtn = document.querySelector('#modal .btn-primary');
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
  }
  try {
    const image = await resolveProductImage();
    const body = {
      name,
      description: document.getElementById('pDesc').value.trim(),
      price,
      stock: parseInt(document.getElementById('pStock').value, 10) || 0,
      image,
    };
    if (id) await api('/products/' + id, { method: 'PUT', body: JSON.stringify(body) });
    else await api('/products', { method: 'POST', body: JSON.stringify(body) });
    closeModal();
    loadProducts();
  } catch (e) {
    alert(e.message);
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = id ? 'Update' : 'Save';
    }
  }
};

window.deleteProduct = async function (id) {
  if (!confirm('Delete this product?')) return;
  try {
    await api('/products/' + id, { method: 'DELETE' });
    loadProducts();
  } catch (e) {
    alert(e.message);
  }
};

// ---------- Members ----------
async function loadMembers() {
  try {
    const users = await api('/users');
    document.getElementById('membersBody').innerHTML = users
      .map(
        (u) => `
      <tr>
        <td>${esc(u.name)}</td>
        <td>${esc(u.email)}</td>
        <td><strong>$${Number(u.balance).toFixed(2)}</strong></td>
        <td>${esc(u.role)}</td>
        <td>${new Date(u.createdAt).toLocaleDateString()}</td>
        <td class="actions">
          <button class="btn-ghost btn-sm" onclick="fundsModal('${u.id}','deposit')">Deposit</button>
          <button class="btn-ghost btn-sm" onclick="fundsModal('${u.id}','withdraw')">Withdraw</button>
          <button class="btn-danger btn-sm" onclick="deleteUser('${u.id}')">Delete</button>
        </td>
      </tr>`
      )
      .join('');
  } catch (e) {
    alert(e.message);
  }
}

window.fundsModal = function (userId, type) {
  const title = type === 'deposit' ? 'Add Funds' : 'Withdraw Funds';
  openModal(
    title,
    `
    <label>Amount (USD)</label>
    <input id="fundAmount" type="number" step="0.01" min="0.01" value="50">
    <label>Note</label>
    <input id="fundNote" value="${type === 'deposit' ? 'Admin deposit' : 'Admin withdraw'}">
    <div class="modal-actions">
      <button class="btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn-primary" onclick="doFunds('${userId}','${type}')">${type === 'deposit' ? 'Deposit' : 'Withdraw'}</button>
    </div>`
  );
};

window.doFunds = async function (userId, type) {
  const amount = parseFloat(document.getElementById('fundAmount').value);
  const note = document.getElementById('fundNote').value;
  if (!amount || amount <= 0) return alert('Enter a valid amount');
  try {
    await api(`/users/${userId}/${type}`, {
      method: 'POST',
      body: JSON.stringify({ amount, note }),
    });
    closeModal();
    loadMembers();
  } catch (e) {
    alert(e.message);
  }
};

window.deleteUser = async function (id) {
  if (!confirm('Delete this member and their transactions?')) return;
  try {
    await api('/users/' + id, { method: 'DELETE' });
    loadMembers();
  } catch (e) {
    alert(e.message);
  }
};

// ---------- Contacts ----------
async function loadContacts() {
  try {
    const list = await api('/contacts');
    document.getElementById('contactsBody').innerHTML =
      list.length === 0
        ? '<tr><td colspan="5" class="muted">No messages yet</td></tr>'
        : list
            .map(
              (c) => `
      <tr>
        <td>${esc(c.name)}</td>
        <td>${esc(c.email)}</td>
        <td style="max-width:280px">${esc(c.message)}</td>
        <td>${new Date(c.createdAt).toLocaleString()}</td>
        <td><button class="btn-danger btn-sm" onclick="deleteContact('${c.id}')">Delete</button></td>
      </tr>`
            )
            .join('');
  } catch (e) {
    alert(e.message);
  }
}

window.deleteContact = async function (id) {
  try {
    await api('/contacts/' + id, { method: 'DELETE' });
    loadContacts();
  } catch (e) {
    alert(e.message);
  }
};

// ---------- Settings ----------
async function loadSettings() {
  try {
    const s = await api('/settings');
    document.getElementById('setTelegram').value = s.telegram || '';
    document.getElementById('setWhatsapp').value = s.whatsapp || '';
    document.getElementById('setEmail').value = s.contactEmail || '';
    const btc = document.getElementById('setBtcAddress');
    if (btc) btc.value = s.btcAddress || '';
    const net = document.getElementById('setBtcNetwork');
    if (net) net.value = s.btcNetwork || '';
    const ins = document.getElementById('setDepositInstructions');
    if (ins) ins.value = s.depositInstructions || '';
  } catch (e) {
    console.error(e);
  }
}

document.getElementById('settingsForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/settings', {
      method: 'PUT',
      body: JSON.stringify({
        telegram: document.getElementById('setTelegram').value,
        whatsapp: document.getElementById('setWhatsapp').value,
        contactEmail: document.getElementById('setEmail').value,
        btcAddress: document.getElementById('setBtcAddress')?.value || '',
        btcNetwork: document.getElementById('setBtcNetwork')?.value || '',
        depositInstructions: document.getElementById('setDepositInstructions')?.value || '',
      }),
    });
    alert('Settings saved');
  } catch (err) {
    alert(err.message);
  }
});

document.getElementById('adminPassForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/admin/password', {
      method: 'PUT',
      body: JSON.stringify({ password: document.getElementById('newAdminPass').value }),
    });
    alert('Password updated');
    document.getElementById('newAdminPass').value = '';
  } catch (err) {
    alert(err.message);
  }
});



// ---------- Deposits & Notifications ----------
async function loadDeposits() {
  try {
    const list = await api('/deposit-requests');
    const pending = list.filter((r) => r.status === 'pending').length;
    const badge = document.getElementById('depositBadge');
    if (badge) {
      badge.hidden = pending === 0;
      badge.textContent = pending;
    }
    document.getElementById('depositsBody').innerHTML =
      list.length === 0
        ? '<tr><td colspan="5" class="muted">No deposit requests</td></tr>'
        : list
            .map(
              (r) => `
      <tr>
        <td><strong>${esc(r.userName || '')}</strong><br><span class="muted" style="font-size:.8rem">${esc(r.userEmail || '')}</span></td>
        <td><strong>$${Number(r.amount).toFixed(2)}</strong></td>
        <td><span class="badge ${r.status === 'approved' ? 'deposit' : r.status === 'rejected' ? 'withdraw' : 'deposit'}">${r.status}</span></td>
        <td>${new Date(r.createdAt).toLocaleString()}</td>
        <td class="actions">
          ${
            r.status === 'pending'
              ? `<button class="btn-ghost btn-sm" onclick="approveDeposit('${r.id}')">Approve</button>
                 <button class="btn-danger btn-sm" onclick="rejectDeposit('${r.id}')">Reject</button>`
              : '—'
          }
        </td>
      </tr>`
            )
            .join('');
  } catch (e) {
    console.error(e);
  }
}

window.approveDeposit = async function (id) {
  if (!confirm('Approve this deposit and credit the user balance?')) return;
  try {
    await api('/deposit-requests/' + id + '/approve', { method: 'POST', body: '{}' });
    loadDeposits();
    loadNotifications();
    loadDashboard();
  } catch (e) {
    alert(e.message);
  }
};

window.rejectDeposit = async function (id) {
  if (!confirm('Reject this deposit request?')) return;
  try {
    await api('/deposit-requests/' + id + '/reject', { method: 'POST', body: '{}' });
    loadDeposits();
    loadNotifications();
  } catch (e) {
    alert(e.message);
  }
};

async function loadNotifications() {
  try {
    const list = await api('/notifications');
    const unread = list.filter((n) => !n.read).length;
    const badge = document.getElementById('notifBadge');
    if (badge) {
      badge.hidden = unread === 0;
      badge.textContent = unread;
    }
    const ul = document.getElementById('notifList');
    if (!ul) return;
    ul.innerHTML =
      list.length === 0
        ? '<li class="muted">No notifications</li>'
        : list
            .slice(0, 30)
            .map(
              (n) => `
      <li class="${n.read ? '' : 'unread'}" data-id="${n.id}">
        <strong>${esc(n.title)}</strong><br>${esc(n.message)}
        <span class="time">${new Date(n.createdAt).toLocaleString()}</span>
      </li>`
            )
            .join('');
    ul.querySelectorAll('li[data-id]').forEach((li) => {
      li.onclick = async () => {
        try {
          await api('/notifications/' + li.dataset.id + '/read', { method: 'POST', body: '{}' });
          loadNotifications();
          const t = li.textContent.toLowerCase();
          if (t.includes('deposit')) document.querySelector('.nav-btn[data-tab="deposits"]')?.click();
          if (t.includes('withdraw')) document.querySelector('.nav-btn[data-tab="withdrawals"]')?.click();
        } catch (_) {}
      };
    });
  } catch (e) {
    console.error(e);
  }
}

document.getElementById('notifBell')?.addEventListener('click', () => {
  const panel = document.getElementById('notifPanel');
  panel.hidden = !panel.hidden;
  if (!panel.hidden) loadNotifications();
});

document.getElementById('markAllRead')?.addEventListener('click', async () => {
  try {
    await api('/notifications/read-all', { method: 'POST', body: '{}' });
    loadNotifications();
  } catch (e) {
    alert(e.message);
  }
});

// Poll notifications while admin is logged in
setInterval(() => {
  if (getToken() && !document.getElementById('appView').hidden) {
    loadNotifications();
    loadDeposits();
    loadWithdrawals();
  }
}, 15000);



// ---------- Withdrawals ----------
async function loadWithdrawals() {
  try {
    const list = await api('/withdraw-requests');
    const pending = list.filter((r) => r.status === 'pending').length;
    const badge = document.getElementById('withdrawBadge');
    if (badge) {
      badge.hidden = pending === 0;
      badge.textContent = String(pending);
    }
    const body = document.getElementById('withdrawalsBody');
    if (!body) return;
    body.innerHTML =
      list.length === 0
        ? '<tr><td colspan="6" class="muted">No withdrawal requests</td></tr>'
        : list
            .map(
              (r) => `
      <tr>
        <td><strong>${esc(r.userName || '')}</strong><br><span class="muted" style="font-size:.8rem">${esc(r.userEmail || '')}</span></td>
        <td><strong>$${Number(r.amount).toFixed(2)}</strong></td>
        <td style="max-width:140px;word-break:break-all;font-size:.8rem">${esc(r.payoutAddress || '—')}</td>
        <td><span class="badge ${r.status === 'approved' ? 'deposit' : r.status === 'rejected' ? 'withdraw' : 'deposit'}">${esc(r.status)}</span></td>
        <td>${new Date(r.createdAt).toLocaleString()}</td>
        <td class="actions">
          ${
            r.status === 'pending'
              ? `<button type="button" class="btn-ghost btn-sm" data-approve-wd="${r.id}">Approve</button>
                 <button type="button" class="btn-danger btn-sm" data-reject-wd="${r.id}">Reject</button>`
              : '—'
          }
        </td>
      </tr>`
            )
            .join('');
    body.querySelectorAll('[data-approve-wd]').forEach((btn) => {
      btn.onclick = () => approveWithdraw(btn.getAttribute('data-approve-wd'));
    });
    body.querySelectorAll('[data-reject-wd]').forEach((btn) => {
      btn.onclick = () => rejectWithdraw(btn.getAttribute('data-reject-wd'));
    });
  } catch (e) {
    console.error(e);
    const body = document.getElementById('withdrawalsBody');
    if (body) body.innerHTML = '<tr><td colspan="6" class="muted">Error: ' + (e.message || e) + '</td></tr>';
  }
}

async function approveWithdraw(id) {
  if (!confirm('Approve withdrawal and deduct from user balance?')) return;
  try {
    await api('/withdraw-requests/' + id + '/approve', { method: 'POST', body: '{}' });
    await loadWithdrawals();
    if (typeof loadNotifications === 'function') loadNotifications();
    if (typeof loadDashboard === 'function') loadDashboard();
  } catch (e) {
    alert(e.message);
  }
}

async function rejectWithdraw(id) {
  if (!confirm('Reject this withdrawal request?')) return;
  try {
    await api('/withdraw-requests/' + id + '/reject', { method: 'POST', body: '{}' });
    await loadWithdrawals();
    if (typeof loadNotifications === 'function') loadNotifications();
  } catch (e) {
    alert(e.message);
  }
}

window.approveWithdraw = approveWithdraw;
window.rejectWithdraw = rejectWithdraw;


// ---------- Admins ----------
async function loadAdmins() {
  try {
    const list = await api('/admins');
    const body = document.getElementById('adminsBody');
    if (!body) return;
    body.innerHTML =
      list.length === 0
        ? '<tr><td colspan="3" class="muted">No admins</td></tr>'
        : list
            .map(
              (a) => `
      <tr>
        <td><strong>${esc(a.username)}</strong></td>
        <td>${a.createdAt ? new Date(a.createdAt).toLocaleString() : '—'}</td>
        <td class="actions">
          <button type="button" class="btn-ghost btn-sm" data-reset-admin="${escAttr(a.id)}" data-user="${escAttr(a.username)}">Reset password</button>
          <button type="button" class="btn-danger btn-sm" data-del-admin="${escAttr(a.id)}">Delete</button>
        </td>
      </tr>`
            )
            .join('');
    body.querySelectorAll('[data-reset-admin]').forEach((btn) => {
      btn.onclick = () => resetAdminPassword(btn.getAttribute('data-reset-admin'), btn.getAttribute('data-user'));
    });
    body.querySelectorAll('[data-del-admin]').forEach((btn) => {
      btn.onclick = () => deleteAdmin(btn.getAttribute('data-del-admin'));
    });
  } catch (e) {
    alert(e.message);
  }
}

document.getElementById('addAdminBtn')?.addEventListener('click', () => {
  openModal(
    'Add Administrator',
    `
    <label>Username</label>
    <input id="newAdminUser" required autocomplete="off">
    <label>Password</label>
    <input id="newAdminPassword" type="password" required minlength="4">
    <div class="modal-actions">
      <button type="button" class="btn-ghost" onclick="closeModal()">Cancel</button>
      <button type="button" class="btn-primary" id="saveNewAdmin">Create</button>
    </div>`
  );
  document.getElementById('saveNewAdmin').onclick = async () => {
    const username = document.getElementById('newAdminUser').value.trim();
    const password = document.getElementById('newAdminPassword').value;
    if (!username || !password) return alert('Username and password required');
    try {
      await api('/admins', { method: 'POST', body: JSON.stringify({ username, password }) });
      closeModal();
      loadAdmins();
      alert('Admin created: ' + username);
    } catch (e) {
      alert(e.message);
    }
  };
});

async function resetAdminPassword(id, username) {
  const password = prompt('New password for admin "' + username + '" (min 4 characters):');
  if (password == null) return;
  if (password.length < 4) return alert('Password must be at least 4 characters');
  try {
    await api('/admins/' + id + '/password', { method: 'PUT', body: JSON.stringify({ password }) });
    alert('Password updated for ' + username);
  } catch (e) {
    alert(e.message);
  }
}

async function deleteAdmin(id) {
  if (!confirm('Delete this admin account?')) return;
  try {
    await api('/admins/' + id, { method: 'DELETE' });
    loadAdmins();
  } catch (e) {
    alert(e.message);
  }
}

// ---------- Invite Codes ----------
async function loadInvites() {
  try {
    const list = await api('/invite-codes');
    document.getElementById('invitesBody').innerHTML =
      list.length === 0
        ? '<tr><td colspan="6" class="muted">No invite codes yet</td></tr>'
        : list
            .map(
              (c) => `
      <tr>
        <td><code style="font-size:0.95rem">${esc(c.code)}</code></td>
        <td>${c.usedCount || 0}</td>
        <td>${c.maxUses}</td>
        <td><span class="badge ${c.active ? 'deposit' : 'withdraw'}">${c.active ? 'Active' : 'Inactive'}</span></td>
        <td>${c.createdAt ? new Date(c.createdAt).toLocaleDateString() : '—'}</td>
        <td class="actions">
          <button class="btn-ghost btn-sm" onclick="toggleInvite('${escAttr(c.code)}', ${c.active ? 'false' : 'true'})">${c.active ? 'Disable' : 'Enable'}</button>
          <button class="btn-danger btn-sm" onclick="deleteInvite('${escAttr(c.code)}')">Delete</button>
        </td>
      </tr>`
            )
            .join('');
  } catch (e) {
    alert(e.message);
  }
}

document.getElementById('addInviteBtn')?.addEventListener('click', () => {
  openModal(
    'Generate Invite Code',
    `
    <label>Custom code (optional — leave blank to auto-generate)</label>
    <input id="invCode" placeholder="e.g. SUMMER2026" style="text-transform:uppercase">
    <label>Max uses</label>
    <input id="invMax" type="number" min="1" value="1">
    <div class="modal-actions">
      <button class="btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn-primary" onclick="createInvite()">Create</button>
    </div>`
  );
});

window.createInvite = async function () {
  const code = document.getElementById('invCode').value.trim();
  const maxUses = parseInt(document.getElementById('invMax').value, 10) || 1;
  try {
    const body = { maxUses };
    if (code) body.code = code;
    const entry = await api('/invite-codes', { method: 'POST', body: JSON.stringify(body) });
    closeModal();
    alert('Created invite code: ' + entry.code);
    loadInvites();
  } catch (e) {
    alert(e.message);
  }
};

window.toggleInvite = async function (code, active) {
  try {
    await api('/invite-codes/' + encodeURIComponent(code), {
      method: 'PATCH',
      body: JSON.stringify({ active: active === true || active === 'true' }),
    });
    loadInvites();
  } catch (e) {
    alert(e.message);
  }
};

window.deleteInvite = async function (code) {
  if (!confirm('Delete invite code ' + code + '?')) return;
  try {
    await api('/invite-codes/' + encodeURIComponent(code), { method: 'DELETE' });
    loadInvites();
  } catch (e) {
    alert(e.message);
  }
};

// ---------- Utils ----------
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function escAttr(s) {
  return esc(s).replace(/'/g, '&#39;');
}
