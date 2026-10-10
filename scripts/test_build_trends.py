import json
import tempfile
import unittest
from pathlib import Path

from build_trends import build_dataset, number


class TrendDatasetTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.data_dir = Path(self.directory.name)

    def report(self, date, market=None, signals=None):
        report = {
            "date": date, "generated_at": date + "T06:00:00+08:00",
            "market": market or [], "signals": signals or {},
        }
        (self.data_dir / f"{date}.json").write_text(json.dumps(report), encoding="utf-8")

    def test_old_report_keeps_snapshots_without_inventing_source_times(self):
        self.report("2026-10-01", [{"symbol": "BTC", "current_price": 100, "sma7": 99, "sma20": 98}])
        data = build_dataset(self.data_dir)
        coin = data["reports"][0]["market"][0]
        self.assertEqual(coin["current_price"], 100)
        self.assertEqual(coin["sma7"], 99)
        self.assertEqual(coin["data_quality"]["status"], "available")
        self.assertIsNone(coin["data_quality"]["observed_at"])
        self.assertIsNone(coin["data_quality"]["fetched_at"])
        self.assertEqual(data["reports"][0]["market"][1]["data_quality"]["status"], "missing")

    def test_new_metadata_and_missing_signals_are_preserved(self):
        meta = {"source": "CoinGecko", "observed_at": "2026-10-01T21:00:00Z", "fetched_at": "2026-10-02T05:30:00+08:00"}
        self.report("2026-10-02", [{"symbol": "BTC", "current_price": 123, "data_quality": meta}])
        data = build_dataset(self.data_dir)
        self.assertEqual(data["reports"][0]["market"][0]["data_quality"]["observed_at"], meta["observed_at"])
        self.assertEqual(data["reports"][0]["data_quality"]["reddit_sentiment"]["status"], "missing")

    def test_invalid_prices_are_null_not_zero_and_error_wins(self):
        self.report("2026-10-01", [
            {"symbol": "BTC", "current_price": 0},
            {"symbol": "ETH", "current_price": float("nan")},
            {"symbol": "SOL", "current_price": "123"},
            {"symbol": "BNB", "current_price": 123, "error": "failed"},
            {"symbol": "XRP", "current_price": -1},
        ])
        data = build_dataset(self.data_dir)
        self.assertTrue(all(c["current_price"] is None for c in data["reports"][0]["market"]))
        json.dumps(data, allow_nan=False)
        self.assertIsNone(number(True))
        self.assertIsNone(number(float("inf")))

    def test_sentiment_deduplicates_first_observation_and_records_availability(self):
        self.report("2026-10-01", signals={"fear_greed": {
            "value": 20, "timestamp": "2026-10-01T00:00:00Z",
            "history": [{"date": "2026-10-01", "value": 20}, {"date": "2026-09-30", "value": 19}],
        }})
        self.report("2026-10-03", signals={"fear_greed": {
            "history": [{"date": "2026-10-01", "value": 99}, {"date": "2026-10-02", "value": 0},
                        {"date": "2026-10-04", "value": 40}, {"date": "2026-10-03", "value": 101}],
        }})
        data = build_dataset(self.data_dir)
        self.assertEqual(data["fear_greed"], [
            {"date": "2026-10-01", "value": 20, "available_on": "2026-10-01"},
            {"date": "2026-10-02", "value": 0, "available_on": "2026-10-03"},
        ])
        self.assertEqual(data["reports"][0]["data_quality"]["fear_greed"]["observed_at"], "2026-10-01T00:00:00Z")

    def test_intermediate_files_ignored_and_mismatched_reports_fail(self):
        (self.data_dir / "2026-10-01_market.json").write_text("{}", encoding="utf-8")
        (self.data_dir / "trends.json").write_text("{}", encoding="utf-8")
        self.assertEqual(build_dataset(self.data_dir)["reports"], [])
        (self.data_dir / "2026-10-01.json").write_text('{"date":"2026-10-02"}', encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "date does not match"):
            build_dataset(self.data_dir)

    def test_corrupt_reports_fail_explicitly(self):
        (self.data_dir / "2026-10-01.json").write_text("{broken", encoding="utf-8")
        with self.assertRaises(json.JSONDecodeError):
            build_dataset(self.data_dir)


if __name__ == "__main__":
    unittest.main()
