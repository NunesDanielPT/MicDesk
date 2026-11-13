// MicDesk — gestão de microfones e alinhamento para eventos
// Zero dependências: Node >= 22.13 (node:sqlite, node:http, node:crypto)
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const PORT = parseInt(process.env.PORT || '3000', 10);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const PUBLIC_DIR = path.join(__dirname, 'public');
const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true';
const SESSION_DAYS = parseInt(process.env.SESSION_DAYS || '30', 10);

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, 'micdesk.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

// ---------- schema ----------
db.exec(`
CREATE TABLE IF NOT EXISTS orgs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  contact TEXT DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  max_events INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER REFERENCES orgs(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL CHECK (role IN ('superadmin','admin','operator','viewer')),
  pass TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  date TEXT DEFAULT '',
  venue TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  current_block_id INTEGER,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS mics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'mao',
  color TEXT DEFAULT '#3fa67a',
  channel TEXT DEFAULT '',
  frequency TEXT DEFAULT '',
  person TEXT DEFAULT '',
  battery INTEGER NOT NULL DEFAULT 3,
  battery_at TEXT,
  status TEXT NOT NULL DEFAULT 'ok',
  notes TEXT DEFAULT '',
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS blocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  start_time TEXT DEFAULT '',
  end_time TEXT DEFAULT '',
  title TEXT DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'painel',
  notes TEXT DEFAULT '',
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS slots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  block_id INTEGER NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
  speaker TEXT NOT NULL DEFAULT '',
  role TEXT DEFAULT '',
  mic_id INTEGER REFERENCES mics(id) ON DELETE SET NULL,
  done INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS battery_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mic_id INTEGER NOT NULL REFERENCES mics(id) ON DELETE CASCADE,
  level INTEGER NOT NULL,
  user_name TEXT DEFAULT '',
  at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_events_org ON events(org_id);
CREATE INDEX IF NOT EXISTS ix_mics_event ON mics(event_id);
CREATE INDEX IF NOT EXISTS ix_blocks_event ON blocks(event_id);
CREATE INDEX IF NOT EXISTS ix_slots_block ON slots(block_id);
`);

// migrações
{
  const cols = db.prepare("PRAGMA table_info(events)").all().map((c) => c.name);
  if (!cols.includes('air_mode')) db.exec("ALTER TABLE events ADD COLUMN air_mode TEXT NOT NULL DEFAULT 'ask'");
  if (!cols.includes('on_air_at')) db.exec('ALTER TABLE events ADD COLUMN on_air_at TEXT');
}

// ---------- helpers ----------
const q = (sql) => db.prepare(sql);
const all = (sql, ...a) => q(sql).all(...a);
const get = (sql, ...a) => q(sql).get(...a);
const run = (sql, ...a) => q(sql).run(...a);
function tx(fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
}

function hashPass(p) {
  const salt = crypto.randomBytes(16).toString('hex');
  const h = crypto.scryptSync(p, salt, 64).toString('hex');
  return `scrypt:${salt}:${h}`;
}
function checkPass(p, stored) {
  const [, salt, h] = String(stored).split(':');
  if (!salt || !h) return false;
  const c = crypto.scryptSync(p, salt, 64);
  const hb = Buffer.from(h, 'hex');
  return hb.length === c.length && crypto.timingSafeEqual(hb, c);
}

class HttpError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
const bad = (m) => new HttpError(400, m);
const forbid = (m = 'Sem permissão') => new HttpError(403, m);
const notFound = (m = 'Não encontrado') => new HttpError(404, m);

