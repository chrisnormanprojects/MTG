"use strict";
const $=id=>document.getElementById(id);
let catalogue=[], prices={}, meta={};
const money=(n,c="GBP")=>n==null?"—":new Intl.NumberFormat("en-GB",{style:"currency",currency:c,maximumFractionDigits:2}).format(n/100);
function euGBP(c){return c==null||!meta.eur_to_gbp?null:Math.round(c*meta.eur_to_gbp)}
const norm=s=>String(s||"").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"");
async function read(path){const r=await fetch(path);if(!r.ok)throw Error("Unable to load "+path+" ("+r.status+")");return r.json()}
function addResult(card,container){const id=String(card[0]), p=prices[id]||[], gb=p[4], eur=euGBP(p[0]);const a=document.createElement("a");a.className="result";a.href="card.html?id="+encodeURIComponent(id);
const title=document.createElement("strong");title.textContent=card[1];const sub=document.createElement("small");sub.textContent=[card[2],card[3]?"#"+card[3]:"",card[4]].filter(Boolean).join(" · ");
const line=document.createElement("div");line.className="price-line";const label=document.createElement("span");label.textContent=gb!=null?"UK English offer": "EU low ≈ GBP";const value=document.createElement("b");value.textContent=money(gb!=null?gb:eur);if(gb!=null)value.className="positive";line.append(label,value);
a.append(title,sub,line);container.appendChild(a)}
function display(){
 const q=norm($("search").value.trim());$("result-title").textContent=q?"Matching printings":"Search the catalogue";
 const root=$("results");root.replaceChildren();$("more").textContent="";
 if(!q){const el=document.createElement("div");el.className="empty";el.textContent="Type a card name to find its individual printings and price history.";root.appendChild(el);return}
 const words=q.split(/\s+/).filter(Boolean);
 const onlyUK=$("uk-only").checked;
 let found=catalogue.filter(c=>{const n=norm(c[1]);return words.every(w=>n.includes(w))&&(!onlyUK||(prices[String(c[0])]||[]).slice(4,6).some(x=>x!=null))});
 const sort=$("sort").value;
 if(sort==="eu"){found.sort((a,b)=>((prices[String(a[0])]||[])[0]??1e15)-((prices[String(b[0])]||[])[0]??1e15)||a[1].localeCompare(b[1]))}
 else if(sort==="name"){found.sort((a,b)=>a[1].localeCompare(b[1])||a[2].localeCompare(b[2]))}
 else{found.sort((a,b)=>{let x=norm(a[1]),y=norm(b[1]);return Number(y===q)-Number(x===q)||Number(y.startsWith(q))-Number(x.startsWith(q))||x.length-y.length||a[2].localeCompare(b[2])})}
 const cap=80;const fragment=document.createDocumentFragment();for(const card of found.slice(0,cap))addResult(card,fragment);
 if(found.length)root.appendChild(fragment);else{const el=document.createElement("div");el.className="empty";el.textContent=onlyUK?"No verified UK offers matched. Uncheck ‘UK quotes only’ to see EU reference prices.":"No matching cards found.";root.appendChild(el)}
 $("more").textContent=found.length>cap?`Showing the first ${cap} of ${found.length.toLocaleString("en-GB")} printings. Add the set name to narrow your search.`:`${found.length.toLocaleString("en-GB")} matching printing(s).`;
}
(async()=>{try{[meta,catalogue,prices]=await Promise.all([read("data/meta.json"),read("data/catalog.json"),read("data/latest.json")]);$("status").textContent="Cardmarket guide: "+meta.source_date+" · EU reference only unless a verified UK offer is shown";$("count").textContent=catalogue.length.toLocaleString("en-GB")+" printings";
 const q=new URLSearchParams(location.search).get("q");if(q)$("search").value=q;display();
 let clock; $("search").addEventListener("input",()=>{clearTimeout(clock);clock=setTimeout(display,130)});$("sort").addEventListener("change",display);$("uk-only").addEventListener("change",display);document.addEventListener("keydown",e=>{if(e.key==="/"&&!["INPUT","TEXTAREA"].includes(document.activeElement.tagName)){e.preventDefault();$("search").focus()}});
}catch(e){$("status").textContent="The first daily import has not populated the database yet.";$("results").innerHTML='<div class="empty">The first price import is pending. Check the GitHub Actions run in the repository.</div>';console.error(e)}})();
