// Cards Abertos/Fechados hoje = só Alta e SOS.
// Abas do dia = todas as prioridades, o dia inteiro em America/Sao_Paulo.
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ART = process.env.ARTIFACT_DIR || '/opt/cursor/artifacts';
const PORT = Number(process.env.TEST_PORT || 8766);
const CDP_PORT = Number(process.env.CDP_PORT || 9336);
fs.mkdirSync(ART, { recursive: true });

const falhas = [];
function ok(cond, msg) {
  if (!cond) { falhas.push(msg); console.error('FALHA:', msg); }
  else console.log('ok:', msg);
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(ROOT, rel));
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end('no'); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end('nf'); return; }
    const ext = path.extname(file);
    const type = ext === '.html' ? 'text/html; charset=utf-8' : ext === '.json' ? 'application/json' : 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(buf);
  });
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
const userData = fs.mkdtempSync('/tmp/chrome-dia-');
const chrome = spawn('google-chrome', [
  '--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
  `--remote-debugging-port=${CDP_PORT}`, '--remote-allow-origins=*',
  `--user-data-dir=${userData}`, '--window-size=1400,900', 'about:blank',
], { stdio: 'ignore' });

async function waitJson(url) {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(url); if (r.ok) return await r.json(); } catch (e) {}
    await sleep(200);
  }
  throw new Error('chrome');
}

