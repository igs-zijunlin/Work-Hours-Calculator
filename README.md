# 人力工時統計工具（百分比制）

本機網頁工具：以「每月總工時 %」與「工作天」為基礎計算額度，逐日填寫佔比並同步儲存至 SQLite。支援多專案分頁（彼此資料獨立）、台灣國定假日匯入與手動休假日。

## 功能概要

- **月份設定**：指定年月、本月總工時 %（全月加總目標）。
- **工作天與額度**：週一至週五為預設工作日，可扣掉手動假日與國定假日；額度 = 總 % × 工作天數；摘要顯示已填加總相對額度之比例。
- **日曆表格**：週末灰底、特殊假日紫底、工作天有序號與可編輯 %；離開輸入框即自動儲存。
- **多專案**：自訂專案名稱、切換分頁；瀏覽器會記住目前選擇的專案（`localStorage`）。
- **資料庫**：首次啟動會建立/遷移 schema；若為舊版單專案資料會自動遷移到多專案結構。

## 環境需求

- [Node.js](https://nodejs.org/)（建議 **LTS**；須符合 `better-sqlite3` 編譯需求）
- Windows / macOS / Linux 皆可

## 安裝與啟動

於專案根目錄：

```bash
cd server
npm install
cd ..
npm run dev
```

瀏覽器開啟：<http://localhost:3000/>

正式模式（不自動重啟）：

```bash
npm start
```

## 設定埠號

預設 `3000`。若埠被佔用可改用環境變數 `PORT`：

```powershell
$env:PORT=3001; npm run dev
```

（若出現埠佔用錯誤，終端機也會提示可用 `netstat` / `taskkill` 或改用 `PORT`。）

## 資料存放位置

SQLite 檔案預設為專案內：

`data/worktime.sqlite`（可能伴隨 `-wal`、`-shm`）

`.gitignore` 已排除這些本機資料庫檔案；目錄內保留 `data/.gitkeep` 以便版本庫中有空資料夾。

## 技術堆疊

| 項目 | 說明 |
|------|------|
| 後端 | Express、`better-sqlite3`、CORS |
| 假日 | `date-holidays`（台灣 `public`） |
| 前端 | 靜態 HTML / JavaScript（`web/`） |

## 授權

本專案為私有工具用途（`package.json` 標示 `private: true`），實際授權請依貴單位政策為準。
