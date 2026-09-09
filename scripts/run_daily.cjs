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
const logInfo = (msg, extra) => console.log(JSON.stringify({ ts: agora(), level: 'info', msg, ...extra }));
const logErro = (msg, extra) => console.error(JSON.stringify({ ts: agora(), level: 'error', msg, ...extra }));

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

async function buscarCSV() {
  const browser = await chromium.connectOverCDP(CDP, { timeout: 15000 });
  let page = null;
  for (const c of browser.contexts()) for (const p of c.pages()) if (/soma\.zamp\.com\.br/.test(p.url())) page = p;
  if (!page) throw new Error('aba do SOMA nao encontrada no Chrome (precisa estar aberta e logada)');
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

function processar(csvTexto) {
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

  const porCategoria = {};
  for (const cat of CATEGORIAS) {
    porCategoria[cat.chave] = { nome: cat.nome, chamados: 0, alta: 0, sos: 0, lojasEmFalha: new Set(), somaDias: 0, itensSOS: [] };
  }

  let totalAbertos = 0, totalFechados = 0;
  for (const l of dados) {
    const aberto = ABERTOS.has(l[iEstado]);
    if (aberto) totalAbertos++; else totalFechados++;
    if (!aberto) continue; // so' entra nos cards de equipamento o que esta ATIVO

    const chave = classificar(l[iDesc]);
    if (!chave) continue;
    const g = porCategoria[chave];
    const loja = (l[iLocal] || '').trim();
    const prior = l[iPrior] || '';
    const critica = /cr[íi]tica/i.test(prior);
    const alta = /^2\s*-\s*alta/i.test(prior);

    g.chamados++;
    if (loja) g.lojasEmFalha.add(loja);
    if (alta) g.alta++;
    if (critica) g.sos++;

    const dt = parseDataBR(l[iAberto]);
    const dias = dt ? Math.max(0, Math.round((agora - dt) / 86400000)) : 0;
    g.somaDias += dias;

    if (critica) {
      g.itensSOS.push({ numero: l[iNum], loja, dias, tecnico: l[iTec] || '' });
    }
  }

  const equipamentos = CATEGORIAS.map(cat => {
    const g = porCategoria[cat.chave];
    const pdvsEmFalha = g.lojasEmFalha.size;
    return {
      chave: cat.chave,
      nome: cat.nome,
      pctEmFalha: totalLojas ? Math.round((pdvsEmFalha / totalLojas) * 1000) / 10 : 0,
      pdvsEmFalha,
      chamados: g.chamados,
      alta: g.alta,
      sos: g.sos,
      tempoMedioDias: g.chamados ? Math.round(g.somaDias / g.chamados) : 0,
      chamadosSOS: g.itensSOS.sort((a, b) => b.dias - a.dias).slice(0, 5),
    };
  });

  return {
    atualizadoEm: new Date().toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).replace(' ', 'T'),
    totalRegistros: dados.length,
    totalAbertos,
    totalFechados,
    totalLojas,
    equipamentos,
  };
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

    const dadosProcessados = processar(csv);
    fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
    fs.writeFileSync(path.join(ROOT, 'data', 'dados.json'), JSON.stringify(dadosProcessados, null, 2), 'utf8');
    logInfo('dados processados', {
      totalRegistros: dadosProcessados.totalRegistros,
      totalAbertos: dadosProcessados.totalAbertos,
      equipamentos: dadosProcessados.equipamentos.map(e => `${e.nome}=${e.chamados}`).join(', '),
    });

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
  } catch (e) {
    logErro('pipeline falhou', { erro: e.message.slice(0, 500), seg: Math.round((Date.now() - inicio) / 1000) });
    process.exit(1);
  }
})();
