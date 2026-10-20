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
      pages.forEach(p => console.log(" - " + p.url().substring(0, 80)));
      process.exit(1);
    }

    console.log("Aba BI encontrada. Trazendo para frente...");
    await biPage.bringToFront();
    await biPage.waitForTimeout(3000);

    // Tenta encontrar o slicer de Categoria
    // O Power BI usa estruturas complexas. Vamos tentar clicar no texto "All" primeiro.
    console.log("Procurando elemento 'All' no slicer...");

    // Tenta localizar o container do slicer que contem "Categoria"
    // Muitas vezes o titulo do slicer esta perto.
    const allLocator = biPage.getByText("All", { exact: true });
    const count = await allLocator.count();

    if (count > 0) {
      console.log(`Encontrados ${count} elementos 'All'. Clicando no primeiro visivel...`);
      // Tenta clicar no primeiro que estiver visivel
      for (let i = 0; i < count; i++) {
        if (await allLocator.nth(i).isVisible()) {
          await allLocator.nth(i).click();
          console.log("Clicado em 'All'. Aguardando menu/lista...");
          await biPage.waitForTimeout(2000);
          break;
        }
      }
    } else {
      console.log("Elemento 'All' nao encontrado diretamente. Tentando abordagem alternativa...");
    }

    // Agora procura por "Todos"
    console.log("Procurando elemento 'Todos'...");
    const todosLocator = biPage.getByText("Todos", { exact: true });
    const todosCount = await todosLocator.count();

    if (todosCount > 0) {
      console.log(`Encontrados ${todosCount} elementos 'Todos'. Clicando...`);
      for (let i = 0; i < todosCount; i++) {
        if (await todosLocator.nth(i).isVisible()) {
          await todosLocator.nth(i).click();
          console.log("SUCESSO: Clicado em 'Todos'.");
          await biPage.waitForTimeout(5000); // Espera o BI recalcular
          break;
        }
      }
    } else {
      console.log("AVISO: Elemento 'Todos' nao encontrado apos clicar 'All'.");
      console.log("O filtro pode ja estar correto ou a estrutura do BI mudou.");
      // Tenta verificar se ha algum checkbox marcado ou estado atual
    }

    console.log("Script de correcao concluido.");
    await browser.close();
    process.exit(0);

  } catch (e) {
    console.error("ERRO FATAL: " + e.message);
    if (browser) await browser.close();
    process.exit(1);
  }
})();