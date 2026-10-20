const { chromium } = require("C:/projetos/certponto-report/node_modules/playwright");
(async () => {
let browser;
try {
browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page = browser.contexts()[0].pages().find(p => p.url().includes("syos.com.br"));
if (!page) { console.log("SYOS page not found"); process.exit(1); }
console.log("Page: " + page.url().substring(0, 80));
// Captura TODAS as requisicoes XHR/fetch apos o render completo
const xhrReqs = [];
page.on("response", async (resp) => {
const url = resp.url();
const req = resp.request();
const resourceType = req.resourceType();
// Captura XHR, fetch, e qualquer JSON
if (resourceType === "xhr" || resourceType === "fetch" || url.includes("/restapi/") || url.includes("/api/")) {
try {
const ct = resp.headers()["content-type"] || "";
let body = "";
if (ct.includes("json") || ct.includes("text")) {
body = await resp.text();
}
xhrReqs.push({
url: url.substring(0, 300),
status: resp.status(),
ct: ct.substring(0, 60),
method: req.method(),
bodyLen: body.length,
bodyPreview: body.substring(0, 2000),
resourceType
});
} catch(e) {}
}
});
console.log("Aguardando 20s para capturar XHR pos-render...");
await page.waitForTimeout(20000);
console.log("\n=== XHR REQUESTS CAPTURADAS: " + xhrReqs.length + " ===");
xhrReqs.forEach((r, i) => {
console.log("\n--- [" + i + "] " + r.method + " " + r.status + " (" + r.bodyLen + " bytes) [" + r.resourceType + "] ---");
console.log("URL: " + r.url);
console.log("CT: " + r.ct);
if (r.bodyPreview && r.bodyLen > 0) {
console.log("Body: " + r.bodyPreview.substring(0, 1500));
}
});
// Tambem tenta extrair dados do DOM apos render completo
console.log("\n=== DADOS DO DOM (temperaturas) ===");
const domTemps = await page.evaluate(() => {
const results = [];
const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
while (walker.nextNode()) {
const text = walker.currentNode.textContent.trim();
if (text.match(/-?\d+[\.,]?\d*\s*[°º]/) || (text.match(/^-?\d+[\.,]\d+$/) && parseFloat(text.replace(",",".")) > -50 && parseFloat(text.replace(",",".")) < 50)) {
const parent = walker.currentNode.parentElement;
results.push({
text: text,
parentTag: parent ? parent.tagName : "?",
parentClass: parent ? (parent.className || "").toString().substring(0, 100) : "",
parentText: parent ? (parent.textContent || "").trim().substring(0, 200) : ""
});
}
}
return results.slice(0, 50);
});
console.log("Elementos com temperatura: " + domTemps.length);
domTemps.forEach((d, i) => {
console.log("[" + i + "] temp=" + d.text + " | <" + d.parentTag + " class='" + d.parentClass + "'> | context='" + d.parentText.substring(0, 100) + "'");
});
await browser.close();
process.exit(0);
} catch(e) {
console.log("ERRO: " + e.message);
if (browser) try { await browser.close(); } catch(_) {}
process.exit(1);
}
})();