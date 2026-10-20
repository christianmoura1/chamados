const { chromium } = require("C:/projetos/certponto-report/node_modules/playwright");
(async () => {
let browser;
try {
browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page = browser.contexts()[0].pages().find(p => p.url().includes("syos.com.br"));
if (!page) { console.log("SYOS page not found"); process.exit(1); }
console.log("Page: " + page.url().substring(0, 80));

// Extrai todo o texto visivel da pagina
const bodyText = await page.evaluate(() => document.body.innerText);
console.log("\n=== BODY TEXT (primeiros 3000 chars) ===");
console.log(bodyText.substring(0, 3000));

// Procura elementos que parecem ser cards de temperatura
const cards = await page.evaluate(() => {
const results = [];
const candidates = document.querySelectorAll("[class*=card], [class*=temp], [class*=sensor], [class*=device], [class*=value], [class*=reading]");
candidates.forEach((el, i) => {
if (i < 30) {
const text = (el.textContent || "").trim().substring(0, 200);
const cls = (el.className || "").substring(0, 100);
if (text.match(/\d+[\.,]?\d*\s*[°CcCFf]/) || text.match(/-\d+/) || text.length > 5) {
results.push({ cls, text: text.substring(0, 150) });
}
}
});
return results;
});
console.log("\n=== CARDS/TEMP ELEMENTS (" + cards.length + ") ===");
cards.forEach((c, i) => console.log("[" + i + "] class=" + c.cls + " | text=" + c.text));

// Procura por dados em script tags (JSON embutido)
const scripts = await page.evaluate(() => {
const results = [];
document.querySelectorAll("script").forEach(s => {
const t = s.textContent || "";
if (t.includes("temp") || t.includes("sensor") || t.includes("device") || t.includes("card")) {
results.push(t.substring(0, 500));
}
});
return results.slice(0, 5);
});
console.log("\n=== SCRIPT TAGS com temp/sensor/device (" + scripts.length + ") ===");
scripts.forEach((s, i) => console.log("[" + i + "] " + s.substring(0, 300)));

// Verifica WebSockets
const wsInfo = await page.evaluate(() => {
return { hasWebSocket: typeof WebSocket !== "undefined" };
});
console.log("\n=== WebSocket available: " + wsInfo.hasWebSocket);

await browser.close();
process.exit(0);
} catch(e) {
console.log("ERRO: " + e.message);
if (browser) try { await browser.close(); } catch(_) {}
process.exit(1);
}
})();