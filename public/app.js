/* MicDesk — frontend (vanilla JS, sem build) */
'use strict';

// ---------- utils ----------
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const app = document.getElementById('app');

const TYPES = {
  mao: 'Mão', lapela: 'Lapela', headset: 'Headset', instrumento: 'Instrumento', pulpito: 'Púlpito', ambiente: 'Ambiente', outro: 'Outro',
};
const ICONS = {
  mao: '<path d="M9 3a4 4 0 1 1 6 3.5L12 21h0L9 6.5A4 4 0 0 1 9 3z"/><path d="M8.5 6h7"/>',
  lapela: '<rect x="9" y="3" width="6" height="8" rx="3"/><path d="M12 11v3M9 14h6M12 14c0 4 3 4 3 7"/>',
  headset: '<path d="M5 13a7 7 0 0 1 14 0"/><rect x="3" y="12" width="4" height="6" rx="1.5"/><path d="M7 16c2 3 5 3 8 3"/><circle cx="16" cy="19" r="1.3"/>',
  instrumento: '<path d="M14 4l6 6M17 3l4 4-9 9-4-4z"/><path d="M8 12c-3-1-5 1-5 3s2 5 5 5 4-2 4-4"/><circle cx="7.5" cy="16.5" r="1.2"/>',
  pulpito: '<rect x="10" y="2" width="4" height="5" rx="2"/><path d="M12 7c0 4-4 4-4 8v2M5 17h10l-1 4H6z"/>',
  ambiente: '<circle cx="12" cy="9" r="5"/><path d="M12 14v7M8 21h8M5 5l-2-2M19 5l2-2"/>',
  outro: '<circle cx="12" cy="12" r="8"/><path d="M12 8v5M12 16v.01"/>',
};
const ticon = (t, cls = 'ticon') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[t] || ICONS.outro}</svg>`;
const BATT_LABEL = ['Vazia', '1 traço', '2 traços', 'Cheia'];
const batt = (n) => `<span class="batt b${n}" title="${BATT_LABEL[n]}"><i class="${n >= 1 ? 'f' : ''}"></i><i class="${n >= 2 ? 'f' : ''}"></i><i class="${n >= 3 ? 'f' : ''}"></i></span>`;
const STATUS = { ok: 'Operacional', reserva: 'Reserva', avaria: 'Avaria', off: 'Fora de serviço' };
const AIR_MODES = { auto: 'automático', ask: 'perguntar', manual: 'manual' };
const AIR_MODES_LONG = {
  ask: 'Perguntar — aparece um aviso a pedir autorização quando chega a hora do próximo bloco',
  auto: 'Automático — passa sozinho para o bloco seguinte à hora marcada',
  manual: 'Manual — só muda quando alguém carrega em "Pôr no ar"',
};
const ROLES = { superadmin: 'Super admin', admin: 'Administrador', operator: 'Operador', viewer: 'Só leitura' };

function contrastText(hex) {
  const n = parseInt((hex || '#000000').slice(1), 16);
  const r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) > 170 ? '#111' : '#fff';
}
const chip = (m, cls = '') => m
  ? `<span class="chip ${cls}" style="background:${esc(m.color)};color:${contrastText(m.color)}">${esc(m.label)}</span>`
  : `<span class="chip none ${cls}">—</span>`;

function nowHM() { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
function todayISO() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T12:00:00');
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('pt-PT', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}
function ago(sqlts) {
  if (!sqlts) return '';
  const t = new Date(sqlts.replace(' ', 'T') + 'Z');
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'agora';
  if (m < 60) return `há ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `há ${h} h`;
  return t.toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' });
}

let toastT;
function toast(msg, err = false) {
  $('.toast')?.remove();
  const el = document.createElement('div');
  el.className = 'toast' + (err ? ' err' : '');
  el.textContent = msg;
  document.body.appendChild(el);
  clearTimeout(toastT);
  toastT = setTimeout(() => el.remove(), 3200);
}

