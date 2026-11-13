// MicDesk — integrações com receptores de microfones sem fios (BETA, só super admin)
// Lê nome, frequência e bateria diretamente das bases por IP.
//  • Shure (ULX-D, QLX-D, SLX-D, Axient Digital, ...): TCP porta 2202, protocolo de texto "< GET 0 ALL >"
//  • Sennheiser SSC (EW-DX, Digital 6000, SpeechLine, ...): JSON por UDP porta 45 (experimental)
//  • Teste: envia um comando TCP/UDP qualquer e mostra a resposta em bruto (para descobrir protocolos)
'use strict';
const net = require('node:net');
const dgram = require('node:dgram');

const BRANDS = {
  shure: { label: 'Shure (ULX-D / QLX-D / SLX-D / Axient Digital)', transport: 'tcp', port: 2202 },
  sennheiser_ssc: { label: 'Sennheiser SSC (EW-DX / Digital 6000 / SpeechLine)', transport: 'udp', port: 45 },
  raw_tcp: { label: 'Teste — comando TCP em bruto', transport: 'tcp', port: 0 },
  raw_udp: { label: 'Teste — comando UDP em bruto', transport: 'udp', port: 0 },
};

function tcpExchange(host, port, payload, { timeout = 2500, idle = 700 } = {}) {
  return new Promise((resolve, reject) => {
    let buf = ''; let idleT; let done = false;
    const sock = net.createConnection({ host, port, timeout });
    const finish = (err) => { if (done) return; done = true; clearTimeout(idleT); sock.destroy(); err && !buf ? reject(err) : resolve(buf); };
    sock.on('connect', () => { if (payload) sock.write(payload); idleT = setTimeout(() => finish(), timeout); });
    sock.on('data', (d) => { buf += d.toString('utf8'); clearTimeout(idleT); idleT = setTimeout(() => finish(), idle); });
    sock.on('timeout', () => finish(new Error('Sem resposta (timeout)')));
    sock.on('error', (e) => finish(new Error(e.code === 'ECONNREFUSED' ? 'Ligação recusada (porta fechada?)' : e.code === 'EHOSTUNREACH' ? 'Equipamento inacessível na rede' : e.message)));
    sock.on('end', () => finish());
  });
}
function udpExchange(host, port, payloads, { timeout = 1800 } = {}) {
  return new Promise((resolve, reject) => {
    const sock = dgram.createSocket('udp4'); const out = []; let t;
    const finish = (err) => { clearTimeout(t); try { sock.close(); } catch { } err && !out.length ? reject(err) : resolve(out); };
    sock.on('message', (m) => { out.push(m.toString('utf8')); clearTimeout(t); t = setTimeout(() => finish(), 400); });
    sock.on('error', (e) => finish(e));
    for (const p of payloads) sock.send(Buffer.from(p), port, host);
    t = setTimeout(() => finish(out.length ? null : new Error('Sem resposta (timeout)')), timeout);
  });
}

// Shure: "< REP 1 CHAN_NAME {Ana Lapela   } >", "< REP 1 FREQUENCY 0578350 >", "< REP 1 BATT_BARS 004 >"
function parseShure(text) {
  const ch = {};
  const re = /<\s*REP\s+(\d+)\s+(\w+)\s+(\{[^}]*\}|\S+)\s*>/g; let m;
  while ((m = re.exec(text))) {
    const n = Number(m[1]); if (!n) continue;
    const key = m[2]; let val = m[3].replace(/^\{|\}$/g, '').trim();
    const c = (ch[n] ||= { ch: n });
    if (key === 'CHAN_NAME') c.name = val;
    else if (key === 'FREQUENCY') { const k = parseInt(val, 10); if (k) c.frequency = (k / 1000).toFixed(3) + ' MHz'; }
    else if (key === 'BATT_BARS' || key === 'TX_BATT_BARS') { const b = parseInt(val, 10); if (b >= 0 && b <= 5) c.batt_bars = b; }
    else if (key === 'BATT_RUN_TIME' || key === 'TX_BATT_MINS') { const v = parseInt(val, 10); if (v >= 0 && v < 65000) c.batt_minutes = v; }
    else if (key === 'TX_TYPE' || key === 'TX_MODEL') c.tx = val;
    else if (key === 'AUDIO_GAIN') c.gain = val;
  }
  return Object.values(ch).sort((a, b) => a.ch - b.ch);
}
// barras Shure (0–5) → níveis MicDesk (0 vazia, 1, 2, 3 cheia)
const shureToLevel = (b) => (b == null ? null : b >= 4 ? 3 : b === 3 ? 2 : b >= 1 ? 1 : 0);

