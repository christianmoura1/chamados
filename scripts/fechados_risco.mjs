// Ultimos chamados de Gestao de Risco FECHADOS, para o painel risco.html.
//
// O que conta como "de risco": o MESMO assunto que o Power BI marca na tela de
// Risco Vencido / A Vencer. O BI so' lista os abertos, entao guardo o
// vocabulario de assuntos num arquivo que CRESCE a cada execucao
// (data/assuntos_risco.json) e caso os fechados do SOMA contra ele.
//
// Por que nao por prefixo (COI, SCI, AIN...): medido em 09/10, "AIN -" sozinho
// tem 205 fechados em 45 dias -- cozinha, estoque seco, refluxo -- e o BI conta
// so' 2 deles como risco. Prefixo encheria a lista de chamado comum.
//
// Se falhar, NAO derruba o pipeline: o painel sai sem o bloco.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/projetos/certponto-report/node_modules/playwright');
const fs = require('fs');

const REPO = 'C:/projetos/chamados';
const RISCO = REPO + '/data/risco.json';
const VOCAB = REPO + '/data/assuntos_risco.json';
const FONTE_BI = 'C:/projetos/climapro-bot/chamados_risco.json';
const QUANTOS = 10;
const DIAS = 45;

const log = (m) => console.log('[' + new Date().toLocaleTimeString('pt-BR') + '] fechados_risco: ' + m);

// Sem acento, maiusculo, espacos colapsados. O BI escreve "CONTIGENCIA" e o
// SOMA "CONTIGENCIA" com acento -- sem normalizar, nenhum casa.
const ACENTOS = new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g');
const norm = (s) => String(s || '')
  .normalize('NFD').replace(ACENTOS, '')
  .toUpperCase().replace(/\s+/g, ' ').trim();

function csv(txt) {
  const out = []; let linha = [], campo = '', aspas = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (aspas) { if (c === '"') { if (txt[i + 1] === '"') { campo += '"'; i++; } else aspas = false; } else campo += c; }
    else if (c === '"') aspas = true;
    else if (c === ',') { linha.push(campo); campo = ''; }
    else if (c === '\n') { linha.push(campo); out.push(linha); linha = []; campo = ''; }
    else if (c !== '\r') campo += c;
  }
  if (campo || linha.length) { linha.push(campo); out.push(linha); }
  return out;
}

const chave = (x) => {
  const m = String(x || '').match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
  return m ? Number(m[3] + m[2] + m[1] + m[4] + m[5] + m[6]) : null;
};
function diasEntre(de, ate) {
  const p = (x) => {
    const m = String(x || '').match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
    return m ? new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +m[6]) : null;
  };
  const a = p(de), b = p(ate);
  if (!a || !b) return null;
  return Math.max(0, Math.floor((b - a) / 86400000));
}

// ---------- vocabulario de assuntos de risco ----------
let vocab = [];
try { vocab = JSON.parse(fs.readFileSync(VOCAB, 'utf8')).assuntos || []; } catch (e) { vocab = []; }
const antes = vocab.length;
try {
  const bi = JSON.parse(fs.readFileSync(FONTE_BI, 'utf8'));
  for (const r of [...(bi.vencidos || []), ...(bi.aVencer || [])]) {
    const a = norm(r.assuntoSecundario);
    if (a && !vocab.includes(a)) vocab.push(a);
  }
} catch (e) { log('AVISO: nao li o chamados_risco.json do BI -- uso o vocabulario que ja tinha'); }
vocab.sort();
fs.writeFileSync(VOCAB, JSON.stringify({
  comentario: 'Assuntos que o Power BI marca como Gestao de Risco. Cresce sozinho a cada execucao; nada e removido automaticamente.',
  atualizadoEm: new Date().toISOString(),
  assuntos: vocab,
}, null, 1), 'utf8');
log('vocabulario: ' + vocab.length + ' assuntos (' + (vocab.length - antes) + ' novo(s))');
if (!vocab.length) { log('vocabulario vazio -- nao monto a lista'); process.exit(0); }

