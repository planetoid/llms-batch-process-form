# Claude API 批次處理

這是一個用於批次處理 Anthropic Claude API 請求的網頁應用程式。此工具允許您上傳包含多個提示的 Excel 檔案，並透過 Claude 進行批次處理，讓您能夠有效率地處理大量的 AI 請求。

## 功能特色

- 上傳 Excel 檔案進行批次處理
- 支援所有 Claude 3 模型（Opus、Sonnet、Haiku）
- 即時批次狀態監控
- 詳細請求數量的進度追蹤
- 結果查看與 CSV 匯出
- 用於疑難排解的除錯面板
- 可自訂系統提示
- 可設定最大字符數

## 元件組成

應用程式由三個主要元件組成：

1. **前端（index.html、index.js）**
    - 檔案上傳和批次管理的使用者介面
    - 即時狀態更新和進度追蹤
    - 結果顯示和匯出功能

2. **Cloudflare Worker（worker.js）**
    - 處理 Anthropic API 請求
    - 管理 CORS 和請求路由
    - 錯誤處理和回應處理

## 設定

### 前置需求

- 已啟用 Workers 的 Cloudflare 帳號
- Anthropic API 金鑰
- Node.js 和 npm（用於本地開發）

### 安裝步驟

1. 部署 Cloudflare Worker：
   ```bash
   # 如果尚未安裝 Wrangler CLI，請先安裝
   npm install -g wrangler
   
   # 登入 Cloudflare
   wrangler login
   
   # 部署 worker
   wrangler deploy
   ```

2. 在您選擇的主機服務上託管前端檔案（index.html 和 index.js）或在本機執行。

3. 記下您的 Worker URL - 使用應用程式時會需要。

## 使用方式

1. 在瀏覽器中開啟網頁應用程式。

2. 輸入您的 Cloudflare Worker 端點 URL 並測試連線。

3. 輸入您的 Anthropic API 金鑰。

4. 設定批次處理參數：
    - 選擇 Claude 模型版本
    - 設定最大字符數
    - （選擇性）新增系統提示

5. 準備您的 Excel 檔案，需包含以下欄位：
    - `custom_id`：每個請求的唯一識別碼
    - `user_message`：要傳送給 Claude 的提示/訊息

6. 上傳 Excel 檔案並提交批次。

7. 監控進度，完成時下載結果。

## Excel 檔案格式

您的 Excel 檔案應遵循以下格式：

| custom_id | user_message |
|-----------|--------------|
| id_1      | 法國的首都是什麼？ |
| id_2      | 解釋量子運算。 |

- `custom_id` 欄位為選填（若未提供將自動產生 ID）
- `user_message` 欄位為必填
- 每批次最多 100,000 個請求
- 檔案大小上限：256 MB

## 使用限制

- 每個回應最多 4096 個字符
- 批次處理超時時間：24 小時
- 根據您的 Anthropic API 層級套用請求限制
- 檔案大小限制：256 MB

## 疑難排解

1. **連線問題**
    - 驗證您的 Worker 端點 URL
    - 確保您的 API 金鑰有效
    - 檢查 Worker 中的 CORS 設定

2. **檔案上傳問題**
    - 驗證 Excel 檔案格式
    - 檢查檔案大小（最大 256 MB）
    - 確保必要欄位存在

3. **處理問題**
    - 使用除錯面板查看詳細記錄
    - 檢查批次狀態的錯誤訊息
    - 驗證字符數限制和請求格式

## 安全考量

- API 金鑰僅在處理過程中暫存於記憶體
- 伺服器不會永久儲存任何資料
- 所有通訊均透過 HTTPS 加密
- Worker 實作基本請求驗證

## 開發指南

本機執行：

1. 複製儲存庫
2. 安裝相依套件：
   ```bash
   npm install
   ```
3. 啟動開發伺服器：
   ```bash
   npm run dev
   ```

修改 Worker：

1. 編輯 `worker.js`
2. 使用 Wrangler 在本機測試：
   ```bash
   wrangler dev
   ```
3. 部署變更：
   ```bash
   wrangler deploy
   ```

## 參與貢獻

1. Fork 儲存庫
2. 建立功能分支
3. 提交您的變更
4. 推送至分支
5. 建立 Pull Request

## 授權條款

本專案採用 MIT 授權條款 - 詳見 LICENSE 檔案
