// Exercita o botão "Copiar para WhatsApp" dos modais do Backlog.
// Sobe o HTML local, abre os cards no Chrome e confere texto, filtros,
// Unicode, quebras de linha, lista inteira e sucesso/falha/vazio da cópia.
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ART = process.env.ARTIFACT_DIR || '/opt/cursor/artifacts';
const PORT = Number(process.env.TEST_PORT || 8765);
const CDP_PORT = Number(process.env.CDP_PORT || 9334);
fs.mkdirSync(ART, { recursive: true });

const falhas = [];
function ok(cond, msg) {
  if (!cond) {
    falhas.push(msg);
    console.error('FALHA:', msg);
  } else {
    console.log('ok:', msg);
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json',
  '.js': 'text/javascript',
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

const userData = fs.mkdtempSync('/tmp/chrome-backlog-zap-');
const chrome = spawn('google-chrome', [
  '--headless=new',
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  `--remote-debugging-port=${CDP_PORT}`,
  '--remote-allow-origins=*',
  `--user-data-dir=${userData}`,
  '--window-size=1400,900',
  'about:blank',
], { stdio: 'ignore' });

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function waitJson(url) {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return await r.json();
    } catch (e) {}
    await sleep(200);
  }
  throw new Error('Chrome nao abriu o depurador');
}