// ---------- fechados no SOMA ----------
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222', { timeout: 60000 });
const ctx = browser.contexts()[0];
for (const p of ctx.pages()) if (/wm_order_list\.do\?CSV/.test(p.url())) await p.close().catch(() => {});
const page = await ctx.newPage();
let lista = [];
try {
  await page.goto('https://soma.zamp.com.br/wm_order_list.do', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(1500);
  if (/login\.microsoftonline|Conta\/LogOn/i.test(page.url())) throw new Error('SOMA em tela de login');

  const CAMPOS = ['number', 'opened_at', 'closed_at', 'closed_by', 'priority',
    'u_bk_subcategory', 'opened_for.name'].join(',');
  const Q = 'opened_for.u_bk_work_center=CSUL^active=false'
    + '^closed_at>=javascript:gs.daysAgoStart(' + DIAS + ')^ORDERBYDESCclosed_at';
  const url = 'https://soma.zamp.com.br/wm_order_list.do?CSV&sysparm_display_value=true'
    + '&sysparm_fields=' + encodeURIComponent(CAMPOS) + '&sysparm_query=' + encodeURIComponent(Q);

  const r = await page.evaluate(async (u) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort('timeout'), 150000);
    const res = await fetch(u, { credentials: 'include', signal: ctrl.signal });
    clearTimeout(t);
    const by = new Uint8Array(await res.arrayBuffer());
    let bin = ''; for (let i = 0; i < by.length; i++) bin += String.fromCharCode(by[i]);
    return { s: res.status, ct: res.headers.get('content-type'), b64: btoa(bin) };
  }, url);
  if (r.s !== 200 || /text\/html/i.test(r.ct || '')) throw new Error('SOMA devolveu ' + r.s + ' / ' + r.ct);

  const L = csv(Buffer.from(r.b64, 'base64').toString('latin1'));
  const cab = L[0].map((x) => x.trim());
  const i = (n) => cab.indexOf(n);
  const iNum = i('number'), iAb = i('opened_at'), iFe = i('closed_at');
  const iPor = i('closed_by'), iPri = i('priority'), iSub = i('u_bk_subcategory'), iLoja = i('opened_for.name');

  const set = new Set(vocab);
  const fora = [];
  for (let k = 1; k < L.length; k++) {
    const numero = String(L[k][iNum] || '').trim();
    const fechadoEm = String(L[k][iFe] || '').trim();
    if (!numero || !fechadoEm) continue;
    const problema = String(L[k][iSub] || '').trim();
    if (!set.has(norm(problema))) continue;
    const prior = String(L[k][iPri] || '');
    fora.push({
      numero,
      fechadoEm,
      dias: diasEntre(String(L[k][iAb] || '').trim(), fechadoEm),
      prioridade: /cr[ií]tica/i.test(prior) ? 'SOS' : (/^2\s*-\s*alta/i.test(prior) ? 'Alta' : 'Normal'),
      problema,
      loja: String(L[k][iLoja] || '').trim(),
      fechadoPor: String(L[k][iPor] || '').trim(),
    });
  }
  fora.sort((a, b) => (chave(b.fechadoEm) || 0) - (chave(a.fechadoEm) || 0));
  lista = fora.slice(0, QUANTOS);
  log('fechados de risco encontrados: ' + fora.length + ' (mostro ' + lista.length + ')');
} finally {
  await page.close().catch(() => {});
}

// ---------- enriquece o risco.json sem tocar no resto ----------
const j = JSON.parse(fs.readFileSync(RISCO, 'utf8'));
j.ultimosFechados = lista;
fs.writeFileSync(RISCO, JSON.stringify(j, null, 1), 'utf8');
log('risco.json atualizado com ' + lista.length + ' chamados fechados');
process.exit(0);
