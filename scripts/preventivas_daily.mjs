// Painel de PREVENTIVAS - Sul
//
// De onde vem: tabela wm_task do SOMA (as tarefas, prefixo WOT), filtrada por
//   opened_for.u_bk_work_center = CSUL   -> regional Sul
//   work_type = Preventiva               -> filtrado AQUI, no cliente, porque
//                                           work_type=... na query do SOMA
//                                           volta vazio (e' referencia)
//
// Saida: data/preventivas.json, no mesmo formato dos outros paineis.
//
// Uso: node scripts\preventivas_daily.mjs [--sem-publicar]

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/projetos/certponto-report/node_modules/playwright');
import fs from 'fs';
import { execFileSync } from 'child_process';

const BOT = 'C:/projetos/chamados';
const SAIDA = BOT + '/data/preventivas.json';
const BASE = 'https://soma.zamp.com.br';
const NODE = 'C:/Program Files/nodejs/node.exe';
const GIT = 'git';
const JANELA = 90;          // dias de historico
const SEM_PUBLICAR = process.argv.includes('--sem-publicar');

const ts = () => new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
const log = (m) => console.log('[' + ts() + '] ' + m);
const fatal = (m) => { console.log('[' + ts() + '] FATAL: ' + m); process.exit(1); };

// ---------- CSV do ServiceNow ----------
function parseCSV(txt) {
  const linhas = [];
  let campo = '', linha = [], dentro = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (dentro) {
      if (c === '"') { if (txt[i + 1] === '"') { campo += '"'; i++; } else dentro = false; }
      else campo += c;
    } else if (c === '"') dentro = true;
    else if (c === ',') { linha.push(campo); campo = ''; }
    else if (c === '\n') { linha.push(campo); linhas.push(linha); linha = []; campo = ''; }
    else if (c !== '\r') campo += c;
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas.filter((l) => l.length > 1 || (l[0] || '').trim());
}
const objetos = (txt) => {
  const l = parseCSV(txt);
  const cab = (l[0] || []).map((x) => x.trim());
  return l.slice(1).map((linha) => Object.fromEntries(cab.map((c, i) => [c, (linha[i] || '').trim()])));
};

const semAcento = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
// "acabou" = encerrado/concluido. O resto conta como aberto. Casamento por
// prefixo porque o SOMA escreve "Cancelado", "Encerrado concluido" e variacoes.
const PREFIXOS_FIM = ['encerrad', 'fechad', 'closed', 'complete'];
const PREFIXOS_CANCEL = ['cancel'];
const concluida = (e) => PREFIXOS_FIM.some((p) => semAcento(e).startsWith(p));
const cancelada = (e) => PREFIXOS_CANCEL.some((p) => semAcento(e).startsWith(p));

// O equipamento da preventiva NAO esta no short_description (que e' sempre
// so' "Preventiva") -- esta no campo asset, no formato
//   "BK071656 - PHU; PRINCE CASTLE; EHB34A-BR; HNGK26563"
//   codigo - TIPO; fabricante; modelo; numero de serie
// Para filtrar e agrupar interessa o TIPO; o resto vira ruido (cada loja
// tem um numero de serie diferente, entao agrupar pelo asset inteiro daria
// uma lista de centenas de itens unicos).
// Familias de equipamento. O cadastro do SOMA escreve o MESMO equipamento de
// varios jeitos -- "MAQUINA DE SORVETE", "MAQUINA SORVETE, CARPIGIANI,
// CN825716181" e "MAQUINA DE SORVETE C716 380V" sao a mesma coisa, e sem
// agrupar dariam 65 tipos distintos num filtro. Pior: quem filtrasse
// "MAQUINA DE SORVETE" veria 41 de 100 preventivas e acharia que era tudo.
// A ordem importa: MEAT FREEZER antes de FREEZER, CAMARA FRIA antes de
// AR CONDICIONADO (uma condensadora de camara fria nao e' climatizacao).
const FAMILIAS = [
  [/MEAT.?FREEZER/, 'MEAT FREEZER'],
  [/SORVETE/, 'MAQUINA DE SORVETE'],
  [/MICRO.?ONDAS/, 'MICRO-ONDAS'],
  [/TOSTADOR|TOSTADEIRA/, 'TOSTADEIRA'],
  [/FRITADEIRA/, 'FRITADEIRA'],
  [/BROILER/, 'BROILER'],
  [/\bPHU\b/, 'PHU'],
  [/DISPENSADOR|DISPENSER|\bDBC\b/, 'DISPENSADOR DE BATATAS'],
  [/CAMARA DE CONGELADOS/, 'CAMARA DE CONGELADOS'],
  [/CAMARA DE RESFRIADOS/, 'CAMARA DE RESFRIADOS'],
  [/CAMARA FRIA/, 'CAMARA FRIA'],
  [/FREEZER/, 'FREEZER DE MESA'],
  [/AR CONDICIONADO|ROOF ?TOP|SPLIT|FANCOIL|CONDENSADOR|EVAPORADOR|UNID/, 'AR CONDICIONADO / CLIMATIZACAO'],
];

