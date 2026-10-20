const fs = require('fs');
const ARQ = 'C:/projetos/chamados/scripts/campo_report.cjs';
const bruto = fs.readFileSync(ARQ, 'utf8');
const EOL = bruto.includes('\r\n') ? '\r\n' : '\n';
const linhas = bruto.split(/\r?\n/);
const i = linhas.findIndex((l) => /for \(let k = 0; k < 3; k\+\+\) \{/.test(l));
if (i < 0) { console.log('FALHOU: nao achei o laco'); process.exit(1); }
const ident = (linhas[i].match(/^\s*/) || [''])[0];
console.log('  laco na linha ' + (i + 1) + ', indentacao de ' + ident.length + ' espacos');
const comentario = [
  'LACO DESLIGADO (k < 0) em 16/10/2026, mantido para registro.',
  '',
  'Ele alargava a janela ate o bloco caber. Nao converge: o visual do',
  'Power BI e responsivo e cresce junto com a janela, entao `dir` e sempre',
  'igual a `janela` e a parada (dir <= janela - 30) nunca e verdadeira.',
  'Medido: 3200 -> 4480 -> 6187, batia no teto de 5200 e desistia deixando',
  'a janela gigante -- o que inflava o LIMITE e baguncava o recorte.',
  '',
  'Com a tabela entrando na medicao (ver mais abaixo), a janela fixa de',
  '2400 ja basta: o bloco se acomoda nela sozinho.',
].map((t) => ident + (t ? '// ' + t : '//'));
linhas.splice(i, 1, ...comentario, ident + 'for (let k = 0; k < 0; k++) {');
fs.writeFileSync(ARQ, linhas.join(EOL), 'utf8');
console.log('  ok  laco desligado');