const MIC_TYPES = ['mao', 'lapela', 'headset', 'instrumento', 'pulpito', 'ambiente', 'outro'];
const ROLES = ['superadmin', 'admin', 'operator', 'viewer'];
const s = (v, max = 500) => (v == null ? '' : String(v).trim().slice(0, max));
const timeRe = /^([01]?\d|2[0-3])[:hH.]([0-5]\d)$/;
function normTime(v) {
  v = s(v, 10);
  if (!v) return '';
  const m = v.match(timeRe);
  if (!m) throw bad('Hora inválida (usar HH:MM)');
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

// ---------- bootstrap superadmin ----------
if (!get('SELECT id FROM users WHERE role = ?', 'superadmin')) {
  const email = process.env.ADMIN_EMAIL || 'admin@micdesk.local';
  const pw = process.env.ADMIN_PASSWORD || crypto.randomBytes(6).toString('base64url');
  run('INSERT INTO users (org_id, email, name, role, pass) VALUES (NULL, ?, ?, ?, ?)', email, 'Super Admin', 'superadmin', hashPass(pw));
  console.log('================================================');
  console.log(' Super admin criado');
  console.log(' Email:    ' + email);
  if (!process.env.ADMIN_PASSWORD) console.log(' Password: ' + pw + '   (muda depois de entrar)');
  console.log('================================================');
}
run('DELETE FROM sessions WHERE expires < ?', Date.now());

// ---------- live updates (SSE) ----------
const streams = new Map(); // eventId -> Set(res)
function broadcast(eventId, payload = {}) {
  run("UPDATE events SET updated_at = datetime('now') WHERE id = ?", eventId);
  const set = streams.get(Number(eventId));
  if (!set) return;
  const msg = `data: ${JSON.stringify({ type: 'changed', ...payload })}\n\n`;
  for (const r of set) { try { r.write(msg); } catch { } }
}
setInterval(() => {
  for (const set of streams.values()) for (const r of set) { try { r.write(': ping\n\n'); } catch { } }
}, 25000).unref();

// ---------- auth ----------
function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
function getUser(req) {
  const tok = parseCookies(req).mdsess;
  if (!tok) return null;
  const row = get(`SELECT u.id, u.org_id, u.email, u.name, u.role, u.active, o.active AS org_active, o.name AS org_name
    FROM sessions s JOIN users u ON u.id = s.user_id LEFT JOIN orgs o ON o.id = u.org_id
    WHERE s.token = ? AND s.expires > ?`, tok, Date.now());
  if (!row || !row.active) return null;
  if (row.role !== 'superadmin' && !row.org_active) return null;
  return row;
}
function setSessionCookie(res, token, maxAge) {
  res.setHeader('Set-Cookie', `mdsess=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${COOKIE_SECURE ? '; Secure' : ''}`);
}

const loginAttempts = new Map();
function rateLimit(ip) {
  const now = Date.now();
  const a = (loginAttempts.get(ip) || []).filter((t) => now - t < 15 * 60 * 1000);
  if (a.length >= 10) throw new HttpError(429, 'Demasiadas tentativas. Tenta daqui a 15 minutos.');
  a.push(now); loginAttempts.set(ip, a);
}

// ---------- access control ----------
const canWrite = (u) => u.role !== 'viewer';
const isAdmin = (u) => u.role === 'superadmin' || u.role === 'admin';
function eventFor(u, id) {
  const ev = get('SELECT * FROM events WHERE id = ?', Number(id));
  if (!ev) throw notFound('Evento não encontrado');
  if (u.role !== 'superadmin' && ev.org_id !== u.org_id) throw forbid();
  return ev;
}
const micFor = (u, id) => { const m = get('SELECT * FROM mics WHERE id = ?', Number(id)); if (!m) throw notFound(); eventFor(u, m.event_id); return m; };
const blockFor = (u, id) => { const b = get('SELECT * FROM blocks WHERE id = ?', Number(id)); if (!b) throw notFound(); eventFor(u, b.event_id); return b; };
const slotFor = (u, id) => {
  const sl = get('SELECT s.*, b.event_id FROM slots s JOIN blocks b ON b.id = s.block_id WHERE s.id = ?', Number(id));
  if (!sl) throw notFound(); eventFor(u, sl.event_id); return sl;
};
function needWrite(u) { if (!canWrite(u)) throw forbid('Utilizador só de leitura'); }

function fullEvent(ev) {
  const mics = all('SELECT * FROM mics WHERE event_id = ? ORDER BY sort, id', ev.id);
  const blocks = all("SELECT * FROM blocks WHERE event_id = ? ORDER BY CASE WHEN start_time = '' THEN 1 ELSE 0 END, start_time, sort, id", ev.id);
  const slots = all('SELECT s.* FROM slots s JOIN blocks b ON b.id = s.block_id WHERE b.event_id = ? ORDER BY s.sort, s.id', ev.id);
  const byBlock = {};
  for (const sl of slots) (byBlock[sl.block_id] ||= []).push(sl);
  for (const b of blocks) b.slots = byBlock[b.id] || [];
  const org = get('SELECT id, name FROM orgs WHERE id = ?', ev.org_id);
  return { event: ev, org, mics, blocks };
}

const DEFAULT_COLORS = ['#3fa67a', '#5a8a3c', '#8f8a2c', '#a8740a', '#a85a12', '#a04a14', '#9a3518', '#8f1f1f', '#2d6fa8', '#6a4aa8', '#a84a8a', '#4a8a8f'];

// ---------- routing ----------
const routes = [];
function route(method, pattern, handler, opts = {}) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '(\\d+)'; }) + '$');
  routes.push({ method, re, keys, handler, opts });
}

