# 資安檢查報告 (Security Audit Report)

## 執行摘要 (Executive Summary)

本報告針對 crypto-daily-digest 專案進行了全面的資安檢查。此專案為基於 Python 的加密貨幣新聞自動化聚合系統，搭配 JavaScript 前端。整體而言，程式碼遵循良好的資安實踐，但仍有幾個需要關注的領域。

**整體資安評級：B+ (良好但有改進空間)**

---

## 🔴 高風險問題 (High Severity Issues)

### 1. 外部 API 回應缺乏充分的輸入驗證

**位置：**
- `scripts/fetch_news.py` (48-64, 72-98 行)
- `scripts/fetch_market.py` (49-79 行)
- `scripts/fetch_signals.py` (23-157 行)

**問題：** 應用程式從多個外部 API (CoinGecko, CryptoPanic, Reddit, Alternative.me) 取得資料，但沒有對回應的架構或資料類型進行強健的驗證。格式錯誤或惡意的 API 回應可能導致非預期行為。

**風險：** 資料完整性問題、下游處理時可能遭受注入攻擊、應用程式崩潰。

**建議：**
```python
# 建議使用 pydantic 進行結構驗證
from pydantic import BaseModel, validator

class NewsArticle(BaseModel):
    source: str
    title: str
    link: str
    published: str
    summary: str

    @validator('link')
    def validate_url(cls, v):
        if not v.startswith(('http://', 'https://')):
            raise ValueError('Invalid URL')
        return v
```

### 2. 前端潛在的 XSS 漏洞

**位置：** `docs/app.js` (240, 253, 256 行)

**問題：** 應用程式使用 `innerHTML` 將內容注入 DOM。雖然有 `esc()` 函數 (226-234 行) 用於 HTML 跳脫，但必須確認所有使用者控制的資料在渲染前都有正確跳脫。

**風險：** 如果新聞文章或 API 回應中的未跳脫內容包含惡意 JavaScript，可能遭受跨站腳本攻擊 (XSS)。

**建議：**
- 確保所有動態內容都通過 `esc()` 函數處理
- 考慮實作 Content Security Policy (CSP)
- 使用 `textContent` 取代 `innerHTML`（當只需要文字時）

---

## 🟡 中風險問題 (Medium Severity Issues)

### 3. API 金鑰從環境變數取得但未驗證

**位置：**
- `scripts/fetch_news.py` (24 行)
- `scripts/generate_summary.py` (87 行)
- `scripts/translate_news.py` (55 行)

**問題：** 使用 `os.environ.get()` 取得 API 金鑰，預設值為空字串。雖然程式碼會檢查空金鑰，但沒有驗證金鑰格式或完整性。

**建議：**
```python
import re

def validate_api_key(key: str, pattern: str = r'^[A-Za-z0-9_-]+$') -> bool:
    """驗證 API 金鑰格式"""
    if not key or len(key) < 10:
        return False
    return bool(re.match(pattern, key))
```

### 4. 錯誤訊息可能暴露敏感資訊

**位置：** 多個檔案中的例外處理

**問題：** 錯誤訊息被印出到 stdout/logs，可能包含來自 API 回應或內部應用程式狀態的敏感資訊。

**建議：**
- 實作錯誤訊息清理機制
- 使用適當的日誌等級（debug, info, warning, error）
- 避免在生產環境中顯示詳細的錯誤訊息

### 5. API 呼叫中的 URL 建構未經驗證

**位置：** `scripts/fetch_market.py` (52-58, 68-74 行)

**建議：**
```python
from urllib.parse import urljoin, urlparse

def validate_base_url(url: str) -> bool:
    """驗證基礎 URL"""
    parsed = urlparse(url)
    return parsed.scheme in ('http', 'https') and bool(parsed.netloc)
```

### 6. 動態載入腳本缺少完整性檢查

**位置：** `docs/app.js` (281-290 行)

**問題：** 應用程式動態載入 Google AdSense 腳本，但沒有子資源完整性 (SRI) 檢查。

**建議：**
```javascript
script.integrity = 'sha384-...'; // 加入 SRI hash
script.crossOrigin = 'anonymous';
```

### 7. 缺少外部 API 呼叫的速率限制保護

**建議：** 實作本地速率限制機制，防止短時間內過多 API 呼叫。

---

## 🟢 低風險問題 (Low Severity Issues)

