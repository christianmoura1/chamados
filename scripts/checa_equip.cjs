const fs = require('fs');
const csv = fs.readFileSync('C:/projetos/mordomo/downloads/soma/visao_sul_2026-09-09.csv', 'utf8');
function parseCSV(texto) {
  const linhas = [];
  let campo = '', linha = [], dentroAspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i], prox = texto[i+1];
    if (dentroAspas) {
      if (c === '"' && prox === '"') { campo += '"'; i++; }
      else if (c === '"') { dentroAspas = false; }
      else campo += c;
    } else {
      if (c === '"') dentroAspas = true;
      else if (c === ',') { linha.push(campo); campo = ''; }
      else if (c === '\r') {}
      else if (c === '\n') { linha.push(campo); campo=''; linhas.push(linha); linha=[]; }
      else campo += c;
    }
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas;
}
const linhas = parseCSV(csv);
const header = linhas[0];
const dados = linhas.slice(1).filter(l => l.length === header.length);
const iDesc = header.indexOf('short_description');
const iPrior = header.indexOf('priority');

console.log('--- valores unicos de priority ---');
const prior = {};
dados.forEach(l => { const p = l[iPrior]||'(vazio)'; prior[p]=(prior[p]||0)+1; });
Object.entries(prior).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>console.log('  '+k+': '+v));

console.log('\n--- amostra de short_description (primeiros 30) ---');
dados.slice(0,30).forEach(l => console.log('  ' + l[iDesc]));

console.log('\n--- tentativa de extrair "equipamento" (texto antes do primeiro "|") ---');
const equip = {};
dados.forEach(l => {
  const desc = l[iDesc] || '';
  const antes = desc.split('|')[0].trim();
  // remove codigo tipo "BK080429 - " no inicio
  const semCodigo = antes.replace(/^[A-Z0-9]+\s*-\s*/, '').trim();
  const chave = semCodigo || '(sem descricao)';
  equip[chave] = (equip[chave]||0)+1;
});
const top = Object.entries(equip).sort((a,b)=>b[1]-a[1]).slice(0,25);
top.forEach(([k,v])=>console.log('  '+v+'  '+k));
console.log('total categorias distintas: ' + Object.keys(equip).length);
