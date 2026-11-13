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
const DEFAULT_MAX_EVENTS = parseInt(process.env.DEFAULT_MAX_EVENTS || '5', 10);
const SESSION_DAYS = parseInt(process.env.SESSION_DAYS || '30', 10);

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, 'micdesk.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

// ---------- schema ----------
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('superadmin','user')),
  pass TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  max_events INTEGER NOT NULL DEFAULT 5,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  date TEXT DEFAULT '',
  venue TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  current_block_id INTEGER,
  archived INTEGER NOT NULL DEFAULT 0,
  air_mode TEXT NOT NULL DEFAULT 'ask',
  on_air_at TEXT,
  console_model TEXT DEFAULT '',
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
CREATE TABLE IF NOT EXISTS console_channels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  num TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  mic_id INTEGER REFERENCES mics(id) ON DELETE SET NULL,
  input TEXT DEFAULT '',
  phantom INTEGER NOT NULL DEFAULT 0,
  notes TEXT DEFAULT '',
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS console_outputs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  dest TEXT DEFAULT '',
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS console_routes (
  channel_id INTEGER NOT NULL REFERENCES console_channels(id) ON DELETE CASCADE,
  output_id INTEGER NOT NULL REFERENCES console_outputs(id) ON DELETE CASCADE,
  PRIMARY KEY (channel_id, output_id)
);
CREATE TABLE IF NOT EXISTS event_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  email TEXT NOT NULL COLLATE NOCASE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  added_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (event_id, email)
);
CREATE INDEX IF NOT EXISTS ix_members_user ON event_members(user_id);
CREATE INDEX IF NOT EXISTS ix_members_email ON event_members(email);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS event_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id INTEGER,
  user_name TEXT NOT NULL DEFAULT '',
  msg TEXT NOT NULL,
  at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_log_event ON event_log(event_id, id);
