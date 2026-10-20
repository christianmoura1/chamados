// Pipeline diario do dashboard de Chamados (Visao Sul) -- VM 227.
// v2: agrupa por TIPO DE EQUIPAMENTO (nao por loja), replicando os
// indicadores de um dashboard de referencia do Christian: % em falha,
// PDVs em falha, chamados, Alta/SOS, tempo medio, lista de SOS.
//
// Categorias fixas (decisao do Christian, 09/09/2026): so as 6 do exemplo.
// Deteccao por regex sobre 'short_description' -- o campo e texto livre e
// MUITO sujo (192 variacoes distintas), entao mapeamos por palavra-chave,
// nao por igualdade exata.
const { chromium } = require('C:/projetos/certponto-report/node_modules/playwright');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = 'C:/projetos/chamados';
const GIT = 'C:/Program Files/Git/cmd/git.exe';
const CDP = 'http://127.0.0.1:9222';

const QUERY = 'opened_for.u_bk_divisionIN1512,2311,1667,1300,1439,1494,1700,1444,1604,1466,1453,1382,1450,1176,1436,1480,1730,1741,2439,1314,2222,2225,1996,2224,1989,1990,1419,1456,1332,1994,2443,1992,1993,1743,1564,1484,1842,2425,1320,1354,1322,1448,1550,1462,1338,1321,1264,1442,2139,2427,1438,1277,1367,1606,2404,1869,1865,1956,1600,2240,2337,1991,1727,2154,1892,1774,2369,2181,2141,2172,1768,1898';

const agora = () => new Date().toISOString();

// Grava o log direto em UTF-8 pelo proprio Node (fs.appendFileSync), em vez
// de depender de redirecionamento do shell -- o PowerShell 5.1 grava os
// operadores de redirecionamento (>>, *>>) sempre em UTF-16, nao da pra
// mudar isso por configuracao, e corrompia acento no arquivo. Tambem evita
// o problema de "git escreve no stderr mesmo com sucesso -> PowerShell
// enxerga como erro -> tarefa agendada marca falha" (descoberto 09/09/2026
// ao migrar essa tarefa pra rodar a cada 2h): como o log agora e' escrito
// pelo Node, a tarefa so' precisa do exit code do proprio node.exe.
const LOG_PATH = path.join(ROOT, 'logs', 'run_daily.log');
function escreveLog(linha) {
  try { fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true }); } catch (e) {}
  fs.appendFileSync(LOG_PATH, linha + '\n', 'utf8');
}
const logInfo = (msg, extra) => { const l = JSON.stringify({ ts: agora(), level: 'info', msg, ...extra }); console.log(l); escreveLog(l); };
const logErro = (msg, extra) => { const l = JSON.stringify({ ts: agora(), level: 'error', msg, ...extra }); console.error(l); escreveLog(l); };

const ABERTOS = new Set(['Atribuído', 'Expedição pendente', 'Trabalho em andamento', 'Aceito']);

// ordem = prioridade de exibicao; regex testada na short_description em maiusculas
const CATEGORIAS = [
  { chave: 'sorvete', nome: 'Máquina de Sorvete', re: /SORVETE/ },
  { chave: 'fritadeira', nome: 'Fritadeira', re: /FRITADEIRA/ },
  { chave: 'microondas', nome: 'Micro-ondas', re: /MICRO\s*-?\s*ONDAS|MICROONDAS|MCR\b/ },
  { chave: 'phu', nome: 'PHU', re: /\bPHU\b/ },
  { chave: 'broiler', nome: 'Broiler', re: /BROILER|\bBRO\b/ },
  { chave: 'tostadeira', nome: 'Tostadeira', re: /TOSTADEIRA|TOSTADORA|\bTST\b/ },
];

