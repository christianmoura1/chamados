// Gera data/chamados-abertos-perda.json: os chamados ABERTOS da Regional Sul
// que podem gerar perda de receita, de TODO o periodo, com o problema
// classificado por familia (camara fria, eletrica, gas...).
//
// Por que existe: o painel foi montado a mao em 06/10 com um recorte nacional de
// 5 dias e com equipamento/motivo vazios. O sul-blush e' SEMPRE so' o Sul.
//
// IMPORTANTE -- o Node grava o arquivo ele mesmo, em UTF-8. Nao redirecione a
// saida deste script para o JSON (`node perda_sul.mjs > arquivo.json`): o
// console do PowerShell passa os acentos pela pagina de codigo 850 e a
// redirecao grava em UTF-16. Foi exatamente assim que o painel quebrou duas
// vezes em 06/10.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/projetos/certponto-report/node_modules/playwright');
const fs = require('fs');
const { classifica, CRITICA } = require('./perda_familia.cjs');

const REPO = 'C:/projetos/chamados';
const DESTINO = REPO + '/data/chamados-abertos-perda.json';
const PERDA_BI = REPO + '/data/perda-bi.json';
const ts = () => new Date().toLocaleString('pt-BR');
const log = (m) => console.log('[' + ts() + '] ' + m);
const fatal = (m) => { console.error('[' + ts() + '] FATAL: ' + m); process.exit(1); };

