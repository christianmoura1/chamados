// Conserta a foto cortada do report de Campo.
//
// Dois defeitos somados, medidos em 16/10/2026:
//
// 1. O laco que alarga a janela ate o bloco caber NAO CONVERGE. O visual do
//    Power BI e responsivo: ele ocupa a largura da janela, entao `dir` e
//    sempre igual a `janela` e a condicao de parada (dir <= janela - 30) nunca
//    e verdadeira. Medido: 3200 -> 4480 -> 6187, bate no teto de 5200 e
//    desiste deixando a janela gigante.
//
// 2. O filtro `b.width < LIMITE` (LIMITE = innerWidth * 0.85) descarta a
//    PROPRIA TABELA. Como ela tambem e responsiva, largura == innerWidth em
//    qualquer tamanho -- a condicao e impossivel de satisfazer. Medido:
//    janela 3200 -> tabela 3200 (limite 2720); janela 2133 -> tabela 2133
//    (limite 1813). Sobravam so os cartoes, e o recorte fechava na borda
//    deles: 2306px de largura num bloco que ia ate 6187.
//
// O filtro de largura existe para descartar cabecalho e menu do portal. A
// tabela nao precisa dele: ja foi identificada pelo CONTEUDO (tem "Numero",
// "Loja" e "Abertura"), que e criterio seguro.
const fs = require('fs');
const ARQ = 'C:/projetos/chamados/scripts/campo_report.cjs';
let s = fs.readFileSync(ARQ, 'utf8');
const EOL = s.includes('\r\n') ? '\r\n' : '\n';
const L = (...l) => l.join(EOL);
let n = 0;
function troca(de, para, rotulo) {
  const alvo = de.split('\n').join(EOL);
  const p = s.split(alvo);
  if (p.length !== 2) { console.log('FALHOU (' + (p.length - 1) + '): ' + rotulo); process.exit(1); }
  s = p.join(para.split('\n').join(EOL)); n++; console.log('  ok  ' + rotulo);
}

// 1) a tabela entra no recorte sem passar pelo filtro de largura
troca(
  '        if (rt2.width < LIMITE) caixas.push({ left: rt2.left, right: rt2.right, top: rt2.top, bottom: rt2.top + 60 });',
  L(
    '        // A tabela NAO passa pelo filtro de largura: ela e responsiva e ocupa',
    '        // a janela inteira, entao `width < LIMITE` e impossivel de satisfazer',
    '        // e ela era descartada -- era essa a causa da foto cortada. Aqui ela',
    '        // ja foi identificada pelo conteudo (Numero/Loja/Abertura), que basta.',
    '        caixas.push({ left: rt2.left, right: rt2.right, top: rt2.top, bottom: rt2.top + 60 });'
  ),
  'tabela entra no recorte'
);

fs.writeFileSync(ARQ + '.antes-foto-20261016', fs.readFileSync(ARQ));
fs.writeFileSync(ARQ, s, 'utf8');
console.log('');
console.log(n + ' troca. backup: campo_report.cjs.antes-foto-20261016');
