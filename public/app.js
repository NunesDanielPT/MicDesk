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
const ROLES = { superadmin: 'Super admin', user: 'Utilizador' };

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
  if (!r.ok) { const e = new Error(data?.error || 'Erro ' + r.status); e.limit = data?.limit; throw e; }
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
    <div class="mf">${extraFooter}<span class="grow"></span><button type="button" class="btn" data-close>${onSubmit ? 'Cancelar' : 'Fechar'}</button>
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
    else if (el.type === 'radio') { if (el.checked) o[el.name] = el.value; }
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
let savedRview = 'list'; try { savedRview = localStorage.getItem('md_rview') || 'list'; } catch { }
const state = { rview: savedRview, me: null, types: [], colors: [], ev: null, evId: null, es: null, live: false, pendingRender: false, filterType: 'all', showArchived: false };

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
  try { await renderInner(); } catch (e) {
    console.error(e);
    if (!state.me) return;
    app.innerHTML = shell(`<div class="card empty">Não foi possível carregar.<br><span class="small">${esc(e.message)}</span><br><br><button class="btn primary" onclick="location.reload()">Tentar de novo</button></div>`);
  }
}
async function renderInner() {
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
  if (parts[0] === 'admin') return renderAdmin();
  if (parts[0] === 'account') return renderAccount();
  if (parts[0] === 'display') return renderDisplay();
  if (parts[0] === 'integrations') return renderIntegrations();
  return renderHome();
}

async function loadEvent() {
  const t0 = Date.now();
  state.ev = await api('GET', `/api/events/${state.evId}`);
  // relógio do servidor (todos os aparelhos contam o mesmo tempo, mesmo que o relógio de um esteja errado)
  if (state.ev.server_now) state.timeOffset = state.ev.server_now - Math.round((t0 + Date.now()) / 2);
}

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
    try {
      const d = JSON.parse(m.data);
      if (d.deleted) { toast('Este evento foi apagado'); go('#/'); return; }
      if (d.msg && d.by_id !== state.me?.id) notifyChange(d.by, d.msg);
      if (d.msg && location.hash.endsWith('/log')) state.logDirty = true;
    } catch { }
    scheduleReload();
  };
  es.onopen = () => { state.live = true; $('.livedot')?.classList.add('on'); };
  es.onerror = () => { state.live = false; $('.livedot')?.classList.remove('on'); };
  state.es = es;
}
function stopStream() { if (state.es) { state.es.close(); state.es = null; state.live = false; } }
document.addEventListener('visibilitychange', () => { if (!document.hidden && state.evId) scheduleReload(); });

// ---------- shell ----------
const canWrite = () => !!state.me;
const isSuper = () => state.me && state.me.role === 'superadmin';

function shell(content, { crumb = '', tabs = '', wide = false } = {}) {
  const u = state.me;
  return `<header class="topbar">
    <div class="row">
      <div class="row" style="min-width:0;gap:12px">
        <a class="brand" href="#/">${LOGO(28)}<span class="wm sm"><b>MIC</b><i>DESK</i></span></a>
        ${crumb ? `<span class="crumb">${crumb}</span>` : ''}
      </div>
      <div class="menu">
        <button class="btn sm" data-menu>${esc((u.name || u.email).split(' ')[0])} ▾</button>
        <div class="dropdown hide" id="dd">
          <div class="small muted" style="padding:8px 12px">${esc(u.email)}<br>${ROLES[u.role]}</div>
          <hr>
          <a href="#/">Eventos</a>
          ${u.role === 'superadmin' ? '<a href="#/admin">Utilizadores</a><a href="#/integrations">🔌 Integrações <span class="pill info" style="font-size:10px">beta</span></a>' : ''}
          <a href="#/account">A minha conta</a>
          <a href="#/display">🖥 Ecrã e experiência</a>
          ${isStandalone() ? '' : '<button data-install>📲 Instalar app</button>'}
          <hr>
          <button data-logout>Sair</button>
        </div>
      </div>
    </div>
    ${tabs}
  </header>
  <main class="${wide ? 'wide' : ''}">${content}</main>`;
}
document.addEventListener('click', async (e) => {
  const m = e.target.closest('[data-menu]');
  const dd = $('#dd');
  if (m && dd) { dd.classList.toggle('hide'); return; }
  if (dd && !e.target.closest('.dropdown')) dd.classList.add('hide');
  if (e.target.closest('[data-install]')) { $('#dd')?.classList.add('hide'); return installModal(); }
  if (e.target.closest('[data-dismissinstall]')) { try { localStorage.setItem('md_noinstall', '1'); } catch { } e.target.closest('.installbar')?.remove(); return; }
  if (e.target.closest('[data-logout]')) { await api('POST', '/api/logout'); state.me = null; stopStream(); go('#/login'); }
});

