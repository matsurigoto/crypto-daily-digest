"""
fetch_signals.py
抓取恐懼貪婪指數、Reddit 社群情緒分析、BTC 鏈上資料，輸出 {TODAY}_signals.json。
"""
import json
import os
import time
from datetime import datetime, timezone, timedelta

import requests

TZ_TPE = timezone(timedelta(hours=8))
TODAY = datetime.now(TZ_TPE).strftime("%Y-%m-%d")
DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "docs", "data")
OUTPUT_FILE = os.path.join(DATA_DIR, f"{TODAY}_signals.json")

REDDIT_USER_AGENT = "crypto-daily-digest/1.0 (automated news aggregator)"

POSITIVE_WORDS = {"bullish", "moon", "pump", "surge", "rally", "gain", "high", "ath", "up", "buy"}
NEGATIVE_WORDS = {"bearish", "crash", "dump", "drop", "fall", "low", "fud", "down", "sell", "fear"}


def fetch_fear_greed() -> dict:
    """恐懼貪婪指數（Alternative.me）"""
    try:
        resp = requests.get(
            "https://api.alternative.me/fng/?limit=7",
            timeout=15,
        )
        resp.raise_for_status()
        raw = resp.json()
        entries = raw.get("data", [])
        if not entries:
            return {}
        today_entry = entries[0]
        history = [
            {
                "value": int(e["value"]),
                "classification": e["value_classification"],
                "date": datetime.fromtimestamp(int(e["timestamp"]), tz=timezone.utc).strftime("%Y-%m-%d"),
            }
            for e in entries
        ]
        return {
            "value": int(today_entry["value"]),
            "classification": today_entry["value_classification"],
            "timestamp": datetime.fromtimestamp(int(today_entry["timestamp"]), tz=timezone.utc).isoformat(),
            "history": history,
        }
    except Exception as e:
        print(f"警告：取得恐懼貪婪指數失敗: {e}")
        return {}


def fetch_reddit_sentiment() -> dict:
    """Reddit r/CryptoCurrency 熱門文章情緒分析"""
    try:
        headers = {"User-Agent": REDDIT_USER_AGENT}
        resp = requests.get(
            "https://www.reddit.com/r/CryptoCurrency/hot.json?limit=25",
            headers=headers,
            timeout=15,
        )
        resp.raise_for_status()
        raw = resp.json()
        posts = raw.get("data", {}).get("children", [])

        positive_count = 0
        negative_count = 0
        neutral_count = 0
        top_posts = []

        for post in posts:
            post_data = post.get("data", {})
            title = post_data.get("title", "")
            score = post_data.get("score", 0)
            title_lower = title.lower()
            words = set(title_lower.split())
            pos_hits = words & POSITIVE_WORDS
            neg_hits = words & NEGATIVE_WORDS
            if pos_hits and not neg_hits:
                positive_count += 1
            elif neg_hits and not pos_hits:
                negative_count += 1
            else:
                neutral_count += 1

            top_posts.append({"title": title, "score": score})

        top_posts = sorted(top_posts, key=lambda x: x["score"], reverse=True)[:5]

        total = positive_count + negative_count + neutral_count
        if total == 0:
            sentiment_score = 0.0
        else:
            sentiment_score = round((positive_count - negative_count) / total, 4)

        if sentiment_score > 0.3:
            label = "偏樂觀"
        elif sentiment_score > 0.1:
            label = "略樂觀"
        elif sentiment_score < -0.3:
            label = "偏悲觀"
        elif sentiment_score < -0.1:
            label = "略悲觀"
        else:
            label = "中立"

        return {
            "sentiment_score": sentiment_score,
            "positive_count": positive_count,
            "negative_count": negative_count,
            "neutral_count": neutral_count,
            "label": label,
            "top_posts": top_posts,
        }
    except Exception as e:
        print(f"警告：取得 Reddit 情緒資料失敗: {e}")
        return {}


def fetch_onchain() -> dict:
    """BTC 鏈上資料（CoinGecko 免費 API）"""
    try:
        resp_btc = requests.get(
            "https://api.coingecko.com/api/v3/coins/bitcoin",
            timeout=30,
        )
        resp_btc.raise_for_status()
        btc = resp_btc.json()
        market_data = btc.get("market_data", {})
        circulating = market_data.get("circulating_supply")
        max_supply = market_data.get("max_supply")
        supply_ratio = round(circulating / max_supply * 100, 2) if circulating and max_supply else None

        time.sleep(12)

        resp_global = requests.get(
            "https://api.coingecko.com/api/v3/global",
            timeout=30,
        )
        resp_global.raise_for_status()
        global_data = resp_global.json().get("data", {})

        return {
            "btc_dominance": round(global_data.get("market_cap_percentage", {}).get("btc", 0), 2),
            "total_market_cap_usd": global_data.get("total_market_cap", {}).get("usd"),
            "active_cryptocurrencies": global_data.get("active_cryptocurrencies"),
            "btc_circulating_supply": circulating,
            "btc_max_supply": max_supply,
            "btc_supply_ratio": supply_ratio,
            "btc_volume_24h": market_data.get("total_volume", {}).get("usd"),
        }
    except Exception as e:
        print(f"警告：取得鏈上資料失敗: {e}")
        return {}


def main():
    print(f"開始抓取市場情緒訊號，日期: {TODAY}")

    print("抓取恐懼貪婪指數 ...")
    fear_greed = fetch_fear_greed()

    print("抓取 Reddit 社群情緒 ...")
    reddit_sentiment = fetch_reddit_sentiment()

    print("抓取 BTC 鏈上資料 ...")
    onchain = fetch_onchain()

    output = {
        "date": TODAY,
        "fear_greed": fear_greed,
        "reddit_sentiment": reddit_sentiment,
        "onchain": onchain,
    }

    os.makedirs(DATA_DIR, exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print(f"市場情緒訊號儲存至 {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
