// Timeout do connectOverCDP nos filhos do pipeline de Risco: 20s -> 120s.
//
// Por que: medido em 09/10/2026 15:10, o Chrome da VPS tinha 14 targets
// (10 abas, 4 delas Power BI). O Playwright se anexa a TODOS antes de
// devolver o controle, e com a aba de risco recem-recarregada o passo
// "matriz de risco" levou 19s -- um segundo abaixo do limite. O passo
// seguinte cruzou e o pipeline morreu com resultado=1.
//
// O numero 20000 nunca foi medido: e' o default que eu copiei de script
// de uso unico, quando o Chrome tinha 2 ou 3 abas abertas.
const fs = require('fs');
const BOT = 'C:/projetos/climapro-bot/';
const ALVOS = ['extrai_risco_v4.mjs', 'extrai_risco_v2.mjs',
  'extrai_chamados_risco.mjs', 'extrai_dias_atraso_v2.mjs'];

const DE = "connectOverCDP('http://127.0.0.1:9222', { timeout: 20000 })";
const PARA = "connectOverCDP('http://127.0.0.1:9222', { timeout: 120000 })";

let n = 0;
for (const a of ALVOS) {
  const arq = BOT + a;
  if (!fs.existsSync(arq)) { console.log('  AUSENTE  ' + a); continue; }
  const s = fs.readFileSync(arq, 'utf8');
  const p = s.split(DE);
  if (p.length === 1) {
    const ja = s.includes('timeout: 120000');
    console.log('  ' + (ja ? 'ja estava 120s' : 'NAO ACHEI o trecho') + '  ' + a);
    continue;
  }
  fs.writeFileSync(arq + '.antes-cdp120-20261009', s);
  fs.writeFileSync(arq, p.join(PARA), 'utf8');
  n++;
  console.log('  ok (' + (p.length - 1) + ' troca)  ' + a);
}
console.log('');
console.log(n + ' arquivo(s) alterado(s). backups .antes-cdp120-20261009');