CREATE INDEX IF NOT EXISTS ix_cch_event ON console_channels(event_id);
CREATE INDEX IF NOT EXISTS ix_cout_event ON console_outputs(event_id);
CREATE INDEX IF NOT EXISTS ix_mics_event ON mics(event_id);
CREATE INDEX IF NOT EXISTS ix_blocks_event ON blocks(event_id);
CREATE INDEX IF NOT EXISTS ix_slots_block ON slots(block_id);
`);

// migrações (versões antigas com "clientes")
{
  const cols = db.prepare('PRAGMA table_info(events)').all().map((c) => c.name);
  if (!cols.includes('air_mode')) db.exec("ALTER TABLE events ADD COLUMN air_mode TEXT NOT NULL DEFAULT 'ask'");
  if (!cols.includes('on_air_at')) db.exec('ALTER TABLE events ADD COLUMN on_air_at TEXT');
  if (!cols.includes('console_model')) db.exec("ALTER TABLE events ADD COLUMN console_model TEXT DEFAULT ''");
  if (cols.includes('org_id')) {
    // sem clientes: cada evento passa a pertencer a um utilizador
    console.log('A migrar base de dados: remover clientes, eventos passam a ser por utilizador…');
    const hasOrgs = !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='orgs'").get();
    db.exec('PRAGMA foreign_keys = OFF');
    db.exec('BEGIN');
    try {
      db.exec(`
        CREATE TABLE users_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT NOT NULL UNIQUE COLLATE NOCASE,
          name TEXT NOT NULL DEFAULT '',
          role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('superadmin','user')),
          pass TEXT NOT NULL,
          active INTEGER NOT NULL DEFAULT 1,
          max_events INTEGER NOT NULL DEFAULT 5,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO users_new (id, email, name, role, pass, active, max_events, created_at)
          SELECT u.id, u.email, u.name, CASE WHEN u.role = 'superadmin' THEN 'superadmin' ELSE 'user' END, u.pass,
            ${hasOrgs ? "CASE WHEN u.active = 1 AND (u.role = 'superadmin' OR COALESCE((SELECT active FROM orgs WHERE id = u.org_id), 1) = 1) THEN 1 ELSE 0 END" : 'u.active'},
            ${hasOrgs ? `COALESCE((SELECT NULLIF(max_events, 0) FROM orgs WHERE id = u.org_id), ${DEFAULT_MAX_EVENTS})` : DEFAULT_MAX_EVENTS}, u.created_at
          FROM users u;
        CREATE TABLE events_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name TEXT NOT NULL, date TEXT DEFAULT '', venue TEXT DEFAULT '', notes TEXT DEFAULT '',
          current_block_id INTEGER, archived INTEGER NOT NULL DEFAULT 0,
          air_mode TEXT NOT NULL DEFAULT 'ask', on_air_at TEXT, console_model TEXT DEFAULT '',
          created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO events_new (id, user_id, name, date, venue, notes, current_block_id, archived, air_mode, on_air_at, console_model, created_at, updated_at)
          SELECT e.id,
            COALESCE((SELECT MIN(id) FROM users WHERE org_id = e.org_id AND role != 'superadmin'), (SELECT MIN(id) FROM users WHERE role = 'superadmin')),
            e.name, e.date, e.venue, e.notes, e.current_block_id, e.archived, e.air_mode, e.on_air_at, e.console_model, e.created_at, e.updated_at
          FROM events e;
        DROP TABLE events; ALTER TABLE events_new RENAME TO events;
        DROP TABLE users; ALTER TABLE users_new RENAME TO users;
        ${hasOrgs ? 'DROP TABLE orgs;' : ''}
      `);
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    db.exec('PRAGMA foreign_keys = ON');
  }
  db.exec('CREATE INDEX IF NOT EXISTS ix_events_user ON events(user_id); PRAGMA user_version = 2;');
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
const ROLES = ['superadmin', 'user'];
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
  run('INSERT INTO users (email, name, role, pass, max_events) VALUES (?, ?, ?, ?, 0)', email, 'Super Admin', 'superadmin', hashPass(pw));
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

// ---------- histórico de alterações ----------
const BATT_TXT = ['vazia', '1 traço', '2 traços', 'cheia'];
const STATUS_TXT = { ok: 'operacional', reserva: 'reserva', avaria: 'avaria', off: 'fora de serviço' };
const AIR_TXT = { auto: 'automático', ask: 'perguntar', manual: 'manual' };
function changed(u, evId, msg) {
  if (msg) {
    const name = u.name || u.email;
    run('INSERT INTO event_log (event_id, user_id, user_name, msg) VALUES (?, ?, ?, ?)', evId, u.id, name, String(msg).slice(0, 400));
    broadcast(evId, { by: name, by_id: u.id, msg });
  } else broadcast(evId);
}
const micLabel = (id) => (id ? get('SELECT label FROM mics WHERE id = ?', id)?.label ?? '?' : 'nenhum');
const blkTime = (id) => get('SELECT start_time FROM blocks WHERE id = ?', id)?.start_time || '';
function micDiff(m, f, body) {
  const out = [];
  if (body.new_batteries) out.push(`pôs pilhas novas no micro ${m.label}`);
  else if (f.battery !== m.battery) out.push(`mudou as pilhas do micro ${m.label}: ${BATT_TXT[m.battery]} → ${BATT_TXT[f.battery]}`);
  if (f.person !== m.person) out.push(f.person ? `atribuiu o micro ${f.label} a ${f.person}` : `tirou a pessoa dedicada do micro ${f.label}`);
  if (f.status !== m.status) out.push(`marcou o micro ${f.label} como ${STATUS_TXT[f.status]}`);
  if (f.label !== m.label) out.push(`renomeou o micro ${m.label} → ${f.label}`);
  if (!out.length && (f.type !== m.type || f.color !== m.color || f.channel !== m.channel || f.frequency !== m.frequency || f.notes !== m.notes)) out.push(`editou o micro ${f.label}`);
  return out.join(' · ');
}
function slotDiff(sl, body, micId, blockId) {
  const out = [];
  const name = s(body.speaker ?? sl.speaker, 160);
  if (body.done != null && (body.done ? 1 : 0) !== sl.done) out.push(`${body.done ? 'marcou ✓' : 'desmarcou'} ${name}`);
  if (name !== sl.speaker) out.push(`mudou o nome ${sl.speaker} → ${name}`);
  if (micId !== sl.mic_id) out.push(`mudou o micro de ${name} (${blkTime(blockId)}): ${micLabel(sl.mic_id)} → ${micLabel(micId)}`);
  if (blockId !== sl.block_id) out.push(`passou ${name} do bloco ${blkTime(sl.block_id)} para ${blkTime(blockId)}`);
  if (!out.length && body.role !== undefined && s(body.role, 80) !== (sl.role || '')) out.push(`mudou a função de ${name}`);
  return out.join(' · ');
}
function eventDiff(ev, body, curBlock, airMode) {
  const out = [];
  if (curBlock !== ev.current_block_id) {
    const b = curBlock ? get('SELECT start_time, title FROM blocks WHERE id = ?', curBlock) : null;
    out.push(b ? `pôs ON AIR o bloco ${b.start_time || ''} ${b.title || ''}`.trim() : 'tirou o bloco do ar');
  }
  if (airMode !== ev.air_mode) out.push(`mudou o modo ON AIR para ${AIR_TXT[airMode]}`);
  if (body.console_model !== undefined && s(body.console_model, 120) !== (ev.console_model || '')) out.push(`mudou o modelo da mesa para ${s(body.console_model, 120) || '—'}`);
  if (body.archived != null && (body.archived ? 1 : 0) !== ev.archived) out.push(body.archived ? 'arquivou o evento' : 'desarquivou o evento');
  const fields = [['name', 'nome'], ['date', 'data'], ['venue', 'local'], ['notes', 'notas']].filter(([k]) => body[k] !== undefined && s(body[k], 4000) !== (ev[k] || ''));
  if (fields.length) out.push(`alterou ${fields.map(([, t]) => t).join(', ')} do evento`);
  return out.join(' · ');
}

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
  const row = get(`SELECT u.id, u.email, u.name, u.role, u.active, u.max_events
    FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires > ?`, tok, Date.now());
  if (!row || !row.active) return null;
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
const isSuper = (u) => u.role === 'superadmin';
function eventFor(u, id) {
  const ev = get('SELECT * FROM events WHERE id = ?', Number(id));
  if (!ev) throw notFound('Evento não encontrado');
  if (!isSuper(u) && ev.user_id !== u.id && !isMember(ev.id, u)) throw forbid();
  return ev;
}
function isMember(evId, u) { return !!get('SELECT 1 FROM event_members WHERE event_id = ? AND (user_id = ? OR email = ?)', evId, u.id, u.email); }
const canManage = (u, ev) => isSuper(u) || ev.user_id === u.id;
// convites pendentes passam a acessos quando a pessoa cria conta / entra
function claimInvites(user) { run('UPDATE event_members SET user_id = ? WHERE email = ? AND user_id IS NULL', user.id, user.email); }
const setting = (k, def) => { const r = get('SELECT value FROM settings WHERE key = ?', k); return r ? r.value : def; };
const signupOpen = () => setting('allow_signup', process.env.ALLOW_SIGNUP === 'false' ? '0' : '1') === '1';
const micFor = (u, id) => { const m = get('SELECT * FROM mics WHERE id = ?', Number(id)); if (!m) throw notFound(); eventFor(u, m.event_id); return m; };
const blockFor = (u, id) => { const b = get('SELECT * FROM blocks WHERE id = ?', Number(id)); if (!b) throw notFound(); eventFor(u, b.event_id); return b; };
const slotFor = (u, id) => {
  const sl = get('SELECT s.*, b.event_id FROM slots s JOIN blocks b ON b.id = s.block_id WHERE s.id = ?', Number(id));
  if (!sl) throw notFound(); eventFor(u, sl.event_id); return sl;
};
function needWrite() { }

function fullEvent(ev) {
  const mics = all('SELECT * FROM mics WHERE event_id = ? ORDER BY sort, id', ev.id);
  const blocks = all("SELECT * FROM blocks WHERE event_id = ? ORDER BY CASE WHEN start_time = '' THEN 1 ELSE 0 END, start_time, sort, id", ev.id);
  const slots = all('SELECT s.* FROM slots s JOIN blocks b ON b.id = s.block_id WHERE b.event_id = ? ORDER BY s.sort, s.id', ev.id);
  const byBlock = {};
  for (const sl of slots) (byBlock[sl.block_id] ||= []).push(sl);
  for (const b of blocks) b.slots = byBlock[b.id] || [];
  const owner = get('SELECT id, name, email FROM users WHERE id = ?', ev.user_id);
  const console_ = {
    channels: all('SELECT * FROM console_channels WHERE event_id = ? ORDER BY sort, id', ev.id),
    outputs: all('SELECT * FROM console_outputs WHERE event_id = ? ORDER BY sort, id', ev.id),
    routes: all('SELECT r.channel_id, r.output_id FROM console_routes r JOIN console_channels c ON c.id = r.channel_id WHERE c.event_id = ?', ev.id).map((r) => [r.channel_id, r.output_id]),
  };
  return { event: ev, owner, mics, blocks, console: console_, server_now: Date.now() };
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
  const u = get('SELECT * FROM users WHERE email = ?', s(body.email, 200));
  if (!u || !checkPass(String(body.password || ''), u.pass)) throw new HttpError(401, 'Email ou password errados');
  if (!u.active) throw forbid('Conta desativada');
  loginAttempts.delete(ip);
  claimInvites(u);
  const token = crypto.randomBytes(32).toString('hex');
  run('INSERT INTO sessions (token, user_id, expires) VALUES (?, ?, ?)', token, u.id, Date.now() + SESSION_DAYS * 864e5);
  setSessionCookie(res, token, SESSION_DAYS * 86400);
  return { ok: true };
}, { public: true });

route('GET', '/api/public/config', () => ({ signup: signupOpen() }), { public: true });
route('POST', '/api/register', (req, res, body) => {
  if (!signupOpen()) throw forbid('O registo de novas contas está fechado. Pede uma conta ao administrador.');
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
  rateLimit(ip);
  const email = s(body.email, 200).toLowerCase(); const name = s(body.name, 120);
  if (!name) throw bad('Escreve o teu nome');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw bad('Email inválido');
  if (String(body.password || '').length < 6) throw bad('A password tem de ter pelo menos 6 caracteres');
  if (get('SELECT id FROM users WHERE email = ?', email)) throw bad('Já existe uma conta com esse email. Entra com a tua password.');
  const r = run('INSERT INTO users (email, name, role, pass, max_events) VALUES (?, ?, ?, ?, ?)', email, name, 'user', hashPass(String(body.password)), DEFAULT_MAX_EVENTS);
  const user = { id: Number(r.lastInsertRowid), email };
  claimInvites(user);
  const token = crypto.randomBytes(32).toString('hex');
  run('INSERT INTO sessions (token, user_id, expires) VALUES (?, ?, ?)', token, user.id, Date.now() + SESSION_DAYS * 864e5);
  setSessionCookie(res, token, SESSION_DAYS * 86400);
  return { ok: true, shared: get('SELECT COUNT(*) AS c FROM event_members WHERE user_id = ?', user.id).c };
}, { public: true });
route('GET', '/api/admin/settings', (req, res, b, p, u) => { if (!isSuper(u)) throw forbid(); return { allow_signup: signupOpen() }; });
route('PUT', '/api/admin/settings', (req, res, body, p, u) => {
  if (!isSuper(u)) throw forbid();
  if (body.allow_signup != null) run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', 'allow_signup', body.allow_signup ? '1' : '0');
  return { ok: true };
});

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

// utilizadores — só o super admin
const USER_COLS = `u.id, u.email, u.name, u.role, u.active, u.max_events, u.created_at,
  (SELECT COUNT(*) FROM events WHERE user_id = u.id) AS events`;
function needSuper(u) { if (!isSuper(u)) throw forbid('Só o super admin gere utilizadores'); }
const maxEv = (v, def) => (v == null || v === '' ? def : Math.max(0, parseInt(v, 10) || 0));
route('GET', '/api/users', (req, res, b, p, u) => { needSuper(u); return all(`SELECT ${USER_COLS} FROM users u ORDER BY (u.role = 'superadmin') DESC, u.name COLLATE NOCASE`); });
route('POST', '/api/users', (req, res, body, p, u) => {
  needSuper(u);
  const role = ROLES.includes(body.role) ? body.role : 'user';
  const email = s(body.email, 200); if (!/^\S+@\S+$/.test(email)) throw bad('Email inválido');
  if (get('SELECT id FROM users WHERE email = ?', email)) throw bad('Esse email já existe');
  const pw = s(body.password) || crypto.randomBytes(6).toString('base64url');
  if (pw.length < 6) throw bad('Password com pelo menos 6 caracteres');
  const r = run('INSERT INTO users (email, name, role, pass, max_events) VALUES (?, ?, ?, ?, ?)', email, s(body.name, 120), role, hashPass(pw), maxEv(body.max_events, DEFAULT_MAX_EVENTS));
  return { id: Number(r.lastInsertRowid), password: pw };
});
route('PUT', '/api/users/:id', (req, res, body, p, u) => {
  needSuper(u);
  const t = get('SELECT * FROM users WHERE id = ?', p.id); if (!t) throw notFound();
  const role = ROLES.includes(body.role) ? body.role : t.role;
  if (t.id === u.id && role !== t.role) throw bad('Não podes mudar o teu próprio papel');
  const active = body.active == null ? t.active : (body.active ? 1 : 0);
  if (t.id === u.id && !active) throw bad('Não te podes desativar a ti próprio');
  run('UPDATE users SET name = ?, role = ?, active = ?, max_events = ? WHERE id = ?', s(body.name ?? t.name, 120), role, active, maxEv(body.max_events, t.max_events), t.id);
  if (body.password) {
    if (String(body.password).length < 6) throw bad('Password com pelo menos 6 caracteres');
    run('UPDATE users SET pass = ? WHERE id = ?', hashPass(body.password), t.id);
    run('DELETE FROM sessions WHERE user_id = ? AND user_id != ?', t.id, u.id);
  }
  if (!active) run('DELETE FROM sessions WHERE user_id = ?', t.id);
  return { ok: true };
});
route('DELETE', '/api/users/:id', (req, res, b, p, u) => {
  needSuper(u);
  const t = get('SELECT * FROM users WHERE id = ?', p.id); if (!t) throw notFound();
  if (t.id === u.id) throw bad('Não te podes apagar a ti próprio');
  run('DELETE FROM users WHERE id = ?', t.id); // apaga também os eventos dele
  return { ok: true };
});

// events
class LimitError extends HttpError { constructor(max) { super(409, `Chegaste ao limite de ${max} eventos. Apaga eventos passados para poderes criar um novo.`); this.limit = max; } }
function checkLimit(userId) {
  const owner = get('SELECT role, max_events FROM users WHERE id = ?', userId);
  if (!owner || owner.role === 'superadmin' || !(owner.max_events > 0)) return;
  const c = get('SELECT COUNT(*) AS c FROM events WHERE user_id = ?', userId).c;
  if (c >= owner.max_events) throw new LimitError(owner.max_events);
}
route('GET', '/api/limits', (req, res, b, p, u) => {
  if (isSuper(u)) return { max: 0, used: 0 };
  return { max: u.max_events || 0, used: get('SELECT COUNT(*) AS c FROM events WHERE user_id = ?', u.id).c };
});
route('GET', '/api/events', (req, res, b, p, u, query) => {
  const archived = query.get('archived') === '1' ? 1 : 0;
  const base = `SELECT e.*, us.name AS owner_name, us.email AS owner_email, (e.user_id = ${Number(u.id)}) AS is_owner,
    (SELECT COUNT(*) FROM event_members WHERE event_id = e.id) AS member_count,
    (SELECT COUNT(*) FROM mics WHERE event_id = e.id) AS mic_count,
    (SELECT COUNT(*) FROM blocks WHERE event_id = e.id) AS block_count,
    (SELECT COUNT(*) FROM mics WHERE event_id = e.id AND battery <= 1) AS low_batt
    FROM events e JOIN users us ON us.id = e.user_id WHERE e.archived = ?`;
  const all_ = query.get('all') === '1'; // todos os estados (para o aviso de limite)
  const where = all_ ? base.replace('WHERE e.archived = ?', 'WHERE (e.archived = ? OR 1)') : base;
  if (isSuper(u)) {
    const owner = Number(query.get('user')) || 0;
    return owner ? all(where + ' AND e.user_id = ? ORDER BY e.date DESC, e.id DESC', archived, owner) : all(where + ' ORDER BY e.date DESC, e.id DESC', archived);
  }
  return all(where + ' AND (e.user_id = ? OR e.id IN (SELECT event_id FROM event_members WHERE user_id = ? OR email = ?)) ORDER BY e.date DESC, e.id DESC', archived, u.id, u.id, u.email);
});
route('POST', '/api/events', (req, res, body, p, u) => {
  checkLimit(u.id);
  const name = s(body.name, 160); if (!name) throw bad('Nome do evento obrigatório');
  const r = run('INSERT INTO events (user_id, name, date, venue, notes, air_mode) VALUES (?, ?, ?, ?, ?, ?)', u.id, name, s(body.date, 20), s(body.venue, 200), s(body.notes, 4000), ['auto', 'ask', 'manual'].includes(body.air_mode) ? body.air_mode : 'ask');
  const id = Number(r.lastInsertRowid);
  if (body.template === 'standard') {
    const preset = [['Head', 'headset'], ['Púlpito', 'pulpito'], ['1', 'mao'], ['2', 'mao'], ['3', 'mao'], ['4', 'mao'], ['5', 'lapela'], ['6', 'lapela'], ['7', 'lapela'], ['8', 'lapela']];
    preset.forEach(([l, t], i) => run('INSERT INTO mics (event_id, label, type, color, sort) VALUES (?, ?, ?, ?, ?)', id, l, t, DEFAULT_COLORS[i % DEFAULT_COLORS.length], i));
  }
  return { id };
});
route('GET', '/api/events/:id', (req, res, b, p, u) => {
  const ev = eventFor(u, p.id);
  return { ...fullEvent(ev), access: { owner: ev.user_id === u.id, manage: canManage(u, ev) }, members: membersOf(ev.id) };
});
function membersOf(evId) {
  return all(`SELECT m.id, m.email, m.user_id, m.created_at, us.name FROM event_members m LEFT JOIN users us ON us.id = m.user_id
    WHERE m.event_id = ? ORDER BY m.id`, evId).map((m) => ({ ...m, pending: !m.user_id }));
}
route('POST', '/api/events/:id/members', (req, res, body, p, u) => {
  const ev = eventFor(u, p.id);
  if (!canManage(u, ev)) throw forbid('Só o dono do evento pode adicionar colegas');
  const emails = String(body.email || '').split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
  if (!emails.length) throw bad('Escreve o email do colega');
  const added = [];
  for (const email of emails) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw bad(`Email inválido: ${email}`);
    const owner = get('SELECT email FROM users WHERE id = ?', ev.user_id);
    if (owner && owner.email.toLowerCase() === email) continue;
    const usr = get('SELECT id FROM users WHERE email = ?', email);
    run('INSERT OR IGNORE INTO event_members (event_id, email, user_id, added_by) VALUES (?, ?, ?, ?)', ev.id, email, usr ? usr.id : null, u.id);
    added.push({ email, has_account: !!usr });
  }
  if (added.length) changed(u, ev.id, `adicionou ${added.map((a) => a.email).join(', ')} à equipa`);
  return { added };
});
route('DELETE', '/api/events/:id/members/:mid', (req, res, b, p, u) => {
  const ev = eventFor(u, p.id);
  const m = get('SELECT * FROM event_members WHERE id = ? AND event_id = ?', p.mid, ev.id); if (!m) throw notFound();
  const self = m.user_id === u.id || String(m.email).toLowerCase() === String(u.email).toLowerCase();
  if (!canManage(u, ev) && !self) throw forbid();
  run('DELETE FROM event_members WHERE id = ?', m.id);
  changed(u, ev.id, self ? 'saiu da equipa do evento' : `removeu ${m.email} da equipa`);
  return { ok: true, left: self };
});
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
  if (body.console_model !== undefined) run('UPDATE events SET console_model = ? WHERE id = ?', s(body.console_model, 120), ev.id);
  run(`UPDATE events SET name = ?, date = ?, venue = ?, notes = ?, current_block_id = ?, archived = ?, air_mode = ?${curBlock !== ev.current_block_id ? ", on_air_at = datetime('now')" : ''} WHERE id = ?`,
    s(body.name ?? ev.name, 160) || ev.name, s(body.date ?? ev.date, 20), s(body.venue ?? ev.venue, 200), s(body.notes ?? ev.notes, 4000),
    curBlock, body.archived == null ? ev.archived : (body.archived ? 1 : 0), airMode, ev.id);
  changed(u, ev.id, eventDiff(ev, body, curBlock, airMode));
  return { ok: true };
});
route('DELETE', '/api/events/:id', (req, res, b, p, u) => {
  const ev = eventFor(u, p.id);
  if (!canManage(u, ev)) throw forbid('Só o dono do evento o pode apagar');
  run('DELETE FROM events WHERE id = ?', ev.id);
  broadcast(ev.id, { deleted: true });
  return { ok: true };
});
route('POST', '/api/events/:id/duplicate', (req, res, body, p, u) => {
  needWrite(u);
  const ev = eventFor(u, p.id);
  const newOwner = isSuper(u) ? ev.user_id : u.id;
  checkLimit(newOwner);
  return tx(() => {
    const r = run('INSERT INTO events (user_id, name, date, venue, notes, air_mode) VALUES (?, ?, ?, ?, ?, ?)', newOwner, s(body.name, 160) || ev.name + ' (cópia)', s(body.date, 20) || ev.date, ev.venue, ev.notes, ev.air_mode);
    const nid = Number(r.lastInsertRowid);
    const micMap = {};
    for (const m of all('SELECT * FROM mics WHERE event_id = ? ORDER BY sort, id', ev.id)) {
      const mr = run('INSERT INTO mics (event_id, label, type, color, channel, frequency, person, battery, notes, sort) VALUES (?,?,?,?,?,?,?,?,?,?)',
        nid, m.label, m.type, m.color, m.channel, m.frequency, body.keep_people ? m.person : '', 3, m.notes, m.sort);
      micMap[m.id] = Number(mr.lastInsertRowid);
    }
    run('UPDATE events SET console_model = ? WHERE id = ?', ev.console_model || '', nid);
    const chMap = {}, outMap = {};
    for (const c of all('SELECT * FROM console_channels WHERE event_id = ?', ev.id))
      chMap[c.id] = Number(run('INSERT INTO console_channels (event_id, num, name, mic_id, input, phantom, notes, sort) VALUES (?,?,?,?,?,?,?,?)', nid, c.num, c.name, c.mic_id ? micMap[c.mic_id] ?? null : null, c.input, c.phantom, c.notes, c.sort).lastInsertRowid);
    for (const o of all('SELECT * FROM console_outputs WHERE event_id = ?', ev.id))
      outMap[o.id] = Number(run('INSERT INTO console_outputs (event_id, name, dest, sort) VALUES (?,?,?,?)', nid, o.name, o.dest, o.sort).lastInsertRowid);
    for (const r of all('SELECT r.* FROM console_routes r JOIN console_channels c ON c.id = r.channel_id WHERE c.event_id = ?', ev.id))
      run('INSERT INTO console_routes (channel_id, output_id) VALUES (?,?)', chMap[r.channel_id], outMap[r.output_id]);
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
  changed(u, ev.id, `importou o alinhamento da folha (${res2.blocks} blocos, ${res2.slots} oradores)`);
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
  changed(u, ev.id, `adicionou o micro ${f.label}${f.person ? ' (' + f.person + ')' : ''}`);
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
  changed(u, m.event_id, micDiff(m, f, body));
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
  changed(u, m.event_id, `apagou o micro ${m.label}`);
  return { ok: true };
});
route('POST', '/api/events/:id/mics/order', (req, res, body, p, u) => {
  needWrite(u);
  const ev = eventFor(u, p.id);
  tx(() => (body.ids || []).forEach((id, i) => run('UPDATE mics SET sort = ? WHERE id = ? AND event_id = ?', i, Number(id), ev.id)));
  changed(u, ev.id, 'reordenou os micros');
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
  changed(u, ev.id, `criou o ${kind === 'intervalo' ? 'intervalo' : 'bloco'} ${normTime(body.start_time) || ''} ${s(body.title)}`.replace(/\s+/g, ' ').trim() + ((body.slots || []).filter((x) => s(x.speaker)).length ? ` com ${(body.slots || []).filter((x) => s(x.speaker)).map((x) => s(x.speaker)).join(', ')}` : ''));
  return { id: bid };
});
route('PUT', '/api/blocks/:id', (req, res, body, p, u) => {
  needWrite(u);
  const b = blockFor(u, p.id);
  run('UPDATE blocks SET start_time=?, end_time=?, title=?, kind=?, notes=? WHERE id=?',
    body.start_time === undefined ? b.start_time : normTime(body.start_time), body.end_time === undefined ? b.end_time : normTime(body.end_time),
    s(body.title ?? b.title, 200), body.kind ? (body.kind === 'intervalo' ? 'intervalo' : 'painel') : b.kind, s(body.notes ?? b.notes, 2000), b.id);
  { const nt = body.start_time === undefined ? b.start_time : normTime(body.start_time); changed(u, b.event_id, nt !== b.start_time ? `mudou a hora do bloco ${b.start_time || '--:--'} para ${nt || '--:--'}` : `editou o bloco ${b.start_time || ''} ${s(body.title ?? b.title)}`.trim()); }
  return { ok: true };
});
route('DELETE', '/api/blocks/:id', (req, res, b, p, u) => {
  needWrite(u);
  const bl = blockFor(u, p.id);
  run('DELETE FROM blocks WHERE id = ?', bl.id);
  run('UPDATE events SET current_block_id = NULL WHERE id = ? AND current_block_id = ?', bl.event_id, bl.id);
  changed(u, bl.event_id, `apagou o bloco ${bl.start_time || ''} ${bl.title || ''}`.trim());
  return { ok: true };
});

// slots
route('POST', '/api/blocks/:id/slots', (req, res, body, p, u) => {
  needWrite(u);
  const b = blockFor(u, p.id);
  const mic = body.mic_id ? get('SELECT id FROM mics WHERE id = ? AND event_id = ?', Number(body.mic_id), b.event_id) : null;
  const sort = get('SELECT COALESCE(MAX(sort),0) AS m FROM slots WHERE block_id = ?', b.id).m + 1;
  const r = run('INSERT INTO slots (block_id, speaker, role, mic_id, sort) VALUES (?,?,?,?,?)', b.id, s(body.speaker, 160), s(body.role, 80), mic ? mic.id : null, sort);
  changed(u, b.event_id, `adicionou ${s(body.speaker, 160)} ao bloco ${b.start_time || ''}${mic ? ' com o micro ' + micLabel(mic.id) : ''}`);
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
  changed(u, sl.event_id, slotDiff(sl, body, micId, blockId));
  return { ok: true };
});
route('DELETE', '/api/slots/:id', (req, res, b, p, u) => {
  needWrite(u);
  const sl = slotFor(u, p.id);
  run('DELETE FROM slots WHERE id = ?', sl.id);
  changed(u, sl.event_id, `removeu ${sl.speaker} do bloco ${blkTime(sl.block_id)}`);
  return { ok: true };
});
route('POST', '/api/blocks/:id/order', (req, res, body, p, u) => {
  needWrite(u);
  const b = blockFor(u, p.id);
  tx(() => (body.ids || []).forEach((id, i) => run('UPDATE slots SET sort = ? WHERE id = ? AND block_id = ?', i + 1, Number(id), b.id)));
  changed(u, b.event_id, `reordenou os oradores do bloco ${b.start_time || ''}`);
  return { ok: true };
});

// mesa de som — canais (entradas), saídas e matriz
const chFor = (u, id) => { const c = get('SELECT * FROM console_channels WHERE id = ?', Number(id)); if (!c) throw notFound(); eventFor(u, c.event_id); return c; };
const outFor = (u, id) => { const o = get('SELECT * FROM console_outputs WHERE id = ?', Number(id)); if (!o) throw notFound(); eventFor(u, o.event_id); return o; };
const micOf = (evId, id) => (id ? get('SELECT id FROM mics WHERE id = ? AND event_id = ?', Number(id), evId)?.id ?? null : null);
// o nº do canal na mesa fica também no micro (aparece no cartão do micro e no Ao vivo)
function syncMicChannel(chId) { const c = get('SELECT mic_id, num FROM console_channels WHERE id = ?', chId); if (c?.mic_id && c.num) run('UPDATE mics SET channel = ? WHERE id = ?', c.num, c.mic_id); }
const nextSort = (table, evId) => get(`SELECT COALESCE(MAX(sort),0) AS m FROM ${table} WHERE event_id = ?`, evId).m + 1;
route('POST', '/api/events/:id/channels', (req, res, body, p, u) => {
  const ev = eventFor(u, p.id);
  const r = run('INSERT INTO console_channels (event_id, num, name, mic_id, input, phantom, notes, sort) VALUES (?,?,?,?,?,?,?,?)',
    ev.id, s(body.num, 10), s(body.name, 80), micOf(ev.id, body.mic_id), s(body.input, 40), body.phantom ? 1 : 0, s(body.notes, 300), nextSort('console_channels', ev.id));
  syncMicChannel(Number(r.lastInsertRowid));
  changed(u, ev.id, `criou o canal ${s(body.num)} ${s(body.name)} na mesa`); return { id: Number(r.lastInsertRowid) };
});
route('PUT', '/api/channels/:id', (req, res, body, p, u) => {
  const c = chFor(u, p.id);
  run('UPDATE console_channels SET num=?, name=?, mic_id=?, input=?, phantom=?, notes=? WHERE id=?',
    s(body.num ?? c.num, 10), s(body.name ?? c.name, 80), body.mic_id === undefined ? c.mic_id : micOf(c.event_id, body.mic_id),
    s(body.input ?? c.input, 40), body.phantom == null ? c.phantom : (body.phantom ? 1 : 0), s(body.notes ?? c.notes, 300), c.id);
  syncMicChannel(c.id);
  changed(u, c.event_id, `editou o canal ${s(body.num ?? c.num)} ${s(body.name ?? c.name)} da mesa`); return { ok: true };
});
route('DELETE', '/api/channels/:id', (req, res, b, p, u) => { const c = chFor(u, p.id); run('DELETE FROM console_channels WHERE id = ?', c.id); changed(u, c.event_id, `apagou o canal ${c.num} ${c.name} da mesa`); return { ok: true }; });
route('POST', '/api/events/:id/outputs', (req, res, body, p, u) => {
  const ev = eventFor(u, p.id);
  const names = Array.isArray(body.names) ? body.names : [body.name];
  tx(() => names.forEach((n) => { if (s(n)) run('INSERT INTO console_outputs (event_id, name, dest, sort) VALUES (?,?,?,?)', ev.id, s(n, 40), s(body.dest, 80), nextSort('console_outputs', ev.id)); }));
  changed(u, ev.id, `criou na mesa a(s) saída(s) ${names.filter((n) => s(n)).join(', ')}`); return { ok: true };
});
route('PUT', '/api/outputs/:id', (req, res, body, p, u) => {
  const o = outFor(u, p.id);
  run('UPDATE console_outputs SET name=?, dest=? WHERE id=?', s(body.name ?? o.name, 40), s(body.dest ?? o.dest, 80), o.id);
  changed(u, o.event_id, `editou a saída da mesa ${o.name}`); return { ok: true };
});
route('DELETE', '/api/outputs/:id', (req, res, b, p, u) => { const o = outFor(u, p.id); run('DELETE FROM console_outputs WHERE id = ?', o.id); changed(u, o.event_id, `apagou a saída da mesa ${o.name}`); return { ok: true }; });
route('POST', '/api/events/:id/routes', (req, res, body, p, u) => {
  const ev = eventFor(u, p.id);
  const c = get('SELECT id FROM console_channels WHERE id = ? AND event_id = ?', Number(body.channel_id), ev.id);
  const o = get('SELECT id FROM console_outputs WHERE id = ? AND event_id = ?', Number(body.output_id), ev.id);
  if (!c || !o) throw bad('Canal ou saída inválidos');
  if (body.on) run('INSERT OR IGNORE INTO console_routes (channel_id, output_id) VALUES (?,?)', c.id, o.id);
  else run('DELETE FROM console_routes WHERE channel_id = ? AND output_id = ?', c.id, o.id);
  { const cc = get('SELECT num, name FROM console_channels WHERE id = ?', c.id), oo = get('SELECT name FROM console_outputs WHERE id = ?', o.id); changed(u, ev.id, `${body.on ? 'ligou' : 'desligou'} na mesa o canal ${cc.num} ${cc.name} → ${oo.name}`); } return { ok: true };
});
// criar um canal por cada micro que ainda não tenha canal
route('POST', '/api/events/:id/channels/from-mics', (req, res, body, p, u) => {
  const ev = eventFor(u, p.id);
  const n = tx(() => {
    const used = new Set(all('SELECT mic_id FROM console_channels WHERE event_id = ? AND mic_id IS NOT NULL', ev.id).map((r) => r.mic_id));
    const taken = new Set(all('SELECT num FROM console_channels WHERE event_id = ?', ev.id).map((r) => parseInt(r.num, 10)).filter((x) => x > 0));
    const mics_ = all('SELECT * FROM mics WHERE event_id = ? ORDER BY sort, id', ev.id).filter((m) => !used.has(m.id));
    // micros que já têm canal definido reservam esse número primeiro
    const want = new Map();
    for (const m of mics_) { const c = parseInt(m.channel, 10); if (c > 0 && !taken.has(c)) { taken.add(c); want.set(m.id, c); } }
    const nextFree = () => { let n = 1; while (taken.has(n)) n++; taken.add(n); return n; };
    const outs = all('SELECT id FROM console_outputs WHERE event_id = ?', ev.id);
    const TN = { mao: 'Mão', lapela: 'Lapela', headset: 'Headset', instrumento: 'Instrumento', pulpito: 'Púlpito', ambiente: 'Ambiente', outro: 'Micro' };
    let count = 0;
    for (const m of mics_) {
      const num = String(want.get(m.id) || nextFree());
      const name = (m.person ? `${m.label} · ${m.person}` : /^\d+$/.test(m.label) ? `${TN[m.type] || 'Micro'} ${m.label}` : m.label).slice(0, 80);
      const cid = Number(run('INSERT INTO console_channels (event_id, num, name, mic_id, sort) VALUES (?,?,?,?,?)', ev.id, num, name, m.id, nextSort('console_channels', ev.id)).lastInsertRowid);
      run('UPDATE mics SET channel = ? WHERE id = ?', num, m.id);
      if (body.route_first && outs[0]) run('INSERT OR IGNORE INTO console_routes (channel_id, output_id) VALUES (?,?)', cid, outs[0].id);
      count++;
    }
    return count;
  });
  changed(u, ev.id, `criou ${n} canais na mesa a partir dos micros`); return { created: n };
});

// histórico do evento
route('GET', '/api/events/:id/log', (req, res, b, p, u, query) => {
  const ev = eventFor(u, p.id);
  const lim = Math.min(1000, Math.max(1, Number(query.get('limit')) || 300));
  const who = Number(query.get('user')) || 0;
  return who ? all('SELECT id, user_id, user_name, msg, at FROM event_log WHERE event_id = ? AND user_id = ? ORDER BY id DESC LIMIT ?', ev.id, who, lim)
    : all('SELECT id, user_id, user_name, msg, at FROM event_log WHERE event_id = ? ORDER BY id DESC LIMIT ?', ev.id, lim);
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
    users: get('SELECT COUNT(*) c FROM users').c,
    events: get('SELECT COUNT(*) c FROM events').c, mics: get('SELECT COUNT(*) c FROM mics').c,
    live_connections: [...streams.values()].reduce((a, x) => a + x.size, 0),
  };
});

// ---------- server ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon' };

const ASSET_VERSION = Date.now().toString(36);
function serveStatic(req, res, pathname) {
  let file = path.normalize(path.join(PUBLIC_DIR, decodeURIComponent(pathname)));
  if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end(); }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(PUBLIC_DIR, 'index.html');
  const ext = path.extname(file);
  if (ext === '.html') {
    // cada arranque do servidor muda a versão dos ficheiros → o browser nunca usa JS/CSS antigos
    const html = fs.readFileSync(file, 'utf8').replace(/(\/app\.(?:js|css))/g, `$1?v=${ASSET_VERSION}`);
    res.writeHead(200, { 'Content-Type': MIME[ext], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    return res.end(html);
  }
  const versioned = new URL(req.url, 'http://x').searchParams.get('v') === ASSET_VERSION;
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': versioned ? 'public, max-age=31536000, immutable' : 'no-cache',
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
    res.end(JSON.stringify({ error: code === 500 ? 'Erro interno' : e.message, ...(e.limit ? { limit: e.limit } : {}) }));
  }
});

server.listen(PORT, () => console.log(`MicDesk a correr em http://0.0.0.0:${PORT}`));
const shutdown = () => { server.close(); try { db.close(); } catch { } process.exit(0); };
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