// auth
route('POST', '/api/login', async (req, res, body) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
  rateLimit(ip);
  const u = get('SELECT u.*, o.active AS org_active FROM users u LEFT JOIN orgs o ON o.id = u.org_id WHERE u.email = ?', s(body.email, 200));
  if (!u || !checkPass(String(body.password || ''), u.pass)) throw new HttpError(401, 'Email ou password errados');
  if (!u.active || (u.role !== 'superadmin' && !u.org_active)) throw forbid('Conta desativada');
  loginAttempts.delete(ip);
  const token = crypto.randomBytes(32).toString('hex');
  run('INSERT INTO sessions (token, user_id, expires) VALUES (?, ?, ?)', token, u.id, Date.now() + SESSION_DAYS * 864e5);
  setSessionCookie(res, token, SESSION_DAYS * 86400);
  return { ok: true };
}, { public: true });

route('POST', '/api/logout', (req, res) => {
  const tok = parseCookies(req).mdsess;
  if (tok) run('DELETE FROM sessions WHERE token = ?', tok);
  setSessionCookie(res, '', 0);
  return { ok: true };
}, { public: true });

route('GET', '/api/me', (req, res, b, p, u) => ({ user: u, types: MIC_TYPES, colors: DEFAULT_COLORS }));

route('POST', '/api/me/password', (req, res, body, p, u) => {
  const row = get('SELECT pass FROM users WHERE id = ?', u.id);
  if (!checkPass(String(body.current || ''), row.pass)) throw bad('Password atual errada');
  if (String(body.password || '').length < 6) throw bad('Password nova tem de ter pelo menos 6 caracteres');
  run('UPDATE users SET pass = ? WHERE id = ?', hashPass(body.password), u.id);
  return { ok: true };
});

// orgs (clientes) — superadmin
route('GET', '/api/orgs', (req, res, b, p, u) => {
  if (u.role !== 'superadmin') throw forbid();
  return all(`SELECT o.*, (SELECT COUNT(*) FROM users WHERE org_id = o.id) AS users,
    (SELECT COUNT(*) FROM events WHERE org_id = o.id) AS events FROM orgs o ORDER BY o.name`);
});
route('POST', '/api/orgs', (req, res, body, p, u) => {
  if (u.role !== 'superadmin') throw forbid();
  const name = s(body.name, 120); if (!name) throw bad('Nome obrigatório');
  const r = run('INSERT INTO orgs (name, contact, max_events) VALUES (?, ?, ?)', name, s(body.contact), Number(body.max_events) || 0);
  const orgId = Number(r.lastInsertRowid);
  if (body.admin_email) {
    const pw = s(body.admin_password) || crypto.randomBytes(6).toString('base64url');
    if (get('SELECT id FROM users WHERE email = ?', s(body.admin_email, 200))) throw bad('Esse email já existe');
    run('INSERT INTO users (org_id, email, name, role, pass) VALUES (?, ?, ?, ?, ?)', orgId, s(body.admin_email, 200), s(body.admin_name) || name, 'admin', hashPass(pw));
    return { id: orgId, admin_password: pw };
  }
  return { id: orgId };
});
route('PUT', '/api/orgs/:id', (req, res, body, p, u) => {
  if (u.role !== 'superadmin') throw forbid();
  const o = get('SELECT * FROM orgs WHERE id = ?', p.id); if (!o) throw notFound();
  run('UPDATE orgs SET name = ?, contact = ?, active = ?, max_events = ? WHERE id = ?',
    s(body.name ?? o.name, 120) || o.name, s(body.contact ?? o.contact), body.active == null ? o.active : (body.active ? 1 : 0),
    body.max_events == null ? o.max_events : Number(body.max_events) || 0, o.id);
  if (body.active === false || body.active === 0) run('DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE org_id = ?)', o.id);
  return { ok: true };
});
route('DELETE', '/api/orgs/:id', (req, res, b, p, u) => {
  if (u.role !== 'superadmin') throw forbid();
  run('DELETE FROM orgs WHERE id = ?', p.id);
  return { ok: true };
});