// Mapa Supervisor -> Setores -> Lojas, extraido da planilha "Equipe Sul" do
// Christian (SharePoint, aba Planilha2: coluna A = SUPERVISOR, com celulas
// mescladas -- preenchidas p/ baixo na extracao). CORRIGIDO em 09/09/2026:
// os 4 supervisores de verdade sao Marcel, Rafael, Gustavo e Carlos Magno
// (a Planilha1 tinha 10 "coordenadores" regionais, que sao um nivel
// diferente, nao o "supervisor" que o Christian quer no farol). Cada
// supervisor cobre varios dos 10 setores regionais. Lista organizacional
// que muda pouco -- fixa aqui, igual as CATEGORIAS, em vez de reabrir a
// planilha (que exige sessao logada) toda vez que o pipeline roda. Se a
// escala mudar, atualizar esta lista manualmente.
const SUPERVISORES = [
  { nome: 'MARCEL', setores: ['VALE DOS SINOS', 'CAPITAL NORTE RS', 'SUDOESTE RS'], lojas: ['BOURBON SHOP NOVO HAMBURGO', 'BOURBON SHOP SAO LEOPOLDO', 'SHOP LAJEADO', 'SHOP SAN PELEGRINO', 'OUTLET NOVO HAMBURGO', 'FS NOVO HAMBURGO - RUA JOAQUIM NABUCO 382', 'FS CAXIAS DO SUL - R JOAO NICHELE 2227', 'FC CAXIAS DO SUL - VILLAGIO CAXIAS', 'SHOP IGUATEMI PORTO ALEGRE', 'BOURBON SHOP WALLIG', 'SHOP ROYAL PLAZA SANTA MARIA', 'SHOP PRACA NOVA SANTA MARIA', 'FS POA - AV CAVALHADA', 'FS POA - AV DR NILO PECANHA 1715', 'SHOP CENTER LAR', 'SHOP PRACA RIO GRANDE', "CARREFOUR PASSO D'AREIA", 'SHOP PELOTAS', 'PARTAGE SHOP RIO GRANDE', 'CARREFOUR PARTENON', 'ILR PORTO ALEGRE - R ANDRADAS 1664', 'FS PELOTAS - AV FERREIRA VIANA'] },
  { nome: 'RAFAEL', setores: ['CAPITAL CENTRO RS', 'CAPITAL SUL RS'], lojas: ['SHOP BELLA CITTA', 'PASSO FUNDO SHOP', 'SHOP DO VALE', 'FS PORTO ALEGRE - AV IPIRANGA 1600', 'BOURBON SHOP PORTO ALEGRE', 'FS CACHOEIRINHA - AV FLORES DA CUNHA', 'SHOP TOTAL POA', 'FS CANOAS - AV DR SEZ AZAMBUJA VIEIRA', 'SHOP PRAIA DE BELAS', 'CANOAS SHOP', 'SHOP GRAVATAI', 'PARK SHOP CANOAS', 'FS CANOAS - AV GETULIO VARGAS 3800'] },
  { nome: 'GUSTAVO', setores: ['OESTE PR', 'GRANDE CURITIBA', 'CURITIBA NORTE'], lojas: ['CATARATAS JL SHOP', 'SHOP PALLADIUM FOZ DO IGUACU', 'FS FOZ DO IGUACU   AV JORGE SCHIMMELPFENG 50', 'SHOP JL CASCAVEL', 'SHOP GUARAPUAVA', 'FS CASCAVEL - AV BRASIL 1580', 'FC - CATUAI CASCAVEL - AV BRASIL 3561', 'SHOP PALLADIUM PONTA GROSSA', 'SHOP TOTAL PONTA GROSSA', 'FS PONTA GROSSA - BALD TAQUES 1530', 'PLAZA CAMPOS GERAIS', 'FS CURITIBA - LINHA VERDE', 'SHOP CIDADE CURITIBA', 'FS CURITIBA - AV FLORIANO PEIXOTO 5952', 'COLOMBO PARK SHOP', 'FS PINHAIS - R DEP JOAO LEOPOLDO JACOMEL 13185', 'JOCKEY PLAZA SHOP', 'SHOP MUELLER CURITIBA'] },
  { nome: 'CARLOS MAGNO', setores: ['CURITIBA SUL', 'CURITIBA OESTE/SC', 'GRANDE CURITIBA'], lojas: ['SHOP CURITIBA', 'WALMART BIG TORRES', 'SHOP JARDIM DAS AMERICAS', 'ANGELONI AGUA VERDE', 'FS CURITIBA - RUA DOMINGOS STRAPASSON', 'FS CURITIBA   AV SILVA JARDIM 566', 'FS CURITIBA - R BISPO DOM JOSE 2348', 'SHOP ESTACAO', 'ILR FLORIANÓPOLIS - R. JERÔNIMO COELHO, 215', 'FS CURITIBA - R MARTIN AFONSO', 'ATLANTICO SHOP', 'PARK EUROPEU BLUMENAU', 'PORTO BELO OUTLET', 'FS CURITIBA   CARLOS KLEMTZ 1994', 'SHOP PALLADIUM CURITIBA', 'SHOP SAO JOSE DOS PINHAIS', 'FS SJP - AV DAS TORRES', 'FS CURITIBA   FRANCISCO FRISHMANN 3151'] },
];

