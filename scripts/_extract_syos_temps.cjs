const https = require("https");
const fs = require("fs");

const TOKEN = "0.lamt58zsgn-865";
const WIRE_URL = "https://zampburgerking.syos.com.br/web/app/wire/b8c03f771f7af49a41cc14d5a05887f3";

function fetchJson(url, token) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      headers: { "Cookie": "token=" + token }
    };
    https.get(opts, (res) => {
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => {
        try { resolve(JSON.parse(d)); }
        catch(e) { reject(new Error("JSON parse error: " + e.message + " | body: " + d.substring(0, 200))); }
      });
    }).on("error", reject);
  });
}

(async () => {
  try {
    console.log("Buscando dados do wire SYOS...");
    const data = await fetchJson(WIRE_URL, TOKEN);

    console.log("Keys raiz: " + Object.keys(data).join(", "));
    if (data.locals) {
      console.log("Locals keys: " + Object.keys(data.locals).join(", "));

      // Procura por dados de sensores/temperaturas em várias chaves possíveis
      const searchKeys = ["sensors", "devices", "cards", "stores", "readings", "temperatures", "data"];
      for (const key of searchKeys) {
        if (data.locals[key]) {
          const val = data.locals[key];
          const preview = JSON.stringify(val).substring(0, 500);
          console.log("\n=== " + key + " ===");
          console.log("Type: " + typeof val + " | Length: " + (Array.isArray(val) ? val.length : "N/A"));
          console.log("Preview: " + preview);
        }
      }

      // Salva o dump completo para análise
      fs.writeFileSync("C:/projetos/chamados/data/syos_wire_dump.json", JSON.stringify(data, null, 2), "utf8");
      console.log("\nDump salvo em syos_wire_dump.json (" + JSON.stringify(data).length + " bytes)");

      // Tenta extrair temperaturas de forma recursiva
      console.log("\n=== BUSCANDO TEMPERATURAS RECURSIVAMENTE ===");
      const temps = [];
      function findTemps(obj, path) {
        if (!obj || typeof obj !== "object") return;
        for (const [k, v] of Object.entries(obj)) {
          const newPath = path + "." + k;
          if (typeof v === "number" && v > -50 && v < 50 && (k.toLowerCase().includes("temp") || k.toLowerCase().includes("value") || k.toLowerCase().includes("reading"))) {
            temps.push({ path: newPath, value: v, key: k });
          } else if (typeof v === "string" && v.match(/^-?\d+[\.,]?\d*$/) && parseFloat(v.replace(',','.')) > -50 && parseFloat(v.replace(',','.')) < 50) {
            const num = parseFloat(v.replace(',','.'));
            if (k.toLowerCase().includes("temp") || k.toLowerCase().includes("value")) {
              temps.push({ path: newPath, value: num, key: k });
            }
          } else if (typeof v === "object" && v !== null) {
            findTemps(v, newPath);
          }
        }
      }
      findTemps(data.locals, "locals");
      console.log("Temperaturas encontradas: " + temps.length);
      temps.slice(0, 20).forEach((t, i) => {
        console.log("[" + i + "] " + t.path + " = " + t.value);
      });

      // Extrai informações das lojas
      if (data.locals.filters && data.locals.filters.physicalStores) {
        console.log("\n=== LOJAS NO FILTRO ===");
        const stores = data.locals.filters.physicalStores;
        console.log("Total lojas: " + stores.length);
        stores.slice(0, 10).forEach((s, i) => {
          console.log("[" + i + "] " + s.name + " (id=" + s.store_id + ", selected=" + s.selected + ")");
        });
      }
    }

    process.exit(0);
  } catch(e) {
    console.log("ERRO: " + e.message);
    process.exit(1);
  }
})();