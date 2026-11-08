// Frescor do carimbo: horário de Brasília e a cadência real de cada painel.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const code = fs.readFileSync(path.join(root, 'js/sul-ui.js'), 'utf8');
const context = vm.createContext({ console, Intl, Date });
vm.runInContext(code, context);
const { SulUI } = context;

const falhas = [];
function ok(cond, msg) {
  if (!cond) {
    falhas.push(msg);
    console.error('FALHA:', msg);
  } else {
    console.log('ok:', msg);
  }
}

const vinte = SulUI.parseQuando('2026-11-07T20:02:30');
ok(vinte.toISOString() === '2026-11-07T23:02:30.000Z', 'ISO sem fuso é relógio de Brasília: ' + vinte.toISOString());
ok(SulUI.formatarSP(vinte) === '07/11, 20:02', 'formata 20:02 em Brasília, não em UTC');

const comZ = SulUI.parseQuando('2026-11-07T23:00:27.295Z');
ok(SulUI.formatarSP(comZ) === '07/11, 20:00', 'ISO com Z vira 20:00 em Brasília');

const br = SulUI.parseQuando('06/11/2026, 07:45:47');
ok(SulUI.formatarSP(br) === '06/11, 07:45', 'data brasileira dia/mês');

const agora = SulUI.instanteSP(2026, 11, 7, 20, 40, 0);
const fresco = SulUI.avaliar(vinte, { cadencia: '2h' }, agora);
ok(fresco.atrasado === false, '20:02 ainda vale às 20:40');

const tarde = SulUI.avaliar(SulUI.parseQuando('2026-11-07T18:02:00'), { cadencia: '2h' }, agora);
ok(tarde.atrasado === true, '18:02 está atrasado às 20:40');

const madrugada = SulUI.instanteSP(2026, 11, 8, 5, 30, 0);
const fechou = SulUI.avaliar(SulUI.parseQuando('2026-11-07T22:02:00'), { cadencia: '2h' }, madrugada);
ok(fechou.atrasado === false, '22:02 segue no prazo de madrugada, antes das 6h');

const perdeuNoite = SulUI.avaliar(SulUI.parseQuando('2026-11-07T20:02:00'), { cadencia: '2h' }, madrugada);
ok(perdeuNoite.atrasado === true, '20:02 de ontem está atrasado às 5h30, a última vaga era 22:02');

const quase = SulUI.instanteSP(2026, 11, 7, 8, 10, 0);
const ainda6 = SulUI.avaliar(SulUI.parseQuando('2026-11-07T06:02:00'), { cadencia: '2h' }, quase);
ok(ainda6.atrasado === false, 'até 25 min depois das 8h a vaga das 6h ainda cobre a execução');

const campoAgora = SulUI.instanteSP(2026, 11, 7, 15, 10, 0);
const campoOk = SulUI.avaliar(SulUI.parseQuando('2026-11-07T17:55:00Z'), { cadencia: '20min' }, campoAgora);
ok(campoOk.atrasado === false, 'campo de 15 min atrás está no prazo');
const campoVelho = SulUI.avaliar(SulUI.parseQuando('2026-11-07T16:00:00Z'), { cadencia: '20min' }, campoAgora);
ok(campoVelho.atrasado === true, 'campo de mais de 45 min está atrasado');

const depoisDaNoite = SulUI.instanteSP(2026, 11, 8, 2, 0, 0);
const campoNoite = SulUI.avaliar(SulUI.instanteSP(2026, 11, 7, 22, 40, 0), { cadencia: '20min' }, depoisDaNoite);
ok(campoNoite.atrasado === false, 'última conferência das 22h40 vale de madrugada');

const riscoAgora = SulUI.instanteSP(2026, 11, 7, 12, 0, 0);
const riscoHoje = SulUI.avaliar(SulUI.parseQuando('2026-11-07T09:10:00Z'), { cadencia: 'diaria', hora: '06:00' }, riscoAgora);
ok(riscoHoje.atrasado === false, 'risco gerado hoje de manhã está no prazo ao meio-dia');
const riscoOntem = SulUI.avaliar(SulUI.parseQuando('2026-11-06T09:10:00Z'), { cadencia: 'diaria', hora: '06:00' }, riscoAgora);
ok(riscoOntem.atrasado === true, 'risco de ontem está atrasado ao meio-dia');

const cedo = SulUI.instanteSP(2026, 11, 7, 7, 0, 0);
const riscoCedo = SulUI.avaliar(SulUI.parseQuando('2026-11-06T09:10:00Z'), { cadencia: 'diaria', hora: '06:00' }, cedo);
ok(riscoCedo.atrasado === false, 'antes do fim da folga das 6h, a leitura de ontem ainda cobre');

const sem = SulUI.avaliar(null, { cadencia: 'diaria', hora: '07:30' }, riscoAgora);
ok(sem.semHora === true && sem.atrasado === false, 'sem horário não finge que acabou de atualizar');

if (falhas.length) {
  console.error(falhas.length + ' falha(s)');
  process.exit(1);
}
console.log('frescor ok');