function normalizaLoja(s) {
  return (s || '')
    .toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Ordem de exibicao dos chamados em qualquer lista/modal (pedido do
// Christian, 09/09/2026): SOS primeiro, depois Alta, depois Normal; dentro
// de cada prioridade, mais dias em aberto primeiro.
const RANK_PRIORIDADE = { SOS: 0, Alta: 1, Normal: 2 };
function comparaChamados(a, b) {
  const r = (RANK_PRIORIDADE[a.prioridade] ?? 9) - (RANK_PRIORIDADE[b.prioridade] ?? 9);
  return r !== 0 ? r : b.dias - a.dias;
}

function parseCSV(texto) {
  const linhas = [];
  let campo = '', linha = [], dentroAspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i], prox = texto[i + 1];
    if (dentroAspas) {
      if (c === '"' && prox === '"') { campo += '"'; i++; }
      else if (c === '"') { dentroAspas = false; }
      else campo += c;
    } else {
      if (c === '"') dentroAspas = true;
      else if (c === ',') { linha.push(campo); campo = ''; }
      else if (c === '\r') { /* ignora */ }
      else if (c === '\n') { linha.push(campo); campo = ''; linhas.push(linha); linha = []; }
      else campo += c;
    }
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas;
}

async function buscarCSVUmaVez() {
  const browser = await chromium.connectOverCDP(CDP, { timeout: 15000 });
  const ctx = browser.contexts()[0];

  // A aba do SOMA degrada com o tempo (ja travou o fetch duas vezes em
  // 09/09/2026 apos algumas horas de uso) -- renovar sempre, em vez de
  // reaproveitar uma aba que pode estar zumbi. O login sobrevive porque
  // vive no cookie/perfil, nao na aba em si.
  for (const p of ctx.pages()) {
    if (/soma\.zamp\.com\.br/.test(p.url())) await p.close().catch(() => {});
  }
  const page = await ctx.newPage();
  await page.goto('https://soma.zamp.com.br/wm_task_list.do', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1500);
  if (/login\.microsoftonline|Conta\/LogOn/i.test(page.url())) throw new Error('a aba do SOMA esta em tela de login');
  page.setDefaultTimeout(110000);

  const url = `https://soma.zamp.com.br/wm_task_list.do?CSV&sysparm_query=${encodeURIComponent(QUERY)}`;
  const resultado = await Promise.race([
    page.evaluate(async (u) => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort('timeout'), 90000);
      const r = await fetch(u, { credentials: 'include', signal: ctrl.signal });
      clearTimeout(t);
      const buf = await r.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let bin = '';
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      return { status: r.status, tamanhoBytes: bytes.length, contentType: r.headers.get('content-type'), b64: btoa(bin) };
    }, url),
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout externo 100s')), 100000)),
  ]);

  await browser.close().catch(() => {});

  if (resultado.status !== 200) throw new Error(`SOMA respondeu status ${resultado.status}`);
  if (!/text\/csv/i.test(resultado.contentType || '')) throw new Error(`content-type inesperado: ${resultado.contentType} (provavel tela de login)`);
  if (resultado.tamanhoBytes < 1000) throw new Error(`CSV suspeito pequeno demais: ${resultado.tamanhoBytes} bytes`);

  return Buffer.from(resultado.b64, 'base64').toString('latin1');
}

async function buscarCSV() {
  try {
    return await buscarCSVUmaVez();
  } catch (e) {
    logInfo('primeira tentativa falhou, tentando de novo com aba nova', { erro: e.message.slice(0, 200) });
    return await buscarCSVUmaVez();
  }
}

