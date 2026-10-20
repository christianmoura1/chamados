const { chromium } = require("C:/projetos/certponto-report/node_modules/playwright");

(async () => {
  try {
    const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
    const contexts = browser.contexts();
    console.log("Contexts: " + contexts.length);

    if (!contexts.length) {
      console.log("sem contextos");
      process.exit(1);
    }

    const pages = contexts[0].pages();
    console.log("Pages: " + pages.length);

    if (!pages.length) {
      console.log("sem paginas");
      process.exit(1);
    }

    const page = pages[0];
    console.log("Navegando para SOMA...");
    await page.goto("https://soma.zamp.com.br/wm_task_list.do", {
      waitUntil: "domcontentloaded",
      timeout: 30000
    });

    console.log("URL atual: " + page.url());
    console.log("Title: " + await page.title());

    await browser.close();
    process.exit(0);
  } catch(e) {
    console.log("ERRO: " + e.message);
    process.exit(1);
  }
})();