// ---------- instalar como app (PWA) ----------
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; });
window.addEventListener('appinstalled', () => { deferredPrompt = null; toast('MicDesk instalada ✓'); $('.installbar')?.remove(); });
if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('/sw.js').catch(() => { });
function isStandalone() { return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; }
function device() {
  const ua = navigator.userAgent;
  const iPad = /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (iPad) return { os: 'ios', short: 'iPad', name: 'iPad' };
  if (/iPhone|iPod/.test(ua)) return { os: 'ios', short: 'iPhone', name: 'iPhone' };
  if (/Android/.test(ua)) return { os: 'android', short: 'telemóvel', name: 'Android' };
  if (/Macintosh/.test(ua)) return { os: 'mac', short: 'Mac', name: 'Mac' };
  if (/Windows/.test(ua)) return { os: 'windows', short: 'PC', name: 'Windows' };
  return { os: 'other', short: 'aparelho', name: 'este aparelho' };
}
function browserName() {
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return 'edge';
  if (/CriOS|Chrome\//.test(ua) && !/OPR|SamsungBrowser/.test(ua)) return 'chrome';
  if (/SamsungBrowser/.test(ua)) return 'samsung';
  if (/Firefox|FxiOS/.test(ua)) return 'firefox';
  if (/Safari/.test(ua)) return 'safari';
  return 'other';
}
const SHARE_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="vertical-align:-3px"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8"/></svg>';
function installModal() {
  const d = device(), br = browserName();
  const guides = {
    ios: { title: 'iPhone / iPad', steps: [
      'Abre este endereço no <b>Safari</b> (no iOS 16.4+ também funciona no Chrome).',
      `Carrega no botão <b>Partilhar</b> ${SHARE_ICON} (em baixo no iPhone, em cima no iPad).`,
      'Desliza e escolhe <b>"Adicionar ao ecrã principal"</b>.',
      'Carrega em <b>Adicionar</b>. O ícone MicDesk aparece no ecrã principal.'] },
    android: { title: 'Android', steps: [
      'Abre este endereço no <b>Chrome</b> (ou Samsung Internet / Edge).',
      'Carrega em <b>Instalar</b> aqui em cima, ou no menu <b>⋮</b> → <b>"Instalar aplicação"</b>.',
      'Confirma. A MicDesk fica na gaveta de apps e no ecrã principal.'] },
    windows: { title: 'Windows', steps: [
      'Abre este endereço no <b>Edge</b> ou no <b>Chrome</b>.',
      'Carrega em <b>Instalar</b> aqui em cima, ou no ícone <b>⊕ / 🖥️</b> no fim da barra de endereço.',
      'A MicDesk fica no menu Iniciar e podes afixá-la na barra de tarefas.'] },
    mac: { title: 'MacBook / Mac', steps: [
      '<b>Safari</b> (macOS Sonoma ou mais recente): menu <b>Ficheiro → "Adicionar à Dock"</b>.',
      '<b>Chrome / Edge</b>: carrega em <b>Instalar</b> aqui em cima, ou no ícone <b>⊕</b> na barra de endereço.',
      'A MicDesk fica na Dock e no Launchpad, abre em janela própria.'] },
  };
  const order = [d.os, ...['ios', 'android', 'windows', 'mac'].filter((k) => k !== d.os)].filter((k) => guides[k]);
  const section = (k, open) => `<details class="iguide" ${open ? 'open' : ''}><summary>${guides[k].title}${k === d.os ? ' <span class="pill ok">este aparelho</span>' : ''}</summary>
    <ol>${guides[k].steps.map((x) => `<li>${x}</li>`).join('')}</ol></details>`;
  const canPrompt = !!deferredPrompt;
  const f = modal('Instalar MicDesk', `
    ${!window.isSecureContext ? `<div class="card" style="border-color:var(--warn);margin-bottom:12px"><b style="color:var(--warn)">⚠ Precisa de HTTPS</b><div class="small muted">Para instalar como app, o site tem de ser aberto com um endereço <b>https://</b> (ex: com o Nginx Proxy Manager). Em http:// só dá para usar no browser.</div></div>` : ''}
    ${canPrompt ? `<button type="button" class="btn primary" id="doinstall" style="width:100%;min-height:56px;font-size:18px;margin-bottom:14px">📲 Instalar agora neste ${d.short}</button>` : ''}
    ${d.os === 'ios' && br !== 'safari' && br !== 'chrome' ? '<p class="small" style="color:var(--warn)">Abre no Safari para poderes instalar.</p>' : ''}
    ${br === 'firefox' && d.os !== 'android' && d.os !== 'ios' ? '<p class="small" style="color:var(--warn)">O Firefox no computador não instala apps web — usa o Chrome, Edge ou Safari.</p>' : ''}
    ${order.map((k, i) => section(k, i === 0)).join('')}
    <p class="small muted" style="margin-bottom:0">A app instalada é sempre a versão mais recente do teu servidor — não é preciso atualizar nada nos aparelhos.</p>`);
  $('#doinstall', f)?.addEventListener('click', async () => {
    deferredPrompt.prompt();
    const r = await deferredPrompt.userChoice.catch(() => null);
    deferredPrompt = null; closeModal();
    if (r && r.outcome === 'accepted') toast('A instalar…');
  });
}

// ---------- login ----------
// ---------- logótipo ----------
const LOGO = (size = 40) => `<svg class="logo" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true">
  <defs><linearGradient id="lg-cap" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5ff0b8"/><stop offset="1" stop-color="#1f9e70"/></linearGradient></defs>
  <path class="lw lw1" d="M14 22a20 20 0 0 0 0 20M50 22a20 20 0 0 1 0 20" fill="none" stroke="#34c38f" stroke-width="3" stroke-linecap="round" opacity=".55"/>
  <path class="lw lw2" d="M7 16a29 29 0 0 0 0 32M57 16a29 29 0 0 1 0 32" fill="none" stroke="#34c38f" stroke-width="3" stroke-linecap="round" opacity=".28"/>
  <rect x="23" y="6" width="18" height="30" rx="9" fill="url(#lg-cap)"/>
  <path d="M23 15h18M23 21h18M23 27h18" stroke="#0e3d2c" stroke-width="2" opacity=".55"/>
  <path d="M18 30a14 14 0 0 0 28 0" fill="none" stroke="#e9eaec" stroke-width="3.2" stroke-linecap="round"/>
  <path d="M32 44v9M24 56h16" stroke="#e9eaec" stroke-width="3.2" stroke-linecap="round"/>
  <circle cx="50" cy="10" r="4" fill="#e53935"/>
</svg>`;
const WORDMARK = '<span class="wm"><b>MIC</b><i>DESK</i></span>';

const FEATURES = [
  ['mic', 'Micros com identidade', 'Mão, lapela, headset, púlpito, instrumento… cada um com cor, número, canal, frequência e pessoa dedicada.'],
  ['batt', 'Pilhas sob controlo', 'Cheia, 2 traços, 1 traço, vazia — com um toque. Botão "pilhas novas" e histórico de quem mudou e quando.'],
  ['list', 'Alinhamento por blocos', 'Painéis com vários oradores à mesma hora, intervalos, notas. Importa direto do Excel ou Google Sheets.'],
  ['grid', 'Grelha de micros', 'Vê de uma vez quem tem cada micro em cada bloco, onde há trocas e o que fica livre.'],
  ['eye', 'Previsão ao criar blocos', 'Ao escolher o micro de um orador vês logo se está livre ou a quem tens de o recolher.'],
  ['air', 'ON AIR', 'Bloco no ar destacado a vermelho. Passa sozinho à hora, pergunta antes, ou só manualmente — tu escolhes.'],
  ['timer', 'Cronómetro e ecrã de palco', 'Tempo no ar, countdown até ao fim, atraso ou adiantamento — e um ecrã gigante para o orador.'],
  ['swap', 'Ao vivo: quem vem a seguir', 'Grelha com os blocos anteriores, o que está no ar e os seguintes, com "recolher de…" em destaque.'],
  ['desk', 'Matriz da mesa de som', 'Canais, saídas, stagebox, 48V e routing num toque. Gera canais a partir dos micros.'],
  ['team', 'Equipa no mesmo evento', 'Convida colegas por email. Todos veem as mudanças em tempo real, em qualquer aparelho.'],
  ['dev', 'App em todos os aparelhos', 'Instala no iPhone, iPad, Android, Windows e Mac — ecrã inteiro, ícone próprio.'],
  ['print', 'Imprimir e reutilizar', 'Alinhamento e matriz em papel, duplicar eventos e arquivar os que já passaram.'],
];
const FICONS = {
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6"/>',
  batt: '<rect x="3" y="7" width="16" height="10" rx="2"/><path d="M21 10v4M6 10v4M9.5 10v4M13 10v4"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  grid: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  air: '<circle cx="12" cy="12" r="3"/><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.9 4.9a10 10 0 0 0 0 14.2M19.1 4.9a10 10 0 0 1 0 14.2"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/>',
  swap: '<path d="M7 7h11l-3-3M17 17H6l3 3"/>',
  desk: '<path d="M4 21V9M4 5V3M12 21v-6M12 11V3M20 21v-9M20 8V3M2 9h4M10 11h4M18 8h4"/>',
  team: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.5a5 5 0 0 1 6 4.5"/>',
  dev: '<rect x="2" y="5" width="13" height="10" rx="1.5"/><path d="M6 19h5"/><rect x="17" y="8" width="5" height="11" rx="1.2"/>',
  print: '<path d="M6 9V3h12v6M6 17H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="7"/>',
};
const ficon = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${FICONS[k]}</svg>`;

// ---------- página principal (entrar / criar conta) ----------
async function renderLogin() {
  let cfg = { signup: true };
  try { cfg = await (await fetch('/api/public/config')).json(); } catch { }
  const mode = state.authMode === 'signup' && cfg.signup ? 'signup' : 'login';
  const bars = Array.from({ length: 48 }, (_, i) => `<i style="--d:${((i * 37) % 23) / 10}s;--h:${30 + ((i * 53) % 70)}%"></i>`).join('');
  app.innerHTML = `<div class="landing">
    <header class="lnav">
      <div class="lbrand">${LOGO(34)}${WORDMARK}</div>
      <div class="row">
        ${isStandalone() ? '' : '<button class="btn sm ghost" data-install>📲 Instalar app</button>'}
        <button class="btn sm" data-goauth="login">Entrar</button>
      </div>
    </header>
    <section class="hero">
      <div class="vu" aria-hidden="true">${bars}</div>
      <div class="hero-in">
        <div class="hero-text">
          <div class="hero-logo">${LOGO(120)}</div>
          <h1 class="hero-title">MIC<span>DESK</span></h1>
          <p class="hero-sub">A régie dos teus microfones.<br>Micros, pilhas, oradores, ON AIR e mesa de som — sincronizado em tempo real entre todos os aparelhos da equipa.</p>
          <div class="hero-stats">
            <div><b>${FEATURES.length}</b><span>ferramentas</span></div>
            <div><b>5</b><span>plataformas</span></div>
            <div><b>∞</b><span>aparelhos ao vivo</span></div>
          </div>
        </div>
        <form class="card authcard" id="authf" autocomplete="on">
          <div class="authtabs">
            <button type="button" data-goauth="login" class="${mode === 'login' ? 'on' : ''}">Entrar</button>
            ${cfg.signup ? `<button type="button" data-goauth="signup" class="${mode === 'signup' ? 'on' : ''}">Criar conta</button>` : ''}
          </div>
          ${mode === 'signup' ? `
            <div class="field"><label>Nome</label><input name="name" autocomplete="name" required placeholder="O teu nome"></div>
            <div class="field"><label>Email</label><input name="email" type="email" autocomplete="email" required placeholder="nome@exemplo.pt"></div>
            <div class="field"><label>Password</label><input name="password" type="password" autocomplete="new-password" minlength="6" required placeholder="mínimo 6 caracteres"></div>
            <button class="btn primary big" style="width:100%">Criar conta grátis</button>
            <p class="small muted" style="margin:10px 0 0">Se um colega já te convidou para um evento, usa o mesmo email — o evento aparece-te logo.</p>`
    : `
            <div class="field"><label>Email</label><input name="email" type="email" autocomplete="username" required placeholder="nome@exemplo.pt"></div>
            <div class="field"><label>Password</label><input name="password" type="password" autocomplete="current-password" required></div>
            <button class="btn primary big" style="width:100%">Entrar</button>
            ${cfg.signup ? '<p class="small muted" style="margin:10px 0 0;text-align:center">Ainda não tens conta? <a href="#" data-goauth="signup">Criar conta</a></p>' : ''}`}
        </form>
      </div>
    </section>
    <section class="features">
      <h2 class="sec-title">Tudo o que precisas para o som de um evento</h2>
      <p class="sec-sub">Do armazém ao ON AIR — feito por técnicos de som, para técnicos de som.</p>
      <div class="fgrid">${FEATURES.map(([ic, t, d]) => `<div class="fcard"><div class="fic">${ficon(ic)}</div><h3>${t}</h3><p>${d}</p></div>`).join('')}</div>
    </section>
    <section class="steps">
      <div class="step"><b>1</b><h3>Cria o evento</h3><p>Só precisas do nome. Micros base já vêm prontos.</p></div>
      <div class="step"><b>2</b><h3>Monta o alinhamento</h3><p>Blocos, oradores e micros — ou cola da tua folha Excel.</p></div>
      <div class="step"><b>3</b><h3>Convida a equipa</h3><p>Palco, régie e produção a ver o mesmo, ao segundo.</p></div>
      <div class="step"><b><span class="onair">ON AIR</span></b><h3>Vai para o ar</h3><p>Cronómetro, trocas de micro e pilhas sempre à vista.</p></div>
    </section>
    <footer class="lfoot">${LOGO(22)} MICDESK · gestão de microfonia para eventos</footer>
  </div>`;
  app.onclick = (e) => {
    const g = e.target.closest('[data-goauth]');
    if (g) { e.preventDefault(); state.authMode = g.dataset.goauth; renderLogin().then(() => { $('.authcard').scrollIntoView({ behavior: 'smooth', block: 'center' }); $('.authcard input')?.focus(); }); }
  };
  $('#authf').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('button.big', e.target); btn.disabled = true;
    try {
      let shared = 0;
      if (mode === 'signup') shared = (await api('POST', '/api/register', formData(e.target))).shared;
      else await api('POST', '/api/login', formData(e.target));
      const d = await api('GET', '/api/me');
      state.me = d.user; state.types = d.types; state.colors = d.colors; state.authMode = 'login';
      if (mode === 'signup') toast(shared ? `Bem-vindo! Já tens ${shared} evento(s) partilhado(s) contigo.` : 'Conta criada. Bem-vindo à MicDesk!');
      go(location.hash.startsWith('#/e/') ? location.hash : '#/');
    } catch (err) { toast(err.message, true); btn.disabled = false; }
  });
}

// ---------- home (eventos) ----------
async function renderHome() {
  app.innerHTML = shell('<div class="empty">A carregar…</div>');
  const sa = isSuper();
  const qs = new URLSearchParams();
  if (state.showArchived) qs.set('archived', '1');
  if (sa && state.ownerFilter) qs.set('user', state.ownerFilter);
  const [events, users, lim] = await Promise.all([
    api('GET', '/api/events?' + qs),
    sa ? api('GET', '/api/users') : Promise.resolve([]),
    api('GET', '/api/limits'),
  ]);
  const today = todayISO();
  const item = (e) => `<a class="card evcard" href="#/e/${e.id}">
      <div class="row" style="justify-content:space-between;align-items:flex-start">
        <div style="min-width:0"><h3>${esc(e.name)}</h3>
          <div class="muted small">${[e.date && esc(fmtDate(e.date)), e.venue && esc(e.venue), sa && '<span style="color:var(--info)">' + esc(e.owner_name || e.owner_email) + '</span>'].filter(Boolean).join(' · ')}</div></div>
        <div class="row" style="gap:6px">${!sa && !e.is_owner ? `<span class="pill info">👥 de ${esc(e.owner_name || e.owner_email)}</span>` : ''}${e.date === today ? '<span class="pill ok">Hoje</span>' : ''}</div>
      </div>
      <div class="pills"><span class="pill">${e.mic_count} micros</span>${e.member_count ? `<span class="pill">👥 ${e.member_count + 1} na equipa</span>` : ''}<span class="pill">${e.block_count} blocos</span>
        ${e.low_batt ? `<span class="pill warn">${e.low_batt} pilhas baixas</span>` : ''}</div>
    </a>`;
  const content = `
    <div class="row" style="justify-content:space-between;flex-wrap:wrap">
      <div><h1>Eventos</h1><div class="muted small">${sa ? (state.ownerFilter ? 'Eventos de ' + esc(users.find((x) => x.id === state.ownerFilter)?.name || '') : 'Eventos de todos os utilizadores') : 'Os meus eventos'}
        ${lim.max ? ` · <span class="pill ${lim.used >= lim.max ? 'danger' : lim.used >= lim.max - 1 ? 'warn' : ''}">${lim.used} / ${lim.max} eventos</span>` : ''}</div></div>
      <div class="row" style="flex-wrap:wrap">
        ${sa ? `<select id="ownerf" style="width:auto;min-height:40px"><option value="">Todos</option>${users.map((x) => `<option value="${x.id}" ${state.ownerFilter === x.id ? 'selected' : ''}>${esc(x.name || x.email)}</option>`).join('')}</select>` : ''}
        <div class="seg"><button data-arch="0" class="${!state.showArchived ? 'on' : ''}">Ativos</button><button data-arch="1" class="${state.showArchived ? 'on' : ''}">Arquivo</button></div>
        ${canWrite() ? '<button class="btn primary" id="newev">+ Novo evento</button>' : ''}
      </div>
    </div>
    <div class="list" style="margin-top:16px">${events.length ? events.map(item).join('') : `<div class="card empty">${state.showArchived ? 'Sem eventos arquivados.' : 'Ainda não há eventos. Cria o primeiro.'}</div>`}</div>`;
  let hideBar = isStandalone(); try { hideBar = hideBar || localStorage.getItem('md_noinstall') === '1'; } catch { }
  app.innerHTML = shell((hideBar ? '' : `<div class="card installbar"><span style="font-size:22px">📲</span><div class="grow"><b>Instala a MicDesk neste ${device().short}</b><div class="small muted">Abre em ecrã inteiro, com ícone próprio, como uma app normal.</div></div><button class="btn sm primary" data-install>Instalar</button><button class="btn sm ghost icon" data-dismissinstall aria-label="Fechar">✕</button></div>`) + content);
  $$('[data-arch]').forEach((b) => b.onclick = () => { state.showArchived = b.dataset.arch === '1'; renderHome(); });
  $('#ownerf')?.addEventListener('change', (e) => { state.ownerFilter = Number(e.target.value) || null; renderHome(); });
  $('#newev')?.addEventListener('click', () => (lim.max && lim.used >= lim.max ? limitModal(lim.max) : newEventModal()));
}

// limite de eventos atingido: mostra os eventos (passados primeiro) para apagar
async function limitModal(max) {
  const evs = (await api('GET', '/api/events?all=1')).filter((e) => e.is_owner);
  const today = todayISO();
  const isPast = (e) => (e.date && e.date < today) || e.archived;
  evs.sort((a, b) => (isPast(b) - isPast(a)) || String(a.date).localeCompare(String(b.date)));
  const row = (e) => `<div class="handover" data-row="${e.id}">
      <div class="grow" style="min-width:0"><b>${esc(e.name)}</b>
        <div class="small muted">${e.date ? esc(fmtDate(e.date)) : 'sem data'}${isPast(e) ? ' · <span style="color:var(--warn)">passado</span>' : ''}${e.archived ? ' · arquivado' : ''}</div></div>
      <button type="button" class="btn sm danger" data-delpast="${e.id}">Apagar</button></div>`;
  const f = modal('Limite de eventos atingido', `
    <p>Já tens <b>${max} de ${max}</b> eventos. Para criares um novo, apaga eventos passados.</p>
    <div class="card" style="padding:4px 14px">${evs.map(row).join('')}</div>`);
  f.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-delpast]'); if (!b) return;
    const ev = evs.find((x) => x.id === Number(b.dataset.delpast));
    if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = 'Confirmar?'; b.classList.add('solid'); return; }
    b.disabled = true;
    await act(() => api('DELETE', `/api/events/${ev.id}`), `"${ev.name}" apagado`);
    $(`[data-row="${ev.id}"]`, f)?.remove();
    closeModal(); renderHome().then(() => $('#newev')?.click());
  });
}
function newEventModal() {
  modal('Novo evento', `
    <div class="field"><label>Nome do evento</label><input name="name" required placeholder="Ex: CCB 13.11.2026"></div>
    <details class="more"><summary>Mais opções (opcional)</summary>
    <div class="grid2" style="margin-top:12px"><div class="field"><label>Data</label><input name="date" type="date"></div>
    <div class="field"><label>Local / Sala</label><input name="venue" placeholder="Ex: CCB — Sala 2"></div></div>
    <div class="field"><label>Passagem para ON AIR</label><select name="air_mode">${Object.entries(AIR_MODES_LONG).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
    <div class="field"><label>Começar com</label><select name="template">
      <option value="standard">10 micros base (Head, Púlpito, 1–4 mão, 5–8 lapela)</option>
      <option value="">Vazio</option></select></div></details>`, {
    submitLabel: 'Criar',
    onSubmit: async (d) => {
      try { const r = await api('POST', '/api/events', d); go(`#/e/${r.id}/rundown`); }
      catch (e) { if (e.limit) { closeModal(); return limitModal(e.limit); } throw e; }
    },
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
  const { event, owner } = state.ev;
  const tabs = `<nav class="tabs">
    ${[['rundown', 'Alinhamento'], ['mics', 'Micros'], ['live', 'Ao vivo'], ['desk', 'Mesa'], ['log', 'Histórico'], ['settings', 'Evento']].map(([k, l]) => `<a class="tab ${tab === k ? 'on' : ''}" href="#/e/${event.id}/${k}">${l}</a>`).join('')}
  </nav>`;
  const crumb = `<span class="livedot ${state.live ? 'on' : ''}" title="Sincronização em tempo real"></span>${esc(event.name)}`;
  let content = '';
  if (tab === 'mics') content = viewMics();
  else if (tab === 'live') content = viewLive();
  else if (tab === 'settings') content = viewSettings();
  else if (tab === 'desk') content = viewDesk();
  else if (tab === 'log') content = viewLog();
  else content = viewRundown();
  const head = tab === 'live' ? '' : `<div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:6px">
      <div style="min-width:0"><h1>${esc(event.name)}</h1><div class="muted small">${esc(fmtDate(event.date))}${event.venue ? ' · ' + esc(event.venue) : ''}${isSuper() && owner ? ' · <span style="color:var(--info)">' + esc(owner.name || owner.email) + '</span>' : ''}</div></div></div>`;
  const gw = $('.gridwrap');
  const keep = gw && state.gridKey === `${tab}:${event.current_block_id}` ? { l: gw.scrollLeft, t: gw.scrollTop } : null;
  const wy = window.scrollY;
  app.innerHTML = shell(head + content, { crumb, tabs, wide: tab === 'live' || (tab === 'rundown' && state.rview === 'grid') || tab === 'desk' });
  state.gridScrollKeep = keep; state.gridKey = `${tab}:${event.current_block_id}`;
  if (keep) window.scrollTo(0, wy);
  applyGridPrefs();
  bindEvent(tab);
  updateTimers();
  state.lastEv = state.ev;
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
    ${blocks.length ? `<div class="seg"><button data-rview="list" class="${state.rview !== 'grid' ? 'on' : ''}">☰ Lista</button><button data-rview="grid" class="${state.rview === 'grid' ? 'on' : ''}">▦ Grelha de micros</button></div>` : ''}
    <a class="pill" href="#/e/${state.evId}/settings" title="Mudar em Evento">Modo ON AIR: ${AIR_MODES[state.ev.event.air_mode] || ''}</a>
    <button class="btn" onclick="window.print()">Imprimir</button>
  </div>`;
  if (blocks.length && state.rview === 'grid') {
    return toolbar + `<div class="screenonly">
      <div class="card gridwrap">${micGrid(blocks, { airId: a.currentId, editable: w })}</div>
      <p class="small muted">Linhas = micros, colunas = blocos. Toca numa célula vazia para dar esse micro a alguém nesse bloco; toca num nome para editar. <span class="lg-swap">↺ troca</span> = o micro muda de pessoa e tem de ser recolhido; <span class="lg-cont">→ continua</span> = a mesma pessoa fica com ele.</p>
    </div>`;
  }
  if (!blocks.length) return toolbar + `<div class="card empty">Ainda não há alinhamento.<br><br>Cria blocos (cada bloco = uma hora com um ou mais oradores, como um painel) ou <b>importa</b> diretamente da tua folha Excel/Google Sheets.</div>`;

  const blockHtml = (b, i) => {
    const isCur = b.id === a.currentId;
    const past = a.currentIdx >= 0 && i < a.currentIdx;
    if (b.kind === 'intervalo') {
      return `<div class="card block break ${isCur ? 'current' : ''} ${past ? 'past' : ''}"><div class="bh">
        <div class="time">${esc(b.start_time || '--:--')}${b.end_time ? `<small>até ${esc(b.end_time)}</small>` : ''}</div>
        <div class="title">${isCur ? '<span class="onair">ON AIR</span>' : ''}<b>☕ ${esc(b.title || 'Intervalo')}</b>${b.notes ? `<span class="muted small">${esc(b.notes)}</span>` : ''}</div>
        ${w ? `<button class="btn sm ${isCur ? 'airoff' : 'airsoft'}" data-setcur="${b.id}">${isCur ? 'Tirar do ar' : '● Pôr no ar'}</button>
        <span class="mvbtns"><button class="btn sm icon ghost" data-moveblock="${b.id}:-1" title="Passar para antes" ${i === 0 ? 'disabled' : ''}>▲</button><button class="btn sm icon ghost" data-moveblock="${b.id}:1" title="Passar para depois" ${i === blocks.length - 1 ? 'disabled' : ''}>▼</button></span>
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
        ${mikBtn(sl, m, w)}
        ${m ? batt(m.battery) : ''}
        ${micSelect(sl, mics, a.micById)}
      </div>`;
    }).join('');
    return `<div class="card block ${isCur ? 'current' : ''} ${past ? 'past' : ''}" id="b${b.id}">
      <div class="bh">
        <div class="time">${esc(b.start_time || '--:--')}${b.end_time ? `<small>até ${esc(b.end_time)}</small>` : ''}</div>
        <div class="title">${isCur ? '<span class="onair">ON AIR</span> <span class="tmini" data-t="mini"></span>' : ''}<b>${esc(b.title || (b.slots.length > 1 ? `Painel · ${b.slots.length} oradores` : 'Orador'))}</b>${(() => { const need = b.slots.filter((x) => needsMiking(a.micById[x.mic_id])); if (!need.length) return ''; const ok = need.filter((x) => x.miked).length; return `<span class="mikcount ${ok === need.length ? 'all' : ''}">${MIK_ICON} ${ok}/${need.length} micados</span>`; })()}
          ${b.notes ? `<span class="muted small">${esc(b.notes)}</span>` : ''}</div>
        ${w ? `<button class="btn sm ${isCur ? 'airoff' : 'airsoft'}" data-setcur="${b.id}">${isCur ? 'Tirar do ar' : '● Pôr no ar'}</button>
        <span class="mvbtns"><button class="btn sm icon ghost" data-moveblock="${b.id}:-1" title="Passar para antes" ${i === 0 ? 'disabled' : ''}>▲</button><button class="btn sm icon ghost" data-moveblock="${b.id}:1" title="Passar para depois" ${i === blocks.length - 1 ? 'disabled' : ''}>▼</button></span>
        <button class="btn sm icon ghost" data-editblock="${b.id}" aria-label="Editar">✎</button>` : ''}
      </div>
      ${slots}
      ${w ? `<form class="addslot" data-addslot="${b.id}">
        <input name="speaker" placeholder="+ Adicionar orador" autocomplete="off">
        <select name="mic_id"><option value="">Micro</option>${micOptionsFor(b)}</select>
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

// estado dos micros para um bloco a uma dada hora (para criar/editar blocos com previsão)
function micStateAt(time, selfId) {
  const { blocks } = state.ev;
  const prev = blocks.filter((x) => x.id !== selfId && x.kind !== 'intervalo' && (time ? (x.start_time && x.start_time < time) : true));
  const next = time ? blocks.filter((x) => x.id !== selfId && x.kind !== 'intervalo' && x.start_time && x.start_time > time) : [];
  const holder = {}; // micId -> {speaker, block}
  for (const pb of prev) for (const sl of pb.slots) if (sl.mic_id) holder[sl.mic_id] = { speaker: sl.speaker, block: pb };
  const nextUse = {}; // micId -> {speaker, block}
  for (const nb of [...next].reverse()) for (const sl of nb.slots) if (sl.mic_id) nextUse[sl.mic_id] = { speaker: sl.speaker, block: nb };
  return { prev, next, holder, nextUse };
}
function slotStatus(m, speaker, st, dupe) {
  if (!m) return speaker.trim() ? '<span class="gs bad">sem micro</span>' : '';
  const shared = ['pulpito', 'ambiente'].includes(m.type);
  if (dupe && !shared) return '<span class="gs bad">⚠ micro repetido neste bloco</span>';
  const h = st.holder[m.id];
  if (h && !shared && !sameName(h.speaker, speaker)) return `<span class="gs warn">↺ recolher de ${esc(shortName(h.speaker))} (${esc(h.block.start_time || '?')})</span>`;
  if (h && sameName(h.speaker, speaker)) return '<span class="gs cont">→ já está com ele/a</span>';
  return '<span class="gs ok">✓ livre</span>';
}

function blockModal(b) {
  const isNew = !b.id;
  const kind = b.kind || 'painel';
  const { mics } = state.ev;
  const micById = Object.fromEntries(mics.map((m) => [m.id, m]));
  const painel = kind === 'painel';
  const initial = isNew ? [{}, {}, {}] : (b.slots || []).map((sl) => ({ id: sl.id, speaker: sl.speaker, mic_id: sl.mic_id }));
  if (!isNew && painel && !initial.length) initial.push({});
  const rowHtml = (r) => `<div class="sprow" ${r.id ? `data-sid="${r.id}"` : ''}>
      <div class="row"><input name="sp" value="${esc(r.speaker || '')}" placeholder="Nome do orador" class="grow" autocomplete="off" list="speakers-dl">
      <select name="mi" data-val="${r.mic_id || ''}" style="width:200px"></select>
      <button type="button" class="btn sm icon ghost" data-rmrow aria-label="Remover">✕</button></div>
      <div class="sphint"></div></div>`;
  const speakerRows = painel ? `<label>Oradores e micros</label>
    <div id="newslots">${initial.map(rowHtml).join('')}</div>
    <button type="button" class="btn sm" id="moresp">+ mais um orador</button>
    <datalist id="speakers-dl">${[...new Set(state.ev.blocks.flatMap((x) => x.slots.map((sl) => sl.speaker)))].map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
    <div class="label-up" style="margin-top:16px">Previsão dos micros</div>
    <div id="bpreview" class="card pgridwrap"></div>` : '';
  const f = modal(isNew ? (kind === 'intervalo' ? 'Novo intervalo' : 'Novo bloco / painel') : 'Editar bloco', `
    <div class="grid2"><div class="field"><label>Hora início</label><input name="start_time" type="time" value="${esc(b.start_time || '')}"></div>
    <div class="field"><label>Hora fim (opcional)</label><input name="end_time" type="time" value="${esc(b.end_time || '')}"></div></div>
    <div class="field"><label>${kind === 'intervalo' ? 'Nome' : 'Título do painel (opcional)'}</label><input name="title" value="${esc(b.title || (isNew && kind === 'intervalo' ? 'Coffee Break' : ''))}" placeholder="${kind === 'intervalo' ? 'Coffee Break' : 'Ex: Painel Inovação'}"></div>
    <div class="field"><label>Notas</label><input name="notes" value="${esc(b.notes || '')}" placeholder="Ex: vídeo antes, entrada pela esquerda"></div>
    ${!isNew ? `<div class="field"><label>Tipo</label><select name="kind"><option value="painel" ${kind === 'painel' ? 'selected' : ''}>Bloco / Painel</option><option value="intervalo" ${kind === 'intervalo' ? 'selected' : ''}>Intervalo</option></select></div>` : ''}
    ${speakerRows}`, {
    wide: painel,
    submitLabel: isNew ? 'Criar' : 'Guardar',
    extraFooter: !isNew ? '<button type="button" class="btn danger" id="delblock">Apagar</button>' : '',
    onSubmit: async (d, form) => {
      const rows = $$('.sprow', form).map((r) => ({ id: Number(r.dataset.sid) || null, speaker: $('[name=sp]', r).value.trim(), mic_id: $('[name=mi]', r).value || null }));
      delete d.sp; delete d.mi;
      if (isNew) {
        d.kind = kind;
        d.slots = rows.filter((x) => x.speaker);
        await api('POST', `/api/events/${state.evId}/blocks`, d);
      } else {
        await api('PUT', `/api/blocks/${b.id}`, d);
        if (painel) {
          const keep = new Set(rows.filter((r) => r.id).map((r) => r.id));
          for (const sl of b.slots) if (!keep.has(sl.id)) await api('DELETE', `/api/slots/${sl.id}`);
          for (const r of rows) {
            if (r.id && r.speaker) { const o = b.slots.find((x) => x.id === r.id); if (o.speaker !== r.speaker || String(o.mic_id || '') !== String(r.mic_id || '')) await api('PUT', `/api/slots/${r.id}`, { speaker: r.speaker, mic_id: r.mic_id }); }
            else if (r.id && !r.speaker) await api('DELETE', `/api/slots/${r.id}`);
            else if (!r.id && r.speaker) await api('POST', `/api/blocks/${b.id}/slots`, { speaker: r.speaker, mic_id: r.mic_id });
          }
        }
      }
      scheduleReload();
    },
  });

  // ---- previsão ao vivo enquanto se escreve ----
  function refresh() {
    if (!painel) return;
    const time = $('[name=start_time]', f).value;
    const st = micStateAt(time, b.id);
    const rows = $$('.sprow', f).map((r) => ({ el: r, speaker: $('[name=sp]', r).value, sel: $('[name=mi]', r) }));
    rows.forEach((r) => { if (!r.sel.options.length) r.sel.value = ''; });
    const chosen = rows.map((r) => r.sel.value || r.sel.dataset.val || '');
    const count = {}; chosen.forEach((v) => { if (v) count[v] = (count[v] || 0) + 1; });
    // opções de cada select com o estado do micro
    rows.forEach((r, i) => {
      const cur = chosen[i];
      r.sel.innerHTML = `<option value="">Micro…</option>` + mics.map((m) => {
        const h = st.holder[m.id];
        const taken = chosen.some((v, j) => j !== i && v === String(m.id)) && !['pulpito', 'ambiente'].includes(m.type);
        const note = taken ? '⚠ já escolhido' : h ? `${shortName(h.speaker)} ${h.block.start_time || ''}` : 'livre';
        return `<option value="${m.id}" ${String(m.id) === cur ? 'selected' : ''}>${esc(m.label)} — ${esc(note)}</option>`;
      }).join('');
      delete r.sel.dataset.val;
      const m = micById[Number(cur)];
      r.sel.style.cssText = `width:200px;max-width:45%;${m ? `box-shadow:inset 5px 0 0 ${m.color}` : ''}`;
      r.el.querySelector('.sphint').innerHTML = r.speaker.trim() || m ? slotStatus(m, r.speaker, st, cur && count[cur] > 1) : '';
    });
    // grelha: últimos 3 blocos antes, este bloco, e o seguinte
    const cols = st.prev.slice(-3);
    const nextB = st.next[0];
    const draft = {}; rows.forEach((r, i) => { if (chosen[i]) (draft[chosen[i]] ||= []).push(r.speaker.trim() || '(sem nome)'); });
    const list = mics;
    const occ = (blk, m) => blk.slots.filter((sl) => sl.mic_id === m.id).map((sl) => esc(shortName(sl.speaker))).join('<br>');
    $('#bpreview', f).innerHTML = !mics.length ? '<div class="small muted" style="padding:12px">Ainda não há micros neste evento.</div>' : `<table class="pgrid">
      <tr><th>Micro</th>${cols.map((c) => `<th>${esc(c.start_time || '--:--')}</th>`).join('')}<th class="pnew">${esc(time || 'este')}<br><small>ESTE BLOCO</small></th>${nextB ? `<th>${esc(nextB.start_time)}<br><small>depois</small></th>` : ''}</tr>
      ${list.map((m) => {
        const d = draft[m.id];
        const shared = ['pulpito', 'ambiente'].includes(m.type);
        const h = st.holder[m.id];
        let cls = '', note = '';
        if (d) {
          if (d.length > 1 && !shared) { cls = 'bad'; note = 'repetido'; }
          else if (h && !shared && !sameName(h.speaker, d[0])) { cls = 'warn'; note = `recolher de ${esc(shortName(h.speaker))}`; }
          else cls = 'ok';
        } else if (h) { note = `<span class="muted">fica com ${esc(shortName(h.speaker))}</span>`; }
        else note = '<span style="color:var(--accent)">livre</span>';
        return `<tr><td>${chip(m)}</td>${cols.map((c) => `<td>${occ(c, m)}</td>`).join('')}
          <td class="pnew ${cls}">${d ? `<b>${d.map(esc).join('<br>')}</b>` : ''}${note ? `<small>${note}</small>` : ''}</td>
          ${nextB ? `<td class="muted">${occ(nextB, m)}</td>` : ''}</tr>`;
      }).join('')}
    </table>
    ${!cols.length ? `<div class="small muted" style="padding:8px 12px">Não há blocos antes ${time ? 'das ' + esc(time) : 'deste'} — todos os micros estão livres.</div>` : ''}`;
  }
  f.addEventListener('input', (e) => { if (e.target.matches('[name=sp], [name=start_time]')) refresh(); });
  f.addEventListener('change', (e) => { if (e.target.matches('[name=mi], [name=start_time]')) refresh(); });
  f.addEventListener('click', (e) => {
    const rm = e.target.closest('[data-rmrow]');
    if (rm) { rm.closest('.sprow').remove(); refresh(); }
  });
  $('#moresp', f)?.addEventListener('click', () => {
    const tmp = document.createElement('div'); tmp.innerHTML = rowHtml({});
    const row = tmp.firstElementChild; $('#newslots', f).appendChild(row); refresh(); $('input', row).focus();
  });
  refresh();
  $('#delblock', f)?.addEventListener('click', async () => {
    closeModal();
    if (await confirmBox('Apagar bloco?', `O bloco das ${b.start_time || '--:--'} e os seus ${b.slots?.length || 0} oradores vão ser apagados.`)) {
      await act(() => api('DELETE', `/api/blocks/${b.id}`), 'Bloco apagado'); scheduleReload();
    }
  });
}

// ---- mover bloco para cima/baixo: horário + impacto nos micros ----
const hm2min = (t) => (t ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : null);
const min2hm = (m) => (m == null ? '' : `${String(Math.floor(((m % 1440) + 1440) % 1440 / 60)).padStart(2, '0')}:${String(((m % 60) + 60) % 60).padStart(2, '0')}`);
function moveImpact(block, newStart) {
  // quantas trocas/conflitos de micros o bloco terá na nova posição
  if (block.kind === 'intervalo' || !block.slots.length) return '';
  const st = micStateAt(newStart, block.id);
  const micById = Object.fromEntries(state.ev.mics.map((m) => [m.id, m]));
  const cnt = {}; block.slots.forEach((sl) => { if (sl.mic_id) cnt[sl.mic_id] = (cnt[sl.mic_id] || 0) + 1; });
  return block.slots.map((sl) => {
    const m = micById[sl.mic_id];
    return `<div class="mvrow">${chip(m)}<span class="grow">${esc(sl.speaker)}</span>${slotStatus(m, sl.speaker, st, sl.mic_id && cnt[sl.mic_id] > 1)}</div>`;
  }).join('');
}
function moveBlockModal(b, dir) {
  const { blocks } = state.ev;
  const i = blocks.findIndex((x) => x.id === b.id);
  const o = blocks[i + dir]; if (!o) return;
  const durB = b.end_time && b.start_time ? hm2min(b.end_time) - hm2min(b.start_time) : null;
  const durO = o.end_time && o.start_time ? hm2min(o.end_time) - hm2min(o.start_time) : null;
  const label = (x) => `${x.start_time || '--:--'} ${x.kind === 'intervalo' ? '☕ ' + (x.title || 'Intervalo') : (x.title || x.slots.map((s) => s.speaker).join(', ') || 'Bloco')}`;
  // trocar horários: o primeiro dos dois fica com a hora de início do primeiro
  const first = dir < 0 ? o : b; const firstStart = first.start_time;
  const swapB = dir < 0 ? firstStart : (firstStart && durO != null ? min2hm(hm2min(firstStart) + durO) : o.start_time);
  const swapO = dir < 0 ? (firstStart && durB != null ? min2hm(hm2min(firstStart) + durB) : b.start_time) : firstStart;
  const noTimes = !b.start_time || !o.start_time;
  const f = modal(dir < 0 ? 'Passar bloco para antes' : 'Passar bloco para depois', `
    <div class="mvhead"><b>${esc(label(b))}</b><span class="muted">${dir < 0 ? 'passa para antes de' : 'passa para depois de'}</span><b>${esc(label(o))}</b></div>
    <div class="label-up" style="margin-top:14px">Horário</div>
    ${noTimes ? '<p class="small muted">Estes blocos não têm hora — só troca a ordem.</p><input type="hidden" name="mode" value="order">' : `
    <label class="mvopt"><input type="radio" name="mode" value="swap" checked> <span><b>Trocar os horários</b><br><span class="small muted">Este bloco fica às <b>${esc(swapB || '--:--')}</b> e o outro passa para as <b>${esc(swapO || '--:--')}</b>${durB != null || durO != null ? ' (mantendo a duração de cada um)' : ''}.</span></span></label>
    <label class="mvopt"><input type="radio" name="mode" value="custom"> <span><b>Escolher a hora deste bloco</b><br><span class="row" style="gap:8px;margin-top:6px"><input type="time" name="custom" value="${esc(swapB || '')}" style="width:150px"><span class="small muted">o outro bloco fica como está</span></span></span></label>`}
    <div class="label-up" style="margin-top:14px">Micros na nova posição</div>
    <div id="mvimpact" class="card" style="padding:6px 12px">${moveImpact(b, noTimes ? '' : swapB) || '<span class="small muted">Sem oradores com micro neste bloco.</span>'}</div>
    ${b.kind !== 'intervalo' && b.slots.length ? '<label class="row" style="color:var(--text);margin-top:12px"><input type="checkbox" name="review" checked style="width:auto;min-height:0"> Depois de mover, abrir este bloco para rever / mudar os micros</label>' : ''}`, {
    submitLabel: 'Mover', wide: true,
    onSubmit: async (d) => {
      let body;
      if (d.mode === 'order' || noTimes) body = { start_time: b.start_time, end_time: b.end_time, swap_with: o.id, swap_sort: true };
      else if (d.mode === 'custom') {
        if (!d.custom) throw new Error('Escolhe a hora');
        body = { start_time: d.custom, end_time: durB != null ? min2hm(hm2min(d.custom) + durB) : b.end_time };
      } else body = { start_time: swapB, end_time: durB != null ? min2hm(hm2min(swapB) + durB) : '', swap_with: o.id, other_start: swapO, other_end: durO != null ? min2hm(hm2min(swapO) + durO) : '' };
      await api('POST', `/api/blocks/${b.id}/move`, body);
      toast('Bloco movido');
      if (d.review) { state.reviewBlock = b.id; }
      scheduleReload();
    },
  });
  const upd = () => {
    const mode = $('[name=mode]:checked', f)?.value || 'order';
    const t = mode === 'custom' ? $('[name=custom]', f).value : swapB;
    $('#mvimpact', f).innerHTML = moveImpact(b, noTimes ? '' : t) || '<span class="small muted">Sem oradores com micro neste bloco.</span>';
  };
  f.addEventListener('change', upd); f.addEventListener('input', (e) => { if (e.target.name === 'custom') { $('[name=mode][value=custom]', f).checked = true; upd(); } });
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
    return `<div class="card mic st-${m.status} ${m.battery === 0 ? 'dead' : m.battery === 1 ? 'low' : ''}" data-micid="${m.id}">
      ${w && ft === 'all' ? '<span class="drag" data-drag title="Arrasta para mudar a ordem">⠿</span>' : ''}
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

// ---- micado / por micar ----
const MIK_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4"/></svg>';
const needsMiking = (m) => m && !['pulpito', 'ambiente'].includes(m.type);
const mikBtn = (sl, m, w) => !needsMiking(m) ? '' : `<button class="mik ${sl.miked ? 'on' : ''}" data-miked="${sl.id}" ${w ? '' : 'disabled'} title="${sl.miked ? 'Micado — toca para desfazer' : 'Por micar — toca quando o micro estiver colocado'}">${MIK_ICON}<span>${sl.miked ? 'Micado' : 'Por micar'}</span></button>`;

// ---- ocupação dos micros por bloco ----
function occupancy() {
  const { blocks } = state.ev;
  const occ = {}; // blockId -> micId -> [slots]
  const prevHolder = {}; // blockId -> micId -> {speaker, block}  (quem tinha o micro no bloco anterior em que foi usado)
  const last = {}; // micId -> {speaker, block}
  const free = []; // blockId -> slots sem micro
  for (const b of blocks) {
    occ[b.id] = {}; prevHolder[b.id] = { ...last }; free[b.id] = [];
    if (b.kind === 'intervalo') continue;
    for (const sl of b.slots) { if (sl.mic_id) (occ[b.id][sl.mic_id] ||= []).push(sl); else free[b.id].push(sl); }
    for (const sl of b.slots) if (sl.mic_id) last[sl.mic_id] = { speaker: sl.speaker, block: b };
  }
  return { occ, prevHolder, free };
}
const sameName = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
const shortName = (n) => { const p = String(n || '').trim().split(/\s+/); return p.length > 2 ? `${p[0]} ${p[p.length - 1]}` : p.join(' '); };

// opções do micro ao adicionar um orador: mostra quem o tem nos 2 blocos anteriores
function micOptionsFor(block) {
  const { mics, blocks } = state.ev;
  const { occ } = occupancy();
  const idx = blocks.findIndex((b) => b.id === block.id);
  const prev = blocks.slice(0, idx).filter((b) => b.kind !== 'intervalo').slice(-2).reverse();
  return mics.map((m) => {
    const here = occ[block.id]?.[m.id];
    let note = 'livre';
    if (here && !['pulpito', 'ambiente'].includes(m.type)) note = `⚠ já neste bloco: ${shortName(here[0].speaker)}`;
    else {
      for (const pb of prev) { const h = occ[pb.id]?.[m.id]; if (h) { note = `${shortName(h[0].speaker)} (${pb.start_time || '?'})`; break; } }
    }
    return `<option value="${m.id}">${esc(m.label)} — ${esc(note)}</option>`;
  }).join('');
}

// grelha micros × blocos (usada no Ao vivo e no Alinhamento)
function micGrid(cols, { airId, editable, live } = {}) {
  const { mics, blocks } = state.ev;
  const { occ, prevHolder, free } = occupancy();
  const airIdx = blocks.findIndex((b) => b.id === airId);
  const used = new Set(); cols.forEach((b) => Object.keys(occ[b.id] || {}).forEach((k) => used.add(Number(k))));
  const rows = live ? mics.filter((m) => used.has(m.id)) : mics;
  const hasFree = cols.some((b) => free[b.id]?.length);
  const tag = (b) => {
    if (!live) return b.id === airId ? '<span class="onair">ON AIR</span>' : '';
    const i = blocks.indexOf(b) - airIdx;
    if (airIdx < 0) return i === -airIdx ? '' : '';
    return i < 0 ? '<span class="gtag">ANTES</span>' : i === 0 ? '<span class="onair">ON AIR</span>' : i === 1 ? '<span class="gtag next">A SEGUIR</span>' : '<span class="gtag">DEPOIS</span>';
  };
  const head = `<tr><th class="sticky gcorner">Micro</th>${cols.map((b) => b.kind === 'intervalo'
    ? `<th class="gbreak"><div class="gh"><b class="gtime">${esc(b.start_time || '')}</b><small>☕</small></div></th>`
    : `<th class="${b.id === airId ? 'gair' : ''}"><button class="gh" ${editable ? `data-editblock="${b.id}"` : ''}>${tag(b)}<b class="gtime">${esc(b.start_time || '--:--')}</b>${b.id === airId ? '<span class="tmini" data-t="mini"></span>' : ''}<small>${esc(b.title || (b.slots.length > 1 ? `Painel · ${b.slots.length}` : ''))}</small></button></th>`).join('')}</tr>`;
  const cell = (b, m) => {
    if (b.kind === 'intervalo') return '<td class="gbreak"></td>';
    const air = b.id === airId ? ' gair' : '';
    const here = occ[b.id]?.[m.id];
    if (!here) return `<td class="gfree${air}">${editable ? `<button class="gc add" data-gridadd="${b.id}:${m.id}" aria-label="Dar micro ${esc(m.label)}">+</button>` : ''}</td>`;
    const ph = prevHolder[b.id]?.[m.id];
    const shared = ['pulpito', 'ambiente'].includes(m.type);
    const dup = here.length > 1 && !shared;
    const swap = !shared && ph && !sameName(ph.speaker, here[0].speaker);
    const cont = ph && !swap && blocks.indexOf(ph.block) === blocks.indexOf(b) - 1;
    const fromAir = live && swap && ph.block.id === airId;
    let sub = '';
    if (dup) sub = '<span class="gs bad">⚠ repetido</span>';
    else if (swap) sub = `<span class="gs ${fromAir ? 'warn' : 'swap'}">${fromAir ? 'recolher de' : '↺ de'} ${esc(shortName(ph.speaker))}</span>`;
    else if (cont) sub = '<span class="gs cont">→ continua</span>';
    const names = here.map((sl) => `<span class="gn ${sl.done ? 'done' : ''}">${esc(sl.speaker)}</span>`).join('');
    if (needsMiking(m)) sub += here[0].miked ? '<span class="gs mk">🎙 micado</span>' : '<span class="gs nomk">por micar</span>';
    // ao vivo: na coluna ON AIR o toque marca ✓ feito; nas outras marca micado
    const act = live ? (b.id === airId ? `data-done="${here[0].id}"` : needsMiking(m) ? `data-miked="${here[0].id}"` : '') : editable ? `data-editslot="${here[0].id}"` : '';
    return `<td class="gused${air}${swap ? ' gswap' : ''}${dup ? ' gdup' : ''}"><button class="gc ${live && b.id === airId && here[0].done ? 'on' : ''}" ${act} style="--mc:${esc(m.color)}">${names}${sub}</button></td>`;
  };
  const body = rows.map((m) => `<tr><td class="sticky"><div class="gm">${chip(m)}<div class="gmi"><b>${esc(m.person || TYPES[m.type])}</b><small>${m.person ? TYPES[m.type] : ''}${m.channel ? `${m.person ? ' · ' : ''}canal ${esc(m.channel)}` : ''}</small></div>${batt(m.battery)}</div></td>${cols.map((b) => cell(b, m)).join('')}</tr>`).join('');
  const freeRow = hasFree ? `<tr><td class="sticky"><div class="gm"><span class="chip none">—</span><div class="gmi"><b>Sem micro</b></div></div></td>${cols.map((b) => b.kind === 'intervalo' ? '<td class="gbreak"></td>'
    : `<td class="${b.id === airId ? 'gair' : ''}">${(free[b.id] || []).map((sl) => `<button class="gc nomic" ${editable ? `data-editslot="${sl.id}"` : ''}><span class="gn">${esc(sl.speaker)}</span><span class="gs bad">sem micro</span></button>`).join('')}</td>`).join('')}</tr>` : '';
  return `<table class="mgrid ${live ? 'live' : ''}">${head}${body}${freeRow}</table>`;
}

// ---- ao vivo: grelha ----
function viewLive() {
  const { blocks, event, mics } = state.ev;
  const a = analyze();
  const w = canWrite();
  const cur = blocks[a.currentIdx];
  // janela: 2 blocos antes, ON AIR, e os seguintes (até 6 colunas de oradores)
  const center = a.currentIdx >= 0 ? a.currentIdx : Math.max(0, a.dueIdx);
  const talkIdx = blocks.map((b, i) => (b.kind !== 'intervalo' ? i : -1)).filter((i) => i >= 0);
  const vp = viewPrefs();
  const before = vp.before ? talkIdx.filter((i) => i < center).slice(-vp.before) : [];
  const start = before.length ? before[0] : center;
  let cols = []; let talks = 0;
  for (let i = start; i < blocks.length && talks < vp.before + 1 + vp.after; i++) { cols.push(blocks[i]); if (blocks[i].kind !== 'intervalo') talks++; }
  const next = blocks.slice(a.currentIdx + 1).find((b) => b.kind !== 'intervalo');
  const lowNext = next ? next.slots.map((sl) => mics.find((m) => m.id === sl.mic_id)).filter((m) => m && m.battery <= 1) : [];
  const { occ, prevHolder } = occupancy();
  const swaps = next ? next.slots.filter((sl) => { const ph = prevHolder[next.id]?.[sl.mic_id]; const m = mics.find((x) => x.id === sl.mic_id); return sl.mic_id && ph && !sameName(ph.speaker, sl.speaker) && !['pulpito', 'ambiente'].includes(m?.type); }).length : 0;
  return `<div class="livebar">
      <div><div class="clock" id="clock">${nowHM()}</div><div class="muted small">${esc(event.name)} · modo ${AIR_MODES[event.air_mode]}</div></div>
      <div class="livesum">
        ${cur ? `<div><span class="label-up" style="color:var(--air)">No ar</span><b class="bigtime sm">${esc(cur.start_time || '--:--')}</b></div>` : '<div><span class="label-up">No ar</span><b class="muted">—</b></div>'}
        ${next ? `<div><span class="label-up">A seguir</span><b class="bigtime sm">${esc(next.start_time || '--:--')}</b></div>` : ''}
        ${next ? (() => { const need = next.slots.filter((x) => needsMiking(mics.find((m) => m.id === x.mic_id))); const miss = need.filter((x) => !x.miked).length; return need.length ? `<div><span class="label-up">Por micar</span><b class="bigtime sm" style="color:${miss ? 'var(--warn)' : 'var(--accent)'}">${miss ? miss : '✓'}</b></div>` : ''; })() : ''}
        ${next ? `<div><span class="label-up">Trocas</span><b class="bigtime sm" style="color:${swaps ? 'var(--warn)' : 'var(--accent)'}">${swaps}</b></div>` : ''}
        ${lowNext.length ? `<div><span class="label-up">Pilhas</span><b class="bigtime sm" style="color:var(--danger)">⚠ ${lowNext.map((m) => esc(m.label)).join(', ')}</b></div>` : ''}
      </div>
      ${w ? `<div class="livenav">
        <button class="btn" data-livenav="-1">◀</button>
        <button class="btn airbtn" data-livenav="1">● ${cur ? 'Próximo no ar' : 'Pôr no ar'} ▶</button>
        ${cur ? '<button class="btn" data-livenav="off" title="Tirar do ar">■</button>' : ''}
      </div>` : ''}
    </div>
    ${timerPanel()}
    ${tipDisplay()}
    <div class="gridtools"><span class="small muted">Ecrã: <b>${esc(vp.label || 'Personalizado')}</b></span><span class="grow"></span>
      <button class="btn sm" data-gz="-1" title="Mais pequeno">A−</button><button class="btn sm" data-gz="1" title="Maior">A+</button>
      <button class="btn sm" data-gw="-1" title="Blocos mais estreitos">◂▸ −</button><button class="btn sm" data-gw="1" title="Blocos mais largos">◂ ▸ +</button>
      <button class="btn sm ${vp.fit && !vp.colw ? 'primary' : ''}" data-gfit title="Ajustar colunas à largura do ecrã">⤢ Ajustar ao ecrã</button>
      <a class="btn sm" href="#/display">⚙ Configurar</a></div>
    ${blocks.length ? `<div class="card gridwrap live">${micGrid(cols, { airId: a.currentId, live: true })}</div>
    <p class="small muted">Mostra os 2 blocos anteriores, o que está ON AIR e os seguintes. <span class="lg-warn">recolher de</span> = tirar o micro a quem está no ar agora para dar ao próximo. Toca num nome na coluna ON AIR para marcar como ✓ feito; noutra coluna, para marcar como <b>micado</b>.</p>`
    : '<div class="card empty">Sem alinhamento.</div>'}`;
}

// ---- mesa de som: matriz de áudio ----
const DEFAULT_OUTPUTS = ['PA L/R', 'Monitor 1', 'Monitor 2', 'Gravação', 'Streaming'];
function viewDesk() {
  const { console: cs, mics, event } = state.ev;
  const micById = Object.fromEntries(mics.map((m) => [m.id, m]));
  const on = new Set(cs.routes.map(([c, o]) => `${c}:${o}`));
  const chs = [...cs.channels].sort((a, b) => (parseInt(a.num, 10) || 9999) - (parseInt(b.num, 10) || 9999) || a.sort - b.sort);
  const toolbar = `<div class="toolbar noprint">
    <div class="field" style="margin:0;min-width:200px;flex:1;max-width:320px"><input id="cmodel" value="${esc(event.console_model || '')}" placeholder="Modelo da mesa (ex: Yamaha CL5)"></div>
    <button class="btn" data-pickdesk>📚 Escolher mesa</button>
    <button class="btn primary" data-addch>+ Canal</button>
    <button class="btn" data-addout>+ Saída</button>
    ${mics.length ? '<button class="btn" data-chfrommics>Canais a partir dos micros</button>' : ''}
    <span class="grow"></span>
    <button class="btn" onclick="window.print()">Imprimir</button>
  </div>`;
  if (!chs.length && !cs.outputs.length) {
    return toolbar + `<div class="card empty">Ainda não há matriz para este evento.<br><br>
      1. Cria as <b>saídas</b> da mesa (PA, monitores, gravação…)<br>2. Cria os <b>canais</b> — ou gera-os automaticamente a partir dos micros<br>3. Toca nas células para ligar cada canal às saídas.<br><br>
      <button class="btn primary" data-baseouts>Criar saídas base (${DEFAULT_OUTPUTS.join(', ')})</button></div>`;
  }
  const head = `<tr><th class="sticky">Canal</th>${cs.outputs.map((o) => `<th><button class="outh" data-editout="${o.id}"><b>${esc(o.name)}</b>${o.dest ? `<small>${esc(o.dest)}</small>` : ''}</button></th>`).join('')}
    <th><button class="outh add" data-addout>+ saída</button></th></tr>`;
  const numCount = {}; chs.forEach((c) => { if (c.num) numCount[c.num] = (numCount[c.num] || 0) + 1; });
  const rows = chs.map((c) => {
    const m = micById[c.mic_id];
    const dupNum = numCount[c.num] > 1 || (event.console_inputs > 0 && parseInt(c.num, 10) > event.console_inputs);
    return `<tr><td class="sticky"><button class="chh" data-editch="${c.id}">
        <span class="chnum" ${dupNum ? 'style="color:var(--danger)" title="Número de canal repetido"' : ''}>${esc(c.num || '—')}</span>
        <span class="chname"><b>${esc(c.name || (m ? m.label : 'Canal'))}</b>
          <small>${[m ? `${TYPES[m.type]} ${esc(m.label)}` : '', c.input ? esc(c.input) : '', c.phantom ? '<span style="color:var(--warn)">48V</span>' : ''].filter(Boolean).join(' · ')}</small></span>
        ${m ? `<span class="chdot" style="background:${esc(m.color)}"></span>` : ''}
      </button></td>
      ${cs.outputs.map((o) => { const k = `${c.id}:${o.id}`; return `<td class="mx"><button class="cell ${on.has(k) ? 'on' : ''}" data-route="${k}" aria-label="${esc(c.name)} → ${esc(o.name)}"></button></td>`; }).join('')}<td></td></tr>`;
  }).join('');
  const totals = `<tr class="tot"><td class="sticky small muted">${chs.length} canais</td>${cs.outputs.map((o) => `<td class="small muted" style="text-align:center">${cs.routes.filter(([, oid]) => oid === o.id).length}</td>`).join('')}<td></td></tr>`;
  const print = `<div class="printonly"><h2>${esc(event.name)} — Matriz da mesa${event.console_model ? ' (' + esc(event.console_model) + ')' : ''}</h2>
    <table class="ptable"><tr><th>Canal</th><th>Nome</th><th>Micro</th><th>Entrada</th><th>48V</th>${cs.outputs.map((o) => `<th>${esc(o.name)}</th>`).join('')}</tr>
    ${chs.map((c) => { const m = micById[c.mic_id]; return `<tr><td>${esc(c.num)}</td><td>${esc(c.name)}</td><td class="m" style="background:${m ? esc(m.color) : '#fff'}">${m ? esc(m.label) : ''}</td><td>${esc(c.input)}</td><td>${c.phantom ? '●' : ''}</td>${cs.outputs.map((o) => `<td>${on.has(`${c.id}:${o.id}`) ? '●' : ''}</td>`).join('')}</tr>`; }).join('')}
    </table></div>`;
  const cap = event.console_inputs || 0;
  const over = cap ? chs.filter((c) => parseInt(c.num, 10) > cap).length : 0;
  const capLine = event.console_model ? `<div class="deskcap"><b>${esc(event.console_model)}</b>${cap ? ` · ${chs.length} de ${cap} canais usados` : ''} · ${cs.outputs.length} saídas
    ${over ? `<span class="pill danger">⚠ ${over} canal(is) acima do canal ${cap}</span>` : ''}</div>` : '';
  return toolbar + capLine + `<div class="screenonly">
    ${!chs.length ? '<div class="card small muted" style="margin-bottom:10px">Sem canais. Usa <b>+ Canal</b> ou <b>Canais a partir dos micros</b>.</div>' : ''}
    <div class="card matrixwrap"><table class="matrix">${head}${rows}${chs.length ? totals : ''}</table></div>
    <p class="small muted">Toca numa célula para ligar / desligar o canal nessa saída. Toca no nome do canal ou da saída para editar. Tudo sincroniza em tempo real.</p>
  </div>` + print;
}

// escolher mesa do catálogo (marca → modelo → versão) e criar a matriz por defeito
function deskPicker() {
  const C = window.CONSOLES || [];
  const f = modal('Escolher mesa de som', `
    <div class="grid2"><div class="field"><label>Marca</label><select name="brand">${C.map((b, i) => `<option value="${i}">${esc(b.brand)}</option>`).join('')}</select></div>
    <div class="field"><label>Modelo</label><select name="model"></select></div></div>
    <div class="field"><label>Versão</label><select name="ver"></select></div>
    <div id="dspec" class="card" style="margin-bottom:14px"></div>
    <div class="label-up">Saídas a criar na matriz</div>
    <label class="row" style="color:var(--text);margin:8px 0"><input type="checkbox" name="mains" checked style="width:auto;min-height:0"> <span id="dmains"></span></label>
    <div class="row" style="margin-bottom:8px"><label class="row grow" style="color:var(--text);margin:0"><input type="checkbox" name="usebus" checked style="width:auto;min-height:0"> <span id="dbusl">Buses</span></label><input name="nbus" type="number" min="0" style="width:90px"></div>
    <div class="row" style="margin-bottom:8px"><label class="row grow" style="color:var(--text);margin:0"><input type="checkbox" name="usemtx" style="width:auto;min-height:0"> <span id="dmtxl">Matrizes</span></label><input name="nmtx" type="number" min="0" style="width:90px"></div>
    <label class="row" style="color:var(--text);margin-top:10px"><input type="checkbox" name="replace" style="width:auto;min-height:0"> Substituir as saídas atuais da matriz</label>
    <p class="small muted" style="margin-bottom:0">Os valores vêm das especificações do fabricante — confirma no manual da tua mesa. Depois podes renomear, apagar ou juntar saídas à vontade (ex: "Mix 1" → "Monitor palco").</p>`, {
    submitLabel: 'Aplicar à mesa do evento', wide: true,
    onSubmit: async (d) => {
      const b = C[d.brand], m = b.models[d.model], v = m.versions[d.ver];
      const outs = [];
      if (d.mains) outs.push(...v.mains);
      if (d.usebus) for (let i = 1; i <= Math.min(v.buses || 64, Number(d.nbus) || 0); i++) outs.push(`${m.bus} ${i}`);
      if (d.usemtx) for (let i = 1; i <= Math.min(v.matrix || 24, Number(d.nmtx) || 0); i++) outs.push(`${m.mtx} ${i}`);
      await api('POST', `/api/events/${state.evId}/console/preset`, { model: `${b.brand} ${v.v}`, inputs: v.inputs, outputs: outs, replace: d.replace });
      toast(`${b.brand} ${v.v} aplicada${outs.length ? ` · ${outs.length} saídas` : ''}`); scheduleReload();
    },
  });
  const sel = (n) => $(`[name=${n}]`, f);
  const fillModels = () => { const b = C[sel('brand').value]; sel('model').innerHTML = b.models.map((m, i) => `<option value="${i}">${esc(m.model)}</option>`).join(''); fillVers(); };
  const fillVers = () => { const m = C[sel('brand').value].models[sel('model').value]; sel('ver').innerHTML = m.versions.map((v, i) => `<option value="${i}">${esc(v.v)}</option>`).join(''); spec(); };
  const spec = () => {
    const b = C[sel('brand').value], m = b.models[sel('model').value], v = m.versions[sel('ver').value];
    $('#dspec', f).innerHTML = `<div class="specs">
      <div><b>${v.inputs}</b><span>canais de entrada</span></div><div><b>${v.buses}</b><span>${esc(m.bus.toLowerCase())} buses</span></div>
      <div><b>${v.matrix || '—'}</b><span>matrizes</span></div><div><b>${v.mains.length}</b><span>saídas principais</span></div>
      <div><b>${v.local || '—'}</b><span>entradas locais</span></div></div>${v.note ? `<div class="small muted" style="margin-top:8px">${esc(v.note)}</div>` : ''}`;
    $('#dmains', f).textContent = `Saídas principais: ${v.mains.join(', ')}`;
    $('#dbusl', f).textContent = `${m.bus} 1 … (máx. ${v.buses})`; sel('nbus').value = Math.min(v.buses, 16); sel('nbus').max = v.buses;
    $('#dmtxl', f).textContent = v.matrix ? `${m.mtx} 1 … (máx. ${v.matrix})` : 'Esta mesa não tem matrizes dedicadas'; sel('nmtx').value = v.matrix; sel('nmtx').max = v.matrix;
    sel('usemtx').disabled = !v.matrix; sel('nmtx').disabled = !v.matrix;
  };
  sel('brand').onchange = fillModels; sel('model').onchange = fillVers; sel('ver').onchange = spec;
  fillModels();
}

function channelModal(c) {
  const isNew = !c.id;
  const { mics, console: cs } = state.ev;
  const nextNum = Math.max(0, ...cs.channels.map((x) => parseInt(x.num, 10) || 0)) + 1;
  const f = modal(isNew ? 'Novo canal' : `Canal ${c.num}`, `
    <div class="grid2"><div class="field"><label>Nº do canal</label><input name="num" value="${esc(c.num ?? String(nextNum))}" inputmode="numeric" required></div>
    <div class="field"><label>Nome (como na mesa)</label><input name="name" value="${esc(c.name || '')}" placeholder="Ex: Ana Head, Púlpito, Vídeo L"></div></div>
    <div class="field"><label>Micro ligado (opcional)</label><select name="mic_id"><option value="">— nenhum (fonte de linha, vídeo, PC…) —</option>${mics.map((m) => `<option value="${m.id}" ${m.id === c.mic_id ? 'selected' : ''}>${esc(m.label)} · ${TYPES[m.type]}${m.person ? ' · ' + esc(m.person) : ''}</option>`).join('')}</select></div>
    <div class="grid2"><div class="field"><label>Entrada física / Stagebox</label><input name="input" value="${esc(c.input || '')}" placeholder="Ex: SB1-05, Local 3, Dante 12"></div>
    <div class="field"><label>Notas</label><input name="notes" value="${esc(c.notes || '')}" placeholder="Ex: gate, HPF 100Hz"></div></div>
    <label class="row" style="color:var(--text)"><input type="checkbox" name="phantom" ${c.phantom ? 'checked' : ''} style="width:auto;min-height:0"> Phantom 48V</label>`, {
    submitLabel: isNew ? 'Adicionar' : 'Guardar',
    extraFooter: isNew ? '' : '<button type="button" class="btn danger" id="delch">Apagar</button>',
    onSubmit: async (d) => {
      if (!d.name) { const m = mics.find((x) => x.id === Number(d.mic_id)); d.name = m ? (m.person ? `${m.label} · ${m.person}` : /^\d+$/.test(m.label) ? `${TYPES[m.type]} ${m.label}` : m.label) : `Canal ${d.num}`; }
      if (isNew) await api('POST', `/api/events/${state.evId}/channels`, d); else await api('PUT', `/api/channels/${c.id}`, d);
      scheduleReload();
    },
  });
  $('#delch', f)?.addEventListener('click', async () => { closeModal(); await act(() => api('DELETE', `/api/channels/${c.id}`), 'Canal apagado'); scheduleReload(); });
}
function outputModal(o) {
  const isNew = !o.id;
  const f = modal(isNew ? 'Nova saída' : `Saída ${o.name}`, `
    <div class="field"><label>Nome</label><input name="name" value="${esc(o.name || '')}" required placeholder="Ex: PA L/R, Monitor 1, Gravação, Tradução"></div>
    <div class="field"><label>Destino / ligação (opcional)</label><input name="dest" value="${esc(o.dest || '')}" placeholder="Ex: Mix 1 → Omni 1, Matrix 3, IEM 2"></div>`, {
    submitLabel: isNew ? 'Adicionar' : 'Guardar',
    extraFooter: isNew ? '' : '<button type="button" class="btn danger" id="delout">Apagar</button>',
    onSubmit: async (d) => { if (isNew) await api('POST', `/api/events/${state.evId}/outputs`, d); else await api('PUT', `/api/outputs/${o.id}`, d); scheduleReload(); },
  });
  $('#delout', f)?.addEventListener('click', async () => { closeModal(); await act(() => api('DELETE', `/api/outputs/${o.id}`), 'Saída apagada'); scheduleReload(); });
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
          ${state.ev.access?.manage ? '<button class="btn danger" data-delev>Apagar evento</button>' : ''}
        </div></div>` : ''}
      ${teamCard()}
      <div class="card small muted">Abre este evento em vários aparelhos ao mesmo tempo (iPad do palco, telemóvel, PC da régie) — tudo sincroniza em tempo real.
        <div style="margin-top:8px">Última alteração: ${ago(event.updated_at)}</div></div>
    </div>
  </div>`;
}

// ---- equipa do evento ----
function teamCard() {
  const { members = [], owner, access = {} } = state.ev;
  const me = state.me;
  const row = (m) => `<div class="mrow">
      <div class="mav">${esc((m.name || m.email).trim()[0] || '?').toUpperCase()}</div>
      <div class="grow" style="min-width:0"><b>${esc(m.name || m.email)}</b><div class="small muted">${esc(m.email)}${m.pending ? ' · <span style="color:var(--warn)">convite pendente — ainda sem conta</span>' : ''}</div></div>
      ${access.manage || m.user_id === me.id || String(m.email).toLowerCase() === String(me.email).toLowerCase()
    ? `<button class="btn sm ghost" data-rmmember="${m.id}">${m.user_id === me.id ? 'Sair' : 'Remover'}</button>` : ''}
    </div>`;
  return `<div class="card team">
    <h2>👥 Equipa do evento</h2>
    <div class="mrow"><div class="mav own">${esc(((owner?.name || owner?.email || '?').trim()[0] || '?').toUpperCase())}</div>
      <div class="grow"><b>${esc(owner?.name || owner?.email || '')}</b><div class="small muted">${esc(owner?.email || '')} · dono do evento</div></div></div>
    ${members.map(row).join('')}
    ${access.manage ? `<form id="addmember" class="row" style="margin-top:12px">
        <input name="email" type="text" inputmode="email" placeholder="email do colega (vários: separa por vírgulas)" required class="grow">
        <button class="btn primary">Adicionar</button></form>
      <p class="small muted" style="margin:8px 0 0">Os colegas veem e editam este evento em tempo real (micros, pilhas, alinhamento, ON AIR, mesa). Só tu o podes apagar ou gerir a equipa. Se ainda não têm conta, ficam convidados: basta criarem conta com este email.</p>
      ${members.some((m) => m.pending) ? '<button type="button" class="btn sm" data-copyinvite style="margin-top:10px">📋 Copiar mensagem de convite</button>' : ''}`
    : '<p class="small muted" style="margin:8px 0 0">Foste adicionado a este evento por quem o criou.</p>'}
  </div>`;
}

// ---- notificações de alterações feitas por outras pessoas ----
function notifyChange(by, msg) {
  let box = $('#notifs');
  if (!box) { box = document.createElement('div'); box.id = 'notifs'; document.body.appendChild(box); }
  const el = document.createElement('div');
  el.className = 'notif';
  el.innerHTML = `<div class="mav">${esc((by || '?').trim()[0] || '?').toUpperCase()}</div><div class="grow"><b>${esc(by)}</b> <span>${esc(msg)}</span><small>${state.ev ? esc(state.ev.event.name) + ' · ' : ''}agora</small></div>`;
  el.onclick = () => { el.remove(); if (state.evId) go(`#/e/${state.evId}/log`); };
  box.prepend(el);
  while (box.children.length > 4) box.lastElementChild.remove();
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, 7000);
  // notificação do sistema quando a app está em segundo plano
  try {
    if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
      const n = new Notification(`MicDesk · ${by}`, { body: msg, icon: '/icon-192.png', tag: 'md-' + Date.now() });
      n.onclick = () => { window.focus(); n.close(); };
    }
  } catch { }
}