// O "% em falha" precisa bater com o indicador oficial de Disponibilidade
// que a area de Manutencao ja acompanha no Power BI (pedido do Christian,
// 09/09/2026) -- NUNCA recalcular essa % aqui, sempre ler da tela do BI
// (mesma regra do pbi_to_dados.py p/ Gestao de Risco). A pagina "12.
// Disponibilidade Book" ja tem os cards por equipamento pre-filtrados p/
// REGIONAL = SUL (confirmado pelo Christian clicando no card Broiler e
// conferindo o painel de Filters do proprio Power BI).
const URL_DISPONIBILIDADE_BI = 'https://app.powerbi.com/groups/me/apps/38828dac-b7dc-46e0-a737-57db66b372de/reports/e07d5c63-3ebb-4102-95bf-98a5eac89373/250d750ebb9a588058a3?ctid=64587785-97bc-48f0-83e2-1e7a6597212e&experience=power-bi';
const MAPA_LABEL_BI = {
  sorvete: 'MÁQUINA DE SORVETE',
  fritadeira: 'FRITADEIRA',
  microondas: 'MICROONDAS',
  phu: 'PHU',
  broiler: 'BROILER',
  tostadeira: 'TOSTADEIRA',
};

async function buscarDisponibilidadeBI() {
  const browser = await chromium.connectOverCDP(CDP, { timeout: 15000 });
  const ctx = browser.contexts()[0];
  let page = null;
  for (const p of ctx.pages()) {
    if (/e07d5c63-3ebb-4102-95bf-98a5eac89373\/250d750ebb9a588058a3/.test(p.url())) { page = p; break; }
  }
  const abriuNova = !page;
  if (!page) page = await ctx.newPage();
  await page.bringToFront();
  if (abriuNova) {
    await page.goto(URL_DISPONIBILIDADE_BI, { waitUntil: 'domcontentloaded', timeout: 30000 });
  }
  await page.waitForTimeout(3000);

  const texto = await page.evaluate(() => document.body.innerText);
  await browser.close().catch(() => {});

  const carimboMatch = texto.match(/Última Atualização\s*\n?\s*([\d/: AMP]+)/i);
  const carimbo = carimboMatch ? carimboMatch[1].trim() : null;
  if (!carimbo) throw new Error('nao encontrei o carimbo "Última Atualização" na pagina do BI');

  const dataCarimbo = new Date(carimbo);
  if (isNaN(dataCarimbo)) throw new Error(`carimbo do BI ilegivel: "${carimbo}"`);
  const diasDeAtraso = (Date.now() - dataCarimbo.getTime()) / 86400000;
  if (diasDeAtraso > 5) throw new Error(`disponibilidade BI desatualizada ha ${diasDeAtraso.toFixed(1)} dias (carimbo: ${carimbo})`);

  const disponibilidade = {};
  for (const [chave, label] of Object.entries(MAPA_LABEL_BI)) {
    const idx = texto.indexOf(label);
    if (idx < 0) { disponibilidade[chave] = null; continue; }
    const resto = texto.slice(idx + label.length, idx + label.length + 20);
    const m = resto.match(/(\d{1,3})%/);
    disponibilidade[chave] = m ? Number(m[1]) : null;
  }

  const faltando = Object.entries(disponibilidade).filter(([, v]) => v === null).map(([k]) => k);
  if (faltando.length) throw new Error(`disponibilidade BI incompleta, faltando: ${faltando.join(', ')}`);

  return { carimbo, disponibilidade };
}

function classificar(desc) {
  const d = (desc || '').toUpperCase();
  for (const cat of CATEGORIAS) if (cat.re.test(d)) return cat.chave;
  return null;
}

function parseDataBR(s) {
  // "27/07/2026 16:25:49" -> Date
  const m = (s || '').match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, dd, mm, yyyy, hh, mi, ss] = m;
  return new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(mi), Number(ss));
}

