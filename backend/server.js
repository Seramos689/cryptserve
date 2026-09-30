/**
 * Zero-dependency Node.js backend
 * - HTTP server
 * - JSON file database
 * - JWT-like tokens (HMAC-SHA256)
 * - Password hashing with scrypt
 *
 * Default admin: admin / admin123
 * API base: http://localhost:3000/api
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production-dark-theme-app-2026';
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
const UPLOADS_DIR = path.join(FRONTEND_DIR, 'uploads');

// ---------- Ensure data & uploads dirs ----------
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// ---------- Password helpers (scrypt) ----------
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(test, 'hex'));
}

// ---------- Token (simple HMAC JWT-like) ----------
function b64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function signToken(payload, expiresInSec = 86400 * 7) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(
    JSON.stringify({
      ...payload,
      exp: Math.floor(Date.now() / 1000) + expiresInSec,
      iat: Math.floor(Date.now() / 1000),
    })
  );
  const sig = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${header}.${body}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${header}.${body}.${sig}`;
}

function verifyToken(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, sig] = parts;
    const expected = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(`${header}.${body}`)
      .digest('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
    if (sig !== expected) return null;
    const payload = JSON.parse(Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

// ---------- Database ----------
function defaultDb() {
  const now = new Date().toISOString();
  return {
    admins: [
      {
        id: 'a1',
        username: 'admin',
        passwordHash: hashPassword('admin123'),
        createdAt: now,
      },
    ],
    users: [
      {
        id: 'u1',
        name: 'Alex Rivera',
        email: 'alex.rivera@example.com',
        passwordHash: hashPassword('user123'),
        role: 'Product Designer',
        balance: 250,
        createdAt: now,
      },
    ],
    products: [
      {
        id: 'p1',
        name: 'Starter Kit',
        description: 'Everything you need to launch fast.',
        price: 29,
        stock: 50,
        image: 'https://images.unsplash.com/photo-1550745165-9bc8b6ca11b3?auto=format&fit=crop&w=600&q=80',
        createdAt: now,
      },
      {
        id: 'p2',
        name: 'Pro Suite',
        description: 'Advanced tools for power users.',
        price: 79,
        stock: 30,
        image: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=600&q=80',
        createdAt: now,
      },
      {
        id: 'p3',
        name: 'Enterprise',
        description: 'Full scale solutions & support.',
        price: 199,
        stock: 12,
        image: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=600&q=80',
        createdAt: now,
      },
    ],
    transactions: [
      { id: 't1', userId: 'u1', type: 'deposit', amount: 100, note: 'Initial deposit', createdAt: '2026-09-20T10:00:00.000Z' },
      { id: 't2', userId: 'u1', type: 'withdraw', amount: 25, note: 'Withdrawal', createdAt: '2026-09-22T14:00:00.000Z' },
      { id: 't3', userId: 'u1', type: 'deposit', amount: 175, note: 'Top-up', createdAt: '2026-09-25T09:00:00.000Z' },
    ],
    contacts: [],
    settings: {
      telegram: 'https://t.me/yourusername',
      whatsapp: 'https://wa.me/1234567890',
      contactEmail: 'support@example.com',
      btcAddress: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
      btcNetwork: 'Bitcoin (BTC)',
      depositInstructions: 'Send the exact BTC amount to the address below. After you have sent the payment, inform the admin (Telegram/WhatsApp/contact) so they can verify and approve your deposit.',
    },
    depositRequests: [],
    withdrawRequests: [],
    purchases: [],
    notifications: [],
    inviteCodes: [
      { code: 'WELCOME2026', maxUses: 10, usedCount: 0, active: true, createdAt: now },
      { code: 'INVITE-DEMO', maxUses: 1, usedCount: 0, active: true, createdAt: now },
    ],
    resetCodes: [],
  };
}

function loadDb() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      if (!Array.isArray(data.inviteCodes)) data.inviteCodes = [];
      if (!Array.isArray(data.resetCodes)) data.resetCodes = [];
      if (!Array.isArray(data.depositRequests)) data.depositRequests = [];
      if (!Array.isArray(data.withdrawRequests)) data.withdrawRequests = [];
      if (!Array.isArray(data.purchases)) data.purchases = [];
      if (!Array.isArray(data.notifications)) data.notifications = [];
      // migrate single admin → admins[]
      if (!Array.isArray(data.admins)) {
        data.admins = [];
        if (data.admin && data.admin.username) {
          data.admins.push({
            id: 'a1',
            username: data.admin.username,
            passwordHash: data.admin.passwordHash,
            createdAt: new Date().toISOString(),
          });
        }
        if (!data.admins.length) {
          // fallback created on first login path if empty - keep structure
        }
        delete data.admin;
      }
      if (!data.settings) data.settings = {};
      if (!data.settings.btcAddress) data.settings.btcAddress = 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh';
      if (!data.settings.btcNetwork) data.settings.btcNetwork = 'Bitcoin (BTC)';
      if (!data.settings.depositInstructions) {
        data.settings.depositInstructions =
          'Send the exact BTC amount to the address below. After you have sent the payment, inform the admin (Telegram/WhatsApp/contact) so they can verify and approve your deposit.';
      }
      return data;
    }
  } catch (e) {
    console.error('DB load error, resetting:', e.message);
  }
  const db = defaultDb();
  saveDb(db);
  return db;
}

function saveDb(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
}

let db = loadDb();

function uid(prefix) {
  return `${prefix}${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;
}

function addNotification(type, title, message, meta = {}) {
  if (!Array.isArray(db.notifications)) db.notifications = [];
  db.notifications.unshift({
    id: uid('n'),
    type,
    title,
    message,
    meta,
    read: false,
    createdAt: new Date().toISOString(),
  });
  // keep last 200
  if (db.notifications.length > 200) db.notifications = db.notifications.slice(0, 200);
}

/** Process due daily returns for a user (or all if userId null). Returns list of payouts applied. */
function processDuePayouts(userId = null) {
  if (!Array.isArray(db.purchases)) db.purchases = [];
  const now = Date.now();
  const applied = [];
  for (const purchase of db.purchases) {
    if (userId && purchase.userId !== userId) continue;
    if (purchase.status !== 'active') continue;
    while (purchase.daysPaid < purchase.daysTotal) {
      const nextDue = new Date(purchase.createdAt).getTime() + (purchase.daysPaid + 1) * 24 * 60 * 60 * 1000;
      if (now < nextDue) break;
      const uidx = db.users.findIndex((u) => u.id === purchase.userId);
      if (uidx === -1) break;
      const amount = Math.round(purchase.dailyReturn * 100) / 100;
      db.users[uidx].balance = Math.round((db.users[uidx].balance + amount) * 100) / 100;
      purchase.daysPaid += 1;
      const tx = {
        id: uid('t'),
        userId: purchase.userId,
        type: 'deposit',
        amount,
        note: `Daily return day ${purchase.daysPaid}/7 — ${purchase.productName}`,
        createdAt: new Date().toISOString(),
      };
      db.transactions.unshift(tx);
      applied.push({ purchaseId: purchase.id, amount, day: purchase.daysPaid });
      if (purchase.daysPaid >= purchase.daysTotal) {
        purchase.status = 'completed';
      }
    }
  }
  if (applied.length) saveDb(db);
  return applied;
}

