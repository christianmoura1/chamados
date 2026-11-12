const assert = require('assert');
const dia = require('../scripts/listas_do_dia.cjs');

const csv = [
  'number,opened_at,closed_at,closed_by,priority,short_description,opened_for.name,opened_for.u_bk_sector',
  'WOT1,10/11/2026 08:00:00,11/11/2026 19:00:01,Ana,1 - Crítica,FRITADEIRA parada,LOJA A,SETOR',
  'WOT2,11/11/2026 09:00:00,11/11/2026 18:00:00,Bob,3 - Baixa,"SORVETE, com virgula",LOJA B,SETOR',
  'WOT3,01/11/2026 09:00:00,10/11/2026 18:00:00,Cia,2 - Alta,PHU x,LOJA C,SETOR',
  'WOT4,11/11/2026 07:00:00,11/11/2026 12:00:00,Duda,4 - Normal,Area Interna | quadro,LOJA D,SETOR',
].join('\n');
for (let i = 5; i <= 16; i++) {
  // linhas extras fechadas hoje, para passar de 10
}

const linhas = [csv];
for (let i = 5; i <= 16; i++) {
  const hh = String(10 + (i % 5)).padStart(2, '0');
  linhas.push(`WOT${i},02/11/2026 08:00:00,11/11/2026 ${hh}:00:00,Tim,2 - Alta,PHU y,LOJA X,SETOR`);
}
const texto = linhas.join('\n');
const todos = dia.parseFechadosCsv(texto, () => 'MARCEL');
const hoje = dia.doDia(todos, '2026-11-11', 'fechadoEm');
const ultimos = todos.slice(0, 10);

assert.ok(hoje.length > 10, 'dia inteiro passa de 10, veio ' + hoje.length);
assert.strictEqual(ultimos.length, 10);
assert.strictEqual(hoje[0].numero, 'WOT1');
assert.strictEqual(hoje[0].prioridade, 'SOS');
assert.strictEqual(hoje[0].fechadoPor, 'Ana');
assert.ok(hoje.some((f) => f.numero === 'WOT2' && f.problema === 'SORVETE, com virgula' && f.prioridade === 'Normal'));
assert.ok(!hoje.some((f) => f.numero === 'WOT3'), 'ontem nao entra');
assert.ok(hoje.some((f) => f.numero === 'WOT4' && !f.equipamento), 'area interna entra na lista do dia');
assert.strictEqual(dia.contarAltaSosEquipamento(hoje), hoje.filter((f) => (f.prioridade === 'SOS' || f.prioridade === 'Alta') && f.equipamento).length);
assert.ok(dia.contarAltaSosEquipamento(hoje) < hoje.length, 'Normal e area interna nao inflam o KPI');
assert.strictEqual(dia.ymdSaoPaulo(new Date('2026-11-12T02:30:00Z')), '2026-11-11');
assert.strictEqual(dia.prioridadeSOMA('2 - Alta'), 'Alta');
assert.strictEqual(dia.prioridadeSOMA('Duplicado'), 'Normal');

console.log('ok listas do dia', hoje.length, 'fechados hoje;', ultimos.length, 'ultimos');