function processar(csvTexto, disponibilidadeBI) {
  const linhas = parseCSV(csvTexto);
  const header = linhas[0];
  const dados = linhas.slice(1).filter(l => l.length === header.length);
  if (dados.length < 100) throw new Error(`poucos registros extraidos (${dados.length}) -- provavel falha na extracao`);

  const idx = (nome) => header.indexOf(nome);
  const iLocal = idx('location'), iEstado = idx('state'), iPrior = idx('priority'),
    iNum = idx('number'), iDesc = idx('short_description'), iAberto = idx('opened_at'),
    iTec = idx('assigned_to');
  for (const [nome, i] of [['location', iLocal], ['state', iEstado], ['priority', iPrior], ['short_description', iDesc], ['opened_at', iAberto]]) {
    if (i < 0) throw new Error(`coluna esperada ausente no CSV: ${nome}`);
  }

  const totalLojas = new Set(dados.map(l => (l[iLocal] || '').trim()).filter(Boolean)).size;
  const agora = new Date();
  // 'YYYY-MM-DD' local (a VM roda em America/Sao_Paulo) -- usado pra contar
  // quantos chamados abriram HOJE de verdade (data de abertura == hoje),
  // nao o total acumulado. Pedido do Christian, 10/09/2026: o grafico de
  // evolucao tem que mostrar abertos/fechados DO DIA, nao o estoque total.
  const hojeYmd = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;

  const porCategoria = {};
  for (const cat of CATEGORIAS) {
    porCategoria[cat.chave] = { nome: cat.nome, chamados: 0, alta: 0, sos: 0, fechados: 0, abertosHoje: 0, lojasEmFalha: new Set(), somaDias: 0, itensTodos: [] };
  }

  let totalAbertos = 0, totalFechados = 0;
  for (const l of dados) {
    const aberto = ABERTOS.has(l[iEstado]);
    if (aberto) totalAbertos++; else totalFechados++;

    // conta fechados (estoque) e abertos-hoje por categoria mesmo p/ quem
    // esta FECHADO -- um chamado aberto e fechado no mesmo dia ainda conta
    // como "aberto hoje". Nao entra nos cards/detalhe, que continuam
    // mostrando so' o que esta ATIVO.
    const chaveQualquer = classificar(l[iDesc]);
    if (chaveQualquer) {
      if (!aberto) porCategoria[chaveQualquer].fechados++;
      const dtAbertura = parseDataBR(l[iAberto]);
      if (dtAbertura) {
        const ymd = `${dtAbertura.getFullYear()}-${String(dtAbertura.getMonth() + 1).padStart(2, '0')}-${String(dtAbertura.getDate()).padStart(2, '0')}`;
        if (ymd === hojeYmd) porCategoria[chaveQualquer].abertosHoje++;
      }
    }
    if (!aberto) continue;

    const chave = classificar(l[iDesc]);
    if (!chave) continue;
    const g = porCategoria[chave];
    const loja = (l[iLocal] || '').trim();
    const prior = l[iPrior] || '';
    const critica = /cr[íi]tica/i.test(prior);
    const alta = /^2\s*-\s*alta/i.test(prior);
    const prioridade = critica ? 'SOS' : (alta ? 'Alta' : 'Normal');

    g.chamados++;
    if (loja) g.lojasEmFalha.add(loja);
    if (alta) g.alta++;
    if (critica) g.sos++;

    const dt = parseDataBR(l[iAberto]);
    const dias = dt ? Math.max(0, Math.round((agora - dt) / 86400000)) : 0;
    g.somaDias += dias;

    // 'YYYY-MM-DD' p/ filtro de data no front (input type=date usa esse
    // formato) -- pedido do Christian, 11/09/2026.
    const abertura = dt ? `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}` : null;
    const item = { numero: l[iNum], loja, estado: l[iEstado] || '', prioridade, dias, tecnico: l[iTec] || '', problema: (l[iDesc] || '').trim(), abertura };
    g.itensTodos.push(item);
  }

  const equipamentos = CATEGORIAS.map(cat => {
    const g = porCategoria[cat.chave];
    const pdvsEmFalha = g.lojasEmFalha.size;
    // ordena uma vez so' (mutation) e reaproveita: os "mais urgentes" sao os
    // 5 primeiros da lista JA ordenada por prioridade (SOS > Alta > Normal,
    // dias desc) -- completa com Alta/Normal quando tem menos de 5 SOS, pra
    // o card sempre mostrar 5 linhas (visual consistente entre cards, so'
    // fica com menos se o equipamento tiver menos de 5 chamados no total).
    // Pedido do Christian, 12/09/2026.
    const ordenados = g.itensTodos.sort(comparaChamados);
    return {
      chave: cat.chave,
      nome: cat.nome,
      // Indisponibilidade = 100 - Disponibilidade, LIDA da tela do Power BI
      // (pagina 12. Disponibilidade Book, ja filtrada p/ Regional Sul) --
      // nunca recalculada a partir do CSV do SOMA.
      pctIndisponibilidade: Math.round((100 - disponibilidadeBI[cat.chave]) * 10) / 10,
      pdvsEmFalha,
      chamados: g.chamados,
      alta: g.alta,
      sos: g.sos,
      fechados: g.fechados,
      abertosHoje: g.abertosHoje,
      tempoMedioDias: g.chamados ? Math.round(g.somaDias / g.chamados) : 0,
      chamadosMaisUrgentes: ordenados.slice(0, 5),
      chamadosDetalhe: ordenados,
    };
  });

  return {
    atualizadoEm: new Date().toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).replace(' ', 'T'),
    totalRegistros: dados.length,
    totalAbertos,
    totalFechados,
    totalLojas,
    equipamentos,
    supervisores: calcularSupervisores(equipamentos),
  };
}