// ---------- HTTP helpers ----------
function send(res, status, data, extraHeaders = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    ...extraHeaders,
  });
  res.end(body);
}

function sendText(res, status, text, contentType = 'text/plain') {
  res.writeHead(status, {
    'Content-Type': contentType,
    'Access-Control-Allow-Origin': '*',
  });
  res.end(text);
}

function readBody(req, maxBytes = 8 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > maxBytes) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function getAuth(req) {
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) {
    return verifyToken(h.slice(7));
  }
  return null;
}

function requireAdmin(req, res) {
  const auth = getAuth(req);
  if (!auth || auth.role !== 'admin') {
    send(res, 401, { error: 'Admin authentication required' });
    return null;
  }
  return auth;
}

function requireUser(req, res) {
  const auth = getAuth(req);
  if (!auth || (auth.role !== 'user' && auth.role !== 'admin')) {
    send(res, 401, { error: 'Authentication required' });
    return null;
  }
  return auth;
}

function publicUser(u) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    balance: u.balance,
    createdAt: u.createdAt,
  };
}

// ---------- MIME for static ----------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function serveStatic(req, res, urlPath) {
  let filePath = path.join(FRONTEND_DIR, urlPath === '/' ? 'index.html' : urlPath);
  // security
  if (!filePath.startsWith(FRONTEND_DIR)) {
    sendText(res, 403, 'Forbidden');
    return;
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    // SPA fallback for admin etc
    const index = path.join(FRONTEND_DIR, 'index.html');
    if (fs.existsSync(index) && !urlPath.includes('.')) {
      filePath = index;
    } else {
      sendText(res, 404, 'Not found');
      return;
    }
  }
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type });
  fs.createReadStream(filePath).pipe(res);
}

