const http = require("http");
const WebSocket = require("C:/projetos/chamados/node_modules/ws");

const PERDA_BI_URL = "https://app.powerbi.com/groups/me/apps/38828dac-b7dc-46e0-a737-57db66b372de/reports/44db1bb6-9879-4bd8-a6bd-98d1cb027a37";

http.get("http://127.0.0.1:9222/json/list", (res) => {
  let data = "";
  res.on("data", (c) => data += c);
  res.on("end", () => {
    const tabs = JSON.parse(data).filter(t => t.type === "page");
    // Procura a aba D929D70A ou qualquer aba que já tenha o URL de perda
    let tab = tabs.find(t => t.id.startsWith("D929D70A"));
    if (!tab) {
      tab = tabs.find(t => t.url.includes("44db1bb6"));
    }
    if (!tab) {
      console.log("ERRO: nenhuma aba encontrada para navegar");
      process.exit(1);
    }
    console.log("Usando aba: " + tab.id.substring(0, 8) + " - " + tab.title);
    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    ws.on("open", () => {
      console.log("Navegando para: " + PERDA_BI_URL);
      ws.send(JSON.stringify({
        id: 1,
        method: "Page.navigate",
        params: { url: PERDA_BI_URL }
      }));
    });
    ws.on("message", (msg) => {
      const r = JSON.parse(msg);
      if (r.id === 1) {
        console.log("Navegação enviada ok");
        setTimeout(() => {
          ws.close();
          process.exit(0);
        }, 5000);
      }
    });
    ws.on("error", (e) => {
      console.log("WS erro: " + e.message);
      process.exit(1);
    });
    setTimeout(() => {
      console.log("TIMEOUT");
      process.exit(1);
    }, 20000);
  });
}).on("error", (e) => {
  console.log("HTTP erro: " + e.message);
  process.exit(1);
});