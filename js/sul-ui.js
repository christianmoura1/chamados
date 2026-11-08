/* Comportamento compartilhado dos painéis: diálogo, busca, frescor e leitura. */
(function (root) {
  'use strict';

  var TZ = 'America/Sao_Paulo';
  var retries = Object.create(null);

  function pad(n) { return String(n).padStart(2, '0'); }

  function partesSP(date) {
    var fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23'
    });
    var o = {};
    fmt.formatToParts(date).forEach(function (p) { o[p.type] = p.value; });
    return { y: +o.year, mo: +o.month, d: +o.day, h: +o.hour, mi: +o.minute, s: +o.second };
  }

  function offsetMinutosSP(date) {
    var p = partesSP(date);
    var comoUtc = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s);
    return Math.round((comoUtc - date.getTime()) / 60000);
  }

  function instanteSP(y, mo, d, h, mi, s) {
    var chute = Date.UTC(y, mo - 1, d, h, mi, s || 0);
    var off = offsetMinutosSP(new Date(chute));
    return new Date(chute - off * 60000);
  }

  function formatarSP(date) {
    var p = partesSP(date);
    return pad(p.d) + '/' + pad(p.mo) + ', ' + pad(p.h) + ':' + pad(p.mi);
  }

  function parseQuando(valor) {
    if (valor == null || valor === '') return null;
    if (valor instanceof Date) return isNaN(valor.getTime()) ? null : valor;
    var s = String(valor).trim();
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}T/.test(s) && /(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(s)) {
      var abs = new Date(s);
      return isNaN(abs.getTime()) ? null : abs;
    }
    var iso = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (iso) return instanteSP(+iso[1], +iso[2], +iso[3], +iso[4], +iso[5], +(iso[6] || 0));
    var br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[,\s]+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
    if (br) return instanteSP(+br[3], +br[2], +br[1], +(br[4] || 0), +(br[5] || 0), +(br[6] || 0));
    var livre = new Date(s);
    return isNaN(livre.getTime()) ? null : livre;
  }

  function avaliar2h(date, agora) {
    var p = partesSP(agora);
    var minutos = p.h * 60 + p.mi;
    var inicio = 6 * 60 + 2;
    var fim = 22 * 60 + 2;
    var esperado;
    if (minutos < inicio) {
      var hojeCedo = instanteSP(p.y, p.mo, p.d, 22, 2, 0);
      esperado = new Date(hojeCedo.getTime() - 24 * 60 * 60 * 1000);
    } else if (minutos >= fim + 25) {
      esperado = instanteSP(p.y, p.mo, p.d, 22, 2, 0);
    } else {
      var hora = 6;
      var ultima = 6;
      while (hora <= 22) {
        if (hora * 60 + 2 <= minutos) ultima = hora;
        hora += 2;
      }
      if (minutos - (ultima * 60 + 2) < 25 && ultima > 6) ultima -= 2;
      esperado = instanteSP(p.y, p.mo, p.d, ultima, 2, 0);
    }
    var atrasado = date.getTime() + 60 * 1000 < esperado.getTime();
    return {
      atrasado: atrasado,
      detalhe: atrasado
        ? 'Atrasado para a cadência de 2 h (por volta do minuto :02, das 6h às 22h, horário de Brasília).'
        : 'No prazo. A leitura automática sai a cada 2 h, por volta do minuto :02, das 6h às 22h (Brasília).'
    };
  }

  function avaliar20(date, agora) {
    var p = partesSP(agora);
    var minutos = p.h * 60 + p.mi;
    var atrasado;
    if (minutos < 7 * 60) {
      var ontem = new Date(instanteSP(p.y, p.mo, p.d, 22, 15, 0).getTime() - 24 * 60 * 60 * 1000);
      atrasado = date < ontem;
    } else if (minutos >= 23 * 60 + 45) {
      atrasado = date < instanteSP(p.y, p.mo, p.d, 22, 15, 0);
    } else if (minutos >= 23 * 60) {
      atrasado = (agora - date) > 45 * 60 * 1000 && date < instanteSP(p.y, p.mo, p.d, 22, 15, 0);
    } else {
      atrasado = (agora - date) > 45 * 60 * 1000;
    }
    return {
      atrasado: atrasado,
      detalhe: atrasado
        ? 'Atrasado. O campo é conferido a cada 20 min, das 7h às 23h (Brasília).'
        : 'No prazo. Conferência automática a cada 20 min, das 7h às 23h (Brasília).'
    };
  }

  function avaliarDiaria(date, agora, hora) {
    var pedacos = String(hora || '06:00').split(':');
    var hh = +pedacos[0] || 0;
    var mm = +pedacos[1] || 0;
    var p = partesSP(agora);
    var slot = instanteSP(p.y, p.mo, p.d, hh, mm, 0);
    var folga = 3 * 60 * 60 * 1000;
    if (agora.getTime() < slot.getTime() + folga) slot = new Date(slot.getTime() - 24 * 60 * 60 * 1000);
    var atrasado = date < slot;
    return {
      atrasado: atrasado,
      detalhe: atrasado
        ? 'Atrasado para a leitura diária das ' + pad(hh) + ':' + pad(mm) + ' (Brasília).'
        : 'No prazo da leitura diária das ' + pad(hh) + ':' + pad(mm) + ' (Brasília).'
    };
  }

  function avaliar(date, opcoes, agora) {
    agora = agora || new Date();
    opcoes = opcoes || {};
    if (!date) {
      return {
        atrasado: false,
        semHora: true,
        detalhe: 'Esta leitura não traz horário de geração. O carimbo não usa o relógio da tela.'
      };
    }
    if (opcoes.cadencia === '2h') return avaliar2h(date, agora);
    if (opcoes.cadencia === '20min') return avaliar20(date, agora);
    if (opcoes.cadencia === 'diaria') return avaliarDiaria(date, agora, opcoes.hora || '06:00');
    return { atrasado: false, detalhe: 'Horário da última leitura, em Brasília.' };
  }

  function carimbar(el, quando, opcoes) {
    if (!el) return null;
    opcoes = opcoes || {};
    var date = parseQuando(quando);
    var juizo = avaliar(date, opcoes);
    var texto;
    if (juizo.semHora) texto = 'Sem horário de geração';
    else if (!opcoes.cadencia) texto = (opcoes.rotulo || 'Atualizado') + ' ' + formatarSP(date);
    else texto = (opcoes.rotulo || 'Atualizado') + ' ' + formatarSP(date) + (juizo.atrasado ? ' · atrasado' : ' · no prazo');
    el.textContent = texto;
    el.title = juizo.detalhe;
    el.setAttribute('aria-label', texto + '. ' + juizo.detalhe);
    el.classList.remove('carimbo-ok', 'carimbo-atrasado', 'carimbo-sem-hora');
    el.classList.add(juizo.semHora ? 'carimbo-sem-hora' : (juizo.atrasado ? 'carimbo-atrasado' : 'carimbo-ok'));
    return { texto: texto, atrasado: !!juizo.atrasado, detalhe: juizo.detalhe, data: date };
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function htmlCarregando(painel) {
    return '<div class="msg-carregando" role="status">Buscando ' + esc(painel) + '…</div>';
  }

  function htmlFalha(opts) {
    opts = opts || {};
    var status = opts.erro && opts.erro.message ? String(opts.erro.message) : '';
    status = status.replace(/\s+/g, ' ').slice(0, 160);
    var detalhe = status
      ? '<p class="msg-erro-detalhe">A leitura não respondeu (' + esc(status) + ').</p>'
      : '<p class="msg-erro-detalhe">A leitura não respondeu.</p>';
    return '<div class="msg-erro" role="alert"><p>Não consegui atualizar ' + esc(opts.painel || 'o painel') + ' agora.</p>'
      + detalhe
      + '<button type="button" class="btn-retry" data-sul-retry="' + esc(opts.retry || '') + '">Tentar novamente</button></div>';
  }

  function htmlBannerAntigo(opts) {
    opts = opts || {};
    var quando = parseQuando(opts.quando || opts.lidoEm);
    var hora = quando ? ' (' + formatarSP(quando) + ')' : '';
    return '<div class="banner-antigo" role="status"><p>Não consegui buscar uma leitura nova. A tela continua com a última que deu certo'
      + hora + '. Os números podem estar velhos.</p><button type="button" class="btn-retry" data-sul-retry="'
      + esc(opts.retry || '') + '">Tentar novamente</button></div>';
  }

  function mostrarCarregando(el, painel) {
    if (!el) return;
    if (el.querySelector('.kpis, .statcards, .equip-grid, .gauge-grid, .cmp-table, table tbody tr td:not(.msg-carregando):not(.msg-erro):not(.loading):not(.empty)')) return;
    el.innerHTML = htmlCarregando(painel);
  }

  function idb() {
    return new Promise(function (resolve, reject) {
      if (typeof indexedDB === 'undefined') { reject(new Error('sem indexedDB')); return; }
      var req = indexedDB.open('sul-ui', 1);
      req.onupgradeneeded = function () { req.result.createObjectStore('leituras'); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error('indexedDB')); };
    });
  }

  function idbPut(chave, dados) {
    return idb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction('leituras', 'readwrite');
        tx.objectStore('leituras').put({ dados: dados, lidoEm: new Date().toISOString() }, chave);
        tx.oncomplete = function () { db.close(); resolve(); };
        tx.onerror = function () { db.close(); reject(tx.error); };
      });
    });
  }

  function idbGet(chave) {
    return idb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction('leituras', 'readonly');
        var req = tx.objectStore('leituras').get(chave);
        req.onsuccess = function () { db.close(); resolve(req.result || null); };
        req.onerror = function () { db.close(); reject(req.error); };
      });
    });
  }

  function lerComCache(chave, loader) {
    return Promise.resolve()
      .then(loader)
      .then(function (dados) {
        return idbPut(chave, dados).catch(function () {}).then(function () {
          return { dados: dados, antigo: false };
        });
      })
      .catch(function (erro) {
        return idbGet(chave).catch(function () { return null; }).then(function (cache) {
          if (cache && cache.dados != null) {
            return { dados: cache.dados, antigo: true, lidoEm: cache.lidoEm, erro: erro };
          }
          return { dados: null, antigo: false, erro: erro };
        });
      });
  }

  function aplicarNomeDialogo(painel) {
    var titulo = painel.querySelector('#modalTitle, h1, h2, h3, .modal-loja');
    if (!titulo) {
      painel.setAttribute('aria-label', 'Detalhe');
      return;
    }
    if (!titulo.id) titulo.id = painel.id ? painel.id + '-titulo' : 'sul-dialogo-titulo';
    painel.setAttribute('aria-labelledby', titulo.id);
  }

  function focaveis(painel) {
    return Array.prototype.filter.call(
      painel.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'),
      function (el) { return !el.hidden && el.getAttribute('aria-hidden') !== 'true' && (el.offsetParent !== null || el === document.activeElement); }
    );
  }

  function instalarDialogo(overlay) {
    if (!overlay || overlay.dataset.sulDialogo) return;
    overlay.dataset.sulDialogo = '1';
    var painel = overlay.querySelector('.modal-panel, .modal-box') || overlay.firstElementChild;
    if (!painel) return;
    if (!painel.id) painel.id = (overlay.id || 'modal') + 'Painel';
    painel.setAttribute('role', 'dialog');
    painel.setAttribute('aria-modal', 'true');
    if (painel.tabIndex == null || painel.tabIndex < 0) painel.tabIndex = -1;
    aplicarNomeDialogo(painel);

    var ultimo = null;
    var ativo = false;

    function aberto() {
      if (overlay.hidden || overlay.hasAttribute('hidden')) return false;
      if (overlay.classList.contains('aberto')) return true;
      return root.getComputedStyle(overlay).display !== 'none';
    }

    function onKey(ev) {
      if (!ativo) return;
      if (ev.key === 'Escape') {
        var lista = document.querySelector('.filter-combo-lista:not([hidden])');
        if (lista && painel.contains(lista)) return;
        ev.preventDefault();
        ev.stopImmediatePropagation();
        var fechar = painel.querySelector('.modal-close');
        if (fechar) fechar.click();
        else { overlay.hidden = true; overlay.classList.remove('aberto'); }
        return;
      }
      if (ev.key !== 'Tab') return;
      var itens = focaveis(painel);
      if (!itens.length) { ev.preventDefault(); painel.focus(); return; }
      var primeiro = itens[0];
      var ultimoEl = itens[itens.length - 1];
      if (document.activeElement === painel) {
        ev.preventDefault();
        (ev.shiftKey ? ultimoEl : primeiro).focus();
        return;
      }
      if (ev.shiftKey && document.activeElement === primeiro) {
        ev.preventDefault();
        ultimoEl.focus();
      } else if (!ev.shiftKey && document.activeElement === ultimoEl) {
        ev.preventDefault();
        primeiro.focus();
      } else if (!painel.contains(document.activeElement)) {
        ev.preventDefault();
        primeiro.focus();
      }
    }

    function aoAbrir() {
      if (ativo) { aplicarNomeDialogo(painel); return; }
      ativo = true;
      aplicarNomeDialogo(painel);
      var anterior = document.activeElement;
      if (painel.contains(anterior) && root.__sulFoco && !painel.contains(root.__sulFoco)) anterior = root.__sulFoco;
      ultimo = anterior;
      document.addEventListener('keydown', onKey, true);
      if (!painel.contains(document.activeElement)) painel.focus();
    }

    function aoFechar() {
      if (!ativo) return;
      ativo = false;
      document.removeEventListener('keydown', onKey, true);
      if (ultimo && typeof ultimo.focus === 'function') {
        try { ultimo.focus(); } catch (e) {}
      }
      ultimo = null;
    }

    var mo = new MutationObserver(function () {
      if (aberto()) aoAbrir();
      else aoFechar();
    });
    mo.observe(overlay, { attributes: true, attributeFilter: ['hidden', 'class', 'style'] });
    if (aberto()) aoAbrir();
  }

  function itensCombo(lista) {
    return Array.prototype.slice.call(lista.querySelectorAll('.filter-combo-item'));
  }

  function marcarCombo(lista, idx) {
    var itens = itensCombo(lista);
    if (!itens.length) return;
    if (idx < 0) idx = itens.length - 1;
    if (idx >= itens.length) idx = 0;
    itens.forEach(function (el, i) {
      var on = i === idx;
      el.classList.toggle('ativo', on);
      el.setAttribute('role', 'option');
      el.setAttribute('aria-selected', on ? 'true' : 'false');
      if (!el.id) el.id = lista.id + '-op-' + i;
    });
    var atual = itens[idx];
    atual.scrollIntoView({ block: 'nearest' });
    var input = lista.parentElement && lista.parentElement.querySelector('input, [role="combobox"]');
    if (input) input.setAttribute('aria-activedescendant', atual.id);
  }

  function instalarCombos() {
    document.addEventListener('focusin', function (ev) {
      var input = ev.target.closest && ev.target.closest('.filter-combo input, .filter-combo [role="combobox"]');
      if (!input) return;
      var lista = input.parentElement.querySelector('.filter-combo-lista');
      if (!lista) return;
      input.setAttribute('role', 'combobox');
      input.setAttribute('aria-autocomplete', 'list');
      if (!lista.id) lista.id = input.id ? input.id + '-lista' : 'sul-combo-lista';
      input.setAttribute('aria-controls', lista.id);
      lista.setAttribute('role', 'listbox');
    });

    document.addEventListener('keydown', function (ev) {
      var input = ev.target.closest && ev.target.closest('.filter-combo input');
      if (!input) return;
      var lista = input.parentElement.querySelector('.filter-combo-lista');
      if (!lista) return;
      var aberta = !lista.hidden && !lista.hasAttribute('hidden');
      if ((ev.key === 'ArrowDown' || ev.key === 'ArrowUp') && !aberta) {
        ev.preventDefault();
        input.dispatchEvent(new Event('focus'));
        input.dispatchEvent(new Event('input', { bubbles: true }));
        setTimeout(function () {
          if (!lista.hidden) marcarCombo(lista, ev.key === 'ArrowDown' ? 0 : Math.max(0, itensCombo(lista).length - 1));
        }, 0);
        return;
      }
      if (!aberta) return;
      var itens = itensCombo(lista);
      var idx = itens.findIndex(function (el) { return el.classList.contains('ativo'); });
      if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
        ev.preventDefault();
        marcarCombo(lista, idx < 0 ? 0 : idx + (ev.key === 'ArrowDown' ? 1 : -1));
      } else if (ev.key === 'Enter') {
        var alvo = itens[idx] || itens[0];
        if (!alvo) return;
        ev.preventDefault();
        ev.stopImmediatePropagation();
        alvo.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      } else if (ev.key === 'Escape') {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        lista.hidden = true;
        input.removeAttribute('aria-activedescendant');
      }
      input.setAttribute('aria-expanded', lista.hidden ? 'false' : 'true');
    }, true);
  }

  function prepararFiltros() {
    /* O empilhamento no celular zera a base flex no CSS e limita a altura
       da faixa, com rolagem. Não escondemos campos: prioridade e supervisor
       precisam continuar na tela. */
  }

  function ligarTabela(table, onOpen) {
    if (!table || table.dataset.sulSort) return;
    table.dataset.sulSort = '1';
    function celulas(tr) { return Array.prototype.slice.call(tr.children); }
    function valor(tr, idx, tipo) {
      var cel = celulas(tr)[idx];
      if (!cel) return '';
      if (tipo === 'num') return parseFloat(cel.getAttribute('data-v') || cel.textContent) || 0;
      return (cel.getAttribute('data-v') || cel.textContent || '').trim();
    }
    table.addEventListener('click', function (ev) {
      var btn = ev.target.closest('button[data-sort]');
      if (btn) {
        ev.stopPropagation();
        var idx = +btn.dataset.sort;
        var tipo = btn.dataset.tipo || 'texto';
        var th = btn.closest('th');
        var dir = th.getAttribute('aria-sort') === 'ascending' ? 'descending' : 'ascending';
        Array.prototype.forEach.call(table.querySelectorAll('thead th'), function (outro) {
          outro.removeAttribute('aria-sort');
        });
        th.setAttribute('aria-sort', dir);
        var corpo = table.tBodies[0];
        var linhas = Array.prototype.slice.call(corpo.rows);
        linhas.sort(function (a, b) {
          var va = valor(a, idx, tipo);
          var vb = valor(b, idx, tipo);
          var cmp = tipo === 'num' ? va - vb : String(va).localeCompare(String(vb), 'pt-BR');
          return dir === 'ascending' ? cmp : -cmp;
        });
        linhas.forEach(function (tr) { corpo.appendChild(tr); });
        return;
      }
      var tr = ev.target.closest('tbody tr');
      if (tr && tr.dataset && (tr.dataset.chave || tr.dataset.nome) && typeof onOpen === 'function') onOpen(tr);
    });
    table.addEventListener('keydown', function (ev) {
      var tr = ev.target.closest && ev.target.closest('tbody tr');
      if (!tr) return;
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        if (typeof onOpen === 'function') onOpen(tr);
      }
    });
  }

  function registrarRetry(nome, fn) { retries[nome] = fn; }

  function boot() {
    document.addEventListener('pointerdown', function (ev) {
      if (!ev.target.closest('.modal-overlay')) root.__sulFoco = ev.target;
    }, true);
    document.addEventListener('keydown', function (ev) {
      if ((ev.key === 'Enter' || ev.key === ' ') && ev.target && !ev.target.closest('.modal-overlay')) root.__sulFoco = ev.target;
    }, true);
    Array.prototype.forEach.call(document.querySelectorAll('.modal-overlay'), instalarDialogo);
    instalarCombos();
    prepararFiltros(document);
    document.addEventListener('click', function (ev) {
      var btn = ev.target.closest && ev.target.closest('[data-sul-retry]');
      if (!btn) return;
      var nome = btn.getAttribute('data-sul-retry');
      var fn = retries[nome] || root[nome];
      if (typeof fn === 'function') fn();
    });
    if (typeof root.matchMedia === 'function') {
      var mq = root.matchMedia('(max-width: 720px)');
      if (mq.addEventListener) mq.addEventListener('change', function () { prepararFiltros(document); });
    }
    var agendado = false;
    var mo = new MutationObserver(function () {
      if (agendado) return;
      agendado = true;
      root.requestAnimationFrame(function () {
        agendado = false;
        Array.prototype.forEach.call(document.querySelectorAll('.modal-overlay'), instalarDialogo);
        prepararFiltros(document);
      });
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  var SulUI = {
    parseQuando: parseQuando,
    formatarSP: formatarSP,
    avaliar: avaliar,
    instanteSP: instanteSP,
    partesSP: partesSP,
    carimbar: carimbar,
    esc: esc,
    htmlCarregando: htmlCarregando,
    htmlFalha: htmlFalha,
    htmlBannerAntigo: htmlBannerAntigo,
    mostrarCarregando: mostrarCarregando,
    lerComCache: lerComCache,
    ligarTabela: ligarTabela,
    registrarRetry: registrarRetry,
    prepararFiltros: prepararFiltros
  };

  root.SulUI = SulUI;
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
