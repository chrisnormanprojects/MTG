"""Opt-in CardTrader marketplace import; requires prior approval from CardTrader.

Only scans the API's up-to-25 lowest global offers per printing. UK prices
therefore mean the lowest observed UK English offer, NOT every UK listing.
No website scraping, checkout actions, or automatic API activation.
"""
import json
import time
import urllib.parse
import urllib.request
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

BASE = "https://api.cardtrader.com/api/v2"


def map_blueprints(records, known_ids):
    """Map only unambiguous official Cardmarket printing identifiers."""
    result = {}
    for entry in records:
        if not isinstance(entry, dict) or entry.get("game_id") != 1:
            continue
        candidates = entry.get("card_market_ids") or []
        if not isinstance(candidates, list) or len(candidates) != 1:
            continue
        try:
            cid, blueprint = str(int(candidates[0])), str(int(entry["id"]))
        except (ValueError, TypeError, KeyError):
            continue
        if cid in known_ids:
            result[blueprint] = cid
    return result


def listing_rows(groups, blueprint_map, rate):
    """Only English, in-stock, non-graded, single-card GB seller offers."""
    best, links = {}, {}
    for blueprint, offers in groups.items():
        cid = blueprint_map.get(str(blueprint))
        if cid is None or not isinstance(offers, list):
            continue
        for offer in offers:
            if not isinstance(offer, dict):
                continue
            user = offer.get("user") or {}
            props = offer.get("properties_hash") or {}
            if (user.get("country_code") != "GB"
                    or props.get("mtg_language") != "en"
                    or offer.get("on_vacation") is not False
                    or offer.get("graded") is not False
                    or type(offer.get("quantity")) is not int or offer["quantity"] < 1
                    or type(offer.get("bundle_size")) is not int or offer["bundle_size"] != 1
                    or type(props.get("mtg_foil")) is not bool):
                continue
            price = offer.get("price") or {}
            minor, currency = price.get("cents"), price.get("currency")
            if type(minor) is not int or minor <= 0:
                continue
            if currency == "GBP":
                gbp = minor
            elif currency == "EUR" and rate:
                gbp = int((Decimal(minor) * Decimal(str(rate))).quantize(
                    Decimal("1"), rounding=ROUND_HALF_UP))
            else:
                continue
            finish = "foil" if props["mtg_foil"] else "normal"
            key = (cid, finish)
            if key in best and best[key] <= gbp:
                continue
            best[key] = gbp
            links[key] = {
                "source": "CardTrader",
                "seller": str(user.get("username") or "CardTrader seller")[:100],
                "url": "https://www.cardtrader.com/en/cards/" + str(blueprint),
                "currency": currency,
                "converted": currency != "GBP",
                "original_minor_units": minor,
                "condition": str(props.get("condition") or ""),
                "offer_id": offer.get("id"),
                "coverage": "Lowest observed from up to 25 cheapest global listings per printing"
            }
    return best, links


class Client:
    def __init__(self, token):
        self.token = token
        self.last = 0

    def get(self, endpoint, params=None):
        # CardTrader allows up to 10 marketplace requests per second.
        gap = time.monotonic() - self.last
        if gap < 0.2:
            time.sleep(0.2 - gap)
        query = "?" + urllib.parse.urlencode(params) if params else ""
        request = urllib.request.Request(BASE + endpoint + query, headers={
            "Authorization": "Bearer " + self.token,
            "Accept": "application/json",
            "User-Agent": "MTG-Price-Radar/1.1 (approved marketplace client)"
        })
        last_error = None
        for attempt in range(3):
            try:
                with urllib.request.urlopen(request, timeout=180) as response:
                    payload = response.read()
                self.last = time.monotonic()
                return json.loads(payload)
            except Exception as exc:
                last_error = exc
                time.sleep(2 ** attempt)
        raise RuntimeError("CardTrader request failed (" + endpoint + "): " + str(last_error))


def scan_uk_offers(token, rate, root, known_ids):
    """Scan MTG expansions and cache CardTrader's official ID cross-reference."""
    client = Client(token)
    expansions = client.get("/expansions")
    if not isinstance(expansions, list):
        raise ValueError("CardTrader expansions response is invalid")
    ids = sorted([int(e["id"]) for e in expansions
                  if isinstance(e, dict) and e.get("game_id") == 1], reverse=True)
    if not ids:
        raise ValueError("No Magic expansions returned by CardTrader")
    cache_path = Path(root) / "data" / "provider_cache" / "cardtrader_blueprints.json"
    cache = json.loads(cache_path.read_text(encoding="utf-8")) if cache_path.exists() else {}
    all_best, all_links = {}, {}
    for n, eid in enumerate(ids, 1):
        key = str(eid)
        if key not in cache:
            blueprints = client.get("/blueprints/export", {"expansion_id": eid})
            if not isinstance(blueprints, list):
                raise ValueError("Bad blueprints for expansion " + key)
            cache[key] = map_blueprints(blueprints, known_ids)
        mapping = cache[key]
        if not mapping:
            continue
        offers = client.get("/marketplace/products", {"expansion_id": eid, "language": "en"})
        if not isinstance(offers, dict):
            raise ValueError("Bad marketplace response for expansion " + key)
        best, links = listing_rows(offers, mapping, rate)
        for pair, quote in best.items():
            if pair not in all_best or quote < all_best[pair]:
                all_best[pair] = quote
                all_links[pair] = links[pair]
        if n % 50 == 0:
            print("CardTrader: %d/%d expansions, %d observed UK offers" %
                  (n, len(ids), len(all_best)), flush=True)
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(json.dumps(cache, separators=(",", ":")), encoding="utf-8")
    return all_best, all_links, {
        "provider": "CardTrader",
        "expansions_scanned": len(ids),
        "observed_uk_offers": len(all_best),
        "coverage": "Up to 25 cheapest global listings per blueprint, not all UK offers"
    }