// ---- histórico do evento ----
function viewLog() {
  const canNotify = 'Notification' in window;
  const perm = canNotify ? Notification.permission : 'unsupported';
  setTimeout(loadLog, 0);
  return `<div class="toolbar">
      <select id="logwho" style="width:auto;min-width:180px"><option value="">Todas as pessoas</option></select>
      <input id="logq" placeholder="Procurar (ex: micro 3, pilhas, Ana)" class="grow" style="max-width:360px" value="${esc(state.logQ || '')}">
      <span class="grow"></span>
      ${perm === 'granted' ? '<span class="pill ok">🔔 Notificações ativas neste aparelho</span>'
    : perm === 'default' ? '<button class="btn" data-notifperm>🔔 Ativar notificações neste aparelho</button>'
      : perm === 'denied' ? '<span class="pill warn">🔕 Notificações bloqueadas no browser</span>' : ''}
    </div>
    <div class="card" style="padding:0"><div id="loglist"><div class="empty">A carregar…</div></div></div>
    <p class="small muted">Cada alteração fica registada com o nome de quem a fez, para ninguém ficar com culpas que não são suas. Quando um colega muda alguma coisa, aparece-te uma notificação no canto do ecrã.</p>`;
}
async function loadLog() {
  const box = $('#loglist'); if (!box) return;
  let rows;
  try { rows = await api('GET', `/api/events/${state.evId}/log?limit=500`); } catch (e) { box.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  state.logRows = rows; state.logDirty = false;
  const who = $('#logwho');
  if (who && who.options.length <= 1) {
    const people = [...new Map(rows.map((r) => [r.user_id, r.user_name])).entries()];
    who.innerHTML = '<option value="">Todas as pessoas</option>' + people.map(([id, n]) => `<option value="${id}" ${String(state.logWho || '') === String(id) ? 'selected' : ''}>${esc(n)}</option>`).join('');
  }
  drawLog();
}
function drawLog() {
  const box = $('#loglist'); if (!box || !state.logRows) return;
  const q = (state.logQ || '').toLowerCase();
  const rows = state.logRows.filter((r) => (!state.logWho || String(r.user_id) === String(state.logWho)) && (!q || (r.msg + ' ' + r.user_name).toLowerCase().includes(q)));
  if (!rows.length) { box.innerHTML = `<div class="empty">${state.logRows.length ? 'Nada encontrado com este filtro.' : 'Ainda não há alterações registadas neste evento.'}</div>`; return; }
  let lastDay = '';
  box.innerHTML = rows.map((r) => {
    const d = new Date(r.at.replace(' ', 'T') + 'Z');
    const day = d.toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' });
    const head = day !== lastDay ? `<div class="logday">${esc(day)}</div>` : '';
    lastDay = day;
    const mine = r.user_id === state.me.id;
    return `${head}<div class="logrow"><span class="logtime">${d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
      <div class="mav ${mine ? 'own' : ''}">${esc((r.user_name || '?').trim()[0] || '?').toUpperCase()}</div>
      <div class="grow"><b>${esc(r.user_name)}${mine ? ' <span class="muted small">(tu)</span>' : ''}</b> ${esc(r.msg)}</div></div>`;
  }).join('');
}

// ---------- event bindings ----------
function bindEvent(tab) {
  const root = app;
  root.onclick = async (e) => {
    const t = (sel) => e.target.closest(sel);
    let el;
    if ((el = t('[data-addblock]'))) return blockModal({ kind: el.dataset.addblock });
    if ((el = t('[data-moveblock]'))) { const [id, dir] = el.dataset.moveblock.split(':').map(Number); return moveBlockModal(state.ev.blocks.find((x) => x.id === id), dir); }
    if ((el = t('[data-editblock]'))) return blockModal(state.ev.blocks.find((b) => b.id === Number(el.dataset.editblock)));
    if (t('[data-import]')) return importModal();
    if ((el = t('[data-editslot]'))) {
      const id = Number(el.dataset.editslot);
      for (const b of state.ev.blocks) { const sl = b.slots.find((x) => x.id === id); if (sl) return slotModal(sl, b); }
    }
    if ((el = t('[data-done]'))) {
      const id = Number(el.dataset.done);
      const on = !el.classList.contains('on');
      el.classList.toggle('on', on); el.closest('.slot, .liveslot')?.classList.toggle('done', on); $$('.gn', el).forEach((x) => x.classList.toggle('done', on));
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
    if ((el = t('[data-rview]'))) { state.rview = el.dataset.rview; try { localStorage.setItem('md_rview', state.rview); } catch { } return renderEvent('rundown'); }
    if ((el = t('[data-gridadd]'))) {
      const [bid, mid] = el.dataset.gridadd.split(':').map(Number);
      const b = state.ev.blocks.find((x) => x.id === bid); const m = state.ev.mics.find((x) => x.id === mid);
      const ph = occupancy().prevHolder[bid]?.[mid];
      return modal(`Micro ${m.label} às ${b.start_time || '--:--'}`, `
        ${ph ? `<p class="small muted" style="margin-top:0">Antes estava com <b>${esc(ph.speaker)}</b> (${esc(ph.block.start_time || '?')}).</p>` : '<p class="small muted" style="margin-top:0">Micro livre até aqui.</p>'}
        <div class="field"><label>Quem fala com este micro?</label><input name="speaker" required list="speakers-dl" placeholder="Nome do orador"></div>
        <datalist id="speakers-dl">${[...new Set(state.ev.blocks.flatMap((x) => x.slots.map((sl) => sl.speaker)))].map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
        <div class="field"><label>Função / Nota (opcional)</label><input name="role" placeholder="Ex: Moderador"></div>`, {
        submitLabel: 'Adicionar',
        onSubmit: async (d) => { await api('POST', `/api/blocks/${bid}/slots`, { ...d, mic_id: mid }); scheduleReload(); },
      });
    }
    if (t('[data-stage]')) return openStage();
    if ((el = t('[data-gz]'))) { const v = viewPrefs(); const cur = v.name || Number(getComputedStyle($('.mgrid.live') || document.body).getPropertyValue('--g-name').replace('px', '')) || 17; v.name = Math.max(10, Math.min(36, cur + Number(el.dataset.gz) * 2)); v.label = 'Personalizado'; v.presetId = null; saveView(v); return renderEvent('live'); }
    if ((el = t('[data-gw]'))) {
      const v = viewPrefs(); const tbl = $('.mgrid.live');
      const cur = v.colw || Number((tbl && getComputedStyle(tbl).getPropertyValue('--g-colw').replace('px', '')) || 160);
      v.colw = Math.max(80, Math.min(400, Math.round((cur + Number(el.dataset.gw) * 20) / 10) * 10)); v.label = 'Personalizado'; v.presetId = null; saveView(v);
      toast(`Largura dos blocos: ${v.colw} px`); return renderEvent('live');
    }
    if (t('[data-gfit]')) { const v = viewPrefs(); if (v.colw) { v.colw = 0; v.fit = true; } else v.fit = !v.fit; v.label = 'Personalizado'; v.presetId = null; saveView(v); return renderEvent('live'); }
    if (t('[data-tipok]')) { try { localStorage.setItem('md_tip_display', '1'); } catch { } $('.tipbar')?.remove(); if (!t('a')) return; }
    if ((el = t('[data-miked]'))) {
      const id = Number(el.dataset.miked);
      let cur = null; for (const b of state.ev.blocks) { const x = b.slots.find((y) => y.id === id); if (x) cur = x; }
      if (!cur) return;
      const on = !cur.miked; cur.miked = on ? 1 : 0;
      if (el.classList.contains('mik')) { el.classList.toggle('on', on); $('span', el).textContent = on ? 'Micado' : 'Por micar'; }
      const r = await act(() => api('PUT', `/api/slots/${id}`, { miked: on }));
      if (r && r.propagated) toast(`${cur.speaker}: ${on ? 'micado' : 'por micar'} também em mais ${r.propagated} bloco${r.propagated > 1 ? 's' : ''} seguinte${r.propagated > 1 ? 's' : ''} (mesmo micro)`);
      return scheduleReload();
    }
    if (t('[data-notifperm]')) { try { await Notification.requestPermission(); } catch { } return renderEvent('log'); }
    if ((el = t('[data-rmmember]'))) {
      const m = state.ev.members.find((x) => x.id === Number(el.dataset.rmmember));
      const self = m.user_id === state.me.id;
      if (!(await confirmBox(self ? 'Sair deste evento?' : `Remover ${m.name || m.email}?`, self ? 'Deixas de ver este evento.' : 'Esta pessoa deixa de ter acesso ao evento.', self ? 'Sair' : 'Remover'))) return;
      const r = await act(() => api('DELETE', `/api/events/${state.evId}/members/${m.id}`));
      if (r.left) { stopStream(); state.ev = null; state.evId = null; return go('#/'); }
      return scheduleReload();
    }
    if (t('[data-copyinvite]')) {
      const msg = `Olá! Adicionei-te ao evento "${state.ev.event.name}" na MicDesk.\nCria a tua conta com este email em ${location.origin} e o evento aparece-te automaticamente.`;
      try { await navigator.clipboard.writeText(msg); toast('Mensagem copiada — cola no WhatsApp ou email'); } catch { modal('Mensagem de convite', `<textarea style="font-family:inherit" rows="5">${esc(msg)}</textarea>`); }
      return;
    }
    if (t('[data-pickdesk]')) return deskPicker();
    if (t('[data-addch]')) return channelModal({});
    if ((el = t('[data-editch]'))) return channelModal(state.ev.console.channels.find((c) => c.id === Number(el.dataset.editch)));
    if (t('[data-addout]')) return outputModal({});
    if ((el = t('[data-editout]'))) return outputModal(state.ev.console.outputs.find((o) => o.id === Number(el.dataset.editout)));
    if (t('[data-baseouts]')) { await act(() => api('POST', `/api/events/${state.evId}/outputs`, { names: DEFAULT_OUTPUTS }), 'Saídas criadas'); return scheduleReload(); }
    if (t('[data-chfrommics]')) {
      const r = await act(() => api('POST', `/api/events/${state.evId}/channels/from-mics`, { route_first: true }));
      toast(r.created ? `${r.created} canais criados a partir dos micros` : 'Todos os micros já têm canal'); return scheduleReload();
    }
    if ((el = t('[data-route]'))) {
      const [c, o] = el.dataset.route.split(':').map(Number);
      const onNow = !el.classList.contains('on');
      el.classList.toggle('on', onNow);
      const rt = state.ev.console.routes;
      if (onNow) rt.push([c, o]); else state.ev.console.routes = rt.filter(([x, y]) => !(x === c && y === o));
      await act(() => api('POST', `/api/events/${state.evId}/routes`, { channel_id: c, output_id: o, on: onNow })).catch(() => el.classList.toggle('on', !onNow));
      return;
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
        onSubmit: async (d) => {
          try { const r = await api('POST', `/api/events/${state.evId}/duplicate`, d); toast('Evento duplicado'); state.ev = null; go(`#/e/${r.id}/rundown`); }
          catch (e) { if (e.limit) { closeModal(); return limitModal(e.limit); } throw e; }
        },
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
  root.oninput = (e) => { if (e.target.id === 'logq') { state.logQ = e.target.value; drawLog(); } };
  root.onchange = async (e) => {
    if (e.target.id === 'logwho') { state.logWho = e.target.value; drawLog(); return; }
    if (e.target.id === 'cmodel') { await act(() => api('PUT', `/api/events/${state.evId}`, { console_model: e.target.value }), 'Modelo da mesa guardado'); return; }
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
    if (f.id === 'addmember') {
      e.preventDefault();
      const r = await act(() => api('POST', `/api/events/${state.evId}/members`, formData(f)));
      const pend = r.added.filter((x) => !x.has_account).length;
      toast(r.added.length ? `${r.added.length} colega(s) adicionado(s)${pend ? ` · ${pend} convite(s) pendente(s)` : ''}` : 'Já estava na equipa');
      f.reset(); return scheduleReload();
    }
    if (f.id === 'evform') {
      e.preventDefault();
      await act(() => api('PUT', `/api/events/${state.evId}`, formData(f)), 'Guardado'); return scheduleReload();
    }
  };
  // arrastar micros para mudar a ordem (rato e toque)
  root.onpointerdown = (e) => {
    const h = e.target.closest('[data-drag]'); if (!h) return;
    e.preventDefault();
    const card = h.closest('.mic'); const grid = card.parentElement;
    const startOrder = $$('.mic', grid).map((x) => x.dataset.micid).join(',');
    card.classList.add('dragging'); document.body.classList.add('nosel');
    const move = (ev) => {
      const y = ev.clientY;
      if (y < 80) window.scrollBy(0, -12); else if (y > window.innerHeight - 60) window.scrollBy(0, 12);
      card.style.visibility = 'hidden';
      const over = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.mic');
      card.style.visibility = '';
      if (!over || over === card || over.parentElement !== grid) return;
      const r = over.getBoundingClientRect();
      const after = (ev.clientY - r.top) / r.height > 0.5 || (Math.abs(ev.clientY - (r.top + r.height / 2)) < r.height / 3 && ev.clientX > r.left + r.width / 2);
      grid.insertBefore(card, after ? over.nextSibling : over);
    };
    const up = async () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      card.classList.remove('dragging'); document.body.classList.remove('nosel');
      const ids = $$('.mic', grid).map((x) => Number(x.dataset.micid));
      if (ids.join(',') === startOrder) return;
      await act(() => api('POST', `/api/events/${state.evId}/mics/order`, { ids }), 'Ordem dos micros guardada');
      scheduleReload();
    };
    // (mover o cartão no DOM cancela o "pointer capture", por isso ouvimos na janela)
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  };
  if (state.reviewBlock && tab === 'rundown') {
    const rb = state.ev.blocks.find((x) => x.id === state.reviewBlock); state.reviewBlock = null;
    if (rb) setTimeout(() => { blockModal(rb); $('#b' + rb.id)?.scrollIntoView({ block: 'center' }); }, 50);
  }
  if (state.focusAdd) { $(`[data-addslot="${state.focusAdd}"] input`)?.focus(); state.focusAdd = null; }
  // grelha: garantir que a coluna ON AIR fica visível (no telemóvel aparece logo a seguir à coluna dos micros)
  const air = $('.gridwrap th.gair');
  if (state.gridScrollKeep && $('.gridwrap')) {
    const w = $('.gridwrap'); w.scrollLeft = state.gridScrollKeep.l; w.scrollTop = state.gridScrollKeep.t; state.gridScrollKeep = null;
  } else if (air) {
    const wrap = air.closest('.gridwrap'); const stickyW = $('.gcorner', wrap)?.offsetWidth || 0;
    const r = air.getBoundingClientRect(), wr = wrap.getBoundingClientRect();
    if (r.right > wr.right) wrap.scrollLeft += r.left - (wr.left + stickyW);
  }
}

// relógio ao vivo
setInterval(() => {
  const c = $('#clock'); if (c) c.textContent = nowHM();
  updateTimers();
}, 1000);
// ---------- ecrã e experiência (por aparelho) ----------
const VIEW_PRESETS = [
  { id: 'auto', label: 'Automático', desc: 'Ajusta-se sozinho ao ecrã', fit: true, name: 0, density: 'normal', before: 2, after: 4 },
  { id: 'pc', label: 'PC / régie', desc: 'Mais colunas, letra compacta', fit: true, name: 15, density: 'compact', before: 2, after: 6 },
  { id: 'ipad', label: 'iPad', desc: 'Equilíbrio entre tamanho e colunas', fit: true, name: 18, density: 'normal', before: 2, after: 3 },
  { id: 'phone', label: 'Telemóvel', desc: 'Poucas colunas, desliza para o lado', fit: false, name: 16, density: 'compact', before: 1, after: 2 },
  { id: 'stage', label: 'Palco / letra grande', desc: 'Para ver de longe', fit: true, name: 26, density: 'comfortable', before: 1, after: 2 },
  { id: 'all', label: 'Visão total', desc: 'O máximo de blocos possível', fit: true, name: 13, density: 'compact', before: 3, after: 10 },
];
function viewPrefs() {
  let v = null; try { v = JSON.parse(localStorage.getItem('md_view') || 'null'); } catch { }
  if (!v) { const w = window.innerWidth; v = { ...VIEW_PRESETS.find((p) => p.id === (w < 600 ? 'phone' : w < 1200 ? 'ipad' : 'pc')) }; }
  return { fit: true, name: 0, colw: 0, density: 'normal', before: 2, after: 4, ...v };
}
function saveView(v) { try { localStorage.setItem('md_view', JSON.stringify(v)); } catch { } }
const DENS = { compact: { pad: 6, rowh: 50 }, normal: { pad: 9, rowh: 66 }, comfortable: { pad: 14, rowh: 88 } };
// aplica tamanhos à grelha; no modo "ajustar" as colunas dividem a largura disponível
function applyGridPrefs(root = document) {
  const v = viewPrefs();
  $$('.gridwrap.live, .gridwrap.preview', root).forEach((wrap) => {
    const tbl = $('.mgrid', wrap); if (!tbl) return;
    const vw = wrap.clientWidth || window.innerWidth;
    const d = DENS[v.density] || DENS.normal;
    const stickyW = Math.round(Math.max(vw < 600 ? 120 : 150, Math.min(220, vw * 0.15)));
    const cols = $$('tr:first-child th', tbl).filter((th) => !th.classList.contains('gcorner'));
    const breaks = cols.filter((th) => th.classList.contains('gbreak')).length;
    const talk = Math.max(1, cols.length - breaks);
    let colW = v.fit ? Math.floor((vw - stickyW - breaks * 46 - 8 - talk * 2) / talk) : 160;
    colW = Math.max(v.fit ? 96 : 110, colW);
    if (v.colw > 0) colW = v.colw; // largura escolhida à mão
    const name = v.name || Math.round(Math.max(13, Math.min(24, colW / 9)));
    // nomes grandes precisam de colunas largas (senão as palavras partem-se) — aí a grelha desliza
    if (!(v.colw > 0)) colW = Math.max(colW, Math.round(name * 7.2));
    tbl.style.setProperty('--g-colw', colW + 'px');
    tbl.style.setProperty('--g-name', name + 'px');
    tbl.style.setProperty('--g-sub', Math.max(10, Math.round(name * 0.68)) + 'px');
    tbl.style.setProperty('--g-time', Math.max(16, Math.min(34, Math.round(name * 1.35))) + 'px');
    tbl.style.setProperty('--g-pad', d.pad + 'px');
    tbl.style.setProperty('--g-rowh', Math.max(d.rowh, Math.round(name * 3.3)) + 'px');
    tbl.style.setProperty('--g-stk', stickyW + 'px');
    tbl.classList.add('tuned'); tbl.classList.toggle('fit', !!v.fit);
    tbl.classList.toggle('stk-narrow', stickyW < 170);
  });
}
let resizeT; window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => applyGridPrefs(), 120); });
function tipDisplay() {
  let seen = false; try { seen = localStorage.getItem('md_tip_display') === '1'; } catch { }
  if (seen) return '';
  return `<div class="card tipbar"><span style="font-size:22px">🖥</span><div class="grow"><b>Ajusta o Ao vivo a este ecrã</b><div class="small muted">Escolhe uma predefinição (PC, iPad, Palco…) ou personaliza o tamanho dos nomes e o número de blocos — com pré-visualização.</div></div>
    <a class="btn sm primary" href="#/display" data-tipok>Configurar</a><button class="btn sm ghost icon" data-tipok aria-label="Fechar">✕</button></div>`;
}
let userPresets = null;
async function loadUserPresets() {
  if (userPresets) return userPresets;
  try { const p = await api('GET', '/api/me/prefs'); userPresets = Array.isArray(p.viewPresets) ? p.viewPresets : []; } catch { userPresets = []; }
  return userPresets;
}
async function saveUserPresets() { const p = await api('GET', '/api/me/prefs').catch(() => ({})); p.viewPresets = userPresets; await api('PUT', '/api/me/prefs', p); }