// Sennheiser SSC: pedimos nome/frequência por canal e bateria do emissor associado.
function sscQueries(channels) {
  const q = [];
  for (let i = 1; i <= channels; i++) {
    q.push(JSON.stringify({ [`rx${i}`]: { name: null, frequency: null } }));
    q.push(JSON.stringify({ mates: { [`tx${i}`]: { bat: null } } }));
  }
  return q;
}
function parseSSC(msgs) {
  const ch = {};
  for (const raw of msgs) {
    let j; try { j = JSON.parse(raw); } catch { continue; }
    for (const [k, v] of Object.entries(j)) {
      const rx = k.match(/^rx(\d+)$/);
      if (rx && v && typeof v === 'object') {
        const c = (ch[rx[1]] ||= { ch: Number(rx[1]) });
        if (v.name != null) c.name = String(v.name);
        if (v.frequency != null) c.frequency = (Number(v.frequency) / 1000).toFixed(3) + ' MHz';
      }
      if (k === 'mates' && v) for (const [tk, tv] of Object.entries(v)) {
        const tx = tk.match(/^tx(\d+)$/); if (!tx || !tv) continue;
        const c = (ch[tx[1]] ||= { ch: Number(tx[1]) });
        const bat = tv.bat ?? tv.battery;
        const pct = typeof bat === 'object' && bat ? (bat.gauge ?? bat.percent) : bat;
        if (typeof pct === 'number') c.batt_percent = pct;
        else if (typeof pct === 'string' && /^\d+$/.test(pct)) c.batt_percent = Number(pct);
      }
    }
  }
  return Object.values(ch).sort((a, b) => a.ch - b.ch);
}
const pctToLevel = (p) => (p == null ? null : p >= 70 ? 3 : p >= 40 ? 2 : p >= 10 ? 1 : 0);

async function poll(rcv) {
  const port = Number(rcv.port) || BRANDS[rcv.brand]?.port;
  if (!rcv.host || !port) throw new Error('Falta o IP ou a porta');
  const t0 = Date.now();
  if (rcv.brand === 'shure') {
    const raw = await tcpExchange(rcv.host, port, '< GET 0 ALL >');
    const channels = parseShure(raw).map((c) => ({ ...c, level: shureToLevel(c.batt_bars) }));
    return { ok: true, ms: Date.now() - t0, channels, raw: raw.slice(0, 6000) };
  }
  if (rcv.brand === 'sennheiser_ssc') {
    const msgs = await udpExchange(rcv.host, port, sscQueries(Math.max(1, Math.min(8, Number(rcv.channels) || 2))));
    const channels = parseSSC(msgs).map((c) => ({ ...c, level: pctToLevel(c.batt_percent) }));
    return { ok: true, ms: Date.now() - t0, channels, raw: msgs.join('\n').slice(0, 6000) };
  }
  if (rcv.brand === 'raw_tcp') {
    const raw = await tcpExchange(rcv.host, port, (rcv.command || '').replace(/\\r/g, '\r').replace(/\\n/g, '\n'));
    return { ok: true, ms: Date.now() - t0, channels: [], raw: raw.slice(0, 6000) };
  }
  if (rcv.brand === 'raw_udp') {
    const msgs = await udpExchange(rcv.host, port, [(rcv.command || '').replace(/\\r/g, '\r').replace(/\\n/g, '\n')]);
    return { ok: true, ms: Date.now() - t0, channels: [], raw: msgs.join('\n').slice(0, 6000) };
  }
  throw new Error('Marca não suportada');
}

module.exports = { BRANDS, poll, parseShure, parseSSC, shureToLevel, pctToLevel };
