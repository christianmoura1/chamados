// Classifica o chamado na familia do problema -- "camara fria, eletrica, gas e
// etc", como o Christian pediu.
//
// A chave e' o PREFIXO da subcategoria (CMG, BRO, FRI...), que e' o codigo do
// equipamento. Mapeei cada codigo olhando qual `u_bk_category` aparece com ele
// nos 1.050 chamados abertos do Sul -- nao chutei nenhum.
//
// AIN (Area Interna) e AEX (Area Externa) sao 452 dos 1.050 e NAO dizem nada
// sozinhos: sao a area, nao o problema. Para esses o texto da subcategoria e'
// que decide (lampada -> eletrica, vazamento -> hidraulica, rejunte -> civil).

const EQUIP = {
  // refrigeracao -- a "camara fria" do pedido dele
  CMG: ['Refrigeração', 'Câmara de congelados'],
  CMR: ['Refrigeração', 'Câmara de resfriados'],
  MFR: ['Refrigeração', 'Meat freezer'],
  FDM: ['Refrigeração', 'Freezer de mesa'],
  FCR: ['Refrigeração', 'Freezer de resfriados'],
  FCG: ['Refrigeração', 'Freezer de congelados'],
  REF: ['Refrigeração', 'Refrigerador'],
  DSP: ['Refrigeração', 'Dispensador de batatas congeladas'],
  CDS: ['Refrigeração', 'Carrinho de sobremesa'],
  // coccao e retencao
  BRO: ['Cocção', 'Broiler'],
  FRI: ['Cocção', 'Fritadeira'],
  ETB: ['Cocção', 'Estufa de batatas'],
  ETR: ['Cocção', 'Estufa de lanches'],
  TST: ['Cocção', 'Tostadeira'],
  MDT: ['Cocção', 'Mesa tostadora'],
  MCR: ['Cocção', 'Microondas'],
  PHU: ['Cocção', 'PHU (retenção)'],
  // sobremesa
  MDS: ['Sobremesa', 'Máquina de sorvete'],
  // climatizacao e exaustao
  ARC: ['Climatização', 'Ar condicionado'],
  COI: ['Exaustão', 'Coifa'],
  EXA: ['Exaustão', 'Exaustor'],
  CDV: ['Exaustão', 'Caixa de ventilação'],
  // hidraulica
  BTC: ['Hidráulica', 'Bancada de lavagem'],
  PIA: ['Hidráulica', 'Pia de lavagem de mãos'],
  PIM: ['Hidráulica', 'Pia de mop'],
  BOI: ['Hidráulica', 'Boiler'],
  AGU: ['Hidráulica', 'Água'],
  BBD: ['Hidráulica', 'Bebedouro'],
  // seguranca
  SCI: ['Incêndio', 'Sistema de incêndio'],
  // mobiliario
  MPR: ['Mobiliário', 'Mesa principal'],
  MEP: ['Mobiliário', 'Mesa de especiais'],
  MEX: ['Mobiliário', 'Mesa express'],
  ETS: ['Mobiliário', 'Estoque seco'],
};

const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

// Para AIN/AEX o problema esta no texto. A ORDEM IMPORTA e foi ajustada olhando
// o que sobrava em "Outros": equipamento de frio citado dentro da Area Interna
// (FREEZER REFRIGERADOS) tem que virar Refrigeracao antes que "Civil" o pegue
// por causa da palavra PORTA, e extintor tem que virar Incendio antes de Civil.
const PORTEXTO = [
  ['Gás', /\bGAS\b|\bGLP\b/],
  ['Incêndio', /EXTINTOR|INCENDIO|SPRINKLER|HIDRANTE|BRIGADA/],
  ['Refrigeração', /FREEZER|CAMARA FRIA|CAMARA DE CONGELAD|CAMARA DE RESFRIAD|REFRIGERAD/],
  ['Elétrica', /LAMPADA|LUZ |LUMINOS|ILUMINA|NAO ACENDE|QUADRO ELETRICO|ELETRIC|TOMADA|DISJUNTOR|ENERGIA|LETREIRO|BOTTOM|CURTO/],
  ['Hidráulica', /VAZAMENTO|AGUA|ESGOTO|ENTUPI|RALO|TORNEIRA|VASO|MICTORIO|HIDRAULIC|REFLUXO|CAIXA D|INFILTRA|BOMBA|\bPIA\b|\bMOP\b|ESFREGAO|LAVAGEM/],
  ['Civil', /PISO|PAREDE|TETO|REVESTIMENTO|REJUNTE|RACHADURA|BURACO|CANTONEIRA|FORRO|PINTURA|PORTA|TELHADO|CALHA|FACHADA|VIDRO|BANCO|MURO|ESTRUTURA|ELEVADOR|CORRIMAO|PORTAO/],
];

// Devolve { familia, equipamento, problema }
function classifica(c) {
  const sub = String(c.u_bk_subcategory || '').trim();
  const m = sub.match(/^([A-Z]{2,4})\s*-\s*/);
  const cod = m ? m[1] : null;
  // o problema legivel: tira o codigo do inicio
  const problema = sub.replace(/^[A-Z]{2,4}\s*-\s*/, '').trim();

  // o equipamento vem do cadastro: tira o "ZP128410 - " e o ", MARCA, SERIE"
  const catBruta = String(c.u_bk_category || '').replace(/^[A-Z]{2}\d+\s*[-–]?\s*/, '').replace(/;.*$/, '').trim();

  if (cod && EQUIP[cod]) {
    const [fam, nome] = EQUIP[cod];
    return { familia: fam, equipamento: catBruta || nome, problema };
  }
  // AIN / AEX / sem codigo -> decide pelo texto
  const t = semAcento(sub + ' ' + catBruta);
  for (const [fam, re] of PORTEXTO) if (re.test(t)) return { familia: fam, equipamento: catBruta, problema };
  return { familia: 'Outros', equipamento: catBruta, problema };
}

// Famílias que param ou derrubam a venda. Serve so' para destacar no painel --
// o Christian continua vendo tudo, mas o que para a loja aparece marcado.
const CRITICA = new Set(['Refrigeração', 'Cocção', 'Sobremesa', 'Elétrica', 'Gás', 'Incêndio']);

module.exports = { classifica, CRITICA, EQUIP };
