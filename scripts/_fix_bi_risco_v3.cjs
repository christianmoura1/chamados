const { chromium } = require("C:/projetos/certponto-report/node_modules/playwright");

(async () => {
  let browser;
  try {
    console.log("Conectando ao Chrome via CDP...");
    browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
    const contexts = browser.contexts();
    if (!contexts.length) throw new Error("Nenhum contexto encontrado");
    const pages = contexts[0].pages();

    // Procura a aba do BI de Gestao de Risco (report e07d5c63)
    const biPage = pages.find(p => p.url().includes("powerbi.com") && p.url().includes("e07d5c63"));
    if (!biPage) {
      console.log("ERRO: Aba do BI de Risco (e07d5c63) nao encontrada.");
      console.log("Abas disponiveis:");
      pages.forEach(p => console.log("  - " + p.url().substring(0, 100)));
      process.exit(1);
    }

    console.log("Aba BI encontrada. Trazendo para frente...");
    await biPage.bringToFront();
    await biPage.waitForTimeout(3000);

    // Inspeciona a estrutura DOM dos slicers para entender como clicar
    console.log("\n=== INSPETANDO SLICERS ===");
    const slicerInfo = await biPage.evaluate(() => {
      const results = [];
      // Procura todos os elementos que parecem ser slicers
      const candidates = document.querySelectorAll('[class*="slicer"], [class*="Slicer"], [data-testid*="slicer"]');
      candidates.forEach((el, i) => {
        const text = (el.textContent || "").substring(0, 300).replace(/\s+/g, " ").trim();
        const classes = el.className ? el.className.substring(0, 150) : "";
        results.push(`[${i}] class="${classes}" | text="${text}"`);
      });

      // Tambem procura por elementos com texto "All" ou "Categoria"
      const allElements = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const t = walker.currentNode.textContent.trim();
        if (t === "All" || t === "Todos" || t === "Categoria") {
          const parent = walker.currentNode.parentElement;
          allElements.push(`TEXT="${t}" | parentTag=${parent.tagName} | parentClass=${(parent.className||"").substring(0,80)}`);
        }
      }

      return { slicers: results.slice(0, 20), textNodes: allElements.slice(0, 20) };
    });

    console.log("Slicers encontrados: " + slicerInfo.slicers.length);
    slicerInfo.slicers.forEach(s => console.log("  " + s));
    console.log("\nText nodes (All/Todos/Categoria): " + slicerInfo.textNodes.length);
    slicerInfo.textNodes.forEach(t => console.log("  " + t));

    // Agora tenta corrigir o filtro
    console.log("\n=== TENTANDO CORRIGIR FILTRO ===");

    // Estrategia 1: Procurar o elemento que contem "All" dentro de um slicer e clicar
    // No Power BI, os slicers geralmente tem uma lista de checkboxes ou botoes
    const fixed = await biPage.evaluate(() => {
      // Procura todos os elementos clicaveis que contenham "All"
      const clickables = document.querySelectorAll('button, label, [role="checkbox"], [role="option"], li, span');
      let allElement = null;
      let todosElement = null;

      for (const el of clickables) {
        const text = (el.textContent || "").trim();
        if (text === "All" && !allElement) {
          allElement = el;
        }
        if (text === "Todos" && !todosElement) {
          todosElement = el;
        }
      }

      const result = { foundAll: !!allElement, foundTodos: !!todosElement, clicked: false };

      if (allElement) {
        // Clica no "All" para desmarcar ou abrir dropdown
        allElement.click();
        result.clickedAll = true;
      }

      return result;
    });

    console.log("Resultado estrategia 1: " + JSON.stringify(fixed));
    await biPage.waitForTimeout(2000);

    // Depois de clicar "All", procura "Todos" novamente
    const fixed2 = await biPage.evaluate(() => {
      const clickables = document.querySelectorAll('button, label, [role="checkbox"], [role="option"], li, span, div');
      let todosElement = null;

      for (const el of clickables) {
        const text = (el.textContent || "").trim();
        if (text === "Todos") {
          todosElement = el;
          break;
        }
      }

      if (todosElement) {
        todosElement.click();
        return { found: true, clicked: true, tag: todosElement.tagName, class: (todosElement.className||"").substring(0,80) };
      }

      // Se nao encontrou "Todos" exato, procura elementos que contenham "Todos"
      for (const el of clickables) {
        const text = (el.textContent || "").trim();
        if (text.includes("Todos") && text.length < 20) {
          todosElement = el;
          break;
        }
      }

      if (todosElement) {
        todosElement.click();
        return { found: true, clicked: true, partial: true, tag: todosElement.tagName, text: todosElement.textContent.trim().substring(0,30) };
      }

      return { found: false, clicked: false };
    });

    console.log("Resultado estrategia 2 (Todos): " + JSON.stringify(fixed2));
    await biPage.waitForTimeout(5000);

    // Verifica o estado final do slicer
    const finalState = await biPage.evaluate(() => {
      const clickables = document.querySelectorAll('button, label, [role="checkbox"], [role="option"], li, span, div');
      const states = [];
      for (const el of clickables) {
        const text = (el.textContent || "").trim();
        if ((text === "All" || text === "Todos" || text === "Categoria") && text.length < 30) {
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            states.push({ text, tag: el.tagName, visible: true, ariaChecked: el.getAttribute("aria-checked") });
          }
        }
      }
      return states.slice(0, 10);
    });

    console.log("\nEstado final do slicer: " + JSON.stringify(finalState));
    console.log("\nScript concluido.");
    await browser.close();
    process.exit(0);
  } catch (e) {
    console.error("ERRO FATAL: " + e.message);
    if (browser) try { await browser.close(); } catch(_) {}
    process.exit(1);
  }
})();