// users
route('GET', '/api/users', (req, res, b, p, u, query) => {
  if (!isAdmin(u)) throw forbid();
  if (u.role === 'superadmin') {
    const org = query.get('org');
    return org ? all('SELECT u.id, u.org_id, u.email, u.name, u.role, u.active, u.created_at, o.name AS org_name FROM users u LEFT JOIN orgs o ON o.id = u.org_id WHERE u.org_id = ? ORDER BY u.name', Number(org))
      : all('SELECT u.id, u.org_id, u.email, u.name, u.role, u.active, u.created_at, o.name AS org_name FROM users u LEFT JOIN orgs o ON o.id = u.org_id ORDER BY o.name, u.name');
  }
  return all('SELECT id, org_id, email, name, role, active, created_at FROM users WHERE org_id = ? ORDER BY name', u.org_id);
});
route('POST', '/api/users', (req, res, body, p, u) => {
  if (!isAdmin(u)) throw forbid();
  const role = ROLES.includes(body.role) ? body.role : 'operator';
  if (role === 'superadmin' && u.role !== 'superadmin') throw forbid();
  const orgId = u.role === 'superadmin' ? (role === 'superadmin' ? null : Number(body.org_id) || null) : u.org_id;
  if (role !== 'superadmin' && !orgId) throw bad('Escolhe o cliente');
  const email = s(body.email, 200); if (!/^\S+@\S+$/.test(email)) throw bad('Email inválido');
  if (get('SELECT id FROM users WHERE email = ?', email)) throw bad('Esse email já existe');
  const pw = s(body.password) || crypto.randomBytes(6).toString('base64url');
  if (pw.length < 6) throw bad('Password com pelo menos 6 caracteres');
  const r = run('INSERT INTO users (org_id, email, name, role, pass) VALUES (?, ?, ?, ?, ?)', orgId, email, s(body.name, 120), role, hashPass(pw));
  return { id: Number(r.lastInsertRowid), password: pw };
});
route('PUT', '/api/users/:id', (req, res, body, p, u) => {
  if (!isAdmin(u)) throw forbid();
  const t = get('SELECT * FROM users WHERE id = ?', p.id); if (!t) throw notFound();
  if (u.role !== 'superadmin' && t.org_id !== u.org_id) throw forbid();
  let role = body.role ?? t.role;
  if (!ROLES.includes(role)) role = t.role;
  if (u.role !== 'superadmin' && (role === 'superadmin' || t.role === 'superadmin')) throw forbid();
  if (t.id === u.id && role !== t.role) throw bad('Não podes mudar o teu próprio papel');
  const active = body.active == null ? t.active : (body.active ? 1 : 0);
  if (t.id === u.id && !active) throw bad('Não te podes desativar a ti próprio');
  run('UPDATE users SET name = ?, role = ?, active = ? WHERE id = ?', s(body.name ?? t.name, 120), role, active, t.id);
  if (body.password) {
    if (String(body.password).length < 6) throw bad('Password com pelo menos 6 caracteres');
    run('UPDATE users SET pass = ? WHERE id = ?', hashPass(body.password), t.id);
    run('DELETE FROM sessions WHERE user_id = ? AND user_id != ?', t.id, u.id);
  }
  if (!active) run('DELETE FROM sessions WHERE user_id = ?', t.id);
  return { ok: true };
});
route('DELETE', '/api/users/:id', (req, res, b, p, u) => {
  if (!isAdmin(u)) throw forbid();
  const t = get('SELECT * FROM users WHERE id = ?', p.id); if (!t) throw notFound();
  if (t.id === u.id) throw bad('Não te podes apagar a ti próprio');
  if (u.role !== 'superadmin' && (t.org_id !== u.org_id || t.role === 'superadmin')) throw forbid();
  run('DELETE FROM users WHERE id = ?', t.id);
  return { ok: true };
});

