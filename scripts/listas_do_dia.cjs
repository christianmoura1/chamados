// Listas do dia para o painel Backlog.
// O CSV de fechados do SOMA ja vem com 14 dias (closed_at>=daysAgoStart(14)).
// ultimosFechados continua sendo so os 10 mais recentes. fechadosHoje e a
// lista inteira do dia civil em America/Sao_Paulo. Nao ha outro arquivo
// com fechamentos mais antigos do mesmo dia: se o export do SOMA cortar
// linhas, so o que veio no CSV entra aqui.
const CATEGORIAS = [
  { nome: 'Máquina de Sorvete', re: /SORVETE/i },
  { nome: 'Fritadeira', re: /FRITADEIRA/i },
  { nome: 'Micro-ondas', re: /MICRO\s*-?\s*ONDAS|MICROONDAS|\bMCR\b/i },
  { nome: 'PHU', re: /\bPHU\b/i },
  { nome: 'Broiler', re: /BROILER|\bBRO\b/i },
  { nome: 'Tostadeira', re: /TOSTADEIRA|TOSTADORA|\bTST\b/i },
];

function parseCSV(texto) {
  const linhas = [];
  let campo = '', linha = [], dentroAspas = false;
  const src = String(texto || '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i], prox = src[i + 1];
    if (dentroAspas) {
      if (c === '"' && prox === '"') { campo += '"'; i++; }
      else if (c === '"') { dentroAspas = false; }
      else campo += c;
    } else {
      if (c === '"') dentroAspas = true;
      else if (c === ',') { linha.push(campo); campo = ''; }
      else if (c === '\r') { /* ignora */ }
      else if (c === '\n') { linha.push(campo); campo = ''; linhas.push(linha); linha = []; }
      else campo += c;
    }
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas;
}

function ymdSaoPaulo(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

function ymdDeDataBR(s) {
  const m = String(s || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? m[3] + '-' + m[2] + '-' + m[1] : '';
}

function instanteBR(s) {
  const m = String(s || '').match(/(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return '';
  return m[3] + m[2] + m[1] + (m[4] || '00') + (m[5] || '00') + (m[6] || '00');
}

function prioridadeSOMA(prior) {
  const p = String(prior || '');
  if (/cr[ií]tica/i.test(p)) return 'SOS';
  if (/^2\s*-\s*alta/i.test(p)) return 'Alta';
  return 'Normal';
}

function ehAltaOuSos(p) {
  return p === 'SOS' || p === 'Alta';
}

function nomeEquipamento(problema) {
  const t = String(problema || '');
  const cat = CATEGORIAS.find((c) => c.re.test(t));
  return cat ? cat.nome : '';
}

function ehEquipamentoMonitorado(problema) {
  return !!nomeEquipamento(problema);
}

function diasEntre(de, ate) {
  const p = (x) => {
    const m = String(x || '').match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
    return m ? new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +m[6]) : null;
  };
  const a = p(de), b = p(ate);
  if (!a || !b) return null;
  return Math.max(0, Math.floor((b - a) / 86400000));
}

function parseFechadosCsv(csvTexto, supervisorDe) {
  if (!csvTexto) return [];
  const linhas = parseCSV(csvTexto);
  if (linhas.length < 2) return [];
  const cab = linhas[0].map((x) => String(x || '').trim());
  const iNum = cab.indexOf('number');
  const iFech = cab.indexOf('closed_at');
  const iLoja = cab.indexOf('opened_for.name');
  const iPor = cab.indexOf('closed_by');
  const iAb = cab.indexOf('opened_at');
  const iPrior = cab.indexOf('priority');
  const iProb = cab.indexOf('short_description');
  const iSetor = cab.indexOf('opened_for.u_bk_sector');
  if (iNum < 0 || iFech < 0) return [];
  const fora = [];
  const quem = typeof supervisorDe === 'function' ? supervisorDe : () => '';
  for (let i = 1; i < linhas.length; i++) {
    const l = linhas[i];
    const numero = String(l[iNum] || '').trim();
    const fechadoEm = String(l[iFech] || '').trim();
    if (!numero || !fechadoEm) continue;
    const loja = iLoja >= 0 ? String(l[iLoja] || '').trim() : '';
    const setor = iSetor >= 0 ? String(l[iSetor] || '').trim() : '';
    const fechadoPor = iPor >= 0 ? String(l[iPor] || '').trim() : '';
    const abertoEm = iAb >= 0 ? String(l[iAb] || '').trim() : '';
    const problema = iProb >= 0 ? String(l[iProb] || '').trim() : '';
    const prioridade = iPrior >= 0 ? prioridadeSOMA(l[iPrior]) : 'Normal';
    const dias = diasEntre(abertoEm, fechadoEm);
    const equipamento = nomeEquipamento(problema);
    fora.push({
      numero, fechadoEm, abertoEm, dias, prioridade, problema, loja,
      fechadoPor, supervisor: quem(loja, setor) || '',
      equipamento,
      abertura: ymdDeDataBR(abertoEm),
    });
  }
  fora.sort((a, b) => instanteBR(b.fechadoEm).localeCompare(instanteBR(a.fechadoEm)) || String(b.numero).localeCompare(String(a.numero)));
  return fora;
}

function doDia(lista, ymd, campo) {
  return (lista || []).filter((f) => f && ymdDeDataBR(f[campo]) === ymd);
}

function contarAltaSosEquipamento(lista) {
  return (lista || []).filter((c) => ehAltaOuSos(c.prioridade) && (c.equipamento || ehEquipamentoMonitorado(c.problema))).length;
}

module.exports = {
  parseCSV,
  ymdSaoPaulo,
  ymdDeDataBR,
  instanteBR,
  prioridadeSOMA,
  ehAltaOuSos,
  nomeEquipamento,
  ehEquipamentoMonitorado,
  parseFechadosCsv,
  doDia,
  contarAltaSosEquipamento,
};
