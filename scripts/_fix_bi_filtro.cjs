const { chromium } = require("C:/projetos/certponto-report/node_modules/playwright");
(async () => {
  try {
    const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
    const contexts = browser.contexts();
    if (!contexts.length) { console.log("sem contextos"); process.exit(1); }
    const pages = contexts[0].pages();
    // Procura a aba do BI de Gestao de Risco (report e07d5c63)
    const biPage = pages.find(p => p.url().includes("powerbi.com") && p.url().includes("e07d5c63"));
    if (!biPage) {
      console.log("ERRO: aba do BI de Risco (e07d5c63) nao encontrada");
      console.log("Abas disponiveis:");
      pages.forEach(p => console.log("  " + p.url().substring(0, 80)));
      process.exit(1);
    }
    console.log("Aba BI encontrada: " + biPage.url().substring(0, 80));
    await biPage.bringToFront();
    await biPage.waitForTimeout(3000);

    // Tenta clicar no slicer "Categoria" e mudar de "All" para "Todos"
    // Primeiro tenta encontrar um elemento com texto "All" dentro de um slicer
    const allElement = await biPage.$("text='All'");
    if (allElement) {
      console.log("Encontrado elemento 'All', clicando...");
      await allElement.click();
      await biPage.waitForTimeout(2000);
    } else {
      console.log("Elemento 'All' nao encontrado diretamente");
    }

    // Agora procura "Todos"
    const todosElement = await biPage.$("text='Todos'");
    if (todosElement) {
      console.log("Encontrado elemento 'Todos', clicando...");
      await todosElement.click();
      await biPage.waitForTimeout(3000);
      console.log("Filtro ajustado para 'Todos'");
    } else {
      console.log("Elemento 'Todos' nao encontrado - tentando via dropdown/checkbox");
      // Tenta encontrar checkboxes ou lista de opcoes
      const checkboxes = await biPage.$$("input[type='checkbox'], .slicer-checkbox-list label, [role='checkbox']");
      console.log("Checkboxes encontrados: " + checkboxes.length);
      for (const cb of checkboxes) {
        const text = await cb.evaluate(el => el.textContent || el.parentElement?.textContent || "");
        if (text.includes("Todos")) {
          console.log("Clicando checkbox 'Todos'");
          await cb.click();
          await biPage.waitForTimeout(2000);
          break;
        }
      }
    }

    await biPage.waitForTimeout(5000);
    console.log("Pronto - aguardando recarregamento do BI");
    await browser.close();
    process.exit(0);
  } catch (e) {
    console.log("ERRO: " + e.message);
    process.exit(1);
  }
})();