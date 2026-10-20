// Acrescenta o bloco por supervisor ao report de Campo. Pedido do Christian
// em 19/10/2026: nome em negrito, loja e problema embaixo de cada um.
//
// O cruzamento e por SETOR, que a propria tabela do BI ja traz na coluna 4.
// Mesma regua validada na Perda de Receita: o dados.json do Backlog declara
// os setores de cada supervisor. GRANDE CURITIBA esta em dois (Gustavo e
// Carlos Magno) e o Christian confirmou que e do Carlos Magno.
const fs = require('fs');
const ARQ = 'C:/projetos/chamados/scripts/campo_report.cjs';
const bruto = fs.readFileSync(ARQ, 'utf8');
const EOL = bruto.includes('\r\n') ? '\r\n' : '\n';
let linhas = bruto.split(/\r?\n/);
let n = 0;

// ---- 1) extrai as linhas da tabela junto com os cartoes ----
const iRet = linhas.findIndex(l => l.includes('return { regSel: regSel, cartoes: out, carimbo: carimbo };'));
if (iRet < 0) { console.log('FALHOU: nao achei o return do tela'); process.exit(1); }
const id = (linhas[iRet].match(/^\s*/) || [''])[0];
linhas.splice(iRet, 1, ...[
  id + '// Linhas da tabela de chamados: numero, setor, loja e problema. O setor',
  id + '// (coluna 4) e o que permite agrupar por supervisor.',
  id + "const chamados = [...document.querySelectorAll('[role=\"row\"]')]",
  id + "  .filter((e) => /WO\d{6,}/.test(L(e.innerText)))",
  id + "  .map((e) => [...e.querySelectorAll('[role=\"gridcell\"],[role=\"cell\"]')].map((cc) => L(cc.innerText)))",
  id + '  .filter((cs) => cs.length >= 15)',
  id + '  .map((cs) => ({ numero: cs[1], setor: cs[4], loja: cs[5], problema: cs[14] }));',
  id + 'return { regSel: regSel, cartoes: out, carimbo: carimbo, chamados: chamados };',
]);
n++; console.log('  ok  extracao das linhas da tabela');

// ---- 2) monta o bloco e passa para montaTexto ----
const iLog = linhas.findIndex(l => l.includes("log('cartoes: ' + JSON.stringify(c));"));
if (iLog < 0) { console.log('FALHOU: nao achei o log dos cartoes'); process.exit(1); }
const id2 = (linhas[iLog].match(/^\s*/) || [''])[0];
linhas.splice(iLog + 1, 0, ...[
  '',
  id2 + '// ---- agrupamento por supervisor ----',
  id2 + '// Se a contagem lida da tabela nao bater com o cartao, NAO monto o bloco:',
  id2 + '// melhor sair sem ele do que publicar uma divisao incompleta (a tabela do',
  id2 + '// BI pagina quando tem muita linha).',
  id2 + 'let blocoSup = null;',
  id2 + 'try {',
  id2 + "  const bl = JSON.parse(fs.readFileSync('C:/projetos/chamados/data/dados.json', 'utf8'));",
  id2 + "  const nz = (x) => String(x || '').toUpperCase().replace(/\s+/g, ' ').trim();",
  id2 + '  const mapa = {};',
  id2 + '  for (const s of (bl.supervisores || [])) {',
  id2 + '    for (const st of (s.setores || [])) {',
  id2 + '      const k = nz(st);',
  id2 + "      if (k === 'GRANDE CURITIBA') { mapa[k] = 'CARLOS MAGNO'; continue; }",
  id2 + '      if (!mapa[k]) mapa[k] = s.nome;',
  id2 + '    }',
  id2 + '  }',
  id2 + '  const lidos = tela.chamados || [];',
  id2 + '  if (lidos.length !== c.emExecucao) {',
  id2 + "    log('AVISO: li ' + lidos.length + ' linha(s) da tabela e o cartao diz ' + c.emExecucao",
  id2 + "      + ' -- vou sem o bloco por supervisor');",
  id2 + '  } else {',
  id2 + "    const CURTO = { 'CARLOS MAGNO': 'Magno', RAFAEL: 'Rafael', GUSTAVO: 'Gustavo', MARCEL: 'Marcel' };",
  id2 + "    const ORDEM = ['CARLOS MAGNO', 'RAFAEL', 'GUSTAVO', 'MARCEL'];",
  id2 + '    const porSup = {};',
  id2 + '    for (const x of lidos) {',
  id2 + "      const sup = mapa[nz(x.setor)] || 'SEM SUPERVISOR';",
  id2 + "      const loja = String(x.loja || '').replace(/^\s*\d{4,6}\s*-\s*/, '').trim();",
  id2 + "      const prob = String(x.problema || '').replace(/^[A-Z]{3}\s*-\s*/, '').trim();",
  id2 + '      (porSup[sup] = porSup[sup] || []).push(loja + " \u2014 " + prob);',
  id2 + '    }',
  id2 + '    const B = [];',
  id2 + '    for (const k of ORDEM) {',
  id2 + '      const cs = porSup[k] || [];',
  id2 + '      if (!cs.length) continue;',
  id2 + "      B.push('*' + (CURTO[k] || k) + '* (' + cs.length + ')');",
  id2 + "      for (const t of cs) B.push('\u2022 ' + t);",
  id2 + "      B.push('');",
  id2 + '    }',
  id2 + "    const zerados = ORDEM.filter((k) => !(porSup[k] || []).length).map((k) => CURTO[k] || k);",
  id2 + "    if (zerados.length) B.push('_Sem chamados: ' + zerados.join(', ') + '_');",
  id2 + "    if (porSup['SEM SUPERVISOR']) {",
  id2 + "      B.push('');",
  id2 + "      B.push('*Sem supervisor* (' + porSup['SEM SUPERVISOR'].length + ')');",
  id2 + "      for (const t of porSup['SEM SUPERVISOR']) B.push('\u2022 ' + t);",
  id2 + '    }',
  id2 + "    blocoSup = B.join('\n').trim();",
  id2 + "    log('bloco por supervisor: ' + lidos.length + ' chamado(s) distribuido(s)');",
  id2 + '  }',
  id2 + "} catch (e) { log('AVISO: nao montei o bloco por supervisor (' + String(e.message).slice(0, 70) + ')'); }",
]);
n++; console.log('  ok  montagem do bloco por supervisor');

fs.writeFileSync(ARQ + '.antes-supervisor-20261019', bruto);
fs.writeFileSync(ARQ, linhas.join(EOL), 'utf8');
console.log('');
console.log(n + ' trocas. backup: campo_report.cjs.antes-supervisor-20261019');