### 8. 硬編碼的逾時值

**位置：** 多個檔案

**建議：** 將逾時值移至設定檔，使其可配置。

### 9. 檔案系統操作缺少明確的權限檢查

**位置：**
- `scripts/cleanup_old_data.py` (29-33 行)
- `scripts/generate_summary.py` (151-154 行)

**建議：** 在刪除檔案前加入額外的安全檢查。

### 10. 公開儲存庫中的敏感設定

**位置：** `docs/ads-config.js`

**問題：** Google AdSense 發布者 ID 硬編碼在公開檔案中。

**建議：** 雖然發布者 ID 不是機密，但考慮將其移至設定中。

---

## ✅ 已識別的良好資安實踐

1. **適當的 HTML 跳脫函數**：JavaScript 程式碼包含完整的 `esc()` 函數
2. **GitHub Secrets 管理**：API 金鑰儲存在 GitHub Secrets 中
3. **逾時保護**：所有 HTTP 請求都包含逾時參數
4. **錯誤處理**：完整的 try-catch 區塊防止應用程式崩潰
5. **全面使用 HTTPS**：所有外部 API 呼叫使用 HTTPS 端點
6. **無 SQL 資料庫**：應用程式使用 JSON 檔案，消除 SQL 注入風險
7. **無 eval() 或 exec()**：程式碼中未發現動態程式碼執行
8. **無 shell=True**：沒有可能導致命令注入的 subprocess 呼叫
9. **.gitignore 正確配置**：環境檔案 (.env) 已正確排除於版本控制之外
10. **重試機制與退避**：CoinGecko API 取得器實作了適當的指數退避重試邏輯

---

## 📦 依賴套件資安評估

**檔案：** `scripts/requirements.txt`

```
requests>=2.31.0
feedparser>=6.0.0
numpy>=1.26.0
openai>=1.12.0
```

**評估：**
- 依賴套件使用最小版本約束 (>=)，有利於安全性更新
- 所有套件都是維護良好且信譽良好的
- **建議：** 考慮使用精確版本固定或鎖定檔案（如 pip-tools）以實現可重現建置

---

## 🎯 優先建議事項

### 高優先級
1. **加入輸入驗證**：使用 `pydantic` 或 `marshmallow` 為所有外部 API 回應實作架構驗證
2. **審查 XSS 保護**：確認所有渲染到 DOM 的資料都通過 `esc()` 函數正確跳脫
3. **實作 Content Security Policy (CSP)**：在 HTML 中加入 CSP 標頭以防止 XSS 攻擊

### 中優先級
4. **加入 API 金鑰格式驗證**：在使用前驗證 API 金鑰格式
5. **清理錯誤訊息**：實作錯誤訊息清理以防止資訊洩漏
6. **為外部腳本加入 SRI**：為外部 JavaScript 加入子資源完整性屬性
7. **實作速率限制**：加入防止過多 API 呼叫的保護

### 低優先級
8. **使逾時可配置**：將逾時值移至設定
9. **加入檔案操作安全檢查**：在檔案刪除前實作額外檢查
10. **將發布者 ID 移至 Secrets**：將 Google AdSense 發布者 ID 儲存在 GitHub Secrets 中

---

## 📋 未發現的問題

已搜尋但未發現以下資安疑慮：
- SQL 注入漏洞（無資料庫）
- 命令注入（無使用 shell=True 的 subprocess）
- 原始碼中的硬編碼憑證
- 使用 eval/exec/compile
- 不安全的 SSL/TLS（無 verify=False）
- 路徑遍歷漏洞
- 不安全的反序列化

---

## 📅 審查資訊

- **審查日期：** 2026-03-09
- **審查者：** Claude Code Security Audit
- **程式碼庫版本：** 當前 HEAD
- **審查範圍：** 完整程式碼庫

---

## 結論

crypto-daily-digest 應用程式整體展現良好的資安實踐。主要關注點在於來自外部 API 的輸入驗證，以及確保前端的 XSS 保護一致性。未發現需要立即修復的關鍵漏洞。開發團隊應優先實作輸入驗證和審查 XSS 保護，作為下一步的資安改進。

**建議後續行動：**
1. 根據優先級逐項處理建議事項
2. 定期更新依賴套件
3. 考慮整合自動化資安掃描工具（如 Snyk、Dependabot）
4. 進行定期資安審查（建議每季一次）
