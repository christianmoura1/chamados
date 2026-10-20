import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { execFileSync } = require('child_process');

// Confere se cada automacao rodou no horario esperado hoje.
// Le o Task Scheduler e cruza com o horario combinado; nao confia so' no
// LastTaskResult (tarefa antiga pode marcar erro funcionando, e result=0 pode
// significar "rodou e nao entregou nada").

const ESPERADO = [
  { nome: 'Mordomo - Relatorio CertPonto 0530', hora: '05:30', tipo: 'diaria', entrega: 'WhatsApp - relatorio de ponto' },
  { nome: 'Risco - Painel Diario 0600',         hora: '06:00', tipo: 'diaria', entrega: 'painel Gestao de Risco' },
  { nome: 'Chamados - Diario 0715',             hora: '06:00', tipo: 'a cada 2h ate 22:05', entrega: 'painel Backlog' },
  { nome: 'PerdaReceita - Diario 0730',         hora: '07:30', tipo: 'diaria', entrega: 'painel Perda de Receita' },
  { nome: 'Analista Seguranca - Risco 0750',    hora: '07:50', tipo: 'diaria', entrega: 'WhatsApp - Gestao de Risco' },
  { nome: 'Mordomo - Corinthians Diario 0800',  hora: '08:00', tipo: 'diaria', entrega: 'WhatsApp - jogo do dia' },
  { nome: 'Campo - Chamados Criticos 20min',    hora: '07:00', tipo: 'a cada 20min ate 23:00', entrega: 'painel Campo + WhatsApp de criticos novos' },
];

const ps = (cmd) => execFileSync('powershell.exe', ['-NoProfile', '-Command', cmd], { encoding: 'utf8', timeout: 60000 });

const bruto = ps(`Get-ScheduledTask | Where-Object { $_.TaskPath -notmatch 'Microsoft' } | ForEach-Object {
  $i = Get-ScheduledTaskInfo -TaskName $_.TaskName -TaskPath $_.TaskPath -ErrorAction SilentlyContinue
  '{0}|{1}|{2}|{3}|{4}' -f $_.TaskName, $_.State, $i.LastRunTime, $i.LastTaskResult, $i.NextRunTime
}`);

const tarefas = {};
for (const l of bruto.split(/\r?\n/)) {
  const p = l.split('|');
  if (p.length < 5) continue;
  tarefas[p[0].trim()] = { estado: p[1].trim(), ultima: p[2].trim(), result: p[3].trim(), proxima: p[4].trim() };
}

const agora = new Date();
const hojeBR = agora.toLocaleDateString('pt-BR');
const hhmm = (d) => String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');

console.log('CONFERENCIA DA AGENDA - ' + hojeBR + ' as ' + hhmm(agora));
console.log('');

const problemas = [];
for (const e of ESPERADO) {
  const t = tarefas[e.nome];
  if (!t) { console.log('[SUMIU  ] ' + e.nome + ' -- tarefa nao existe mais'); problemas.push(e.nome + ': tarefa nao existe'); continue; }

  const d = new Date(t.ultima);
  const rodouHoje = !isNaN(d) && d.toLocaleDateString('pt-BR') === hojeBR;
  const [eh, em] = e.hora.split(':').map(Number);
  const prevista = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), eh, em);
  const jaDeviaTerRodado = agora >= prevista;
  const recorrente = /cada/.test(e.tipo);

  let sit, obs = '';
  if (!jaDeviaTerRodado) { sit = 'AGUARDA'; obs = 'ainda nao chegou a hora'; }
  else if (!rodouHoje) { sit = 'FALHOU '; obs = 'NAO rodou hoje (ultima: ' + t.ultima + ')'; problemas.push(e.nome + ': nao rodou hoje'); }
  else if (t.result !== '0') { sit = 'ERRO   '; obs = 'rodou mas terminou com codigo ' + t.result; problemas.push(e.nome + ': codigo ' + t.result); }
  else if (recorrente) {
    const min = Math.round((agora - d) / 60000);
    const limite = /20min/.test(e.tipo) ? 45 : 150;
    if (min > limite) { sit = 'ATRASO '; obs = 'ultima ha ' + min + ' min (esperado a cada ' + (limite === 45 ? '20' : '120') + ' min)'; problemas.push(e.nome + ': ' + min + ' min sem rodar'); }
    else { sit = 'OK     '; obs = 'ultima ha ' + min + ' min'; }
  } else {
    const atrasoMin = Math.round((d - prevista) / 60000);
    sit = 'OK     ';
    obs = 'rodou as ' + hhmm(d) + (atrasoMin > 10 ? ' (' + atrasoMin + ' min depois do previsto)' : '');
  }

  console.log('[' + sit + '] ' + e.hora + ' ' + e.nome.padEnd(36) + ' ' + obs);
  console.log('           entrega: ' + e.entrega);
}

console.log('');
if (problemas.length) {
  console.log('PROBLEMAS (' + problemas.length + '):');
  for (const p of problemas) console.log('  - ' + p);
} else {
  console.log('Nenhum problema: tudo que ja deveria ter rodado hoje rodou.');
}
