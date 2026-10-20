const fs = require("fs");
const dumpPath = "C:/projetos/chamados/data/syos_wire_dump.json";
if (!fs.existsSync(dumpPath)) { console.log("Dump nao existe: " + dumpPath); process.exit(1); }
const raw = fs.readFileSync(dumpPath, "utf8");
console.log("Dump size: " + raw.length + " bytes");
let d;
try { d = JSON.parse(raw); } catch(e) { console.log("Parse erro: " + e.message); process.exit(1); }
console.log("Top keys: " + Object.keys(d).join(", "));
console.log("data type: " + typeof d.data + (d.data && typeof d.data === "object" ? " | keys: " + Object.keys(d.data).join(", ") : ""));
console.log("views type: " + typeof d.views + (d.views && typeof d.views === "object" ? " | keys: " + Object.keys(d.views).join(", ") : ""));
if (d.data && typeof d.data === "object") {
  for (const k of Object.keys(d.data)) {
    const v = d.data[k];
    const t = Array.isArray(v) ? "array[" + v.length + "]" : typeof v;
    let preview = "";
    try { preview = JSON.stringify(v).substring(0, 300); } catch(_) {}
    console.log("  data." + k + " -> " + t + " | " + preview);
  }
}
if (d.views && typeof d.views === "object") {
  for (const k of Object.keys(d.views)) {
    const v = d.views[k];
    const t = Array.isArray(v) ? "array[" + v.length + "]" : typeof v;
    console.log("  views." + k + " -> " + t);
  }
}
// Busca recursiva por qualquer campo que pareca temperatura/sensor/valor
console.log("\n=== BUSCA RECURSIVA POR CAMPOS DE SENSOR/TEMP ===");
const hits = [];
function walk(obj, path, depth) {
  if (depth > 8 || !obj || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    // so desce nos primeiros elementos pra nao explodir
    const lim = Math.min(obj.length, 5);
    for (let i = 0; i < lim; i++) walk(obj[i], path + "[" + i + "]", depth + 1);
    return;
  }
  for (const [k, v] of Object.entries(obj)) {
    const kl = k.toLowerCase();
    const np = path + "." + k;
    if (kl.includes("temp") || kl.includes("sensor") || kl.includes("device") || kl.includes("reading") || kl.includes("current") || kl.includes("value") || kl.includes("measure")) {
      const vs = typeof v === "object" ? JSON.stringify(v).substring(0, 200) : String(v).substring(0, 100);
      hits.push({ path: np, key: k, type: typeof v, val: vs });
    }
    if (typeof v === "object" && v !== null) walk(v, np, depth + 1);
  }
}
walk(d, "root", 0);
console.log("Hits: " + hits.length);
hits.slice(0, 40).forEach((h, i) => console.log("[" + i + "] " + h.path + " (" + h.type + ") = " + h.val));