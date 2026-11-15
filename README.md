# MTG Price Radar

Search Magic: The Gathering card printings by name, ordered **cheapest to most expensive** using Cardmarket's Europe-wide daily price guide. Open individual printing pages with day-by-day price-history charts.

**Website:** https://chrisnormanprojects.github.io/MTG/

## UK English filter — without another API

On each search result and each printing page, select **View live English / UK seller offers**. This opens the *specific printing* directly on Cardmarket with:
- `language=1` — English card language
- `sellerCountry=13` — United Kingdom seller location
- `idProduct=<id>` — the selected printing's Cardmarket product ID

Example: https://www.cardmarket.com/en/Magic/Products?idProduct=366857&language=1&sellerCountry=13

Cardmarket officially documents its stable product-ID redirects and appended filters: https://insight.cardmarket.com/en/Articles/scryfall-x-cardmarket

The CardTrader integration has been removed; no API credentials are necessary for these direct links. The **filtered UK-English listing prices are viewed live on Cardmarket**, not automatically imported into this site's own database.

## Accuracy and price comparison

Cardmarket's **public daily downloadable price guide** is a Europe-wide aggregate. It has no row-level seller country, card language, condition or shipping cost, and therefore **cannot be filtered into a genuine UK-only English-card price history**. Search results are sorted by the lowest European guide price (either regular or foil), and **all search, printing and history prices on this website are shown in GBP (£)** using the reference rate for each day. These are approximate EUR-to-GBP conversions, **not** UK seller quotations. If the live FX service is unavailable, the importer uses the last valid rate and clearly marks it as older. Without any valid rate, it refuses to publish an update rather than switching back to euros. Clicking through to Cardmarket gives the live filtered offers; sorting on our site does **not** rank those offers.

The importer still allows an optional independently authorised CSV offer feed (data/uk_offers.csv or the UK_OFFERS_CSV_URL secret). None is currently connected and the public UI does not claim UK-only prices in its chart.

## Daily updates

The GitHub Actions workflow at `.github/workflows/daily-prices.yml` is scheduled daily at **06:23 UTC** and can be started manually. It imports the official Cardmarket product catalogue and price guide, a Frankfurter EUR/GBP reference exchange rate, stores per-printing observations as compact monthly shards under `data/history/`, commits the new data and deploys GitHub Pages.

The database history starts from the first successful import; no earlier prices are fabricated.

### Sources
- Official Cardmarket product catalogue: https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_1.json
- Official Cardmarket daily price guide: https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_1.json
- Frankfurter FX rate: https://api.frankfurter.dev/v2/rate/eur/gbp

This is an independent project, unaffiliated with Cardmarket or Wizards of the Coast.