// events
route('GET', '/api/events', (req, res, b, p, u, query) => {
  const archived = query.get('archived') === '1' ? 1 : 0;
  const base = `SELECT e.*, o.name AS org_name,
    (SELECT COUNT(*) FROM mics WHERE event_id = e.id) AS mic_count,
    (SELECT COUNT(*) FROM blocks WHERE event_id = e.id) AS block_count,
    (SELECT COUNT(*) FROM mics WHERE event_id = e.id AND battery <= 1) AS low_batt
    FROM events e JOIN orgs o ON o.id = e.org_id WHERE e.archived = ?`;
  if (u.role === 'superadmin') {
    const org = query.get('org');
    return org ? all(base + ' AND e.org_id = ? ORDER BY e.date DESC, e.id DESC', archived, Number(org)) : all(base + ' ORDER BY e.date DESC, e.id DESC', archived);
  }
  return all(base + ' AND e.org_id = ? ORDER BY e.date DESC, e.id DESC', archived, u.org_id);
});
route('POST', '/api/events', (req, res, body, p, u) => {
  needWrite(u);
  const orgId = u.role === 'superadmin' ? Number(body.org_id) : u.org_id;
  const org = get('SELECT * FROM orgs WHERE id = ?', orgId);
  if (!org) throw bad('Escolhe o cliente');
  if (org.max_events > 0) {
    const c = get('SELECT COUNT(*) AS c FROM events WHERE org_id = ? AND archived = 0', orgId).c;
    if (c >= org.max_events) throw bad(`Limite de ${org.max_events} eventos ativos atingido para este cliente`);
  }
  const name = s(body.name, 160); if (!name) throw bad('Nome do evento obrigatório');
  const r = run('INSERT INTO events (org_id, name, date, venue, notes, air_mode) VALUES (?, ?, ?, ?, ?, ?)', orgId, name, s(body.date, 20), s(body.venue, 200), s(body.notes, 4000), ['auto', 'ask', 'manual'].includes(body.air_mode) ? body.air_mode : 'ask');
  const id = Number(r.lastInsertRowid);
  if (body.template === 'standard') {
    const preset = [['Head', 'headset'], ['Púlpito', 'pulpito'], ['1', 'mao'], ['2', 'mao'], ['3', 'mao'], ['4', 'mao'], ['5', 'lapela'], ['6', 'lapela'], ['7', 'lapela'], ['8', 'lapela']];
    preset.forEach(([l, t], i) => run('INSERT INTO mics (event_id, label, type, color, sort) VALUES (?, ?, ?, ?, ?)', id, l, t, DEFAULT_COLORS[i % DEFAULT_COLORS.length], i));
  }
  return { id };
});
route('GET', '/api/events/:id', (req, res, b, p, u) => fullEvent(eventFor(u, p.id)));
route('PUT', '/api/events/:id', (req, res, body, p, u) => {
  needWrite(u);
  const ev = eventFor(u, p.id);
  let curBlock = ev.current_block_id;
  if (body.current_block_id !== undefined) {
    curBlock = body.current_block_id ? Number(body.current_block_id) : null;
    if (curBlock && !get('SELECT id FROM blocks WHERE id = ? AND event_id = ?', curBlock, ev.id)) throw bad('Bloco inválido');
    // "if_current": só muda se o bloco no ar ainda for este (evita dois ecrãs a avançar ao mesmo tempo)
    if (body.if_current !== undefined && (body.if_current || null) !== ev.current_block_id) return { ok: true, skipped: true };
  }
  const airMode = ['auto', 'ask', 'manual'].includes(body.air_mode) ? body.air_mode : ev.air_mode;
  run(`UPDATE events SET name = ?, date = ?, venue = ?, notes = ?, current_block_id = ?, archived = ?, air_mode = ?${curBlock !== ev.current_block_id ? ", on_air_at = datetime('now')" : ''} WHERE id = ?`,
    s(body.name ?? ev.name, 160) || ev.name, s(body.date ?? ev.date, 20), s(body.venue ?? ev.venue, 200), s(body.notes ?? ev.notes, 4000),
    curBlock, body.archived == null ? ev.archived : (body.archived ? 1 : 0), airMode, ev.id);
  broadcast(ev.id);
  return { ok: true };
});
route('DELETE', '/api/events/:id', (req, res, b, p, u) => {
  if (!isAdmin(u)) throw forbid('Só administradores podem apagar eventos');
  const ev = eventFor(u, p.id);
  run('DELETE FROM events WHERE id = ?', ev.id);
  broadcast(ev.id, { deleted: true });
  return { ok: true };
});
route('POST', '/api/events/:id/duplicate', (req, res, body, p, u) => {
  needWrite(u);
  const ev = eventFor(u, p.id);
  return tx(() => {
    const r = run('INSERT INTO events (org_id, name, date, venue, notes, air_mode) VALUES (?, ?, ?, ?, ?, ?)', ev.org_id, s(body.name, 160) || ev.name + ' (cópia)', s(body.date, 20) || ev.date, ev.venue, ev.notes, ev.air_mode);
    const nid = Number(r.lastInsertRowid);
    const micMap = {};
    for (const m of all('SELECT * FROM mics WHERE event_id = ? ORDER BY sort, id', ev.id)) {
      const mr = run('INSERT INTO mics (event_id, label, type, color, channel, frequency, person, battery, notes, sort) VALUES (?,?,?,?,?,?,?,?,?,?)',
        nid, m.label, m.type, m.color, m.channel, m.frequency, body.keep_people ? m.person : '', 3, m.notes, m.sort);
      micMap[m.id] = Number(mr.lastInsertRowid);
    }
    if (body.keep_rundown !== false) {
      for (const b of all('SELECT * FROM blocks WHERE event_id = ?', ev.id)) {
        const br = run('INSERT INTO blocks (event_id, start_time, end_time, title, kind, notes, sort) VALUES (?,?,?,?,?,?,?)', nid, b.start_time, b.end_time, b.title, b.kind, b.notes, b.sort);
        const nb = Number(br.lastInsertRowid);
        for (const sl of all('SELECT * FROM slots WHERE block_id = ?', b.id))
          run('INSERT INTO slots (block_id, speaker, role, mic_id, sort) VALUES (?,?,?,?,?)', nb, sl.speaker, sl.role, sl.mic_id ? micMap[sl.mic_id] ?? null : null, sl.sort);
      }
    }
    return { id: nid };
  });
});

