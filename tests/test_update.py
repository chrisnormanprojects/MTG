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


    def test_cardtrader_map_is_unambiguous(self):
        import sys
        sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
        import cardtrader_uk
        mappings = cardtrader_uk.map_blueprints([
            {"id": 77, "game_id": 1, "card_market_ids": [1234]},
            {"id": 78, "game_id": 1, "card_market_ids": [1234, 1235]},
            {"id": 79, "game_id": 2, "card_market_ids": [1234]},
        ], {"1234", "1235"})
        self.assertEqual(mappings, {"77": "1234"})

    def test_cardtrader_only_available_uk_english_unbundled(self):
        import sys
        sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
        import cardtrader_uk
        def offer(amount, **fields):
            row = {"id": 55, "user": {"country_code": "GB", "username": "Seller A"},
                   "properties_hash": {"mtg_language": "en", "mtg_foil": False, "condition": "Near Mint"},
                   "quantity": 1, "graded": False, "on_vacation": False,
                   "bundle_size": 1, "price": {"cents": amount, "currency": "EUR"}}
            for k, v in fields.items():
                if k in ("user", "properties_hash", "price"):
                    row[k].update(v)
                else:
                    row[k] = v
            return row
        offers = {"77": [
            offer(1000), offer(500, user={"country_code": "DE"}),
            offer(900, properties_hash={"mtg_language": "de"}),
            offer(100, on_vacation=True),
            offer(300, bundle_size=4),
            offer(700, price={"currency": "GBP"}),
            offer(600, properties_hash={"mtg_foil": True}),
        ]}
        best, links = cardtrader_uk.listing_rows(offers, {"77": "1234"}, 0.84)
        self.assertEqual(best[("1234", "normal")], 700)
        self.assertEqual(best[("1234", "foil")], 504)
        self.assertEqual(links[("1234", "foil")]["converted"], True)


    def test_cardtrader_flat_price_shape(self):
        import sys
        sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
        import cardtrader_uk
        rows = {"777": [{
            "id": 88, "user": {"country_code": "GB", "username": "UK Shop"},
            "properties_hash": {"mtg_language": "en", "mtg_foil": False},
            "quantity": 1, "graded": False, "on_vacation": False,
            "bundled_quantity": 1, "price_cents": 230, "price_currency": "EUR"
        }]}
        best, links = cardtrader_uk.listing_rows(rows, {"777": "1234"}, 0.84)
        self.assertEqual(best[("1234", "normal")], 193)
        self.assertEqual(links[("1234", "normal")]["converted"], True)


if __name__ == "__main__":
    unittest.main()
