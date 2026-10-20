const { chromium } = require("C:/projetos/certponto-report/node_modules/playwright");
(async () => {
let browser;
try {
browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page = browser.contexts()[0].pages().find(p => p.url().includes("syos.com.br"));
if (!page) { console.log("SYOS page not found"); process.exit(1); }
console.log("Page atual: " + page.url().substring(0, 100));

// Navega de volta para a pagina de cards
const cardsUrl = "https://zampburgerking.syos.com.br/web/cards?regions=1777551&stores=1753299%7E1753271%7E1753347%7E1753337";
console.log("Navegando para cards...");

// Captura TODAS as requisicoes
const allReqs = [];
page.on("response", async (resp) => {
const url = resp.url();
if (url.includes(".js") || url.includes(".css") || url.includes(".png") ||
url.includes(".svg") || url.includes(".woff") || url.includes(".ttf") ||
url.includes("google") || url.includes("clarity") || url.includes("sentry") ||
url.includes("errbit") || url.includes("favicon") || url.includes(".ico")) return;
try {
const ct = resp.headers()["content-type"] || "";
let body = "";
if (ct.includes("json") || ct.includes("text/plain") || ct.includes("text/html")) {
body = await resp.text();
}
allReqs.push({
url: url.substring(0, 300),
status: resp.status(),
ct: ct.substring(0, 60),
method: resp.request().method(),
bodyLen: body.length,
bodyPreview: body.substring(0, 2000)
});
} catch(e) {}
});

await page.goto(cardsUrl, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(15000);

console.log("\n=== REQUISICOES CAPTURADAS: " + allReqs.length + " ===");
allReqs.forEach((r, i) => {
console.log("\n--- [" + i + "] " + r.method + " " + r.status + " (" + r.bodyLen + " bytes) ---");
console.log("URL: " + r.url);
console.log("CT: " + r.ct);
if (r.bodyPreview && r.bodyLen > 0) {
console.log("Body: " + r.bodyPreview.substring(0, 1500));
}
});

// Extrai dados do DOM apos render completo
console.log("\n=== DADOS DO DOM ===");
const domData = await page.evaluate(() => {
const results = [];
// Procura todos os elementos visiveis
const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
while (walker.nextNode()) {
const text = walker.currentNode.textContent.trim();
// Procura por temperaturas (numeros com graus ou valores negativos/positivos tipicos de camera)
if (text.match(/-?\d+[\.,]?\d*\s*[°º]/) || (text.match(/^-?\d+[\.,]\d+$/) && parseFloat(text.replace(',','.')) > -50 && parseFloat(text.replace(',','.')) < 50)) {
const parent = walker.currentNode.parentElement;
const grandparent = parent ? parent.parentElement : null;
results.push({
text: text,
parentTag: parent ? parent.tagName : "?",
parentClass: parent ? (parent.className || "").toString().substring(0, 80) : "",
gpClass: grandparent ? (grandparent.className || "").toString().substring(0, 80) : "",
gpText: grandparent ? (grandparent.textContent || "").trim().substring(0, 200) : ""
});
}
}
return results.slice(0, 50);
});
console.log("Elementos com temperatura: " + domData.length);
domData.forEach((d, i) => {
console.log("[" + i + "] temp=" + d.text + " | parent=<" + d.parentTag + " class='" + d.parentClass + "'> | gp='" + d.gpText.substring(0, 120) + "'");
});

// Tenta extrair dados estruturados dos cards
console.log("\n=== CARDS ESTRUTURADOS ===");
const cardData = await page.evaluate(() => {
const results = [];
// Procura por containers de cards
const cards = document.querySelectorAll("[class*='card-item'], [class*='sensor-card'], [class*='device-card'], .card, [data-store], [data-sensor]");
cards.forEach((card, i) => {
if (i < 20) {
const text = (card.textContent || "").trim().replace(/\s+/g, " ").substring(0, 300);
const cls = (card.className || "").toString().substring(0, 100);
results.push({ cls, text });
}
});
// Se nao encontrou cards especificos, tenta divs com dados estruturados
if (results.length === 0) {
const divs = document.querySelectorAll("div[class]");
divs.forEach((div, i) => {
const text = (div.textContent || "").trim();
if (text.match(/-?\d+[\.,]?\d*\s*[°º]/) && text.length < 500 && text.length > 10) {
const cls = (div.className || "").toString().substring(0, 100);
results.push({ cls, text: text.replace(/\s+/g, " ").substring(0, 300) });
}
});
}
return results.slice(0, 30);
});
console.log("Cards encontrados: " + cardData.length);
cardData.forEach((c, i) => {
console.log("[" + i + "] class='" + c.cls + "' | text='" + c.text + "'");
});

// Extrai o token e cookies
const cookies = await page.context().cookies("https://zampburgerking.syos.com.br");
console.log("\n=== COOKIES ===");
cookies.forEach(c => console.log(" " + c.name + " = " + c.value.substring(0, 80)));

await browser.close();
process.exit(0);
} catch(e) {
console.log("ERRO: " + e.message);
if (browser) try { await browser.close(); } catch(_) {}
process.exit(1);
}
})();