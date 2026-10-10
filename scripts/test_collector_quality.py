import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import fetch_market
import fetch_signals
import generate_summary


class CollectorQualityTests(unittest.TestCase):
    def test_market_batch_records_fetch_time_without_changing_market_fields(self):
        response = Mock()
        response.json.return_value = [{"id": "bitcoin", "current_price": 123, "last_updated": "2026-10-10T00:00:00Z"}]
        with patch.object(fetch_market, "request_with_retry", return_value=response):
            market = fetch_market.fetch_all_market_data(["bitcoin"])["bitcoin"]
        self.assertEqual(market["current_price"], 123)
        self.assertEqual(market["last_updated"], "2026-10-10T00:00:00Z")
        self.assertIn("_fetched_at", market)

    def test_coin_preserves_source_timestamp_and_existing_indicators(self):
        market = {"current_price": 100, "last_updated": "2026-10-10T00:00:00Z", "_fetched_at": "2026-10-10T08:01:00+08:00"}
        with patch.object(fetch_market, "fetch_coin_chart", return_value=list(range(1, 31))):
            coin = fetch_market.process_coin("BTC", "bitcoin", market)
        self.assertEqual(coin["data_quality"]["observed_at"], market["last_updated"])
        self.assertEqual(coin["data_quality"]["fetched_at"], market["_fetched_at"])
        self.assertEqual(coin["sma7"], 27)
        self.assertEqual(coin["sma20"], 20.5)
        with patch.object(fetch_market, "fetch_coin_chart", return_value=[]):
            missing = fetch_market.process_coin("BTC", "bitcoin", {})
        self.assertEqual(missing["data_quality"]["status"], "missing")
        self.assertIn("error", missing)

    def test_signals_and_final_report_retain_quality_without_extra_api_calls(self):
        with tempfile.TemporaryDirectory() as directory:
            data_dir = Path(directory)
            signals_file = data_dir / "signals.json"
            report_file = data_dir / "report.json"
            fg = {"value": 40, "timestamp": "2026-10-10T00:00:00Z", "history": []}
            with patch.object(fetch_signals, "OUTPUT_FILE", str(signals_file)), \
                    patch.object(fetch_signals, "DATA_DIR", str(data_dir)), \
                    patch.object(fetch_signals, "fetch_fear_greed", return_value=fg) as fear, \
                    patch.object(fetch_signals, "fetch_reddit_sentiment", return_value={}) as reddit, \
                    patch.object(fetch_signals, "fetch_onchain", return_value={}) as market:
                fetch_signals.main()
            fear.assert_called_once()
            reddit.assert_called_once()
            market.assert_called_once()
            signals = json.loads(signals_file.read_text(encoding="utf-8"))
            self.assertEqual(signals["data_quality"]["fear_greed"]["observed_at"], fg["timestamp"])
            self.assertIsNotNone(signals["data_quality"]["fear_greed"]["fetched_at"])
            self.assertEqual(signals["data_quality"]["reddit_sentiment"]["status"], "missing")
            self.assertIsNone(signals["data_quality"]["reddit_sentiment"]["fetched_at"])
            with patch.object(generate_summary, "DATA_DIR", str(data_dir)), \
                    patch.object(generate_summary, "NEWS_FILE", str(data_dir / "news.json")), \
                    patch.object(generate_summary, "MARKET_FILE", str(data_dir / "market.json")), \
                    patch.object(generate_summary, "SIGNALS_FILE", str(signals_file)), \
                    patch.object(generate_summary, "OUTPUT_FILE", str(report_file)), \
                    patch.object(generate_summary, "generate_summary", return_value="test summary"):
                generate_summary.main()
            report = json.loads(report_file.read_text(encoding="utf-8"))
            self.assertEqual(report["signals"]["data_quality"], signals["data_quality"])


if __name__ == "__main__":
    unittest.main()