// Farol por supervisor (pedido do Christian, 09/09/2026): rollup de
// chamados por SUPERVISORES, casando o nome da loja da planilha com o nome
// que vem do SOMA -- a grafia varia um pouco entre as duas fontes (abrevia
// rua, acento, numero do endereco), entao o casamento e' por normalizacao +
// contencao de palavras, nao igualdade exata.
function calcularSupervisores(equipamentos) {
  const todos = equipamentos.flatMap(e => e.chamadosDetalhe.map(c => ({ ...c, equipamento: e.nome })));
  const lojasComChamado = [...new Set(todos.map(c => c.loja).filter(Boolean))];
  const lojasNorm = lojasComChamado.map(l => ({ original: l, norm: normalizaLoja(l) }));

  // Casos onde a grafia da planilha e' longe demais da grafia do SOMA p/ o
  // casamento por palavra dar conta sozinho (abreviacao de cidade, "SHOP X"
  // vs "X CIDADE"), mas que sao seguramente a mesma loja -- curado a mao em
  // vez de tentar generalizar por pontuacao de palavra, porque uma tentativa
  // de pontuacao automatica (09/09/2026) colidiu lojas DIFERENTES da mesma
  // cidade (ex.: "SHOP CURITIBA" ficou casando com "SHOP CIDADE CURITIBA").
  // chave = grafia EXATA como esta em SUPERVISORES.lojas (a planilha);
  // valor = a grafia que aparece no SOMA (o que precisa achar em lojasNorm).
  const ALIASES_LOJA = {
    'PARK EUROPEU BLUMENAU': 'SHOP PARK EUROPEU',
    'ILR FLORIANÓPOLIS - R. JERÔNIMO COELHO, 215': 'ILR FLORIPA - R JERONIMO COELHO 215',
  };

  function acharLoja(lojaPlanilha) {
    const alvo = normalizaLoja(lojaPlanilha);
    let m = lojasNorm.find(x => x.norm === alvo);
    if (m) return m.original;
    if (ALIASES_LOJA[lojaPlanilha]) {
      const aliasNorm = normalizaLoja(ALIASES_LOJA[lojaPlanilha]);
      m = lojasNorm.find(x => x.norm === aliasNorm);
      if (m) return m.original;
    }
    const palavrasAlvo = alvo.split(' ').filter(w => w.length >= 3);
    m = lojasNorm.find(x => palavrasAlvo.length && palavrasAlvo.every(w => x.norm.includes(w)));
    if (m) return m.original;
    m = lojasNorm.find(x => {
      const palavrasCand = x.norm.split(' ').filter(w => w.length >= 3);
      return palavrasCand.length && palavrasCand.every(w => alvo.includes(w));
    });
    return m ? m.original : null;
  }

  return SUPERVISORES.map(sup => {
    let chamados = 0, alta = 0, sos = 0, somaDias = 0, lojasComChamadoCount = 0;
    const chamadosDetalhe = [];
    for (const loja of sup.lojas) {
      const achado = acharLoja(loja);
      if (!achado) continue;
      const itens = todos.filter(c => c.loja === achado);
      if (itens.length) lojasComChamadoCount++;
      chamados += itens.length;
      alta += itens.filter(c => c.prioridade === 'Alta').length;
      sos += itens.filter(c => c.prioridade === 'SOS').length;
      somaDias += itens.reduce((s, c) => s + c.dias, 0);
      chamadosDetalhe.push(...itens);
    }
    chamadosDetalhe.sort(comparaChamados);
    return {
      nome: sup.nome,
      setores: sup.setores,
      totalLojas: sup.lojas.length,
      lojasComChamado: lojasComChamadoCount,
      chamados,
      alta,
      sos,
      tempoMedioDias: chamados ? Math.round(somaDias / chamados) : 0,
      chamadosDetalhe,
    };
  });
}