// import from spreadsheet (pasted TSV/CSV: Hora | Orador | Micro)
route('POST', '/api/events/:id/import', (req, res, body, p, u) => {
  needWrite(u);
  const ev = eventFor(u, p.id);
  const text = String(body.text || '');
  if (!text.trim()) throw bad('Cola as linhas da folha de cálculo');
  const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim());
  const res2 = tx(() => {
    if (body.replace) run('DELETE FROM blocks WHERE event_id = ?', ev.id);
    const mics = all('SELECT * FROM mics WHERE event_id = ?', ev.id);
    const micByLabel = new Map(mics.map((m) => [m.label.toLowerCase(), m.id]));
    let sortMic = mics.length;
    let block = null; let bsort = get('SELECT COALESCE(MAX(sort),0) AS m FROM blocks WHERE event_id = ?', ev.id).m;
    let nBlocks = 0, nSlots = 0, nMics = 0;
    for (const line of lines) {
      const cols = line.includes('\t') ? line.split('\t') : line.split(/[;,]/);
      const [t, speaker, mic] = cols.map((c) => (c || '').trim());
      if (/^(time|hora|horário|horario)$/i.test(t) || /^(speaker|orador)$/i.test(speaker)) continue;
      if (t && timeRe.test(t)) {
        const isBreak = /coffee|pausa|intervalo|almoço|almoco|break|lunch/i.test(speaker || '') && !mic;
        const r = run('INSERT INTO blocks (event_id, start_time, title, kind, sort) VALUES (?,?,?,?,?)', ev.id, normTime(t), isBreak ? speaker : '', isBreak ? 'intervalo' : 'painel', ++bsort);
        block = Number(r.lastInsertRowid); nBlocks++;
        if (isBreak) { block = null; continue; }
      }
      if (!speaker) continue;
      if (!block) {
        const r = run('INSERT INTO blocks (event_id, start_time, title, kind, sort) VALUES (?,?,?,?,?)', ev.id, '', '', 'painel', ++bsort);
        block = Number(r.lastInsertRowid); nBlocks++;
      }
      let micId = null;
      if (mic) {
        micId = micByLabel.get(mic.toLowerCase());
        if (!micId) {
          const type = /head/i.test(mic) ? 'headset' : /p[uú]lpito/i.test(mic) ? 'pulpito' : /lapela/i.test(mic) ? 'lapela' : 'mao';
          const r = run('INSERT INTO mics (event_id, label, type, color, sort) VALUES (?,?,?,?,?)', ev.id, mic, type, DEFAULT_COLORS[sortMic % DEFAULT_COLORS.length], sortMic++);
          micId = Number(r.lastInsertRowid); micByLabel.set(mic.toLowerCase(), micId); nMics++;
        }
      }
      const so = get('SELECT COALESCE(MAX(sort),0) AS m FROM slots WHERE block_id = ?', block).m + 1;
      run('INSERT INTO slots (block_id, speaker, mic_id, sort) VALUES (?,?,?,?)', block, s(speaker, 160), micId, so);
      nSlots++;
    }
    return { blocks: nBlocks, slots: nSlots, mics: nMics };
  });
  broadcast(ev.id);
  return res2;
});

// mics
function micFields(body, cur = {}) {
  const type = MIC_TYPES.includes(body.type) ? body.type : (cur.type || 'mao');
  let battery = body.battery == null ? cur.battery ?? 3 : Math.max(0, Math.min(3, parseInt(body.battery, 10) || 0));
  const status = ['ok', 'avaria', 'reserva', 'off'].includes(body.status) ? body.status : (cur.status || 'ok');
  return {
    label: s(body.label ?? cur.label, 60), type, color: /^#[0-9a-f]{6}$/i.test(body.color || '') ? body.color : (cur.color || '#3fa67a'),
    channel: s(body.channel ?? cur.channel, 40), frequency: s(body.frequency ?? cur.frequency, 40), person: s(body.person ?? cur.person, 160),
    battery, status, notes: s(body.notes ?? cur.notes, 1000),
  };
}
route('POST', '/api/events/:id/mics', (req, res, body, p, u) => {
  needWrite(u);
  const ev = eventFor(u, p.id);
  const f = micFields(body);
  if (!f.label) throw bad('Nome do micro obrigatório');
  const sort = get('SELECT COALESCE(MAX(sort),0) AS m FROM mics WHERE event_id = ?', ev.id).m + 1;
  const r = run('INSERT INTO mics (event_id, label, type, color, channel, frequency, person, battery, battery_at, status, notes, sort) VALUES (?,?,?,?,?,?,?,?,datetime(\'now\'),?,?,?)',
    ev.id, f.label, f.type, f.color, f.channel, f.frequency, f.person, f.battery, f.status, f.notes, sort);
  broadcast(ev.id);
  return { id: Number(r.lastInsertRowid) };
});
route('PUT', '/api/mics/:id', (req, res, body, p, u) => {
  needWrite(u);
  const m = micFor(u, p.id);
  const f = micFields(body, m);
  if (!f.label) throw bad('Nome do micro obrigatório');
  const battChanged = f.battery !== m.battery || body.new_batteries;
  run(`UPDATE mics SET label=?, type=?, color=?, channel=?, frequency=?, person=?, battery=?, status=?, notes=?${battChanged ? ", battery_at=datetime('now')" : ''} WHERE id=?`,
    f.label, f.type, f.color, f.channel, f.frequency, f.person, f.battery, f.status, f.notes, m.id);
  if (battChanged) run('INSERT INTO battery_log (mic_id, level, user_name) VALUES (?,?,?)', m.id, f.battery, u.name || u.email);
  broadcast(m.event_id);
  return { ok: true };
});
route('GET', '/api/mics/:id/log', (req, res, b, p, u) => {
  const m = micFor(u, p.id);
  return all('SELECT level, user_name, at FROM battery_log WHERE mic_id = ? ORDER BY id DESC LIMIT 30', m.id);
});
route('DELETE', '/api/mics/:id', (req, res, b, p, u) => {
  needWrite(u);
  const m = micFor(u, p.id);
  run('DELETE FROM mics WHERE id = ?', m.id);
  broadcast(m.event_id);
  return { ok: true };
});
route('POST', '/api/events/:id/mics/order', (req, res, body, p, u) => {
  needWrite(u);
  const ev = eventFor(u, p.id);
  tx(() => (body.ids || []).forEach((id, i) => run('UPDATE mics SET sort = ? WHERE id = ? AND event_id = ?', i, Number(id), ev.id)));
  broadcast(ev.id);
  return { ok: true };
});

