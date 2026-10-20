import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/projetos/certponto-report/node_modules/playwright');
const fs = require('fs');

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222', { timeout: 20000 });
const ctx = browser.contexts()[0];
let page = null;
for (const p of ctx.pages()) {
  if (p.url().includes('reports/e07d5c63-3ebb-4102-95bf-98a5eac89373/2efd4d969ee24a7d6426')) page = p;
}
if (!page) { console.log('aba nao encontrada'); process.exit(1); }
await page.bringToFront();
await page.waitForTimeout(1000);

const texto = await page.evaluate(() => document.body.innerText);
const mAtualizado = texto.match(/Última Atualização\s*\n?\s*(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2})/);
const atualizadoEm = mAtualizado ? mAtualizado[1] : null;

// "Em Aberto por Regional" e "Em Aberto por Item" -- pega os blocos de texto
// entre os titulos conhecidos, na ordem fixa em que o Power BI os lista.
function bloco(txt, titulo, proximoTitulo) {
  const i = txt.indexOf(titulo);
  if (i < 0) return null;
  const fim = proximoTitulo ? txt.indexOf(proximoTitulo, i) : -1;
  return txt.slice(i + titulo.length, fim > i ? fim : i + 400);
}
const blocoRegional = bloco(texto, 'Em Aberto por Regional', 'Em Aberto por Item') || '';
const blocoItem = bloco(texto, 'Em Aberto por Item', 'MATRIZ DE RISCO') || '';

await page.evaluate(() => {
  const containers = [...document.querySelectorAll('.visualContainer')]
    .filter((c) => !/visualContainerHost/.test(c.className));
  let alvo = null, area = 0;
  for (const c of containers) {
    const t = c.innerText || '';
    if (/SCI/.test(t) && /Dutos/.test(t) && /Score/.test(t)) {
      const r = c.getBoundingClientRect();
      if (r.width * r.height > area) { area = r.width * r.height; alvo = c; }
    }
  }
  window.__matrizEl = alvo;
  const scrollables = [...alvo.querySelectorAll('*')].filter((e) => e.scrollHeight > e.clientHeight + 20 && e.clientHeight > 50);
  scrollables.sort((a, b) => (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight));
  window.__scrollEl = scrollables[0] || null;
  if (window.__scrollEl) window.__scrollEl.scrollTop = 0;
});
await page.waitForTimeout(300);

async function captura() {
  return page.evaluate(() => {
    const el = window.__matrizEl;
    const lojas = [...el.querySelectorAll('.pivotTableCellWrap.cell-interactive.tablixAlignLeft')]
      .map((e) => { const r = e.getBoundingClientRect(); return { nome: e.innerText.trim(), y: Math.round(r.y) }; });
    const scores = [...el.querySelectorAll('.pivotTableCellNoWrap.tablixAlignCenter')]
      .map((e) => { const r = e.getBoundingClientRect(); return { valor: e.innerText.trim(), x: Math.round(r.x), y: Math.round(r.y) }; })
      .filter((s) => s.x > 830 && s.x < 900 && /^\d+$/.test(s.valor));
    const svgs = [...el.querySelectorAll('svg')];
    const icones = svgs.map((svg) => {
      const r = svg.getBoundingClientRect();
      const label = svg.getAttribute('aria-label') || svg.parentElement?.getAttribute('title') || '';
      return { x: Math.round(r.x), y: Math.round(r.y), vermelho: /vermelho/i.test(label) };
    }).filter((i) => i.y > 240);
    return { lojas, scores, icones };
  });
}

let todasLojas = [], todosScores = [], todosIcones = [];
const scrollInfo = await page.evaluate(() => window.__scrollEl ? { sh: window.__scrollEl.scrollHeight, ch: window.__scrollEl.clientHeight } : null);
// passo pequeno (35% da altura visivel) + espera maior: o grid virtualiza
// linhas e precisa de tempo pra renderizar antes da proxima captura, senao
// perdemos linhas inteiras no meio do scroll.
const passos = scrollInfo ? Math.ceil(scrollInfo.sh / (scrollInfo.ch * 0.6)) + 3 : 1;

for (let i = 0; i < passos; i++) {
  const { lojas, scores, icones } = await captura();
  todasLojas.push(...lojas); todosScores.push(...scores); todosIcones.push(...icones);
  const fim = await page.evaluate(() => {
    const el = window.__scrollEl;
    if (!el) return true;
    const antes = el.scrollTop;
    el.scrollTop = Math.min(el.scrollTop + el.clientHeight * 0.6, el.scrollHeight);
    return el.scrollTop === antes || el.scrollTop + el.clientHeight >= el.scrollHeight - 2;
  });
  await page.waitForTimeout(450);
  if (fim) { const last = await captura(); todasLojas.push(...last.lojas); todosScores.push(...last.scores); todosIcones.push(...last.icones); break; }
}

// dedup por y arredondado (bucket de 5px, cobre jitter entre capturas de scroll)
function dedupPorY(arr, chaveExtra = () => '') {
  const vistos = new Map();
  for (const item of arr) {
    const chave = `${Math.round(item.y / 4)}|${chaveExtra(item)}`;
    if (!vistos.has(chave)) vistos.set(chave, item);
  }
  return [...vistos.values()];
}
const lojasUnicas = dedupPorY(todasLojas).sort((a, b) => a.y - b.y);
const scoresUnicos = dedupPorY(todosScores).sort((a, b) => a.y - b.y);

