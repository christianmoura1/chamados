const { chromium } = require("C:/projetos/certponto-report/node_modules/playwright");
(async () => {
let browser;
try {
browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page = browser.contexts()[0].pages().find(p => p.url().includes("syos.com.br"));
if (!page) { console.log("SYOS page not found"); process.exit(1); }
console.log("Page: " + page.url().substring(0, 100));

// Captura TODAS as requisicoes de rede (XHR, fetch, etc)
const captured = [];
page.on("response", async (resp) => {
const url = resp.url();
// Ignora recursos estaticos e analytics
if (url.includes(".js") || url.includes(".css") || url.includes(".png") ||
    url.includes(".svg") || url.includes("google") || url.includes("clarity") ||
    url.includes("sentry") || url.includes("errbit")) return;
try {
const ct = resp.headers()["content-type"] || "";
let bodyPreview = "(non-json)";
if (ct.includes("json") || ct.includes("text")) {
const body = await resp.text();
bodyPreview = body.substring(0, 800);
}
captured.push({
url: url.substring(0, 250),
status: resp.status(),
ct: ct.substring(0, 50),
method: resp.request().method(),
bodyPreview
});
} catch (e) {
captured.push({ url: url.substring(0, 250), status: resp.status(), error: e.message });
}
});

console.log("Recarregando pagina para capturar TODAS as requisicoes...");
await page.reload({ waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(10000);

console.log("\n=== REQUISICOES CAPTURADAS: " + captured.length + " ===");
captured.forEach((r, i) => {
console.log("\n--- [" + i + "] " + r.method + " " + r.status + " ---");
console.log("URL: " + r.url);
console.log("CT: " + r.ct);
if (r.bodyPreview && r.bodyPreview !== "(non-json)") {
console.log("Body: " + r.bodyPreview.substring(0, 600));
}
if (r.error) console.log("Error: " + r.error);
});

// Tambem tenta extrair dados diretamente do DOM apos render completo
console.log("\n=== EXTRAINDO DADOS DO DOM ===");
const domData = await page.evaluate(() => {
const results = [];
// Procura por elementos que contenham temperaturas
const allElements = document.querySelectorAll("*");
for (const el of allElements) {
const text = (el.textContent || "").trim();
// Procura por padroes de temperatura: numeros com graus, ou valores negativos
if (text.match(/-?\d+[\.,]?\d*\s*[°º]/) || text.match(/-?\d+[\.,]\d+/)) {
const cls = (el.className || "").toString().substring(0, 80);
const tag = el.tagName;
if (text.length < 100 && text.length > 0) {
results.push({ tag, cls, text: text.substring(0, 80) });
}
}
}
return results.slice(0, 30);
});
console.log("Elementos com temperaturas: " + domData.length);
domData.forEach((d, i) => console.log("[" + i + "] <" + d.tag + " class='" + d.cls + "'> " + d.text));

// Extrai cookies de autenticacao
const cookies = await page.context().cookies("https://zampburgerking.syos.com.br");
console.log("\n=== COOKIES SYOS (" + cookies.length + ") ===");
cookies.forEach(c => console.log(" " + c.name + " = " + c.value.substring(0, 80)));

await browser.close();
process.exit(0);
} catch(e) {
console.log("ERRO: " + e.message);
if (browser) try { await browser.close(); } catch(_) {}
process.exit(1);
}
})();