// Guarda 1 ponto por dia (America/Sao_Paulo) com o retrato do backlog, pra
// alimentar o grafico de evolucao da tratativa. Reruns no mesmo dia
// substituem o ponto do dia (nao duplicam). Mantem so os ultimos 180 dias.
function atualizarHistorico(dadosProcessados) {
  const caminho = path.join(ROOT, 'data', 'historico.json');
  let historico = [];
  try {
    // remove BOM se o arquivo foi salvo por algo tipo PowerShell (Set-Content
    // -Encoding UTF8 grava com BOM, e isso quebra o JSON.parse silenciosamente
    // -- ja aconteceu uma vez, 10/09/2026, ao limpar o arquivo na mao).
    const bruto = fs.readFileSync(caminho, 'utf8').replace(/^﻿/, '');
    historico = JSON.parse(bruto);
    if (!Array.isArray(historico)) historico = [];
  } catch (e) {
    historico = [];
  }
  // migra pontos do formato antigo (1/dia, sem 'quando') pra nao quebrar o sort
  historico.forEach(p => { if (!p.quando) p.quando = p.data + 'T00:00:00'; });

  // um ponto por EXECUCAO (nao mais 1/dia) -- pedido do Christian
  // (10/09/2026), pra poder comparar o mesmo horario entre dias (ex.: "dia
  // 09 as 6h" vs "dia 10 as 6h"), agora que o pipeline roda a cada 2h.
  const quando = dadosProcessados.atualizadoEm; // 'YYYY-MM-DDTHH:mm:ss', hora local Sul
  const dataHoje = quando.slice(0, 10);
  const porCategoria = {};
  let totalChamadosEquip = 0, totalAlta = 0, totalSOS = 0, totalFechadosEquip = 0, totalAbertosHoje = 0;
  for (const e of dadosProcessados.equipamentos) {
    porCategoria[e.chave] = { chamados: e.chamados, alta: e.alta, sos: e.sos, fechados: e.fechados || 0, abertosHoje: e.abertosHoje || 0 };
    totalChamadosEquip += e.chamados;
    totalAlta += e.alta;
    totalSOS += e.sos;
    totalFechadosEquip += (e.fechados || 0);
    totalAbertosHoje += (e.abertosHoje || 0);
  }

  // "fechados HOJE" e' uma estimativa: o SOMA nao tem data de fechamento no
  // CSV, so' data de abertura -- entao contamos pela DIFERENCA do estoque
  // de fechados (totalFechadosEquip) desde a primeira execucao de hoje ja
  // registrada. Assume que chamado fechado nao reabre (razoavel pra
  // manutencao). Na primeira execucao do dia, fica 0 (nao tem base ainda).
  const pontosHoje = historico.filter(p => p.data === dataHoje);
  const baseline = pontosHoje.length
    ? pontosHoje.reduce((min, p) => (p.quando < min.quando ? p : min))
    : null;
  const totalFechadosHoje = baseline ? Math.max(0, totalFechadosEquip - baseline.totalFechadosEquip) : 0;

  const ponto = {
    quando,
    data: dataHoje,
    totalRegistros: dadosProcessados.totalRegistros,
    totalAbertos: dadosProcessados.totalAbertos,
    totalFechados: dadosProcessados.totalFechados,
    // escopo dos 6 equipamentos do dashboard (o "345" que o Christian
    // acompanha), diferente do totalAbertos/totalFechados acima que e' o
    // SOMA inteiro (todas as categorias, nao so as 6 monitoradas aqui).
    totalChamadosEquip,
    totalFechadosEquip,
    totalAlta,
    totalSOS,
    // metricas DO DIA (nao estoque total) -- pedido do Christian, 10/09/2026
    totalAbertosHoje,
    totalFechadosHoje,
    porCategoria,
  };

  const idxExistente = historico.findIndex(p => p.quando === quando);
  if (idxExistente >= 0) historico[idxExistente] = ponto;
  else historico.push(ponto);

  historico.sort((a, b) => a.quando.localeCompare(b.quando));
  // 400 pontos ~ 44 dias rodando a cada 2h (9/dia) -- bem mais que os
  // antigos 180 dias porque agora e' por execucao, nao por dia.
  if (historico.length > 400) historico = historico.slice(-400);

  fs.writeFileSync(caminho, JSON.stringify(historico, null, 2), 'utf8');
  return historico.length;
}

