// Gera data/gestao-total.json: TODOS os chamados ABERTOS da Regional Sul,
// sem filtro de prioridade, para gestao completa. Atualizado diariamente as 03:00.
//
// Baseado no perda_sul.mjs mas sem descartar preventivas nem baixa/moderada.
// Inclui todos os campos necessarios para gestao: numero, loja, setor, supervisor,
// equipamento, problema, familia, prioridade, estado, fase, tecnico, dias, descricao.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/projetos/certponto-report/node_modules/playwright');
const fs = require('fs');
const { classifica, CRITICA } = require('./perda_familia.cjs');

const REPO = 'C:/projetos/chamados';
const DESTINO = REPO + '/data/gestao-total.json';
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
// active=true = tudo que nao esta encerrado nem cancelado. Sem filtro de prioridade.
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

const L = parseCSV(Buffer.from(r.b64, 'base64').toString('latin1')).filter((x) => x.length > 3);
const cab = L[0];
const brutos = L.slice(1).map((row) => Object.fromEntries(cab.map((k, i) => [k, (row[i] || '').trim()])));
log('total abertos no Sul (todo o periodo): ' + brutos.length);
if (!brutos.length) fatal('nenhum chamado retornado -- filtro ou sessao suspeitos');

// Mapa de supervisor por SETOR (igual ao perda_sul.mjs)
const DADOS_BACKLOG = REPO + '/data/dados.json';
const normSetor = (x) => String(x || '').toUpperCase().replace(/\s+/g, ' ').trim();
const mapaSup = {};
try {
const bl = JSON.parse(fs.readFileSync(DADOS_BACKLOG, 'utf8'));
for (const sup of (bl.supervisores || [])) {
for (const st of (sup.setores || [])) {
const k = normSetor(st);
if (k === 'GRANDE CURITIBA') { mapaSup[k] = 'CARLOS MAGNO'; continue; }
if (!mapaSup[k]) mapaSup[k] = sup.nome;
}
}
log('mapa de supervisor: ' + Object.keys(mapaSup).length + ' setor(es)');
} catch (e) {
log('ATENCAO: nao li o dados.json do Backlog (' + String(e.message).slice(0, 60) + ')');
}

const dias = (s) => {
const m = String(s || '').match(/^(\d{2})\/(\d{2})\/(\d{4})/);
if (!m) return null;
return Math.max(0, Math.round((Date.now() - new Date(+m[3], +m[2] - 1, +m[1]).getTime()) / 86400000));
};
const soData = (s) => { const m = String(s || '').match(/^(\d{2})\/(\d{2})\/(\d{4})/); return m ? m[3] + '-' + m[2] + '-' + m[1] : ''; };

// TODOS os chamados, sem filtro de prioridade ou categoria
const itens = brutos.map((c) => {
const f = classifica(c);
return {
chamado: c.number,
regional: 'SUL',
loja: (c['opened_for.name'] || '').replace(/^\s*\d{4,6}\s*-?\s*/, '').trim(),
bkn: ((c['opened_for.name'] || '').match(/(\d{4,6})/) || [])[1] || '',
setor: c['opened_for.u_bk_sector'] || '',
supervisor: mapaSup[normSetor(c['opened_for.u_bk_sector'])] || '',
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
descricao: c.short_description || '',
categoria: c.u_bk_category || '',
subcategory: c.u_bk_subcategory || '',
};
}).sort((a, b) => (b.critica - a.critica) || (b.dias - a.dias));

const porFam = {};
const porPri = {};
const porSup = {};
for (const i of itens) {
porFam[i.familia] = (porFam[i.familia] || 0) + 1;
porPri[i.prioridade] = (porPri[i.prioridade] || 0) + 1;
const sup = i.supervisor || 'SEM SUPERVISOR';
porSup[sup] = (porSup[sup] || 0) + 1;
}
log('familias: ' + JSON.stringify(porFam));
log('prioridades: ' + JSON.stringify(porPri));
log('supervisores: ' + JSON.stringify(porSup));
log('criticos (param a venda): ' + itens.filter((i) => i.critica).length);

const resultado = {
atualizadoEm: new Date().toISOString(),
totalChamados: itens.length,
resumo: { porFamilia: porFam, porPrioridade: porPri, porSupervisor: porSup },
chamados: itens,
};

fs.writeFileSync(DESTINO, JSON.stringify(resultado, null, 1), 'utf8');
log('gravado ' + DESTINO + ' com ' + itens.length + ' chamados');

const b = fs.readFileSync(DESTINO);
if (b[0] === 0xFF && b[1] === 0xFE) fatal('o arquivo saiu em UTF-16 -- alguem reintroduziu redirecionamento');
if (b[0] !== 0x7B) fatal('o arquivo nao comeca com "{" -- encoding suspeito');
log('encoding conferido: UTF-8, comeca com "{"');
} finally {
await page.close().catch(() => {});
}
process.exit(0);