// O equipamento da preventiva NAO esta no short_description (que e' sempre
// so' "Preventiva") -- esta no campo asset, no formato
//   "BK071656 - PHU; PRINCE CASTLE; EHB34A-BR; HNGK26563"
//   codigo - TIPO; fabricante; modelo; numero de serie
// (as vezes separado por virgula em vez de ponto e virgula).
function tipoBruto(asset) {
  const s = String(asset || '').trim();
  if (!s) return '';
  const semCodigo = s.replace(/^[A-Z]{2,3}\d+\s*[-\u2013]\s*/i, '');
  return semCodigo.split(/[;,]/)[0].trim();
}

function tipoEquipamento(asset) {
  const bruto = tipoBruto(asset);
  if (!bruto) return '(sem equipamento)';
  const chave = bruto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  for (const [re, familia] of FAMILIAS) if (re.test(chave)) return familia;
  // sem regra que case, o tipo fica com o nome que o cadastro deu -- de
  // proposito: jogar num 'OUTROS' esconderia equipamento de verdade
  return bruto.toUpperCase();
}

// datas do SOMA vem como "25/09/2026 17:14:05"
function paraData(br) {
  const m = String(br || '').match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?/);
  if (!m) return null;
  return new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
}
const iso = (d) => (d ? d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') : null);
const diasEntre = (a, b) => (a && b ? Math.floor((b - a) / 86400000) : null);

// ---------- baixa do SOMA ----------
const CAMPOS = [
  'number', 'parent.number', 'opened_at', 'work_type', 'state', 'u_bk_stage',
  'assigned_to', 'assignment_group', 'opened_for.name', 'location',
  'opened_for.u_bk_sector', 'opened_for.city', 'opened_for.state',
  'expected_start', 'work_start', 'estimated_end', 'sys_updated_on', 'asset',
].join(',');

async function baixar() {
  let browser;
  for (let t = 1; t <= 3 && !browser; t++) {
    try { browser = await chromium.connectOverCDP('http://127.0.0.1:9222', { timeout: 60000 }); }
    catch (e) { if (t === 3) fatal('CDP nao respondeu: ' + e.message); await new Promise((r) => setTimeout(r, 8000)); }
  }
  const pgs = [];
  for (const c of browser.contexts()) for (const p of c.pages()) pgs.push(p);
  const pg = pgs.find((p) => /soma\.zamp\.com\.br/i.test(p.url()));
  if (!pg) { await browser.close().catch(() => {}); fatal('nenhuma aba do SOMA aberta no Chrome'); }

  const query = 'opened_for.u_bk_work_center=CSUL'
    + '^opened_at>=javascript:gs.daysAgoStart(' + JANELA + ')'
    + '^ORDERBYDESCopened_at';
  const url = BASE + '/wm_task_list.do?CSV&sysparm_display_value=true'
    + '&sysparm_fields=' + encodeURIComponent(CAMPOS)
    + '&sysparm_query=' + encodeURIComponent(query);

  const r = await pg.evaluate(async (u) => {
    const resp = await fetch(u, { credentials: 'include' });
    const buf = await resp.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let bin = ''; const ch = 0x8000;
    for (let k = 0; k < bytes.length; k += ch) bin += String.fromCharCode.apply(null, bytes.subarray(k, k + ch));
    return { status: resp.status, url: resp.url, tipo: resp.headers.get('content-type') || '', b64: btoa(bin) };
  }, url);
  await browser.close().catch(() => {});

  if (/login\.microsoftonline|saml2/i.test(r.url)) fatal('SOMA em tela de login -- relogar pelo RDP');
  if (r.status !== 200) fatal('SOMA respondeu HTTP ' + r.status);
  const txt = Buffer.from(r.b64, 'base64').toString('latin1');   // latin1, NAO utf-8
  if (!/text\/csv/i.test(r.tipo)) fatal('content-type inesperado: ' + r.tipo + ' (provavel tela de login)');
  if (txt.length < 1000) fatal('CSV pequeno demais (' + txt.length + " bytes) -- nao confio");
  return txt;
}

// ---------- agrega ----------
function processar(linhas) {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);

  const prev = linhas.filter((x) => /preventiv/i.test(x.work_type));
  if (!prev.length) fatal('nenhuma preventiva no recorte -- nao publico painel vazio');

  const itens = prev.map((x) => {
    const abertura = paraData(x.opened_at);
    const previsto = paraData(x.expected_start);
    const inicio = paraData(x.work_start);
    const fim = concluida(x.state) || cancelada(x.state) ? paraData(x.sys_updated_on) : null;
    const aberta = !concluida(x.state) && !cancelada(x.state);
    return {
      numero: x.number,
      wo: x['parent.number'] || '',
      loja: x['opened_for.name'] || x.location || '(sem loja)',
      setor: x['opened_for.u_bk_sector'] || '(sem setor)',
      cidade: x['opened_for.city'] || '',
      uf: x['opened_for.state'] || '',
      tecnico: x.assigned_to || '(sem tecnico)',
      grupo: x.assignment_group || '',
      ativo: x.asset || '',
      equipBruto: tipoBruto(x.asset),
      equipamento: tipoEquipamento(x.asset),
      estado: x.state,
      fase: x.u_bk_stage || '',
      aberturaISO: iso(abertura),
      aberturaBR: x.opened_at,
      previstoISO: iso(previsto),
      previstoBR: x.expected_start,
      inicioBR: x.work_start || '',
      fimISO: iso(fim),
      aberta,
      concluida: concluida(x.state),
      cancelada: cancelada(x.state),
      // dias que a preventiva ja' esta em aberto (ou levou para fechar)
      dias: diasEntre(abertura, aberta ? hoje : (fim || hoje)),
      // atrasada = ainda aberta e a data prevista de inicio ja' passou
      atrasada: aberta && !!previsto && previsto < hoje,
      diasAtraso: aberta && previsto && previsto < hoje ? diasEntre(previsto, hoje) : null,
    };
  });

  const abertas = itens.filter((x) => x.aberta);
  const concl = itens.filter((x) => x.concluida);
  const canc = itens.filter((x) => x.cancelada);
  const atrasadas = abertas.filter((x) => x.atrasada);

  // agrupador generico: devolve as metricas de uma fatia
  const agrupa = (chave, extra) => {
    const m = new Map();
    itens.forEach((x) => {
      const k = chave(x);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(x);
    });
    return [...m.entries()].map(([nome, lista]) => {
      const ab = lista.filter((x) => x.aberta);
      const co = lista.filter((x) => x.concluida);
      const at = ab.filter((x) => x.atrasada);
      const base = lista.filter((x) => !x.cancelada).length;
      return {
        nome,
        total: lista.length,
        abertas: ab.length,
        concluidas: co.length,
        canceladas: lista.length - base,
        atrasadas: at.length,
        pct: base ? Math.round(co.length / base * 100) : 0,
        maisAntigaDias: ab.length ? Math.max(...ab.map((x) => x.dias ?? 0)) : 0,
        mediaDiasAberta: ab.length ? Math.round(ab.reduce((s, x) => s + (x.dias ?? 0), 0) / ab.length) : 0,
        ...(extra ? extra(lista) : {}),
      };
    }).sort((a, b) => b.abertas - a.abertas || b.total - a.total);
  };

  // serie diaria: quantas abriram e quantas fecharam em cada dia
  const dias = new Map();
  const toca = (d, campo) => {
    if (!d) return;
    if (!dias.has(d)) dias.set(d, { dia: d, abertas: 0, concluidas: 0 });
    dias.get(d)[campo]++;
  };
  itens.forEach((x) => { toca(x.aberturaISO, 'abertas'); if (x.concluida) toca(x.fimISO, 'concluidas'); });
  const porDia = [...dias.values()].sort((a, b) => a.dia.localeCompare(b.dia)).slice(-45);

  const lojas = new Set(itens.map((x) => x.loja));
  const tecnicos = new Set(itens.filter((x) => x.tecnico !== '(sem tecnico)').map((x) => x.tecnico));
  const equipamentos = new Set(itens.filter((x) => x.equipamento !== '(sem equipamento)').map((x) => x.equipamento));
  const baseConcl = itens.filter((x) => !x.cancelada).length;

  return {
    geradoEm: new Date().toISOString(),
    atualizadoEm: ts(),
    janelaDias: JANELA,
    regional: 'SUL',
    totais: {
      total: itens.length,
      abertas: abertas.length,
      concluidas: concl.length,
      canceladas: canc.length,
      atrasadas: atrasadas.length,
      pctConclusao: baseConcl ? Math.round(concl.length / baseConcl * 100) : 0,
      pctAtraso: abertas.length ? Math.round(atrasadas.length / abertas.length * 100) : 0,
      lojas: lojas.size,
      tecnicos: tecnicos.size,
      equipamentos: equipamentos.size,
      mediaDiasAberta: abertas.length ? Math.round(abertas.reduce((s, x) => s + (x.dias ?? 0), 0) / abertas.length) : 0,
      maisAntigaDias: abertas.length ? Math.max(...abertas.map((x) => x.dias ?? 0)) : 0,
    },
    porTecnico: agrupa((x) => x.tecnico),
    porEquipamento: agrupa((x) => x.equipamento, (lista) => ({ lojas: new Set(lista.map((y) => y.loja)).size })),
    porSetor: agrupa((x) => x.setor, (lista) => ({ lojas: new Set(lista.map((y) => y.loja)).size })),
    porLoja: agrupa((x) => x.loja, (lista) => ({
      setor: (lista[0] || {}).setor || '',
      cidade: (lista[0] || {}).cidade || '',
      uf: (lista[0] || {}).uf || '',
    })),
    porEstado: agrupa((x) => x.estado).map(({ nome, total }) => ({ nome, total })),
    porDia,
    itens,
  };
}

