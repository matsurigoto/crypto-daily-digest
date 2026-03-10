# 資安改善建議清單 (Security Improvement Checklist)

本文件提供具體的程式碼改善建議，以解決 SECURITY_AUDIT.md 中識別的資安問題。

---

## 🔴 高優先級修復

### 1. 加強 API 回應驗證

#### 問題檔案：`scripts/fetch_news.py`

**當前程式碼問題：**
```python
# 缺少嚴格的資料驗證
articles.append({
    "source": source,
    "title": entry.get("title", "").strip(),
    "link": entry.get("link", ""),
    "published": parse_published(entry),
    "summary": summary[:500],
})
```

**建議改進：**

1. 安裝 pydantic：
```bash
pip install pydantic
```

2. 在 `scripts/fetch_news.py` 加入驗證模型：
```python
from pydantic import BaseModel, HttpUrl, validator, ValidationError
from typing import Optional
from datetime import datetime

class NewsArticle(BaseModel):
    source: str
    title: str
    link: HttpUrl  # 自動驗證 URL 格式
    published: str
    summary: str

    @validator('title')
    def validate_title(cls, v):
        if not v or len(v) < 3:
            raise ValueError('標題太短或為空')
        if len(v) > 500:
            raise ValueError('標題過長')
        return v.strip()

    @validator('summary')
    def validate_summary(cls, v):
        if len(v) > 5000:
            raise ValueError('摘要過長')
        return v[:500]  # 限制長度

# 使用驗證
try:
    article = NewsArticle(
        source=source,
        title=entry.get("title", ""),
        link=entry.get("link", ""),
        published=parse_published(entry),
        summary=summary
    )
    articles.append(article.dict())
except ValidationError as e:
    print(f"[驗證錯誤] {source}: {e}")
    continue
```

3. 對 `scripts/fetch_market.py` 進行類似改進：
```python
from pydantic import BaseModel, field_validator
from typing import Optional

class MarketData(BaseModel):
    id: str
    symbol: str
    name: str
    current_price: float
    market_cap: Optional[float] = None
    market_cap_rank: Optional[int] = None
    total_volume: Optional[float] = None
    price_change_percentage_24h: Optional[float] = None
    price_change_percentage_7d: Optional[float] = None

    @field_validator('current_price')
    @classmethod
    def validate_price(cls, v):
        if v < 0:
            raise ValueError('價格不能為負數')
        return v

    @field_validator('symbol')
    @classmethod
    def validate_symbol(cls, v):
        if not v or len(v) > 20:
            raise ValueError('無效的代幣符號')
        return v.upper()
```

---

### 2. 強化 XSS 保護

#### 問題檔案：`docs/app.js`

**建議改進：**

1. 確保所有動態內容都經過 `esc()` 函數：

```javascript
// 在 app.js 中加入額外的清理函數
function sanitizeHTML(str) {
    const temp = document.createElement('div');
    temp.textContent = str;
    return temp.innerHTML;
}

// 對於需要保留某些 HTML 的情況，使用白名單
function sanitizeHTMLWithWhitelist(html) {
    const allowedTags = ['b', 'i', 'em', 'strong', 'br'];
    const temp = document.createElement('div');
    temp.innerHTML = html;

    // 移除所有不在白名單中的標籤
    const allElements = temp.querySelectorAll('*');
    allElements.forEach(el => {
        if (!allowedTags.includes(el.tagName.toLowerCase())) {
            el.replaceWith(el.textContent);
        }
    });

    return temp.innerHTML;
}
```

2. 在 `docs/index.html` 中加入 Content Security Policy：

```html
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <!-- 加入 CSP -->
    <meta http-equiv="Content-Security-Policy" content="
        default-src 'self';
        script-src 'self' 'unsafe-inline' https://pagead2.googlesyndication.com https://adservice.google.com;
        style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
        font-src 'self' https://fonts.gstatic.com;
        img-src 'self' data: https:;
        connect-src 'self' https://api.telegram.org;
        frame-src https://googleads.g.doubleclick.net;
    ">
    <title>加密貨幣每日摘要</title>
</head>
```

