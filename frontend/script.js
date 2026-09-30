const API = window.location.origin + '/api';

function getUserToken() {
  return localStorage.getItem('userToken');
}
function setUserToken(t) {
  if (t) localStorage.setItem('userToken', t);
  else localStorage.removeItem('userToken');
}
function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem('userProfile') || 'null');
  } catch {
    return null;
  }
}
function setStoredUser(u) {
  if (u) localStorage.setItem('userProfile', JSON.stringify(u));
  else localStorage.removeItem('userProfile');
}

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const token = getUserToken();
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(API + path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

document.addEventListener('DOMContentLoaded', () => {
  const navItems = document.querySelectorAll('.nav-item');
  const sections = document.querySelectorAll('.section');
  const indicator = document.getElementById('navIndicator');
  const bottomNav = document.getElementById('bottomNav');

  let currentUser = getStoredUser();
  let currentProduct = null;
  let checkoutQty = 1;

  // ---------- Nav ----------
  function moveIndicator(item) {
    if (!item || !bottomNav || !indicator) return;
    const navRect = bottomNav.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    const left = itemRect.left - navRect.left + (itemRect.width - 28) / 2;
    indicator.style.width = '28px';
    indicator.style.transform = 'translateX(' + left + 'px)';
  }

  function showSection(id) {
    sections.forEach((sec) => sec.classList.toggle('active', sec.id === id));
  }

  function setActiveNav(sectionId) {
    navItems.forEach((n) => n.classList.remove('active'));
    const item = document.querySelector('.nav-item[data-section="' + (sectionId === 'checkout' ? 'products' : sectionId) + '"]');
    if (item) {
      item.classList.add('active');
      moveIndicator(item);
    }
  }

  function goTo(sectionId) {
    showSection(sectionId);
    setActiveNav(sectionId);
    if (sectionId === 'profile') refreshProfileUI();
    if (sectionId === 'products') loadProducts();
    if (sectionId === 'contact') loadSettings();
    if (sectionId === 'purchases') loadPurchases();
  }

  navItems.forEach((item) => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      goTo(item.dataset.section);
    });
    item.addEventListener('mouseenter', () => moveIndicator(item));
  });
  bottomNav.addEventListener('mouseleave', () => {
    const active = document.querySelector('.nav-item.active');
    if (active) moveIndicator(active);
  });
  window.addEventListener('resize', () => {
    const active = document.querySelector('.nav-item.active');
    if (active) moveIndicator(active);
  });
  const initial = document.querySelector('.nav-item.active');
  if (initial) requestAnimationFrame(() => moveIndicator(initial));

  document.getElementById('earningsFab')?.addEventListener('click', () => goTo('purchases'));

  // ---------- Settings / Contact links ----------
  async function loadSettings() {
    try {
      const s = await api('/settings');
      const el = document.getElementById('contactChannels');
      el.innerHTML =
        '<a href="' +
        (s.telegram || '#') +
        '" target="_blank" rel="noopener" class="channel-link telegram"><i class="fab fa-telegram-plane"></i><div><strong>Telegram</strong><span>Chat with us instantly</span></div></a>' +
        '<a href="' +
        (s.whatsapp || '#') +
        '" target="_blank" rel="noopener" class="channel-link whatsapp"><i class="fab fa-whatsapp"></i><div><strong>WhatsApp</strong><span>Message us on WhatsApp</span></div></a>';
    } catch (e) {
      console.error(e);
    }
  }

  document.getElementById('contactForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/contact', {
        method: 'POST',
        body: JSON.stringify({
          name: document.getElementById('contactName').value,
          email: document.getElementById('contactEmail').value,
          message: document.getElementById('contactMessage').value,
        }),
      });
      alert('Message sent!');
      e.target.reset();
    } catch (err) {
      alert(err.message);
    }
  });

  // ---------- Products ----------
  async function loadProducts() {
    try {
      const products = await api('/products');
      const grid = document.getElementById('productGrid');
      grid.innerHTML = products
        .map(
          (p) =>
            '<article class="product-card" data-id="' +
            p.id +
            '" role="button" tabindex="0">' +
            '<img class="product-image" src="' +
            p.image +
            '" alt="' +
            p.name +
            '" loading="lazy">' +
            '<div class="product-body"><h3>' +
            p.name +
            '</h3><p class="product-desc">' +
            (p.description || '') +
            '</p><div class="product-footer"><span class="price">$' +
            p.price +
            '</span><span class="product-qty-hint">' +
            p.stock +
            ' in stock</span></div></div></article>'
        )
        .join('');
      grid.querySelectorAll('.product-card').forEach((card) => {
        card.addEventListener('click', () => openCheckout(card.dataset.id, products));
      });
    } catch (e) {
      console.error(e);
    }
  }

  function openCheckout(productId, products) {
    currentProduct = (products || []).find((p) => p.id === productId);
    if (!currentProduct) return;
    checkoutQty = 1;
    document.getElementById('checkoutImage').src = currentProduct.image;
    document.getElementById('checkoutName').textContent = currentProduct.name;
    document.getElementById('checkoutDesc').textContent = currentProduct.description || '';
    document.getElementById('checkoutPrice').textContent = '$' + currentProduct.price;
    document.getElementById('checkoutQty').value = 1;
    updateCheckoutTotal();
    goTo('checkout');
  }

  function updateCheckoutTotal() {
    if (!currentProduct) return;
    document.getElementById('checkoutTotal').textContent =
      '$' + (currentProduct.price * checkoutQty).toFixed(2);
  }

  document.getElementById('backToProducts').addEventListener('click', () => goTo('products'));
  document.getElementById('qtyMinus').addEventListener('click', () => {
    if (checkoutQty > 1) {
      checkoutQty--;
      document.getElementById('checkoutQty').value = checkoutQty;
      updateCheckoutTotal();
    }
  });
  document.getElementById('qtyPlus').addEventListener('click', () => {
    const max = currentProduct ? currentProduct.stock : 99;
    if (checkoutQty < max) {
      checkoutQty++;
      document.getElementById('checkoutQty').value = checkoutQty;
      updateCheckoutTotal();
    }
  });

  document.getElementById('confirmOrderBtn').addEventListener('click', async () => {
    if (!currentProduct) return;
    if (!currentUser || !getUserToken()) {
      alert('Please log in first.');
      goTo('profile');
      return;
    }
    try {
      const result = await api('/users/' + currentUser.id + '/purchase', {
        method: 'POST',
        body: JSON.stringify({ productId: currentProduct.id, quantity: checkoutQty }),
      });
      currentUser = result.user;
      setStoredUser(currentUser);
      const daily = result.purchase ? result.purchase.dailyReturn : (currentProduct.price * checkoutQty * 0.25);
      alert(
        'Order confirmed!\n' +
          currentProduct.name +
          ' × ' +
          checkoutQty +
          '\nTotal paid: $' +
          (currentProduct.price * checkoutQty).toFixed(2) +
          '\n\nYou will receive $' +
          Number(daily).toFixed(2) +
          ' daily for 7 days (25% of purchase).\nView progress under Earnings.'
      );
      goTo('purchases');
      loadProducts();
    } catch (err) {
      alert(err.message);
      if (err.message.toLowerCase().includes('balance')) goTo('profile');
    }
  });

  // ---------- Auth / Profile ----------
  function refreshProfileUI() {
    const gate = document.getElementById('authGate');
    const panel = document.getElementById('profilePanel');
    if (currentUser && getUserToken()) {
      gate.hidden = true;
      panel.hidden = false;
      document.getElementById('balanceAmount').textContent = '$' + Number(currentUser.balance).toFixed(2);
      document.getElementById('profileName').textContent = currentUser.name;
      document.getElementById('profileRole').textContent = currentUser.role;
      document.getElementById('profileEmail').textContent = currentUser.email;
    } else {
      gate.hidden = false;
      panel.hidden = true;
    }
  }

  // Restore session
  (async () => {
    if (getUserToken()) {
      try {
        const me = await api('/auth/me');
        if (me.user) {
          currentUser = me.user;
          setStoredUser(me.user);
        }
      } catch {
        setUserToken(null);
        setStoredUser(null);
        currentUser = null;
      }
    }
    refreshProfileUI();
    loadProducts();
    loadSettings();
  })();

  function showAuthPanel(name) {
    document.getElementById('loginPanel').hidden = name !== 'login';
    document.getElementById('registerPanel').hidden = name !== 'register';
    document.getElementById('forgotPanel').hidden = name !== 'forgot';
  }

  document.getElementById('showRegister').addEventListener('click', (e) => {
    e.preventDefault();
    showAuthPanel('register');
  });
  document.getElementById('showLogin').addEventListener('click', (e) => {
    e.preventDefault();
    showAuthPanel('login');
  });
  document.getElementById('showForgot').addEventListener('click', (e) => {
    e.preventDefault();
    showAuthPanel('forgot');
    document.getElementById('resetStep').hidden = true;
  });
  document.getElementById('showLoginFromForgot').addEventListener('click', (e) => {
    e.preventDefault();
    showAuthPanel('login');
  });

  document.getElementById('userLoginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const data = await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: document.getElementById('loginEmail').value,
          password: document.getElementById('loginPassword').value,
        }),
      });
      setUserToken(data.token);
      currentUser = data.user;
      setStoredUser(data.user);
      refreshProfileUI();
    } catch (err) {
      alert(err.message);
    }
  });

  document.getElementById('userRegisterForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const data = await api('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          name: document.getElementById('regName').value,
          email: document.getElementById('regEmail').value,
          password: document.getElementById('regPassword').value,
          inviteCode: document.getElementById('regInvite').value.trim(),
        }),
      });
      setUserToken(data.token);
      currentUser = data.user;
      setStoredUser(data.user);
      refreshProfileUI();
    } catch (err) {
      alert(err.message);
    }
  });

  // Forgot password — request code
  document.getElementById('forgotForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('forgotEmail').value.trim();
    try {
      const data = await api('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      document.getElementById('resetStep').hidden = false;
      // Demo: show the code (in production it would only be emailed)
      if (data.resetCode) {
        alert('Reset code (demo): ' + data.resetCode + '\n\nValid for 15 minutes.');
        document.getElementById('resetCode').value = data.resetCode;
      } else {
        alert(data.message || 'If that email is registered, a reset code was sent.');
      }
    } catch (err) {
      alert(err.message);
    }
  });

  // Reset password with code
  document.getElementById('resetForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const data = await api('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({
          email: document.getElementById('forgotEmail').value.trim(),
          code: document.getElementById('resetCode').value.trim(),
          newPassword: document.getElementById('resetNewPass').value,
        }),
      });
      alert(data.message || 'Password updated. Please sign in.');
      showAuthPanel('login');
      document.getElementById('loginEmail').value = document.getElementById('forgotEmail').value.trim();
      document.getElementById('loginPassword').value = '';
    } catch (err) {
      alert(err.message);
    }
  });

  document.getElementById('logoutBtn').addEventListener('click', () => {
    setUserToken(null);
    setStoredUser(null);
    currentUser = null;
    document.getElementById('txPanel').hidden = true;
    refreshProfileUI();
  });

  // Balance / transactions
  document.getElementById('balanceBadge').addEventListener('click', async () => {
    const panel = document.getElementById('txPanel');
    if (!panel.hidden) {
      panel.hidden = true;
      return;
    }
    try {
      const list = await api('/users/' + currentUser.id + '/transactions');
      const txList = document.getElementById('txList');
      const txEmpty = document.getElementById('txEmpty');
      if (!list.length) {
        txList.innerHTML = '';
        txEmpty.hidden = false;
      } else {
        txEmpty.hidden = true;
        txList.innerHTML = list
          .map((tx) => {
            const isDep = tx.type === 'deposit';
            return (
              '<li class="tx-item"><div class="tx-info"><div class="tx-icon ' +
              tx.type +
              '"><i class="fas ' +
              (isDep ? 'fa-arrow-down' : 'fa-arrow-up') +
              '"></i></div><div><div class="tx-label">' +
              (isDep ? 'Deposit' : 'Withdraw') +
              '</div><div class="tx-date">' +
              new Date(tx.createdAt).toLocaleString() +
              (tx.note ? ' · ' + tx.note : '') +
              '</div></div></div><div class="tx-amount ' +
              (isDep ? 'positive' : 'negative') +
              '">' +
              (isDep ? '+' : '−') +
              '$' +
              Number(tx.amount).toFixed(2) +
              '</div></li>'
            );
          })
          .join('');
      }
      panel.hidden = false;
    } catch (e) {
      alert(e.message);
    }
  });
  document.getElementById('closeTxPanel').addEventListener('click', () => {
    document.getElementById('txPanel').hidden = true;
  });

  // Modal helpers
  const overlay = document.getElementById('modalOverlay');
  function openModal(title, html) {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBody').innerHTML = html;
    overlay.hidden = false;
  }
  function closeModal() {
    overlay.hidden = true;
  }
  document.getElementById('modalClose').onclick = closeModal;
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });

  document.getElementById('depositBtn').addEventListener('click', () => {
    openModal(
      'Request Deposit',
      '<p style="color:var(--text-muted);font-size:.9rem;margin-bottom:12px">Enter the amount you want to add. You will receive BTC payment instructions next. An admin must approve before your balance is credited.</p>' +
        '<label for="depAmt">Amount (USD)</label><input type="number" id="depAmt" min="1" step="0.01" value="50">' +
        '<div class="modal-actions"><button type="button" class="btn-ghost" id="cancelM">Cancel</button>' +
        '<button type="button" class="btn-primary" id="okDep">Continue</button></div>'
    );
    document.getElementById('cancelM').onclick = closeModal;
    document.getElementById('okDep').onclick = async () => {
      const amount = parseFloat(document.getElementById('depAmt').value);
      if (!amount || amount <= 0) return alert('Enter a valid amount');
      try {
        const r = await api('/users/' + currentUser.id + '/deposit', {
          method: 'POST',
          body: JSON.stringify({ amount, note: 'User deposit request' }),
        });
        const pay = r.payment || {};
        const addr = pay.btcAddress || '';
        openModal(
          'Send BTC Payment',
          '<p style="color:var(--text-muted);font-size:.9rem;margin-bottom:8px">' +
            (pay.instructions || 'Send BTC to the address below. Admin will credit your account after confirmation.') +
            '</p>' +
            '<div class="btc-amount">Amount: $' + amount.toFixed(2) + ' USD</div>' +
            '<div class="btc-box">' +
            '<div class="label">' + (pay.btcNetwork || 'Bitcoin (BTC)') + ' address</div>' +
            '<div class="addr" id="btcAddrText">' + addr + '</div>' +
            '<button type="button" class="copy-btn" id="copyBtc">Copy address</button>' +
            '</div>' +
            '<div style="background:rgba(247,147,26,0.12);border:1px solid rgba(247,147,26,0.35);border-radius:10px;padding:12px;margin:12px 0;font-size:.9rem">' +
            '<strong>Important:</strong> After you send the BTC, <strong>inform the admin</strong> (via Telegram, WhatsApp, or Contact) so they can verify your payment and approve the deposit.' +
            '</div>' +
            '<p style="font-size:.85rem;color:var(--text-muted);margin:12px 0">Your request is pending. The admin has been notified of this request.</p>' +
            '<div class="modal-actions"><button type="button" class="btn-primary" id="doneDep">Done</button></div>'
        );
        document.getElementById('copyBtc').onclick = () => {
          navigator.clipboard.writeText(addr).then(() => alert('Address copied')).catch(() => {
            prompt('Copy this address:', addr);
          });
        };
        document.getElementById('doneDep').onclick = closeModal;
      } catch (err) {
        alert(err.message);
      }
    };
  });

  document.getElementById('withdrawBtn').addEventListener('click', () => {
    openModal(
      'Request Withdrawal',
      '<div style="background:rgba(124,106,245,0.12);border:1px solid rgba(124,106,245,0.35);border-radius:10px;padding:12px;margin-bottom:14px;font-size:.9rem">' +
        '<strong>Note:</strong> Withdrawals require <strong>admin approval</strong>. After submitting, please <strong>inform the admin</strong> (Telegram / WhatsApp / Contact) that you want to withdraw.' +
        '</div>' +
        '<label for="wdAmt">Amount (USD)</label><input type="number" id="wdAmt" min="1" step="0.01" value="20">' +
        '<label for="wdAddr">Your BTC address (optional)</label><input type="text" id="wdAddr" placeholder="bc1...">' +
        '<p style="font-size:.8rem;color:var(--text-muted);margin-bottom:12px">Available: $' +
        Number(currentUser.balance).toFixed(2) +
        '</p>' +
        '<div class="modal-actions"><button type="button" class="btn-ghost" id="cancelM">Cancel</button>' +
        '<button type="button" class="btn-primary" id="okWd">Submit request</button></div>'
    );
    document.getElementById('cancelM').onclick = closeModal;
    document.getElementById('okWd').onclick = async () => {
      const amount = parseFloat(document.getElementById('wdAmt').value);
      const payoutAddress = document.getElementById('wdAddr').value.trim();
      if (!amount || amount <= 0) return alert('Enter a valid amount');
      try {
        const r = await api('/users/' + currentUser.id + '/withdraw', {
          method: 'POST',
          body: JSON.stringify({ amount, note: 'User withdraw request', payoutAddress }),
        });
        closeModal();
        openModal(
          'Withdrawal requested',
          '<p style="margin-bottom:12px">' +
            (r.message || 'Your withdrawal request was submitted.') +
            '</p>' +
            '<div style="background:rgba(247,147,26,0.12);border:1px solid rgba(247,147,26,0.35);border-radius:10px;padding:12px;font-size:.9rem">' +
            '<strong>Next step:</strong> Contact the admin and inform them that you requested a withdrawal of <strong>$' +
            amount.toFixed(2) +
            '</strong> so they can process it.' +
            '</div>' +
            '<div class="modal-actions" style="margin-top:16px"><button type="button" class="btn-primary" id="doneWd">OK</button></div>'
        );
        document.getElementById('doneWd').onclick = closeModal;
      } catch (err) {
        alert(err.message);
      }
    };
  });


  async function loadPurchases() {
    const listEl = document.getElementById('purchasesList');
    const emptyEl = document.getElementById('purchasesEmpty');
    if (!currentUser || !getUserToken()) {
      listEl.innerHTML = '<p class="muted">Please log in to view your purchases and earnings.</p>';
      return;
    }
    try {
      const data = await api('/users/' + currentUser.id + '/purchases');
      if (data.user) {
        currentUser = data.user;
        setStoredUser(currentUser);
      }
      const list = data.purchases || [];
      if (!list.length) {
        listEl.innerHTML = '<p class="muted" id="purchasesEmpty">No purchases yet. Buy a product to start earning daily returns.</p>';
        return;
      }
      listEl.innerHTML = list
        .map((p) => {
          const earned = Math.round(p.dailyReturn * p.daysPaid * 100) / 100;
          const pct = Math.round((p.daysPaid / p.daysTotal) * 100);
          return (
            '<div class="purchase-card">' +
            '<img src="' + (p.productImage || '') + '" alt="">' +
            '<div>' +
            '<h3>' + p.productName + ' <span class="badge-status ' + p.status + '">' + p.status + '</span></h3>' +
            '<div class="purchase-meta">Qty ' + p.quantity + ' · Paid $' + Number(p.totalPaid).toFixed(2) +
            ' · Daily +$' + Number(p.dailyReturn).toFixed(2) + '</div>' +
            '<div class="purchase-progress"><span style="width:' + pct + '%"></span></div>' +
            '<div class="purchase-stats">' +
            '<span>Day <strong>' + p.daysPaid + '/' + p.daysTotal + '</strong></span>' +
            '<span>Earned <strong>$' + earned.toFixed(2) + '</strong></span>' +
            '<span>Left <strong>' + (p.remainingDays || 0) + ' days</strong></span>' +
            '</div></div></div>'
          );
        })
        .join('');
    } catch (e) {
      listEl.innerHTML = '<p class="muted">' + e.message + '</p>';
    }
  }

  document.getElementById('editInfoBtn').addEventListener('click', () => {
    openModal(
      'Edit Profile',
      '<label>Name</label><input id="editName" value="' +
        (currentUser.name || '').replace(/"/g, '&quot;') +
        '">' +
        '<label>Email</label><input id="editEmail" type="email" value="' +
        (currentUser.email || '').replace(/"/g, '&quot;') +
        '">' +
        '<label>New Password (leave blank to keep)</label><input id="editPass" type="password" placeholder="••••••••">' +
        '<div class="modal-actions"><button type="button" class="btn-ghost" id="cancelM">Cancel</button>' +
        '<button type="button" class="btn-primary" id="okEdit">Save</button></div>'
    );
    document.getElementById('cancelM').onclick = closeModal;
    document.getElementById('okEdit').onclick = async () => {
      const body = {
        name: document.getElementById('editName').value.trim(),
        email: document.getElementById('editEmail').value.trim(),
      };
      const pass = document.getElementById('editPass').value;
      if (pass) body.password = pass;
      try {
        const u = await api('/users/' + currentUser.id, { method: 'PUT', body: JSON.stringify(body) });
        currentUser = u;
        setStoredUser(u);
        refreshProfileUI();
        closeModal();
        alert('Profile updated');
      } catch (err) {
        alert(err.message);
      }
    };
  });
});
