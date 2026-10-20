
const { chromium } = require("C:/projetos/certponto-report/node_modules/playwright");
(async () => {
  let browser;
  try {
    browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
    const page = browser.contexts()[0].pages().find(p => p.url().includes("syos.com.br"));
    if (!page) { console.log("SYOS page not found"); process.exit(1); }
    console.log("SYOS page: " + page.url().substring(0, 100));
    const captured = [];
    page.on("response", async (resp) => {
      const url = resp.url();
      if (url.includes("/api/") || url.includes("/cards") || url.includes("/sensor") || url.includes("/temp") || url.includes("/data") || url.includes("/device")) {
        try {
          const ct = resp.headers()["content-type"] || "";
          const body = ct.includes("json") ? await resp.text() : "(non-json)";
          captured.push({ url: url.substring(0, 200), status: resp.status(), ct, bodyPreview: body.substring(0, 500) });
        } catch (e) { captured.push({ url: url.substring(0, 200), status: resp.status(), error: e.message }); }
      }
    });
    console.log("Recarregando pagina para capturar requisicoes...");
    await page.reload({ waitUntil: "networkidle", timeout: 45000 });
    await page.waitForTimeout(8000);
    console.log("Requisicoes capturadas: " + captured.length);
    captured.forEach((r, i) => {
      console.log("--- [" + i + "] ---");
      console.log("URL: " + r.url);
      console.log("Status: " + r.status + " | CT: " + r.ct);
      console.log("Body: " + (r.bodyPreview || r.error || "").substring(0, 400));
    });
    const cookies = await page.context().cookies("https://zampburgerking.syos.com.br");
    console.log("\\nCookies SYOS: " + cookies.length);
    cookies.forEach(c => console.log("  " + c.name + " = " + c.value.substring(0, 60) + (c.value.length > 60 ? "..." : "")));
    const localStorage = await page.evaluate(() => {
      const out = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k.toLowerCase().includes("token") || k.toLowerCase().includes("auth") || k.toLowerCase().includes("session") || k.toLowerCase().includes("jwt")) {
          out[k] = localStorage.getItem(k).substring(0, 80);
        }
      }
      return out;
    });
    console.log("\\nLocalStorage auth-related: " + JSON.stringify(localStorage));
    await browser.close();
    process.exit(0);
  } catch (e) {
    console.log("ERRO: " + e.message);
    if (browser) try { await browser.close(); } catch (_) {}
    process.exit(1);
  }
})();