3. 審查所有使用 `innerHTML` 的地方：

```javascript
// 不好的做法
element.innerHTML = userContent;

// 好的做法 - 當只需要文字時
element.textContent = userContent;

// 好的做法 - 當需要 HTML 時
element.innerHTML = esc(userContent);
```

---

### 3. 實作 API 金鑰驗證

#### 建議新增檔案：`scripts/utils/security.py`

```python
"""
資安工具函數
"""
import re
import os
from typing import Optional

class APIKeyValidator:
    """API 金鑰驗證器"""

    # 各種 API 金鑰的格式規則
    KEY_PATTERNS = {
        'OPENAI_API_KEY': r'^sk-[A-Za-z0-9]{32,}$',
        'CRYPTOPANIC_API_KEY': r'^[a-f0-9]{32,64}$',
        'TELEGRAM_BOT_TOKEN': r'^\d{8,10}:[A-Za-z0-9_-]{35}$',
        'TELEGRAM_CHAT_ID': r'^-?\d{8,15}$',
    }

    @staticmethod
    def validate_key(key_name: str, key_value: str) -> tuple[bool, Optional[str]]:
        """
        驗證 API 金鑰格式

        Returns:
            (is_valid, error_message)
        """
        if not key_value:
            return False, f"{key_name} 為空"

        if len(key_value) < 10:
            return False, f"{key_name} 長度過短"

        # 檢查是否包含明顯的佔位符
        placeholders = ['YOUR_', 'REPLACE_', 'EXAMPLE_', 'TEST_', 'DUMMY_']
        if any(p in key_value.upper() for p in placeholders):
            return False, f"{key_name} 看起來是佔位符"

        # 檢查特定格式
        if key_name in APIKeyValidator.KEY_PATTERNS:
            pattern = APIKeyValidator.KEY_PATTERNS[key_name]
            if not re.match(pattern, key_value):
                return False, f"{key_name} 格式不正確"

        return True, None

    @staticmethod
    def get_validated_env_var(key_name: str, required: bool = True) -> Optional[str]:
        """
        從環境變數取得並驗證 API 金鑰

        Args:
            key_name: 環境變數名稱
            required: 是否為必要的金鑰

        Returns:
            驗證過的金鑰值，或 None（如果不是必要的）
        """
        key_value = os.environ.get(key_name, "").strip()

        if not key_value:
            if required:
                raise ValueError(f"❌ 未設定 {key_name} 環境變數")
            return None

        is_valid, error_msg = APIKeyValidator.validate_key(key_name, key_value)

        if not is_valid:
            if required:
                raise ValueError(f"❌ {error_msg}")
            print(f"⚠️  警告：{error_msg}")
            return None

        return key_value


def sanitize_error_message(error: Exception, api_name: str = "") -> str:
    """
    清理錯誤訊息，避免洩漏敏感資訊

    Args:
        error: 原始例外
        api_name: API 名稱（用於上下文）

    Returns:
        清理後的錯誤訊息
    """
    error_str = str(error)

    # 移除可能的 API 金鑰
    error_str = re.sub(r'(api[_-]?key|token|secret)[=:]\s*[A-Za-z0-9_-]+',
                       r'\1=***', error_str, flags=re.IGNORECASE)

    # 移除可能的 URL 中的敏感參數
    error_str = re.sub(r'([?&])(api[_-]?key|token|auth)[=][^&\s]+',
                       r'\1\2=***', error_str, flags=re.IGNORECASE)

    # 限制錯誤訊息長度
    if len(error_str) > 200:
        error_str = error_str[:200] + "..."

    if api_name:
        return f"[{api_name}] {error_str}"

    return error_str
```

#### 更新現有檔案使用驗證器：

**在 `scripts/fetch_news.py` 中：**

