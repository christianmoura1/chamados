const { chromium } = require("C:/projetos/certponto-report/node_modules/playwright");
const fs = require("fs");
(async () => {
let browser;
try {
browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page = browser.contexts()[0].pages().find(p => p.url().includes("syos.com.br"));
if (!page) { console.log("SYOS page not found in CDP"); process.exit(1); }
console.log("Page: " + page.url().substring(0, 100));
// Se a pagina estiver em /sensors (erro 404 anterior), volta para /cards
if (page.url().includes("/sensors")) {
const cardsUrl = "https://zampburgerking.syos.com.br/web/cards?regions=1777551&stores=1753299%7E1753271%7E1753347%7E1753337";
console.log("Voltando para /cards...");
await page.goto(cardsUrl, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(5000);
}
// Captura a resposta do endpoint /wire/ (contem os dados dos sensores/temperaturas)
let wireBody = null;
let wireUrl = null;
page.on("response", async (resp) => {
const url = resp.url();
if (url.includes("/wire/") && !wireBody) {
try {
const ct = resp.headers()["content-type"] || "";
if (ct.includes("json")) {
wireBody = await resp.text();
wireUrl = url;
}
} catch(e) {}
}
});
console.log("Recarregando para capturar /wire/ fresco...");
await page.reload({ waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(12000);
if (!wireBody) {
console.log("ERRO: nenhum /wire/ capturado apos reload");
process.exit(1);
}
console.log("Wire URL: " + wireUrl);
console.log("Wire size: " + wireBody.length + " bytes");
// Salva o dump bruto
const dumpPath = "C:/projetos/chamados/data/syos_wire_dump.json";
fs.writeFileSync(dumpPath, wireBody, "utf8");
console.log("Salvo em " + dumpPath);
// Parseia e extrai estrutura
const data = JSON.parse(wireBody);
console.log("Keys raiz: " + Object.keys(data).join(", "));
if (data.locals) {
console.log("Locals keys: " + Object.keys(data.locals).join(", "));
}
// Busca recursivamente por campos de temperatura/sensor
const temps = [];
const sensors = [];
function walk(obj, path) {
if (!obj || typeof obj !== "object") return;
if (Array.isArray(obj)) {
obj.forEach((v, i) => walk(v, path + "[" + i + "]"));
return;
}
for (const [k, v] of Object.entries(obj)) {
const np = path + "." + k;
const kl = k.toLowerCase();
if (typeof v === "number" && v > -60 && v < 80 && (kl.includes("temp") || kl.includes("value") || kl.includes("reading") || kl.includes("current"))) {
temps.push({ path: np, value: v, key: k });
} else if (kl === "name" || kl === "sensor_name" || kl === "device_name" || kl === "title") {
if (typeof v === "string" && v.length < 100) {
sensors.push({ path: np, name: v });
}
} else if (typeof v === "object" && v !== null) {
walk(v, np);
}
}
}
if (data.locals) walk(data.locals, "locals");
console.log("\n=== TEMPERATURAS ENCONTRADAS: " + temps.length + " ===");
temps.slice(0, 30).forEach((t, i) => console.log("[" + i + "] " + t.path + " = " + t.value));
console.log("\n=== SENSORES/NOMES: " + sensors.length + " ===");
sensors.slice(0, 30).forEach((s, i) => console.log("[" + i + "] " + s.path + " = " + s.name));
// Salva resumo estruturado
const summary = { capturedAt: new Date().toISOString(), wireUrl, tempCount: temps.length, temps: temps.slice(0, 200), sensorNames: sensors.slice(0, 200) };
fs.writeFileSync("C:/projetos/chamados/data/syos_temps_summary.json", JSON.stringify(summary, null, 2), "utf8");
console.log("\nResumo salvo em syos_temps_summary.json");
await browser.close();
process.exit(0);
} catch(e) {
console.log("ERRO: " + e.message);
if (browser) try { await browser.close(); } catch(_) {}
process.exit(1);
}
})();