const { chromium } = require("C:/projetos/certponto-report/node_modules/playwright");
(async () => {
  let browser;
  try {
    console.log("Conectando ao Chrome via CDP...");
    browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
    const contexts = browser.contexts();
    if (!contexts.length) throw new Error("Nenhum contexto encontrado");
    const pages = contexts[0].pages();

    // Procura a aba do BI de Disponibilidade/Manutencao (report e07d5c63, page 250d750e)
    const biPage = pages.find(p => p.url().includes("powerbi.com") && p.url().includes("e07d5c63") && p.url().includes("250d750e"));
    if (!biPage) {
      console.log("ERRO: Aba do BI de Disponibilidade (e07d5c63/250d750e) nao encontrada.");
      console.log("Abas disponiveis:");
      pages.forEach(p => console.log(" - " + p.url().substring(0, 100)));
      process.exit(1);
    }
    console.log("Aba BI Disponibilidade encontrada. Trazendo para frente...");
    await biPage.bringToFront();
    await biPage.waitForTimeout(3000);

    // Inspeciona slicers para encontrar o de Regional
    console.log("\n=== INSPETANDO SLICERS REGIONAL ===");
    const slicerInfo = await biPage.evaluate(() => {
      const results = [];
      const candidates = document.querySelectorAll('[class*="slicer"], [class*="Slicer"]');
      candidates.forEach((el, i) => {
        const text = (el.textContent || "").substring(0, 300).replace(/\s+/g, " ").trim();
        if (text.includes("SUL") || text.includes("Regional") || text.includes("BK")) {
          results.push(`[${i}] class="${(el.className||"").substring(0,100)}" | text="${text.substring(0,200)}"`);
        }
      });
      return results.slice(0, 10);
    });
    console.log("Slicers com SUL/Regional/BK: " + slicerInfo.length);
    slicerInfo.forEach(s => console.log(" " + s));

    // Tenta clicar no slicer de Regional e selecionar apenas SUL
    console.log("\n=== TENTANDO CORRIGIR FILTRO REGIONAL ===");

    // Estrategia: procurar todos os elementos clicaveis que contenham nomes de regionais
    const fixed = await biPage.evaluate(() => {
      const clickables = document.querySelectorAll('button, label, [role="checkbox"], [role="option"], li, span, div');
      const regionals = [];
      let sulElement = null;

      for (const el of clickables) {
        const text = (el.textContent || "").trim();
        // Identifica regionais pelo padrao
        if (text.match(/^(SUL|BK . FOGO|SP INTERIOR|RJ|NE|MINAS|CENTRO)/) && text.length < 50) {
          regionals.push({ text, el, rect: el.getBoundingClientRect() });
          if (text === "SUL" && !sulElement) {
            sulElement = el;
          }
        }
      }

      const result = {
        foundRegionals: regionals.length,
        regionalTexts: regionals.map(r => r.text).slice(0, 10),
        foundSul: !!sulElement,
        clicked: false
      };

      if (sulElement) {
        // Clica no SUL
        sulElement.click();
        result.clickedSul = true;
        result.clicked = true;
      }

      return result;
    });

    console.log("Resultado: " + JSON.stringify(fixed));
    await biPage.waitForTimeout(5000);

    // Verifica estado final
    const finalState = await biPage.evaluate(() => {
      const clickables = document.querySelectorAll('button, label, [role="checkbox"], [role="option"], li, span, div');
      const states = [];
      for (const el of clickables) {
        const text = (el.textContent || "").trim();
        if (text.match(/^(SUL|BK . FOGO|SP INTERIOR|RJ|NE|MINAS|CENTRO)/) && text.length < 50) {
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            const isChecked = el.getAttribute("aria-checked") === "true" ||
                             el.classList.contains("selected") ||
                             el.parentElement?.classList.contains("selected");
            states.push({ text, visible: true, checked: isChecked });
          }
        }
      }
      return states.slice(0, 10);
    });

    console.log("\nEstado final das regionais: " + JSON.stringify(finalState));
    console.log("\nScript concluido.");
    await browser.close();
    process.exit(0);
  } catch (e) {
    console.error("ERRO FATAL: " + e.message);
    if (browser) try { await browser.close(); } catch(_) {}
    process.exit(1);
  }
})();