// Confere contraste, tipo, diálogo, carimbo e a tabela de comparação
// nos painéis da Manutenção Sul. Sobe o HTML local.
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ART = process.env.ARTIFACT_DIR || '/opt/cursor/artifacts';
const PORT = Number(process.env.TEST_PORT || 8766);
const CDP_PORT = Number(process.env.CDP_PORT || 9335);
fs.mkdirSync(ART, { recursive: true });

const falhas = [];
function ok(cond, msg) {
  if (!cond) { falhas.push(msg); console.error('FALHA:', msg); }
  else console.log('ok:', msg);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(ROOT, rel));
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end('no'); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(buf);
  });
});
await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));

const userData = fs.mkdtempSync('/tmp/chrome-paineis-ux-');
const chrome = spawn('google-chrome', [
  '--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
  `--remote-debugging-port=${CDP_PORT}`, '--remote-allow-origins=*',
  `--user-data-dir=${userData}`, '--window-size=1400,900', 'about:blank',
], { stdio: 'ignore' });

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function waitJson(url) {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(url); if (r.ok) return await r.json(); } catch (e) {}
    await sleep(200);
  }
  throw new Error('Chrome nao abriu');
}

const ver = await waitJson(`http://127.0.0.1:${CDP_PORT}/json/version`);
const browserWs = new WebSocket(ver.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  browserWs.addEventListener('open', resolve, { once: true });
  browserWs.addEventListener('error', () => reject(new Error('websocket')), { once: true });
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
    pending.set(id, {
      resolve: (v) => { clearTimeout(timer); resolve(v); },
      reject: (e) => { clearTimeout(timer); reject(e); },
    });
    browserWs.send(JSON.stringify(payload));
  });
}
const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const cdp = (method, params) => send(method, params, sessionId);
await cdp('Runtime.enable');
await cdp('Page.enable');

async function evalPage(expression) {
  let expr = expression.trim();
  if (/^(async\s+)?(\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>|^(async\s+)?function\b/.test(expr)) expr = `(${expr})()`;
  const result = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) {
    const d = result.exceptionDetails;
    throw new Error((d.text || 'exception') + ' ' + (d.exception?.description || ''));
  }
  return result.result?.value;
}
async function esperar(fn, timeout = 20000) {
  const t0 = Date.now();
  let last;
  while (Date.now() - t0 < timeout) {
    last = await evalPage(fn);
    if (last && last.ok) return last;
    await sleep(150);
  }
  throw new Error('timeout ' + fn + ' ultimo=' + JSON.stringify(last));
}
async function shot(name) {
  const { data } = await cdp('Page.captureScreenshot', { format: 'png' });
  const file = path.join(ART, name);
  fs.writeFileSync(file, Buffer.from(data, 'base64'));
  console.log('screenshot', file);
}