async function api(method, url, body) {
  const r = await fetch(url, {
    method, credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await r.json(); } catch { }
  if (r.status === 401 && url !== '/api/login') { state.me = null; go('#/login'); throw new Error('Sessão expirada'); }
  if (!r.ok) { const e = new Error(data?.error || 'Erro ' + r.status); throw e; }
  return data;
}
async function act(fn, okMsg) {
  try { const r = await fn(); if (okMsg) toast(okMsg); return r; } catch (e) { toast(e.message, true); throw e; }
}

// ---------- modal ----------
function modal(title, bodyHtml, { onSubmit, submitLabel = 'Guardar', danger, extraFooter = '', wide } = {}) {
  closeModal();
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<form class="modal" ${wide ? 'style="max-width:720px"' : ''} autocomplete="off">
    <div class="mh"><h2 style="margin:0">${esc(title)}</h2><button type="button" class="btn ghost icon" data-close aria-label="Fechar">✕</button></div>
    <div class="mb">${bodyHtml}</div>
    <div class="mf">${extraFooter}<span class="grow"></span><button type="button" class="btn" data-close>Cancelar</button>
    ${onSubmit ? `<button class="btn ${danger ? 'danger solid' : 'primary'}" type="submit">${esc(submitLabel)}</button>` : ''}</div>
  </form>`;
  document.body.appendChild(bg);
  const form = $('form', bg);
  bg.addEventListener('click', (e) => { if (e.target === bg || e.target.closest('[data-close]')) closeModal(); });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!onSubmit) return;
    const btn = $('button[type=submit]', form); btn.disabled = true;
    try { const keep = await onSubmit(formData(form), form); if (keep !== true) closeModal(); }
    catch (err) { toast(err.message, true); }
    finally { btn.disabled = false; }
  });
  setTimeout(() => $('input:not([type=hidden]):not([type=color]), textarea', form)?.focus(), 50);
  return form;
}
function closeModal() { $('.modal-bg')?.remove(); if (state.pendingRender) { state.pendingRender = false; render(); } }
function formData(form) {
  const o = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') o[el.name] = el.checked;
    else o[el.name] = el.value;
  }
  return o;
}
function confirmBox(title, text, label = 'Apagar') {
  return new Promise((resolve) => {
    modal(title, `<p class="muted">${esc(text)}</p>`, { onSubmit: () => resolve(true), submitLabel: label, danger: true });
    $('.modal-bg').addEventListener('click', (e) => { if (e.target.closest('[data-close]') || e.target.classList.contains('modal-bg')) resolve(false); });
  });
}

// ---------- state & routing ----------
const state = { me: null, types: [], colors: [], ev: null, evId: null, es: null, live: false, pendingRender: false, filterType: 'all', showArchived: false };

function go(hash) { if (location.hash !== hash) location.hash = hash; else render(); }
window.addEventListener('hashchange', () => { $('.modal-bg')?.remove(); state.pendingRender = false; render(); });

function parseRoute() {
  const h = location.hash.replace(/^#/, '') || '/';
  const parts = h.split('/').filter(Boolean);
  return parts;
}

async function boot() {
  try {
    const me = await fetch('/api/me', { credentials: 'same-origin' });
    if (me.ok) { const d = await me.json(); state.me = d.user; state.types = d.types; state.colors = d.colors; }
  } catch { }
  render();
}

async function render() {
  if ($('.modal-bg')) { state.pendingRender = true; return; }
  const parts = parseRoute();
  app.onclick = app.onchange = app.onsubmit = null;
  if (!state.me) { stopStream(); return renderLogin(); }
  if (parts[0] === 'login') return go('#/');
  if (parts[0] === 'e' && parts[1]) {
    const id = Number(parts[1]);
    const tab = parts[2] || 'rundown';
    if (state.evId !== id || !state.ev) {
      state.evId = id; state.ev = null;
      app.innerHTML = shell('<div class="empty">A carregar…</div>');
      try { await loadEvent(); } catch (e) { app.innerHTML = shell(`<div class="empty">${esc(e.message)}</div>`); return; }
      startStream(id);
      setTimeout(() => checkAir().catch(() => { }), 500);
    }
    return renderEvent(tab);
  }
  stopStream(); state.ev = null; state.evId = null;
  if (parts[0] === 'admin') return renderAdmin(parts[1] || (state.me.role === 'superadmin' ? 'orgs' : 'users'));
  if (parts[0] === 'account') return renderAccount();
  return renderHome();
}

async function loadEvent() { state.ev = await api('GET', `/api/events/${state.evId}`); }

let reloadT;
function scheduleReload() {
  clearTimeout(reloadT);
  reloadT = setTimeout(async () => {
    if (!state.evId) return;
    try { await loadEvent(); } catch { return; }
    const ap = $('[data-airprompt]');
    if (ap && Number(ap.dataset.airprompt) === state.ev.event.current_block_id) closeModal();
    setTimeout(() => checkAir().catch(() => { }), 300);
    const ae = document.activeElement;
    if (ae && ae.closest && ae.closest('.addslot') && ae.value) { state.pendingRender = true; return; }
    render();
  }, 120);
}
function startStream(id) {
  stopStream();
  const es = new EventSource(`/api/events/${id}/stream`);
  es.onmessage = (m) => {
    try { const d = JSON.parse(m.data); if (d.deleted) { toast('Este evento foi apagado'); go('#/'); return; } } catch { }
    scheduleReload();
  };
  es.onopen = () => { state.live = true; $('.livedot')?.classList.add('on'); };
  es.onerror = () => { state.live = false; $('.livedot')?.classList.remove('on'); };
  state.es = es;
}
function stopStream() { if (state.es) { state.es.close(); state.es = null; state.live = false; } }
document.addEventListener('visibilitychange', () => { if (!document.hidden && state.evId) scheduleReload(); });

// ---------- shell ----------
const canWrite = () => state.me && state.me.role !== 'viewer';
const isAdmin = () => state.me && (state.me.role === 'admin' || state.me.role === 'superadmin');

function shell(content, { crumb = '', tabs = '' } = {}) {
  const u = state.me;
  return `<header class="topbar">
    <div class="row">
      <div class="row" style="min-width:0;gap:12px">
        <a class="brand" href="#/"><span class="dot"></span>MicDesk</a>
        ${crumb ? `<span class="crumb">${crumb}</span>` : ''}
      </div>
      <div class="menu">
        <button class="btn sm" data-menu>${esc((u.name || u.email).split(' ')[0])} ▾</button>
        <div class="dropdown hide" id="dd">
          <div class="small muted" style="padding:8px 12px">${esc(u.email)}<br>${ROLES[u.role]}${u.org_name ? ' · ' + esc(u.org_name) : ''}</div>
          <hr>
          <a href="#/">Eventos</a>
          ${u.role === 'superadmin' ? '<a href="#/admin/orgs">Clientes</a>' : ''}
          ${isAdmin() ? '<a href="#/admin/users">Utilizadores</a>' : ''}
          <a href="#/account">A minha conta</a>
          <hr>
          <button data-logout>Sair</button>
        </div>
      </div>
    </div>
    ${tabs}
  </header>
  <main>${content}</main>`;
}
document.addEventListener('click', async (e) => {
  const m = e.target.closest('[data-menu]');
  const dd = $('#dd');
  if (m && dd) { dd.classList.toggle('hide'); return; }
  if (dd && !e.target.closest('.dropdown')) dd.classList.add('hide');
  if (e.target.closest('[data-logout]')) { await api('POST', '/api/logout'); state.me = null; stopStream(); go('#/login'); }
});

// ---------- login ----------
function renderLogin() {
  app.innerHTML = `<div class="login"><form class="card" id="lf">
    <div class="brand" style="font-size:22px;margin-bottom:6px"><span class="dot"></span>MicDesk</div>
    <p class="muted" style="margin-top:0">Gestão de microfones e alinhamento de eventos</p>
    <div class="field"><label>Email</label><input name="email" type="email" autocomplete="username" required></div>
    <div class="field"><label>Password</label><input name="password" type="password" autocomplete="current-password" required></div>
    <button class="btn primary" style="width:100%">Entrar</button>
  </form></div>`;
  $('#lf').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('POST', '/api/login', formData(e.target));
      const d = await api('GET', '/api/me');
      state.me = d.user; state.types = d.types; state.colors = d.colors;
      go(location.hash.startsWith('#/e/') ? location.hash : '#/');
    } catch (err) { toast(err.message, true); }
  });
}

// ---------- home (eventos) ----------
async function renderHome() {
  app.innerHTML = shell('<div class="empty">A carregar…</div>');
  const [events, orgs] = await Promise.all([
    api('GET', '/api/events' + (state.showArchived ? '?archived=1' : '')),
    state.me.role === 'superadmin' ? api('GET', '/api/orgs') : Promise.resolve([]),
  ]);
  const today = todayISO();
  const item = (e) => `<a class="card evcard" href="#/e/${e.id}">
      <div class="row" style="justify-content:space-between;align-items:flex-start">
        <div style="min-width:0"><h3>${esc(e.name)}</h3>
          <div class="muted small">${esc(fmtDate(e.date))}${e.venue ? ' · ' + esc(e.venue) : ''}${state.me.role === 'superadmin' ? ' · <span style="color:var(--info)">' + esc(e.org_name) + '</span>' : ''}</div></div>
        ${e.date === today ? '<span class="pill ok">Hoje</span>' : ''}
      </div>
      <div class="pills"><span class="pill">${e.mic_count} micros</span><span class="pill">${e.block_count} blocos</span>
        ${e.low_batt ? `<span class="pill warn">${e.low_batt} pilhas baixas</span>` : ''}</div>
    </a>`;
  const content = `
    <div class="row" style="justify-content:space-between;flex-wrap:wrap">
      <div><h1>Eventos</h1><div class="muted small">${state.me.org_name ? esc(state.me.org_name) : 'Todos os clientes'}</div></div>
      <div class="row">
        <div class="seg"><button data-arch="0" class="${!state.showArchived ? 'on' : ''}">Ativos</button><button data-arch="1" class="${state.showArchived ? 'on' : ''}">Arquivo</button></div>
        ${canWrite() ? '<button class="btn primary" id="newev">+ Novo evento</button>' : ''}
      </div>
    </div>
    <div class="list" style="margin-top:16px">${events.length ? events.map(item).join('') : `<div class="card empty">${state.showArchived ? 'Sem eventos arquivados.' : 'Ainda não há eventos. Cria o primeiro.'}</div>`}</div>`;
  app.innerHTML = shell(content);
  $$('[data-arch]').forEach((b) => b.onclick = () => { state.showArchived = b.dataset.arch === '1'; renderHome(); });
  $('#newev')?.addEventListener('click', () => newEventModal(orgs));
}
function newEventModal(orgs) {
  const sa = state.me.role === 'superadmin';
  if (sa && !orgs.length) { toast('Cria primeiro um cliente em Clientes', true); return go('#/admin/orgs'); }
  modal('Novo evento', `
    ${sa ? `<div class="field"><label>Cliente</label><select name="org_id" required>${orgs.map((o) => `<option value="${o.id}">${esc(o.name)}</option>`).join('')}</select></div>` : ''}
    <div class="field"><label>Nome do evento</label><input name="name" required placeholder="Ex: CCB 13.11.2026"></div>
    <div class="grid2"><div class="field"><label>Data</label><input name="date" type="date" value="${todayISO()}"></div>
    <div class="field"><label>Local / Sala</label><input name="venue" placeholder="Ex: CCB — Sala 2"></div></div>
    <div class="field"><label>Passagem para ON AIR</label><select name="air_mode">${Object.entries(AIR_MODES_LONG).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
    <div class="field"><label>Começar com</label><select name="template">
      <option value="standard">10 micros base (Head, Púlpito, 1–4 mão, 5–8 lapela)</option>
      <option value="">Vazio</option></select></div>`, {
    submitLabel: 'Criar',
    onSubmit: async (d) => { const r = await api('POST', '/api/events', d); go(`#/e/${r.id}/rundown`); },
  });
}

