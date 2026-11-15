"use strict";
const $ = id => document.getElementById(id);
let catalogue = [], prices = {}, meta = {};
const money = (n, currency = "GBP") => n == null ? "—" :
  new Intl.NumberFormat("en-GB", {style:"currency", currency, maximumFractionDigits:2}).format(n / 100);
function euGBP(c) {
  return c == null || !meta.eur_to_gbp ? null : Math.round(c * meta.eur_to_gbp);
}
const norm = s => String(s || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
async function read(path) {
  const r = await fetch(path);
  if (!r.ok) throw Error("Unable to load " + path + " (" + r.status + ")");
  return r.json();
}
function quote(p, market) {
  const indexes = market === "uk" ? [4, 5] : [0, 1];
  const possibilities = indexes.map((i, k) => ({
    value: p[i],
    finish: k ? "foil" : "regular"
  })).filter(item => typeof item.value === "number" && Number.isFinite(item.value) && item.value > 0);
  possibilities.sort((a, b) => a.value - b.value || a.finish.localeCompare(b.finish));
  return possibilities[0] || null;
}
function rank(card, market) {
  const option = quote(prices[String(card[0])] || [], market);
  return option ? option.value : Number.POSITIVE_INFINITY;
}
function byPrice(market) {
  return (a, b) => {
    const diff = rank(a, market) - rank(b, market);
    if (!Number.isNaN(diff) && diff !== 0) return diff;
    return a[1].localeCompare(b[1]) || a[2].localeCompare(b[2]) || a[0] - b[0];
  };
}
function addResult(card, container, sort) {
  const id = String(card[0]), p = prices[id] || [];
  const eu = quote(p, "eu"), uk = quote(p, "uk");
  const displayUK = (sort === "uk" || sort === "relevance") && uk !== null;
  const chosen = displayUK ? uk : (eu || uk);
  const a = document.createElement("a");
  a.className = "result";
  a.href = "card.html?id=" + encodeURIComponent(id);
  const title = document.createElement("strong");
  title.textContent = card[1];
  const sub = document.createElement("small");
  sub.textContent = [card[2], card[3] ? "#" + card[3] : "", card[4]].filter(Boolean).join(" · ");
  const line = document.createElement("div");
  line.className = "price-line";
  const label = document.createElement("span"), value = document.createElement("b");
  if (!chosen) {
    label.textContent = "No current price";
    value.textContent = "—";
  } else if (displayUK || (uk && !eu)) {
    label.textContent = "UK English offer · " + chosen.finish;
    value.textContent = money(chosen.value);
    value.className = "positive";
  } else {
    label.textContent = "EU guide low · " + chosen.finish;
    value.textContent = meta.eur_to_gbp ? money(euGBP(chosen.value)) + " ≈" : money(chosen.value, "EUR");
  }
  line.append(label, value);
  a.append(title, sub, line);
  // Show both sources where possible, but never treat the EU quote as a UK seller price.
  if (uk && !displayUK) {
    const secondary = document.createElement("div");
    secondary.className = "price-line";
    secondary.style.marginTop = "4px";
    const cap = document.createElement("span"), v = document.createElement("b");
    cap.textContent = "UK English · " + uk.finish;
    v.textContent = money(uk.value);
    v.className = "positive";
    secondary.append(cap, v);
    a.append(secondary);
  }
  if (eu && displayUK) {
    const secondary = document.createElement("div");
    secondary.className = "price-line";
    secondary.style.marginTop = "4px";
    const cap = document.createElement("span"), v = document.createElement("b");
    cap.textContent = "EU guide low · " + eu.finish;
    v.textContent = meta.eur_to_gbp ? money(euGBP(eu.value)) + " ≈" : money(eu.value, "EUR");
    secondary.append(cap, v);
    a.append(secondary);
  }
  const wrap=document.createElement("div");wrap.className="result-wrap";
  const live=document.createElement("a");live.className="market-link";live.target="_blank";live.rel="noopener noreferrer";
  live.href="https://www.cardmarket.com/en/Magic/Products?idProduct="+encodeURIComponent(id)+"&language=1&sellerCountry=13";
  live.textContent="View live English / UK seller offers ↗";
  live.setAttribute("aria-label","View English copies from UK sellers for "+card[1]+" on Cardmarket");
  wrap.append(a,live);container.appendChild(wrap);
}
function display() {
  const q = norm($("search").value.trim());
  $("result-title").textContent = q ? "Matching printings" : "Search the catalogue";
  const root = $("results");
  root.replaceChildren();
  $("more").textContent = "";
  if (!q) {
    const el = document.createElement("div");
    el.className = "empty";
    el.textContent = "Search to compare all printings cheapest first, then view filtered UK-English offers.";
    root.appendChild(el);
    return;
  }
  const words = q.split(/\s+/).filter(Boolean), onlyUK = false;
  let found = catalogue.filter(c => {
    const n = norm(c[1]);
    return words.every(w => n.includes(w)) &&
      (!onlyUK || quote(prices[String(c[0])] || [], "uk") !== null);
  });
  let sort = $("sort").value;
  if (onlyUK && sort === "eu") sort = "uk";
  if (sort === "eu" || sort === "uk") found.sort(byPrice(sort));
  else if (sort === "name") found.sort((a, b) => a[1].localeCompare(b[1]) || a[2].localeCompare(b[2]));
  else {
    found.sort((a, b) => {
      const x = norm(a[1]), y = norm(b[1]);
      return Number(y === q) - Number(x === q) ||
        Number(y.startsWith(q)) - Number(x.startsWith(q)) ||
        x.length - y.length || a[2].localeCompare(b[2]);
    });
  }
  const cap = 80, frag = document.createDocumentFragment();
  for (const card of found.slice(0, cap)) addResult(card, frag, sort);
  if (found.length) root.appendChild(frag);
  else {
    const el = document.createElement("div");
    el.className = "empty";
    el.textContent = onlyUK
      ? "No verified English-language UK seller offers matched. Untick UK quotes only to compare European guide prices."
      : "No matching cards found.";
    root.appendChild(el);
  }
  const suffix = sort === "eu" ? "Sorted by Europe-wide guide prices, including foil where cheaper. UK-English offers are shown live on Cardmarket."
    : sort === "uk" ? "UK quotes first, cheapest to most expensive. Missing UK quotes appear last."
    : "";
  $("more").textContent = found.length > cap
    ? "Showing " + cap + " of " + found.length.toLocaleString("en-GB") +
      " printings. " + suffix
    : found.length.toLocaleString("en-GB") + " matching printing(s). " + suffix;
}
(async () => {
  try {
    [meta, catalogue, prices] = await Promise.all([
      read("data/meta.json"), read("data/catalog.json"), read("data/latest.json")
    ]);
    $("status").textContent = "Daily guide: " + meta.source_date +
      " · GBP values are EU guide estimates; live UK-English offers open on Cardmarket";
    $("count").textContent = catalogue.length.toLocaleString("en-GB") + " printings";
    const q = new URLSearchParams(location.search).get("q");
    if (q) $("search").value = q;
    display();
    let timer;
    $("search").addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(display, 130);
    });
    $("sort").addEventListener("change", display);
    document.addEventListener("keydown", e => {
      if (e.key === "/" && !["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) {
        e.preventDefault();
        $("search").focus();
      }
    });
  } catch (e) {
    $("status").textContent = "The daily price database is currently unavailable.";
    const el = document.createElement("div");
    el.className = "empty";
    el.textContent = "Could not load the database. Check the latest GitHub Actions run.";
    $("results").replaceChildren(el);
    console.error(e);
  }
})();
