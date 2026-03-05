"""
generate_summary.py
讀取當日 _news.json 和 _market.json，使用 OpenAI GPT-4o-mini 產生繁體中文每日報告。
"""
import json
import os
from datetime import datetime, timezone, timedelta

from openai import OpenAI

TZ_TPE = timezone(timedelta(hours=8))
TODAY = datetime.now(TZ_TPE).strftime("%Y-%m-%d")
DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "docs", "data")
NEWS_FILE = os.path.join(DATA_DIR, f"{TODAY}_news.json")
MARKET_FILE = os.path.join(DATA_DIR, f"{TODAY}_market.json")
SIGNALS_FILE = os.path.join(DATA_DIR, f"{TODAY}_signals.json")
OUTPUT_FILE = os.path.join(DATA_DIR, f"{TODAY}.json")


def load_json(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def build_prompt(news_data: dict, market_data: dict, signals_data: dict | None = None) -> str:
    # 整理新聞摘要（最多取前 20 篇）
    articles = news_data.get("articles", [])[:20]
    news_text = "\n".join(
        f"- [{a['source']}] {a.get('title_zh', a['title'])}" for a in articles
    )

    # 整理市場資料
    coins = market_data.get("coins", [])
    market_text = "\n".join(
        f"- {c['symbol']}: 價格=${c.get('current_price', 'N/A')}, "
        f"24h={c.get('price_change_24h', 'N/A')}%, "
        f"RSI={c.get('rsi', 'N/A')}, "
        f"訊號={c.get('signal', 'N/A')}"
        for c in coins
        if "error" not in c
    )

    # 整理市場情緒指標
    signals_block = ""
    if signals_data:
        fg = signals_data.get("fear_greed", {})
        reddit = signals_data.get("reddit_sentiment", {})
        onchain = signals_data.get("onchain", {})
        parts = []
        if fg:
            parts.append(f"- 恐懼貪婪指數: {fg.get('value', 'N/A')}（{fg.get('classification', 'N/A')}）")
        if reddit:
            parts.append(
                f"- Reddit 情緒評分: {reddit.get('sentiment_score', 'N/A')}（{reddit.get('label', 'N/A')}）"
                f"，正面: {reddit.get('positive_count', 0)}，負面: {reddit.get('negative_count', 0)}"
                f"，中立: {reddit.get('neutral_count', 0)}"
            )
        if onchain:
            total_mc = onchain.get("total_market_cap_usd")
            total_mc_str = f"${total_mc / 1e12:.2f}T" if total_mc else "N/A"
            parts.append(f"- BTC 市佔率: {onchain.get('btc_dominance', 'N/A')}%")
            parts.append(f"- 全市場總市值: {total_mc_str}")
        if parts:
            signals_block = "\n\n【市場情緒指標】\n" + "\n".join(parts)

    return f"""你是一位專業的加密貨幣分析師，請根據以下今日資料產生一份繁體中文每日彙整報告。

【今日新聞標題（共 {len(articles)} 篇）】
{news_text}

【市場技術指標】
{market_text}{signals_block}

請產生包含以下六個部分的報告（使用繁體中文，每部分約 100-200 字）：

1. 📰 今日重點摘要（列出 3-5 個重點）
2. 📊 市場概況（整體氛圍、主流幣走勢）
3. 🔍 技術分析解讀（RSI、均線等訊號解讀）
3.5 😱 市場情緒（恐懼貪婪指數、社群情緒解讀）
4. ⚠️ 風險提醒
5. 🎯 今日觀察重點

請直接輸出報告內容，不要加入額外說明。"""


def generate_summary(prompt: str) -> str:
    api_key = os.environ.get("OPENAI_API_KEY", "")
    if not api_key:
        print("警告：未設定 OPENAI_API_KEY，跳過 AI 摘要產生。")
        return "今日摘要因未設定 OPENAI_API_KEY 而略過。"
    try:
        client = OpenAI(api_key=api_key)
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "你是一位專業的加密貨幣分析師，擅長產生繁體中文市場分析報告。"},
                {"role": "user", "content": prompt},
            ],
            max_tokens=2000,
            temperature=0.7,
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        print(f"警告：OpenAI API 呼叫失敗: {e}")
        print("將使用預設摘要文字。")
        return "今日摘要因 OpenAI API 錯誤而略過。請檢查 API key 額度與帳單設定。"


def main():
    print(f"開始產生每日摘要，日期: {TODAY}")

    if not os.path.exists(NEWS_FILE):
        print(f"找不到新聞檔案: {NEWS_FILE}，使用空資料。")
        news_data = {"date": TODAY, "count": 0, "articles": []}
    else:
        news_data = load_json(NEWS_FILE)

    if not os.path.exists(MARKET_FILE):
        print(f"找不到市場檔案: {MARKET_FILE}，使用空資料。")
        market_data = {"date": TODAY, "coins": []}
    else:
        market_data = load_json(MARKET_FILE)

    if os.path.exists(SIGNALS_FILE):
        signals_data = load_json(SIGNALS_FILE)
        print("已載入市場情緒訊號資料。")
    else:
        print(f"找不到訊號檔案: {SIGNALS_FILE}，略過市場情緒指標。")
        signals_data = None

    prompt = build_prompt(news_data, market_data, signals_data)
    print("呼叫 OpenAI API ...")
    summary = generate_summary(prompt)
    print("摘要產生完成。")

    output = {
        "date": TODAY,
        "generated_at": datetime.now(TZ_TPE).isoformat(),
        "summary": summary,
        "news": news_data.get("articles", []),
        "market": market_data.get("coins", []),
        "signals": signals_data if signals_data else {},
    }

    os.makedirs(DATA_DIR, exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print(f"每日報告儲存至 {OUTPUT_FILE}")

    # 清除中間檔案
    for path in (NEWS_FILE, MARKET_FILE, SIGNALS_FILE):
        if os.path.exists(path):
            os.remove(path)
            print(f"已刪除中間檔案: {path}")


if __name__ == "__main__":
    main()