const colunas = [
  { chave: 'sci', nome: 'SCI', min: 510, max: 565 },
  { chave: 'dutos', nome: 'Dutos', min: 566, max: 610 },
  { chave: 'rotaSeguranca', nome: 'Rota Segurança', min: 611, max: 674 },
  { chave: 'rotaPadroes', nome: 'Rota Padrões', min: 675, max: 729 },
];
function colunaDoX(x) { return colunas.find((c) => x >= c.min && x <= c.max) || null; }
const iconesUnicos = dedupPorY(todosIcones, (i) => colunaDoX(i.x)?.chave || 'x' + i.x);

// associa cada loja (por y mais proximo) ao score e aos icones das 4 colunas
function lojaMaisProxima(y) {
  let melhor = null, dist = Infinity;
  for (const l of lojasUnicas) { const d = Math.abs(l.y - y); if (d < dist) { dist = d; melhor = l; } }
  return dist <= 6 ? melhor : null;
}

const porLoja = new Map();
for (const l of lojasUnicas) porLoja.set(l.nome, { nome: l.nome, score: null, sci: null, dutos: null, rotaSeguranca: null, rotaPadroes: null });
for (const s of scoresUnicos) {
  const l = lojaMaisProxima(s.y);
  if (l && porLoja.has(l.nome)) porLoja.get(l.nome).score = Number(s.valor);
}
for (const ic of iconesUnicos) {
  const col = colunaDoX(ic.x);
  if (!col) continue;
  const l = lojaMaisProxima(ic.y);
  if (l && porLoja.has(l.nome)) porLoja.get(l.nome)[col.chave] = ic.vermelho ? 'vencido' : 'emDia';
}

// nao exige score pra contar a loja: a coluna de icones (SCI/Dutos/RotaSeg/
// RotaPad) tem cobertura mais confiavel que a de Score no scroll virtualizado
// -- exigir score derrubava a amostra de ~81 pra ~40 lojas sem necessidade,
// ja que o Score so' e' usado pra ordenar a lista de "mais urgentes".
const lojasFinal = [...porLoja.values()].filter((l) => l.sci !== null || l.dutos !== null || l.rotaSeguranca !== null || l.rotaPadroes !== null);

const categorias = colunas.map((c) => {
  const vencidas = lojasFinal.filter((l) => l[c.chave] === 'vencido');
  const emDia = lojasFinal.filter((l) => l[c.chave] === 'emDia');
  return {
    chave: c.chave,
    nome: c.nome,
    vencido: vencidas.length,
    emDia: emDia.length,
    total: vencidas.length + emDia.length,
    pctVencido: vencidas.length + emDia.length ? Math.round((100 * vencidas.length) / (vencidas.length + emDia.length)) : 0,
    lojasVencidas: vencidas.sort((a, b) => (b.score ?? -1) - (a.score ?? -1)).map((l) => ({ nome: l.nome, score: l.score })),
  };
});

const comScore = lojasFinal.filter((l) => l.score !== null);
const scoreMedio = comScore.length ? +(comScore.reduce((s, l) => s + l.score, 0) / comScore.length).toFixed(2) : null;

// "Em Aberto por Item": nomes dos itens seguidos pelos numeros (atrasado,
// depois no prazo quando existir) -- o texto vem linearizado pelo innerText,
// entao interpretamos posicionalmente pela ordem conhecida do grafico.
function parseAbertoPorItem(txt) {
  const linhas = txt.split('\n').map((l) => l.trim()).filter(Boolean);
  const nomes = [];
  const numeros = [];
  for (const l of linhas) {
    if (/^\d+$/.test(l)) numeros.push(Number(l));
    else if (l !== 'Atrasado' && l !== 'No Prazo') nomes.push(l);
  }
  // os numeros vem todos juntos (atrasado de cada item, depois no-prazo dos
  // que tiverem) -- pareamos so' os primeiros N (atrasado) com os nomes, que
  // e' o dado confiavel; resto fica bruto pra nao inventar associacao errada.
  return nomes.map((nome, i) => ({ nome, atrasado: numeros[i] ?? null }));
}
const abertoPorItem = parseAbertoPorItem(blocoItem);

const saida = {
  atualizadoEm,
  geradoEm: new Date().toISOString(),
  totalLojasAvaliadas: lojasFinal.length,
  scoreMedio,
  categorias,
  abertoPorItemBruto: blocoItem.split('\n').map((l) => l.trim()).filter(Boolean),
  abertoPorRegionalBruto: blocoRegional.split('\n').map((l) => l.trim()).filter(Boolean),
};

fs.writeFileSync('C:/projetos/climapro-bot/risco_final.json', JSON.stringify(saida, null, 1));
console.log('lojas com dados completos (score):', lojasFinal.length);
console.log('categorias:', JSON.stringify(categorias.map((c) => ({ nome: c.nome, vencido: c.vencido, emDia: c.emDia, pct: c.pctVencido })), null, 1));
console.log('scoreMedio:', scoreMedio, 'atualizadoEm:', atualizadoEm);
console.log('salvo em risco_final.json');

await browser.close().catch(() => {});
