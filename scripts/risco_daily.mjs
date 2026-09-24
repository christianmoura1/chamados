import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/projetos/certponto-report/node_modules/playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');

const BOT = 'C:/projetos/climapro-bot';
const REPO = 'C:/projetos/chamados';
const NODE = process.execPath;
const ABA = 'reports/e07d5c63-3ebb-4102-95bf-98a5eac89373/2efd4d969ee24a7d6426';
const URL_RISCO = 'https://app.powerbi.com/groups/me/apps/38828dac-b7dc-46e0-a737-57db66b372de/'
  + 'reports/e07d5c63-3ebb-4102-95bf-98a5eac89373/2efd4d969ee24a7d6426'
  + '?ctid=64587785-97bc-48f0-83e2-1e7a6597212e&experience=power-bi&clientSideAuth=0';

const ts = () => new Date().toLocaleString('pt-BR');
const log = (m) => console.log('[' + ts() + '] ' + m);
const fatal = (m) => { console.error('[' + ts() + '] FATAL: ' + m); process.exit(1); };

// Idioma da conta do BI decide o formato: EN = MM/DD, PT-BR = DD/MM.
// Mesma desambiguacao do daily_risco_report.js e do run_daily.cjs.
function partesBI(a, b) {
  const d1 = Number(a), d2 = Number(b);
  if (d1 > 12) return { dia: d1, mes: d2 };
  if (d2 > 12) return { dia: d2, mes: d1 };
  return { dia: d1, mes: d2 };
}
function dataCarimbo(s) {
  const m = String(s || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  const p = partesBI(m[1], m[2]);
  return new Date(Number(m[3]), p.mes - 1, p.dia);
}

log('inicio do pipeline de risco');

// ---------- 1) recarrega a aba do BI ----------
// Historico: em 16/09/2026 o reload DERRUBAVA o filtro Regional (voltava para
// 'Todos' e vinham 694 lojas), entao ele foi removido. Depois que o Christian
// fixou o SUL no relatorio, testei de novo e o filtro SOBREVIVEU -- reload de
// volta, porque sem ele o script le o que estiver desenhado na aba e o dado
// envelhece quando o dataset atualiza. Se o filtro cair outra vez, a guarda de
// escopo (>120 lojas) barra a publicacao em vez de publicar o Brasil inteiro.
{
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222', { timeout: 20000 });
  const ctx = browser.contexts()[0];
  let page = null;
  for (const p of ctx.pages()) if (p.url().includes(ABA)) page = p;
  // Em 18/09/2026 a aba do risco sumiu do Chrome e o pipeline morreu aqui: so'
  // restava a aba da Disponibilidade Book (250d750e...), que e' do MESMO
  // relatorio mas de outra pagina e pertence ao pipeline do Backlog. Em vez de
  // abortar -- ou pior, sequestrar a aba do outro pipeline -- abro a minha.
  if (!page) {
    log('aba de Gestao de Risco nao encontrada; abrindo uma nova');
    page = await ctx.newPage();
    await page.goto(URL_RISCO, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await new Promise((r) => setTimeout(r, 8000));
  }
  log('recarregando a aba do Power BI');
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
  let pronto = false;
  for (let i = 0; i < 100; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    if (/login\.microsoftonline|oauth2/.test(page.url())) {
      fatal('a aba caiu na tela de login da Microsoft -- relogar no Power BI pelo RDP');
    }
    pronto = await page.evaluate(() => {
      const t = document.body.innerText || '';
      return /ltima\s+Atualiza/i.test(t) && /MATRIZ DE RISCO/i.test(t)
             && document.querySelectorAll('[role="row"]').length > 5;
    }).catch(() => false);
    if (pronto) break;
  }
  if (!pronto) fatal('o relatorio nao terminou de carregar em 5 minutos apos o reload');
  // o grid da Matriz e' virtualizado e desenha depois do resto da pagina
  await new Promise((r) => setTimeout(r, 20000));
  log('aba recarregada e pronta');

  // ---------- 1b) GUARDA DOS SLICERS ----------
  // Este pipeline ja' parou duas vezes por slicer mexido, e das duas o erro
  // chegou tarde e disfarcado:
  //   16/09/2026 -- Regional voltou para 'Todos' e vieram 694 lojas;
  //   23/09/2026 -- Loja travou em "20241 - SHOP PLAZA MACAE" e a pagina ficou
  //                 VAZIA. O sintoma foi "0 lojas extraidas", que parece
  //                 problema de renderizacao, e o painel ficou 2 dias parado.
  // A guarda antiga so' pegava o caso de vir loja DEMAIS (>120); vir loja de
  // MENOS passava batido. Agora conferimos cada slicer ANTES de extrair, e o
  // erro diz qual esta errado e para o que voltar.
  //
  // O aria-label do combobox e' o nome do campo no modelo (brand_name,
  // region_name...) e NAO muda com o idioma da conta -- ao contrario do texto
  // da tela, que ja' quebrou seletor aqui antes.
  const SLICERS_ESPERADOS = {
    brand_name: 'BKB',
    region_name: 'SUL',
    sector_name: 'Todos',
    store_bkn_name: 'Todos',
    assunto_principal: 'Todos',
    assunto_secundario: 'Todos',
    status_gestao_risco: 'Todos',
    Categoria: 'Todos',
  };
  const lidos = await page.evaluate(() => {
    const o = {};
    document.querySelectorAll('[role="combobox"]').forEach((el) => {
      const nome = (el.getAttribute('aria-label') || '').trim();
      if (nome) o[nome] = (el.innerText || '').replace(/\s+/g, ' ').trim();
    });
    return o;
  }).catch(() => ({}));

  const errados = [];
  for (const [campo, esperado] of Object.entries(SLICERS_ESPERADOS)) {
    const atual = lidos[campo];
    if (atual === undefined) { errados.push(campo + ': nao achei o slicer na tela'); continue; }
    if (atual !== esperado) errados.push(campo + ': esta "' + atual + '", deveria ser "' + esperado + '"');
  }
  log('slicers: ' + JSON.stringify(lidos));
  if (errados.length) {
    await browser.close().catch(() => {});
    fatal('filtro do Power BI fora do lugar -- NAO publiquei. ' + errados.join(' | ')
      + '. Ajuste em: ' + URL_RISCO);
  }
  log('slicers conferidos: recorte correto (BKB / SUL / Loja Todos)');
  await browser.close().catch(() => {});
}

// ---------- 2) extracoes ----------
function etapa(rotulo, script) {
  log('etapa: ' + rotulo);
  try {
    execFileSync(NODE, [BOT + '/' + script], { cwd: BOT, stdio: 'pipe', timeout: 600000 });
  } catch (e) {
    fatal('etapa "' + rotulo + '" falhou: ' + (e.message || e));
  }
}
// A extracao da matriz as vezes pega a tela antes dos scores renderizarem.
// Em vez de abortar o pipeline inteiro, tenta de novo dando mais tempo.
let v4ok = null;
for (let tentativa = 1; tentativa <= 3; tentativa++) {
  etapa('matriz de risco (tentativa ' + tentativa + ')', 'extrai_risco_v4.mjs');
  try {
    const j = JSON.parse(fs.readFileSync(BOT + '/risco_v4.json', 'utf8'));
    if (j.scoreMedio > 0 && Array.isArray(j.categorias) && j.categorias.length === 4) { v4ok = j; break; }
    log('tentativa ' + tentativa + ': score=' + j.scoreMedio + ' categorias=' + (j.categorias || []).length + ' -- vou esperar e repetir');
  } catch (e) { log('tentativa ' + tentativa + ': risco_v4.json ilegivel (' + e.message + ')'); }
  if (tentativa < 3) await new Promise((r) => setTimeout(r, 25000));
}
if (!v4ok) {
  // Diagnostico honesto: se vier MUITA loja, o problema nao e' renderizacao --
  // e' o slicer Regional do BI ter voltado para 'Todos'. Isso acontece quando o
  // dataset atualiza (visto em 16/09: refresh das 12:09 derrubou o filtro SUL).
  let pista = '';
  try {
    const j = JSON.parse(fs.readFileSync(BOT + '/risco_v4.json', 'utf8'));
    const n = (j.lojasFinal || []).length;
    const primeira = ((j.lojasFinal || [])[0] || {}).nome || '';
    if (n > 120) {
      pista = ' -- vieram ' + n + ' lojas (a Sul tem 71). Primeira: ' + primeira
        + '. O filtro Regional do Power BI nao esta em SUL, esta em Todos.';
    } else {
      pista = ' -- ' + n + ' lojas extraidas. Primeira: ' + primeira;
    }
  } catch (e) { pista = ' -- risco_v4.json ilegivel'; }
  fatal('nao consegui um score valido em 3 tentativas' + pista);
}
etapa('em aberto por item', 'extrai_risco_v2.mjs');
etapa('chamados de gestao de risco', 'extrai_chamados_risco.mjs');

// ---------- 3) junta ----------
const leia = (p) => { if (!fs.existsSync(p)) fatal('arquivo nao gerado: ' + p); return JSON.parse(fs.readFileSync(p, 'utf8')); };
const v4 = leia(BOT + '/risco_v4.json');
const v2 = leia(BOT + '/risco_v2.json');
const ch = leia(BOT + '/chamados_risco.json');

// guardas: nunca publicar dado incompleto
if (!v4.atualizadoEm) fatal('sem carimbo "Ultima Atualizacao" do BI');
if (!Array.isArray(v4.categorias) || v4.categorias.length !== 4) fatal('esperava 4 categorias, veio ' + (v4.categorias || []).length);
if (!(v4.totalLojasAvaliadas >= 60)) fatal('so ' + v4.totalLojasAvaliadas + ' lojas avaliadas (esperado ~71) -- extracao incompleta');
if (v4.totalLojasAvaliadas > 120) fatal(v4.totalLojasAvaliadas + ' lojas (a Regional Sul tem 71) -- o filtro do BI esta em Todos, nao em SUL. Nao publiquei.');
if (!(v4.scoreMedio > 0)) fatal('scoreMedio invalido: ' + v4.scoreMedio);
if (!Array.isArray(v2.abertoPorItemBruto) || v2.abertoPorItemBruto.length < 12) fatal('abertoPorItemBruto incompleto');
if (!Array.isArray(ch.vencidos) || !Array.isArray(ch.aVencer)) fatal('chamados de risco nao extraidos');

const dBI = dataCarimbo(v4.atualizadoEm);
if (dBI) {
  const dias = Math.floor((Date.now() - dBI.getTime()) / 86400000);
  log('carimbo do BI: ' + v4.atualizadoEm + ' (' + dias + ' dia(s) atras)');
  if (dias > 5) fatal('dado do BI com ' + dias + ' dias -- dataset parado, nao publiquei');
  if (dias >= 1) log('AVISO: o dataset do BI ainda nao atualizou hoje; publicando o dado de ' + v4.atualizadoEm);
}

const saida = {
  atualizadoEm: v4.atualizadoEm,
  geradoEm: new Date().toISOString(),
  totalLojasAvaliadas: v4.totalLojasAvaliadas,
  scoreMedio: v4.scoreMedio,
  categorias: v4.categorias.map((c) => Object.assign({}, c, {
    lojasVencidas: (c.lojasVencidas || []).map((l) => ({
      nome: l.nome, score: l.score, diasAtraso: l.diasAtraso === undefined ? null : l.diasAtraso,
    })),
  })),
  abertoPorItemBruto: v2.abertoPorItemBruto,
  chamadosRisco: { vencidos: ch.vencidos, aVencer: ch.aVencer },
};
fs.writeFileSync(REPO + '/data/risco.json', JSON.stringify(saida, null, 1), 'utf8');
log('risco.json gravado: score=' + saida.scoreMedio + ' lojas=' + saida.totalLojasAvaliadas
    + ' vencidos=' + saida.chamadosRisco.vencidos.length + ' aVencer=' + saida.chamadosRisco.aVencer.length);

// ---------- 4) publica ----------
const git = (args) => execFileSync('git', args, { cwd: REPO, stdio: 'pipe', encoding: 'utf8' });
process.env.GIT_SSH_COMMAND = 'ssh -i C:/Users/csmoura1/.ssh/deploy_chamados_pessoal -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new';
try {
  git(['add', 'data/risco.json']);
  const pendente = git(['status', '--porcelain', 'data/risco.json']).trim();
  if (!pendente) { log('nada mudou no risco.json -- nao commitei'); process.exit(0); }
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  git(['commit', '-m', 'Risco ' + hoje + ' (pipeline automatico)']);
  git(['push', 'origin', 'main']);
  log('publicado no GitHub -- a Vercel redeploya sozinha');
} catch (e) {
  fatal('git falhou: ' + (e.stdout || '') + ' ' + (e.stderr || '') + ' ' + e.message);
}
process.exit(0);
