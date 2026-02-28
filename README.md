# 📊 Crypto Daily Digest

全自動每日加密貨幣新聞與技術分析彙整系統，每天早上 06:00 (UTC+8) 自動執行，產生每日報告並發布到 GitHub Pages 靜態網站。

## 架構圖

```
┌─────────────────────────────────────────────────┐
│              GitHub Actions (每日 UTC 22:00)      │
│                                                   │
│  ┌──────────────┐    ┌──────────────────────┐    │
│  │ fetch_news   │    │   fetch_market       │    │
│  │ RSS + API    │    │   CoinGecko API      │    │
│  └──────┬───────┘    └──────────┬───────────┘    │
│         │                       │                 │
│         └──────────┬────────────┘                 │
│                    ▼                              │
│          ┌─────────────────┐                     │
│          │ generate_summary│                     │
│          │  OpenAI GPT-4o  │                     │
│          └────────┬────────┘                     │
│                   │                              │
│          ┌────────▼────────┐                     │
│          │ data/{date}.json│                     │
│          └────────┬────────┘                     │
└───────────────────┼─────────────────────────────-┘
                    │ git push
                    ▼
         ┌────────────────────┐
         │   GitHub Pages     │
         │  docs/index.html   │
         └────────────────────┘
```

## 功能特色

- 🕕 每天 UTC+8 06:00 自動執行（GitHub Actions cron）
- 📰 多來源新聞抓取：CoinDesk、CoinTelegraph、TheBlock、Decrypt、CryptoPanic
- 📊 技術指標計算：RSI、SMA(7/20)、EMA(12/26)、30 日高低點
- 🤖 GPT-4o-mini 產生繁體中文每日彙整報告
- 🌐 GitHub Pages 深色主題靜態儀表板
- 🗑️ 自動清理超過 180 天的舊資料
- 📱 選擇性 Telegram 通知

## 快速開始

### 1. 設定 GitHub Secrets

進入 **Settings → Secrets and variables → Actions**，新增以下 Secrets：

| Secret 名稱 | 說明 | 必要性 |
|---|---|---|
| `OPENAI_API_KEY` | OpenAI API 金鑰 | ✅ 必要 |
| `CRYPTOPANIC_API_KEY` | CryptoPanic API 金鑰 | 可選 |
| `TELEGRAM_BOT_TOKEN` | Telegram Bot Token | 可選 |
| `TELEGRAM_CHAT_ID` | Telegram 頻道/群組 ID | 可選 |

### 2. 啟用 GitHub Pages

進入 **Settings → Pages**，將 Source 設為 **Deploy from a branch**，Branch 選 `main`，目錄選 `/docs`。

### 3. 手動觸發測試

進入 **Actions → Daily Crypto Digest → Run workflow**，點擊 **Run workflow** 執行一次測試。

## 所需 GitHub Secrets

| Secret | 說明 |
|---|---|
| `OPENAI_API_KEY` | 用於呼叫 GPT-4o-mini 產生繁體中文摘要（必要） |
| `CRYPTOPANIC_API_KEY` | 用於從 CryptoPanic 抓取額外新聞（可選，沒有也能正常運作） |
| `TELEGRAM_BOT_TOKEN` | 用於傳送 Telegram 通知（可選） |
| `TELEGRAM_CHAT_ID` | Telegram 通知目標頻道或群組 ID（可選） |

## 成本估算

| 項目 | 費用 |
|---|---|
| GitHub Actions | 免費（公開倉庫） |
| CoinGecko API | 免費（有限速） |
| OpenAI GPT-4o-mini | 約 $0.01–0.03 / 天 |
| CryptoPanic API | 免費方案可用 |
| **每月合計** | **約 $0.3–1 USD** |

## 目錄結構

```
crypto-daily-digest/
├── .github/
│   └── workflows/
│       └── daily-digest.yml   # GitHub Actions 排程 workflow
├── scripts/
│   ├── requirements.txt       # Python 依賴套件
│   ├── fetch_news.py          # 新聞抓取（RSS + CryptoPanic）
│   ├── fetch_market.py        # 市場資料 + 技術指標（CoinGecko）
│   ├── generate_summary.py    # AI 摘要產生（OpenAI）
│   └── cleanup_old_data.py    # 自動清理舊資料
├── docs/
│   ├── index.html             # GitHub Pages 首頁
│   ├── app.js                 # 前端 JavaScript
│   ├── ads-config.js          # Google Adsense 廣告設定
│   └── data/
│       ├── .gitkeep           # 確保目錄存在
│       └── YYYY-MM-DD.json    # 每日報告（自動產生）
└── README.md
```

## 廣告設定

本專案支援 Google Adsense 廣告，透過 `docs/ads-config.js` 集中管理廣告設定。

### 申請 Google Adsense

1. 前往 [Google Adsense](https://www.google.com/adsense/) 申請帳號。
2. 新增網站時請填入您的**自訂網域**（例如 `www.example.com`）。  
   ⚠️ **注意：`*.github.io` 子網域無法通過 Adsense 審核，請務必使用自訂網域。**
3. 審核通過後，在 Adsense 後台建立廣告版位，取得發佈者 ID（格式：`ca-pub-XXXXXXXXXXXXXXXX`）及各版位的 Slot ID。

### 啟用廣告

編輯 `docs/ads-config.js`：

```js
window.ADS_CONFIG = {
  enabled: true,                         // 改為 true 以啟用廣告
  client: 'ca-pub-XXXXXXXXXXXXXXXX',     // 填入您的發佈者 ID
  slots: {
    header:  '1234567890',               // Header 下方橫幅廣告 slot ID
    sidebar: '0987654321',               // 新聞列表上方穿插廣告 slot ID
    footer:  '1122334455'                // 頁尾廣告 slot ID
  }
};
```

將 `enabled` 設為 `false`（預設值）時，頁面不會載入任何廣告腳本，不影響現有功能。

### 廣告位置說明

| 位置 | ID | 說明 |
|---|---|---|
| Header 廣告 | `ad-header` | 位於頁首標題列與主內容之間的橫幅廣告 |
| 內容穿插廣告 | （動態插入） | 位於 AI 摘要與新聞列表之間，使用 `sidebar` slot |
| Footer 廣告 | `ad-footer` | 位於主內容結束後的頁尾橫幅廣告 |