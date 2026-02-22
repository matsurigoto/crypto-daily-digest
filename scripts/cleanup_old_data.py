"""
cleanup_old_data.py
掃描 data/ 目錄，刪除超過 180 天的 .json 檔案。
根據檔名前 10 字元解析日期 (YYYY-MM-DD)。
"""
import os
from datetime import datetime, timezone, timedelta

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "docs", "data")
RETENTION_DAYS = 180
CUTOFF = datetime.now(timezone.utc) - timedelta(days=RETENTION_DAYS)


def main():
    if not os.path.exists(DATA_DIR):
        print(f"資料目錄不存在: {DATA_DIR}，跳過清理。")
        return
    print(f"清理超過 {RETENTION_DAYS} 天的舊資料（截止日期: {CUTOFF.date()}）")
    deleted = 0
    for filename in os.listdir(DATA_DIR):
        if not filename.endswith(".json"):
            continue
        date_str = filename[:10]
        try:
            file_date = datetime.strptime(date_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except ValueError:
            continue
        if file_date < CUTOFF:
            filepath = os.path.join(DATA_DIR, filename)
            os.remove(filepath)
            print(f"已刪除: {filename}")
            deleted += 1
    print(f"共刪除 {deleted} 個舊檔案。")


if __name__ == "__main__":
    main()
