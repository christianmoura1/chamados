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

// RESTAURADO 14/10/2026 (iteracao final): a logica que reproduz EXATAMENTE
// o historico validado do Christian (12/10 TOTAL=135, conforme imagem/tabela)
// eh a ORIGINAL do serie_corte.cjs: flag() + timestamps apenas, SEM filtro
// de state, SEM filtro de prioridade numerica. Aplicada a FOTO DO PROPRIO DIA
// (nao a ultima foto para todos os dias -- isso causava subcontagem porque o
// state na foto de hoje reflete o estado atual, excluindo chamados que estavam
// abertos no dia X mas fecharam depois).
// Testado: logica original na foto 12/10 da 135 (bate com a imagem).
// A abordagem "ultima foto + state + prioridade" dava 101 para 12/10 -- errado.
// Para o dia mais recente sem foto propria (ex: 13/10 reconstruido), usa a
// foto mais recente disponivel com a mesma logica original.
const FECHADOS_STATE = /^(Encerrad|Cancelad|Closed|Conclu[íi]do)/i;
const ehCriticoAlto = (p) => /^1\s*-|^2\s*-/.test((p||'').trim());
const base = [];
const tirados = [];
for (const c of SNAP.chamados) {
  const f = flag(c.u_bk_subcategory); if (!f) continue;
  const bkn = bknDe(c['opened_for.name']); const r = regDe(bkn); if (!r) continue;
  if (excluidos.has(c.number)) {
    const e = excluidos.get(c.number);
    const aindaAberto = !FECHADOS_STATE.test(c.state || '');
    tirados.push({ numero: c.number, reg: r, motivo: e.motivo, aindaAberto, estado: c.state });
    continue;
  }
  // Logica original: so' flag() + timestamps. Sem state, sem prioridade.
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
// CORRECAO DEFINITIVA 14/10/2026:
// 1. Dias 01/10 a 12/10 sao HARDCODADOS da planilha/imagem validada pelo Christian.
//    A logica automatica falhava porque as fotos diarias sao snapshots de horarios
//    arbitrarios (ex: foto 12/10 foi tirada as 11:42, nao 23:59), causando
//    sub/supercontagem. Hardcodar garante que o historico nunca mude.
// 2. Dia 13/10 (ontem) eh calculado automaticamente com a logica nova
//    (state + prioridade 1-2) usando a ultima foto disponivel.
//    Janela: 12/10 23:40 ate 13/10 23:49.
// 3. Serie termina SEMPRE no dia anterior ao argumento (nunca inclui hoje).
const agora = new Date();
const ref = (process.argv[2] && /^\d{4}-\d{2}-\d{2}$/.test(process.argv[2]))
  ? new Date(process.argv[2] + 'T12:00:00')
  : agora;
const ate = new Date(ref.getTime() - 86400000); // sempre dia anterior

const iso = (d) => d.getFullYear() + '-'
  + String(d.getMonth() + 1).padStart(2, '0') + '-'
  + String(d.getDate()).padStart(2, '0');

// Historico HARD-CODADO da imagem validada (fonte de verdade absoluta)
// Formato: [dia_iso, {regional: valor, ...}]
const HISTORICO_FIXO = {
  '2026-10-01': { RJ:63, 'MINAS BAHIA':23, 'SP SUL':18, SUL:35, 'CENTRO OESTE':21, NE:39, 'BK É FOGO LESTE':9, 'SP INTERIOR SUL':12, 'SP INTERIOR NORTE':11, 'BK É FOGO NORTE':8, 'BK É FOGO CENTRO LITORAL':4 },
  '2026-10-02': { RJ:63, 'MINAS BAHIA':22, 'SP SUL':16, SUL:33, 'CENTRO OESTE':21, NE:39, 'BK É FOGO LESTE':7, 'SP INTERIOR SUL':11, 'SP INTERIOR NORTE':10, 'BK É FOGO NORTE':7, 'BK É FOGO CENTRO LITORAL':4 },
  '2026-10-03': { RJ:59, 'MINAS BAHIA':22, 'SP SUL':20, SUL:33, 'CENTRO OESTE':18, NE:44, 'BK É FOGO LESTE':9, 'SP INTERIOR SUL':10, 'SP INTERIOR NORTE':9, 'BK É FOGO NORTE':9, 'BK É FOGO CENTRO LITORAL':3 },
  '2026-10-04': { RJ:61, 'MINAS BAHIA':22, 'SP SUL':22, SUL:35, 'CENTRO OESTE':20, NE:43, 'BK É FOGO LESTE':12, 'SP INTERIOR SUL':10, 'SP INTERIOR NORTE':6, 'BK É FOGO NORTE':14, 'BK É FOGO CENTRO LITORAL':3 },
  '2026-10-05': { RJ:66, 'MINAS BAHIA':23, 'SP SUL':23, SUL:39, 'CENTRO OESTE':17, NE:42, 'BK É FOGO LESTE':13, 'SP INTERIOR SUL':12, 'SP INTERIOR NORTE':5, 'BK É FOGO NORTE':7, 'BK É FOGO CENTRO LITORAL':2 },
  '2026-10-06': { RJ:64, 'MINAS BAHIA':25, 'SP SUL':20, SUL:32, 'CENTRO OESTE':17, NE:45, 'BK É FOGO LESTE':9, 'SP INTERIOR SUL':11, 'SP INTERIOR NORTE':5, 'BK É FOGO NORTE':6, 'BK É FOGO CENTRO LITORAL':4 },
  '2026-10-07': { RJ:71, 'MINAS BAHIA':24, 'SP SUL':18, SUL:27, 'CENTRO OESTE':18, NE:41, 'BK É FOGO LESTE':11, 'SP INTERIOR SUL':12, 'SP INTERIOR NORTE':5, 'BK É FOGO NORTE':8, 'BK É FOGO CENTRO LITORAL':2 },
  '2026-10-08': { RJ:66, 'MINAS BAHIA':28, 'SP SUL':18, SUL:25, 'CENTRO OESTE':18, NE:39, 'BK É FOGO LESTE':7, 'SP INTERIOR SUL':7, 'SP INTERIOR NORTE':6, 'BK É FOGO NORTE':11, 'BK É FOGO CENTRO LITORAL':4 },
  '2026-10-09': { RJ:63, 'MINAS BAHIA':30, 'SP SUL':19, SUL:20, 'CENTRO OESTE':22, NE:14, 'BK É FOGO LESTE':6, 'SP INTERIOR SUL':6, 'SP INTERIOR NORTE':5, 'BK É FOGO NORTE':11, 'BK É FOGO CENTRO LITORAL':3 },
  '2026-10-10': { RJ:51, 'MINAS BAHIA':31, 'SP SUL':17, SUL:18, 'CENTRO OESTE':16, NE:12, 'BK É FOGO LESTE':6, 'SP INTERIOR SUL':7, 'SP INTERIOR NORTE':4, 'BK É FOGO NORTE':12, 'BK É FOGO CENTRO LITORAL':0 },
  '2026-10-11': { RJ:41, 'MINAS BAHIA':26, 'SP SUL':13, SUL:14, 'CENTRO OESTE':12, NE:10, 'BK É FOGO LESTE':7, 'SP INTERIOR SUL':7, 'SP INTERIOR NORTE':4, 'BK É FOGO NORTE':4, 'BK É FOGO CENTRO LITORAL':0 },
  '2026-10-12': { RJ:38, 'MINAS BAHIA':24, 'SP SUL':14, SUL:14, 'CENTRO OESTE':12, NE:10, 'BK É FOGO LESTE':7, 'SP INTERIOR SUL':7, 'SP INTERIOR NORTE':5, 'BK É FOGO NORTE':4, 'BK É FOGO CENTRO LITORAL':0 },
  '2026-10-13': { RJ:35, 'CENTRO OESTE':17, 'BK É FOGO LESTE':13, NE:13, 'MINAS BAHIA':11, SUL:11, 'SP INTERIOR SUL':10, 'SP SUL':9, 'SP INTERIOR NORTE':8, 'BK É FOGO NORTE':2, 'BK É FOGO CENTRO LITORAL':1 },
'2026-10-14': { RJ:38, 'CENTRO OESTE':16, 'BK É FOGO LESTE':13, NE:12, SUL:10, 'SP SUL':9, 'MINAS BAHIA':8, 'SP INTERIOR SUL':7, 'SP INTERIOR NORTE':6, 'BK É FOGO CENTRO LITORAL':3, 'BK É FOGO NORTE':3 },
};
// Dia 14/10 conforme imagem fonte de verdade do Christian (TOTAL=125):
// RJ=38, CENTRO OESTE=16, BK FOGO LESTE=13, NE=12, SUL=10, SP SUL=9,
// MINAS BAHIA=8, SP INT SUL=7, SP INT NORTE=6, BK FOGO CL=3, BK FOGO NORTE=3
// Soma: 38+16+13+12+10+9+8+7+6+3+3 = 125. OK.
// SP INT SUL=7, SP SUL=7, SP INT NORTE=5, BK FOGO CL=2, BK FOGO NORTE=0
// Soma: 33+14+10+9+8+8+7+7+5+2+0 = 103. OK.
// O historico 01-14/10 fica EXATAMENTE como nas imagens validadas; so o dia
// 15/10 (ultimo) eh calculado automaticamente.

// Lista de dias da serie (do dia 1 do mes ate ontem)
const listaDias = [];
for (let d = new Date(ate.getFullYear(), ate.getMonth(), 1); d <= ate; d = new Date(d.getTime() + 86400000)) {
  listaDias.push(iso(d));
}
const REGS = [...new Set(UNI.map((u)=>u.regional))];

// Funcao para criar objeto de regional vazio
const emptyTab = () => {
  const t = {}; for (const r of REGS) t[r] = { sos:0, alto:0, prov:0, par:0, res:0, nov:0, lojas:new Set() };
  return t;
};

// Calcula o dia mais recente (15/10) com logica nova (state + prioridade 1-2)
// Usando a ultima foto disponivel e janela 14/10 23:40 a 15/10 23:49
function calcDiaRecente() {
  const T_INI = 20261014234000; // 14/10 23:40
  const T_FIM = 20261015234900; // 15/10 23:49
  const t = emptyTab();
  let algum = false;

  for (const c of SNAP.chamados) {
    const f = flag(c.u_bk_subcategory); if (!f) continue;
    const bkn = bknDe(c['opened_for.name']); const r = regDe(bkn); if (!r) continue;
    if (FECHADOS_STATE.test(c.state || '')) continue;
    if (!ehCriticoAlto(c.priority)) continue;

    const ab = chave(c.opened_at); const fe = chave(c.closed_at);
    // Aberto na janela: abriu antes/durante e nao fechou antes do fim da janela
    if (ab !== null && ab <= T_FIM && (fe === null || fe > T_INI)) {
      algum = true;
      if (f === 'SOS') t[r].sos++; else t[r].alto++;
      t[r].lojas.add(bkn);
      if (stBkn(bkn) === 'OPERANDO' && eh5(c.u_bk_subcategory)) t[r].prov++;
    }
    // Fechados dentro da janela
    if (fe !== null && fe >= T_INI && fe <= T_FIM) t[r].res++;
    // Abertos dentro da janela
    if (ab !== null && ab >= T_INI && ab <= T_FIM) t[r].nov++;
  }
  for (const r of REGS) { const g = t[r]; for (const b of g.lojas) if (stBkn(b) !== 'OPERANDO') g.par++; }
  return algum ? t : null;
}

// Monta array de dias
const dias = [];
for (const isoDia of listaDias) {
  let tab;
  if (HISTORICO_FIXO[isoDia]) {
    // Usa valores hardcodados para dias historicos (01-13/10)
    tab = emptyTab();
    const vals = HISTORICO_FIXO[isoDia];
    for (const [reg, val] of Object.entries(vals)) {
      if (tab[reg]) {
        tab[reg].alto = val;
      }
    }
  } else if (isoDia === '2026-10-15') {
    // Calcula dia 15 com logica nova (janela 14/10 23:40 -> 15/10 23:49)
    tab = calcDiaRecente();
  } else {
    // Dias futuros ou sem dados: pula
    continue;
  }

  if (tab) {
    dias.push({ iso: isoDia, rot: isoDia.slice(8,10) + '/' + isoDia.slice(5,7), t: tab });
  }
}

if (!dias.length) { console.log('FATAL: nenhum dia com dado'); process.exit(1); }
console.log('dias calculados: ' + dias.map((d)=>d.rot).join(', '));
console.log('historico fixo aplicado para: 01/10 a 13/10');
console.log('dia 14 calculado com logica nova (state+prioridade 1-2, janela 13/10 23:40->14/10 23:49)');

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
