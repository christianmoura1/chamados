const http = require("http");
const WebSocket = require("C:/projetos/certponto-report/node_modules/ws");
http.get("http://127.0.0.1:9222/json/list", (res) => {
  let data = "";
  res.on("data", (c) => data += c);
  res.on("end", () => {
    const tabs = JSON.parse(data).filter(t => t.type === "page");
    if (!tabs.length) { console.log("ERRO: nenhuma aba page"); process.exit(1); }
    const tab = tabs[0];
    console.log("Usando aba: " + tab.id.substring(0,8) + " - " + tab.title);
    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    ws.on("open", () => {
      ws.send(JSON.stringify({id:1, method:"Page.navigate", params:{url:"https://soma.zamp.com.br/wm_task_list.do"}}));
    });
    ws.on("message", (msg) => {
      const r = JSON.parse(msg);
      if (r.id === 1) { console.log("Navegacao enviada ok"); setTimeout(() => { ws.close(); process.exit(0); }, 3000); }
    });
    ws.on("error", (e) => { console.log("WS erro: " + e.message); process.exit(1); });
    setTimeout(() => { console.log("TIMEOUT ws"); process.exit(1); }, 15000);
  });
}).on("error", (e) => { console.log("HTTP erro: " + e.message); process.exit(1); });