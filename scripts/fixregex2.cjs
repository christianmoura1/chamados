// Repoe as barras comidas pelo heredoc. Monto cada uma com fromCharCode(92).
const fs = require('fs');
const B = String.fromCharCode(92);
const ARQ = 'C:/projetos/chamados/scripts/perda_sul.mjs';
let s = fs.readFileSync(ARQ, 'utf8');
let n = 0;
function troca(de, para, rotulo) {
  const p = s.split(de);
  if (p.length !== 2) { console.log('FALHOU (' + (p.length - 1) + '): ' + rotulo); process.exit(1); }
  s = p.join(para); n++; console.log('  ok  ' + rotulo);
}
troca('/chamados-abertos-perda.json$/', '/chamados-abertos-perda' + B + '.json$/', 'ponto literal no nome do arquivo');
troca('.replace(/s+/g, \' \')', '.replace(/' + B + 's+/g, \' \')', 'classe de espaco em branco');
fs.writeFileSync(ARQ, s, 'utf8');
console.log('');
console.log(n + ' correcoes.');