// ---------- analysis ----------
function analyze() {
  const { mics, blocks, event } = state.ev;
  const micById = Object.fromEntries(mics.map((m) => [m.id, m]));
  const uses = {}; // mic_id -> [{block, slot}]
  const slotInfo = {}; // slot_id -> {dup, from}
  const lastHolder = {}; // mic_id -> {speaker, block}
  for (const b of blocks) {
    if (b.kind === 'intervalo') continue;
    const count = {};
    for (const sl of b.slots) if (sl.mic_id) count[sl.mic_id] = (count[sl.mic_id] || 0) + 1;
    for (const sl of b.slots) {
      const info = { dup: false, from: null };
      if (sl.mic_id) {
        (uses[sl.mic_id] ||= []).push({ block: b, slot: sl });
        const shared = ['pulpito', 'ambiente'].includes(micById[sl.mic_id]?.type); // micros fixos podem ser partilhados
        if (count[sl.mic_id] > 1 && !shared) info.dup = true;
        const prev = lastHolder[sl.mic_id];
        if (prev && !shared &&prev.speaker.trim().toLowerCase() !== sl.speaker.trim().toLowerCase()) info.from = prev;
      }
      slotInfo[sl.id] = info;
    }
    for (const sl of b.slots) if (sl.mic_id) lastHolder[sl.mic_id] = { speaker: sl.speaker, block: b };
  }
  // bloco no ar (só o que foi colocado no ar — manual, com confirmação ou automático)
  let currentId = blocks.find((b) => b.id === event.current_block_id) ? event.current_block_id : null;
  const idx = blocks.findIndex((b) => b.id === currentId);
  // bloco cuja hora já chegou
  let dueIdx = -1;
  if (!event.date || event.date === todayISO()) {
    const now = nowHM();
    blocks.forEach((b, i) => { if (b.start_time && b.start_time <= now) dueIdx = i; });
  }
  return { micById, uses, slotInfo, currentId, currentIdx: idx, dueIdx };
}