```python
from utils.security import APIKeyValidator, sanitize_error_message

# 取代現有的環境變數取得方式
try:
    CRYPTOPANIC_API_KEY = APIKeyValidator.get_validated_env_var(
        "CRYPTOPANIC_API_KEY",
        required=False  # 因為有其他新聞來源，所以不是必要的
    )
except ValueError as e:
    print(str(e))
    CRYPTOPANIC_API_KEY = None

# 在錯誤處理中
except Exception as e:
    error_msg = sanitize_error_message(e, source)
    print(f"[RSS] {error_msg}")
```

**在 `scripts/generate_summary.py` 中：**

```python
from utils.security import APIKeyValidator

try:
    api_key = APIKeyValidator.get_validated_env_var("OPENAI_API_KEY", required=False)
    if not api_key:
        print("⚠️  未設定有效的 OPENAI_API_KEY，跳過 AI 摘要產生。")
        return
except ValueError as e:
    print(str(e))
    return
```

---

## 🟡 中優先級修復

### 4. 加入子資源完整性 (SRI) 檢查

#### 問題檔案：`docs/app.js`

**建議改進：**

由於 Google AdSense 的腳本 URL 包含動態參數，我們可以：

1. 為靜態資源加入 SRI（如果有的話）
2. 對動態載入的腳本加入額外驗證

```javascript
function initAds() {
    var cfg = window.ADS_CONFIG;
    if (!cfg || !cfg.enabled || !cfg.client) return;

    // 驗證 client ID 格式
    if (!/^ca-pub-\d{16}$/.test(cfg.client)) {
        console.error('Invalid AdSense client ID format');
        return;
    }

    var script = document.createElement('script');
    script.async = true;
    script.crossOrigin = 'anonymous';

    // 只允許來自官方 Google 網域
    var allowedDomain = 'pagead2.googlesyndication.com';
    script.src = 'https://' + allowedDomain + '/pagead/js/adsbygoogle.js?client=' + cfg.client;

    // 加入錯誤處理
    script.onerror = function() {
        console.error('Failed to load AdSense script');
    };

    document.head.appendChild(script);
}
```

---

### 5. 實作本地速率限制

#### 建議新增檔案：`scripts/utils/rate_limiter.py`

```python
"""
速率限制器
"""
import time
from typing import Dict
from collections import deque

class RateLimiter:
    """簡單的速率限制器"""

    def __init__(self, max_calls: int, time_window: int):
        """
        Args:
            max_calls: 時間窗口內最大呼叫次數
            time_window: 時間窗口（秒）
        """
        self.max_calls = max_calls
        self.time_window = time_window
        self.calls: Dict[str, deque] = {}

    def is_allowed(self, key: str) -> bool:
        """
        檢查是否允許呼叫

        Args:
            key: 速率限制的鍵（例如 API 名稱）

        Returns:
            是否允許呼叫
        """
        now = time.time()

        if key not in self.calls:
            self.calls[key] = deque()

        # 移除時間窗口外的舊呼叫記錄
        while self.calls[key] and self.calls[key][0] < now - self.time_window:
            self.calls[key].popleft()

        # 檢查是否超過限制
        if len(self.calls[key]) >= self.max_calls:
            return False

        # 記錄新呼叫
        self.calls[key].append(now)
        return True

    def wait_if_needed(self, key: str) -> None:
        """
        如果需要，等待直到允許呼叫
        """
        while not self.is_allowed(key):
            time.sleep(1)


# 全域速率限制器實例
# CoinGecko 免費版：50 calls/minute
coingecko_limiter = RateLimiter(max_calls=50, time_window=60)

# CryptoPanic 免費版：通常約 1 call/second
cryptopanic_limiter = RateLimiter(max_calls=30, time_window=60)

# OpenAI：根據您的方案調整
openai_limiter = RateLimiter(max_calls=60, time_window=60)
```

**在 `scripts/fetch_market.py` 中使用：**

```python
from utils.rate_limiter import coingecko_limiter

def fetch_with_retry(url: str, params: dict = None, max_retries: int = 3, timeout: int = 15) -> dict:
    # 在請求前檢查速率限制
    coingecko_limiter.wait_if_needed('coingecko')

    # 原有的請求邏輯...
```

---

## 🟢 低優先級修復

