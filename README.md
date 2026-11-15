# MTG Price Radar

A searchable, mobile-friendly Magic: The Gathering card-price history website for GitHub Pages, backed by a **daily, versioned price database**.

## Data integrity comes first

**This project does not pretend that a European low price is a verified UK price.**

- **EU low (EUR):** Cardmarket's free, official daily price-guide `low`. The guide's lowest offer may be in *any* language, condition or seller country. Its "trend" is a different, market-level metric. The site shows the EU low converted to indicative GBP using the day's EUR/GBP reference rate, **clearly labelled as an estimate**, not a UK shop offer.
- **English UK price (GBP):** Only populated from an explicitly English-language, *in-stock* offer with a **GB seller country**, supplied by a trusted/authorised CSV feed or permission-gated CardTrader integration. The lowest **observed** offer per printing and finish is used. Values converted from EUR to GBP are indicative; shipping and fees are excluded. Missing UK coverage is never filled with EU-wide prices.
- One row per **Cardmarket product ID / printing**. Normal and foil prices remain distinct; card set and collector number appear in search results.
- Daily snapshots begin **when the first successful import runs**. Historical prices before that date are not invented.

## Setup

1. Open your repository **Settings → Pages** and set the **Build and deployment source to GitHub Actions**.
2. Go to **Actions → Daily MTG prices and Pages → Run workflow** for the first import (or allow the scheduled run). GitHub must permit Actions and `GITHUB_TOKEN` writes to repository contents.
3. Open `https://chrisnormanprojects.github.io/MTG/` after the deployment run succeeds.

The scheduled workflow runs every day at **06:23 UTC**, downloads the Cardmarket Magic catalogue and price guide, refreshes the searchable index, writes monthly sharded history files, commits them to `main`, and deploys the website to Pages. This works with no API keys for the **EU reference** source. GitHub scheduled jobs are best-effort and may be delayed or disabled by GitHub policies; monitor Actions for failures.

## Getting **actual UK English prices**

Cardmarket's public bulk guide does **not** contain the language or seller-country filters needed to claim a UK low price. Instead, the importer accepts an authorised UK seller feed in a file at `data/uk_offers.csv`, or from an HTTPS URL set in GitHub Actions secret `UK_OFFERS_CSV_URL`. A provider can be connected later without changing the website.

Expected CSV header:

```csv
cardmarket_id,price_gbp,language,seller_country,in_stock,finish,url,seller
```

Each subsequent row must include the **exact** Cardmarket product ID, GBP offer price, `English` (or `en`), `GB` (or `UK`), `true` for stock, `normal` or `foil`, the HTTPS product URL and the retailer name. A price is included **only** when every filter passes. Postage is not included, so the cheapest product price is not necessarily the cheapest delivered price.

Do not scrape retailers without permission. A partner's data feed or properly licensed marketplace API is preferable. Avoid claiming that these quotes cover *every* UK shop unless coverage really is comprehensive.

## Price ordering

Search defaults to **cheapest → most expensive** by lowest European guide reference for each printing, checking both regular and foil prices. Select **UK offers (cheapest first)** to sort by observed English-language GB seller offers, with missing UK quotes after priced cards. Selecting **UK quotes only** filters to those offers. Prices from different markets are never silently mixed into one price ranking.

## Optional CardTrader connection — requires approval

CardTrader publishes an authenticated marketplace API containing offer language, GB seller country, condition, stock, finish and price. Its blueprints include the Cardmarket product identifiers used by this site. **CardTrader's terms require contacting its staff for permission before using marketplace data in a third-party service.** This integration is coded but is OFF until the market-data permission and account token are configured.

When CardTrader has approved the use case:

1. Obtain the API token from your CardTrader account settings. **Do not put the token into this public repository or any chat.**
2. Open this repository's **Settings → Secrets and variables → Actions → Secrets**. Add a secret named **CARDTRADER_API_TOKEN** containing your token.
3. In **Settings → Secrets and variables → Actions → Variables**, add **CARDTRADER_MARKET_API_APPROVED** with value **true**, only when you have the required permission.
4. Run **Actions → Daily MTG prices and Pages → Run workflow** to populate observed UK offer prices. It will then repeat daily.

The adapter scans Magic expansions and joins unambiguous CardTrader blueprint IDs to Cardmarket printing IDs. It rejects offers unless the seller is in GB, the card is English, the offer is in stock, ungraded, unbundled and not on vacation. It tracks the lowest observed regular and foil offers separately. CardTrader only returns **up to 25 cheapest global listings for each blueprint**; a more expensive UK seller can be absent. So these are **lowest observed UK English offers**, not guaranteed lowest prices across the whole UK. EUR offers converted to GBP use the daily reference rate and may differ from checkout totals; shipping and fees are not included.

The adapter never contacts CardTrader unless BOTH the API token and permission flag are supplied. Without them the Cardmarket EU reference snapshots continue as usual, while the separately approved CSV feed remains an alternative. Provider documentation: https://www.cardtrader.com/en-US/docs/api/full/reference ; marketplace API terms: https://static.cardtrader.com/en/pages/terms-of-service.html .

## Files

| Path | Purpose |
| --- | --- |
| `index.html`, `assets/main.js` | Search cards by name; display printings with UK quote or EU reference |
| `card.html?id=PRODUCT_ID`, `assets/card.js` | Stable individual printing page with UK/EU prices and interactive history chart |
| `scripts/update_prices.py` | Source downloads, validation, currency conversion metadata, UK feed filtering and history storage |
| `scripts/cardtrader_uk.py` | Opt-in approved CardTrader UK English marketplace listing importer |
| `data/catalog.json` | Searchable catalogue: `[id, name, expansion, number, rarity]` |
| `data/latest.json` | Product ID → `[eu_low, eu_foil_low, eu_trend, eu_foil_trend, uk_low, uk_foil_low]` |
| `data/meta.json` | Source dates, statistics, FX rate, history month manifest |
| `data/uk_links.json` | Lowest qualifying UK offer attribution and links |
| `data/history/YYYY-MM/NN.json` | One month and one of 32 product-ID shards, daily points indexed by product |
| `.github/workflows/daily-prices.yml` | Daily GitHub Actions importer and website deployment |

All stored money values are **integer cents/pence**. Historical point array: `[day_of_month, eu_low, eu_foil_low, eu_trend, eu_foil_trend, uk_low, uk_foil_low, eur_gbp_in_millionths]`. This layout makes individual card histories efficient to load without generating hundreds of thousands of separate HTML files. Each card has a unique URL with its own content.

## Data sources

- Cardmarket official publicly downloadable [product catalogue and price guide](https://news.cardmarket.com/en/Magic/were-making-the-price-guide-and-product-catalogue-available-for-download)
- [Frankfurter](https://frankfurter.dev/) for indicative EUR/GBP reference exchange rates (not shop exchange rates)

MTG and Magic: The Gathering are trademarks of Wizards of the Coast. This site is independent and unaffiliated.