// ---------- Router ----------
async function handleApi(req, res, pathname, method) {
  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    });
    res.end();
    return;
  }

  try {
    // ===== AUTH =====
    // POST /api/admin/login
    if (pathname === '/api/admin/login' && method === 'POST') {
      const body = await readBody(req);
      const { username, password } = body;
      if (!username || !password) return send(res, 400, { error: 'Username and password required' });
      if (!Array.isArray(db.admins)) db.admins = [];
      // legacy fallback
      if (!db.admins.length && db.admin) {
        db.admins.push({
          id: 'a1',
          username: db.admin.username,
          passwordHash: db.admin.passwordHash,
          createdAt: new Date().toISOString(),
        });
        delete db.admin;
        saveDb(db);
      }
      const admin = db.admins.find((a) => a.username.toLowerCase() === String(username).toLowerCase());
      if (!admin || !verifyPassword(password, admin.passwordHash)) {
        return send(res, 401, { error: 'Invalid credentials' });
      }
      const token = signToken({ role: 'admin', username: admin.username, adminId: admin.id });
      return send(res, 200, { token, role: 'admin', username: admin.username, adminId: admin.id });
    }

    // GET /api/admins
    if (pathname === '/api/admins' && method === 'GET') {
      if (!requireAdmin(req, res)) return;
      const list = (db.admins || []).map((a) => ({
        id: a.id,
        username: a.username,
        createdAt: a.createdAt || null,
      }));
      return send(res, 200, list);
    }

    // POST /api/admins  — create admin { username, password }
    if (pathname === '/api/admins' && method === 'POST') {
      if (!requireAdmin(req, res)) return;
      const body = await readBody(req);
      const username = (body.username || '').trim();
      const password = body.password || '';
      if (!username || !password) return send(res, 400, { error: 'Username and password required' });
      if (password.length < 4) return send(res, 400, { error: 'Password must be at least 4 characters' });
      if (!Array.isArray(db.admins)) db.admins = [];
      if (db.admins.some((a) => a.username.toLowerCase() === username.toLowerCase())) {
        return send(res, 409, { error: 'Username already exists' });
      }
      const entry = {
        id: uid('a'),
        username,
        passwordHash: hashPassword(password),
        createdAt: new Date().toISOString(),
      };
      db.admins.push(entry);
      saveDb(db);
      return send(res, 201, { id: entry.id, username: entry.username, createdAt: entry.createdAt });
    }

    // PUT /api/admins/:id/password  — change that admin's password
    if (pathname.match(/^\/api\/admins\/[^/]+\/password$/) && method === 'PUT') {
      if (!requireAdmin(req, res)) return;
      const id = pathname.split('/')[3];
      const body = await readBody(req);
      if (!body.password || body.password.length < 4) {
        return send(res, 400, { error: 'Password must be at least 4 characters' });
      }
      const idx = (db.admins || []).findIndex((a) => a.id === id);
      if (idx === -1) return send(res, 404, { error: 'Admin not found' });
      db.admins[idx].passwordHash = hashPassword(body.password);
      saveDb(db);
      return send(res, 200, { ok: true });
    }

    // DELETE /api/admins/:id
    if (pathname.match(/^\/api\/admins\/[^/]+$/) && method === 'DELETE') {
      if (!requireAdmin(req, res)) return;
      const id = pathname.split('/')[3];
      const auth = getAuth(req);
      if (!Array.isArray(db.admins) || db.admins.length <= 1) {
        return send(res, 400, { error: 'Cannot delete the last admin account' });
      }
      const target = db.admins.find((a) => a.id === id);
      if (!target) return send(res, 404, { error: 'Admin not found' });
      if (auth && auth.username && target.username === auth.username) {
        return send(res, 400, { error: 'You cannot delete your own account while logged in' });
      }
      db.admins = db.admins.filter((a) => a.id !== id);
      saveDb(db);
      return send(res, 200, { ok: true });
    }

    // POST /api/auth/login (user)
    if (pathname === '/api/auth/login' && method === 'POST') {
      const body = await readBody(req);
      const { email, password } = body;
      const user = db.users.find((u) => u.email.toLowerCase() === (email || '').toLowerCase());
      if (!user || !verifyPassword(password, user.passwordHash)) {
        return send(res, 401, { error: 'Invalid email or password' });
      }
      const token = signToken({ role: 'user', userId: user.id, email: user.email });
      return send(res, 200, { token, user: publicUser(user) });
    }

    // POST /api/auth/register  (requires inviteCode)
    if (pathname === '/api/auth/register' && method === 'POST') {
      const body = await readBody(req);
      const { name, email, password, inviteCode } = body;
      if (!name || !email || !password) return send(res, 400, { error: 'Name, email and password required' });
      if (!inviteCode) return send(res, 400, { error: 'Invitation code is required' });
      if (db.users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
        return send(res, 409, { error: 'Email already registered' });
      }
      if (!Array.isArray(db.inviteCodes)) db.inviteCodes = [];
      const invite = db.inviteCodes.find(
        (c) => c.code.toUpperCase() === String(inviteCode).trim().toUpperCase() && c.active
      );
      if (!invite) return send(res, 400, { error: 'Invalid invitation code' });
      if (invite.usedCount >= invite.maxUses) {
        return send(res, 400, { error: 'Invitation code has reached its usage limit' });
      }
      const user = {
        id: uid('u'),
        name,
        email,
        passwordHash: hashPassword(password),
        role: 'Member',
        balance: 0,
        inviteCode: invite.code,
        createdAt: new Date().toISOString(),
      };
      db.users.push(user);
      invite.usedCount = (invite.usedCount || 0) + 1;
      if (invite.usedCount >= invite.maxUses) invite.active = false;
      saveDb(db);
      const token = signToken({ role: 'user', userId: user.id, email: user.email });
      return send(res, 201, { token, user: publicUser(user) });
    }

    // POST /api/auth/forgot-password  — generates a 6-digit reset code
    if (pathname === '/api/auth/forgot-password' && method === 'POST') {
      const body = await readBody(req);
      const email = (body.email || '').trim().toLowerCase();
      if (!email) return send(res, 400, { error: 'Email is required' });
      const user = db.users.find((u) => u.email.toLowerCase() === email);
      // Always return success message to avoid email enumeration
      if (!user) {
        return send(res, 200, {
          ok: true,
          message: 'If that email is registered, a reset code has been issued.',
        });
      }
      if (!Array.isArray(db.resetCodes)) db.resetCodes = [];
      // Invalidate previous codes for this email
      db.resetCodes = db.resetCodes.filter((r) => r.email !== email);
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const entry = {
        email,
        code,
        expiresAt: Date.now() + 15 * 60 * 1000, // 15 minutes
        used: false,
      };
      db.resetCodes.push(entry);
      saveDb(db);
      // Demo: return code in response + log it (no real email service)
      console.log('[RESET CODE] for', email, '→', code);
      return send(res, 200, {
        ok: true,
        message: 'Reset code generated. In production this would be emailed.',
        resetCode: code, // demo only — remove in production
        expiresInMinutes: 15,
      });
    }

    // POST /api/auth/reset-password  — { email, code, newPassword }
    if (pathname === '/api/auth/reset-password' && method === 'POST') {
      const body = await readBody(req);
      const email = (body.email || '').trim().toLowerCase();
      const code = String(body.code || '').trim();
      const newPassword = body.newPassword || body.password;
      if (!email || !code || !newPassword) {
        return send(res, 400, { error: 'Email, reset code and new password are required' });
      }
      if (String(newPassword).length < 4) {
        return send(res, 400, { error: 'Password must be at least 4 characters' });
      }
      if (!Array.isArray(db.resetCodes)) db.resetCodes = [];
      const entry = db.resetCodes.find(
        (r) => r.email === email && r.code === code && !r.used
      );
      if (!entry) return send(res, 400, { error: 'Invalid or expired reset code' });
      if (Date.now() > entry.expiresAt) {
        return send(res, 400, { error: 'Reset code has expired. Request a new one.' });
      }
      const idx = db.users.findIndex((u) => u.email.toLowerCase() === email);
      if (idx === -1) return send(res, 404, { error: 'User not found' });
      db.users[idx].passwordHash = hashPassword(newPassword);
      entry.used = true;
      db.resetCodes = db.resetCodes.filter((r) => !r.used && Date.now() <= r.expiresAt);
      saveDb(db);
      return send(res, 200, { ok: true, message: 'Password updated successfully. You can now log in.' });
    }

    // ===== INVITE CODES (admin) =====
    // GET /api/invite-codes
    if (pathname === '/api/invite-codes' && method === 'GET') {
      if (!requireAdmin(req, res)) return;
      return send(res, 200, db.inviteCodes || []);
    }

    // POST /api/invite-codes  { code?, maxUses? }
    if (pathname === '/api/invite-codes' && method === 'POST') {
      if (!requireAdmin(req, res)) return;
      const body = await readBody(req);
      let code = (body.code || '').trim().toUpperCase();
      if (!code) {
        code = 'INV-' + crypto.randomBytes(4).toString('hex').toUpperCase();
      }
      if ((db.inviteCodes || []).some((c) => c.code === code)) {
        return send(res, 409, { error: 'Code already exists' });
      }
      const entry = {
        code,
        maxUses: Math.max(1, Number(body.maxUses) || 1),
        usedCount: 0,
        active: true,
        createdAt: new Date().toISOString(),
      };
      if (!Array.isArray(db.inviteCodes)) db.inviteCodes = [];
      db.inviteCodes.unshift(entry);
      saveDb(db);
      return send(res, 201, entry);
    }

    // DELETE /api/invite-codes/:code
    if (pathname.startsWith('/api/invite-codes/') && method === 'DELETE') {
      if (!requireAdmin(req, res)) return;
      const code = decodeURIComponent(pathname.split('/')[3] || '').toUpperCase();
      const before = (db.inviteCodes || []).length;
      db.inviteCodes = (db.inviteCodes || []).filter((c) => c.code !== code);
      if (db.inviteCodes.length === before) return send(res, 404, { error: 'Code not found' });
      saveDb(db);
      return send(res, 200, { ok: true });
    }

    // PATCH /api/invite-codes/:code  — toggle active or update maxUses
    if (pathname.startsWith('/api/invite-codes/') && method === 'PATCH') {
      if (!requireAdmin(req, res)) return;
      const code = decodeURIComponent(pathname.split('/')[3] || '').toUpperCase();
      const idx = (db.inviteCodes || []).findIndex((c) => c.code === code);
      if (idx === -1) return send(res, 404, { error: 'Code not found' });
      const body = await readBody(req);
      if (body.active != null) db.inviteCodes[idx].active = !!body.active;
      if (body.maxUses != null) db.inviteCodes[idx].maxUses = Math.max(1, Number(body.maxUses));
      saveDb(db);
      return send(res, 200, db.inviteCodes[idx]);
    }

    // GET /api/auth/me
    if (pathname === '/api/auth/me' && method === 'GET') {
      const auth = requireUser(req, res);
      if (!auth) return;
      if (auth.role === 'admin') {
        return send(res, 200, { role: 'admin', username: auth.username, adminId: auth.adminId || null });
      }
      processDuePayouts(auth.userId);
      const user = db.users.find((u) => u.id === auth.userId);
      if (!user) return send(res, 404, { error: 'User not found' });
      return send(res, 200, { role: 'user', user: publicUser(user) });
    }

    // ===== SETTINGS / CONTACT LINKS =====
    // GET /api/settings
    if (pathname === '/api/settings' && method === 'GET') {
      return send(res, 200, db.settings);
    }

    // PUT /api/settings (admin)
    if (pathname === '/api/settings' && method === 'PUT') {
      if (!requireAdmin(req, res)) return;
      const body = await readBody(req);
      db.settings = { ...db.settings, ...body };
      saveDb(db);
      return send(res, 200, db.settings);
    }

    // POST /api/contact
    if (pathname === '/api/contact' && method === 'POST') {
      const body = await readBody(req);
      const { name, email, message } = body;
      if (!name || !email || !message) return send(res, 400, { error: 'All fields required' });
      const entry = {
        id: uid('c'),
        name,
        email,
        message,
        createdAt: new Date().toISOString(),
        read: false,
      };
      db.contacts.unshift(entry);
      saveDb(db);
      return send(res, 201, { ok: true, id: entry.id });
    }

    // GET /api/contacts (admin)
    if (pathname === '/api/contacts' && method === 'GET') {
      if (!requireAdmin(req, res)) return;
      return send(res, 200, db.contacts);
    }

    // DELETE /api/contacts/:id (admin)
    if (pathname.startsWith('/api/contacts/') && method === 'DELETE') {
      if (!requireAdmin(req, res)) return;
      const id = pathname.split('/')[3];
      db.contacts = db.contacts.filter((c) => c.id !== id);
      saveDb(db);
      return send(res, 200, { ok: true });
    }

    // ===== UPLOAD (admin) — save product image from computer folder =====
    // POST /api/upload  body: { dataUrl: "data:image/png;base64,..." } or { base64, mime }
    if (pathname === '/api/upload' && method === 'POST') {
      if (!requireAdmin(req, res)) return;
      const body = await readBody(req, 10 * 1024 * 1024); // up to ~10MB
      let base64 = body.base64;
      let mime = body.mime || 'image/jpeg';
      if (body.dataUrl && typeof body.dataUrl === 'string') {
        const m = body.dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
        if (!m) return send(res, 400, { error: 'Invalid data URL. Use an image file.' });
        mime = m[1];
        base64 = m[2];
      }
      if (!base64 || typeof base64 !== 'string') {
        return send(res, 400, { error: 'Missing image data (dataUrl or base64)' });
      }
      const extMap = {
        'image/png': '.png',
        'image/jpeg': '.jpg',
        'image/jpg': '.jpg',
        'image/gif': '.gif',
        'image/webp': '.webp',
        'image/svg+xml': '.svg',
      };
      const ext = extMap[mime] || '.jpg';
      if (!extMap[mime] && !mime.startsWith('image/')) {
        return send(res, 400, { error: 'Only image files are allowed' });
      }
      let buf;
      try {
        buf = Buffer.from(base64, 'base64');
      } catch {
        return send(res, 400, { error: 'Invalid base64 image data' });
      }
      if (buf.length > 8 * 1024 * 1024) {
        return send(res, 400, { error: 'Image too large (max 8MB)' });
      }
      if (buf.length < 10) {
        return send(res, 400, { error: 'Image data empty or invalid' });
      }
      const filename = `product-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
      const filePath = path.join(UPLOADS_DIR, filename);
      fs.writeFileSync(filePath, buf);
      const url = `/uploads/${filename}`;
      return send(res, 201, { url, filename });
    }

    // ===== PRODUCTS =====
    // GET /api/products
    if (pathname === '/api/products' && method === 'GET') {
      return send(res, 200, db.products);
    }

    // GET /api/products/:id
    if (pathname.match(/^\/api\/products\/[^/]+$/) && method === 'GET') {
      const id = pathname.split('/')[3];
      const p = db.products.find((x) => x.id === id);
      if (!p) return send(res, 404, { error: 'Product not found' });
      return send(res, 200, p);
    }

    // POST /api/products (admin)
    if (pathname === '/api/products' && method === 'POST') {
      if (!requireAdmin(req, res)) return;
      const body = await readBody(req);
      const { name, description, price, stock, image } = body;
      if (!name || price == null) return send(res, 400, { error: 'Name and price required' });
      const product = {
        id: uid('p'),
        name,
        description: description || '',
        price: Number(price),
        stock: Number(stock) || 0,
        image: image || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=600&q=80',
        createdAt: new Date().toISOString(),
      };
      db.products.push(product);
      saveDb(db);
      return send(res, 201, product);
    }

    // PUT /api/products/:id (admin)
    if (pathname.match(/^\/api\/products\/[^/]+$/) && method === 'PUT') {
      if (!requireAdmin(req, res)) return;
      const id = pathname.split('/')[3];
      const idx = db.products.findIndex((x) => x.id === id);
      if (idx === -1) return send(res, 404, { error: 'Product not found' });
      const body = await readBody(req);
      db.products[idx] = {
        ...db.products[idx],
        name: body.name ?? db.products[idx].name,
        description: body.description ?? db.products[idx].description,
        price: body.price != null ? Number(body.price) : db.products[idx].price,
        stock: body.stock != null ? Number(body.stock) : db.products[idx].stock,
        image: body.image ?? db.products[idx].image,
      };
      saveDb(db);
      return send(res, 200, db.products[idx]);
    }

    // DELETE /api/products/:id (admin)
    if (pathname.match(/^\/api\/products\/[^/]+$/) && method === 'DELETE') {
      if (!requireAdmin(req, res)) return;
      const id = pathname.split('/')[3];
      const before = db.products.length;
      db.products = db.products.filter((x) => x.id !== id);
      if (db.products.length === before) return send(res, 404, { error: 'Product not found' });
      saveDb(db);
      return send(res, 200, { ok: true });
    }

    // ===== USERS / MEMBERS (admin) =====
    // GET /api/users
    if (pathname === '/api/users' && method === 'GET') {
      if (!requireAdmin(req, res)) return;
      return send(res, 200, db.users.map(publicUser));
    }

    // GET /api/users/:id
    if (pathname.match(/^\/api\/users\/[^/]+$/) && method === 'GET') {
      const auth = requireUser(req, res);
      if (!auth) return;
      const id = pathname.split('/')[3];
      if (auth.role === 'user' && auth.userId !== id) {
        return send(res, 403, { error: 'Forbidden' });
      }
      const user = db.users.find((u) => u.id === id);
      if (!user) return send(res, 404, { error: 'User not found' });
      return send(res, 200, publicUser(user));
    }

    // PUT /api/users/:id (self or admin)
    if (pathname.match(/^\/api\/users\/[^/]+$/) && method === 'PUT') {
      const auth = requireUser(req, res);
      if (!auth) return;
      const id = pathname.split('/')[3];
      if (auth.role === 'user' && auth.userId !== id) {
        return send(res, 403, { error: 'Forbidden' });
      }
      const idx = db.users.findIndex((u) => u.id === id);
      if (idx === -1) return send(res, 404, { error: 'User not found' });
      const body = await readBody(req);
      if (body.name) db.users[idx].name = body.name;
      if (body.email) {
        if (db.users.some((u) => u.id !== id && u.email.toLowerCase() === body.email.toLowerCase())) {
          return send(res, 409, { error: 'Email already in use' });
        }
        db.users[idx].email = body.email;
      }
      if (body.role && auth.role === 'admin') db.users[idx].role = body.role;
      if (body.password) db.users[idx].passwordHash = hashPassword(body.password);
      saveDb(db);
      return send(res, 200, publicUser(db.users[idx]));
    }

    // DELETE /api/users/:id (admin)
    if (pathname.match(/^\/api\/users\/[^/]+$/) && method === 'DELETE') {
      if (!requireAdmin(req, res)) return;
      const id = pathname.split('/')[3];
      db.users = db.users.filter((u) => u.id !== id);
      db.transactions = db.transactions.filter((t) => t.userId !== id);
      saveDb(db);
      return send(res, 200, { ok: true });
    }

    // ===== FUNDS =====
    // POST /api/users/:id/deposit
    // - Regular users: create a PENDING deposit request (admin must approve)
    // - Admin: can still credit balance directly (optional ?direct=1 or body.direct)
    if (pathname.match(/^\/api\/users\/[^/]+\/deposit$/) && method === 'POST') {
      const auth = requireUser(req, res);
      if (!auth) return;
      const id = pathname.split('/')[3];
      if (auth.role === 'user' && auth.userId !== id) {
        return send(res, 403, { error: 'Forbidden' });
      }
      const body = await readBody(req);
      const amount = Number(body.amount);
      if (!amount || amount <= 0) return send(res, 400, { error: 'Valid amount required' });
      const idx = db.users.findIndex((u) => u.id === id);
      if (idx === -1) return send(res, 404, { error: 'User not found' });

      // Admin direct credit
      if (auth.role === 'admin' && body.direct !== false) {
        db.users[idx].balance = Math.round((db.users[idx].balance + amount) * 100) / 100;
        const tx = {
          id: uid('t'),
          userId: id,
          type: 'deposit',
          amount,
          note: body.note || 'Admin deposit',
          createdAt: new Date().toISOString(),
        };
        db.transactions.unshift(tx);
        saveDb(db);
        return send(res, 200, { user: publicUser(db.users[idx]), transaction: tx });
      }

      // User → pending deposit request only
      if (!Array.isArray(db.depositRequests)) db.depositRequests = [];
      const reqEntry = {
        id: uid('d'),
        userId: id,
        userName: db.users[idx].name,
        userEmail: db.users[idx].email,
        amount,
        status: 'pending',
        note: body.note || 'User deposit request',
        createdAt: new Date().toISOString(),
        processedAt: null,
      };
      db.depositRequests.unshift(reqEntry);
      addNotification(
        'deposit_request',
        'New deposit request',
        `${db.users[idx].name} requested a deposit of $${amount.toFixed(2)}`,
        { requestId: reqEntry.id, userId: id, amount }
      );
      saveDb(db);
      return send(res, 201, {
        request: reqEntry,
        payment: {
          btcAddress: db.settings.btcAddress,
          btcNetwork: db.settings.btcNetwork || 'Bitcoin (BTC)',
          instructions: db.settings.depositInstructions,
          amountUsd: amount,
        },
      });
    }

    // GET /api/deposit-requests (admin)
    if (pathname === '/api/deposit-requests' && method === 'GET') {
      if (!requireAdmin(req, res)) return;
      return send(res, 200, db.depositRequests || []);
    }

    // POST /api/deposit-requests/:id/approve (admin)
    if (pathname.match(/^\/api\/deposit-requests\/[^/]+\/approve$/) && method === 'POST') {
      if (!requireAdmin(req, res)) return;
      const rid = pathname.split('/')[3];
      const ridx = (db.depositRequests || []).findIndex((r) => r.id === rid);
      if (ridx === -1) return send(res, 404, { error: 'Request not found' });
      const reqEntry = db.depositRequests[ridx];
      if (reqEntry.status !== 'pending') return send(res, 400, { error: 'Request already processed' });
      const uidx = db.users.findIndex((u) => u.id === reqEntry.userId);
      if (uidx === -1) return send(res, 404, { error: 'User not found' });
      db.users[uidx].balance = Math.round((db.users[uidx].balance + reqEntry.amount) * 100) / 100;
      reqEntry.status = 'approved';
      reqEntry.processedAt = new Date().toISOString();
      const tx = {
        id: uid('t'),
        userId: reqEntry.userId,
        type: 'deposit',
        amount: reqEntry.amount,
        note: 'Deposit approved by admin',
        createdAt: new Date().toISOString(),
      };
      db.transactions.unshift(tx);
      addNotification(
        'deposit_approved',
        'Deposit approved',
        `Deposit of $${reqEntry.amount.toFixed(2)} for ${reqEntry.userName} was approved`,
        { requestId: rid }
      );
      saveDb(db);
      return send(res, 200, { request: reqEntry, user: publicUser(db.users[uidx]), transaction: tx });
    }

    // POST /api/deposit-requests/:id/reject (admin)
    if (pathname.match(/^\/api\/deposit-requests\/[^/]+\/reject$/) && method === 'POST') {
      if (!requireAdmin(req, res)) return;
      const rid = pathname.split('/')[3];
      const ridx = (db.depositRequests || []).findIndex((r) => r.id === rid);
      if (ridx === -1) return send(res, 404, { error: 'Request not found' });
      const reqEntry = db.depositRequests[ridx];
      if (reqEntry.status !== 'pending') return send(res, 400, { error: 'Request already processed' });
      reqEntry.status = 'rejected';
      reqEntry.processedAt = new Date().toISOString();
      const body = await readBody(req).catch(() => ({}));
      if (body.note) reqEntry.note = body.note;
      saveDb(db);
      return send(res, 200, { request: reqEntry });
    }

    // GET /api/notifications (admin)
    if (pathname === '/api/notifications' && method === 'GET') {
      if (!requireAdmin(req, res)) return;
      return send(res, 200, db.notifications || []);
    }

    // POST /api/notifications/read-all (admin)
    if (pathname === '/api/notifications/read-all' && method === 'POST') {
      if (!requireAdmin(req, res)) return;
      (db.notifications || []).forEach((n) => { n.read = true; });
      saveDb(db);
      return send(res, 200, { ok: true });
    }

    // POST /api/notifications/:id/read (admin)
    if (pathname.match(/^\/api\/notifications\/[^/]+\/read$/) && method === 'POST') {
      if (!requireAdmin(req, res)) return;
      const nid = pathname.split('/')[3];
      const n = (db.notifications || []).find((x) => x.id === nid);
      if (!n) return send(res, 404, { error: 'Not found' });
      n.read = true;
      saveDb(db);
      return send(res, 200, n);
    }

    // POST /api/users/:id/withdraw
    // User: creates PENDING withdraw request (admin must approve)
    // Admin: can direct-withdraw with body.direct === true
    if (pathname.match(/^\/api\/users\/[^/]+\/withdraw$/) && method === 'POST') {
      const auth = requireUser(req, res);
      if (!auth) return;
      const id = pathname.split('/')[3];
      if (auth.role === 'user' && auth.userId !== id) {
        return send(res, 403, { error: 'Forbidden' });
      }
      const body = await readBody(req);
      const amount = Number(body.amount);
      if (!amount || amount <= 0) return send(res, 400, { error: 'Valid amount required' });
      const idx = db.users.findIndex((u) => u.id === id);
      if (idx === -1) return send(res, 404, { error: 'User not found' });
      if (db.users[idx].balance < amount) {
        return send(res, 400, { error: 'Insufficient balance' });
      }

      // Admin direct withdraw
      if (auth.role === 'admin' && body.direct === true) {
        db.users[idx].balance = Math.round((db.users[idx].balance - amount) * 100) / 100;
        const tx = {
          id: uid('t'),
          userId: id,
          type: 'withdraw',
          amount,
          note: body.note || 'Admin withdraw',
          createdAt: new Date().toISOString(),
        };
        db.transactions.unshift(tx);
        saveDb(db);
        return send(res, 200, { user: publicUser(db.users[idx]), transaction: tx });
      }

      // User → pending withdraw request (hold funds optionally? we hold by checking pending later;
      // for simplicity we do NOT deduct until approve, but reject if balance insufficient at approve time too)
      if (!Array.isArray(db.withdrawRequests)) db.withdrawRequests = [];
      // Prevent overlapping pending that exceeds balance
      const pendingTotal = db.withdrawRequests
        .filter((r) => r.userId === id && r.status === 'pending')
        .reduce((s, r) => s + Number(r.amount), 0);
      if (pendingTotal + amount > db.users[idx].balance) {
        return send(res, 400, { error: 'Insufficient available balance (including pending withdrawals)' });
      }
      const reqEntry = {
        id: uid('w'),
        userId: id,
        userName: db.users[idx].name,
        userEmail: db.users[idx].email,
        amount,
        status: 'pending',
        note: body.note || 'User withdraw request',
        payoutAddress: body.payoutAddress || body.btcAddress || '',
        createdAt: new Date().toISOString(),
        processedAt: null,
      };
      db.withdrawRequests.unshift(reqEntry);
      addNotification(
        'withdraw_request',
        'New withdraw request',
        `${db.users[idx].name} requested a withdrawal of $${amount.toFixed(2)}`,
        { requestId: reqEntry.id, userId: id, amount }
      );
      saveDb(db);
      return send(res, 201, {
        request: reqEntry,
        message:
          'Withdrawal request submitted. Please contact the admin to complete your withdrawal. An admin must approve it before funds are released.',
      });
    }

    // GET /api/withdraw-requests (admin)
    if (pathname === '/api/withdraw-requests' && method === 'GET') {
      if (!requireAdmin(req, res)) return;
      return send(res, 200, db.withdrawRequests || []);
    }

    // POST /api/withdraw-requests/:id/approve
    if (pathname.match(/^\/api\/withdraw-requests\/[^/]+\/approve$/) && method === 'POST') {
      if (!requireAdmin(req, res)) return;
      const rid = pathname.split('/')[3];
      const ridx = (db.withdrawRequests || []).findIndex((r) => r.id === rid);
      if (ridx === -1) return send(res, 404, { error: 'Request not found' });
      const reqEntry = db.withdrawRequests[ridx];
      if (reqEntry.status !== 'pending') return send(res, 400, { error: 'Request already processed' });
      const uidx = db.users.findIndex((u) => u.id === reqEntry.userId);
      if (uidx === -1) return send(res, 404, { error: 'User not found' });
      if (db.users[uidx].balance < reqEntry.amount) {
        return send(res, 400, { error: 'User has insufficient balance' });
      }
      db.users[uidx].balance = Math.round((db.users[uidx].balance - reqEntry.amount) * 100) / 100;
      reqEntry.status = 'approved';
      reqEntry.processedAt = new Date().toISOString();
      const tx = {
        id: uid('t'),
        userId: reqEntry.userId,
        type: 'withdraw',
        amount: reqEntry.amount,
        note: 'Withdrawal approved by admin' + (reqEntry.payoutAddress ? ' → ' + reqEntry.payoutAddress : ''),
        createdAt: new Date().toISOString(),
      };
      db.transactions.unshift(tx);
      addNotification(
        'withdraw_approved',
        'Withdrawal approved',
        `Withdrawal of $${reqEntry.amount.toFixed(2)} for ${reqEntry.userName} was approved`,
        { requestId: rid }
      );
      saveDb(db);
      return send(res, 200, { request: reqEntry, user: publicUser(db.users[uidx]), transaction: tx });
    }

    // POST /api/withdraw-requests/:id/reject
    if (pathname.match(/^\/api\/withdraw-requests\/[^/]+\/reject$/) && method === 'POST') {
      if (!requireAdmin(req, res)) return;
      const rid = pathname.split('/')[3];
      const ridx = (db.withdrawRequests || []).findIndex((r) => r.id === rid);
      if (ridx === -1) return send(res, 404, { error: 'Request not found' });
      const reqEntry = db.withdrawRequests[ridx];
      if (reqEntry.status !== 'pending') return send(res, 400, { error: 'Request already processed' });
      reqEntry.status = 'rejected';
      reqEntry.processedAt = new Date().toISOString();
      saveDb(db);
      return send(res, 200, { request: reqEntry });
    }

    // POST /api/users/:id/purchase  (order product + start 7-day 25% daily returns)
    if (pathname.match(/^\/api\/users\/[^/]+\/purchase$/) && method === 'POST') {
      const auth = requireUser(req, res);
      if (!auth) return;
      const id = pathname.split('/')[3];
      if (auth.role === 'user' && auth.userId !== id) {
        return send(res, 403, { error: 'Forbidden' });
      }
      const body = await readBody(req);
      const { productId, quantity } = body;
      const qty = Math.max(1, Number(quantity) || 1);
      const product = db.products.find((p) => p.id === productId);
      if (!product) return send(res, 404, { error: 'Product not found' });
      if (product.stock < qty) return send(res, 400, { error: 'Not enough stock' });
      const total = Math.round(product.price * qty * 100) / 100;
      const idx = db.users.findIndex((u) => u.id === id);
      if (idx === -1) return send(res, 404, { error: 'User not found' });
      if (db.users[idx].balance < total) {
        return send(res, 400, { error: 'Insufficient balance' });
      }
      db.users[idx].balance = Math.round((db.users[idx].balance - total) * 100) / 100;
      product.stock -= qty;
      const dailyReturn = Math.round(total * 0.25 * 100) / 100; // 25% of purchase price per day
      const purchase = {
        id: uid('pur'),
        userId: id,
        productId: product.id,
        productName: product.name,
        productImage: product.image,
        quantity: qty,
        unitPrice: product.price,
        totalPaid: total,
        dailyReturn,
        daysTotal: 7,
        daysPaid: 0,
        totalEarned: 0,
        status: 'active',
        createdAt: new Date().toISOString(),
      };
      if (!Array.isArray(db.purchases)) db.purchases = [];
      db.purchases.unshift(purchase);
      const tx = {
        id: uid('t'),
        userId: id,
        type: 'withdraw',
        amount: total,
        note: `Purchase: ${product.name} × ${qty}`,
        createdAt: new Date().toISOString(),
      };
      db.transactions.unshift(tx);
      saveDb(db);
      return send(res, 200, {
        user: publicUser(db.users[idx]),
        transaction: tx,
        product,
        purchase,
        message: `Purchase successful. You will receive $${dailyReturn.toFixed(2)} daily for 7 days (25% of purchase price).`,
      });
    }

    // GET /api/users/:id/purchases
    if (pathname.match(/^\/api\/users\/[^/]+\/purchases$/) && method === 'GET') {
      const auth = requireUser(req, res);
      if (!auth) return;
      const id = pathname.split('/')[3];
      if (auth.role === 'user' && auth.userId !== id) {
        return send(res, 403, { error: 'Forbidden' });
      }
      processDuePayouts(id);
      const list = (db.purchases || [])
        .filter((p) => p.userId === id)
        .map((p) => ({
          ...p,
          totalEarned: Math.round(p.dailyReturn * p.daysPaid * 100) / 100,
          remainingDays: Math.max(0, p.daysTotal - p.daysPaid),
          nextPayoutAt:
            p.status === 'active'
              ? new Date(new Date(p.createdAt).getTime() + (p.daysPaid + 1) * 86400000).toISOString()
              : null,
        }));
      const user = db.users.find((u) => u.id === id);
      return send(res, 200, { purchases: list, user: user ? publicUser(user) : null });
    }

    // GET /api/purchases (admin all)
    if (pathname === '/api/purchases' && method === 'GET') {
      if (!requireAdmin(req, res)) return;
      processDuePayouts(null);
      return send(res, 200, db.purchases || []);
    }

    // GET /api/users/:id/transactions
    if (pathname.match(/^\/api\/users\/[^/]+\/transactions$/) && method === 'GET') {
      const auth = requireUser(req, res);
      if (!auth) return;
      const id = pathname.split('/')[3];
      if (auth.role === 'user' && auth.userId !== id) {
        return send(res, 403, { error: 'Forbidden' });
      }
      const list = db.transactions.filter((t) => t.userId === id);
      return send(res, 200, list);
    }

    // GET /api/transactions (admin - all)
    if (pathname === '/api/transactions' && method === 'GET') {
      if (!requireAdmin(req, res)) return;
      return send(res, 200, db.transactions);
    }

    // Admin change password
    if (pathname === '/api/admin/password' && method === 'PUT') {
      if (!requireAdmin(req, res)) return;
      const auth = getAuth(req);
      const body = await readBody(req);
      if (!body.password || body.password.length < 4) {
        return send(res, 400, { error: 'Password must be at least 4 characters' });
      }
      if (!Array.isArray(db.admins)) db.admins = [];
      const idx = db.admins.findIndex((a) => a.username === auth.username);
      if (idx === -1) return send(res, 404, { error: 'Admin not found' });
      db.admins[idx].passwordHash = hashPassword(body.password);
      saveDb(db);
      return send(res, 200, { ok: true });
    }

    send(res, 404, { error: 'Not found', path: pathname });
  } catch (err) {
    console.error(err);
    send(res, 500, { error: err.message || 'Server error' });
  }
}

// ---------- Server ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const pathname = url.pathname;
  const method = req.method || 'GET';

  if (pathname.startsWith('/api/')) {
    await handleApi(req, res, pathname, method);
    return;
  }

  // static frontend
  serveStatic(req, res, pathname);
});

server.listen(PORT, HOST, () => {
  console.log(`\n✅ Server running at http://localhost:${PORT}`);
  console.log(`   Frontend:  http://localhost:${PORT}/`);
  console.log(`   Admin:     http://localhost:${PORT}/admin.html`);
  console.log(`   API:       http://localhost:${PORT}/api/`);
  console.log(`\n   Default admin → username: admin  password: admin123`);
  console.log(`   Demo user    → email: alex.rivera@example.com  password: user123\n`);
});
