"""Build a compact, backward-compatible trend dataset from retained daily reports."""
import argparse
import json
import math
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "docs" / "data"
SYMBOLS = ("BTC", "ETH", "SOL", "BNB", "XRP")
TZ_TPE = timezone(timedelta(hours=8))


def number(value, minimum=None, maximum=None):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    if not math.isfinite(value):
        return None
    if minimum is not None and value < minimum:
        return None
    if maximum is not None and value > maximum:
        return None
    return value


def valid_date(value):
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        return False
    try:
        datetime.strptime(value, "%Y-%m-%d")
        return True
    except ValueError:
        return False


def quality(raw, available, source):
    raw = raw if isinstance(raw, dict) else {}
    return {
        "source": raw.get("source") or source,
        "status": "available" if available else "missing",
        "observed_at": raw.get("observed_at"),
        "fetched_at": raw.get("fetched_at"),
    }


def build_dataset(data_dir):
    reports = []
    fear_greed = {}
    for path in sorted(data_dir.glob("????-??-??.json")):
        if not valid_date(path.stem):
            continue
        with path.open(encoding="utf-8") as handle:
            report = json.load(handle)
        if report.get("date") != path.stem:
            raise ValueError(f"{path.name}: report date does not match filename")
        market = []
        by_symbol = {c["symbol"]: c for c in report.get("market", []) if c.get("symbol") in SYMBOLS}
        for symbol in SYMBOLS:
            coin = by_symbol.get(symbol, {})
            price = number(coin.get("current_price"), minimum=0)
            if coin.get("error") or price == 0:
                price = None
            market.append({
                "symbol": symbol,
                "current_price": price,
                "sma7": number(coin.get("sma7"), minimum=0) if price is not None else None,
                "sma20": number(coin.get("sma20"), minimum=0) if price is not None else None,
                "data_quality": quality(coin.get("data_quality"), price is not None, "CoinGecko"),
            })
        signals = report.get("signals") or {}
        fg = signals.get("fear_greed") or {}
        signal_quality = signals.get("data_quality") or {}
        entries = list(fg.get("history") or [])
        timestamp = fg.get("timestamp")
        if timestamp:
            date = datetime.fromisoformat(timestamp.replace("Z", "+00:00")).astimezone(timezone.utc).date().isoformat()
            entries.append({"date": date, "value": fg.get("value")})
        for entry in entries:
            date = entry.get("date")
            value = number(entry.get("value"), minimum=0, maximum=100)
            if not valid_date(date) or date > path.stem or value is None:
                continue
            # Keep the first published observation, so later reports cannot rewrite a historical view.
            if date not in fear_greed:
                fear_greed[date] = {
                    "date": date, "value": value, "available_on": path.stem,
                }
        reports.append({
            "date": path.stem,
            "generated_at": report.get("generated_at"),
            "market": market,
            "data_quality": {
                "fear_greed": quality(signal_quality.get("fear_greed") or {"observed_at": timestamp}, number(fg.get("value"), 0, 100) is not None, "Alternative.me"),
                "reddit_sentiment": quality(signal_quality.get("reddit_sentiment"), bool(signals.get("reddit_sentiment")), "Reddit"),
                "onchain": quality(signal_quality.get("onchain"), bool(signals.get("onchain")), "CoinGecko"),
            },
        })
    start = reports[0]["date"] if reports else None
    return {
        "schema_version": 1,
        "generated_at": datetime.now(TZ_TPE).isoformat(),
        "symbols": list(SYMBOLS),
        "reports": reports,
        "fear_greed": [fear_greed[date] for date in sorted(fear_greed) if start and date >= start],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=DATA_DIR)
    args = parser.parse_args()
    dataset = build_dataset(args.data_dir)
    output = args.data_dir / "trends.json"
    temporary = output.with_suffix(".json.tmp")
    with temporary.open("w", encoding="utf-8") as handle:
        json.dump(dataset, handle, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
        handle.write("\n")
    temporary.replace(output)
    print(f"Built {len(dataset['reports'])} daily observations: {output}")


if __name__ == "__main__":
    main()
