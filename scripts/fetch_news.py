"""
fetch_news.py
從 RSS 來源和 CryptoPanic API 抓取 24 小時內的加密貨幣新聞。
"""
import json
import os
import time
from datetime import datetime, timezone, timedelta

import feedparser
import requests

TODAY = datetime.now(timezone.utc).strftime("%Y-%m-%d")
OUTPUT_FILE = os.path.join(os.path.dirname(__file__), "..", "docs", "data", f"{TODAY}_news.json")

RSS_FEEDS = {
    "CoinDesk": "https://www.coindesk.com/arc/outboundfeeds/rss/",
    "CoinTelegraph": "https://cointelegraph.com/rss",
    "TheBlock": "https://www.theblock.co/rss.xml",
    "Decrypt": "https://decrypt.co/feed",
}

CRYPTOPANIC_API_KEY = os.environ.get("CRYPTOPANIC_API_KEY", "")
CRYPTOPANIC_URL = "https://cryptopanic.com/api/v1/posts/"

CUTOFF = datetime.now(timezone.utc) - timedelta(hours=24)


def parse_published(entry) -> str:
    """從 feedparser entry 取得發布時間的 ISO 字串。"""
    if hasattr(entry, "published_parsed") and entry.published_parsed:
        dt = datetime(*entry.published_parsed[:6], tzinfo=timezone.utc)
        return dt.isoformat()
    return datetime.now(timezone.utc).isoformat()


def is_within_24h(entry) -> bool:
    """判斷文章是否在 24 小時內。"""
    if hasattr(entry, "published_parsed") and entry.published_parsed:
        dt = datetime(*entry.published_parsed[:6], tzinfo=timezone.utc)
        return dt >= CUTOFF
    return True  # 無法判斷時保留


def fetch_rss() -> list:
    articles = []
    for source, url in RSS_FEEDS.items():
        try:
            feed = feedparser.parse(url)
            for entry in feed.entries:
                if not is_within_24h(entry):
                    continue
                summary = getattr(entry, "summary", "") or ""
                articles.append({
                    "source": source,
                    "title": entry.get("title", "").strip(),
                    "link": entry.get("link", ""),
                    "published": parse_published(entry),
                    "summary": summary[:500],
                })
        except Exception as e:
            print(f"[RSS] {source} 抓取失敗: {e}")
    return articles


def fetch_cryptopanic() -> list:
    if not CRYPTOPANIC_API_KEY:
        print("[CryptoPanic] 未設定 API key，跳過。")
        return []
    articles = []
    try:
        params = {
            "auth_token": CRYPTOPANIC_API_KEY,
            "public": "true",
            "kind": "news",
        }
        resp = requests.get(CRYPTOPANIC_URL, params=params, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        for item in data.get("results", []):
            published = item.get("published_at", datetime.now(timezone.utc).isoformat())
            try:
                dt = datetime.fromisoformat(published.replace("Z", "+00:00"))
                if dt < CUTOFF:
                    continue
            except ValueError:
                pass
            articles.append({
                "source": "CryptoPanic",
                "title": item.get("title", "").strip(),
                "link": item.get("url", ""),
                "published": published,
                "summary": "",
            })
    except Exception as e:
        print(f"[CryptoPanic] 抓取失敗: {e}")
    return articles


def main():
    print(f"開始抓取新聞，日期: {TODAY}")
    articles = fetch_rss()
    articles += fetch_cryptopanic()

    # 依發布時間排序（最新優先）
    articles.sort(key=lambda a: a["published"], reverse=True)

    output = {
        "date": TODAY,
        "count": len(articles),
        "articles": articles,
    }

    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"共抓取 {len(articles)} 篇文章，儲存至 {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
