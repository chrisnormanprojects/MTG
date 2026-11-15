"use strict";
const $ = id => document.getElementById(id);
const money = (minor, currency="GBP") => minor == null ? "—" :
  new Intl.NumberFormat("en-GB", {style:"currency",currency,maximumFractionDigits:2}).format(minor/100);
const ns = "http://www.w3.org/2000/svg";
async function read(url) {const r=await fetch(url);if(!r.ok)throw Error(url+" "+r.status);return r.json()}
function svgEl(name, attrs={}) {const el=document.createElementNS(ns,name);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,String(v));return el}
let meta, card, prices, history=[], details={};
let currency="GBP";
const seriesInfo={
  eu:{index:1,label:"European low",uk:false},
  foil:{index:2,label:"European foil low",uk:false},
  trend:{index:3,label:"European trend",uk:false},
  uk:{index:5,label:"Verified English UK offer",uk:true},
  ukfoil:{index:6,label:"Verified English UK foil offer",uk:true}
};
function fmtPrice(n){return money(n,currency)}
function renderChart(){
  const config=seriesInfo[$("series").value], range=$("range").value;
  const end=new Date(meta.source_date+"T00:00:00Z");
  const days=range==="all"?Number.MAX_SAFE_INTEGER:Number(range);
  const from=new Date(end.getTime()-(days-1)*86400000);
  const converted=history.filter(p=>{
    const d=new Date(p.date+"T00:00:00Z");
    return d>=from&&d<=end;
  }).map(p=>{
    let n=p.values[config.index];
    if(n==null)return null;
    if(!config.uk&&currency==="GBP"){
      const rate=p.values[7];
      if(rate==null)return null;
      n=Math.round(n*rate/1000000);
    }
    return {date:p.date,value:n};
  }).filter(Boolean).sort((a,b)=>a.date.localeCompare(b.date));
  const container=$("chart");container.replaceChildren();
  if(!converted.length){container.classList.add("empty");container.textContent=config.uk?
    "No verified UK price history yet. Connect a licensed UK seller feed to start tracking real UK prices.":
    "No daily observations for this range yet. History begins with the first import.";
    $("chart-subtitle").textContent=config.label;$("axis-note").textContent="";return}
  container.classList.remove("empty");
  const lo=Math.min(...converted.map(x=>x.value)),hi=Math.max(...converted.map(x=>x.value));
  const span=Math.max(1,hi-lo), min=Math.max(0,lo-span*.16),max=hi+span*.16;
  const width=920,height=330,left=72,right=21,top=21,bottom=53;
  const x0=left,x1=width-right,y0=top,y1=height-bottom;
  const start=new Date(converted[0].date+"T00:00:00Z").getTime();
  const finish=new Date(converted[converted.length-1].date+"T00:00:00Z").getTime();
  const xp=day=>x0+(new Date(day+"T00:00:00Z").getTime()-start)/Math.max(1,finish-start)*(x1-x0);
  const yp=v=>y1-(v-min)/(max-min)*(y1-y0);
  const svg=svgEl("svg",{viewBox:"0 0 920 330",role:"img","aria-label":config.label+" price history"});
  for(let k=0;k<=4;k++){
    const v=min+(max-min)*k/4,y=yp(v);
    svg.append(svgEl("line",{x1:x0,y1:y,x2:x1,y2:y,stroke:"#304159","stroke-width":1}));
    const t=svgEl("text",{x:x0-11,y:y+4,"text-anchor":"end",fill:"#a2b2c9","font-size":12});t.textContent=fmtPrice(Math.round(v));svg.append(t);
  }
  const labelFormat=s=>new Date(s+"T00:00:00Z").toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"2-digit",timeZone:"UTC"});
  const ticks=[converted[0],converted[Math.floor((converted.length-1)/2)],converted[converted.length-1]];
  for(const p of ticks){const t=svgEl("text",{x:xp(p.date),y:height-19,"text-anchor":"middle",fill:"#a2b2c9","font-size":12});t.textContent=labelFormat(p.date);svg.append(t)}
  let path="",last=null;
  for(const p of converted){
    const x=xp(p.date).toFixed(2),y=yp(p.value).toFixed(2);
    const gap=last&&(new Date(p.date+"T00:00:00Z")-new Date(last+"T00:00:00Z"))>86400000*1.5;
    path+=(last&&!gap?" L":" M")+x+" "+y;last=p.date;
  }
  svg.append(svgEl("path",{d:path,fill:"none",stroke:config.uk?"#66e6c3":"#7ab8fc","stroke-width":3,"stroke-linecap":"round","stroke-linejoin":"round"}));
  const jump=Math.max(1,Math.ceil(converted.length/100));
  for(let i=0;i<converted.length;i+=jump){
    const p=converted[i],circle=svgEl("circle",{cx:xp(p.date),cy:yp(p.value),r:3,fill:config.uk?"#66e6c3":"#7ab8fc"});
    const title=svgEl("title");title.textContent=p.date+": "+fmtPrice(p.value);circle.append(title);svg.append(circle);
  }
  const endP=converted[converted.length-1];
  svg.append(svgEl("circle",{cx:xp(endP.date),cy:yp(endP.value),r:5,fill:"#f2f6ff"}));
  container.append(svg);
  $("chart-subtitle").textContent=config.label+" · "+converted.length+" daily observations · "+fmtPrice(endP.value)+" on "+endP.date;
  $("axis-note").textContent=config.uk?"Actual quoted GBP price from a verified GB seller, excluding postage.":"Europe-wide reference price in "+currency+(currency==="GBP"?" converted at each day's reference EUR/GBP rate.":" (GBP FX data unavailable).");
}
function updateHeadline(){
 const uk=prices[4],low=prices[0],trend=prices[2],rate=meta.eur_to_gbp;
 $("uk-price").textContent=money(uk);
 $("uk-note").textContent=uk!=null?"Lowest available English-language offer from a GB seller. Postage not included.":"No verified English/UK seller source connected for this printing.";
 const normal=details.normal||{};
 const buy=$("uk-buy");buy.hidden=!(uk!=null&&normal.url);if(normal.url){buy.href=normal.url;buy.textContent="View "+(normal.seller||"UK seller")+" offer ↗"}
 const euShow=n=>n==null?"—":rate?money(Math.round(n*rate))+" approx.":money(n,"EUR");
 $("eu-price").textContent=euShow(low);
 $("trend-price").textContent=euShow(trend);
 $("eu-note").textContent=low==null?"No EU low-price observation available.":rate?"Converted from "+money(low,"EUR")+" at EUR/GBP "+rate+"; NOT a UK offer.":"EU-wide lowest ask; listing language and seller country not filtered.";
}
(async()=>{
 try{
 const id=new URLSearchParams(location.search).get("id");
 if(!id||!/^\d+$/.test(id))throw Error("Invalid card ID.");
 [meta]=await Promise.all([read("data/meta.json")]);
 const [catalog,latest,links]=await Promise.all([read("data/catalog.json"),read("data/latest.json"),read("data/uk_links.json")]);
 card=catalog.find(c=>String(c[0])===id);
 if(!card)throw Error("This printing was not found in the database.");
 prices=latest[id]||[null,null,null,null,null,null];details=links[id]||{};
 $("card-name").textContent=card[1];document.title=card[1]+" — MTG Price Radar";
 $("printing").textContent=[card[2],card[3]?"Collector #"+card[3]:"",card[4]].filter(Boolean).join(" · ");
 $("details").textContent="Cardmarket product #"+card[0]+" · "+card[2]+(card[3]?" · collector #"+card[3]:"")+(card[4]?" · "+card[4]:"");
 $("marketplace-link").href="https://www.cardmarket.com/en/Magic/Products/Search?searchString="+encodeURIComponent(card[1]);
 $("freshness").textContent="Cardmarket reference: "+meta.source_date+". Imported: "+new Date(meta.updated_at).toLocaleString("en-GB")+". GBP reference FX: "+(meta.fx_date||"not available")+". UK quotes recorded: "+(meta.verified_uk_offers||0)+".";
 currency=meta.eur_to_gbp?"GBP":"EUR";
 updateHeadline();
 const shard=String(Number(id)%meta.shards).padStart(2,"0");
 const months=meta.months||[];
 let failures=0;
 const results=await Promise.all(months.map(async month=>{
   try{const file=await read("data/history/"+month+"/"+shard+".json");return (file.cards||{})[id]||[]}
   catch(e){failures++;return []}
 }));
 history=results.flatMap((rows,i)=>rows.map(values=>({date:months[i]+"-"+String(values[0]).padStart(2,"0"),values})));
 $("series").addEventListener("change",renderChart);$("range").addEventListener("change",renderChart);
 renderChart();
 if(failures)$("freshness").textContent+=" Some history shards could not be loaded.";
 }catch(e){$("card-name").textContent="Card unavailable";$("printing").textContent=e.message;
 $("chart-subtitle").textContent="Database unavailable. Check the daily import in GitHub Actions.";console.error(e)}
})();
