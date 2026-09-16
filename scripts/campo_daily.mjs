import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/projetos/certponto-report/node_modules/playwright');
const fs = require('fs');

const REPO = 'C:/projetos/chamados';
const ts = () => new Date().toLocaleString('pt-BR');
const log = (m) => console.log('[' + ts() + '] ' + m);
const fatal = (m) => { console.error('[' + ts() + '] FATAL: ' + m); process.exit(1); };

const CAMPOS_WO = ['number', 'opened_at', 'priority', 'state', 'u_bk_stage', 'opened_for.name',
  'opened_for.u_bk_sector', 'opened_for.u_bk_organization', 'u_bk_category', 'u_bk_subcategory',
  'u_bk_asset_acronym', 'closed_at', 'short_description', 'assigned_to'].join(',');
const CAMPOS_WT = ['number', 'parent.number', 'u_bk_stage_string', 'approval',
  'u_fsm_closed_at_no_token', 'u_bk_contact_attempt_history', 'assigned_to', 'state'].join(',');

function parseCSV(texto) {
  const linhas = [];
  let campo = '', linha = [], aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i], prox = texto[i + 1];
    if (aspas) {
      if (c === '"' && prox === '"') { campo += '"'; i++; }
      else if (c === '"') aspas = false;
      else campo += c;
    } else {
      if (c === '"') aspas = true;
      else if (c === ',') { linha.push(campo); campo = ''; }
      else if (c === '\r') { continue; }
      else if (c === '\n') { linha.push(campo); campo = ''; linhas.push(linha); linha = []; }
      else campo += c;
    }
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas;
}

function objetos(csv) {
  const l = parseCSV(csv).filter((x) => x.length > 1);
  if (!l.length) return [];
  const h = l[0];
  return l.slice(1).map((r) => Object.fromEntries(h.map((k, i) => [k, r[i] || ''])));
}

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222', { timeout: 15000 });
const ctx = browser.contexts()[0];
for (const p of ctx.pages()) if (/soma\.zamp\.com\.br/.test(p.url())) await p.close().catch(() => {});
const page = await ctx.newPage();
await page.goto('https://soma.zamp.com.br/wm_task_list.do', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(1500);
if (/login\.microsoftonline|Conta\/LogOn/i.test(page.url())) fatal('SOMA em tela de login -- relogar pelo RDP');
page.setDefaultTimeout(110000);
log('aba do SOMA pronta');

async function baixaCSV(tabela, campos, query) {
  const url = 'https://soma.zamp.com.br/' + tabela + '_list.do?CSV&sysparm_display_value=true'
    + '&sysparm_fields=' + encodeURIComponent(campos)
    + '&sysparm_query=' + encodeURIComponent(query);
  const r = await page.evaluate(async (u) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort('timeout'), 90000);
    const res = await fetch(u, { credentials: 'include', signal: ctrl.signal });
    clearTimeout(t);
    const buf = await res.arrayBuffer();
    const b = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < b.length; i++) bin += String.fromCharCode(b[i]);
    return { status: res.status, ct: res.headers.get('content-type'), n: b.length, b64: btoa(bin) };
  }, url);
  if (r.status !== 200) fatal(tabela + ' respondeu status ' + r.status);
  if (!/text\/csv/i.test(r.ct || '')) fatal(tabela + ': content-type ' + r.ct + ' (provavel tela de login)');
  return Buffer.from(r.b64, 'base64').toString('latin1');
}

// daysAgoStart(N) volta ate a MEIA-NOITE de N dias atras. Com N=3 vinham 4 dias
// corridos (13,14,15,16) e a lista ficava maior que a tela de campo do Christian.
// N=2 = hoje + os 2 dias anteriores = a janela de 3 dias que ele usa.
const qWO = 'opened_for.u_bk_work_center=CSUL^priority=1^opened_at>=javascript:gs.daysAgoStart(2)^ORDERBYDESCopened_at';
const ordens = objetos(await baixaCSV('wm_order', CAMPOS_WO, qWO));
log('ordens criticas (3 dias, SUL): ' + ordens.length);
if (!ordens.length) fatal('nenhuma ordem retornada -- filtro ou sessao suspeitos');

const nums = ordens.map((o) => o.number).filter(Boolean);
const tarefas = objetos(await baixaCSV('wm_task', CAMPOS_WT, 'parent.numberIN' + nums.join(',')));
log('tarefas filhas: ' + tarefas.length);

