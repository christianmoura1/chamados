// Desenha a imagem do report de Campo a partir dos DADOS, em vez de recortar o
// painel do Power BI.
//
// Por que mudou: a foto do painel vivia saindo cortada -- o recorte dependia do
// layout do portal, que muda, e em 06/10 saiu o menu lateral no lugar da tabela.
// Aqui o layout e' meu, entao nao tem o que cortar errado. E' a mesma ideia do
// gerar_imagens.py do Perda de Receita.
const fs = require('fs');

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// so' a hora, que a data ja esta no titulo
const soHora = (s) => { const m = String(s || '').match(/(\d{2}:\d{2})/); return m ? m[1] : ''; };
const soData = (s) => { const m = String(s || '').match(/(\d{2}\/\d{2})/); return m ? m[1] : ''; };

function montaHtml({ resumo, itens, serie, hora, carimbo }) {
  const linhas = (itens || []).slice(0, 14).map((i) => {
    const token = i.aguardandoToken;
    return `<tr class="${token ? 'tk' : ''}">
      <td class="mono">${esc(i.numero)}</td>
      <td>${esc(i.loja)}</td>
      <td>${esc(i.descricao || i.principal || '')}</td>
      <td>${esc(i.fase || i.status)}</td>
      <td class="mono nowrap">${esc(soData(i.abertura))} ${esc(soHora(i.abertura))}</td>
      <td>${esc((i.tecnico || '').split(/\s+/).slice(0, 2).join(' '))}</td>
    </tr>`;
  }).join('');

  const barras = (serie || []).map((s) => {
    const max = Math.max(1, ...(serie || []).flatMap((x) => [x.abertos, x.fechados]));
    const ha = Math.round((s.abertos / max) * 54);
    const hf = Math.round((s.fechados / max) * 54);
    return `<div class="dia">
      <div class="barras">
        <div class="b ab" style="height:${ha}px" title="abertos"><span>${s.abertos}</span></div>
        <div class="b fe" style="height:${hf}px" title="fechados"><span>${s.fechados}</span></div>
      </div>
      <div class="rot">${esc(String(s.data).slice(8, 10))}/${esc(String(s.data).slice(5, 7))}</div>
    </div>`;
  }).join('');

  const n = resumo.emExecucao;
  const impacto = resumo.impacto != null ? resumo.impacto : 0;

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:"Segoe UI",system-ui,sans-serif;background:#fff;color:#1b1f2a;width:1180px}
  .wrap{padding:26px 30px 30px}
  .topo{display:flex;align-items:baseline;justify-content:space-between;border-bottom:3px solid #1f3864;padding-bottom:12px;margin-bottom:20px}
  h1{font-size:25px;font-weight:700;color:#1f3864;letter-spacing:-.2px}
  .quando{font-size:13px;color:#6b7280}
  .cards{display:flex;gap:14px;margin-bottom:22px}
  .card{flex:1;border:1px solid #e3e6ee;border-radius:12px;padding:14px 16px;background:#fafbfd}
  .card .lbl{font-size:11.5px;text-transform:uppercase;letter-spacing:.07em;color:#6b7280;font-weight:600}
  .card .val{font-size:34px;font-weight:700;line-height:1.15;margin-top:4px}
  .card.alvo{background:#eef3ff;border-color:#c7d6f5}.card.alvo .val{color:#1f3864}
  .card.tok{background:#fff8e8;border-color:#f3dfae}.card.tok .val{color:#92610a}
  .card.imp{background:#fdecea;border-color:#f3c4bd}.card.imp .val{color:#9b1c13}
  .meio{display:flex;gap:26px;align-items:flex-start}
  .serie{flex:0 0 230px;border:1px solid #e3e6ee;border-radius:12px;padding:14px 16px}
  .serie h2{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;margin-bottom:12px}
  .dias{display:flex;gap:16px;align-items:flex-end;height:78px}
  .dia{display:flex;flex-direction:column;align-items:center;gap:6px}
  .barras{display:flex;gap:4px;align-items:flex-end;height:58px}
  .b{width:17px;border-radius:3px 3px 0 0;position:relative;min-height:3px}
  .b span{position:absolute;top:-16px;left:50%;transform:translateX(-50%);font-size:11px;font-weight:700;color:#4b5563}
  .ab{background:#e05c4b}.fe{background:#2f9e68}
  .rot{font-size:10.5px;color:#6b7280}
  .leg{display:flex;gap:12px;margin-top:10px;font-size:10.5px;color:#6b7280}
  .leg i{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:4px}
  table{flex:1;border-collapse:collapse;font-size:12.5px}
  th{background:#1f3864;color:#fff;text-align:left;padding:9px 10px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;font-weight:600}
  td{padding:8px 10px;border-bottom:1px solid #edeff4;vertical-align:top}
  tr.tk td{background:#fffaf0}
  .mono{font-family:"Cascadia Mono",Consolas,monospace;font-size:11.5px}
  .nowrap{white-space:nowrap}
  tbody tr:last-child td{border-bottom:none}
  .rodape{margin-top:16px;font-size:11px;color:#9aa1ae}
</style></head><body><div class="wrap">
  <div class="topo">
    <h1>Acompanhamento Diário Campo — SUL</h1>
    <div class="quando">${esc(hora)}h${carimbo ? ' · BI ' + esc(carimbo) : ''}</div>
  </div>
  <div class="cards">
    <div class="card alvo"><div class="lbl">Chamados em execução</div><div class="val">${n}</div></div>
    <div class="card tok"><div class="lbl">Aguardando token</div><div class="val">${resumo.aguardandoToken ?? 0}</div></div>
    <div class="card imp"><div class="lbl">Com impacto</div><div class="val">${impacto}</div></div>
  </div>
  <div class="meio">
    <div class="serie">
      <h2>Últimos 3 dias</h2>
      <div class="dias">${barras}</div>
      <div class="leg"><span><i style="background:#e05c4b"></i>abertos</span><span><i style="background:#2f9e68"></i>fechados</span></div>
    </div>
    <table>
      <thead><tr><th>Chamado</th><th>Loja</th><th>Problema</th><th>Fase</th><th>Abertura</th><th>Técnico</th></tr></thead>
      <tbody>${linhas || '<tr><td colspan="6" style="padding:26px;text-align:center;color:#2f9e68;font-weight:600">Nenhum chamado em aberto</td></tr>'}</tbody>
    </table>
  </div>
  ${(itens || []).length > 14 ? `<div class="rodape">mostrando 14 de ${itens.length} chamados</div>` : ''}
</div></body></html>`;
}

// Renderiza num contexto NOVO do Chrome e fotografa. Nao mexe na aba do
// Christian nem no viewport dela -- era dai que vinham os efeitos colaterais.
async function gerarImagem(browser, dados, destino) {
  const html = montaHtml(dados);
  const pg = await browser.contexts()[0].newPage();
  try {
    await pg.setViewportSize({ width: 1180, height: 900 });
    await pg.setContent(html, { waitUntil: 'load' });
    await new Promise((r) => setTimeout(r, 400));
    const el = await pg.$('.wrap');
    const buf = await el.screenshot({ type: 'png' });
    if (destino) fs.writeFileSync(destino, buf);
    return buf;
  } finally {
    await pg.close().catch(() => {});
  }
}

module.exports = { montaHtml, gerarImagem };