// blocks
route('POST', '/api/events/:id/blocks', (req, res, body, p, u) => {
  needWrite(u);
  const ev = eventFor(u, p.id);
  const sort = get('SELECT COALESCE(MAX(sort),0) AS m FROM blocks WHERE event_id = ?', ev.id).m + 1;
  const kind = body.kind === 'intervalo' ? 'intervalo' : 'painel';
  const r = run('INSERT INTO blocks (event_id, start_time, end_time, title, kind, notes, sort) VALUES (?,?,?,?,?,?,?)',
    ev.id, normTime(body.start_time), normTime(body.end_time), s(body.title, 200), kind, s(body.notes, 2000), sort);
  const bid = Number(r.lastInsertRowid);
  (Array.isArray(body.slots) ? body.slots : []).forEach((sl, i) => {
    if (!s(sl.speaker)) return;
    const mic = sl.mic_id ? get('SELECT id FROM mics WHERE id = ? AND event_id = ?', Number(sl.mic_id), ev.id) : null;
    run('INSERT INTO slots (block_id, speaker, role, mic_id, sort) VALUES (?,?,?,?,?)', bid, s(sl.speaker, 160), s(sl.role, 80), mic ? mic.id : null, i + 1);
  });
  broadcast(ev.id);
  return { id: bid };
});
route('PUT', '/api/blocks/:id', (req, res, body, p, u) => {
  needWrite(u);
  const b = blockFor(u, p.id);
  run('UPDATE blocks SET start_time=?, end_time=?, title=?, kind=?, notes=? WHERE id=?',
    body.start_time === undefined ? b.start_time : normTime(body.start_time), body.end_time === undefined ? b.end_time : normTime(body.end_time),
    s(body.title ?? b.title, 200), body.kind ? (body.kind === 'intervalo' ? 'intervalo' : 'painel') : b.kind, s(body.notes ?? b.notes, 2000), b.id);
  broadcast(b.event_id);
  return { ok: true };
});
route('DELETE', '/api/blocks/:id', (req, res, b, p, u) => {
  needWrite(u);
  const bl = blockFor(u, p.id);
  run('DELETE FROM blocks WHERE id = ?', bl.id);
  run('UPDATE events SET current_block_id = NULL WHERE id = ? AND current_block_id = ?', bl.event_id, bl.id);
  broadcast(bl.event_id);
  return { ok: true };
});

