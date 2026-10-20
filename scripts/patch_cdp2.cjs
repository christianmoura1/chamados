// Padroniza o timeout do connectOverCDP em 120s nos scripts que ficaram de
// fora da correcao de 09/10/2026.
//
// Naquele dia eu subi 20s -> 120s nos quatro filhos do pipeline de Risco, mas
// so' neles. O run_daily.cjs do Backlog estava com 15s -- ainda menos -- e em
// 17/10 derrubou cinco execucoes seguidas com "Timeout 15000ms exceeded" e
// "<ws connected>" no log: o websocket conecta, o que demora e o Playwright se
// anexar a cada target do Chrome.
//
// Medido em 17/10: 11 targets, e 15s nao bastou. Nao e questao de quantas abas
// estao abertas -- e margem.
const fs = require('fs');
const ALVOS = [
  ['C:/projetos/chamados/scripts/run_daily.cjs',        'connectOverCDP(CDP, { timeout: 15000 })',                              'connectOverCDP(CDP, { timeout: 120000 })',                              4],
  ['C:/projetos/chamados/scripts/campo_daily.mjs',      "connectOverCDP('http://127.0.0.1:9222', { timeout: 15000 })",          "connectOverCDP('http://127.0.0.1:9222', { timeout: 120000 })",          1],
  ['C:/projetos/chamados/scripts/risco_daily.mjs',      "connectOverCDP('http://127.0.0.1:9222', { timeout: 20000 })",          "connectOverCDP('http://127.0.0.1:9222', { timeout: 120000 })",          1],
  ['C:/projetos/chamados/scripts/risco_extract.mjs',    "connectOverCDP('http://127.0.0.1:9222', { timeout: 20000 })",          "connectOverCDP('http://127.0.0.1:9222', { timeout: 120000 })",          1],
  ['C:/projetos/chamados/scripts/check_bi_stamp.cjs',   "connectOverCDP('http://127.0.0.1:9222')",                              "connectOverCDP('http://127.0.0.1:9222', { timeout: 120000 })",          1],
];
let total = 0;
for (const [arq, de, para, esperado] of ALVOS) {
  if (!fs.existsSync(arq)) { console.log('  AUSENTE  ' + arq); continue; }
  const s = fs.readFileSync(arq, 'utf8');
  const p = s.split(de);
  const achou = p.length - 1;
  const nome = arq.split('/').pop();
  if (achou === 0) {
    console.log('  ' + nome.padEnd(22) + (s.includes('timeout: 120000') ? 'ja estava em 120s' : 'NAO ACHEI o trecho'));
    continue;
  }
  if (achou !== esperado) { console.log('  ' + nome.padEnd(22) + 'ABORTADO: achei ' + achou + ', esperava ' + esperado); continue; }
  fs.writeFileSync(arq + '.antes-cdp120-20261017', s);
  fs.writeFileSync(arq, p.join(para), 'utf8');
  total += achou;
  console.log('  ' + nome.padEnd(22) + 'ok (' + achou + 'x)');
}
console.log('');
console.log(total + ' timeout(s) corrigido(s). backups .antes-cdp120-20261017');
