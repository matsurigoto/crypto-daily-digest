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

## 趨勢分析

新增 7／30／90 日價格與 SMA7/20 圖、五幣相對強弱、恐懼貪婪歷史與 BTC 對照，以及資料品質卡片。
沿用每日報告，不增加行情 API 請求、付費後端或外部圖表腳本。
圖表以選取的日報日期為截止日，價格是**每日觀察快照，不是即時行情、正式收盤價或 OHLC K 線**。
SMA 使用當日日報原本保存的指標，不從快照重新計算；缺資料時斷線、不補零。
可展開資料表查看日期與數值，手機可橫向滑動圖表。

相對強弱以至少有兩筆有效價格的幣種共同有效日期為起點，設為 0%。
各幣卡片顯示最後有效觀察日期與覆蓋率，不足以比較時明確說明。
恐懼貪婪按來源 UTC 日期去重，只顯示截至選取日報日期已可取得的觀察，
與 BTC 共用日期範圍但不是同一瞬間；情緒與價格變化不代表因果或買賣訊號。

新報告保存可取得的來源／抓取時間；舊報告缺少欄位時顯示「未知」，
不把報告產生時間冒充來源更新時間。來源比當時報告時間早超過 36 小時時標為陳舊，
正常歷史檢視不會因距離今天很久就被誤判。Reddit 或市場概況不可用時顯示缺值，
本次不新增來源替代。

每日 workflow 在清理後執行 `scripts/build_trends.py`，產生 `docs/data/trends.json`。
前端只載入一份精簡歷史，不下載全部新聞日報。首次部署或手動變更日報後執行：

```sh
python scripts/build_trends.py
```

腳本不呼叫外部 API；損壞或日期不一致的日報會明確失敗，不悄悄略過。
趨勢檔載入失敗可重試，不影響單日日報。歷史受約 180 天保留政策限制，不支援多年回測。

行情由 [CoinGecko](https://www.coingecko.com/) 提供，BTC 恐懼貪婪由
[Alternative.me](https://alternative.me/crypto/fear-and-greed-index/) 提供，資料旁保留來源連結。
新增功能的 API 訂閱費目標為 $0，但既有 OpenAI、Actions 額度與資料授權仍需計入。
啟用廣告或其他商業用途前，必須核實
[CoinGecko 最新授權與方案](https://www.coingecko.com/en/api/pricing)；官方目前將商用授權列於付費方案。
Alternative.me 允許商用但要求資料旁來源標示。

功能驗證：

```sh
python -m unittest discover -s scripts -p "test_build_trends.py"
python -m unittest discover -s scripts -p "test_collector_quality.py"
node --test scripts/test_trends.cjs
```

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
| CoinGecko API | 免費方案有限額；商用授權須另確認 |
| OpenAI GPT-4o-mini | 原估約 $0.01–0.03 / 天；翻譯、摘要與重試以實際用量為準 |
| CryptoPanic API | 可選，最新額度與價格須查官方方案 |
| 趨勢圖功能 | 不新增行情 API 請求或訂閱 |
| **每月合計** | **原估約 $0.3–1 USD，非實測帳單，未包含可能的授權費** |

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
│   ├── cleanup_old_data.py    # 自動清理舊資料
│   └── build_trends.py        # 從日報建立精簡趨勢資料
├── docs/
│   ├── index.html             # GitHub Pages 首頁
│   ├── app.js                 # 前端 JavaScript
│   ├── trends.js              # 資料品質與原生 SVG 趨勢圖
│   ├── ads-config.js          # Google Adsense 廣告設定
│   └── data/
│       ├── .gitkeep           # 確保目錄存在
│       ├── trends.json        # 保留日報的精簡趨勢資料
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