let browserWs;
let sessionId;
try {
  const ver = await waitJson(`http://127.0.0.1:${CDP_PORT}/json/version`);
  browserWs = new WebSocket(ver.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    browserWs.addEventListener('open', resolve, { once: true });
    browserWs.addEventListener('error', () => reject(new Error('websocket do Chrome falhou')), { once: true });
  });

  let seq = 0;
  const pending = new Map();
  const eventos = [];
  browserWs.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
      else p.resolve(msg.result ?? {});
    } else if (msg.method) {
      eventos.push(msg);
    }
  });
  function send(method, params = {}, sess) {
    const id = ++seq;
    const payload = { id, method, params };
    if (sess) payload.sessionId = sess;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error('timeout CDP ' + method));
      }, 20000);
      pending.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
      browserWs.send(JSON.stringify(payload));
    });
  }

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  ({ sessionId } = await send('Target.attachToTarget', { targetId, flatten: true }));
  const cdp = (method, params) => send(method, params, sessionId);

  const logs = [];
  const drenar = setInterval(() => {
    while (eventos.length) {
      const msg = eventos.shift();
      if (msg.sessionId && msg.sessionId !== sessionId) continue;
      if (msg.method === 'Runtime.consoleAPICalled') {
        logs.push((msg.params?.args || []).map((a) => a.value ?? a.description ?? '').join(' '));
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params?.exceptionDetails;
        logs.push('EXC ' + (d?.text || '') + ' ' + (d?.exception?.description || ''));
      }
    }
  }, 50);

  await cdp('Runtime.enable');
  await cdp('Page.enable');
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` });

  async function evalPage(expression, awaitPromise = false) {
    let expr = expression.trim();
    if (/^(async\s+)?(\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>|^(async\s+)?function\b/.test(expr)) {
      expr = `(${expr})()`;
    }
    const result = await cdp('Runtime.evaluate', { expression: expr, awaitPromise, returnByValue: true });
    if (result.exceptionDetails) {
      const d = result.exceptionDetails;
      throw new Error((d.text || 'exception') + ' ' + (d.exception?.description || d.exception?.value || ''));
    }
    return result.result?.value;
  }

  async function esperar(fnBody, timeout = 15000) {
    const t0 = Date.now();
    let last;
    while (Date.now() - t0 < timeout) {
      last = await evalPage(fnBody);
      if (last) return last;
      await sleep(150);
    }
    throw new Error('timeout esperando ' + fnBody + ' ultimo=' + JSON.stringify(last));
  }

  async function shot(name) {
    const { data } = await cdp('Page.captureScreenshot', { format: 'png' });
    const file = path.join(ART, name);
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
    console.log('screenshot', file);
    return file;
  }

  function temHtml(s) {
    return /<\/?[a-zA-Z][^>]*>/.test(String(s)) || /<\s*br/i.test(String(s));
  }

  await esperar(`() => document.querySelectorAll('.ecard').length > 0 && document.querySelectorAll('.gcard').length > 0`);
  await evalPage(`() => {
    sessionStorage.setItem('backlog_auth', '1');
    const tela = document.getElementById('loginScreen');
    if (tela) tela.style.display = 'none';
  }`);

  await evalPage(`() => {
    window.__instalarClipboard = (modo) => {
      window.__copied = null;
      window.__clipCalls = 0;
      if (!navigator.clipboard) {
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {} });
      }
      const escrever = async (texto) => {
        window.__clipCalls++;
        if (modo === 'falha') throw new Error('permissao negada');
        window.__copied = String(texto);
      };
      try { navigator.clipboard.writeText = escrever; }
      catch (e) {
        Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true, writable: true, value: escrever });
      }
      document.execCommand = (cmd) => {
        if (cmd !== 'copy') return false;
        if (modo === 'exec') {
          const ativo = document.activeElement;
          window.__copied = ativo && 'value' in ativo ? String(ativo.value) : '';
          window.__clipCalls++;
          return true;
        }
        return false;
      };
    };
  }`);

  await evalPage(`() => {
    const card = [...document.querySelectorAll('.ecard')].find((e) => e.querySelector('.etitle')?.textContent === 'Máquina de Sorvete');
    card.click();
  }`);
  await esperar(`() => !document.getElementById('modalOverlay').hidden && document.getElementById('modalTitle').textContent === 'Máquina de Sorvete'`);

  let info = await evalPage(`() => {
    const btn = document.getElementById('modalCopiar');
    const r = btn.getBoundingClientRect();
    const panel = document.querySelector('.modal-panel').getBoundingClientRect();
    const close = document.getElementById('modalClose').getBoundingClientRect();
    return {
      texto: btn.textContent.trim(),
      disabled: btn.disabled,
      type: btn.type,
      contagem: document.getElementById('modalFiltroContagem').textContent,
      n: MODAL_FILTRADOS.length,
      total: MODAL_ITENS.length,
      linhas: document.querySelectorAll('#modalTbody tr').length,
      btnDentro: r.left >= panel.left - 1 && r.right <= panel.right + 1 && r.top >= panel.top - 1 && r.bottom <= panel.bottom + 1,
      closeDentro: close.right <= panel.right + 1 && close.top >= panel.top - 1,
      altBtn: r.height,
      filtros: ['modalFiltroLoja','modalFiltroProblema','modalFiltroPrioridade','modalFiltroResp','modalFiltroDataDe','modalFiltroDataAte','modalFiltroLimpar'].every((id) => !!document.getElementById(id)),
      umBotao: document.querySelectorAll('#modalCopiar').length,
      href0: document.querySelector('#modalTbody a')?.getAttribute('href') || '',
    };
  }`);
  ok(info.texto === 'Copiar para WhatsApp', 'rotulo visivel no modal de equipamento');
  ok(!info.disabled, 'botao habilitado com chamados');
  ok(info.type === 'button', 'type=button, nao envia formulario');
  ok(info.n === 85 && info.total === 85 && info.linhas === 85, 'sorvete abre 85 chamados (' + info.contagem + ')');
  ok(info.btnDentro && info.closeDentro, 'botao e fechar cabem no painel');
  ok(info.altBtn >= 30, 'altura util do botao no desktop (' + Math.round(info.altBtn) + ')');
  ok(info.filtros, 'filtros de loja, problema, responsavel e abertura continuam no modal');
  ok(info.umBotao === 1, 'um unico botao de copia no modal');
  ok(info.href0.startsWith('https://soma.zamp.com.br/wm_task.do?sysparm_query=number='), 'link do chamado preservado');
  await shot('backlog-modal-sorvete-desktop.png');

  const fora = await evalPage(`() => {
    const body = document.querySelector('.modal-body');
    body.style.maxHeight = '70px';
    body.scrollTop = 0;
    const rows = [...document.querySelectorAll('#modalTbody tr')];
    const br = body.getBoundingClientRect();
    const visiveis = rows.filter((tr) => {
      const r = tr.getBoundingClientRect();
      return r.bottom > br.top && r.top < br.bottom;
    }).length;
    return {
      visiveis,
      total: rows.length,
      primeiro: rows[0].querySelector('a').textContent,
      ultimo: rows[rows.length - 1].querySelector('a').textContent,
      scroll: body.scrollHeight > body.clientHeight,
    };
  }`);
  ok(fora.scroll && fora.visiveis < fora.total, 'ha chamados fora da area visivel (' + fora.visiveis + ' de ' + fora.total + ')');

  await evalPage(`() => window.__instalarClipboard('ok')`);
  let copiou = await evalPage(`() => copiarModalParaWhatsApp()`, true);
  let texto = await evalPage(`() => window.__copied`);
  ok(copiou === true, 'clipboard sucesso devolve true');
  ok(typeof texto === 'string' && texto.startsWith('*Máquina de Sorvete*'), 'titulo do modal no texto');
  ok(texto.includes('85 de 85 chamados'), 'contagem completa no texto');
  ok((texto.match(/^• /gm) || []).length === 85, 'copia os 85 filtrados, nao so a rolagem');
  ok(texto.includes(fora.primeiro) && texto.includes(fora.ultimo), 'inclui o primeiro e o ultimo chamado');
  ok(texto.includes('https://soma.zamp.com.br/wm_task.do?sysparm_query=number=' + encodeURIComponent(fora.primeiro)), 'URL do chamado a partir do numero');
  ok(texto.includes('Problema:') && texto.includes('Responsável:'), 'problema e responsavel presentes');
  ok(!temHtml(texto), 'texto copiado nao contem tags HTML');
  let estado = await evalPage(`() => ({
    t: document.getElementById('modalCopiar').textContent,
    ok: document.getElementById('modalCopiar').classList.contains('ok'),
    fb: document.getElementById('modalCopiaFallback').hidden,
    st: document.getElementById('modalCopiaStatus').textContent,
  })`);
  ok(estado.t === 'Copiado!' && estado.ok && estado.fb === true && estado.st === 'Copiado!', 'feedback Copiado! sem painel manual');
  await evalPage(`() => { document.querySelector('.modal-body').style.maxHeight = ''; }`);
  await shot('backlog-modal-copiado.png');

  await evalPage(`() => { window.__copied = null; document.getElementById('modalCopiar').click(); }`);
  await esperar(`() => window.__copied && window.__copied.includes('85 de 85 chamados') && document.getElementById('modalCopiar').textContent === 'Copiado!'`);
  ok(true, 'clique no botao tambem copia');

  await evalPage(`() => {
    document.querySelector('.modal-body').style.maxHeight = '';
    const el = document.getElementById('modalFiltroProblema');
    el.value = 'incendio';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }`);
  info = await evalPage(`() => ({
    n: MODAL_FILTRADOS.length,
    contagem: document.getElementById('modalFiltroContagem').textContent,
    problemas: MODAL_FILTRADOS.map((c) => c.problema),
    fora: MODAL_ITENS.filter((c) => !semAcentoModal(c.problema).includes('incendio')).map((c) => c.numero).slice(0, 5),
  })`);
  ok(info.n > 0 && info.n < 85, 'filtro incendio reduz a lista (' + info.n + ')');
  ok(info.contagem.startsWith(info.n + ' de 85'), 'contagem visivel bate com o filtro');
  ok(info.problemas.every((p) => p.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes('incendio')), 'todos os filtrados tem incendio');
  await evalPage(`() => window.__instalarClipboard('ok')`);
  await evalPage(`() => copiarModalParaWhatsApp()`, true);
  texto = await evalPage(`() => window.__copied`);
  ok(texto.includes('INCÊNDIO'), 'preserva o unicode INCÊNDIO');
  ok(texto.includes('_Filtros: problema "incendio"_'), 'resume o filtro ativo');
  ok(texto.includes(info.n + ' de 85 chamados'), 'contagem copiada e a filtrada');
  ok((texto.match(/^• /gm) || []).length === info.n, 'copia so o conjunto filtrado');
  ok(info.fora.every((n) => !texto.includes(n)), 'nao copia chamados fora do filtro');
  ok(!temHtml(texto), 'filtro nao introduz HTML');
  await shot('backlog-modal-filtro-unicode.png');

  const combo = await evalPage(`() => {
    document.getElementById('modalFiltroLimpar').click();
    const amostra = MODAL_ITENS.find((c) => c.loja && c.tecnico && c.abertura && c.prioridade && candidatosSupervisor(c).length === 1);
    document.getElementById('modalFiltroLoja').value = amostra.loja;
    document.getElementById('modalFiltroLoja').dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('modalFiltroPrioridade').value = amostra.prioridade;
    document.getElementById('modalFiltroPrioridade').dispatchEvent(new Event('change', { bubbles: true }));
    document.getElementById('modalFiltroResp').value = supervisorDeChamado(amostra);
    document.getElementById('modalFiltroResp').dispatchEvent(new Event('change', { bubbles: true }));
    document.getElementById('modalFiltroDataDe').value = amostra.abertura;
    document.getElementById('modalFiltroDataDe').dispatchEvent(new Event('change', { bubbles: true }));
    document.getElementById('modalFiltroDataAte').value = amostra.abertura;
    document.getElementById('modalFiltroDataAte').dispatchEvent(new Event('change', { bubbles: true }));
    const sup = supervisorDeChamado(amostra);
    return {
      loja: amostra.loja,
      tecnico: amostra.tecnico,
      prioridade: amostra.prioridade,
      supervisor: sup,
      numero: amostra.numero,
      n: MODAL_FILTRADOS.length,
      ok: MODAL_FILTRADOS.every((c) => c.loja === amostra.loja && c.prioridade === amostra.prioridade && chamadoPassaSupervisor(c, sup) && c.abertura === amostra.abertura),
      tecnicoNaTabela: [...document.querySelectorAll('#modalTbody tr')].every((tr) => {
        const num = tr.querySelector('a')?.textContent;
        const c = MODAL_FILTRADOS.find((x) => x.numero === num);
        const celulas = [...tr.querySelectorAll('td')];
        return c && celulas[celulas.length - 1].textContent === (c.tecnico || '—');
      }),
    };
  }`);
  ok(combo.n > 0 && combo.ok, 'loja, prioridade, supervisor e abertura juntos (' + combo.n + ')');
  ok(combo.tecnicoNaTabela, 'coluna Tecnico continua sendo o tecnico, nao o supervisor');
  ok(combo.tecnico !== combo.supervisor, 'amostra separa tecnico e supervisor');
  await evalPage(`() => window.__instalarClipboard('ok')`);
  await evalPage(`() => copiarModalParaWhatsApp()`, true);
  texto = await evalPage(`() => window.__copied`);
  ok(texto.includes('loja ' + combo.loja) && texto.includes('prioridade ' + combo.prioridade) && texto.includes('responsável ' + combo.supervisor), 'filtros descritos no texto');
  ok((texto.match(/^• /gm) || []).length === combo.n, 'quantidade copiada igual ao filtro combinado');
  ok(texto.includes('Responsável: ' + combo.supervisor), 'exportacao usa o supervisor');
  ok(texto.includes('Técnico: ' + combo.tecnico.split('\n')[0]), 'exportacao lista o tecnico a parte');
  ok(!texto.includes('Responsável: ' + combo.tecnico.split('\n')[0]), 'exportacao nao chama o tecnico de responsavel');
  await shot('backlog-modal-prioridade-supervisor.png');

  const mapa = await evalPage(`() => {
    const listas = new Map();
    for (const s of (DADOS_ATUAIS.supervisores || [])) {
      for (const c of (s.chamadosDetalhe || [])) {
        if (!c || !c.numero) continue;
        if (!listas.has(c.numero)) listas.set(c.numero, new Set());
        listas.get(c.numero).add(s.nome);
      }
    }
    const card = [...document.querySelectorAll('.ecard')].find((e) => e.querySelector('.etitle')?.textContent === 'Máquina de Sorvete');
    card.click();
    const optsResp = [...document.getElementById('modalFiltroResp').options].map((o) => o.value);
    const optsPri = [...document.getElementById('modalFiltroPrioridade').options].map((o) => o.value);
    const nomesSup = new Set((DADOS_ATUAIS.supervisores || []).map((s) => s.nome));
    const tecnicos = new Set(MODAL_ITENS.map((c) => c.tecnico).filter(Boolean));
    const respEhTecnico = optsResp.filter((v) => v && tecnicos.has(v) && !nomesSup.has(v));
    const ordem = ['SOS', 'Alta', 'Normal', 'Baixa'];
    const espPri = [...new Set(MODAL_ITENS.map((c) => c.prioridade).filter(Boolean))].sort((a, b) => {
      const ia = ordem.indexOf(a), ib = ordem.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || String(a).localeCompare(String(b), 'pt-BR');
    });
    const erros = [];
    for (const c of MODAL_ITENS) {
      const nomes = [];
      for (const s of (DADOS_ATUAIS.supervisores || [])) {
        if ((s.chamadosDetalhe || []).some((x) => x.numero === c.numero) && !nomes.includes(s.nome)) nomes.push(s.nome);
      }
      const esp = nomes.length === 0 ? '(sem supervisor)' : nomes.length === 1 ? nomes[0] : ('Supervisor em conflito: ' + nomes.join(' / '));
      if (supervisorDeChamado(c) !== esp) erros.push(c.numero + '=' + supervisorDeChamado(c));
    }
    const ambiguos = [...listas.entries()].filter(([, nomes]) => nomes.size > 1).map(([n]) => n);
    const sem = MODAL_ITENS.filter((c) => candidatosSupervisor(c).length === 0).map((c) => c.numero);
    const dup = MODAL_ITENS.find((c) => chamadosDuplicados.has(c.numero) && c.prioridade);
    let dupOk = null;
    if (dup) {
      document.getElementById('modalFiltroPrioridade').value = dup.prioridade;
      document.getElementById('modalFiltroPrioridade').dispatchEvent(new Event('change', { bubbles: true }));
      const naPri = MODAL_FILTRADOS.some((c) => c.numero === dup.numero) && MODAL_FILTRADOS.every((c) => c.prioridade === dup.prioridade);
      const outra = espPri.find((p) => p !== dup.prioridade);
      document.getElementById('modalFiltroPrioridade').value = outra;
      document.getElementById('modalFiltroPrioridade').dispatchEvent(new Event('change', { bubbles: true }));
      const fora = !MODAL_FILTRADOS.some((c) => c.numero === dup.numero);
      dupOk = { numero: dup.numero, prioridade: dup.prioridade, outra, naPri, fora };
      document.getElementById('modalFiltroLimpar').click();
    }
    return {
      label: document.querySelector('label[for="modalFiltroResp"]').textContent,
      thead: document.getElementById('modalThead').textContent,
      optsResp, optsPri, respEhTecnico, espPri,
      nErros: erros.length,
      erros: erros.slice(0, 3),
      ambiguos, sem,
      dupOk,
      priIgual: optsPri.join('|') === ['', ...espPri].join('|'),
    };
  }`);
  ok(mapa.label.includes('supervisor'), 'rotulo deixa claro que responsavel e o supervisor');
  ok(mapa.thead.includes('Técnico') && !mapa.thead.includes('Responsável'), 'coluna continua Tecnico');
  ok(mapa.priIgual && !mapa.optsPri.includes('Duplicado'), 'prioridades reais, sem o selo Duplicado: ' + mapa.optsPri.join(','));
  ok(mapa.respEhTecnico.length === 0, 'opcoes de responsavel nao sao tecnicos');
  ok(mapa.nErros === 0, 'rotulo unico, conflito com os dois nomes, ou (sem supervisor): ' + (mapa.erros || []).join(','));
  ok(mapa.ambiguos.length > 0 && mapa.sem.every((n) => !mapa.ambiguos.includes(n)), 'conflito nao e misturado com chamado sem carteira');
  ok(mapa.dupOk && mapa.dupOk.naPri && mapa.dupOk.fora, 'Duplicado filtra pela prioridade real (' + (mapa.dupOk && mapa.dupOk.prioridade) + ')');

  const limpo = await evalPage(`() => {
    document.getElementById('modalFiltroPrioridade').value = 'SOS';
    document.getElementById('modalFiltroPrioridade').dispatchEvent(new Event('change', { bubbles: true }));
    document.getElementById('modalFiltroResp').value = document.getElementById('modalFiltroResp').options[1].value;
    document.getElementById('modalFiltroResp').dispatchEvent(new Event('change', { bubbles: true }));
    const antes = MODAL_FILTRADOS.length;
    document.getElementById('modalFiltroLimpar').click();
    return {
      antes,
      pri: document.getElementById('modalFiltroPrioridade').value,
      resp: document.getElementById('modalFiltroResp').value,
      loja: document.getElementById('modalFiltroLoja').value,
      problema: document.getElementById('modalFiltroProblema').value,
      de: document.getElementById('modalFiltroDataDe').value,
      ate: document.getElementById('modalFiltroDataAte').value,
      n: MODAL_FILTRADOS.length,
      total: MODAL_ITENS.length,
    };
  }`);
  ok(limpo.antes < limpo.total && limpo.pri === '' && limpo.resp === '' && limpo.loja === '' && limpo.problema === '' && limpo.de === '' && limpo.ate === '' && limpo.n === limpo.total, 'Limpar zera prioridade, supervisor e os outros filtros');

  const reaberto = await evalPage(`() => {
    document.getElementById('modalFiltroPrioridade').value = 'SOS';
    document.getElementById('modalFiltroResp').value = '(sem supervisor)';
    const card = [...document.querySelectorAll('.ecard')].find((e) => e.querySelector('.etitle')?.textContent === 'Fritadeira');
    card.click();
    return {
      titulo: document.getElementById('modalTitle').textContent,
      pri: document.getElementById('modalFiltroPrioridade').value,
      resp: document.getElementById('modalFiltroResp').value,
      n: MODAL_FILTRADOS.length,
      total: MODAL_ITENS.length,
    };
  }`);
  ok(reaberto.titulo === 'Fritadeira' && reaberto.pri === '' && reaberto.resp === '' && reaberto.n === reaberto.total, 'reabrir outro card limpa prioridade e supervisor');

  const prescopo = await evalPage(`() => {
    const listas = new Map();
    for (const s of (DADOS_ATUAIS.supervisores || [])) {
      for (const c of (s.chamadosDetalhe || [])) {
        if (!listas.has(c.numero)) listas.set(c.numero, new Set());
        listas.get(c.numero).add(s.nome);
      }
    }
    const nome = 'CARLOS MAGNO';
    const card = [...document.querySelectorAll('.gcard')].find((e) => e.querySelector('.gname')?.textContent === nome);
    card.click();
    const ambiguos = MODAL_ITENS.filter((c) => (listas.get(c.numero) || new Set()).size > 1).map((c) => c.numero);
    const opts = [...document.getElementById('modalFiltroResp').options].map((o) => o.value).filter(Boolean);
    document.getElementById('modalFiltroResp').value = nome;
    document.getElementById('modalFiltroResp').dispatchEvent(new Event('change', { bubbles: true }));
    const noNome = ambiguos.every((n) => MODAL_FILTRADOS.some((c) => c.numero === n));
    const temUnico = MODAL_FILTRADOS.some((c) => candidatosSupervisor(c).length === 1);
    document.getElementById('modalFiltroResp').value = 'GUSTAVO';
    document.getElementById('modalFiltroResp').dispatchEvent(new Event('change', { bubbles: true }));
    const noOutro = ambiguos.every((n) => MODAL_FILTRADOS.some((c) => c.numero === n));
    const soAssociadoAoOutro = MODAL_FILTRADOS.every((c) => candidatosSupervisor(c).includes('GUSTAVO'));
    document.getElementById('modalFiltroResp').value = 'Supervisor em conflito';
    document.getElementById('modalFiltroResp').dispatchEvent(new Event('change', { bubbles: true }));
    const soConflito = MODAL_FILTRADOS.length === ambiguos.length && ambiguos.every((n) => MODAL_FILTRADOS.some((c) => c.numero === n));
    const rotulo = ambiguos.length ? supervisorDeChamado(MODAL_FILTRADOS.find((c) => c.numero === ambiguos[0])) : '';
    window.__instalarClipboard('ok');
    return { opts, ambiguos, noNome, temUnico, noOutro, soAssociadoAoOutro, soConflito, rotulo, thead: document.getElementById('modalThead').textContent };
  }`);
  ok(prescopo.thead.includes('Equipamento') && prescopo.thead.includes('Técnico'), 'modal do supervisor mantem equipamento e tecnico');
  ok(prescopo.opts.includes('CARLOS MAGNO') && prescopo.opts.includes('GUSTAVO') && prescopo.opts.includes('Supervisor em conflito') && !prescopo.opts.includes('RAFAEL') && !prescopo.opts.includes('MARCEL') && !prescopo.opts.includes('(sem supervisor)'), 'card em conflito oferece os dois nomes e a opcao de conflito, sem fingir ausencia');
  ok(prescopo.ambiguos.length > 0 && prescopo.noNome && prescopo.temUnico && prescopo.noOutro && prescopo.soAssociadoAoOutro && prescopo.soConflito, 'filtrar por qualquer dos dois inclui o chamado; a opcao de conflito isola so eles');
  ok(prescopo.rotulo === 'Supervisor em conflito: GUSTAVO / CARLOS MAGNO', 'rotulo guarda os dois nomes: ' + prescopo.rotulo);
  await evalPage(`() => window.__instalarClipboard('ok')`);
  await evalPage(`() => copiarModalParaWhatsApp()`, true);
  texto = await evalPage(`() => window.__copied`);
  const linhasResp = texto.split('\n').filter((l) => l.startsWith('Responsável:'));
  ok(linhasResp.length === prescopo.ambiguos.length && linhasResp.every((l) => l === 'Responsável: Supervisor em conflito: GUSTAVO / CARLOS MAGNO'), 'WhatsApp do conflito cita os dois nomes e nao escolhe um');
  ok(!texto.includes('Responsável: (sem supervisor)') && !texto.includes('Responsável: GUSTAVO\n') && !texto.includes('Responsável: CARLOS MAGNO'), 'exportacao do conflito nao usa ausencia nem nome unico');
  await shot('backlog-modal-supervisor-conflito.png');

  const semCarteira = await evalPage(`() => {
    const card = [...document.querySelectorAll('.ecard')].find((e) => e.querySelector('.etitle')?.textContent === 'Máquina de Sorvete');
    card.click();
    document.getElementById('modalFiltroResp').value = '(sem supervisor)';
    document.getElementById('modalFiltroResp').dispatchEvent(new Event('change', { bubbles: true }));
    const nums = MODAL_FILTRADOS.map((c) => c.numero);
    return {
      n: nums.length,
      todosSem: MODAL_FILTRADOS.every((c) => candidatosSupervisor(c).length === 0),
      temLagos: nums.includes('WOT0055127'),
      temConflito: nums.includes('WOT0079316'),
    };
  }`);
  ok(semCarteira.n > 0 && semCarteira.todosSem && semCarteira.temLagos && !semCarteira.temConflito, '(sem supervisor) fica so com chamado sem carteira');
  await evalPage(`() => window.__instalarClipboard('ok')`);
  await evalPage(`() => copiarModalParaWhatsApp()`, true);
  texto = await evalPage(`() => window.__copied`);
  ok(texto.includes('Responsável: (sem supervisor)') && !texto.includes('Supervisor em conflito'), 'WhatsApp do sem carteira nao fala em conflito');

  await evalPage(`() => {
    const card = [...document.querySelectorAll('.ecard')].find((e) => e.querySelector('.etitle')?.textContent === 'Máquina de Sorvete');
    card.click();
    const el = document.getElementById('modalFiltroProblema');
    el.value = 'zzznadaencontrada';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('modalFiltroPrioridade').value = 'SOS';
    document.getElementById('modalFiltroPrioridade').dispatchEvent(new Event('change', { bubbles: true }));
  }`);
  info = await evalPage(`() => {
    const btn = document.getElementById('modalCopiar');
    return { n: MODAL_FILTRADOS.length, disabled: btn.disabled, texto: btn.textContent.trim() };
  }`);
  ok(info.n === 0 && info.disabled === true, 'lista vazia desabilita o botao');
  ok(info.texto === 'Copiar para WhatsApp', 'rotulo permanece com a lista vazia');
  await shot('backlog-modal-vazio.png');
  await evalPage(`() => { window.__instalarClipboard('ok'); window.__copied = 'nao-deve-mudar'; window.__clipCalls = 0; }`);
  const vazio = await evalPage(`() => copiarModalParaWhatsApp()`, true);
  estado = await evalPage(`() => ({
    t: document.getElementById('modalCopiar').textContent,
    calls: window.__clipCalls,
    copied: window.__copied,
    fb: document.getElementById('modalCopiaFallback').hidden,
  })`);
  ok(vazio === false && estado.t === 'Nada para copiar' && estado.calls === 0 && estado.copied === 'nao-deve-mudar' && estado.fb === true, 'vazio nao copia e avisa Nada para copiar');

  await evalPage(`() => { document.getElementById('modalFiltroLimpar').click(); window.__instalarClipboard('falha'); }`);
  copiou = await evalPage(`() => copiarModalParaWhatsApp()`, true);
  estado = await evalPage(`() => {
    const ta = document.getElementById('modalCopiaFallbackTexto');
    return {
      t: document.getElementById('modalCopiar').textContent,
      classeOk: document.getElementById('modalCopiar').classList.contains('ok'),
      classeErro: document.getElementById('modalCopiar').classList.contains('erro'),
      hidden: document.getElementById('modalCopiaFallback').hidden,
      valor: ta.value,
      focado: document.activeElement === ta,
      status: document.getElementById('modalCopiaStatus').textContent,
    };
  }`);
  ok(copiou === false, 'falha de clipboard devolve false');
  ok(estado.t === 'Não consegui copiar' && estado.classeOk === false && estado.classeErro === true, 'erro honesto, sem Copiado!');
  ok(estado.hidden === false && estado.focado === true, 'fallback manual visivel e focado');
  ok(estado.valor.includes('*Máquina de Sorvete*') && (estado.valor.match(/^• /gm) || []).length === 85, 'textarea tem a lista inteira para copia manual');
  ok(!temHtml(estado.valor), 'fallback tambem e texto puro');
  ok(estado.status === 'Não consegui copiar', 'regiao aria anuncia a falha');
  await shot('backlog-modal-fallback.png');

  await evalPage(`() => { window.__instalarClipboard('exec'); navigator.clipboard.writeText = undefined; }`);
  copiou = await evalPage(`() => copiarModalParaWhatsApp()`, true);
  texto = await evalPage(`() => window.__copied`);
  estado = await evalPage(`() => ({
    t: document.getElementById('modalCopiar').textContent,
    hidden: document.getElementById('modalCopiaFallback').hidden,
  })`);
  ok(copiou === true && estado.t === 'Copiado!' && estado.hidden === true, 'execCommand ainda conclui a copia');
  ok(typeof texto === 'string' && texto.includes('85 de 85 chamados') && !temHtml(texto), 'execCommand copiou texto puro');

  await evalPage(`() => {
    abrirModalGenerico('Máquina <b>não</b>', 'subtítulo <i>com</i> acento', [{
      numero: 'WOT<b>9</b>',
      loja: 'LOJA &amp; ÁGUA',
      problema: 'PRINCÍPIO DE INCÊNDIO<br>segunda linha <b>HTML</b>',
      estado: 'Atribuído',
      prioridade: 'SOS',
      dias: 0,
      tecnico: 'José d\\u0027Ávila\\nsegundo turno',
      url: 'https://soma.zamp.com.br/wm_task.do?sysparm_query=number=WOT9&ok=1',
    }, {
      numero: '',
      loja: 'SEM LINK',
      problema: 'só unicode ç ã õ',
      estado: '',
      prioridade: '',
      dias: null,
      tecnico: '',
    }], { mostrarEquipamento: false });
  }`);
  await evalPage(`() => window.__instalarClipboard('ok')`);
  await evalPage(`() => copiarModalParaWhatsApp()`, true);
  texto = await evalPage(`() => window.__copied`);
  const marcado = await evalPage(`() => document.querySelector('#modalTbody').innerHTML`);
  ok(texto.startsWith('*Máquina não*'), 'titulo sem tags');
  ok(texto.includes('PRINCÍPIO DE INCÊNDIO') && texto.includes('segunda linha HTML') && texto.includes('\n'), 'preserva unicode e quebra de linha');
  ok(texto.includes('LOJA & ÁGUA'), 'entidade vira texto');
  ok(texto.includes('Atribuído') && texto.includes('SOS') && texto.includes('0d'), 'status, prioridade e dias');
  ok(texto.includes('Responsável: (sem supervisor)'), 'chamado fora da carteira nao ganha supervisor inventado');
  ok(texto.includes("Técnico: José d'Ávila") && texto.includes('segundo turno'), 'tecnico com acento e quebra, separado do supervisor');
  ok(!texto.includes("Responsável: José d'Ávila"), 'o tecnico nao aparece como responsavel');
  ok(texto.includes('https://soma.zamp.com.br/wm_task.do?sysparm_query=number=WOT9&ok=1'), 'usa a URL que ja veio no chamado');
  ok(!texto.includes('sysparm_query=number=&') && texto.includes('SEM LINK') && texto.includes('só unicode ç ã õ'), 'sem numero nao inventa URL');
  ok(!temHtml(texto) && !texto.includes('&amp;') && !texto.includes('<b>') && !texto.includes('<br'), 'nenhum HTML no texto injetado');
  ok(marcado.includes('&lt;b&gt;') && marcado.includes('&lt;br&gt;') && !marcado.includes('<b>') && !marcado.includes('<br'), 'a tabela continua escapando a marcacao');

  const equipamentos = await evalPage(`() => [...document.querySelectorAll('.ecard .etitle')].map((e) => e.textContent)`);
  ok(equipamentos.length >= 2, 'ha varios cards de equipamento (' + equipamentos.length + ')');
  for (const nome of equipamentos) {
    const r = await evalPage(`() => {
      const nome = ${JSON.stringify(nome)};
      const card = [...document.querySelectorAll('.ecard')].find((e) => e.querySelector('.etitle')?.textContent === nome);
      card.click();
      const texto = textoWhatsAppModal();
      const n = MODAL_FILTRADOS.length;
      const btn = document.getElementById('modalCopiar');
      return {
        titulo: document.getElementById('modalTitle').textContent,
        equip: MODAL_MOSTRA_EQUIP,
        hidden: document.getElementById('modalOverlay').hidden,
        rotulo: btn.textContent.trim(),
        disabled: btn.disabled,
        n,
        balas: (texto.match(/^• /gm) || []).length,
        html: /<\\/?[a-zA-Z][^>]*>/.test(texto),
        urlOk: n === 0 || texto.includes('https://soma.zamp.com.br/wm_task.do?sysparm_query=number='),
        tituloOk: texto.startsWith('*' + nome + '*'),
      };
    }`);
    ok(!r.hidden && r.titulo === nome && r.equip === false, 'card equipamento abre modal: ' + nome);
    ok(r.rotulo === 'Copiar para WhatsApp' && r.disabled === (r.n === 0), 'botao coerente em ' + nome);
    ok(r.balas === r.n && r.html === false && r.urlOk && r.tituloOk, 'texto completo sem HTML em ' + nome + ' (' + r.n + ')');
  }

  const supervisores = await evalPage(`() => [...document.querySelectorAll('.gcard .gname')].map((e) => e.textContent)`);
  ok(supervisores.length >= 1, 'ha cards de supervisor (' + supervisores.length + ')');
  for (const nome of supervisores) {
    const r = await evalPage(`() => {
      const nome = ${JSON.stringify(nome)};
      const card = [...document.querySelectorAll('.gcard')].find((e) => e.querySelector('.gname')?.textContent === nome);
      card.click();
      const texto = textoWhatsAppModal();
      const n = MODAL_FILTRADOS.length;
      const eqs = [...new Set(MODAL_FILTRADOS.map((c) => c.equipamento).filter(Boolean))];
      return {
        titulo: document.getElementById('modalTitle').textContent,
        equip: MODAL_MOSTRA_EQUIP,
        thead: document.getElementById('modalThead').textContent,
        n,
        balas: (texto.match(/^• /gm) || []).length,
        temEq: eqs.every((eq) => texto.includes('Equipamento: ' + eq)),
        html: /<\\/?[a-zA-Z][^>]*>/.test(texto),
        rotulo: document.getElementById('modalCopiar').textContent.trim(),
        disabled: document.getElementById('modalCopiar').disabled,
        tituloOk: texto.startsWith('*' + nome + '*'),
      };
    }`);
    ok(r.titulo === nome && r.equip === true && r.thead.includes('Equipamento'), 'card supervisor abre modal com equipamento: ' + nome);
    ok(r.rotulo === 'Copiar para WhatsApp' && r.disabled === (r.n === 0), 'botao no supervisor ' + nome);
    ok(r.balas === r.n && r.temEq && r.html === false && r.tituloOk, 'texto do supervisor inclui equipamento e a lista toda: ' + nome);
  }
  await shot('backlog-modal-supervisor.png');

  const busca = await evalPage(`() => {
    const b = document.getElementById('filtroCopiar');
    return { existe: !!b, texto: b ? b.textContent.trim() : '', modal: document.querySelectorAll('#modalCopiar').length };
  }`);
  ok(busca.existe && busca.texto === 'Copiar p/ WhatsApp' && busca.modal === 1, 'copia da busca geral permanece');

  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await evalPage(`() => {
    const card = [...document.querySelectorAll('.ecard')].find((e) => e.querySelector('.etitle')?.textContent === 'Máquina de Sorvete');
    card.click();
  }`);
  await sleep(250);
  const mobile = await evalPage(`() => {
    const btn = document.getElementById('modalCopiar');
    const close = document.getElementById('modalClose');
    const title = document.getElementById('modalTitle');
    const br = btn.getBoundingClientRect();
    const cr = close.getBoundingClientRect();
    const tr = title.getBoundingClientRect();
    const panel = document.querySelector('.modal-panel').getBoundingClientRect();
    const loja = document.getElementById('modalFiltroLoja').getBoundingClientRect();
    const prob = document.getElementById('modalFiltroProblema').getBoundingClientRect();
    const pri = document.getElementById('modalFiltroPrioridade').getBoundingClientRect();
    const resp = document.getElementById('modalFiltroResp').getBoundingClientRect();
    return {
      alt: br.height,
      largura: br.width,
      painel: panel.width,
      abaixoDoTitulo: br.top >= tr.bottom - 2,
      fecharNoTopo: cr.top <= tr.bottom && cr.right <= panel.right + 1 && cr.left > tr.left,
      dentro: br.left >= panel.left - 1 && br.right <= panel.right + 1,
      filtrosEmpilhados: prob.top >= loja.bottom - 2 && pri.top >= prob.bottom - 2 && resp.top >= pri.bottom - 2,
      priLargo: pri.width > panel.width * 0.8,
      respLargo: resp.width > panel.width * 0.8,
      rotulo: btn.textContent.trim(),
      labelResp: document.querySelector('label[for="modalFiltroResp"]').textContent,
    };
  }`);
  ok(mobile.alt >= 40, 'alvo de toque no celular (' + Math.round(mobile.alt) + 'px)');
  ok(mobile.largura > mobile.painel * 0.8 && mobile.dentro, 'botao ocupa a largura do modal no celular');
  ok(mobile.abaixoDoTitulo && mobile.fecharNoTopo, 'no celular o botao desce e o fechar fica no topo');
  ok(mobile.filtrosEmpilhados && mobile.priLargo && mobile.respLargo, 'prioridade e supervisor empilham em largura total no celular');
  ok(mobile.labelResp.includes('supervisor'), 'rotulo do supervisor continua visivel no celular');
  ok(mobile.rotulo === 'Copiar para WhatsApp', 'rotulo legivel no celular');
  await shot('backlog-modal-sorvete-mobile.png');

  await cdp('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
  await evalPage(`() => {
    document.documentElement.setAttribute('data-theme', 'dark');
    const card = [...document.querySelectorAll('.ecard')].find((e) => e.querySelector('.etitle')?.textContent === 'Máquina de Sorvete');
    card.click();
  }`);
  await shot('backlog-modal-sorvete-escuro.png');

  clearInterval(drenar);
  while (eventos.length) {
    const msg = eventos.shift();
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params?.exceptionDetails;
      logs.push('EXC ' + (d?.text || '') + ' ' + (d?.exception?.description || ''));
    }
  }
  const errosJs = logs.filter((l) => /EXC|TypeError|ReferenceError/i.test(l));
  ok(errosJs.length === 0, 'sem excecao de script durante o teste' + (errosJs.length ? ': ' + errosJs.join(' | ') : ''));
} finally {
  try { browserWs && browserWs.close(); } catch (e) {}
  try { chrome.kill('SIGKILL'); } catch (e) {}
  server.close();
}

console.log('\nResumo: ' + (falhas.length ? falhas.length + ' falha(s)' : 'tudo certo'));
if (falhas.length) console.error(falhas.join('\n'));
process.exit(falhas.length ? 1 : 0);