const porOrdem = {};
for (const t of tarefas) {
  const k = t['parent.number'];
  if (!k) continue;
  if (!porOrdem[k]) porOrdem[k] = [];
  porOrdem[k].push(t);
}

function bucket(estado) {
  if (/cancelad/i.test(estado)) return 'cancelado';
  if (/encerrad|closed|fechad/i.test(estado)) return 'executado';
  return 'execucao';
}

const itens = ordens.map((o) => {
  const filhas = porOrdem[o.number] || [];
  const fases = filhas.map((t) => t.u_bk_stage_string).filter(Boolean);
  const aguardando = filhas.some((t) => /token/i.test(t.u_bk_stage_string || '')
    || /aguardando|requested/i.test(t.approval || ''));
  const semToken = filhas.map((t) => t.u_fsm_closed_at_no_token).filter(Boolean);
  const contatos = filhas.map((t) => t.u_bk_contact_attempt_history).filter(Boolean);
  return {
    numero: o.number,
    marca: /burgerking/i.test(o['opened_for.u_bk_organization'] || '') ? 'BKB' : (o['opened_for.u_bk_organization'] || ''),
    regional: 'SUL',
    setor: o['opened_for.u_bk_sector'] || '',
    loja: o['opened_for.name'] || '',
    status: o.state || '',
    fase: fases[0] || o.u_bk_stage || '',
    abertura: o.opened_at || '',
    fechamento: o.closed_at || '',
    principal: o.u_bk_category || '',
    secundario: o.u_bk_subcategory || '',
    sigla: o.u_bk_asset_acronym || '',
    tecnico: o.assigned_to || '',
    descricao: o.short_description || '',
    tarefas: filhas.map((t) => t.number),
    aguardandoToken: aguardando ? 1 : 0,
    fechadoSemToken: semToken[0] || '',
    contato: contatos[0] || '',
    grupo: bucket(o.state || ''),
  };
});

// O Christian nao quer concluidos em lugar nenhum -- nem na tabela, nem contados
// nos cards. Saem aqui, na origem, para que o painel reflita so' o que esta vivo.
const encerrados = itens.filter((i) => i.grupo !== 'execucao').length;
const abertos = itens.filter((i) => i.grupo === 'execucao');
log('descartados por ja estarem encerrados/cancelados: ' + encerrados);

const resumo = {
  emExecucao: abertos.length,
  executados: 0,
  cancelados: 0,
  aguardandoToken: abertos.filter((i) => i.aguardandoToken).length,
  total: abertos.length,
};
log('resumo: ' + JSON.stringify(resumo));

// Roda a cada 20 min. Se eu gravasse sempre, o `atualizadoEm` mudaria em toda
// execucao e cada ciclo viraria um commit + um deploy na Vercel (72/dia, contra
// um limite de 100). Entao so' grava quando os chamados de fato mudam; o codigo
// de saida 9 avisa a tarefa que nao ha nada para publicar.
const DESTINO = REPO + '/data/campo.json';
const miolo = JSON.stringify({ resumo, itens: abertos });
let anterior = null;
if (fs.existsSync(DESTINO)) {
  try {
    const j = JSON.parse(fs.readFileSync(DESTINO, 'utf8'));
    anterior = JSON.stringify({ resumo: j.resumo, itens: j.itens });
  } catch (e) { log('campo.json anterior ilegivel, vou regravar: ' + e.message); }
}
if (anterior === miolo) {
  log('sem mudanca nos chamados -- nao gravei e nao vou publicar');
  await browser.close().catch(() => {});
  process.exit(9);
}

fs.writeFileSync(DESTINO, JSON.stringify({
  atualizadoEm: new Date().toISOString(),
  janelaDias: 3,
  resumo,
  itens: abertos,
}, null, 1), 'utf8');
log('campo.json gravado com ' + abertos.length + ' chamados em aberto (houve mudanca)');

const est = {};
for (const i of abertos) est[i.status] = (est[i.status] || 0) + 1;
log('estados: ' + JSON.stringify(est));
const fss = {};
for (const i of abertos) if (i.fase) fss[i.fase] = (fss[i.fase] || 0) + 1;
log('fases: ' + JSON.stringify(fss));

await browser.close().catch(() => {});
process.exit(0);
