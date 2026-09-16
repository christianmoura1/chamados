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

// ---------- historico de 14 dias: abertos x fechados ----------
// Duas consultas separadas de proposito: um chamado aberto ha 8 dias e fechado
// hoje precisa contar no FECHADO de hoje, e ele nao aparece na janela de abertura.
// Buscar os 14 dias inteiros (em vez de ir acumulando um ponto por dia) faz o
// grafico ja nascer completo e se auto-corrigir a cada ciclo.
const BASE_SUL = 'opened_for.u_bk_work_center=CSUL^priority=1';
const JANELA_HIST = 13; // 13 dias atras + hoje = 14 dias
const soData = (s) => {
  const m = String(s || '').match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? m[3] + '-' + m[2] + '-' + m[1] : null;
};

const histAbertos = objetos(await baixaCSV('wm_order', 'number,opened_at',
  BASE_SUL + '^opened_at>=javascript:gs.daysAgoStart(' + JANELA_HIST + ')'));
const histFechados = objetos(await baixaCSV('wm_order', 'number,closed_at',
  BASE_SUL + '^closed_at>=javascript:gs.daysAgoStart(' + JANELA_HIST + ')'));
log('historico: ' + histAbertos.length + ' aberturas e ' + histFechados.length + ' fechamentos em 14 dias');

const porDia = {};
const garante = (d) => { if (!porDia[d]) porDia[d] = { data: d, abertos: 0, fechados: 0 }; return porDia[d]; };
for (const r of histAbertos) { const d = soData(r.opened_at); if (d) garante(d).abertos++; }
for (const r of histFechados) { const d = soData(r.closed_at); if (d) garante(d).fechados++; }

// preenche os dias sem movimento, senao o grafico fica com buracos
const hoje = new Date();
const serie = [];
for (let k = JANELA_HIST; k >= 0; k--) {
  const d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - k);
  const chave = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  serie.push(porDia[chave] || { data: chave, abertos: 0, fechados: 0 });
}
const somaAb = serie.reduce((s, x) => s + x.abertos, 0);
const somaFe = serie.reduce((s, x) => s + x.fechados, 0);
log('serie de 14 dias: ' + somaAb + ' abertos x ' + somaFe + ' fechados (saldo ' + (somaAb - somaFe) + ')');

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
const miolo = JSON.stringify({ resumo, itens: abertos, serie });
let anterior = null;
if (fs.existsSync(DESTINO)) {
  try {
    const j = JSON.parse(fs.readFileSync(DESTINO, 'utf8'));
    anterior = JSON.stringify({ resumo: j.resumo, itens: j.itens, serie: j.serie });
  } catch (e) { log('campo.json anterior ilegivel, vou regravar: ' + e.message); }
}
// Nada mudou = nao publica. Mas o WhatsApp roda mesmo assim, porque a primeira
// carga precisa sair mesmo que o JSON ja esteja igual ao da execucao anterior.
const semMudanca = (anterior === miolo);
if (semMudanca) log('sem mudanca nos chamados -- nao vou publicar (o aviso de WhatsApp ainda e avaliado)');

if (!semMudanca) {
  fs.writeFileSync(DESTINO, JSON.stringify({
    atualizadoEm: new Date().toISOString(),
    janelaDias: 3,
    resumo,
    serie,
    itens: abertos,
  }, null, 1), 'utf8');
  log('campo.json gravado com ' + abertos.length + ' chamados em aberto (houve mudanca)');
}

// ---------- WhatsApp: primeira vez a lista toda, depois so' os novos ----------
// O estado fica FORA do repo, para nao virar commit a cada 20 min.
const ESTADO = 'C:/projetos/climapro-bot/campo_notificados.json';
const UAZAPI_URL = process.env.UAZAPI_URL;
const UAZAPI_TOKEN = process.env.UAZAPI_TOKEN;
const DEST = process.env.CAMPO_DEST_NUMBER || process.env.MORDOMO_OWNER_NUMBER || '5541992572743';