function parseCSV(t) {
  const out = []; let campo = '', linha = [], aspas = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i], prox = t[i + 1];
    if (aspas) { if (c === '"' && prox === '"') { campo += '"'; i++; } else if (c === '"') aspas = false; else campo += c; }
    else if (c === '"') aspas = true;
    else if (c === ',') { linha.push(campo); campo = ''; }
    else if (c === '\r') continue;
    else if (c === '\n') { linha.push(campo); campo = ''; out.push(linha); linha = []; }
    else campo += c;
  }
  if (campo || linha.length) { linha.push(campo); out.push(linha); }
  return out;
}

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222', { timeout: 60000 });
const ctx = browser.contexts()[0];
// Fecha aba minha que tenha sobrado de execucao anterior. Uma aba travada
// impede o proprio connectOverCDP de completar o handshake nas proximas vezes.
for (const p of ctx.pages()) if (/wm_order_list\.do/.test(p.url())) await p.close().catch(() => {});
const page = await ctx.newPage();
try {
  await page.goto('https://soma.zamp.com.br/wm_order_list.do', { waitUntil: 'domcontentloaded', timeout: 40000 });
  await page.waitForTimeout(1500);
  if (/login\.microsoftonline|Conta\/LogOn/i.test(page.url())) fatal('SOMA em tela de login -- relogar pelo RDP');
  page.setDefaultTimeout(180000);
  log('aba do SOMA pronta');

  const CAMPOS = ['number', 'opened_at', 'state', 'u_bk_stage', 'priority',
    'opened_for.name', 'opened_for.u_bk_sector', 'u_bk_category', 'u_bk_subcategory',
    'short_description', 'assigned_to'].join(',');
  // active=true = tudo que nao esta encerrado nem cancelado. Sem piso de data,
  // porque o Christian pediu "todo o periodo".
  const Q = 'opened_for.u_bk_work_center=CSUL^active=true^ORDERBYDESCopened_at';
  const url = 'https://soma.zamp.com.br/wm_order_list.do?CSV&sysparm_display_value=true'
    + '&sysparm_fields=' + encodeURIComponent(CAMPOS) + '&sysparm_query=' + encodeURIComponent(Q);

  const r = await page.evaluate(async (u) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort('timeout'), 170000);
    const res = await fetch(u, { credentials: 'include', signal: ctrl.signal });
    clearTimeout(t);
    const buf = await res.arrayBuffer(); const by = new Uint8Array(buf);
    let bin = ''; for (let i = 0; i < by.length; i++) bin += String.fromCharCode(by[i]);
    return { s: res.status, ct: res.headers.get('content-type'), b64: btoa(bin) };
  }, url);
  if (r.s !== 200) fatal('SOMA respondeu status ' + r.s);
  if (!/text\/csv/i.test(r.ct || '')) fatal('content-type ' + r.ct + ' (provavel tela de login)');

  // latin1, nao utf8 -- o CSV classico do SOMA vem em latin1.
  const L = parseCSV(Buffer.from(r.b64, 'base64').toString('latin1')).filter((x) => x.length > 3);
  const cab = L[0];
  const brutos = L.slice(1).map((row) => Object.fromEntries(cab.map((k, i) => [k, (row[i] || '').trim()])));
  log('abertos no Sul (todo o periodo): ' + brutos.length);
  if (!brutos.length) fatal('nenhum chamado retornado -- filtro ou sessao suspeitos');

  // Preventiva nao perde receita: e' manutencao programada, a loja segue vendendo.
  const corretivos = brutos.filter((x) => !/preventiva/i.test(x.u_bk_category || ''));
  log('preventivas descartadas: ' + (brutos.length - corretivos.length) + '  -> corretivos: ' + corretivos.length);

  // Perda em R$ medida pelo Power BI, por chamado. Fica num arquivo separado de
  // proposito: o BI so' cobre uma janela curta, entao a maioria dos chamados
  // nao tem valor. Separado, da' para atualizar so' o BI sem refazer o resto.
  let perdaBI = {};
  if (fs.existsSync(PERDA_BI)) {
    try { perdaBI = JSON.parse(fs.readFileSync(PERDA_BI, 'utf8')).perdas || {}; }
    catch (e) { log('perda-bi.json ilegivel, sigo sem valores: ' + e.message); }
  } else { log('perda-bi.json nao existe ainda -- o painel sai sem R$'); }

  const dias = (s) => {
    const m = String(s || '').match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (!m) return null;
    return Math.max(0, Math.round((Date.now() - new Date(+m[3], +m[2] - 1, +m[1]).getTime()) / 86400000));
  };
  const soData = (s) => { const m = String(s || '').match(/^(\d{2})\/(\d{2})\/(\d{4})/); return m ? m[3] + '-' + m[2] + '-' + m[1] : ''; };

  const itens = corretivos.map((c) => {
    const f = classifica(c);
    const bi = perdaBI[c.number];
    return {
      chamado: c.number,
      regional: 'SUL',
      loja: (c['opened_for.name'] || '').replace(/^\s*\d{4,6}\s*-?\s*/, '').trim(),
      bkn: ((c['opened_for.name'] || '').match(/(\d{4,6})/) || [])[1] || '',
      setor: c['opened_for.u_bk_sector'] || '',
      equipamento: f.equipamento,
      problema: f.problema,
      familia: f.familia,
      critica: CRITICA.has(f.familia) ? 1 : 0,
      prioridade: c.priority || '',
      estado: c.state || '',
      fase: c.u_bk_stage || '',
      abertura: c.opened_at || '',
      data: soData(c.opened_at),
      dias: dias(c.opened_at),
      tecnico: c.assigned_to || '',
      perda: bi ? bi.perda : null,
      descricao: c.short_description || '',
      // mantido so' para o campo de busca antigo do painel nao quebrar
      motivo: f.familia,
    };
  }).sort((a, b) => (b.critica - a.critica) || ((b.perda || 0) - (a.perda || 0)) || (b.dias - a.dias));

  const porFam = {};
  for (const i of itens) porFam[i.familia] = (porFam[i.familia] || 0) + 1;
  log('familias: ' + JSON.stringify(porFam));
  log('criticos (param a venda): ' + itens.filter((i) => i.critica).length);
  log('com perda medida pelo BI: ' + itens.filter((i) => i.perda != null).length
    + '  somando R$ ' + itens.reduce((a, i) => a + (i.perda || 0), 0).toFixed(2));

  // UTF-8, escrito pelo Node. Nunca por redirecionamento do shell.
  fs.writeFileSync(DESTINO, JSON.stringify(itens, null, 1), 'utf8');
  log('gravado ' + DESTINO + ' com ' + itens.length + ' chamados');

  // guarda de encoding: se um dia alguem reintroduzir o `>`, o proprio script acusa
  const b = fs.readFileSync(DESTINO);
  if (b[0] === 0xFF && b[1] === 0xFE) fatal('o arquivo saiu em UTF-16 -- alguem reintroduziu redirecionamento');
  if (b[0] !== 0x5B) fatal('o arquivo nao comeca com "[" -- encoding suspeito');
  log('encoding conferido: UTF-8, comeca com "["');
} finally {
  await page.close().catch(() => {});
}
process.exit(0);
