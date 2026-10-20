const fs = require('fs');
const ARQ = 'C:/projetos/chamados/scripts/campo_report.cjs';
const bruto = fs.readFileSync(ARQ, 'utf8');
const EOL = bruto.includes('\r\n') ? '\r\n' : '\n';
let linhas = bruto.split(/\r?\n/);
let n = 0;

// 1) assinatura da funcao
const iF = linhas.findIndex(l => /^function montaTexto\(c, est, primeira, hora\) \{/.test(l.trim()));
if (iF < 0) { console.log('FALHOU: assinatura de montaTexto'); process.exit(1); }
linhas[iF] = linhas[iF].replace('function montaTexto(c, est, primeira, hora) {',
                                'function montaTexto(c, est, primeira, hora, blocoSup) {');
n++; console.log('  ok  assinatura aceita blocoSup');

// 2) insere o bloco logo apos a linha de impacto + vazia
const iImp = linhas.findIndex(l => l.includes("T.push('*' + c.impacto + ' impacto*');"));
if (iImp < 0) { console.log('FALHOU: linha do impacto'); process.exit(1); }
// a proxima linha e' o T.push('')
const id = (linhas[iImp].match(/^\s*/) || [''])[0];
linhas.splice(iImp + 2, 0, ...[
  id + '// Divisao por supervisor logo abaixo dos numeros. So entra se o bloco foi',
  id + '// montado: quando a leitura da tabela nao bate com o cartao, sai sem ele.',
  id + 'if (blocoSup) { T.push(blocoSup); T.push(\'\'); }',
]);
n++; console.log('  ok  bloco inserido apos os numeros');

// 3) a chamada passa o bloco
const iCall = linhas.findIndex(l => l.includes('montaTexto(c, est, prim, h)') && !l.includes('function'));
if (iCall < 0) {
  const alt = linhas.findIndex(l => /montaTexto\(c, est, prim, h\)/.test(l));
  if (alt < 0) { console.log('FALHOU: chamada de montaTexto'); process.exit(1); }
}
let trocou = 0;
linhas = linhas.map(l => {
  if (l.includes('montaTexto(c, est, prim, h)')) { trocou++; return l.replace('montaTexto(c, est, prim, h)', 'montaTexto(c, est, prim, h, blocoSup)'); }
  return l;
});
console.log('  ok  ' + trocou + ' chamada(s) passam blocoSup');
n++;

fs.writeFileSync(ARQ, linhas.join(EOL), 'utf8');
console.log('');
console.log(n + ' trocas gravadas.');