### 6. 使逾時值可配置

#### 建議新增檔案：`scripts/config.py`

```python
"""
應用程式設定
"""
import os

class Config:
    """集中式設定管理"""

    # HTTP 請求設定
    HTTP_TIMEOUT = int(os.environ.get('HTTP_TIMEOUT', '15'))
    HTTP_MAX_RETRIES = int(os.environ.get('HTTP_MAX_RETRIES', '3'))

    # API 端點
    COINGECKO_BASE = os.environ.get('COINGECKO_BASE', 'https://api.coingecko.com/api/v3')
    CRYPTOPANIC_BASE = os.environ.get('CRYPTOPANIC_BASE', 'https://cryptopanic.com/api/v1')

    # 資料保留設定
    DATA_RETENTION_DAYS = int(os.environ.get('DATA_RETENTION_DAYS', '90'))

    # 速率限制設定
    COINGECKO_RATE_LIMIT = int(os.environ.get('COINGECKO_RATE_LIMIT', '50'))
    CRYPTOPANIC_RATE_LIMIT = int(os.environ.get('CRYPTOPANIC_RATE_LIMIT', '30'))

    @classmethod
    def validate(cls):
        """驗證設定值"""
        if cls.HTTP_TIMEOUT < 5 or cls.HTTP_TIMEOUT > 60:
            raise ValueError("HTTP_TIMEOUT 必須在 5-60 秒之間")

        if cls.DATA_RETENTION_DAYS < 7:
            raise ValueError("DATA_RETENTION_DAYS 必須至少為 7 天")

# 初始化時驗證設定
Config.validate()
```

---

### 7. 加強檔案操作安全性

#### 更新 `scripts/cleanup_old_data.py`：

```python
import os
from pathlib import Path
from datetime import datetime, timedelta

def is_safe_to_delete(filepath: Path, base_dir: Path, min_age_hours: int = 1) -> bool:
    """
    檢查檔案是否安全刪除

    Args:
        filepath: 要檢查的檔案路徑
        base_dir: 基礎目錄（只能刪除此目錄內的檔案）
        min_age_hours: 檔案最小年齡（小時），防止誤刪新建檔案

    Returns:
        是否安全刪除
    """
    try:
        # 確保檔案在基礎目錄內（防止路徑遍歷）
        filepath = filepath.resolve()
        base_dir = base_dir.resolve()

        if not str(filepath).startswith(str(base_dir)):
            print(f"⚠️  檔案不在基礎目錄內: {filepath}")
            return False

        # 檢查檔案是否存在
        if not filepath.exists():
            return False

        # 檢查檔案年齡
        file_mtime = datetime.fromtimestamp(filepath.stat().st_mtime)
        age = datetime.now() - file_mtime

        if age < timedelta(hours=min_age_hours):
            print(f"⚠️  檔案太新，跳過刪除: {filepath}")
            return False

        # 檢查檔案大小（如果檔案異常大，要小心）
        file_size = filepath.stat().st_size
        if file_size > 100 * 1024 * 1024:  # 100MB
            print(f"⚠️  檔案異常大 ({file_size} bytes): {filepath}")
            return False

        return True

    except Exception as e:
        print(f"⚠️  檢查檔案時發生錯誤: {e}")
        return False


def cleanup_old_data(days: int = 90):
    """清理舊資料"""
    base_dir = Path(__file__).parent.parent / "docs"
    cutoff = datetime.now() - timedelta(days=days)

    print(f"🧹 清理 {days} 天前的資料...")

    for folder in ["news", "market", "signals", "summaries"]:
        folder_path = base_dir / folder

        if not folder_path.exists():
            continue

        deleted = 0
        for filepath in folder_path.glob("*.json"):
            try:
                # 解析日期
                date_str = filepath.stem
                file_date = datetime.strptime(date_str, "%Y-%m-%d")

                if file_date < cutoff:
                    # 使用安全檢查
                    if is_safe_to_delete(filepath, base_dir):
                        print(f"  刪除: {filepath.name}")
                        filepath.unlink()
                        deleted += 1
                    else:
                        print(f"  跳過: {filepath.name} (安全檢查失敗)")

            except Exception as e:
                print(f"  處理 {filepath.name} 時發生錯誤: {e}")

        if deleted > 0:
            print(f"✓ {folder}: 刪除 {deleted} 個檔案")
```

