// Clique nos seis KPIs do topo. Indisponibilidade semanal nao tem lista.
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ART = process.env.ARTIFACT_DIR || '/opt/cursor/artifacts';
const PORT = Number(process.env.TEST_PORT || 8767);
const CDP_PORT = Number(process.env.CDP_PORT || 9337);
fs.mkdirSync(ART, { recursive: true });
const falhas = [];
const ok = (c, m) => { if (!c) { falhas.push(m); console.error('FALHA:', m); } else console.log('ok:', m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://127.0.0.1');
  let rel = decodeURIComponent(u.pathname);
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(ROOT, rel));
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end('no'); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end('nf'); return; }
    const ext = path.extname(file);
    res.writeHead(200, { 'Content-Type': ext === '.html' ? 'text/html; charset=utf-8' : ext === '.json' ? 'application/json' : 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(buf);
  });
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
const chrome = spawn('google-chrome', ['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu',`--remote-debugging-port=${CDP_PORT}`,'--remote-allow-origins=*',`--user-data-dir=${fs.mkdtempSync('/tmp/chrome-kpi-')}`,'--window-size=1400,900','about:blank'], { stdio: 'ignore' });

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
  let seq = 0; const pending = new Map();
  browserWs.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id); pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
      else p.resolve(msg.result ?? {});
    }
  });
  const send = (method, params = {}, sess) => new Promise((resolve, reject) => {
    const id = ++seq; const payload = { id, method, params }; if (sess) payload.sessionId = sess;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('timeout ' + method)); }, 20000);
    pending.set(id, { resolve: (v) => { clearTimeout(timer); resolve(v); }, reject: (e) => { clearTimeout(timer); reject(e); } });
    browserWs.send(JSON.stringify(payload));
  });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const cdp = (m, p) => send(m, p, sessionId);
  async function evalPage(expression, awaitPromise = false) {
    let expr = expression.trim();
    if (/^(\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/.test(expr)) expr = `(${expr})()`;
    const result = await cdp('Runtime.evaluate', { expression: expr, awaitPromise, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text + ' ' + (result.exceptionDetails.exception?.description || ''));
    return result.result?.value;
  }
  async function esperar(fn) {
    const t0 = Date.now();
    while (Date.now() - t0 < 15000) { if (await evalPage(fn)) return; await sleep(150); }
    throw new Error('timeout ' + fn);
  }
  await cdp('Page.enable'); await cdp('Runtime.enable');
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` });
  await esperar(`() => document.querySelector('[data-kpi="total"]')`);
  await evalPage(`() => { sessionStorage.setItem('backlog_auth','1'); const t=document.getElementById('loginScreen'); if (t) t.style.display='none'; }`);

  const base = await evalPage(`() => {
    const todos = chamadosDosEquipamentos(DADOS_ATUAIS);
    const lojas = new Set(todos.map((c) => (c.loja || '').trim()).filter(Boolean));
    return {
      total: todos.length,
      sos: todos.filter((c) => c.prioridade === 'SOS').length,
      alta: todos.filter((c) => c.prioridade === 'Alta').length,
      mat: todos.filter((c) => chamadosComPeca.has(c.numero)).length,
      lojas: lojas.size,
      cardLojas: DADOS_ATUAIS.totalLojas,
      indispRole: document.querySelector('.kpi.k-sos:not([data-kpi])') ? document.querySelectorAll('.kpi:not([data-kpi])').length : 0,
      nClick: document.querySelectorAll('.kpi-abre').length,
    };
  }`);
  ok(base.nClick === 5, 'cinco cards clicaveis, indisponibilidade fica de fora (' + base.nClick + ')');

  async function abre(id) {
    await evalPage(`() => document.querySelector('[data-kpi="${id}"]').click()`);
    await esperar(`() => !document.getElementById('modalOverlay').hidden`);
    return evalPage(`() => ({
      titulo: document.getElementById('modalTitle').textContent,
      sub: document.getElementById('modalSub').textContent,
      n: MODAL_ITENS.length,
      linhas: document.querySelectorAll('#modalTbody tr').length,
      pri: document.getElementById('modalFiltroPrioridade') ? true : false,
      resp: (document.querySelector('label[for="modalFiltroResp"]') || {}).textContent || '',
      copy: document.getElementById('modalCopiar').textContent.trim(),
      prioridades: [...new Set(MODAL_ITENS.map((c) => c.prioridade))],
      lojas: new Set(MODAL_ITENS.map((c) => (c.loja || '').trim()).filter(Boolean)).size,
      comPeca: MODAL_ITENS.filter((c) => chamadosComPeca.has(c.numero)).length,
    })`);
  }

  let r = await abre('total');
  ok(r.titulo === 'Total de Chamados' && r.n === base.total && r.linhas === base.total && r.pri && r.resp.includes('supervisor') && r.copy === 'Copiar para WhatsApp', 'total abre ' + r.n + ' chamados');
  r = await abre('sos');
  ok(r.titulo === 'Chamados SOS' && r.n === base.sos && r.prioridades.every((p) => p === 'SOS'), 'SOS abre ' + r.n);
  r = await abre('alta');
  ok(r.titulo === 'Chamados Alta' && r.n === base.alta && r.prioridades.every((p) => p === 'Alta'), 'Alta abre ' + r.n);
  r = await abre('materiais');
  ok(r.titulo === 'Chamados c/ Materiais' && r.n === base.mat && r.comPeca === r.n, 'materiais abre ' + r.n);
  r = await abre('lojas');
  ok(r.titulo === 'Lojas c/ Chamado Aberto' && r.lojas === base.lojas && r.n === base.total && r.sub.includes(String(base.cardLojas)), 'lojas: ' + r.lojas + ' na lista, card ' + base.cardLojas);
  await evalPage(`() => { window.__c = null; navigator.clipboard.writeText = async (t) => { window.__c = String(t); }; }`);
  await evalPage(`() => document.querySelector('[data-kpi="sos"]').click()`);
  await evalPage(`() => copiarModalParaWhatsApp()`, true);
  const zap = await evalPage(`() => window.__c || ''`);
  ok(zap.includes('Chamados SOS') && (zap.match(/^• /gm) || []).length === base.sos && !/\nNormal ·/.test(zap), 'WhatsApp do card SOS copia so SOS');

  await evalPage(`() => { fecharModal(); document.querySelector('.ecard').click(); }`);
  const equip = await evalPage(`() => !document.getElementById('modalOverlay').hidden && document.getElementById('modalTitle').textContent.length > 0`);
  ok(equip === true, 'card de equipamento continua abrindo');

  const { data } = await cdp('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(ART, 'backlog-kpi-clique.png'), Buffer.from(data, 'base64'));
  console.log('screenshot', path.join(ART, 'backlog-kpi-clique.png'));
} finally {
  try { browserWs && browserWs.close(); } catch (e) {}
  try { chrome.kill('SIGKILL'); } catch (e) {}
  server.close();
}
console.log('\nResumo: ' + (falhas.length ? falhas.length + ' falha(s)' : 'tudo certo'));
if (falhas.length) { console.error(falhas.join('\n')); process.exit(1); }
