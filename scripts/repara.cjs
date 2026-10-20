// Repara o que o heredoc comeu. Cada barra e cada caractere especial e
// montado por fromCharCode, que nao passa por escape nenhum.
const fs = require('fs');
const ARQ = 'C:/projetos/chamados/scripts/campo_report.cjs';
const B  = String.fromCharCode(92);   // \
const NL = B + 'n';                   // \n literal no arquivo
const TRAV = String.fromCharCode(0x2014); // em dash
const BULL = String.fromCharCode(0x2022); // bullet
let s = fs.readFileSync(ARQ, 'utf8');
let n = 0;
function troca(de, para, rotulo) {
  const p = s.split(de);
  if (p.length < 2) { console.log('  -- nao achei: ' + rotulo); return; }
  s = p.join(para); n += p.length - 1; console.log('  ok (' + (p.length-1) + 'x) ' + rotulo);
}
troca("replace(/s+/g, ' ')", 'replace(/' + B + 's+/g, ' + "' '" + ')', 'nz: classe de espaco');
troca("replace(/^s*d{4,6}s*-s*/, '')",
      'replace(/^' + B + 's*' + B + 'd{4,6}' + B + 's*-' + B + "s*/, '')", 'loja: tira o codigo');
troca("replace(/^[A-Z]{3}s*-s*/, '')",
      'replace(/^[A-Z]{3}' + B + 's*-' + B + "s*/, '')", 'problema: tira o prefixo');
troca('B.join(\'\n\').trim();', "B.join('" + NL + "').trim();", 'join com quebra de linha');
troca('push(loja + " - " + prob)', 'push(loja + " ' + TRAV + ' " + prob)', 'travessao entre loja e problema');
troca("B.push(' ' + t)", "B.push('" + BULL + " ' + t)", 'bullet dos itens');
fs.writeFileSync(ARQ, s, 'utf8');
console.log('');
console.log(n + ' correcoes.');