---

### 8. 將 AdSense 發布者 ID 移至設定

#### 更新 GitHub Secrets：

1. 在 GitHub 專案設定中加入新 Secret：`GOOGLE_ADSENSE_CLIENT`

2. 更新 `docs/ads-config.js`：

```javascript
// 從 meta 標籤讀取設定（由後端產生）
window.ADS_CONFIG = {
  enabled: true,
  client: document.querySelector('meta[name="adsense-client"]')?.content || ''
};
```

3. 在產生 HTML 的流程中注入設定（或建立一個範本檔案）。

---

## 📝 更新 requirements.txt

建議更新 `scripts/requirements.txt` 加入新的依賴：

```
requests>=2.31.0
feedparser>=6.0.0
numpy>=1.26.0
openai>=1.12.0
pydantic>=2.0.0
```

---

## 🔄 實作順序建議

1. **立即實作（第 1 天）：**
   - 建立 `scripts/utils/security.py`
   - 更新所有腳本使用 API 金鑰驗證器
   - 在 HTML 中加入基本的 CSP

2. **短期實作（第 1 週）：**
   - 為關鍵資料結構加入 pydantic 驗證
   - 實作速率限制器
   - 審查並修復 XSS 防護

3. **中期實作（第 2-4 週）：**
   - 建立集中式設定管理
   - 加強檔案操作安全性
   - 實作完整的輸入驗證

4. **長期維護：**
   - 定期更新依賴套件
   - 定期進行資安審查
   - 監控並記錄異常活動

---

## 🧪 測試建議

建議建立基本的單元測試：

**建議新增檔案：`scripts/tests/test_security.py`**

```python
"""
資安相關功能的測試
"""
import pytest
from utils.security import APIKeyValidator, sanitize_error_message

class TestAPIKeyValidator:

    def test_openai_key_validation(self):
        # 有效的金鑰格式
        valid, msg = APIKeyValidator.validate_key(
            'OPENAI_API_KEY',
            'sk-abcd1234567890abcd1234567890abcd'
        )
        assert valid

        # 無效的金鑰格式
        valid, msg = APIKeyValidator.validate_key(
            'OPENAI_API_KEY',
            'invalid_key'
        )
        assert not valid
        assert 'format' in msg.lower() or '格式' in msg

    def test_empty_key(self):
        valid, msg = APIKeyValidator.validate_key('TEST_KEY', '')
        assert not valid
        assert '空' in msg or 'empty' in msg.lower()

    def test_placeholder_detection(self):
        valid, msg = APIKeyValidator.validate_key('TEST_KEY', 'YOUR_API_KEY_HERE')
        assert not valid
        assert '佔位符' in msg or 'placeholder' in msg.lower()


class TestErrorSanitization:

    def test_api_key_removal(self):
        error = Exception("Failed: api_key=sk-secret123456")
        sanitized = sanitize_error_message(error)
        assert 'sk-secret123456' not in sanitized
        assert '***' in sanitized

    def test_url_parameter_removal(self):
        error = Exception("Request failed: https://api.example.com/data?api_key=secret&foo=bar")
        sanitized = sanitize_error_message(error)
        assert 'secret' not in sanitized
        assert 'api_key=***' in sanitized

    def test_length_limit(self):
        long_error = Exception("x" * 500)
        sanitized = sanitize_error_message(long_error)
        assert len(sanitized) <= 203  # 200 + "..."
```

執行測試：

```bash
pip install pytest
pytest scripts/tests/test_security.py -v
```

---

## 📚 參考資源

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Pydantic 文件](https://docs.pydantic.dev/)
- [Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
- [Python 資安最佳實踐](https://python.readthedocs.io/en/stable/library/security_warnings.html)

---

**最後更新：** 2026-03-09
