const fs = require('fs');
const ARQ = 'C:/projetos/chamados/scripts/perda_sul.mjs';
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

troca(
  '  const itens = corretivos.map((c) => {',
  L(
    '  // ---- supervisor por SETOR, lido do dados.json do Backlog ----',
    '  //',
    '  // O painel (perda.html) espera o campo `supervisor` pronto em cada chamado:',
    '  // sem ele cai no rotulo "SEM SUPERVISOR" e o farol vira um card so. Essa',
    '  // etapa nunca existiu aqui -- o enriquecimento vivia no pipeline completo da',
    '  // perdadereceita, que ficou sem tarefa agendada em 11/10/2026.',
    '  //',
    '  // Cruzo por SETOR, nao por nome de loja: o dados.json ja declara os setores',
    '  // de cada supervisor e o chamado ja traz o setor. Medido em 16/10/2026:',
    '  // casa 162 de 165. Os 3 restantes vem do SOMA sem setor preenchido.',
    '  // O metodo antigo (casar nome de loja normalizado) acertava ~76%.',
    '  const DADOS_BACKLOG = DESTINO.replace(/chamados-abertos-perda\.json$/, \'dados.json\');',
    '  const normSetor = (x) => String(x || \'\').toUpperCase().replace(/\s+/g, \' \').trim();',
    '  const mapaSup = {};',
    '  try {',
    '    const bl = JSON.parse(fs.readFileSync(DADOS_BACKLOG, \'utf8\'));',
    '    for (const sup of (bl.supervisores || [])) {',
    '      for (const st of (sup.setores || [])) {',
    '        const k = normSetor(st);',
    '        // GRANDE CURITIBA esta cadastrado em DOIS supervisores (Gustavo e',
    '        // Carlos Magno). O Christian confirmou em 16/10/2026 que e do Carlos',
    '        // Magno. Fixo aqui para nao depender da ordem do array, que hoje',
    '        // acerta por acidente -- vence quem vier por ultimo.',
    '        if (k === \'GRANDE CURITIBA\') { mapaSup[k] = \'CARLOS MAGNO\'; continue; }',
    '        if (!mapaSup[k]) mapaSup[k] = sup.nome;',
    '      }',
    '    }',
    '    log(\'mapa de supervisor: \' + Object.keys(mapaSup).length + \' setor(es) de \'',
    '      + (bl.supervisores || []).length + \' supervisor(es)\');',
    '  } catch (e) {',
    '    log(\'ATENCAO: nao li o dados.json do Backlog (\' + String(e.message).slice(0, 60)',
    '      + \') -- os chamados vao SEM supervisor e o farol fica num card so\');',
    '  }',
    '',
    '  const itens = corretivos.map((c) => {'
  ),
  'mapa setor -> supervisor'
);

troca(
  "      setor: c['opened_for.u_bk_sector'] || '',",
  L(
    "      setor: c['opened_for.u_bk_sector'] || '',",
    "      supervisor: mapaSup[normSetor(c['opened_for.u_bk_sector'])] || '',"
  ),
  'campo supervisor no item'
);

troca(
  "  log('criticos (param a venda): ' + itens.filter((i) => i.critica).length);",
  L(
    "  log('criticos (param a venda): ' + itens.filter((i) => i.critica).length);",
    "  const comSup = itens.filter((i) => i.supervisor).length;",
    "  log('com supervisor: ' + comSup + ' de ' + itens.length",
    "    + (comSup < itens.length ? '  (sem setor na origem: ' + (itens.length - comSup) + ')' : ''));"
  ),
  'log de cobertura'
);

fs.writeFileSync(ARQ + '.antes-supervisor-20261016', fs.readFileSync(ARQ));
fs.writeFileSync(ARQ, s, 'utf8');
console.log('');
console.log(n + ' trocas. backup: perda_sul.mjs.antes-supervisor-20261016');
