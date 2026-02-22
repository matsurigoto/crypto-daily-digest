"""
fetch_market.py
使用免費 CoinGecko API 取得主流幣 30 天價格歷史，並計算技術指標。
"""
import json
import os
import time
from datetime import datetime, timezone

import numpy as np
import requests

TODAY = datetime.now(timezone.utc).strftime("%Y-%m-%d")
OUTPUT_FILE = os.path.join(os.path.dirname(__file__), "..", "docs", "data", f"{TODAY}_market.json")

COINGECKO_BASE = "https://api.coingecko.com/api/v3"

COINS = {
    "BTC": "bitcoin",
    "ETH": "ethereum",
    "SOL": "solana",
    "BNB": "binancecoin",
    "XRP": "ripple",
}

REQUEST_INTERVAL = 12  # CoinGecko 免費版限速（每分鐘約 5-10 次請求）


RETRY_WAITS = [30, 45, 60]  # CoinGecko 免費版 rate limit window 為 1 分鐘


def request_with_retry(url: str, params: dict, timeout: int = 15, max_retries: int = 3) -> requests.Response:
    """發送 HTTP GET 請求，遇到 429 或其他錯誤時自動重試。"""
    last_resp = None
    for attempt in range(max_retries):
        last_resp = requests.get(url, params=params, timeout=timeout)
        if last_resp.status_code == 429:
            wait = RETRY_WAITS[attempt]
            print(f"[CoinGecko] Rate limited (429)，等待 {wait} 秒後重試...")
            time.sleep(wait)
            continue
        last_resp.raise_for_status()
        return last_resp
    last_resp.raise_for_status()
    return last_resp  # unreachable, but satisfies type checker


def fetch_all_market_data(coin_ids: list) -> dict:
    """一次取得所有幣種的市場基本資料（價格、24h 漲跌幅、成交量）。"""
    try:
        market_url = f"{COINGECKO_BASE}/coins/markets"
        market_params = {
            "vs_currency": "usd",
            "ids": ",".join(coin_ids),
            "price_change_percentage": "24h",
        }
        resp = request_with_retry(market_url, params=market_params, timeout=15)
        return {item["id"]: item for item in resp.json()}
    except Exception as e:
        print(f"[CoinGecko] 批次市場資料抓取失敗: {e}")
        return {}


def fetch_coin_chart(coin_id: str) -> list:
    """取得單一幣種的 30 天價格歷史。"""
    try:
        history_url = f"{COINGECKO_BASE}/coins/{coin_id}/market_chart"
        history_params = {
            "vs_currency": "usd",
            "days": "30",
            "interval": "daily",
        }
        resp = request_with_retry(history_url, params=history_params, timeout=15)
        return [p[1] for p in resp.json().get("prices", [])]
    except Exception as e:
        print(f"[CoinGecko] {coin_id} 歷史資料抓取失敗: {e}")
        return []


def calc_rsi(prices: list, period: int = 14) -> float | None:
    """計算 RSI (14 期)。"""
    if len(prices) < period + 1:
        return None
    arr = np.array(prices, dtype=float)
    deltas = np.diff(arr)
    gains = np.where(deltas > 0, deltas, 0.0)
    losses = np.where(deltas < 0, -deltas, 0.0)
    avg_gain = np.mean(gains[:period])
    avg_loss = np.mean(losses[:period])
    for i in range(period, len(deltas)):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return round(100.0 - (100.0 / (1.0 + rs)), 2)


def calc_sma(prices: list, period: int) -> float | None:
    if len(prices) < period:
        return None
    return round(float(np.mean(prices[-period:])), 6)


def calc_ema(prices: list, period: int) -> float | None:
    if len(prices) < period:
        return None
    arr = np.array(prices, dtype=float)
    k = 2.0 / (period + 1)
    ema = arr[0]
    for price in arr[1:]:
        ema = price * k + ema * (1 - k)
    return round(float(ema), 6)


def determine_signal(rsi: float | None, sma7: float | None, sma20: float | None) -> str:
    """根據 RSI 超買/超賣與均線交叉判斷綜合訊號。"""
    if rsi is None:
        return "觀望"
    signals = []
    if rsi >= 70:
        signals.append("RSI超買")
    elif rsi <= 30:
        signals.append("RSI超賣")
    if sma7 is not None and sma20 is not None:
        if sma7 > sma20:
            signals.append("均線多頭")
        elif sma7 < sma20:
            signals.append("均線空頭")
    if not signals:
        return "中性"
    return " / ".join(signals)


def process_coin(symbol: str, coin_id: str, market_info: dict) -> dict:
    print(f"抓取 {symbol} ({coin_id}) 歷史資料...")
    prices = fetch_coin_chart(coin_id)

    if not market_info or not prices:
        return {"symbol": symbol, "error": "資料抓取失敗"}

    rsi = calc_rsi(prices)
    sma7 = calc_sma(prices, 7)
    sma20 = calc_sma(prices, 20)
    ema12 = calc_ema(prices, 12)
    ema26 = calc_ema(prices, 26)
    high_30d = round(float(max(prices)), 6) if prices else None
    low_30d = round(float(min(prices)), 6) if prices else None
    signal = determine_signal(rsi, sma7, sma20)

    return {
        "symbol": symbol,
        "current_price": market_info.get("current_price"),
        "price_change_24h": market_info.get("price_change_percentage_24h"),
        "volume_24h": market_info.get("total_volume"),
        "high_30d": high_30d,
        "low_30d": low_30d,
        "rsi": rsi,
        "sma7": sma7,
        "sma20": sma20,
        "ema12": ema12,
        "ema26": ema26,
        "signal": signal,
    }


def main():
    print(f"開始抓取市場資料，日期: {TODAY}")

    # 一次取得所有幣種的市場基本資料
    print("批次抓取市場基本資料...")
    all_market_data = fetch_all_market_data(list(COINS.values()))
    time.sleep(REQUEST_INTERVAL)

    coins_data = []
    coin_items = list(COINS.items())
    for i, (symbol, coin_id) in enumerate(coin_items):
        market_info = all_market_data.get(coin_id, {})
        result = process_coin(symbol, coin_id, market_info)
        coins_data.append(result)
        # 間隔等待（最後一個幣不需要等待）
        if i < len(COINS) - 1:
            time.sleep(REQUEST_INTERVAL)

    output = {
        "date": TODAY,
        "coins": coins_data,
    }

    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"市場資料儲存至 {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