// slots
route('POST', '/api/blocks/:id/slots', (req, res, body, p, u) => {
  needWrite(u);
  const b = blockFor(u, p.id);
  const mic = body.mic_id ? get('SELECT id FROM mics WHERE id = ? AND event_id = ?', Number(body.mic_id), b.event_id) : null;
  const sort = get('SELECT COALESCE(MAX(sort),0) AS m FROM slots WHERE block_id = ?', b.id).m + 1;
  const r = run('INSERT INTO slots (block_id, speaker, role, mic_id, sort) VALUES (?,?,?,?,?)', b.id, s(body.speaker, 160), s(body.role, 80), mic ? mic.id : null, sort);
  broadcast(b.event_id);
  return { id: Number(r.lastInsertRowid) };
});
route('PUT', '/api/slots/:id', (req, res, body, p, u) => {
  needWrite(u);
  const sl = slotFor(u, p.id);
  let micId = sl.mic_id;
  if (body.mic_id !== undefined) {
    const mic = body.mic_id ? get('SELECT id FROM mics WHERE id = ? AND event_id = ?', Number(body.mic_id), sl.event_id) : null;
    micId = mic ? mic.id : null;
  }
  let blockId = sl.block_id;
  if (body.block_id && Number(body.block_id) !== sl.block_id) {
    const nb = get('SELECT id FROM blocks WHERE id = ? AND event_id = ?', Number(body.block_id), sl.event_id);
    if (nb) blockId = nb.id;
  }
  run('UPDATE slots SET speaker=?, role=?, mic_id=?, done=?, block_id=? WHERE id=?',
    s(body.speaker ?? sl.speaker, 160), s(body.role ?? sl.role, 80), micId, body.done == null ? sl.done : (body.done ? 1 : 0), blockId, sl.id);
  broadcast(sl.event_id);
  return { ok: true };
});
route('DELETE', '/api/slots/:id', (req, res, b, p, u) => {
  needWrite(u);
  const sl = slotFor(u, p.id);
  run('DELETE FROM slots WHERE id = ?', sl.id);
  broadcast(sl.event_id);
  return { ok: true };
});
route('POST', '/api/blocks/:id/order', (req, res, body, p, u) => {
  needWrite(u);
  const b = blockFor(u, p.id);
  tx(() => (body.ids || []).forEach((id, i) => run('UPDATE slots SET sort = ? WHERE id = ? AND block_id = ?', i + 1, Number(id), b.id)));
  broadcast(b.event_id);
  return { ok: true };
});

// live stream
route('GET', '/api/events/:id/stream', (req, res, b, p, u) => {
  const ev = eventFor(u, p.id);
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write('retry: 3000\n\n');
  const set = streams.get(ev.id) || new Set(); set.add(res); streams.set(ev.id, set);
  req.on('close', () => { set.delete(res); if (!set.size) streams.delete(ev.id); });
  return undefined; // keep open
}, { stream: true });

// backup (superadmin)
route('GET', '/api/admin/stats', (req, res, b, p, u) => {
  if (u.role !== 'superadmin') throw forbid();
  return {
    orgs: get('SELECT COUNT(*) c FROM orgs').c, users: get('SELECT COUNT(*) c FROM users').c,
    events: get('SELECT COUNT(*) c FROM events').c, mics: get('SELECT COUNT(*) c FROM mics').c,
    live_connections: [...streams.values()].reduce((a, x) => a + x.size, 0),
  };
});

// ---------- server ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon' };

function serveStatic(req, res, pathname) {
  let file = path.normalize(path.join(PUBLIC_DIR, decodeURIComponent(pathname)));
  if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end(); }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(PUBLIC_DIR, 'index.html');
  const ext = path.extname(file);
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': ext === '.html' || file.endsWith('sw.js') ? 'no-cache' : 'public, max-age=3600',
    'X-Content-Type-Options': 'nosniff',
  });
  fs.createReadStream(file).pipe(res);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > 2e6) { reject(new HttpError(413, 'Pedido demasiado grande')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(bad('JSON inválido')); }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const pathname = url.pathname;
  if (pathname === '/health') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }
  if (!pathname.startsWith('/api/')) return serveStatic(req, res, pathname);
  try {
    let match = null; let rt = null;
    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = pathname.match(r.re);
      if (m) { rt = r; match = m; break; }
    }
    if (!rt) throw notFound('Rota inexistente');
    // CSRF: pedidos de escrita têm de vir da mesma origem
    if (req.method !== 'GET') {
      const origin = req.headers.origin;
      if (origin) {
        const host = req.headers['x-forwarded-host'] || req.headers.host;
        try { if (new URL(origin).host !== host) throw forbid('Origem inválida'); } catch (e) { if (e instanceof HttpError) throw e; throw forbid('Origem inválida'); }
      }
    }
    const params = {}; rt.keys.forEach((k, i) => (params[k] = Number(match[i + 1])));
    const user = getUser(req);
    if (!rt.opts.public && !user) throw new HttpError(401, 'Sessão expirada');
    const body = req.method === 'GET' ? {} : await readBody(req);
    const result = await rt.handler(req, res, body, params, user, url.searchParams);
    if (rt.opts.stream) return;
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(result ?? { ok: true }));
  } catch (e) {
    const code = e instanceof HttpError ? e.code : 500;
    if (code === 500) console.error(e);
    if (!res.headersSent) res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: code === 500 ? 'Erro interno' : e.message }));
  }
});

server.listen(PORT, () => console.log(`MicDesk a correr em http://0.0.0.0:${PORT}`));
const shutdown = () => { server.close(); try { db.close(); } catch { } process.exit(0); };
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
