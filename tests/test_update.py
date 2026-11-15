import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("mtg_prices", Path(__file__).resolve().parents[1] / "scripts" / "update_prices.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


class TestPriceImport(unittest.TestCase):
    def test_money(self):
        self.assertEqual(mod.pennies("1.235"), 124)
        self.assertEqual(mod.pennies(0.01), 1)
        self.assertIsNone(mod.pennies("0"))
        self.assertIsNone(mod.pennies("n/a"))
        self.assertIsNone(mod.pennies(None))

    def test_catalog_identity(self):
        rows = mod.build_catalog({"products": [
            {"idProduct": 13, "name": "Sol Ring", "expansionName": "Commander"},
            {"idProduct": 12, "name": "Sol Ring", "expansionName": "Revised"},
            {"idProduct": 13, "name": "Duplicate"},
        ]}["products"])
        self.assertEqual(len(rows), 2)
        self.assertEqual([r[0] for r in rows], [13, 12])

    def test_uk_quotes_require_all_filters_and_choose_lowest(self):
        with tempfile.TemporaryDirectory() as tmp:
            data = Path(tmp)
            (data / "uk_offers.csv").write_text(
                "cardmarket_id,price_gbp,language,seller_country,in_stock,finish,url,seller\n"
                "12,7.50,English,GB,true,normal,https://example.com/a,Store One\n"
                "12,6.00,English,GB,true,normal,https://example.com/b,Store Two\n"
                "12,1.00,German,GB,true,normal,https://example.com/c,Wrong Language\n"
                "12,2.00,English,DE,true,normal,https://example.com/d,Wrong Country\n"
                "12,3.00,English,GB,false,normal,https://example.com/e,Sold Out\n"
                "12,8.00,English,GB,true,foil,https://example.com/f,Foil Seller\n",
                encoding="utf-8",
            )
            with patch.object(mod, "DATA", data), patch.dict(mod.os.environ, {"UK_OFFERS_CSV_URL": ""}):
                best, links = mod.verified_uk_offers()
        self.assertEqual(best, {("12", "normal"): 600, ("12", "foil"): 800})
        self.assertEqual(links[("12", "normal")]["seller"], "Store Two")

    def test_source_date_validation(self):
        self.assertEqual(mod.source_day({"createdAt": "2026-11-15T00:30:00+0000"}), "2026-11-15")
        with self.assertRaises(ValueError):
            mod.source_day({"createdAt": ""})


if __name__ == "__main__":
    unittest.main()