let browserWs;
try {
  const ver = await waitJson(`http://127.0.0.1:${CDP_PORT}/json/version`);
  browserWs = new WebSocket(ver.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    browserWs.addEventListener('open', resolve, { once: true });
    browserWs.addEventListener('error', () => reject(new Error('ws')), { once: true });
  });
  let seq = 0;
  const pending = new Map();
  browserWs.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
      else p.resolve(msg.result ?? {});
    }
  });
  function send(method, params = {}, sess) {
    const id = ++seq;
    const payload = { id, method, params };
    if (sess) payload.sessionId = sess;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('timeout ' + method)); }, 20000);
      pending.set(id, { resolve: (v) => { clearTimeout(timer); resolve(v); }, reject: (e) => { clearTimeout(timer); reject(e); } });
      browserWs.send(JSON.stringify(payload));
    });
  }
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const cdp = (method, params) => send(method, params, sessionId);
  async function evalPage(expression, awaitPromise = false) {
    let expr = expression.trim();
    if (/^(async\s+)?(\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>|^(async\s+)?function\b/.test(expr)) expr = `(${expr})()`;
    const result = await cdp('Runtime.evaluate', { expression: expr, awaitPromise, returnByValue: true });
    if (result.exceptionDetails) {
      const d = result.exceptionDetails;
      throw new Error((d.text || 'err') + ' ' + (d.exception?.description || ''));
    }
    return result.result?.value;
  }
  async function esperar(fn, timeout = 15000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      if (await evalPage(fn)) return;
      await sleep(150);
    }
    throw new Error('timeout ' + fn);
  }
  async function shot(name) {
    const { data } = await cdp('Page.captureScreenshot', { format: 'png' });
    const file = path.join(ART, name);
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
    console.log('screenshot', file);
  }

  await cdp('Runtime.enable');
  await cdp('Page.enable');
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` });
  await esperar(`() => document.querySelectorAll('.ecard').length > 0`);
  await evalPage(`() => { sessionStorage.setItem('backlog_auth','1'); const t = document.getElementById('loginScreen'); if (t) t.style.display = 'none'; }`);
  await esperar(`() => document.querySelector('[data-kpi="totalAbertosHoje"]') && document.getElementById('tabFechadosDia')`);

  const fix = await evalPage(`() => {
    const ymd = '2026-11-11';
    const D = {
      equipamentos: [{ nome: 'Fritadeira', chamadosDetalhe: [
        { numero: 'A1', abertura: ymd, prioridade: 'Alta', loja: 'LOJA A', problema: 'FRITADEIRA parada', dias: 0, tecnico: 'Ana' },
        { numero: 'N1', abertura: ymd, prioridade: 'Normal', loja: 'LOJA N', problema: 'FRITADEIRA ruido', dias: 0, tecnico: 'Bruno', duplicado: true },
        { numero: 'S1', abertura: ymd, prioridade: 'SOS', loja: 'LOJA S', problema: 'FRITADEIRA quente', dias: 0, tecnico: 'Caio' },
        { numero: 'ONTEM', abertura: '2026-11-10', prioridade: 'SOS', loja: 'X', problema: 'FRITADEIRA', dias: 1, tecnico: 'D' },
      ]}],
      areaInterna: [
        { numero: 'AI1', abertura: ymd, prioridade: 'Alta', loja: 'INTERNA', problema: 'Area Interna | quadro', dias: 0, tecnico: 'Eli' },
      ],
      ultimosFechados: [
        { numero: 'F1', fechadoEm: '11/11/2026 19:00:00', abertoEm: '10/11/2026 08:00:00', prioridade: 'Alta', problema: 'FRITADEIRA | filtro', loja: 'L1', fechadoPor: 'Mara', dias: 1 },
        { numero: 'F2', fechadoEm: '11/11/2026 18:00:00', abertoEm: '11/11/2026 09:00:00', prioridade: 'SOS', problema: 'BROILER | nao liga', loja: 'L2', fechadoPor: 'Otto', dias: 0 },
        { numero: 'F3', fechadoEm: '11/11/2026 17:00:00', abertoEm: '01/11/2026 09:00:00', prioridade: 'Normal', problema: 'SORVETE | ruido', loja: 'L3', fechadoPor: 'Pia', dias: 10 },
        { numero: 'F4', fechadoEm: '11/11/2026 16:00:00', abertoEm: '11/11/2026 15:00:00', prioridade: 'Alta', problema: 'Area Interna | fio', loja: 'L4', fechadoPor: 'Rui', dias: 0 },
        { numero: 'F5', fechadoEm: '10/11/2026 23:00:00', abertoEm: '01/11/2026 09:00:00', prioridade: 'SOS', problema: 'FRITADEIRA', loja: 'L5', fechadoPor: 'Sol', dias: 9 },
      ],
    };
    for (let i = 6; i <= 14; i++) {
      D.ultimosFechados.push({ numero: 'FX' + i, fechadoEm: '11/11/2026 10:0' + (i % 10) + ':00', abertoEm: '02/11/2026 10:00:00', prioridade: i % 2 ? 'Normal' : 'Alta', problema: 'PHU | x', loja: 'Lx', fechadoPor: 'Tim', dias: 9 });
    }
    const fechados = listarFechadosNoDia(D, ymd);
    const abertos = listarAbertosNoDia(D, ymd);
    const abK = contarAbertosHojeAltaSos(D, ymd);
    const feK = contarFechadosHojeAltaSos(D, ymd);
    const numsF = fechados.map((c) => c.numero);
    const numsA = abertos.map((c) => c.numero);
    const feCrit = fechados.filter((c) => ehAltaOuSos(c.prioridade) && ehEquipamentoMonitorado(c.problema)).map((c) => c.numero);
    return {
      tz: ymdHojeSP(new Date('2026-11-12T02:30:00Z')),
      ymdBR: ymdDeDataBR('11/11/2026 23:59:59'),
      nFechados: fechados.length,
      primeiro: numsF[0],
      temOntem: numsF.includes('F5'),
      temNormal: fechados.some((c) => c.prioridade === 'Normal'),
      abK, feK, feCrit,
      abertos: numsA,
      normalForaKpi: !ehAltaOuSos('Normal') && ehAltaOuSos('Alta') && ehAltaOuSos('SOS') && !ehAltaOuSos('Duplicado'),
      deltaVazio: deltaDesde(0, null, '07:02'),
      deltaZero: deltaDesde(2, 2, '07:02'),
      deltaMais: deltaDesde(4, 1, '07:02'),
      txt: textoDiaWhatsApp('fechados', fechados, ymd),
    };
  }`);
  ok(fix.tz === '2026-11-11', 'virada do dia em Sao Paulo, nao em UTC');
  ok(fix.ymdBR === '2026-11-11', 'data do SOMA permanece o dia civil escrito');
  ok(fix.nFechados > 10 && fix.primeiro === 'F1' && !fix.temOntem, 'fechados do dia passam de 10 e ignoram ontem (' + fix.nFechados + ')');
  ok(fix.temNormal, 'aba de fechados guarda prioridade Normal');
  ok(fix.abK === 3 && fix.feCrit.includes('A1') === false && ['A1','S1','F2'].every((n) => fix.abertos.includes(n)) && !fix.feCrit.includes('F3') && !fix.feCrit.includes('F4') && !fix.feCrit.includes('F5') && fix.feCrit.includes('F1') && fix.feCrit.includes('F2') && fix.feK === fix.feCrit.length, 'KPI Alta+SOS: abertos ' + fix.abK + ', fechados ' + fix.feCrit.join(','));
  ok(fix.abertos.includes('A1') && fix.abertos.includes('N1') && fix.abertos.includes('S1') && fix.abertos.includes('AI1') && fix.abertos.includes('F2') && fix.abertos.includes('F4') && !fix.abertos.includes('ONTEM'), 'abertos do dia traz todas as prioridades, inclusive os que ja fecharam');
  ok(fix.normalForaKpi, 'Duplicado nao e prioridade; so SOS e Alta entram no KPI');
  ok(fix.deltaVazio.includes('Alta e SOS') && !fix.deltaVazio.includes('+'), 'sem base nao inventa delta');
  ok(fix.deltaZero.includes('desde 07:02') && fix.deltaMais.includes('+3') && fix.deltaMais.includes('07:02'), 'com base, o delta usa os dois lados filtrados');
  ok((fix.txt.match(/^• /gm) || []).length === fix.nFechados && fix.txt.includes('Normal') && fix.txt.includes('F3'), 'WhatsApp do dia copia a lista inteira, com Normal');
  const pref = await evalPage(`() => {
    const ymd = '2026-11-11';
    const muitos = [];
    for (let i = 0; i < 12; i++) muitos.push({ numero: 'H' + i, fechadoEm: '11/11/2026 12:00:0' + (i % 10), prioridade: 'Normal', problema: 'x', loja: 'L', fechadoPor: 'Z', dias: 0 });
    const n = listarFechadosNoDia({ fechadosHoje: muitos, ultimosFechados: muitos.slice(0, 2) }, ymd).length;
    const nums = listarAbertosNoDia({
      abertosHojeLista: [
        { numero: 'B1', abertura: ymd, prioridade: 'Normal', problema: 'Area Interna' },
        { numero: 'B2', abertura: '2026-11-10', prioridade: 'SOS', equipamento: 'Fritadeira', problema: 'FRITADEIRA' },
      ],
      equipamentos: [{ nome: 'Fritadeira', chamadosDetalhe: [{ numero: 'IGNORA', abertura: ymd, prioridade: 'SOS', problema: 'FRITADEIRA' }] }],
    }, ymd).map((c) => c.numero);
    return { n, nums };
  }`);
  ok(pref.n === 12 && pref.nums.length === 1 && pref.nums[0] === 'B1', 'a aba usa a lista completa do dia e nao o corte de 10 nem a lista antiga');

  const tela = await evalPage(`() => {
    const ymd = ymdHojeSP();
    const ab = contarAbertosHojeAltaSos(DADOS_ATUAIS, ymd);
    const fe = contarFechadosHojeAltaSos(DADOS_ATUAIS, ymd);
    const cardA = document.querySelector('[data-kpi="totalAbertosHoje"]');
    const cardF = document.querySelector('[data-kpi="totalFechadosHoje"]');
    const cardS = document.querySelector('[data-kpi="totalSOS"]');
    const num = (el) => el.querySelector('.hstat-val').textContent.trim();
    const delta = (el) => el.querySelector('.hstat-delta').textContent.trim();
    return {
      ab, fe,
      numA: num(cardA), numF: num(cardF),
      dA: delta(cardA), dF: delta(cardF), dS: delta(cardS),
      labelA: cardA.querySelector('.hstat-lbl').textContent,
      nFech: document.getElementById('nFechadosDia').textContent,
      nAb: document.getElementById('nAbertosDia').textContent,
      lista: document.querySelectorAll('#diaLista .fechado-item').length,
      titulo: document.querySelector('#tabFechadosDia').textContent,
    };
  }`);
  ok(tela.numA === String(tela.ab) && tela.numF === String(tela.fe), 'cards batem com a contagem Alta+SOS (' + tela.numA + ' / ' + tela.numF + ')');
  ok(tela.dA === 'Alta e SOS' && tela.dF === 'Alta e SOS', 'delta sem base filtrada nao reaproveita o total antigo');
  ok(tela.dS.includes('desde'), 'card de SOS do estoque continua com o delta antigo');
  ok(tela.labelA.includes('Abertos hoje'), 'rotulo do card permanece');
  ok(tela.titulo.includes('Fechados no dia') && Number(tela.nFech) === tela.lista, 'aba fechados mostra a lista do dia, nao um corte fixo de 10');
  await evalPage(`() => document.getElementById('chartCard').scrollIntoView({ block: 'center' })`);
  await shot('backlog-kpi-alta-sos.png');
  await evalPage(`() => document.getElementById('diaCard').scrollIntoView({ block: 'start' })`);
  await shot('backlog-dia-fechados.png');
  await evalPage(`() => document.getElementById('tabAbertosDia').click()`);
  const aba = await evalPage(`() => {
    const itens = [...document.querySelectorAll('#diaLista .fechado-item')].map((el) => el.innerText);
    const norms = itens.filter((t) => /\\bNormal\\b/.test(t)).length;
    return {
      sel: document.getElementById('tabAbertosDia').getAttribute('aria-selected'),
      n: document.querySelectorAll('#diaLista .fechado-item').length,
      esperado: Number(document.getElementById('nAbertosDia').textContent),
      norms,
      vazio: document.getElementById('diaLista').textContent.includes('Nenhum chamado aberto hoje'),
    };
  }`);
  ok(aba.sel === 'true' && aba.n === aba.esperado && (aba.n === 0 ? aba.vazio : aba.norms >= 0), 'aba abertos lista o dia inteiro (' + aba.n + ')');
  await shot('backlog-dia-abertos.png');
  await evalPage(`() => { window.__instalarClipboard && window.__instalarClipboard('ok'); }`);
  await evalPage(`() => {
    if (!navigator.clipboard) Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {} });
    window.__copied = null;
    navigator.clipboard.writeText = async (t) => { window.__copied = String(t); };
  }`);
  await evalPage(`() => document.getElementById('diaCopiar').click()`);
  await sleep(200);
  const copia = await evalPage(`() => window.__copied || ''`);
  ok(copia.includes('Abertos no dia') && (copia.match(/^• /gm) || []).length === aba.n, 'WhatsApp da aba aberta copia todos os itens do dia');

  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await evalPage(`() => document.getElementById('diaCard').scrollIntoView({ block: 'start' })`);
  await sleep(200);
  const mob = await evalPage(`() => {
    const a = document.getElementById('tabFechadosDia').getBoundingClientRect();
    const b = document.getElementById('tabAbertosDia').getBoundingClientRect();
    const btn = document.getElementById('diaCopiar').getBoundingClientRect();
    const panel = document.getElementById('diaCard').getBoundingClientRect();
    return { alt: Math.min(a.height, b.height), empilha: b.top >= a.bottom - 2 || a.top === b.top, btn: btn.width > panel.width * 0.7 };
  }`);
  ok(mob.alt >= 40 && mob.btn, 'abas e copia usaveis no celular (' + Math.round(mob.alt) + 'px)');
  await shot('backlog-dia-mobile.png');
} finally {
  try { browserWs && browserWs.close(); } catch (e) {}
  try { chrome.kill('SIGKILL'); } catch (e) {}
  server.close();
}
console.log('\nResumo: ' + (falhas.length ? falhas.length + ' falha(s)' : 'tudo certo'));
if (falhas.length) console.error(falhas.join('\n'));
process.exit(falhas.length ? 1 : 0);
