// Atualiza a aba "Evolucao" do painel sorvete.html a partir da foto mais
// recente do SOMA. Roda NA VPS, sem Excel e sem o PC do Christian.
//
// O corte e' 23:59:59 de cada dia, nao a hora em que a foto saiu: a foto traz
// opened_at E closed_at de 180 dias, entao o estoque em qualquer instante T e'
// "aberto ate T e ainda nao fechado em T". Uma foto reconstroi o historico
// inteiro -- os arquivos datados em fotos\ sao so' arquivo morto, porque
// chamado com mais de 180 dias sai da consulta do SOMA.
//
// NAO mexe nas outras abas do sorvete.json: elas vem da planilha que o
// Christian edita, e regerar por cima apagaria o trabalho dele.
const fs = require('fs');
const path = require('path');

const BASE = 'C:/projetos/sorvete';
const DESTINO = 'C:/projetos/chamados/data/sorvete.json';
const DIAS = Number(process.argv[2] || 14);

const SOS  = ['NÃO FUNCIONAM OS DOIS LADOS','MÁQUINA CONGELADA','NÃO LIGA','ERRO NA PASTEURIZA','PRINCÍPIO DE INCÊNDIO','RESERVATÓRIO DOS DOIS LADOS'];
const ALTO = ['NÃO FUNCIONA 1 LADO'];
const PARADA5 = ['NÃO LIGA','MÁQUINA CONGELADA','RESERVATÓRIO DOS DOIS LADOS','NÃO FUNCIONAM OS DOIS LADOS','PRINCÍPIO DE INCÊNDIO'];
const flag = (s) => { s = (s||'').toUpperCase();
  if (SOS.some((p)=>s.includes(p))) return 'SOS';
  if (ALTO.some((p)=>s.includes(p))) return 'ALTO'; return ''; };
const eh5 = (s) => PARADA5.some((p)=>(s||'').toUpperCase().includes(p));
const chave = (x) => {
  const m = String(x || '').match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
  return m ? Number(m[3]+m[2]+m[1]+m[4]+m[5]+m[6]) : null;
};

