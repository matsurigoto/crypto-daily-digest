"""
translate_news.py
讀取當日 _news.json，使用 OpenAI API 批次翻譯標題成繁體中文並產生簡短摘要。
"""
import json
import os
from datetime import datetime, timezone

TODAY = datetime.now(timezone.utc).strftime("%Y-%m-%d")
NEWS_FILE = os.path.join(os.path.dirname(__file__), "..", "docs", "data", f"{TODAY}_news.json")

BATCH_SIZE = 10


def translate_batch(client, titles: list[str]) -> list[dict]:
    """翻譯一批新聞標題並產生摘要，回傳含 title_zh 和 summary_zh 的串列。"""
    numbered = "\n".join(f"{i + 1}. {t}" for i, t in enumerate(titles))
    prompt = (
        "請將以下新聞標題翻譯成繁體中文，並為每條新聞產生一句話簡短摘要（約20-40字）。\n\n"
        "請以 JSON 陣列格式回覆，每個元素包含 \"title_zh\" 和 \"summary_zh\" 兩個欄位。\n"
        "只回覆 JSON，不要加入其他文字。\n\n"
        f"新聞列表：\n{numbered}"
    )
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=3000,
        temperature=0.3,
    )
    raw = response.choices[0].message.content.strip()
    # 移除可能的 markdown code block
    if raw.startswith("```"):
        parts = raw.split("```")
        if len(parts) >= 2:
            raw = parts[1]
            if raw.startswith("json"):
                raw = raw[4:]
    return json.loads(raw.strip())


def main():
    if not os.path.exists(NEWS_FILE):
        print(f"找不到新聞檔案: {NEWS_FILE}，跳過翻譯。")
        return

    with open(NEWS_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)

    articles = data.get("articles", [])
    if not articles:
        print("新聞列表為空，跳過翻譯。")
        return

    api_key = os.environ.get("OPENAI_API_KEY", "")
    if not api_key:
        print("警告：未設定 OPENAI_API_KEY，跳過翻譯。")
        return

    try:
        from openai import OpenAI
        client = OpenAI(api_key=api_key)

        for i in range(0, len(articles), BATCH_SIZE):
            batch = articles[i:i + BATCH_SIZE]
            titles = [a["title"] for a in batch]
            print(f"翻譯第 {i + 1}–{i + len(batch)} 篇...")
            try:
                results = translate_batch(client, titles)
                for j, item in enumerate(results):
                    if j < len(batch):
                        articles[i + j]["title_zh"] = item.get("title_zh", "")
                        articles[i + j]["summary_zh"] = item.get("summary_zh", "")
            except Exception as e:
                print(f"警告：批次翻譯失敗 (第 {i + 1} 批): {e}")

        data["articles"] = articles
        with open(NEWS_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"翻譯完成，已覆寫 {NEWS_FILE}")

    except Exception as e:
        print(f"警告：翻譯流程發生錯誤: {e}，保留原始英文標題。")


if __name__ == "__main__":
    main()
