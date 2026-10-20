// Quem e' o supervisor de cada loja da Regional Sul.
//
// A carteira ja existia em sup_hardcoded.json (4 supervisores, 71 lojas) e e' a
// MESMA que o report de risco usa. Nao fiz uma segunda copia de proposito: duas
// listas da mesma carteira divergem na primeira troca de loja e ninguem percebe.
//
// Casa pela LOJA, nao pelo setor. "GRANDE CURITIBA" esta na carteira do Gustavo
// E na do Carlos Magno, entao setor sozinho erraria exatamente nas lojas de
// Curitiba. O setor so' entra como ultimo recurso, e so' quando pertence a um
// unico supervisor -- nos ambiguos devolve vazio em vez de chutar.
const fs = require('fs');

const CARTEIRA = 'C:/projetos/climapro-bot/sup_hardcoded.json';

// "SAO" tem que casar com "SÃO": a carteira foi digitada sem acento em varios
// pontos e o SOMA devolve com acento. Foi assim que a rota tecnica perdeu uma
// loja em setembro.
const norm = (s) => String(s || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toUpperCase().replace(/[^A-Z0-9]/g, '');

// O SOMA manda "21529 - PARTAGE SHOP RIO GRANDE"; a carteira guarda so' o nome.
const semBkn = (s) => String(s || '').replace(/^\s*\d{4,6}\s*-\s*/, '');

function carrega() {
  const sup = JSON.parse(fs.readFileSync(CARTEIRA, 'utf8'));
  const porLoja = new Map();
  const donos = new Map();
  for (const s of sup) {
    for (const l of (s.lojas || [])) porLoja.set(norm(l), s.nome);
    for (const t of (s.setores || [])) {
      const k = norm(t);
      if (!donos.has(k)) donos.set(k, new Set());
      donos.get(k).add(s.nome);
    }
  }
  const porSetor = new Map();
  const setoresAmbiguos = [];
  for (const [k, nomes] of donos) {
    if (nomes.size === 1) porSetor.set(k, [...nomes][0]);
    else setoresAmbiguos.push(k);
  }
  return { porLoja, porSetor, setoresAmbiguos, supervisores: sup.map((s) => s.nome) };
}

let cache = null;
function supervisorDe(loja, setor) {
  if (!cache) cache = carrega();
  return cache.porLoja.get(norm(semBkn(loja)))
    || cache.porSetor.get(norm(setor))
    || '';
}

module.exports = { supervisorDe, carrega, norm, semBkn };
