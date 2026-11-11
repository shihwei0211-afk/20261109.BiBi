雲端任務測試
雲端任務測試

[報修欄位表（含 10 筆虛構範例資料）](文件/報修欄位表.xlsx)

## 報修登記網頁

首頁為根目錄的 `index.html`，使用純 HTML、CSS、JavaScript，透過 CDN 載入固定版本的 supabase-js v2；正式網站不需要安裝套件或建置。
`config.js` 僅包含公開專案網址與 publishable key，不可放入 secret 或 service_role 金鑰。

表單只新增 `reporter_name`、`location`、`category`、`description`、`urgency`；`id`、`created_at`、`status` 使用資料庫預設值。
清單顯示最新 20 筆，依建立時間倒序，時間以台北時區顯示。
示範資料請只用虛構姓名、地點，勿填寫敏感資訊。

### 本機啟動與測試

使用 Python 3 執行 `python3 -m http.server 8000`，開啟 <http://localhost:8000>，需網路才能連到 CDN 與 Supabase。
JavaScript 語法檢查：`node --check app.js`、`node --check config.js`。

瀏覽器測試使用 Node.js 22 以上：`npm ci`、`npx playwright install chromium`，再執行 `npm test`。
測試以模擬 Supabase API 驗證表單、清單、錯誤處理及手機版面，不寫入遠端資料庫。
可用 `CHROMIUM_PATH` 指定既有 Chromium，`SUPABASE_SDK_PATH` 指定 CDN 程式庫離線快取，`SCREENSHOT_DIR` 指定測試截圖目錄。
正式網站不使用測試相依套件，沒有正式建置步驟。

介面截圖（使用模擬資料）：[手機版](docs/screenshots/repair-mobile.png)、[桌面版](docs/screenshots/repair-desktop.png)。

### GitHub Pages 與資料庫前置條件

GitHub 儲存庫 Settings → Pages，選擇 Deploy from a branch、`main`、`/ (root)` 後儲存。
未設定自訂網域時，預期網址為 <https://shihwei0211-afk.github.io/20261109.BiBi/>。
所有前端資源皆使用相對路徑，可直接從上述子目錄載入。

對外使用前，須由專案管理員確認 Supabase 已套用 [schema.sql](supabase/schema.sql) 的 GRANT、RLS 與 CHECK，允許 anon 讀取及五個欄位的新增，拒絕修改、刪除及自訂狀態。
此變更不執行 SQL，也不調整遠端資料庫設定；部署前應以虛構資料實測匿名權限與資料庫預設值。