function tempoAberto(s) {
  const m = String(s || '').match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/);
  if (!m) return '';
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4]), Number(m[5]));
  const min = Math.max(0, Math.floor((Date.now() - d.getTime()) / 60000));
  if (min < 60) return min + 'min';
  const h = Math.floor(min / 60), r = min % 60;
  if (h < 24) return r ? h + 'h' + r : h + 'h';
  return Math.floor(h / 24) + 'd' + (h % 24) + 'h';
}

let jaAvisados = null;
if (fs.existsSync(ESTADO)) {
  try { jaAvisados = JSON.parse(fs.readFileSync(ESTADO, 'utf8')); }
  catch (e) { log('estado de notificacao ilegivel: ' + e.message); }
}
const primeiraVez = !jaAvisados || !Array.isArray(jaAvisados.numeros);
const conhecidos = new Set(primeiraVez ? [] : jaAvisados.numeros.map((x) => x.numero));
const novos = abertos.filter((i) => !conhecidos.has(i.numero));

function monta(lista, ehPrimeira) {
  const cab = ehPrimeira
    ? '*CHAMADOS CRITICOS - SUL*\n_lista inicial - ' + lista.length + ' em aberto_\n'
    : '*NOVO CHAMADO CRITICO - SUL*' + (lista.length > 1 ? ' (' + lista.length + ')' : '') + '\n';
  const corpo = lista.map((i) => {
    const desc = (i.secundario || i.descricao || '').trim();
    return '\n*' + i.numero + '* - ' + i.loja
      + '\n' + (i.principal || '-') + ' | ' + desc
      + '\n_' + i.setor + ' - aberto ha ' + tempoAberto(i.abertura) + '_\n';
  }).join('');
  return cab + corpo;
}

async function enviar(texto) {
  if (!UAZAPI_URL || !UAZAPI_TOKEN) { log('UAZAPI nao configurada -- pulei o WhatsApp'); return false; }
  try {
    const r = await fetch(UAZAPI_URL + '/send/text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', token: UAZAPI_TOKEN },
      body: JSON.stringify({ number: DEST, text: texto }),
    });
    log('WhatsApp status ' + r.status + ' para ' + DEST);
    return r.ok;
  } catch (e) { log('WhatsApp falhou: ' + e.message); return false; }
}

if (novos.length === 0) {
  log('nenhum chamado novo -- nao mandei WhatsApp');
} else {
  // Em lotes de 8 para a mensagem nao ficar gigante na primeira carga.
  let enviouTudo = true;
  for (let i = 0; i < novos.length; i += 8) {
    const lote = novos.slice(i, i + 8);
    const ok = await enviar(monta(lote, primeiraVez));
    if (!ok) { enviouTudo = false; break; }
  }
  if (enviouTudo) {
    // So' marca como avisado o que realmente saiu, para nao perder chamado.
    const agora = new Date().toISOString();
    const lista = (primeiraVez ? [] : jaAvisados.numeros).concat(novos.map((i) => ({ numero: i.numero, em: agora })));
    // poda o que ja passou de 10 dias, para o arquivo nao crescer para sempre
    const corte = Date.now() - 10 * 86400000;
    const podada = lista.filter((x) => new Date(x.em).getTime() >= corte);
    fs.writeFileSync(ESTADO, JSON.stringify({ atualizadoEm: agora, numeros: podada }, null, 1), 'utf8');
    log('avisados ' + novos.length + ' chamado(s) novo(s); estado com ' + podada.length + ' numeros');
  } else {
    log('envio falhou -- NAO marquei como avisado, tenta de novo no proximo ciclo');
  }
}

const est = {};
for (const i of abertos) est[i.status] = (est[i.status] || 0) + 1;
log('estados: ' + JSON.stringify(est));
const fss = {};
for (const i of abertos) if (i.fase) fss[i.fase] = (fss[i.fase] || 0) + 1;
log('fases: ' + JSON.stringify(fss));

await browser.close().catch(() => {});
// 9 = nada novo para publicar; a tarefa agendada so' commita quando o codigo e' 0
process.exit(semMudanca ? 9 : 0);
