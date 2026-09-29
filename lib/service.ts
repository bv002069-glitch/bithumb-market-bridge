import { candles,market,markets,ticker,tickers } from "./bithumb";
import { atr,canonicalVwap,ema,ma,pct,quality,rr,rsi,sameHourVolumeRatio,structureProxy,volumeRatio,type Candle } from "./metrics";

const closed=(c:Candle[])=>c.filter(x=>x.closed);

function summary(c:Candle[]){
  const x=closed(c),p=x.map(v=>v.trade_price),a=atr(x),last=x.at(-1);
  const current=c.at(-1)?.closed===false?c.at(-1):null;
  return {
    last_closed:last?.candle_date_time_kst??null,
    open:last?.opening_price??null,
    high:last?.high_price??null,
    low:last?.low_price??null,
    close:last?.trade_price??null,
    closed:last?true:null,
    ma7:ma(p,7), ma14:ma(p,14), ma20:ma(p,20), ma30:ma(p,30), ma60:ma(p,60), ma90:ma(p,90),
    ema20:ema(p,20), ema50:ema(p,50),
    rsi14:rsi(p), atr14:a,
    atr_move:last&&a?pct(last.trade_price,last.opening_price)!/(a/last.opening_price*100):null,
    volume:last?.candle_acc_trade_volume??null,
    trade_value:last?.candle_acc_trade_price??null,
    volume_ratio_20:volumeRatio(x),
    structure_proxy:structureProxy(x),
    current_candle:current?{
      time:current.candle_date_time_kst,
      open:current.opening_price, high:current.high_price, low:current.low_price, close:current.trade_price,
      volume:current.candle_acc_trade_volume, trade_value:current.candle_acc_trade_price, closed:false
    }:null,
    quality:quality(x,60)
  };
}

function ret(c:Candle[],n:number){
  const x=closed(c);
  return x.length>n?pct(x.at(-1)!.trade_price,x.at(-(n+1))!.trade_price):null;
}

function qualityGate(t:any,frames:Record<string,any>){
  const issues:string[]=[],frame_age_ms:Record<string,number|null>={};
  const maxAge:Record<string,number>={day:50*3600000,h4:9*3600000,h1:150*60000,m10:25*60000};
  let status:"PASS"|"WARN"|"FAIL"="PASS";
  for(const [name,f] of Object.entries(frames)){
    const q=f?.quality;
    if(q?.status==="FAIL"){ status="FAIL"; issues.push(`${name}:FAIL:${(q.issues??[]).join(",")||"unknown"}`); }
    else if(q?.status==="WARN"&&status!=="FAIL"){ status="WARN"; issues.push(`${name}:WARN:${(q.issues??[]).join(",")||"unknown"}`); }
    const lc=f?.last_closed,age=lc?Math.max(0,Date.now()-new Date(lc+"+09:00").getTime()):null;
    frame_age_ms[name]=age;
    if(age===null){ if(status==="PASS") status="WARN"; issues.push(`${name}:last_closed_missing`); }
    else if(maxAge[name]&&age>maxAge[name]){ status="FAIL"; issues.push(`${name}:stale`); }
  }
  const ts=Number(t?.timestamp??t?.trade_timestamp??0);
  const ticker_age_ms=ts?Math.max(0,Date.now()-ts):null;
  if(!ts){ if(status==="PASS") status="WARN"; issues.push("ticker_timestamp_missing"); }
  else if(ticker_age_ms!>300000){ status="FAIL"; issues.push("ticker_stale_gt_5m"); }
  return {status,usable_for_decision:status==="PASS",ticker_age_ms,frame_age_ms,issues};
}

function combinedQuality(...qs:any[]){
  const hasFail=qs.some(q=>q?.status==="FAIL"),hasWarn=qs.some(q=>q?.status==="WARN");
  return {status:hasFail?"FAIL":hasWarn?"WARN":"PASS",usable_for_scan:!hasFail};
}