function lum(rgb) {
  const m = String(rgb).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return null;
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const r = lin(+m[1]), g = lin(+m[2]), b = lin(+m[3]);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contraste(fg, bg) {
  const a = lum(fg), b = lum(bg);
  if (a == null || b == null) return 0;
  const [L1, L2] = a > b ? [a, b] : [b, a];
  return (L1 + 0.05) / (L2 + 0.05);
}

const paginas = [
  ['index.html', 'backlog', '2h'],
  ['tecnicos.html', 'tecnicos', '2h'],
  ['pecas.html', 'pecas', '2h'],
  ['perda.html', 'perda', 'sem'],
  ['risco.html', 'risco', 'diaria'],
  ['preventivas.html', 'preventivas', 'diaria'],
  ['sorvete.html', 'sorvete', 'hora'],
  ['gestao.html', 'gestao', 'diaria'],
  ['campo.html', 'campo', '20min'],
];

try {
  for (const [arquivo, slug] of paginas) {
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
    await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/${arquivo}` });
    const pronto = await esperar(`() => {
      if (!document.body) return { ok: false };
      const stamp = document.getElementById('stamp');
      const txt = stamp ? stamp.textContent : '';
      const carregando = /buscando|carregando/i.test(document.body.innerText) && !/atualizado|sem horário|verificado/i.test(txt);
      const temPainel = !!document.querySelector('.kpis, .statcards, .equip-grid, .gauge-grid, .cmp-table, table tbody tr');
      return { ok: !!(stamp && txt && !/^carregando/i.test(txt) && temPainel && !carregando), txt, temPainel };
    }`, arquivo === 'campo.html' || arquivo === 'risco.html' ? 25000 : 15000);
    ok(true, slug + ' abriu: ' + pronto.txt);

    const medida = await evalPage(`() => {
      const pick = document.querySelector('.kpi .label, .filter-field label, aside .s-header, .sec-note, .estat .l');
      const cs = pick ? getComputedStyle(pick) : null;
      function fundoDe(el) {
        let n = el;
        while (n) {
          const c = getComputedStyle(n).backgroundColor;
          if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') return c;
          n = n.parentElement;
        }
        return 'rgb(255, 255, 255)';
      }
      const bgEl = pick;
      const pequenos = [...document.querySelectorAll('.kpi .label, .estat .l, .filter-field label, .gstats .estat .l, .sec-note, aside .s-header, .detail-table th, thead th')]
        .slice(0, 12)
        .map((el) => parseFloat(getComputedStyle(el).fontSize));
      const tecnico = document.body.innerText.includes('carregando data/');
      return {
        cor: cs && cs.color,
        fundo: pick ? fundoDe(bgEl) : 'rgb(255, 255, 255)',
        font: cs && cs.fontSize,
        minTipo: pequenos.length ? Math.min(...pequenos) : 0,
        tecnico,
        stamp: document.getElementById('stamp').textContent,
        stampTitle: document.getElementById('stamp').title || '',
        arquivo: document.body.innerText.includes('dados.json') || document.body.innerText.includes('risco.json'),
      };
    }`);
    const ratio = contraste(medida.cor, medida.fundo === 'rgba(0, 0, 0, 0)' ? 'rgb(255, 255, 255)' : medida.fundo);
    ok(ratio >= 4.5, slug + ' contraste do rótulo ' + ratio.toFixed(2) + ' (' + medida.cor + ' / ' + medida.fundo + ')');
    ok(medida.minTipo >= 12, slug + ' tipo mínimo ' + medida.minTipo + 'px');
    ok(!medida.tecnico && !medida.arquivo, slug + ' não mostra caminho técnico de arquivo');
    ok(!/diária|diario/i.test(medida.stamp), slug + ' carimbo não diz atualização diária: ' + medida.stamp);
    if (slug === 'backlog' || slug === 'tecnicos' || slug === 'pecas') {
      ok(/no prazo|atrasado/.test(medida.stamp), slug + ' carimbo marca a cadência de 2 h');
      ok(/2 h|minuto :02/i.test(medida.stampTitle), slug + ' explica a cadência: ' + medida.stampTitle);
    }
    if (slug === 'campo') ok(/20 min/i.test(medida.stampTitle), 'campo explica 20 min');
    if (slug === 'perda') ok(/não traz horário|7h30|no prazo|atrasado|Sem horário/i.test(medida.stamp + ' ' + medida.stampTitle), 'perda não finge o relógio da tela: ' + medida.stamp);
    if (slug === 'backlog') {
      const cmp = await evalPage(`() => {
        const t = document.getElementById('cmpEquip');
        const escopo = document.querySelector('.escopo-painel');
        return {
          tabela: !!t,
          cols: t ? [...t.querySelectorAll('thead button')].map((b) => b.textContent) : [],
          escopo: escopo ? escopo.textContent : '',
        };
      }`);
      ok(cmp.tabela && cmp.cols.includes('SOS') && cmp.cols.includes('Indisponibilidade'), 'backlog tem tabela de comparação');
      ok(/equipamentos monitorados/.test(cmp.escopo) && /não é o arquivo inteiro/.test(cmp.escopo), 'backlog explica o universo do KPI');
      await shot('backlog-paineis.png');
      await evalPage(`() => {
        sessionStorage.setItem('backlog_auth', '1');
        const tela = document.getElementById('loginScreen');
        if (tela) tela.style.display = 'none';
        document.querySelector('.ecard').click();
      }`);
      const dlg = await esperar(`() => {
        const overlay = document.getElementById('modalOverlay');
        const painel = overlay && overlay.querySelector('[role="dialog"]');
        const aberto = overlay && !overlay.hidden;
        return {
          ok: aberto && painel,
          role: painel && painel.getAttribute('role'),
          modal: painel && painel.getAttribute('aria-modal'),
          nome: painel && (painel.getAttribute('aria-labelledby') || painel.getAttribute('aria-label')),
          foco: document.activeElement && painel && painel.contains(document.activeElement),
          z: overlay && getComputedStyle(overlay).zIndex,
          hz: getComputedStyle(document.querySelector('header')).zIndex,
        };
      }`);
      ok(dlg.role === 'dialog' && dlg.modal === 'true' && dlg.nome, 'diálogo tem nome e aria-modal');
      ok(dlg.foco, 'foco inicial fica no diálogo');
      ok(Number(dlg.z) > Number(dlg.hz), 'modal (' + dlg.z + ') fica acima do header (' + dlg.hz + ')');
      const teclado = await evalPage(`() => {
        const input = document.getElementById('modalFiltroLoja');
        input.focus();
        input.dispatchEvent(new Event('focus'));
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        const lista = document.getElementById('modalFiltroLojaLista');
        return new Promise((resolve) => setTimeout(() => {
          const ativo = lista.querySelector('.filter-combo-item.ativo');
          resolve({ aberta: lista && !lista.hidden, ativo: ativo ? ativo.textContent : '' });
        }, 30));
      }`);
      ok(teclado.aberta && teclado.ativo, 'busca de loja responde à seta: ' + teclado.ativo);
      await evalPage(`() => new Promise((resolve) => {
        const req = indexedDB.deleteDatabase('sul-ui');
        req.onsuccess = req.onerror = req.onblocked = () => resolve(true);
      })`);
      await evalPage(`() => {
        window.fetch = () => Promise.reject(new Error('HTTP 503'));
        return iniciar();
      }`);
      const falha = await esperar(`() => {
        const btn = document.querySelector('[data-sul-retry="iniciar"]');
        const txt = document.body.innerText;
        return { ok: btn && /Tentar novamente/.test(btn.textContent) && /Não consegui atualizar/.test(txt) && !/dados\\.json/.test(txt) };
      }`);
      ok(falha.ok, 'falha de leitura oferece Tentar novamente sem caminho de arquivo');
    }
    if (slug !== 'backlog') await shot('painel-' + slug + '.png');
  }

  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` });
  await esperar(`() => ({ ok: document.querySelectorAll('.ecard').length > 0 })`);
  await evalPage(`() => {
    sessionStorage.setItem('backlog_auth', '1');
    const tela = document.getElementById('loginScreen');
    if (tela) tela.style.display = 'none';
  }`);
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await evalPage(`() => document.querySelector('.ecard').click()`);
  await sleep(300);
  const mobile = await evalPage(`() => {
    const filtros = document.querySelector('.modal-filtros');
    const body = document.querySelector('.modal-body');
    const painel = document.querySelector('.modal-panel');
    const fr = filtros.getBoundingClientRect();
    const br = body.getBoundingClientRect();
    const pr = painel.getBoundingClientRect();
    const label = document.querySelector('.kpi .label, .estat .l');
    return {
      filtroH: fr.height,
      painelH: pr.height,
      bodyTop: br.top,
      bodyH: br.height,
      filtroDentro: fr.bottom <= pr.bottom + 1,
      bodyVisivel: br.height >= 120 && br.top < pr.bottom - 40,
      tipo: label ? parseFloat(getComputedStyle(label).fontSize) : 0,
      base: getComputedStyle(document.querySelector('.modal-filtros .filter-field-datas') || filtros).flexBasis,
    };
  }`);
  ok(mobile.bodyVisivel, 'no celular a lista do modal continua visível (' + Math.round(mobile.bodyH) + 'px)');
  ok(mobile.filtroH > 80 && mobile.filtroH < mobile.painelH * 0.55, 'filtros cabem sem sumir nem tomar o modal (' + Math.round(mobile.filtroH) + ' de ' + Math.round(mobile.painelH) + ')');
  ok(mobile.tipo >= 12, 'rótulo no celular tem ' + mobile.tipo + 'px');
  ok(mobile.base === 'auto', 'base flex dos filtros no celular é auto (' + mobile.base + ')');
  await shot('backlog-mobile-modal.png');
} catch (e) {
  console.error(e);
  falhas.push(String(e.message || e));
} finally {
  chrome.kill();
  server.close();
}

if (falhas.length) {
  console.error(falhas.length + ' falha(s)');
  process.exit(1);
}
console.log('paineis ux ok');
