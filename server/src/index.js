const path = require("path");
const express = require("express");
const cors = require("cors");

const { createDb, initSchema } = require("./db");
const apiRouter = require("./routes/api");

const app = express();
app.use(cors());
app.use(express.json());

// 靜態前端頁面
const webDir = path.join(__dirname, "..", "..", "web");
app.use(express.static(webDir));

app.get("/", (req, res) => {
  res.sendFile(path.join(webDir, "index.html"));
});

// 初始化 SQLite
const db = createDb(path.join(__dirname, "..", "..", "data", "worktime.sqlite"));
initSchema(db);

app.use("/api", apiRouter(db));

const port = process.env.PORT ? Number(process.env.PORT) : 3000;
const server = app.listen(port, () => {
  console.log(`[worktime] Server listening on http://localhost:${port}`);
});

// 埠被佔用時給出可操作的說明（避免只看到 EADDRINUSE）
server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `[worktime] 埠 ${port} 已被佔用（可能還有舊的伺服器在跑）。\n` +
        "作法一：關閉佔用該埠的程序：\n" +
        `  netstat -ano | findstr :${port}\n` +
        "  taskkill /PID <PID> /F\n" +
        "作法二：改用其它埠：\n" +
        "  PowerShell: $env:PORT=3001; npm run dev\n" +
        "  CMD: set PORT=3001 && npm run dev"
    );
  } else {
    console.error(err);
  }
  process.exit(1);
});