// dados de exemplo para a pré-visualização quando não há evento aberto
function demoEvent() {
  const mk = (id, label, type, color, person = '') => ({ id, label, type, color, person, battery: 3 - (id % 3 === 0 ? 2 : 0), channel: String(id), status: 'ok' });
  const mics = [mk(1, 'Head', 'headset', '#3fa67a', 'Ana Branquinho'), mk(2, '1', 'mao', '#8f8a2c'), mk(3, '2', 'mao', '#a8740a'), mk(4, '3', 'lapela', '#a85a12'), mk(5, '4', 'lapela', '#9a3518')];
  const sl = (id, speaker, mic_id, miked = 0) => ({ id, speaker, mic_id, miked, done: 0 });
  const blocks = [
    { id: 1, kind: 'painel', start_time: '14:00', title: 'Abertura', slots: [sl(1, 'Ana Branquinho', 1, 1)] },
    { id: 2, kind: 'painel', start_time: '14:20', title: '', slots: [sl(2, 'Ricardo Nogueira', 2, 1), sl(3, 'João Nunes e Silva', 3, 1), sl(4, 'Isa Martins', 4)] },
    { id: 3, kind: 'painel', start_time: '14:45', title: 'Painel Inovação', slots: [sl(5, 'Miguel Pinho Gil', 2), sl(6, 'Gil Falcão', 5, 1)] },
    { id: 4, kind: 'intervalo', start_time: '15:10', title: 'Coffee Break', slots: [] },
    { id: 5, kind: 'painel', start_time: '15:30', title: '', slots: [sl(7, 'Marina Marques', 3), sl(8, 'Carolina Bettencourt', 4)] },
    { id: 6, kind: 'painel', start_time: '15:55', title: '', slots: [sl(9, 'Mariana Moutinho', 2), sl(10, 'Michelle Campagnoli', 3)] },
    { id: 7, kind: 'painel', start_time: '16:20', title: '', slots: [sl(11, 'Manuel Sousa', 4), sl(12, 'Rui Rato', 5)] },
    { id: 8, kind: 'painel', start_time: '16:45', title: 'Encerramento', slots: [sl(13, 'Ana Branquinho', 1)] },
  ];
  return { event: { id: 0, name: 'Exemplo', current_block_id: 3, date: '' }, mics, blocks, console: { channels: [], outputs: [], routes: [] } };
}
function previewHtml(v) {
  const real = state.ev && state.ev.blocks.length ? state.ev : (state.lastEv && state.lastEv.blocks.length ? state.lastEv : null);
  const saved = state.ev; state.ev = real || demoEvent();
  const { blocks, event } = state.ev;
  let ai = blocks.findIndex((b) => b.id === event.current_block_id); if (ai < 0) ai = Math.min(2, blocks.length - 1);
  const talkIdx = blocks.map((b, i) => (b.kind !== 'intervalo' ? i : -1)).filter((i) => i >= 0);
  const bef = v.before ? talkIdx.filter((i) => i < ai).slice(-v.before) : [];
  const start = bef.length ? bef[0] : ai; const cols = []; let t = 0;
  for (let i = start; i < blocks.length && t < v.before + 1 + v.after; i++) { cols.push(blocks[i]); if (blocks[i].kind !== 'intervalo') t++; }
  const html = micGrid(cols, { airId: blocks[ai]?.id, live: true });
  state.ev = saved;
  return `<div class="small muted" style="margin-bottom:6px">Pré-visualização ${real ? `com o evento "${esc(real.event.name)}"` : 'com dados de exemplo'}</div><div class="card gridwrap live preview">${html}</div>`;
}