export async function snapshot(symbol:string,plannedEntry?:number,stop?:number,target?:number){
  const m=market(symbol);
  const [t,d,h4,h1,m10,btc4,btc1]=await Promise.all([
    ticker(m),
    candles(m,"1d",120),
    candles(m,"240m",120),
    candles(m,"60m",520),
    candles(m,"10m",200),
    candles("KRW-BTC","240m",120),
    candles("KRW-BTC","60m",120)
  ]);

  const entry=plannedEntry??t.trade_price;
  const currentDay=d.at(-1);
  const day=summary(d),fourH=summary(h4),oneH=summary(h1),tenM=summary(m10);
  const frames={
    day,
    h4:{...fourH,rs_vs_btc_24h:(ret(h4,6)??0)-(ret(btc4,6)??0)},
    h1:{...oneH,rs_vs_btc_24h:(ret(h1,24)??0)-(ret(btc1,24)??0),same_hour_volume_ratio_20d:sameHourVolumeRatio(closed(h1),20)},
    m10:tenM
  };
  const r=rr(entry,stop,target);

  return {
    market:m,
    asof_ms:Date.now(),
    ticker:{
      trade_price:t.trade_price,
      change_vs_prev_close_pct:t.signed_change_rate*100,
      opening_price_kst_day:t.opening_price,
      high_price_kst_day:t.high_price,
      low_price_kst_day:t.low_price,
      prev_closing_price:t.prev_closing_price,
      acc_trade_price_24h:t.acc_trade_price_24h,
      timestamp:t.timestamp??t.trade_timestamp??null
    },
    rr_basis:{entry,entry_source:plannedEntry!==undefined?"planned_entry":"current_price"},
    rr:r?{...r,entry_source:plannedEntry!==undefined?"planned_entry":"current_price"}:null,
    session_vwap:currentDay?.closed===false?canonicalVwap([currentDay]):null,
    session_vwap_basis:"Bithumb KST 00:00 session; accumulated trade value / accumulated trade volume",
    data_quality_gate:qualityGate(t,frames),
    timeframes:frames
  };
}

export async function rawCandles(symbol:string,tf:"10m"|"60m"|"240m"|"1d",count:number,before?:string){
  const m=market(symbol),c=await candles(m,tf,Math.min(count,1500),before);
  return {market:m,timeframe:tf,count:c.length,quality:quality(closed(c),count),candles:c};
}

export async function scan(limit=10,minTradeValue=2_000_000_000){
  const ms=(await markets())
    .filter(x=>x.market.startsWith("KRW-")&&x.market_warning!=="CAUTION")
    .map(x=>x.market);
  const ts=await tickers(ms);
  const liquid=ts
    .filter(x=>x.acc_trade_price_24h>=minTradeValue)
    .sort((a,b)=>b.acc_trade_price_24h-a.acc_trade_price_24h)
    .slice(0,20);

  const btc1=await candles("KRW-BTC","60m",40);
  const btcRet=ret(btc1,24)??0;

  const rows=await Promise.all(liquid.map(async t=>{
    const [h4,h1]=await Promise.all([
      candles(t.market,"240m",80),
      candles(t.market,"60m",520)
    ]);
    const s4=summary(h4),s1=summary(h1),r1=ret(h1,24)??0;
    return {
      market:t.market,
      price:t.trade_price,
      change_24h_pct:r1,
      change_vs_prev_close_pct:t.signed_change_rate*100,
      trade_value_24h:t.acc_trade_price_24h,
      rs_vs_btc_24h:r1-btcRet,
      h4_structure:s4.structure_proxy,
      h1_structure:s1.structure_proxy,
      h1_volume_ratio_20:s1.volume_ratio_20,
      h1_same_hour_volume_ratio_20d:sameHourVolumeRatio(closed(h1),20),
      h1_rsi14:s1.rsi14,
      data_quality:combinedQuality(s4.quality,s1.quality)
    };
  }));

  const usable=rows.filter(x=>x.data_quality.usable_for_scan);
  usable.sort((a,b)=>(b.rs_vs_btc_24h+(b.h1_volume_ratio_20??0))-(a.rs_vs_btc_24h+(a.h1_volume_ratio_20??0)));
  return {
    note:"Mechanical data shortlist only; not a buy ranking.",
    btc_return_24h_pct:btcRet,
    excluded_for_data_quality:rows.length-usable.length,
    candidates:usable.slice(0,Math.min(limit,20))
  };
}