// --- entradas ---
const UNI = JSON.parse(fs.readFileSync(path.join(BASE, 'unidades.json'), 'utf8'));
const dirFotos = path.join(BASE, 'fotos');
const fotos = fs.readdirSync(dirFotos).filter((f)=>/^soma_sorvete_\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
if (!fotos.length) { console.log('FATAL: nenhuma foto em ' + dirFotos); process.exit(1); }
const arqFoto = path.join(dirFotos, fotos[fotos.length-1]);
const SNAP = JSON.parse(fs.readFileSync(arqFoto, 'utf8'));
console.log('foto usada: ' + fotos[fotos.length-1] + '  (' + SNAP.chamados.length + ' chamados)');

const porBkn = new Map();
for (const u of UNI) { if (!porBkn.has(u.bkn)) porBkn.set(u.bkn, []); porBkn.get(u.bkn).push(u); }
const stBkn = (b) => { const us = porBkn.get(b); if (!us) return null;
  if (us.some((u)=>u.status==='CONSISTENTEMENTE INOPERANTE')) return 'CONSISTENTEMENTE INOPERANTE';
  if (us.some((u)=>u.status==='RECÉM INOPERANTE')) return 'RECÉM INOPERANTE'; return 'OPERANDO'; };
const regDe = (b) => { const us = porBkn.get(b); return us ? us[0].regional : null; };
const bknDe = (n) => { const m = (n||'').match(/(\d{4,6})/); return m ? m[1] : ''; };

// Exclusoes: chamados que nao entram na conta, com motivo registrado em
// exclusoes.json. Fica fora da formula de proposito -- numero ajustado na
// formula some de vista e contamina o total sem rastro.
let EXCL = { chamados: [] };
const arqExcl = path.join(BASE, 'exclusoes.json');
if (fs.existsSync(arqExcl)) { EXCL = JSON.parse(fs.readFileSync(arqExcl, 'utf8')); }
const excluidos = new Map((EXCL.chamados || []).map((x) => [x.numero, x]));

const base = [];
const tirados = [];
// BUG CORRIGIDO 13/10/2026 (iteracao 2): a contagem da Evolucao usava
// apenas a funcao flag() (texto do problema) para classificar SOS/ALTO,
// sem verificar a PRIORIDADE NUMERICA do SOMA. Isso fazia chamados
// "4 - Baixa" ou "3 - Moderada" com problema critico no texto (ex:
// "NAO LIGA" mas prioridade Baixa) serem contados na Evolucao,
// inflando os numeros. Divergencia confirmada: MINAS BAHIA +3, NE +1.
// CORRECAO: alem do flag() e do state check, exigir que a prioridade
// numerica seja 1-Critica ou 2-Alta. Chamados 3-Moderada e 4-Baixa
// nao param a venda de forma significativa e nao devem contar.
const FECHADOS_STATE = /^(Encerrad|Cancelad|Closed|Conclu[íi]do)/i;
const ehCriticoAlto = (p) => /^1\s*-|^2\s*-/.test((p||'').trim());
for (const c of SNAP.chamados) {
  const f = flag(c.u_bk_subcategory); if (!f) continue;
  const bkn = bknDe(c['opened_for.name']); const r = regDe(bkn); if (!r) continue;
  if (excluidos.has(c.number)) {
    const e = excluidos.get(c.number);
    const aindaAberto = !FECHADOS_STATE.test(c.state || '');
    tirados.push({ numero: c.number, reg: r, motivo: e.motivo, aindaAberto, estado: c.state });
    continue;
  }
  // Se o state na foto diz que esta fechado/cancelado, nao conta.
  if (FECHADOS_STATE.test(c.state || '')) continue;
  // BUG FIX: so' conta se a prioridade for Critica (1) ou Alta (2).
  // Baixa (4) e Moderada (3) nao geram perda de receita significativa.
  if (!ehCriticoAlto(c.priority)) continue;
  base.push({ f, bkn, reg:r, ab:chave(c.opened_at), fe:chave(c.closed_at), cinco:eh5(c.u_bk_subcategory) });
}
if (tirados.length) {
  console.log('EXCLUIDOS da contagem: ' + tirados.length);
  for (const t of tirados) {
    console.log('  ' + t.numero + '  ' + t.reg + '  ' + (t.aindaAberto ? 'AINDA ABERTO' : 'ja fechado/cancelado -- pode sair da lista')
      + '  (' + t.estado + ')');
  }
}

// --- dias completos: do mais antigo ate ONTEM (hoje ainda nao fechou) ---
// Qual e' o ULTIMO DIA FECHADO. A tarefa roda as 23:59, e nessa hora o dia
// corrente ja acabou na pratica; em qualquer outra hora o ultimo dia completo
// e' ontem. Sem isso a execucao das 23:59 ficaria sempre um dia atrasada.
// Da' para forcar passando a data: painel_sorvete.cjs 2026-10-08
const agora = new Date();
const ate = (process.argv[2] && /^\d{4}-\d{2}-\d{2}$/.test(process.argv[2]))
  ? new Date(process.argv[2] + 'T12:00:00')
  : (agora.getHours() >= 23 ? agora : new Date(agora.getTime() - 86400000));

// toISOString() converte para UTC e, num fuso negativo, devolve o dia anterior.
// Monto a data a partir das partes LOCAIS.
const iso = (d) => d.getFullYear() + '-'
  + String(d.getMonth() + 1).padStart(2, '0') + '-'
  + String(d.getDate()).padStart(2, '0');

// A serie comeca no dia 1 do mes do ultimo dia fechado -- pedido do Christian
// (09/10). Quando o mes vira, ela recomeca sozinha, e a "Variacao MES" passa a
// comparar com o novo dia 1.
const listaDias = [];
for (let d = new Date(ate.getFullYear(), ate.getMonth(), 1); d <= ate; d = new Date(d.getTime() + 86400000)) {
  listaDias.push(iso(d));
}
const REGS = [...new Set(UNI.map((u)=>u.regional))];

function doDia(iso) {
  const T = Number(iso.replace(/-/g,'') + '235959');
  const T0 = Number(iso.replace(/-/g,'') + '000000');
  const t = {}; for (const r of REGS) t[r] = { sos:0, alto:0, prov:0, par:0, res:0, nov:0, lojas:new Set() };
  let algum = false;
  for (const x of base) {
    const g = t[x.reg];
    if (x.ab !== null && x.ab <= T && (x.fe === null || x.fe > T)) {
      algum = true;
      if (x.f === 'SOS') g.sos++; else g.alto++;
      g.lojas.add(x.bkn);
      if (stBkn(x.bkn) === 'OPERANDO' && x.cinco) g.prov++;
    }
    if (x.fe !== null && x.fe >= T0 && x.fe <= T) g.res++;
    if (x.ab !== null && x.ab >= T0 && x.ab <= T) g.nov++;
  }
  for (const r of REGS) { const g = t[r]; for (const b of g.lojas) if (stBkn(b) !== 'OPERANDO') g.par++; }
  return algum ? t : null;
}

const dias = [];
for (const iso of listaDias) {
  const t = doDia(iso);
  if (t) dias.push({ iso, rot: iso.slice(8,10) + '/' + iso.slice(5,7), t });
}
if (!dias.length) { console.log('FATAL: nenhum dia com dado'); process.exit(1); }
console.log('dias calculados: ' + dias.map((d)=>d.rot).join(', '));

// --- monta a aba ---
const soma = (d, k) => REGS.reduce((s,r)=>s + (k==='tot' ? d.t[r].sos + d.t[r].alto : d.t[r][k]), 0);
const ult = dias[dias.length-1];
const ord = [...REGS].sort((a,b)=>(ult.t[b].sos+ult.t[b].alto)-(ult.t[a].sos+ult.t[a].alto));

// Variacao e' SEMPRE entre os DOIS ULTIMOS dias, nao entre o primeiro e o
// ultimo da serie: o que interessa e' o que mudou de ontem para hoje. Pedido
// do Christian em 09/10/2026.
const ante = dias.length > 1 ? dias[dias.length-2] : null;
const variacao = (a, b) => (ante === null ? '' : a - b);

// DIA  = ultimo dia contra o anterior.
// MES  = ultimo dia contra o dia 1 do mes, que e' a primeira coluna da serie.
const primeiro = dias[0];
const varMes = (v) => (dias.length > 1 ? v[v.length-1] - v[0] : '');

const cab = ['Regional', ...dias.map((d)=>d.rot), 'Variação DIA', 'Variação MÊS'];
const linhas = [];
for (const r of ord) {
  const vals = dias.map((d)=>d.t[r].sos + d.t[r].alto);
  linhas.push([r, ...vals, variacao(vals[vals.length-1], vals[vals.length-2]), varMes(vals)]);
}
const totais = dias.map((d)=>soma(d,'tot'));
linhas.push(['TOTAL BRASIL', ...totais,
  variacao(totais[totais.length-1], totais[totais.length-2]), varMes(totais)]);

// Bloco de resumo embaixo da tabela. Tirei em 09/10 por ter lido mal um
// pedido; ele faz falta e voltou. O Christian esconde no Excel as linhas que
// nao usa -- esconder e' decisao dele, nao minha.
linhas.push(['', ...dias.map(()=>''), '', '']);
linhas.push(['Fechados no dia', ...dias.map((d)=>soma(d,'res')), '', '']);
linhas.push(['Abertos no dia', ...dias.map((d)=>soma(d,'nov')), '', '']);
// Saldo = abertos MENOS fechados, para ter o MESMO sinal da coluna Variacao:
// negativo quer dizer que o estoque caiu, nos dois lugares. Estava invertido
// e o Christian tropecou nisso em 09/10 -- dois numeros do mesmo fato com
// sinais opostos, um debaixo do outro.
linhas.push(['Saldo do dia (abertos − fechados)', ...dias.map((d)=>soma(d,'nov') - soma(d,'res')), '', '']);
linhas.push(['Lojas 100% paradas', ...dias.map((d)=>soma(d,'par')), '', '']);

const aba = {
  // O Christian pediu o titulo limpo (09/10). A trilha das exclusoes fica em
  // exclusoes.json, no commit e no log do pipeline -- que e' onde auditoria
  // pertence. O que eu nao faco e' esconder o corte DENTRO da formula.
  titulo: 'Evolução — chamados SOS e ALTO abertos, situação às 23:59 de cada dia'
        + ' · último dia fechado: ' + ult.rot
        + (ante ? ' · variação ' + ante.rot + ' → ' + ult.rot : ''),
  cab,
  linhas,
};

// --- grava sem destruir as outras abas ---
const alvo = JSON.parse(fs.readFileSync(DESTINO, 'utf8'));
alvo.abas = alvo.abas || {};
alvo.abas['Evolução'] = aba;
alvo.evolucaoAtualizadaEm = new Date().toISOString();
alvo.ultimoDiaFechado = ult.iso;
fs.writeFileSync(DESTINO, JSON.stringify(alvo), 'utf8');
console.log('gravado: ' + DESTINO);
console.log('abas agora: ' + Object.keys(alvo.abas).join(' | '));
console.log('ultimo dia fechado: ' + ult.rot + '  total abertos: ' + totais[totais.length-1]);
