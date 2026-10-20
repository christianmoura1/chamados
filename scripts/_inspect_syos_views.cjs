const fs = require("fs");
const dumpPath = "C:/projetos/chamados/data/syos_wire_dump.json";
if (!fs.existsSync(dumpPath)) { console.log("Dump nao existe: " + dumpPath); process.exit(1); }
const raw = fs.readFileSync(dumpPath, "utf8");
console.log("Dump size: " + raw.length + " bytes");
let d;
try { d = JSON.parse(raw); } catch(e) { console.log("Parse erro: " + e.message); process.exit(1); }

console.log("\n=== VIEWS[0] STRUCTURE ===");
const v0 = d.views[0];
if (!v0) { console.log("views[0] nao existe"); process.exit(1); }

console.log("views[0] keys: " + Object.keys(v0).join(", "));

if (v0.locals) {
  console.log("\nviews[0].locals keys: " + Object.keys(v0.locals).join(", "));
  // Mostra preview de cada chave em locals
  for (const k of Object.keys(v0.locals)) {
    const val = v0.locals[k];
    const preview = JSON.stringify(val).substring(0, 300);
    console.log("  " + k + " (" + typeof val + ") = " + preview);
  }
}

if (v0.views) {
  console.log("\nviews[0].views length: " + v0.views.length);
  v0.views.forEach((sv, i) => {
    console.log("\n--- views[0].views[" + i + "] ---");
    console.log("keys: " + Object.keys(sv).join(", "));

    if (sv.locals) {
      console.log("locals keys: " + Object.keys(sv.locals).join(", "));
      // Mostra as primeiras chaves de locals
      const localKeys = Object.keys(sv.locals);
      for (const k of localKeys.slice(0, 10)) {
        const val = sv.locals[k];
        const preview = JSON.stringify(val).substring(0, 200);
        console.log("  " + k + " = " + preview);
      }
      if (localKeys.length > 10) {
        console.log("  ... e mais " + (localKeys.length - 10) + " chaves");
      }
    }

    if (sv.views) {
      console.log("sub-views: " + sv.views.length);
      sv.views.forEach((ssv, j) => {
        if (j < 3) {
          console.log("\n  [" + j + "] keys: " + Object.keys(ssv).join(", "));
          if (ssv.locals) {
            const lk = Object.keys(ssv.locals);
            console.log("  locals: " + lk.join(", "));
            // Mostra valores que parecem ser dados de sensor/temperatura
            lk.forEach(k => {
              const val = ssv.locals[k];
              const preview = JSON.stringify(val).substring(0, 300);
              if (k.toLowerCase().includes("temp") || k.toLowerCase().includes("sensor") ||
                  k.toLowerCase().includes("device") || k.toLowerCase().includes("value") ||
                  k.toLowerCase().includes("card") || k.toLowerCase().includes("store")) {
                console.log("    " + k + " = " + preview);
              }
            });
          }
        }
      });
      if (sv.views.length > 3) {
        console.log("  ... e mais " + (sv.views.length - 3) + " sub-views");
      }
    }
  });
}

// Busca especifica por dados de cards/sensores
console.log("\n=== BUSCA POR DADOS DE CARDS/SENSORES ===");
function findCards(obj, path, depth) {
  if (depth > 6 || !obj || typeof obj !== "object") return [];
  const results = [];

  if (Array.isArray(obj)) {
    for (let i = 0; i < Math.min(obj.length, 3); i++) {
      results.push(...findCards(obj[i], path + "[" + i + "]", depth + 1));
    }
    return results;
  }

  for (const [k, v] of Object.entries(obj)) {
    const kl = k.toLowerCase();
    const np = path + "." + k;

    // Procura por arrays que possam ser cards/sensores
    if (Array.isArray(v) && v.length > 0 && v.length < 100) {
      const firstItem = v[0];
      if (firstItem && typeof firstItem === "object") {
        const itemKeys = Object.keys(firstItem).join(", ");
        if (itemKeys.includes("temp") || itemKeys.includes("sensor") || itemKeys.includes("device") ||
            itemKeys.includes("value") || itemKeys.includes("name") || itemKeys.includes("store")) {
          results.push({
            path: np,
            count: v.length,
            sampleKeys: itemKeys,
            sample: JSON.stringify(firstItem).substring(0, 500)
          });
        }
      }
    }

    if (typeof v === "object" && v !== null) {
      results.push(...findCards(v, np, depth + 1));
    }
  }

  return results;
}

const cardHits = findCards(d, "root", 0);
console.log("Arrays potencialmente relevantes: " + cardHits.length);
cardHits.slice(0, 20).forEach((h, i) => {
  console.log("\n[" + i + "] " + h.path + " (" + h.count + " items)");
  console.log("  Keys: " + h.sampleKeys);
  console.log("  Sample: " + h.sample);
});