async function renderDisplay() {
  app.innerHTML = shell('<div class="empty">A carregar…</div>', { crumb: 'Ecrã e experiência' });
  const ups = await loadUserPresets();
  const v = viewPrefs();
  const card = (p, mine) => `<button class="pcard ${v.presetId === (mine ? 'u:' : '') + p.id ? 'on' : ''}" data-preset="${mine ? 'u:' : ''}${esc(p.id)}">
      <b>${esc(p.label)}</b><small>${esc(p.desc || `${p.colw ? 'colunas ' + p.colw + ' px' : p.fit ? 'ajusta ao ecrã' : 'largura fixa'} · nomes ${p.name || 'auto'} · ${p.before}+${p.after} blocos`)}</small>
      ${mine ? `<span class="pdel" data-delpreset="${esc(p.id)}" title="Apagar">✕</span>` : ''}</button>`;
  app.innerHTML = shell(`
    <h1 style="margin-top:14px">🖥 Ecrã e experiência</h1>
    <p class="muted" style="margin-top:0">Escolhe como o <b>Ao vivo</b> aparece <b>neste aparelho</b> (o PC, o iPad e o telemóvel podem ter definições diferentes).</p>
    <div class="label-up">Predefinições da app</div>
    <div class="pgridp">${VIEW_PRESETS.map((p) => card(p, false)).join('')}</div>
    <div class="label-up" style="margin-top:16px">As minhas predefinições ${ups.length ? '' : '<span class="muted" style="text-transform:none;letter-spacing:0;font-weight:400">— ainda nenhuma: ajusta abaixo e guarda</span>'}</div>
    ${ups.length ? `<div class="pgridp">${ups.map((p) => card(p, true)).join('')}</div>` : ''}
    <div class="grid2" style="margin-top:18px;align-items:start;grid-template-columns:minmax(260px,360px) 1fr">
      <form class="card" id="vform">
        <h2>Personalizar</h2>
        <label class="row" style="color:var(--text);margin-bottom:14px"><input type="checkbox" name="fit" ${v.fit ? 'checked' : ''} style="width:auto;min-height:0"> Ajustar as colunas à largura do ecrã</label>
        <div class="field"><label>Tamanho dos nomes: <b id="vname">${v.name ? v.name + ' px' : 'automático'}</b></label><input type="range" name="name" min="0" max="32" step="1" value="${v.name || 0}"><div class="small muted">0 = automático (conforme a largura das colunas)</div></div>
        <div class="field"><label>Largura dos blocos (colunas): <b id="vcolw">${v.colw ? v.colw + ' px' : 'automática'}</b></label><input type="range" name="colw" min="0" max="360" step="10" value="${v.colw || 0}"><div class="small muted">0 = automática. Mais largo = mais espaço para os nomes (a grelha desliza para o lado); mais estreito = mais blocos à vista.</div></div>
        <div class="field"><label>Espaçamento</label><div class="seg" style="display:flex">${[['compact', 'Compacto'], ['normal', 'Normal'], ['comfortable', 'Largo']].map(([k, l]) => `<button type="button" data-dens="${k}" class="${v.density === k ? 'on' : ''}" style="flex:1">${l}</button>`).join('')}</div></div>
        <div class="grid2"><div class="field"><label>Blocos antes: <b id="vbef">${v.before}</b></label><input type="range" name="before" min="0" max="4" value="${v.before}"></div>
        <div class="field"><label>Blocos depois: <b id="vaft">${v.after}</b></label><input type="range" name="after" min="1" max="12" value="${v.after}"></div></div>
        <div class="row" style="flex-wrap:wrap;gap:8px;margin-top:6px"><button type="button" class="btn" data-savepreset>💾 Guardar como predefinição</button><a class="btn primary" href="${state.lastEv ? `#/e/${state.lastEv.event.id}/live` : '#/'}">Ver no Ao vivo</a></div>
      </form>
      <div id="vprev">${previewHtml(v)}</div>
    </div>`, { crumb: 'Ecrã e experiência' });
  try { localStorage.setItem('md_tip_display', '1'); } catch { }
  applyGridPrefs();
  const cur = () => {
    const f = $('#vform'); const d = $('[data-dens].on', f)?.dataset.dens || 'normal';
    const cw = Number(f.colw.value);
    return { fit: f.fit.checked, name: Number(f.name.value), colw: cw && cw < 80 ? 80 : cw, density: d, before: Number(f.before.value), after: Number(f.after.value), label: 'Personalizado', presetId: null };
  };
  const refresh = () => {
    const nv = cur(); saveView(nv);
    $('#vname').textContent = nv.name ? nv.name + ' px' : 'automático';
    $('#vcolw').textContent = nv.colw ? nv.colw + ' px' : 'automática'; $('#vbef').textContent = nv.before; $('#vaft').textContent = nv.after;
    $('#vprev').innerHTML = previewHtml(nv); applyGridPrefs();
    $$('.pcard').forEach((x) => x.classList.remove('on'));
  };
  $('#vform').addEventListener('input', refresh);
  app.onclick = async (e) => {
    const del = e.target.closest('[data-delpreset]');
    if (del) { e.stopPropagation(); userPresets = userPresets.filter((p) => p.id !== del.dataset.delpreset); await act(() => saveUserPresets(), 'Predefinição apagada'); return renderDisplay(); }
    const pb = e.target.closest('[data-preset]');
    if (pb) {
      const id = pb.dataset.preset; const p = id.startsWith('u:') ? userPresets.find((x) => 'u:' + x.id === id) : VIEW_PRESETS.find((x) => x.id === id);
      if (p) { saveView({ ...p, presetId: id }); toast(`Predefinição "${p.label}" aplicada neste aparelho`); return renderDisplay(); }
    }
    const db = e.target.closest('[data-dens]');
    if (db) { $$('[data-dens]').forEach((x) => x.classList.toggle('on', x === db)); return refresh(); }
    if (e.target.closest('[data-savepreset]')) {
      modal('Guardar predefinição', '<div class="field"><label>Nome</label><input name="label" required placeholder="Ex: Régie CCB, iPad do palco"></div><p class="small muted">Fica guardada na tua conta e aparece em todos os teus aparelhos.</p>', {
        submitLabel: 'Guardar',
        onSubmit: async (d) => { const nv = { ...cur(), label: d.label, id: Date.now().toString(36) }; delete nv.presetId; userPresets = [...userPresets, nv]; await saveUserPresets(); saveView({ ...nv, presetId: 'u:' + nv.id }); toast('Predefinição guardada'); renderDisplay(); },
      });
    }
  };
}

// ---------- integrações com bases de micros (BETA, só super admin) ----------
const integResults = {};
async function renderIntegrations() {
  if (!isSuper()) return go('#/');
  app.innerHTML = shell('<div class="empty">A carregar…</div>', { crumb: 'Integrações (beta)' });
  const [{ brands, receivers }, mics] = await Promise.all([api('GET', '/api/integrations'), api('GET', '/api/integrations/mics')]);
  const byEvent = {}; mics.forEach((m) => (byEvent[m.event_id] ||= { name: m.event_name, mics: [] }).mics.push(m));
  const micOpts = (sel) => `<option value="">— não ligado —</option>` + Object.values(byEvent).map((e) => `<optgroup label="${esc(e.name)}">${e.mics.map((m) => `<option value="${m.id}" ${m.id === sel ? 'selected' : ''}>${esc(m.label)} · ${TYPES[m.type] || ''}</option>`).join('')}</optgroup>`).join('');
  const lvl = (c) => c.level == null ? '<span class="muted">—</span>' : `${batt(c.level)} <span class="small muted">${c.batt_bars != null ? c.batt_bars + '/5 barras' : c.batt_percent != null ? c.batt_percent + '%' : ''}${c.batt_minutes != null ? ' · ' + Math.floor(c.batt_minutes / 60) + 'h' + String(c.batt_minutes % 60).padStart(2, '0') : ''}</span>`;
  const rcvCard = (r) => {
    const res = integResults[r.id];
    const chans = res?.channels || r.last_data || [];
    const links = Object.fromEntries((r.links || []).map((l) => [l.ch, l]));
    const rows = [];
    for (let i = 1; i <= Math.max(r.channels, chans.length ? Math.max(...chans.map((c) => c.ch)) : 0); i++) {
      const c = chans.find((x) => x.ch === i) || { ch: i };
      const l = links[i];
      rows.push(`<tr><td><b>${i}</b></td><td>${esc(c.name || '—')}</td><td>${esc(c.frequency || '—')}</td><td>${lvl(c)}</td>
        <td><select data-link="${r.id}:${i}" style="min-height:36px">${micOpts(l?.mic_id)}</select></td>
        <td><label class="row small" style="color:var(--text);margin:0;white-space:nowrap"><input type="checkbox" data-linkname="${r.id}:${i}" ${l?.use_name ? 'checked' : ''} style="width:auto;min-height:0"> nome → pessoa</label></td></tr>`);
    }
    const isRaw = r.brand.startsWith('raw_');
    return `<div class="card rcv">
      <div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:8px">
        <div><h3>${esc(r.name || r.host)}</h3><div class="small muted">${esc(brands[r.brand]?.label || r.brand)}${r.model ? ' · ' + esc(r.model) : ''} · ${esc(r.host)}:${r.port || ''}</div>
          <div class="small" style="margin-top:4px">${r.last_error ? `<span style="color:var(--danger)">✕ ${esc(r.last_error)}</span>` : r.last_ok ? `<span style="color:var(--accent)">● ligado</span> <span class="muted">· última leitura ${ago(r.last_ok)}</span>` : '<span class="muted">ainda não testado</span>'}</div></div>
        <div class="row" style="flex-wrap:wrap;gap:6px">
          <button class="btn sm primary" data-poll="${r.id}">⟳ Ler agora</button>
          ${!isRaw ? `<button class="btn sm" data-pollapply="${r.id}">⇣ Ler e aplicar aos micros</button>
          <label class="row small" style="color:var(--text);margin:0"><span class="switch" style="width:44px;height:26px"><input type="checkbox" data-autosync="${r.id}" ${r.autosync ? 'checked' : ''}><span></span></span> auto 30 s</label>` : ''}
          <button class="btn sm ghost" data-delrcv="${r.id}">Apagar</button></div>
      </div>
      ${isRaw ? `<div class="small muted" style="margin-top:10px">Comando: <code>${esc(r.command || '(vazio)')}</code></div>` : `<div class="tablewrap" style="margin-top:12px"><table class="table"><tr><th>Canal</th><th>Nome na base</th><th>Frequência</th><th>Bateria</th><th>Micro MicDesk</th><th></th></tr>${rows.join('')}</table></div>`}
      ${res?.raw != null ? `<details style="margin-top:10px"><summary class="small muted" style="cursor:pointer">Resposta em bruto (${res.ms} ms)</summary><pre class="rawpre">${esc(res.raw || '(vazia)')}</pre></details>` : ''}
      ${res && !res.ok ? `<div class="small" style="color:var(--danger);margin-top:8px">${esc(res.error)}</div>` : ''}
    </div>`;
  };
  app.innerHTML = shell(`
    <h1 style="margin-top:14px">🔌 Integrações com bases de micros <span class="pill info">beta · só tu vês</span></h1>
    <p class="muted" style="margin-top:0;max-width:900px">Liga a MicDesk às bases (receptores) de microfones sem fios pela rede para ler automaticamente o <b>nome do canal</b>, a <b>frequência</b> e a <b>bateria</b>. O servidor MicDesk tem de estar na mesma rede que as bases (ou ter rota até elas).</p>
    <div class="grid2" style="align-items:start;grid-template-columns:minmax(280px,380px) 1fr">
      <form class="card" id="rcvform">
        <h2>Adicionar base</h2>
        <div class="field"><label>Protocolo / marca</label><select name="brand">${Object.entries(brands).map(([k, b]) => `<option value="${k}" data-port="${b.port}">${esc(b.label)}</option>`).join('')}</select></div>
        <div class="field"><label>Nome</label><input name="name" placeholder="Ex: ULX-D Palco esquerdo"></div>
        <div class="field"><label>Modelo (opcional)</label><input name="model" placeholder="Ex: ULXD4Q, EM 6000"></div>
        <div class="grid2"><div class="field"><label>IP da base</label><input name="host" required placeholder="192.168.1.50" inputmode="decimal"></div>
        <div class="field"><label>Porta</label><input name="port" type="number" value="2202"></div></div>
        <div class="field"><label>Nº de canais</label><input name="channels" type="number" min="1" max="32" value="4"></div>
        <div class="field hide" id="rawcmd"><label>Comando a enviar</label><input name="command" placeholder="Ex: < GET 1 BATT_BARS >  ou  {&quot;rx1&quot;:{&quot;name&quot;:null}}"><div class="small muted">Usa \\r ou \\n para fim de linha.</div></div>
        <button class="btn primary">Adicionar</button>
      </form>
      <div style="display:grid;gap:12px">
        ${receivers.length ? receivers.map(rcvCard).join('') : '<div class="card empty">Ainda não há bases. Adiciona a primeira ao lado.</div>'}
        <div class="card small muted">
          <b style="color:var(--text)">Estado do suporte</b>
          <ul style="margin:8px 0 0;padding-left:18px;line-height:1.6">
            <li><b>Shure</b> ULX-D, QLX-D, SLX-D, Axient Digital — TCP 2202 (protocolo de texto oficial): nome, frequência, barras de bateria e tempo restante.</li>
            <li><b>Sennheiser</b> EW-DX, Digital 6000, SpeechLine — Sennheiser Sound Control (SSC, JSON por UDP 45): nome, frequência e % de bateria. <i>Experimental</i> — os caminhos podem variar por modelo; usa a resposta em bruto para afinar.</li>
            <li><b>Outras marcas</b> (Sennheiser ew G4, Sony DWX, Audio-Technica, Wisycom, Lectrosonics…): usa o modo <i>Teste</i> para enviar comandos e ver a resposta — é assim que vamos acrescentar cada protocolo.</li>
          </ul></div>
      </div>
    </div>`, { crumb: 'Integrações (beta)' });
  const fm = $('#rcvform');
  fm.brand.onchange = () => { const o = fm.brand.selectedOptions[0]; if (o.dataset.port !== '0') fm.port.value = o.dataset.port; $('#rawcmd').classList.toggle('hide', !fm.brand.value.startsWith('raw_')); };
  fm.onsubmit = async (e) => { e.preventDefault(); await act(() => api('POST', '/api/integrations', formData(fm)), 'Base adicionada'); renderIntegrations(); };
  const saveLink = async (rid, ch) => {
    const sel = $(`[data-link="${rid}:${ch}"]`), chk = $(`[data-linkname="${rid}:${ch}"]`);
    await act(() => api('PUT', `/api/integrations/${rid}/links`, { ch, mic_id: sel.value || null, use_name: chk.checked }), sel.value ? 'Canal ligado ao micro' : 'Ligação removida');
  };
  app.onchange = async (e) => {
    const l = e.target.closest('[data-link], [data-linkname]');
    if (l) { const [rid, ch] = (l.dataset.link || l.dataset.linkname).split(':').map(Number); return saveLink(rid, ch); }
    const a = e.target.closest('[data-autosync]');
    if (a) return act(() => api('PUT', `/api/integrations/${a.dataset.autosync}`, { autosync: a.checked }), a.checked ? 'Sincronização automática ligada' : 'Sincronização automática desligada');
  };
  app.onclick = async (e) => {
    const p = e.target.closest('[data-poll], [data-pollapply]');
    if (p) {
      const id = Number(p.dataset.poll || p.dataset.pollapply); p.disabled = true; p.textContent = 'A ler…';
      integResults[id] = await api('POST', `/api/integrations/${id}/poll`, { apply: !!p.dataset.pollapply }).catch((er) => ({ ok: false, error: er.message }));
      toast(integResults[id].ok ? `Leitura OK · ${integResults[id].channels.length} canais${p.dataset.pollapply ? ' · micros atualizados' : ''}` : integResults[id].error, !integResults[id].ok);
      return renderIntegrations();
    }
    const d = e.target.closest('[data-delrcv]');
    if (d && await confirmBox('Apagar esta base?', 'As ligações aos micros também são removidas.')) { await api('DELETE', `/api/integrations/${d.dataset.delrcv}`); renderIntegrations(); }
  };
}

// ---------- cronómetro do bloco ON AIR ----------
const srvNow = () => Date.now() + (state.timeOffset || 0);
function schedAt(hm) {
  if (!hm) return null;
  const d = state.ev?.event?.date || todayISO();
  const t = new Date(`${d}T${hm}:00`).getTime();
  return isNaN(t) ? null : t;
}
function fmtDur(ms, sign = false) {
  const neg = ms < 0; let t = Math.floor(Math.abs(ms) / 1000);
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = t % 60;
  const body = h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return (sign ? (neg ? '−' : '+') : neg ? '−' : '') + body;
}
function timerInfo() {
  if (!state.ev) return null;
  const { blocks, event } = state.ev;
  const i = blocks.findIndex((b) => b.id === event.current_block_id);
  if (i < 0) return null;
  const b = blocks[i];
  const now = srvNow();
  const schedStart = schedAt(b.start_time);
  const actualStart = event.on_air_at ? Date.parse(event.on_air_at.replace(' ', 'T') + 'Z') : schedStart;
  const endHM = b.end_time || blocks.slice(i + 1).find((x) => x.start_time)?.start_time || '';
  const schedEnd = schedAt(endHM);
  const planned = schedStart && schedEnd ? schedEnd - schedStart : null;
  const remain = schedEnd ? schedEnd - now : null;
  const startDelta = schedStart && actualStart ? actualStart - schedStart : null; // >0 atrasado
  return { b, now, elapsed: actualStart ? now - actualStart : null, remain, planned, startDelta, schedEnd, endHM };
}
function deltaText(ms) {
  if (ms == null) return '';
  const min = Math.round(ms / 60000);
  if (Math.abs(ms) < 60000) return '<span class="tdelta ok">● no horário</span>';
  return ms > 0 ? `<span class="tdelta late">▲ entrou ${min} min atrasado</span>` : `<span class="tdelta early">▼ entrou ${-min} min adiantado</span>`;
}
function timerClass(ti) {
  if (ti.remain == null) return '';
  if (ti.remain < 0) return 'over';
  if (ti.remain < 2 * 60000) return 'soon';
  return 'ok';
}
function timerPanel() {
  const ti = timerInfo();
  if (!ti) return '';
  return `<div class="card timer ${timerClass(ti)}" data-timer>
    <div class="tcol"><span class="label-up">No ar há</span><b class="tbig" data-t="elapsed">${ti.elapsed != null ? fmtDur(ti.elapsed) : '--:--'}</b></div>
    <div class="tcol main"><span class="label-up" data-t="rlabel">${ti.remain == null ? 'Sem hora de fim' : ti.remain < 0 ? 'Excedido' : `Faltam (até ${esc(ti.endHM)})`}</span>
      <b class="tbig huge" data-t="remain">${ti.remain == null ? '—' : ti.remain < 0 ? fmtDur(-ti.remain, true).replace('+', '+') : fmtDur(ti.remain)}</b>
      ${ti.planned ? `<div class="tbar"><i data-t="bar" style="width:${Math.min(100, Math.max(0, (1 - ti.remain / ti.planned) * 100))}%"></i></div>` : ''}</div>
    <div class="tcol"><span class="label-up">Horário</span><span data-t="delta">${deltaText(ti.startDelta)}</span>
      <span class="small" data-t="proj" style="color:#ff8a80;font-weight:600"></span>
      ${ti.planned ? `<span class="small muted">duração prevista ${fmtDur(ti.planned)}</span>` : ''}
      <button class="btn sm" data-stage style="margin-top:6px">⛶ Ecrã de palco</button></div>
  </div>`;
}
function updateTimers() {
  const els = $$('[data-timer], .stage, [data-t="mini"]');
  if (!els.length) return;
  const ti = timerInfo();
  if (!ti) return;
  const cls = timerClass(ti);
  $$('[data-timer], .stage').forEach((el) => { el.classList.remove('ok', 'soon', 'over'); if (cls) el.classList.add(cls); });
  const set = (k, v) => $$(`[data-t="${k}"]`).forEach((e) => { e.textContent = v; });
  if (ti.elapsed != null) set('elapsed', fmtDur(ti.elapsed));
  if (ti.remain != null) {
    set('remain', ti.remain < 0 ? fmtDur(-ti.remain, true) : fmtDur(ti.remain));
    set('rlabel', ti.remain < 0 ? 'Excedido' : `Faltam (até ${ti.endHM})`);
    set('slabel', ti.remain < 0 ? 'TEMPO EXCEDIDO' : 'TEMPO RESTANTE');
    if (ti.planned) $$('[data-t="bar"]').forEach((e) => { e.style.width = Math.min(100, Math.max(0, (1 - ti.remain / ti.planned) * 100)) + '%'; });
  }
  set('proj', ti.remain != null && ti.remain < -30000 ? `▲ o próximo bloco já vai ${Math.ceil(-ti.remain / 60000)} min atrasado` : '');
  set('mini', `${ti.elapsed != null ? fmtDur(ti.elapsed) : ''}${ti.remain != null ? ` · ${ti.remain < 0 ? 'excedido ' + fmtDur(-ti.remain, true) : 'faltam ' + fmtDur(ti.remain)}` : ''}`);
  $$('[data-t="mini"]').forEach((e) => e.classList.toggle('over', ti.remain != null && ti.remain < 0));
}
function openStage() {
  $('.stage')?.remove();
  const ti = timerInfo();
  if (!ti) return toast('Não há nenhum bloco no ar', true);
  const el = document.createElement('div');
  el.className = 'stage';
  el.innerHTML = `<div class="stage-top"><span class="onair lg">ON AIR</span><span class="stage-clock" id="sclock">${nowHM()}</span></div>
    <div class="stage-label" data-t="slabel">TEMPO RESTANTE</div>
    <div class="stage-time" data-t="remain">--:--</div>
    <div class="stage-sub">${esc(ti.b.start_time)}${ti.endHM ? ' – ' + esc(ti.endHM) : ''} · ${esc(ti.b.title || ti.b.slots.map((x) => x.speaker).join(', '))}</div>
    <div class="stage-hint">toca para fechar</div>`;
  el.addEventListener('click', () => { el.remove(); if (document.fullscreenElement) document.exitFullscreen().catch(() => { }); });
  document.body.appendChild(el);
  try { el.requestFullscreen?.().catch(() => { }); } catch { }
  updateTimers();
}
setInterval(() => { const sc = $('#sclock'); if (sc) sc.textContent = nowHM(); }, 1000);

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

// ---------- admin (só super admin) ----------
async function renderAdmin() {
  if (!isSuper()) return go('#/');
  app.innerHTML = shell('<div class="empty">A carregar…</div>', { crumb: 'Utilizadores' });
  const [users, stats, cfgS] = await Promise.all([api('GET', '/api/users'), api('GET', '/api/admin/stats'), api('GET', '/api/admin/settings')]);
  const roleOpts = (sel) => Object.entries(ROLES).map(([k, v]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${v}</option>`).join('');
  app.innerHTML = shell(`
    <div class="stats" style="margin-top:14px">
      <div class="card stat"><b>${stats.users}</b><span>utilizadores</span></div>
      <div class="card stat"><b>${stats.events}</b><span>eventos</span></div>
      <div class="card stat"><b>${stats.mics}</b><span>micros</span></div>
      <div class="card stat"><b style="color:var(--accent)">${stats.live_connections}</b><span>ecrãs ligados agora</span></div>
    </div>
    <div class="card row" style="margin-bottom:12px;flex-wrap:wrap"><div class="grow"><b>Registo de novas contas</b><div class="small muted">Permite que qualquer pessoa crie conta na página principal (cada conta tem limite de 5 eventos).</div></div>
      <label class="switch"><input type="checkbox" id="signupt" ${cfgS.allow_signup ? 'checked' : ''}><span></span></label></div>
    <div class="toolbar"><h2 style="margin:0" class="grow">Utilizadores</h2><button class="btn primary" id="newuser">+ Utilizador</button></div>
    <div class="card small muted" style="margin-bottom:12px">Cada utilizador só vê e gere os seus próprios eventos. Tu, como super admin, vês os eventos de todos.</div>
    <div class="card tablewrap" style="padding:0"><table class="table">
      <tr><th>Nome</th><th class="hide-sm">Email</th><th>Eventos</th><th></th></tr>
      ${users.map((u) => `<tr style="${u.active ? '' : 'opacity:.5'}">
        <td><b>${esc(u.name || '—')}</b>${u.role === 'superadmin' ? ' <span class="pill info">super admin</span>' : ''}${u.active ? '' : ' <span class="pill danger">inativo</span>'}</td>
        <td class="hide-sm muted">${esc(u.email)}</td>
        <td><a href="#/" data-seeev="${u.id}">${u.events}${u.role !== 'superadmin' && u.max_events ? ` / ${u.max_events}` : ''}</a></td>
        <td style="text-align:right"><button class="btn sm" data-edituser="${u.id}">Editar</button></td></tr>`).join('')}
    </table></div>`, { crumb: 'Utilizadores' });

  $('#signupt').onchange = (e) => act(() => api('PUT', '/api/admin/settings', { allow_signup: e.target.checked }), e.target.checked ? 'Registo aberto' : 'Registo fechado');
  $('#newuser').onclick = () => modal('Novo utilizador', `
    <div class="grid2"><div class="field"><label>Nome</label><input name="name" required></div>
    <div class="field"><label>Email (é o login)</label><input name="email" type="email" required></div></div>
    <div class="grid2"><div class="field"><label>Password (vazio = gerar)</label><input name="password" type="text"></div>
    <div class="field"><label>Limite de eventos (0 = sem limite)</label><input name="max_events" type="number" min="0" value="5"></div></div>
    <div class="field"><label>Papel</label><select name="role">${roleOpts('user')}</select></div>`, {
    submitLabel: 'Criar',
    onSubmit: async (d) => { const r = await api('POST', '/api/users', d); renderAdmin().then(() => showPassword(d.email, r.password)); },
  });
  app.onclick = (e) => {
    const se = e.target.closest('[data-seeev]'); if (se) { state.ownerFilter = Number(se.dataset.seeev); state.showArchived = false; return; }
    const b = e.target.closest('[data-edituser]'); if (!b) return;
    const u = users.find((x) => x.id === Number(b.dataset.edituser));
    const self = u.id === state.me.id;
    const f = modal('Editar utilizador', `
      <div class="small muted" style="margin-bottom:12px">${esc(u.email)}</div>
      <div class="grid2"><div class="field"><label>Nome</label><input name="name" value="${esc(u.name)}"></div>
      <div class="field"><label>Limite de eventos (0 = sem limite)</label><input name="max_events" type="number" min="0" value="${u.max_events}"></div></div>
      ${self ? '' : `<div class="field"><label>Papel</label><select name="role">${roleOpts(u.role)}</select></div>`}
      <div class="field"><label>Nova password (vazio = manter)</label><input name="password" type="text"></div>
      ${self ? '' : `<label class="row" style="color:var(--text)"><input type="checkbox" name="active" ${u.active ? 'checked' : ''} style="width:auto;min-height:0"> Conta ativa</label>`}`, {
      extraFooter: self ? '' : '<button type="button" class="btn danger" id="deluser">Apagar</button>',
      onSubmit: async (d) => { if (!d.password) delete d.password; await api('PUT', `/api/users/${u.id}`, d); toast('Guardado'); renderAdmin(); },
    });
    $('#deluser', f)?.addEventListener('click', async () => {
      closeModal();
      if (await confirmBox('Apagar utilizador?', `${u.email} e os seus ${u.events} eventos vão ser apagados.`)) { await act(() => api('DELETE', `/api/users/${u.id}`), 'Apagado'); renderAdmin(); }
    });
  };
}

function showPassword(email, pw) {
  modal('Credenciais criadas', `<p>Envia estes dados ao teu colega (a password só é mostrada agora):</p>
    <div class="card" style="font-family:ui-monospace,Menlo,monospace;user-select:all">Endereço: ${esc(location.origin)}<br>Email: ${esc(email)}<br>Password: ${esc(pw)}</div>`);
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
