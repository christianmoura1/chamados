const { chromium } = require("C:/projetos/certponto-report/node_modules/playwright");
(async () => {
let browser;
try {
browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page = browser.contexts()[0].pages().find(p => p.url().includes("syos.com.br"));
if (!page) { console.log("SYOS page not found"); process.exit(1); }
console.log("Page: " + page.url().substring(0, 80));

// Captura TODAS as requisicoes incluindo XHR/fetch apos o render completo
const allReqs = [];
page.on("response", async (resp) => {
const url = resp.url();
if (url.includes(".js") || url.includes(".css") || url.includes(".png") ||
url.includes(".svg") || url.includes(".woff") || url.includes(".ttf") ||
url.includes("google") || url.includes("clarity") || url.includes("sentry") ||
url.includes("errbit") || url.includes("favicon")) return;
try {
const ct = resp.headers()["content-type"] || "";
let body = "";
if (ct.includes("json") || ct.includes("text/plain")) {
body = await resp.text();
}
allReqs.push({
url: url.substring(0, 300),
status: resp.status(),
ct: ct.substring(0, 60),
method: resp.request().method(),
bodyLen: body.length,
bodyPreview: body.substring(0, 1000)
});
} catch(e) {}
});

// Navega para a pagina de sensores (mais dados)
console.log("Navegando para /web/sensors...");
await page.goto("https://zampburgerking.syos.com.br/web/sensors?regions=1777551&stores=1753299%7E1753271%7E1753347%7E1753337", { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(10000);

console.log("\n=== REQUISICOES CAPTURADAS: " + allReqs.length + " ===");
allReqs.forEach((r, i) => {
console.log("\n--- [" + i + "] " + r.method + " " + r.status + " (" + r.bodyLen + " bytes) ---");
console.log("URL: " + r.url);
console.log("CT: " + r.ct);
if (r.bodyPreview && r.bodyLen > 0 && r.bodyLen < 5000) {
console.log("Body: " + r.bodyPreview.substring(0, 800));
} else if (r.bodyLen >= 5000) {
console.log("Body (truncado): " + r.bodyPreview.substring(0, 500) + "...");
}
});

// Tambem tenta a API REST diretamente com o token
console.log("\n=== TENTANDO API REST DIRETA ===");
const token = "0.lamt58zsgn-865";
const baseUrl = "https://zampburgerking.syos.com.br";
const stores = "1753299,1753271,1753347,1753337";

// Tenta varios endpoints comuns
const endpoints = [
"/restapi/sensors?stores=" + stores,
"/restapi/devices?stores=" + stores,
"/restapi/cards?stores=" + stores,
"/restapi/temperatures?stores=" + stores,
"/api/sensors?stores=" + stores,
"/api/devices?stores=" + stores,
"/web/api/sensors?stores=" + stores,
"/restapi/client/865/sensors",
"/restapi/client/865/devices"
];

for (const ep of endpoints) {
try {
const resp = await page.evaluate(async ({url, token}) => {
const r = await fetch(url, {
headers: { "Cookie": "token=" + token, "Authorization": "Bearer " + token }
});
const text = await r.text();
return { status: r.status, body: text.substring(0, 500) };
}, { url: baseUrl + ep, token });
console.log(ep + " -> " + resp.status + " | " + resp.body.substring(0, 200));
} catch(e) {
console.log(ep + " -> ERROR: " + e.message);
}
}

await browser.close();
process.exit(0);
} catch(e) {
console.log("ERRO: " + e.message);
if (browser) try { await browser.close(); } catch(_) {}
process.exit(1);
}
})();