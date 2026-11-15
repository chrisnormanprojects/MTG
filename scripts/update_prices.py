#!/usr/bin/env python3
"""Daily Cardmarket price-guide snapshots with optional verified UK offer feed.

No claim of UK/English listing verification is made for Cardmarket guide prices.
Uses only Cardmarket's official downloadable daily aggregate data, not scraping.
"""
import csv
import io
import json
import os
import time
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
CATALOG_URL = "https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_1.json"
PRICES_URL = "https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_1.json"
FX_URL = "https://api.frankfurter.dev/v2/rate/eur/gbp"
SHARDS = 32


def download(url, attempts=3):
    for attempt in range(attempts):
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": "MTG-Price-History/1.0 (public bulk-data consumer)",
                "Accept": "application/json,text/csv,*/*",
            })
            with urllib.request.urlopen(req, timeout=100) as response:
                return response.read()
        except Exception:
            if attempt == attempts - 1:
                raise
            time.sleep(2 ** attempt)


def load_json(url):
    return json.loads(download(url).decode("utf-8-sig"))


def read_json(path, default):
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return default


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(json.dumps(value, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    temporary.replace(path)


def pennies(value):
    """Positive money amount as integer minor units, otherwise None."""
    try:
        if value is None or isinstance(value, bool):
            return None
        dec = Decimal(str(value))
        if not dec.is_finite() or dec <= 0:
            return None
        return int((dec * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
    except (InvalidOperation, ValueError, TypeError):
        return None


def is_true(value):
    return str(value).strip().lower() in ("true", "yes", "1", "in stock", "available")


def verified_uk_offers():
    """Only explicitly English, GB-located, available offers qualify.

    This is intentionally an OPTIONAL licensed/trusted CSV feed. It must not be
    replaced with the Cardmarket aggregate EU low, which does not have these filters.
    """
    url = os.environ.get("UK_OFFERS_CSV_URL", "").strip()
    if url:
        if not url.startswith("https://"):
            raise ValueError("UK_OFFERS_CSV_URL must use HTTPS")
        raw = download(url).decode("utf-8-sig")
    else:
        path = DATA / "uk_offers.csv"
        raw = path.read_text(encoding="utf-8-sig") if path.exists() else ""
    best = {}
    links = {}
    if not raw.strip():
        return best, links
    reader = csv.DictReader(io.StringIO(raw))
    required = {"cardmarket_id", "price_gbp", "language", "seller_country",
                "in_stock", "finish", "url", "seller"}
    if not required.issubset(set(reader.fieldnames or [])):
        raise ValueError("UK offers feed is missing required columns")
    for offer in reader:
        if offer["language"].strip().lower() not in ("english", "en"):
            continue
        if offer["seller_country"].strip().lower() not in ("gb", "uk", "united kingdom"):
            continue
        if not is_true(offer["in_stock"]):
            continue
        finish = offer["finish"].strip().lower()
        if finish in ("normal", "nonfoil", "non-foil", "regular"):
            key = "normal"
        elif finish == "foil":
            key = "foil"
        else:
            continue
        try:
            card_id = str(int(offer["cardmarket_id"]))
        except (ValueError, TypeError):
            continue
        price = pennies(offer["price_gbp"])
        if price is None:
            continue
        pair = (card_id, key)
        if pair in best and best[pair] <= price:
            continue
        best[pair] = price
        candidate = offer["url"].strip()
        links[pair] = {
            "seller": offer["seller"].strip()[:100],
            "url": candidate if candidate.startswith("https://") else "",
        }
    return best, links


def source_day(prices):
    stamp = prices.get("createdAt", "")
    if not isinstance(stamp, str) or len(stamp) < 10:
        raise ValueError("Cardmarket guide has no valid createdAt")
    day = stamp[:10]
    datetime.strptime(day, "%Y-%m-%d")
    return day


def build_catalog(items):
    result = []
    seen = set()
    for p in items:
        try:
            card_id = int(p["idProduct"])
            name = str(p["name"]).strip()
        except (KeyError, TypeError, ValueError):
            continue
        if card_id <= 0 or not name or card_id in seen:
            continue
        seen.add(card_id)
        result.append([card_id, name, str(p.get("expansionName") or ""),
                       str(p.get("number") or ""), str(p.get("rarity") or "")])
    return sorted(result, key=lambda x: (x[1].casefold(), x[2].casefold(), x[0]))


def import_data(catalog_source, guide_source, rate=None, uk_best=None, uk_links=None):
    cards = build_catalog(catalog_source.get("products", []))
    guides = guide_source.get("priceGuides", [])
    if len(cards) < 10000 or len(guides) < 10000:
        raise ValueError("Upstream data unexpectedly small: refusing to overwrite existing database")
    day = source_day(guide_source)
    available = {str(c[0]) for c in cards}
    uk_best = uk_best or {}
    uk_links = uk_links or {}
    lookup = {}
    matched = 0
    for g in guides:
        cid = str(g.get("idProduct", ""))
        if cid not in available:
            continue
        # Cardmarket's 'low' is Europe-wide, ANY language/condition; never a UK quote.
        eu = [pennies(g.get("low")), pennies(g.get("low-foil")),
              pennies(g.get("trend")), pennies(g.get("trend-foil"))]
        gb = [uk_best.get((cid, "normal")), uk_best.get((cid, "foil"))]
        lookup[cid] = eu + gb
        matched += 1
    if matched < 10000:
        raise ValueError("Product/price join unexpectedly small: refusing to write")
    DATA.mkdir(parents=True, exist_ok=True)
    write_json(DATA / "catalog.json", cards)
    write_json(DATA / "latest.json", lookup)

    details = {}
    for (cid, finish), info in uk_links.items():
        if cid in available:
            details.setdefault(cid, {})[finish] = info
    write_json(DATA / "uk_links.json", details)

    fx_rate = float(rate.get("rate")) if rate and rate.get("rate") else None
    if fx_rate is not None and (fx_rate < 0.1 or fx_rate > 2):
        raise ValueError("Implausible EUR/GBP exchange rate")
    fx_micro = round(fx_rate * 1000000) if fx_rate else None
    month = day[:7]
    daynum = int(day[-2:])
    groups = defaultdict(dict)
    for cid, row in lookup.items():
        if any(value is not None for value in row):
            groups[int(cid) % SHARDS][cid] = [daynum] + row + [fx_micro]
    for shard, updates in groups.items():
        path = DATA / "history" / month / f"{shard:02d}.json"
        previous = read_json(path, {"month": month, "cards": {}})
        if previous.get("month") != month:
            raise ValueError("Unexpected history shard month")
        history = previous["cards"]
        for cid, point in updates.items():
            prior = [p for p in history.get(cid, []) if p[0] != daynum]
            prior.append(point)
            prior.sort(key=lambda p: p[0])
            history[cid] = prior
        write_json(path, {"month": month, "cards": history})
    past = read_json(DATA / "meta.json", {})
    months = sorted(set(past.get("months", []) + [month]))
    write_json(DATA / "meta.json", {
        "schema": 1, "source_date": day,
        "catalogue_date": catalog_source.get("createdAt"),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "products": len(cards), "priced_products": matched,
        "verified_uk_offers": len(uk_best),
        "fx_date": rate.get("date") if rate else None,
        "eur_to_gbp": fx_rate,
        "months": months,
        "shards": SHARDS,
        "reference": "Cardmarket daily EU-wide low (any language, any condition)",
        "uk_definition": "Lowest supplied, available, English-language offer from a GB seller; postage not included",
    })
    print(f"Imported {len(cards):,} printings; {matched:,} guide matches; "
          f"{len(uk_best):,} qualifying UK offers; source {day}")


def main():
    catalogue = load_json(CATALOG_URL)
    guide = load_json(PRICES_URL)
    try:
        rate = load_json(FX_URL)
    except Exception as exc:
        print(f"FX source unavailable; displaying EUR only ({exc})")
        rate = None
    offers, links = verified_uk_offers()
    import_data(catalogue, guide, rate=rate, uk_best=offers, uk_links=links)


if __name__ == "__main__":
    main()
