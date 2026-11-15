"use strict";
const $=id=>document.getElementById(id);
const norm=s=>String(s||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").trim().toLocaleLowerCase("en-GB");
const money=(n,c="GBP")=>new Intl.NumberFormat("en-GB",{style:"currency",currency:c,maximumFractionDigits:2}).format(n/100);
let catalogue=[],prices={},meta={},names=[],printings=new Map(),searchNames=[],chosen=null;
let suggestions=[],highlighted=-1,shown=0,currentResults=[];
const STEP=50;
async function read(path){const r=await fetch(path);if(!r.ok)throw Error(path+" ("+r.status+")");return r.json()}
function euQuote(id){
 const p=prices[String(id)]||[];
 return [{value:p[0],finish:"Regular"},{value:p[1],finish:"Foil"}]
  .filter(x=>typeof x.value==="number"&&Number.isFinite(x.value)&&x.value>0)
  .sort((a,b)=>a.value-b.value)[0]||null;
}
function euroRank(card){return euQuote(card[0])?.value??Number.POSITIVE_INFINITY}
function marketplace(id){return "https://www.cardmarket.com/en/Magic/Products?idProduct="+encodeURIComponent(String(id))+"&language=1&sellerCountry=13"}
function make(tag,className,text){const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el}
function indexCards(){
 const original=new Map();
 for(const card of catalogue){
  const key=norm(card[1]);
  if(!original.has(key))original.set(key,{name:card[1],key,items:[]});
  original.get(key).items.push(card);
 }
 names=Array.from(original.values()).sort((a,b)=>a.name.localeCompare(b.name,"en-GB"));
 printings=original;
 searchNames=names.map(x=>({...x,words:x.key.split(/[\s,\/\-]+/)}));
}
function matches(q){
 if(!q)return [];
 const prefix=[],words=[],contains=[];
 // Each unique name occurs just once. Prefix matches are shown first.
 for(const item of searchNames){
  if(item.key.startsWith(q))prefix.push(item);
  else if(item.words.some(w=>w.startsWith(q)))words.push(item);
  else if(item.key.includes(q))contains.push(item);
 }
 return prefix.concat(words,contains).slice(0,9);
}
function closeSuggestions(){
 $("suggestions").hidden=true;
 $("suggestions").replaceChildren();
 $("search").setAttribute("aria-expanded","false");
 $("search").removeAttribute("aria-activedescendant");
 suggestions=[];highlighted=-1;
}
function highlight(index){
 highlighted=index;
 const options=$("suggestions").querySelectorAll('[role="option"]');
 options.forEach((el,i)=>{el.classList.toggle("is-active",i===index);el.setAttribute("aria-selected",i===index?"true":"false")});
 if(index<0)$("search").removeAttribute("aria-activedescendant");
 else{
  $("search").setAttribute("aria-activedescendant","choice-"+index);
  options[index]?.scrollIntoView({block:"nearest"});
 }
}
function drawSuggestions(){
 const q=norm($("search").value);
 suggestions=matches(q);highlighted=-1;
 const panel=$("suggestions");panel.replaceChildren();
 if(!q||!suggestions.length){closeSuggestions();return}
 suggestions.forEach((entry,i)=>{
  const b=make("button","suggestion",entry.name);
  b.type="button";b.id="choice-"+i;b.setAttribute("role","option");b.setAttribute("aria-selected","false");
  b.addEventListener("pointerdown",e=>e.preventDefault());
  b.addEventListener("click",()=>selectCard(entry));
  panel.appendChild(b);
 });
 panel.hidden=false;$("search").setAttribute("aria-expanded","true");
}
function selectCard(entry){
 chosen=entry;$("search").value=entry.name;closeSuggestions();
 const url=new URL(window.location.href);url.searchParams.set("q",entry.name);
 history.replaceState(null,"",url.pathname+url.search+url.hash);
 showTable();
}
function resetSearch(){
 chosen=null;currentResults=[];shown=0;
 $("result-title").textContent="Choose a card";
 $("result-count").textContent=$("search").value.trim()?"Select a suggestion to see its printings.":"Select a suggested name to see the printings.";
 $("results").replaceChildren(make("p","table-empty",$("search").value.trim()?"Choose a card name from the dropdown above.":"Your results will appear here."));
 $("load-more").hidden=true;
}
function sortedPrintings(entry){
 const rows=[...entry.items],sort=$("sort").value;
 if(sort==="set")rows.sort((a,b)=>a[2].localeCompare(b[2],"en-GB")||String(a[3]).localeCompare(String(b[3]))||a[0]-b[0]);
 else rows.sort((a,b)=>{const x=euroRank(a),y=euroRank(b);if(!Number.isFinite(x)||!Number.isFinite(y)){if(!Number.isFinite(x)&&!Number.isFinite(y))return a[2].localeCompare(b[2],"en-GB");return Number.isFinite(x)?-1:1}return (sort==="high"?y-x:x-y)||a[2].localeCompare(b[2],"en-GB")||a[0]-b[0]});
 return rows;
}
function newTable(){
 const table=make("table","price-table");table.setAttribute("aria-label",chosen.name+" printings and European guide prices");
 const thead=document.createElement("thead"),row=document.createElement("tr");
 for(const [title,cls] of [["Printing","col-print"],["Guide price","col-price"],["UK sellers","col-uk"]]){
  const th=make("th",cls,title);th.scope="col";row.appendChild(th);
 }
 thead.appendChild(row);table.appendChild(thead);
 const tbody=document.createElement("tbody");tbody.id="result-body";table.appendChild(tbody);return table;
}
function addRows(){
 const tbody=$("result-body");if(!tbody)return;
 const end=Math.min(shown+STEP,currentResults.length),fragment=document.createDocumentFragment();
 for(let i=shown;i<end;i++){
  const c=currentResults[i],id=c[0],q=euQuote(id);
  const tr=document.createElement("tr");
  const setTd=document.createElement("td");
  const detail=make("a","printing-name",c[2]||"Unknown set");detail.href="card.html?id="+encodeURIComponent(String(id));detail.setAttribute("aria-label","View price history for "+chosen.name+", "+(c[2]||"unknown set"));
  setTd.appendChild(detail);
  if(c[3])setTd.appendChild(make("span","printing-number","#"+c[3]));
  const priceTd=make("td","amount");
  if(q){
   priceTd.appendChild(make("strong","price-value",meta.eur_to_gbp?money(Math.round(q.value*meta.eur_to_gbp))+" ≈":money(q.value,"EUR")));
   priceTd.appendChild(make("span","finish-label",q.finish));
  }else priceTd.appendChild(make("span","no-price","—"));
  const marketTd=document.createElement("td");marketTd.className="uk-cell";
  const uk=make("a","uk-compact","UK offers ↗");
  uk.href=marketplace(id);uk.target="_blank";uk.rel="noopener noreferrer";
  uk.setAttribute("aria-label","View English copies from UK sellers of "+chosen.name+" in "+c[2]+" on Cardmarket");
  marketTd.appendChild(uk);
  tr.append(setTd,priceTd,marketTd);fragment.appendChild(tr);
 }
 tbody.append(fragment);shown=end;
 $("load-more").hidden=shown>=currentResults.length;
 $("load-more").textContent="Show more printings ("+(currentResults.length-shown)+" remaining)";
}
function showTable(){
 if(!chosen){resetSearch();return}
 currentResults=sortedPrintings(chosen);shown=0;
 $("result-title").textContent=chosen.name;
 $("result-count").textContent=currentResults.length.toLocaleString("en-GB")+" printings · "+({low:"cheapest first",high:"most expensive first",set:"set name A–Z"}[$("sort").value]||"cheapest first");
 $("results").replaceChildren(newTable());addRows();
}
function onInput(){
 const key=norm($("search").value);
 const exact=printings.get(key);
 if(exact){chosen=exact;showTable()}else resetSearch();
 if(!key){
  closeSuggestions();
  const url=new URL(window.location.href);url.searchParams.delete("q");history.replaceState(null,"",url.pathname+url.search+url.hash);
  return;
 }
 drawSuggestions();
}
(async()=>{
 try{
  [meta,catalogue,prices]=await Promise.all([read("data/meta.json"),read("data/catalog.json"),read("data/latest.json")]);
  indexCards();
  $("status").textContent="Guide: "+meta.source_date+" · approximate GBP";
  $("count").textContent=names.length.toLocaleString("en-GB")+" card names";
  const initial=new URLSearchParams(location.search).get("q");
  if(initial){$("search").value=initial;const item=printings.get(norm(initial));if(item){chosen=item;showTable()}else{resetSearch();drawSuggestions()}}
  else resetSearch();
  $("search").addEventListener("input",onInput);
  $("search").addEventListener("focus",()=>{if($("search").value&&!chosen)drawSuggestions()});
  $("search").addEventListener("keydown",e=>{
   if(e.key==="ArrowDown"||e.key==="ArrowUp"){
    if($("suggestions").hidden)drawSuggestions();
    if(!suggestions.length)return;
    e.preventDefault();highlight((highlighted+(e.key==="ArrowDown"?1:suggestions.length-1))%suggestions.length);
   }else if(e.key==="Enter"){
    if(!suggestions.length)return;
    e.preventDefault();selectCard(suggestions[highlighted>=0?highlighted:0]);
   }else if(e.key==="Escape"){closeSuggestions();$("search").blur()}
  });
  $("sort").addEventListener("change",()=>{if(chosen)showTable()});
  $("load-more").addEventListener("click",addRows);
  document.addEventListener("pointerdown",e=>{if(!e.target.closest(".search-combo"))closeSuggestions()});
  document.addEventListener("keydown",e=>{if(e.key==="/"&&!["INPUT","TEXTAREA"].includes(document.activeElement.tagName)){e.preventDefault();$("search").focus()}});
 }catch(e){
  $("status").textContent="The price database could not be loaded.";
  $("results").replaceChildren(make("p","table-empty","Please check the latest GitHub Actions import."));
  console.error(e);
 }
})();