function micSelect(slot, mics, micById) {
  const m = micById[slot.mic_id];
  const style = m ? `background:${esc(m.color)};color:${contrastText(m.color)}` : '';
  return `<select class="micsel ${m ? '' : 'none'}" data-slotmic="${slot.id}" style="${style}" ${canWrite() ? '' : 'disabled'} aria-label="Micro">
    <option value="">—</option>${mics.map((x) => `<option value="${x.id}" ${x.id === slot.mic_id ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}
  </select>`;
}

// ---------- event page ----------
function renderEvent(tab) {
  const { event, org } = state.ev;
  const tabs = `<nav class="tabs">
    ${[['rundown', 'Alinhamento'], ['mics', 'Micros'], ['live', 'Ao vivo'], ['settings', 'Evento']].map(([k, l]) => `<a class="tab ${tab === k ? 'on' : ''}" href="#/e/${event.id}/${k}">${l}</a>`).join('')}
  </nav>`;
  const crumb = `<span class="livedot ${state.live ? 'on' : ''}" title="Sincronização em tempo real"></span>${esc(event.name)}`;
  let content = '';
  if (tab === 'mics') content = viewMics();
  else if (tab === 'live') content = viewLive();
  else if (tab === 'settings') content = viewSettings();
  else content = viewRundown();
  const head = tab === 'live' ? '' : `<div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:6px">
      <div style="min-width:0"><h1>${esc(event.name)}</h1><div class="muted small">${esc(fmtDate(event.date))}${event.venue ? ' · ' + esc(event.venue) : ''}${state.me.role === 'superadmin' ? ' · ' + esc(org?.name || '') : ''}</div></div></div>`;
  app.innerHTML = shell(head + content, { crumb, tabs });
  bindEvent(tab);
}

// ---- alinhamento ----
function viewRundown() {
  const { mics, blocks } = state.ev;
  const a = analyze();
  const w = canWrite();
  const toolbar = `<div class="toolbar noprint">
    ${w ? `<button class="btn primary" data-addblock="painel">+ Bloco / Painel</button>
    <button class="btn" data-addblock="intervalo">+ Intervalo</button>
    <button class="btn" data-import>Importar da folha</button>` : ''}
    <span class="grow"></span>
    <a class="pill" href="#/e/${state.evId}/settings" title="Mudar em Evento">Modo ON AIR: ${AIR_MODES[state.ev.event.air_mode] || ''}</a>
    <button class="btn" onclick="window.print()">Imprimir</button>
  </div>`;
  if (!blocks.length) return toolbar + `<div class="card empty">Ainda não há alinhamento.<br><br>Cria blocos (cada bloco = uma hora com um ou mais oradores, como um painel) ou <b>importa</b> diretamente da tua folha Excel/Google Sheets.</div>`;

  const blockHtml = (b, i) => {
    const isCur = b.id === a.currentId;
    const past = a.currentIdx >= 0 && i < a.currentIdx;
    if (b.kind === 'intervalo') {
      return `<div class="card block break ${isCur ? 'current' : ''} ${past ? 'past' : ''}"><div class="bh">
        <div class="time">${esc(b.start_time || '--:--')}${b.end_time ? `<small>até ${esc(b.end_time)}</small>` : ''}</div>
        <div class="title">${isCur ? '<span class="onair">ON AIR</span>' : ''}<b>☕ ${esc(b.title || 'Intervalo')}</b>${b.notes ? `<span class="muted small">${esc(b.notes)}</span>` : ''}</div>
        ${w ? `<button class="btn sm ${isCur ? 'airoff' : 'airsoft'}" data-setcur="${b.id}">${isCur ? 'Tirar do ar' : '● Pôr no ar'}</button>
        <button class="btn sm icon ghost" data-editblock="${b.id}" aria-label="Editar">✎</button>` : ''}
      </div></div>`;
    }
    const slots = b.slots.map((sl) => {
      const inf = a.slotInfo[sl.id] || {};
      const m = a.micById[sl.mic_id];
      const warns = [];
      if (inf.dup) warns.push('<span class="pill danger">micro repetido no bloco</span>');
      if (inf.from) warns.push(`<span class="pill info">troca: vem de ${esc(inf.from.speaker)} (${esc(inf.from.block.start_time || '?')})</span>`);
      if (m && m.battery <= 1) warns.push(`<span class="pill ${m.battery === 0 ? 'danger' : 'warn'}">pilhas ${BATT_LABEL[m.battery].toLowerCase()}</span>`);
      if (m && (m.status === 'avaria' || m.status === 'off')) warns.push(`<span class="pill danger">${STATUS[m.status].toLowerCase()}</span>`);
      return `<div class="slot ${sl.done ? 'done' : ''}">
        <button class="check ${sl.done ? 'on' : ''}" data-done="${sl.id}" ${w ? '' : 'disabled'} aria-label="Feito">✓</button>
        <div class="name" ${w ? `data-editslot="${sl.id}" style="cursor:pointer"` : ''}><b>${esc(sl.speaker || '(sem nome)')}</b>
          ${sl.role ? `<span class="muted small">${esc(sl.role)}</span>` : ''}
          ${warns.length ? `<div class="warns">${warns.join('')}</div>` : ''}</div>
        ${m ? batt(m.battery) : ''}
        ${micSelect(sl, mics, a.micById)}
      </div>`;
    }).join('');
    return `<div class="card block ${isCur ? 'current' : ''} ${past ? 'past' : ''}" id="b${b.id}">
      <div class="bh">
        <div class="time">${esc(b.start_time || '--:--')}${b.end_time ? `<small>até ${esc(b.end_time)}</small>` : ''}</div>
        <div class="title">${isCur ? '<span class="onair">ON AIR</span>' : ''}<b>${esc(b.title || (b.slots.length > 1 ? `Painel · ${b.slots.length} oradores` : 'Orador'))}</b>
          ${b.notes ? `<span class="muted small">${esc(b.notes)}</span>` : ''}</div>
        ${w ? `<button class="btn sm ${isCur ? 'airoff' : 'airsoft'}" data-setcur="${b.id}">${isCur ? 'Tirar do ar' : '● Pôr no ar'}</button>
        <button class="btn sm icon ghost" data-editblock="${b.id}" aria-label="Editar">✎</button>` : ''}
      </div>
      ${slots}
      ${w ? `<form class="addslot" data-addslot="${b.id}">
        <input name="speaker" placeholder="+ Adicionar orador" autocomplete="off">
        <select name="mic_id"><option value="">Micro</option>${mics.map((x) => `<option value="${x.id}">${esc(x.label)}</option>`).join('')}</select>
        <button class="btn sm primary" style="min-height:40px">+</button>
      </form>` : ''}
    </div>`;
  };

  const print = `<div class="printonly"><h2>${esc(state.ev.event.name)} — ${esc(fmtDate(state.ev.event.date))}</h2>
    <table class="ptable"><tr><th>Hora</th><th>Orador</th><th>Micro</th><th>✓</th></tr>
    ${blocks.map((b) => b.kind === 'intervalo'
    ? `<tr class="brk"><td>${esc(b.start_time)}</td><td colspan="3">${esc(b.title || 'Intervalo')}</td></tr>`
    : b.slots.map((sl, i) => { const m = a.micById[sl.mic_id]; return `<tr><td>${i === 0 ? esc(b.start_time) : ''}</td><td>${esc(sl.speaker)}</td><td class="m" style="background:${m ? esc(m.color) : '#fff'}">${m ? esc(m.label) : ''}</td><td></td></tr>`; }).join('')).join('')}
    </table></div>`;
  return toolbar + `<div class="blocks screenonly">${blocks.map(blockHtml).join('')}</div>` + print;
}

function blockModal(b) {
  const isNew = !b.id;
  const kind = b.kind || 'painel';
  const { mics } = state.ev;
  const micOpts = `<option value="">—</option>${mics.map((x) => `<option value="${x.id}">${esc(x.label)}${x.person ? ' · ' + esc(x.person) : ''}</option>`).join('')}`;
  const speakerRows = isNew && kind === 'painel' ? `<label>Oradores (um por linha, podes deixar vazio e adicionar depois)</label>
    <div id="newslots">${[0, 1, 2].map(() => `<div class="row" style="margin-bottom:6px"><input name="sp" placeholder="Nome do orador" class="grow"><select name="mi" style="width:130px">${micOpts}</select></div>`).join('')}</div>
    <button type="button" class="btn sm" id="moresp">+ mais um</button>` : '';
  const f = modal(isNew ? (kind === 'intervalo' ? 'Novo intervalo' : 'Novo bloco') : 'Editar bloco', `
    <div class="grid2"><div class="field"><label>Hora início</label><input name="start_time" type="time" value="${esc(b.start_time || '')}"></div>
    <div class="field"><label>Hora fim (opcional)</label><input name="end_time" type="time" value="${esc(b.end_time || '')}"></div></div>
    <div class="field"><label>${kind === 'intervalo' ? 'Nome' : 'Título do painel (opcional)'}</label><input name="title" value="${esc(b.title || (isNew && kind === 'intervalo' ? 'Coffee Break' : ''))}" placeholder="${kind === 'intervalo' ? 'Coffee Break' : 'Ex: Painel Inovação'}"></div>
    <div class="field"><label>Notas</label><input name="notes" value="${esc(b.notes || '')}" placeholder="Ex: vídeo antes, entrada pela esquerda"></div>
    ${!isNew ? `<div class="field"><label>Tipo</label><select name="kind"><option value="painel" ${kind === 'painel' ? 'selected' : ''}>Bloco / Painel</option><option value="intervalo" ${kind === 'intervalo' ? 'selected' : ''}>Intervalo</option></select></div>` : ''}
    ${speakerRows}`, {
    submitLabel: isNew ? 'Criar' : 'Guardar',
    extraFooter: !isNew ? '<button type="button" class="btn danger" id="delblock">Apagar</button>' : '',
    onSubmit: async (d, form) => {
      if (isNew) {
        const sp = $$('[name=sp]', form).map((el) => el.value);
        const mi = $$('[name=mi]', form).map((el) => el.value);
        d.kind = kind;
        d.slots = sp.map((speaker, i) => ({ speaker, mic_id: mi[i] || null })).filter((x) => x.speaker.trim());
        await api('POST', `/api/events/${state.evId}/blocks`, d);
      } else await api('PUT', `/api/blocks/${b.id}`, d);
      scheduleReload();
    },
  });
  $('#moresp', f)?.addEventListener('click', () => {
    const row = document.createElement('div'); row.className = 'row'; row.style.marginBottom = '6px';
    row.innerHTML = `<input name="sp" placeholder="Nome do orador" class="grow"><select name="mi" style="width:130px">${micOpts}</select>`;
    $('#newslots', f).appendChild(row); $('input', row).focus();
  });
  $('#delblock', f)?.addEventListener('click', async () => {
    closeModal();
    if (await confirmBox('Apagar bloco?', `O bloco das ${b.start_time || '--:--'} e os seus ${b.slots?.length || 0} oradores vão ser apagados.`)) {
      await act(() => api('DELETE', `/api/blocks/${b.id}`), 'Bloco apagado'); scheduleReload();
    }
  });
}

function slotModal(sl, block) {
  const { mics, blocks } = state.ev;
  const f = modal('Orador', `
    <div class="field"><label>Nome</label><input name="speaker" value="${esc(sl.speaker)}" required></div>
    <div class="field"><label>Função / Nota (opcional)</label><input name="role" value="${esc(sl.role || '')}" placeholder="Ex: Moderador, Keynote, Q&A"></div>
    <div class="grid2">
      <div class="field"><label>Micro</label><select name="mic_id"><option value="">— sem micro —</option>${mics.map((x) => `<option value="${x.id}" ${x.id === sl.mic_id ? 'selected' : ''}>${esc(x.label)} · ${TYPES[x.type]}${x.person ? ' · ' + esc(x.person) : ''}</option>`).join('')}</select></div>
      <div class="field"><label>Bloco</label><select name="block_id">${blocks.filter((b) => b.kind !== 'intervalo').map((b) => `<option value="${b.id}" ${b.id === block.id ? 'selected' : ''}>${esc(b.start_time || '--:--')} ${esc(b.title || '')}</option>`).join('')}</select></div>
    </div>`, {
    extraFooter: '<button type="button" class="btn danger" id="delslot">Remover</button>',
    onSubmit: async (d) => { await api('PUT', `/api/slots/${sl.id}`, d); scheduleReload(); },
  });
  $('#delslot', f).addEventListener('click', async () => { closeModal(); await act(() => api('DELETE', `/api/slots/${sl.id}`), 'Orador removido'); scheduleReload(); });
}

function importModal() {
  const hasBlocks = state.ev.blocks.length > 0;
  modal('Importar da folha de cálculo', `
    <p class="muted small" style="margin-top:0">No Excel / Google Sheets seleciona as colunas <b>Hora · Orador · Micro</b> (com ou sem cabeçalho), copia e cola aqui.
    Linhas sem hora ficam no mesmo bloco da linha de cima (painel). Linhas como "Coffee Break" sem micro viram intervalo. Micros que não existam são criados automaticamente.</p>
    <div class="field"><textarea name="text" rows="10" placeholder="14:00\tAna Branquinho\tHead\n\tJosé Chaves\tPulpito\n14:20\tRicardo Nogueira\t1\n\tJoão Nunes e Silva\t2\n15:35\tCoffee Break"></textarea></div>
    ${hasBlocks ? '<label class="row" style="color:var(--text)"><input type="checkbox" name="replace" style="width:auto;min-height:0"> Substituir o alinhamento atual</label>' : ''}`, {
    submitLabel: 'Importar', wide: true,
    onSubmit: async (d) => {
      const r = await api('POST', `/api/events/${state.evId}/import`, d);
      toast(`Importado: ${r.blocks} blocos, ${r.slots} oradores${r.mics ? `, ${r.mics} micros novos` : ''}`);
      scheduleReload();
    },
  });
}

// ---- micros ----
function viewMics() {
  const { mics } = state.ev;
  const a = analyze();
  const w = canWrite();
  const ft = state.filterType;
  const list = mics.filter((m) => ft === 'all' || (ft === 'low' ? m.battery <= 1 : m.type === ft));
  const typesPresent = [...new Set(mics.map((m) => m.type))];
  const low = mics.filter((m) => m.battery <= 1).length;
  const broken = mics.filter((m) => m.status === 'avaria').length;
  const card = (m) => {
    const uses = a.uses[m.id] || [];
    const nextUse = uses.find((u) => a.currentIdx < 0 || state.ev.blocks.indexOf(u.block) >= a.currentIdx);
    return `<div class="card mic st-${m.status} ${m.battery === 0 ? 'dead' : m.battery === 1 ? 'low' : ''}">
      <div class="head" ${w ? `data-editmic="${m.id}" style="cursor:pointer"` : ''}>
        ${chip(m, 'lg')}
        <div class="meta">
          <div class="person">${m.person ? esc(m.person) : '<span class="muted">Sem pessoa dedicada</span>'}</div>
          <div class="type">${ticon(m.type)} ${TYPES[m.type] || m.type}${m.channel ? ` · Canal ${esc(m.channel)}` : ''}${m.frequency ? ` · ${esc(m.frequency)}` : ''}</div>
          ${m.status !== 'ok' ? `<span class="pill ${m.status === 'reserva' ? 'info' : 'danger'}">${STATUS[m.status]}</span>` : ''}
        </div>
      </div>
      <div class="battpick" ${w ? '' : 'style="pointer-events:none"'}>
        ${[0, 1, 2, 3].map((n) => `<button type="button" class="b${n} ${m.battery === n ? 'on' : ''}" data-batt="${m.id}:${n}">${batt(n)}<span>${BATT_LABEL[n]}</span></button>`).join('')}
      </div>
      <div class="row" style="justify-content:space-between">
        <span class="small muted">Pilhas: ${m.battery_at ? 'atualizado ' + ago(m.battery_at) : '—'}</span>
        ${w ? `<button class="btn sm" data-newbatt="${m.id}">🔋 Pilhas novas</button>` : ''}
      </div>
      ${m.notes ? `<div class="small muted">${esc(m.notes)}</div>` : ''}
      <div class="uses">${uses.length ? `Usado ${uses.length}× · ${nextUse ? `próximo: <b>${esc(nextUse.block.start_time || '--:--')} ${esc(nextUse.slot.speaker)}</b>` : 'já não volta a ser usado'}` : 'Não está no alinhamento'}</div>
    </div>`;
  };
  return `
    <div class="stats" style="margin-top:14px">
      <div class="card stat"><b>${mics.length}</b><span>micros</span></div>
      <div class="card stat"><b style="color:var(--accent)">${mics.filter((m) => m.battery === 3).length}</b><span>pilhas cheias</span></div>
      <div class="card stat"><b style="color:${low ? 'var(--warn)' : 'inherit'}">${low}</b><span>pilhas baixas / vazias</span></div>
      <div class="card stat"><b style="color:${broken ? 'var(--danger)' : 'inherit'}">${broken}</b><span>em avaria</span></div>
    </div>
    <div class="toolbar">
      <div class="seg">
        <button data-ft="all" class="${ft === 'all' ? 'on' : ''}">Todos</button>
        ${typesPresent.map((t) => `<button data-ft="${t}" class="${ft === t ? 'on' : ''}">${TYPES[t]}</button>`).join('')}
        <button data-ft="low" class="${ft === 'low' ? 'on' : ''}">⚠ Pilhas baixas</button>
      </div>
      <span class="grow"></span>
      ${w ? `<button class="btn" data-allnew>🔋 Todos com pilhas novas</button><button class="btn primary" data-addmic>+ Micro</button>` : ''}
    </div>
    ${list.length ? `<div class="micgrid">${list.map(card).join('')}</div>` : `<div class="card empty">${mics.length ? 'Nenhum micro neste filtro.' : 'Ainda não há micros. Adiciona o primeiro.'}</div>`}`;
}

function micModal(m) {
  const isNew = !m.id;
  const colors = state.colors;
  let type = m.type || 'mao', color = m.color || colors[state.ev.mics.length % colors.length], battery = m.battery ?? 3;
  const f = modal(isNew ? 'Novo micro' : `Micro ${m.label}`, `
    <div class="grid2">
      <div class="field"><label>Nome / Número do micro</label><input name="label" value="${esc(m.label || '')}" required placeholder="Ex: 1, Head, Lapela A"></div>
      <div class="field"><label>Pessoa dedicada (opcional)</label><input name="person" value="${esc(m.person || '')}" placeholder="Quem vai ficar com este micro"></div>
    </div>
    <div class="field"><label>Tipo</label><div class="typepick">${Object.keys(TYPES).map((t) => `<button type="button" data-type="${t}" class="${t === type ? 'on' : ''}">${ticon(t)}${TYPES[t]}</button>`).join('')}</div></div>
    <div class="field"><label>Cor</label><div class="swatches">${colors.map((c) => `<button type="button" data-color="${c}" style="background:${c}" class="${c === color ? 'on' : ''}" aria-label="${c}"></button>`).join('')}
      <input type="color" id="cpick" value="${esc(color)}" style="width:44px;height:34px;padding:2px;min-height:0"></div></div>
    <div class="field"><label>Pilhas</label><div class="battpick">${[0, 1, 2, 3].map((n) => `<button type="button" class="b${n} ${battery === n ? 'on' : ''}" data-bsel="${n}">${batt(n)}<span>${BATT_LABEL[n]}</span></button>`).join('')}</div></div>
    <div class="grid2">
      <div class="field"><label>Canal na mesa</label><input name="channel" value="${esc(m.channel || '')}" placeholder="Ex: 12"></div>
      <div class="field"><label>Frequência / Receptor</label><input name="frequency" value="${esc(m.frequency || '')}" placeholder="Ex: 606.500 MHz"></div>
    </div>
    <div class="field"><label>Estado</label><select name="status">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${k === (m.status || 'ok') ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
    <div class="field"><label>Notas</label><input name="notes" value="${esc(m.notes || '')}" placeholder="Ex: cápsula preta, fita na antena"></div>
    ${!isNew ? '<div id="blog" class="small muted"></div>' : ''}`, {
    submitLabel: isNew ? 'Adicionar' : 'Guardar',
    extraFooter: !isNew ? '<button type="button" class="btn danger" id="delmic">Apagar</button>' : '',
    onSubmit: async (d) => {
      Object.assign(d, { type, color, battery });
      if (isNew) await api('POST', `/api/events/${state.evId}/mics`, d); else await api('PUT', `/api/mics/${m.id}`, d);
      scheduleReload();
    },
  });
  f.addEventListener('click', (e) => {
    const t = e.target.closest('[data-type]'); if (t) { type = t.dataset.type; $$('[data-type]', f).forEach((x) => x.classList.toggle('on', x === t)); }
    const c = e.target.closest('[data-color]'); if (c) { color = c.dataset.color; $('#cpick', f).value = color; $$('[data-color]', f).forEach((x) => x.classList.toggle('on', x === c)); }
    const b = e.target.closest('[data-bsel]'); if (b) { battery = Number(b.dataset.bsel); $$('[data-bsel]', f).forEach((x) => x.classList.toggle('on', x === b)); }
  });
  $('#cpick', f).addEventListener('input', (e) => { color = e.target.value; $$('[data-color]', f).forEach((x) => x.classList.remove('on')); });
  $('#delmic', f)?.addEventListener('click', async () => {
    closeModal();
    if (await confirmBox(`Apagar micro ${m.label}?`, 'Os oradores com este micro ficam sem micro atribuído.')) { await act(() => api('DELETE', `/api/mics/${m.id}`), 'Micro apagado'); scheduleReload(); }
  });
  if (!isNew) api('GET', `/api/mics/${m.id}/log`).then((log) => {
    const el = $('#blog'); if (!el || !log.length) return;
    el.innerHTML = '<label>Histórico de pilhas</label>' + log.slice(0, 8).map((l) => `<div>${batt(l.level)} ${BATT_LABEL[l.level]} · ${esc(l.user_name)} · ${ago(l.at)}</div>`).join('');
  }).catch(() => { });
}

// ---- ao vivo ----
function viewLive() {
  const { blocks, event } = state.ev;
  const a = analyze();
  const w = canWrite();
  const talk = blocks;
  const cur = talk[a.currentIdx];
  let nextIdx = a.currentIdx + 1;
  while (talk[nextIdx] && talk[nextIdx].kind === 'intervalo' && talk[nextIdx + 1]) nextIdx++;
  const next = a.currentIdx >= 0 ? talk[nextIdx] : talk.find((b) => b.kind !== 'intervalo');
  const after = talk.slice(nextIdx + 1).filter((b) => b.kind !== 'intervalo').slice(0, 3);

  const slotLive = (sl) => {
    const m = a.micById[sl.mic_id];
    return `<div class="liveslot ${sl.done ? 'done' : ''}">
      ${chip(m, 'xl')}
      <div class="who">${esc(sl.speaker)}<small>${m ? `${TYPES[m.type]}${m.channel ? ' · canal ' + esc(m.channel) : ''}` : 'sem micro'}${sl.role ? ' · ' + esc(sl.role) : ''}</small></div>
      ${m ? batt(m.battery) : ''}
      <button class="check ${sl.done ? 'on' : ''}" data-done="${sl.id}" ${w ? '' : 'disabled'} style="width:44px;height:44px" aria-label="Feito">✓</button>
    </div>`;
  };
  const airHead = (b) => `<div class="airhead"><span class="onair lg">ON AIR</span><span class="bigtime">${esc(b.start_time || '--:--')}${b.end_time ? `<small> – ${esc(b.end_time)}</small>` : ''}</span></div>`;
  const curHtml = cur
    ? (cur.kind === 'intervalo'
      ? `<div class="card aircard">${airHead(cur)}<h1>☕ ${esc(cur.title || 'Intervalo')}</h1></div>`
      : `<div class="card aircard">${airHead(cur)}
        ${cur.title ? `<h2>${esc(cur.title)}</h2>` : ''}${cur.notes ? `<p class="muted">${esc(cur.notes)}</p>` : ''}
        ${cur.slots.map(slotLive).join('') || '<p class="muted">Sem oradores</p>'}</div>`)
    : `<div class="card empty">${blocks.length ? 'Nada no ar.<br><br>' + (w ? 'Carrega em <b>● Pôr no ar</b> para colocar o primeiro bloco no ar.' : '') : 'Sem alinhamento.'}</div>`;

  const nextHtml = next ? `<div class="card">
      <div class="label-up">A seguir</div><div class="bigtime" style="margin-bottom:8px">${esc(next.start_time || '--:--')}</div>
      ${next.kind === 'intervalo' ? `<h2>☕ ${esc(next.title || 'Intervalo')}</h2>` : `
      ${next.title ? `<h3 style="margin-bottom:8px">${esc(next.title)}</h3>` : ''}
      ${next.slots.map((sl) => {
    const m = a.micById[sl.mic_id];
    const inf = a.slotInfo[sl.id] || {};
    const fromCur = inf.from && cur && inf.from.block.id === cur.id;
    let prep = '';
    if (!m) prep = '<span class="pill danger">sem micro</span>';
    else if (inf.dup) prep = '<span class="pill danger">micro repetido</span>';
    else if (inf.from) prep = `<span class="pill ${fromCur ? 'warn' : 'info'}">recolher de ${esc(inf.from.speaker)}</span>`;
    else prep = '<span class="pill ok">livre</span>';
    const bw = m && m.battery <= 1 ? `<span class="pill ${m.battery ? 'warn' : 'danger'}">pilhas ${BATT_LABEL[m.battery].toLowerCase()}</span>` : '';
    return `<div class="handover">${chip(m, 'lg')}<div class="grow"><b>${esc(sl.speaker)}</b><div class="pills" style="margin-top:4px">${prep}${bw}</div></div>${m ? batt(m.battery) : ''}</div>`;
  }).join('')}`}
    </div>` : '<div class="card muted">Fim do alinhamento.</div>';

  const laterHtml = after.length ? `<div class="card"><div class="label-up">Depois</div>${after.map((b) => `<div class="handover"><b style="min-width:52px">${esc(b.start_time)}</b><span class="grow">${b.slots.map((sl) => `${esc(sl.speaker)} ${a.micById[sl.mic_id] ? chip(a.micById[sl.mic_id]) : ''}`).join(' &nbsp; ')}</span></div>`).join('')}</div>` : '';

  return `<div class="livehead" style="margin:6px 0 14px">
      <div><div class="clock" id="clock">${nowHM()}</div><div class="muted small">${esc(event.name)} · modo ${AIR_MODES[event.air_mode]}</div></div>
      ${w ? `<div class="livenav" style="min-width:min(100%,460px)">
        <button class="btn" data-livenav="-1">◀ Anterior</button>
        <button class="btn airbtn" data-livenav="1">● ${cur ? 'Próximo no ar' : 'Pôr no ar'} ▶</button>
        ${cur ? '<button class="btn" data-livenav="off" title="Tirar do ar">■</button>' : ''}
      </div>` : ''}
    </div>
    <div class="live"><div style="display:grid;gap:14px">${curHtml}</div><div style="display:grid;gap:14px">${nextHtml}${laterHtml}</div></div>`;
}

// ---- definições do evento ----
function viewSettings() {
  const { event } = state.ev;
  const w = canWrite();
  return `<div class="grid2" style="margin-top:14px;align-items:start">
    <form class="card" id="evform">
      <h2>Dados do evento</h2>
      <div class="field"><label>Nome</label><input name="name" value="${esc(event.name)}" ${w ? '' : 'disabled'}></div>
      <div class="grid2"><div class="field"><label>Data</label><input type="date" name="date" value="${esc(event.date)}" ${w ? '' : 'disabled'}></div>
      <div class="field"><label>Local / Sala</label><input name="venue" value="${esc(event.venue)}" ${w ? '' : 'disabled'}></div></div>
      <div class="field"><label>Passagem para ON AIR</label><select name="air_mode" ${w ? '' : 'disabled'}>
        ${Object.entries(AIR_MODES_LONG).map(([k, v]) => `<option value="${k}" ${event.air_mode === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
        <div class="small muted" style="margin-top:6px">Em qualquer modo podes sempre pôr um bloco no ar à mão com o botão <b>● Pôr no ar</b>.</div></div>
      <div class="field"><label>Notas técnicas</label><textarea name="notes" style="font-family:inherit" ${w ? '' : 'disabled'}>${esc(event.notes)}</textarea></div>
      ${w ? '<button class="btn primary">Guardar</button>' : ''}
    </form>
    <div style="display:grid;gap:12px">
      ${w ? `<div class="card"><h2>Ferramentas</h2>
        <div style="display:grid;gap:8px">
          <button class="btn" data-import>Importar alinhamento da folha</button>
          <button class="btn" data-dup>Duplicar evento (reutilizar micros/alinhamento)</button>
          <button class="btn" data-resetdone>Limpar todos os ✓</button>
          <button class="btn" data-archive>${event.archived ? 'Desarquivar' : 'Arquivar'} evento</button>
          ${isAdmin() ? '<button class="btn danger" data-delev>Apagar evento</button>' : ''}
        </div></div>` : ''}
      <div class="card small muted">Partilha este evento com a tua equipa: quem tiver conta no mesmo cliente vê tudo em tempo real — iPad do palco, telemóvel do técnico e PC da régie.
        <div style="margin-top:8px">Última alteração: ${ago(event.updated_at)}</div></div>
    </div>
  </div>`;
}

// ---------- event bindings ----------
function bindEvent(tab) {
  const root = app;
  root.onclick = async (e) => {
    const t = (sel) => e.target.closest(sel);
    let el;
    if ((el = t('[data-addblock]'))) return blockModal({ kind: el.dataset.addblock });
    if ((el = t('[data-editblock]'))) return blockModal(state.ev.blocks.find((b) => b.id === Number(el.dataset.editblock)));
    if (t('[data-import]')) return importModal();
    if ((el = t('[data-editslot]'))) {
      const id = Number(el.dataset.editslot);
      for (const b of state.ev.blocks) { const sl = b.slots.find((x) => x.id === id); if (sl) return slotModal(sl, b); }
    }
    if ((el = t('[data-done]'))) {
      const id = Number(el.dataset.done);
      const on = !el.classList.contains('on');
      el.classList.toggle('on', on); el.closest('.slot, .liveslot')?.classList.toggle('done', on);
      await act(() => api('PUT', `/api/slots/${id}`, { done: on })); return scheduleReload();
    }
    if ((el = t('[data-setcur]'))) {
      const id = Number(el.dataset.setcur);
      const same = state.ev.event.current_block_id === id;
      await act(() => api('PUT', `/api/events/${state.evId}`, { current_block_id: same ? null : id })); return scheduleReload();
    }
    if ((el = t('[data-livenav]'))) {
      const v = el.dataset.livenav;
      if (v === 'off') { await act(() => api('PUT', `/api/events/${state.evId}`, { current_block_id: null }), 'Tirado do ar'); return scheduleReload(); }
      const a = analyze(); const bl = state.ev.blocks;
      let i = a.currentIdx < 0 ? (v === '1' ? 0 : -1) : a.currentIdx + Number(v);
      if (i < 0 || i >= bl.length) return toast(i < 0 ? 'Já estás no início' : 'Fim do alinhamento');
      // ao avançar marca como feitos os oradores do bloco que termina
      if (v === '1' && a.currentIdx >= 0) for (const sl of bl[a.currentIdx].slots) if (!sl.done) api('PUT', `/api/slots/${sl.id}`, { done: true }).catch(() => { });
      await act(() => api('PUT', `/api/events/${state.evId}`, { current_block_id: bl[i].id })); return scheduleReload();
    }
    if (t('[data-addmic]')) return micModal({});
    if ((el = t('[data-editmic]'))) return micModal(state.ev.mics.find((m) => m.id === Number(el.dataset.editmic)));
    if ((el = t('[data-batt]'))) {
      const [id, n] = el.dataset.batt.split(':').map(Number);
      $$(`[data-batt^="${id}:"]`).forEach((x) => x.classList.toggle('on', x === el));
      await act(() => api('PUT', `/api/mics/${id}`, { battery: n })); return scheduleReload();
    }
    if ((el = t('[data-newbatt]'))) {
      await act(() => api('PUT', `/api/mics/${el.dataset.newbatt}`, { battery: 3, new_batteries: true }), 'Pilhas novas registadas'); return scheduleReload();
    }
    if (t('[data-allnew]')) {
      if (!(await confirmBox('Pilhas novas em todos?', 'Marca todos os micros deste evento como pilhas cheias (novas).', 'Confirmar'))) return;
      await act(() => Promise.all(state.ev.mics.map((m) => api('PUT', `/api/mics/${m.id}`, { battery: 3, new_batteries: true }))), 'Todos os micros com pilhas novas'); return scheduleReload();
    }
    if ((el = t('[data-ft]'))) { state.filterType = el.dataset.ft; return renderEvent('mics'); }
    if (t('[data-dup]')) {
      const ev = state.ev.event;
      return modal('Duplicar evento', `
        <div class="field"><label>Nome do novo evento</label><input name="name" value="${esc(ev.name)} (cópia)" required></div>
        <div class="field"><label>Data</label><input type="date" name="date" value="${esc(ev.date)}"></div>
        <label class="row" style="color:var(--text);margin-bottom:8px"><input type="checkbox" name="keep_rundown" checked style="width:auto;min-height:0"> Copiar alinhamento</label>
        <label class="row" style="color:var(--text)"><input type="checkbox" name="keep_people" style="width:auto;min-height:0"> Manter pessoas dedicadas nos micros</label>`, {
        submitLabel: 'Duplicar',
        onSubmit: async (d) => { const r = await api('POST', `/api/events/${state.evId}/duplicate`, d); toast('Evento duplicado'); state.ev = null; go(`#/e/${r.id}/rundown`); },
      });
    }
    if (t('[data-resetdone]')) {
      const ids = state.ev.blocks.flatMap((b) => b.slots.filter((s) => s.done).map((s) => s.id));
      await act(() => Promise.all(ids.map((id) => api('PUT', `/api/slots/${id}`, { done: false }))), 'Limpo'); return scheduleReload();
    }
    if (t('[data-archive]')) {
      await act(() => api('PUT', `/api/events/${state.evId}`, { archived: !state.ev.event.archived }), state.ev.event.archived ? 'Evento reativado' : 'Evento arquivado'); return scheduleReload();
    }
    if (t('[data-delev]')) {
      if (!(await confirmBox('Apagar evento?', `"${state.ev.event.name}" e todos os micros e alinhamento vão ser apagados de vez.`))) return;
      stopStream(); await act(() => api('DELETE', `/api/events/${state.evId}`), 'Evento apagado'); state.ev = null; state.evId = null; return go('#/');
    }
  };
  root.onchange = async (e) => {
    const sel = e.target.closest('[data-slotmic]');
    if (sel) {
      const m = state.ev.mics.find((x) => x.id === Number(sel.value));
      sel.className = 'micsel' + (m ? '' : ' none');
      sel.style.cssText = m ? `background:${m.color};color:${contrastText(m.color)}` : '';
      await act(() => api('PUT', `/api/slots/${sel.dataset.slotmic}`, { mic_id: sel.value || null })); scheduleReload();
    }
  };
  root.onsubmit = async (e) => {
    const f = e.target;
    if (f.dataset.addslot) {
      e.preventDefault();
      const d = formData(f);
      if (!d.speaker.trim()) return;
      await act(() => api('POST', `/api/blocks/${f.dataset.addslot}/slots`, d));
      f.reset(); $('input', f).focus();
      state.focusAdd = f.dataset.addslot;
      return scheduleReload();
    }
    if (f.id === 'evform') {
      e.preventDefault();
      await act(() => api('PUT', `/api/events/${state.evId}`, formData(f)), 'Guardado'); return scheduleReload();
    }
  };
  if (state.focusAdd) { $(`[data-addslot="${state.focusAdd}"] input`)?.focus(); state.focusAdd = null; }
}

// relógio ao vivo
setInterval(() => {
  const c = $('#clock'); if (c) c.textContent = nowHM();
}, 1000);
// ---------- passagem automática / com pergunta para ON AIR ----------
const airAsked = new Set();
async function checkAir() {
  if (!state.ev || !canWrite()) return;
  const ev = state.ev.event;
  if (ev.air_mode === 'manual' || ev.archived) return;
  const a = analyze();
  if (a.dueIdx < 0 || a.dueIdx <= a.currentIdx) return; // só avança, nunca recua
  const target = state.ev.blocks[a.dueIdx];
  const key = `${ev.id}:${target.id}:${ev.current_block_id}`;
  if (airAsked.has(key)) return;
  const label = `${target.start_time} ${target.kind === 'intervalo' ? (target.title || 'Intervalo') : (target.title || target.slots.map((x) => x.speaker).join(', ') || 'Bloco')}`;
  const goAir = async () => {
    const r = await api('PUT', `/api/events/${state.evId}`, { current_block_id: target.id, if_current: ev.current_block_id });
    if (!r.skipped) toast('ON AIR: ' + label);
    scheduleReload();
  };
  if (ev.air_mode === 'auto') { airAsked.add(key); return act(goAir); }
  if ($('.modal-bg')) return; // espera que o utilizador feche o que tem aberto
  airAsked.add(key);
  const f = modal('Mudar ON AIR?', `
    <div class="airask"><span class="onair lg">ON AIR</span><span class="bigtime">${esc(target.start_time)}</span></div>
    <p>Chegou a hora de <b>${esc(label)}</b>.</p>
    ${a.currentIdx >= 0 ? `<p class="muted small">No ar agora: ${esc(state.ev.blocks[a.currentIdx].start_time)} ${esc(state.ev.blocks[a.currentIdx].title || state.ev.blocks[a.currentIdx].slots.map((x) => x.speaker).join(', '))}</p>` : ''}
    <p class="muted small">Queres passar automaticamente para este bloco?</p>`, {
    submitLabel: '● Pôr no ar', onSubmit: goAir,
  });
  f.dataset.airprompt = target.id;
  $('.mf [data-close]:not(.icon)', f).textContent = 'Agora não';
  $('button[type=submit]', f).classList.replace('primary', 'airbtn');
}
setInterval(() => { checkAir().catch(() => { }); }, 10000);

// ---------- admin ----------
async function renderAdmin(sub) {
  if (!isAdmin()) return go('#/');
  if (sub === 'orgs' && state.me.role !== 'superadmin') return go('#/admin/users');
  const tabs = `<nav class="tabs">
    ${state.me.role === 'superadmin' ? `<a class="tab ${sub === 'orgs' ? 'on' : ''}" href="#/admin/orgs">Clientes</a>` : ''}
    <a class="tab ${sub === 'users' ? 'on' : ''}" href="#/admin/users">Utilizadores</a></nav>`;
  app.innerHTML = shell('<div class="empty">A carregar…</div>', { crumb: 'Administração', tabs });
  if (sub === 'orgs') return adminOrgs(tabs);
  return adminUsers(tabs);
}

async function adminOrgs(tabs) {
  const [orgs, stats] = await Promise.all([api('GET', '/api/orgs'), api('GET', '/api/admin/stats')]);
  app.innerHTML = shell(`
    <div class="stats" style="margin-top:14px">
      <div class="card stat"><b>${stats.orgs}</b><span>clientes</span></div>
      <div class="card stat"><b>${stats.users}</b><span>utilizadores</span></div>
      <div class="card stat"><b>${stats.events}</b><span>eventos</span></div>
      <div class="card stat"><b>${stats.mics}</b><span>micros</span></div>
      <div class="card stat"><b style="color:var(--accent)">${stats.live_connections}</b><span>ecrãs ligados agora</span></div>
    </div>
    <div class="toolbar"><h2 style="margin:0" class="grow">Clientes</h2><button class="btn primary" id="neworg">+ Novo cliente</button></div>
    <div class="card tablewrap" style="padding:0"><table class="table">
      <tr><th>Cliente</th><th class="hide-sm">Contacto</th><th>Utiliz.</th><th>Eventos</th><th>Estado</th><th></th></tr>
      ${orgs.map((o) => `<tr>
        <td><b>${esc(o.name)}</b></td><td class="hide-sm muted">${esc(o.contact)}</td><td>${o.users}</td>
        <td>${o.events}${o.max_events ? ` / ${o.max_events}` : ''}</td>
        <td>${o.active ? '<span class="pill ok">Ativo</span>' : '<span class="pill danger">Suspenso</span>'}</td>
        <td style="text-align:right;white-space:nowrap"><a class="btn sm" href="#/admin/users" data-orgusers="${o.id}">Utilizadores</a> <button class="btn sm" data-editorg="${o.id}">Editar</button></td>
      </tr>`).join('') || '<tr><td colspan="6" class="muted">Sem clientes.</td></tr>'}
    </table></div>`, { crumb: 'Administração', tabs });

  $('#neworg').onclick = () => modal('Novo cliente', `
    <div class="field"><label>Nome do cliente / empresa</label><input name="name" required></div>
    <div class="grid2"><div class="field"><label>Contacto</label><input name="contact" placeholder="Telefone ou email"></div>
    <div class="field"><label>Limite de eventos ativos (0 = sem limite)</label><input name="max_events" type="number" min="0" value="0"></div></div>
    <h3 style="margin:8px 0 10px">Administrador do cliente</h3>
    <div class="grid2"><div class="field"><label>Nome</label><input name="admin_name"></div>
    <div class="field"><label>Email</label><input name="admin_email" type="email"></div></div>
    <div class="field"><label>Password (vazio = gerar automaticamente)</label><input name="admin_password" type="text"></div>`, {
    submitLabel: 'Criar cliente',
    onSubmit: async (d) => {
      const r = await api('POST', '/api/orgs', d);
      if (r.admin_password) showPassword(d.admin_email, r.admin_password);
      adminOrgs(tabs); return !!r.admin_password;
    },
  });
  app.onclick = (e) => {
    const ou = e.target.closest('[data-orgusers]'); if (ou) { state.userOrgFilter = Number(ou.dataset.orgusers); return; }
    const b = e.target.closest('[data-editorg]'); if (!b) return;
    const o = orgs.find((x) => x.id === Number(b.dataset.editorg));
    const f = modal('Editar cliente', `
      <div class="field"><label>Nome</label><input name="name" value="${esc(o.name)}" required></div>
      <div class="grid2"><div class="field"><label>Contacto</label><input name="contact" value="${esc(o.contact)}"></div>
      <div class="field"><label>Limite de eventos ativos</label><input name="max_events" type="number" min="0" value="${o.max_events}"></div></div>
      <label class="row" style="color:var(--text)"><input type="checkbox" name="active" ${o.active ? 'checked' : ''} style="width:auto;min-height:0"> Cliente ativo (desativar bloqueia o acesso de todos os utilizadores dele)</label>`, {
      extraFooter: '<button type="button" class="btn danger" id="delorg">Apagar</button>',
      onSubmit: async (d) => { await api('PUT', `/api/orgs/${o.id}`, d); toast('Guardado'); adminOrgs(tabs); },
    });
    $('#delorg', f).onclick = async () => {
      closeModal();
      if (await confirmBox(`Apagar ${o.name}?`, `Apaga o cliente, os ${o.users} utilizadores e os ${o.events} eventos. Não dá para desfazer.`)) { await act(() => api('DELETE', `/api/orgs/${o.id}`), 'Cliente apagado'); adminOrgs(tabs); }
    };
  };
}

function showPassword(email, pw) {
  modal('Credenciais criadas', `<p>Envia estes dados à pessoa (só são mostrados agora):</p>
    <div class="card" style="font-family:ui-monospace,Menlo,monospace;user-select:all">URL: ${esc(location.origin)}<br>Email: ${esc(email)}<br>Password: ${esc(pw)}</div>`);
}

async function adminUsers(tabs) {
  const sa = state.me.role === 'superadmin';
  const [users, orgs] = await Promise.all([api('GET', '/api/users' + (sa && state.userOrgFilter ? `?org=${state.userOrgFilter}` : '')), sa ? api('GET', '/api/orgs') : Promise.resolve([])]);
  const roleOpts = (sel) => Object.entries(ROLES).filter(([k]) => sa || k !== 'superadmin').map(([k, v]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${v}</option>`).join('');
  app.innerHTML = shell(`
    <div class="toolbar"><h2 style="margin:0" class="grow">Utilizadores</h2>
      ${sa ? `<select id="orgf" style="width:auto"><option value="">Todos os clientes</option>${orgs.map((o) => `<option value="${o.id}" ${state.userOrgFilter === o.id ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}</select>` : ''}
      <button class="btn primary" id="newuser">+ Utilizador</button></div>
    <div class="card small muted" style="margin-bottom:12px"><b>Administrador</b>: gere eventos e utilizadores do cliente · <b>Operador</b>: edita micros, pilhas e alinhamento · <b>Só leitura</b>: vê tudo em tempo real (ex: palco, produção).</div>
    <div class="card tablewrap" style="padding:0"><table class="table">
      <tr><th>Nome</th><th class="hide-sm">Email</th>${sa ? '<th class="hide-sm">Cliente</th>' : ''}<th>Papel</th><th></th></tr>
      ${users.map((u) => `<tr style="${u.active ? '' : 'opacity:.5'}">
        <td><b>${esc(u.name || '—')}</b><div class="small muted" style="display:none" data-sm>${esc(u.email)}</div></td>
        <td class="hide-sm muted">${esc(u.email)}</td>${sa ? `<td class="hide-sm">${esc(u.org_name || '—')}</td>` : ''}
        <td>${ROLES[u.role]}${u.active ? '' : ' <span class="pill danger">inativo</span>'}</td>
        <td style="text-align:right"><button class="btn sm" data-edituser="${u.id}">Editar</button></td></tr>`).join('') || '<tr><td colspan="5" class="muted">Sem utilizadores.</td></tr>'}
    </table></div>`, { crumb: 'Administração', tabs });
  $('#orgf')?.addEventListener('change', (e) => { state.userOrgFilter = Number(e.target.value) || null; adminUsers(tabs); });
  $('#newuser').onclick = () => modal('Novo utilizador', `
    ${sa ? `<div class="field"><label>Cliente</label><select name="org_id">${orgs.map((o) => `<option value="${o.id}" ${state.userOrgFilter === o.id ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}</select></div>` : ''}
    <div class="grid2"><div class="field"><label>Nome</label><input name="name" required></div>
    <div class="field"><label>Email</label><input name="email" type="email" required></div></div>
    <div class="grid2"><div class="field"><label>Papel</label><select name="role">${roleOpts('operator')}</select></div>
    <div class="field"><label>Password (vazio = gerar)</label><input name="password" type="text"></div></div>`, {
    submitLabel: 'Criar',
    onSubmit: async (d) => { const r = await api('POST', '/api/users', d); showPassword(d.email, r.password); adminUsers(tabs); return true; },
  });
  app.onclick = (e) => {
    const b = e.target.closest('[data-edituser]'); if (!b) return;
    const u = users.find((x) => x.id === Number(b.dataset.edituser));
    const self = u.id === state.me.id;
    const f = modal('Editar utilizador', `
      <div class="small muted" style="margin-bottom:12px">${esc(u.email)}</div>
      <div class="field"><label>Nome</label><input name="name" value="${esc(u.name)}"></div>
      <div class="field"><label>Papel</label><select name="role" ${self ? 'disabled' : ''}>${roleOpts(u.role)}</select></div>
      <div class="field"><label>Nova password (vazio = manter)</label><input name="password" type="text"></div>
      ${self ? '' : `<label class="row" style="color:var(--text)"><input type="checkbox" name="active" ${u.active ? 'checked' : ''} style="width:auto;min-height:0"> Conta ativa</label>`}`, {
      extraFooter: self ? '' : '<button type="button" class="btn danger" id="deluser">Apagar</button>',
      onSubmit: async (d) => { if (self) delete d.role; if (!d.password) delete d.password; await api('PUT', `/api/users/${u.id}`, d); toast('Guardado'); adminUsers(tabs); },
    });
    $('#deluser', f)?.addEventListener('click', async () => {
      closeModal();
      if (await confirmBox('Apagar utilizador?', u.email)) { await act(() => api('DELETE', `/api/users/${u.id}`), 'Apagado'); adminUsers(tabs); }
    });
  };
}

function renderAccount() {
  app.innerHTML = shell(`<div class="card" style="max-width:460px;margin-top:14px">
    <h2>A minha conta</h2><p class="muted small">${esc(state.me.email)} · ${ROLES[state.me.role]}</p>
    <form id="pwf">
      <div class="field"><label>Password atual</label><input type="password" name="current" required autocomplete="current-password"></div>
      <div class="field"><label>Nova password</label><input type="password" name="password" required minlength="6" autocomplete="new-password"></div>
      <button class="btn primary">Mudar password</button>
    </form></div>`, { crumb: 'Conta' });
  $('#pwf').onsubmit = async (e) => { e.preventDefault(); await act(() => api('POST', '/api/me/password', formData(e.target)), 'Password alterada'); e.target.reset(); };
}

boot();
