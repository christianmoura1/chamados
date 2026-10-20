const { chromium } = require('C:/projetos/certponto-report/node_modules/playwright');
(async () => {
const URL_RISCO = 'https://app.powerbi.com/groups/me/apps/38828dac-b7dc-46e0-a737-57db66b372de/reports/1cfa2020-a0a9-4770-9ac1-d1f1dfcb2f1b';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222', { timeout: 120000 });
const contexts = browser.contexts();
let page = null;
for (const ctx of contexts) {
for (const p of ctx.pages()) {
if (p.url().includes('1cfa2020')) { page = p; break; }
}
if (page) break;
}
if (!page) {
console.log('ABA_NAO_ENCONTRADA — abrindo nova');
const ctx = contexts[0];
page = await ctx.newPage();
await page.goto(URL_RISCO, { waitUntil: 'networkidle', timeout: 180000 });
} else {
console.log('ABA_ENCONTRADA — recarregando');
await page.reload({ waitUntil: 'networkidle', timeout: 180000 });
}
await page.waitForTimeout(45000);
const stamp = await page.evaluate(() => {
const all = [...document.querySelectorAll('div, span, p')];
for (const el of all) {
const t = el.textContent || '';
if (/Última\s+Atualiza/i.test(t) && t.length < 200) {
const m = t.match(/(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2})/);
if (m) return m[1];
return t.trim();
}
}
return 'NAO_ENCONTRADO';
});
console.log('CARIMBO_BI:' + stamp);
await browser.close();
})().catch(e => { console.error('ERRO:' + e.message); process.exit(1); });