function rodar(rotulo, cmd, args) {
  logInfo('etapa iniciada', { etapa: rotulo });
  try {
    const saida = execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8' });
    logInfo('etapa concluida', { etapa: rotulo, saida: saida.trim().slice(0, 300) });
    return saida;
  } catch (e) {
    const saida = ((e.stdout || '') + (e.stderr || '')).trim();
    throw new Error(`${rotulo} falhou: ${saida.slice(-300) || e.message}`);
  }
}

(async () => {
  const inicio = Date.now();
  logInfo('pipeline chamados iniciado');
  try {
    logInfo('etapa iniciada', { etapa: 'buscar_csv' });
    const csv = await buscarCSV();
    logInfo('etapa concluida', { etapa: 'buscar_csv', bytes: csv.length });

    logInfo('etapa iniciada', { etapa: 'buscar_disponibilidade_bi' });
    const { carimbo: carimboBI, disponibilidade: disponibilidadeBI } = await buscarDisponibilidadeBI();
    logInfo('etapa concluida', { etapa: 'buscar_disponibilidade_bi', carimbo: carimboBI, disponibilidade: disponibilidadeBI });

    const dadosProcessados = processar(csv, disponibilidadeBI);
    dadosProcessados.disponibilidadeBIAtualizadaEm = carimboBI;
    fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
    fs.writeFileSync(path.join(ROOT, 'data', 'dados.json'), JSON.stringify(dadosProcessados, null, 2), 'utf8');
    logInfo('dados processados', {
      totalRegistros: dadosProcessados.totalRegistros,
      totalAbertos: dadosProcessados.totalAbertos,
      equipamentos: dadosProcessados.equipamentos.map(e => `${e.nome}=${e.chamados}`).join(', '),
    });

    const pontosHistorico = atualizarHistorico(dadosProcessados);
    logInfo('historico atualizado', { pontos: pontosHistorico });

    rodar('git add', GIT, ['add', 'data']);
    const hoje = new Date().toISOString().slice(0, 10);
    try {
      rodar('git commit', GIT, [
        '-c', 'user.name=Pipeline Chamados',
        '-c', 'user.email=chamados@vm227.local',
        'commit', '-m', `Chamados ${hoje} (pipeline automatico)`,
      ]);
    } catch (e) {
      if (/nothing to commit/i.test(e.message)) { logInfo('sem mudancas para commitar'); }
      else throw e;
    }
    process.env.GIT_SSH_COMMAND = 'ssh -i C:/Users/csmoura1/.ssh/deploy_chamados_pessoal -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new';
    rodar('git push', GIT, ['push', 'origin', 'main']);

    logInfo('pipeline chamados concluido com sucesso', { seg: Math.round((Date.now() - inicio) / 1000) });
    process.exit(0); // sem isso o processo fica pendurado (conexao CDP do Playwright
    // nao solta o event loop sozinha) e a tarefa agendada nunca marca "concluida" --
    // critico agora que roda a cada 2h: uma instancia pendurada bloqueia a proxima.
  } catch (e) {
    logErro('pipeline falhou', { erro: e.message.slice(0, 500), seg: Math.round((Date.now() - inicio) / 1000) });
    process.exit(1);
  }
})();