// ---------- publica ----------
function publicar() {
  const rodar = (rotulo, args) => {
    try {
      const saida = execFileSync(GIT, args, { cwd: BOT, stdio: 'pipe', timeout: 120000 }).toString().trim();
      log(rotulo + ': ' + (saida.split('\n')[0] || 'ok'));
    } catch (e) {
      const txt = ((e.stdout || '') + (e.stderr || '')).toString();
      if (/nothing to commit/i.test(txt)) { log(rotulo + ': nada mudou'); return; }
      fatal(rotulo + ' falhou: ' + txt.slice(0, 200));
    }
  };
  // a chave de deploy so' existe no perfil do csmoura1
  process.env.GIT_SSH_COMMAND = 'ssh -i C:/Users/csmoura1/.ssh/deploy_chamados_pessoal -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new';
  rodar('git add', ['add', 'data/preventivas.json', 'preventivas.html']);
  rodar('git commit', ['commit', '-m', 'Preventivas ' + iso(new Date()) + ' (pipeline automatico)']);
  rodar('git push', ['push', 'origin', 'main']);
}

// ---------- main ----------
(async () => {
  log('inicio do pipeline de preventivas');
  const csv = await baixar();
  log('CSV do SOMA: ' + csv.length + ' bytes');
  const linhas = objetos(csv);
  log('tarefas do Sul na janela de ' + JANELA + ' dias: ' + linhas.length);

  const dados = processar(linhas);
  log('preventivas: ' + dados.totais.total
    + ' | abertas ' + dados.totais.abertas
    + ' | concluidas ' + dados.totais.concluidas
    + ' | atrasadas ' + dados.totais.atrasadas
    + ' | lojas ' + dados.totais.lojas
    + ' | tecnicos ' + dados.totais.tecnicos
    + ' | equipamentos ' + dados.totais.equipamentos);

  // deixa auditavel o agrupamento: se alguma familia engolir algo errado,
  // da' para ver no log sem abrir o JSON
  const mapa = new Map();
  dados.itens.forEach((x) => {
    if (!mapa.has(x.equipamento)) mapa.set(x.equipamento, new Set());
    if (x.equipBruto) mapa.get(x.equipamento).add(x.equipBruto);
  });
  [...mapa.entries()]
    .filter(([, brutos]) => brutos.size > 1)
    .sort((a, b) => b[1].size - a[1].size)
    .forEach(([familia, brutos]) => log('familia ' + familia + ' <- ' + [...brutos].join(' / ')));

  fs.writeFileSync(SAIDA, JSON.stringify(dados), 'utf8');
  log('gravado ' + SAIDA);

  if (SEM_PUBLICAR) { log('--sem-publicar: parei antes do git'); process.exit(0); }
  publicar();
  log('publicado -- a Vercel redeploya sozinha');
  process.exit(0);
})().catch((e) => fatal(e.message));
