export type Candle = {
  market: string; candle_date_time_utc: string; candle_date_time_kst: string;
  opening_price: number; high_price: number; low_price: number; trade_price: number;
  timestamp: number; candle_acc_trade_price: number; candle_acc_trade_volume: number; unit?: number;
  closed?: boolean;
};

const avg=(a:number[])=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
const med=(a:number[])=>{
  if(!a.length) return null;
  const s=[...a].sort((x,y)=>x-y),m=Math.floor(s.length/2);
  return s.length%2?s[m]:(s[m-1]+s[m])/2;
};

export const pct=(a:number,b:number)=>b?(a/b-1)*100:null;
export const ma=(v:number[],n:number)=>v.length>=n?avg(v.slice(-n)):null;

export function ema(v:number[],n:number){
  if(v.length<n) return null;
  const k=2/(n+1);
  let e=avg(v.slice(0,n))!;
  for(const x of v.slice(n)) e=x*k+e*(1-k);
  return e;
}

export function rsi(v:number[],n=14){
  if(v.length<n+1) return null;
  let g=0,l=0;
  for(let i=v.length-n;i<v.length;i++){
    const d=v[i]-v[i-1];
    d>=0?g+=d:l-=d;
  }
  if(!l) return 100;
  const rs=(g/n)/(l/n);
  return 100-100/(1+rs);
}

export function atr(c:Candle[],n=14){
  if(c.length<n+1) return null;
  const tr:number[]=[];
  for(let i=1;i<c.length;i++){
    const x=c[i],p=c[i-1].trade_price;
    tr.push(Math.max(x.high_price-x.low_price,Math.abs(x.high_price-p),Math.abs(x.low_price-p)));
  }
  return avg(tr.slice(-n));
}

export function volumeRatio(c:Candle[],n=20){
  if(c.length<n+1) return null;
  const base=avg(c.slice(-(n+1),-1).map(x=>x.candle_acc_trade_volume));
  return base?c.at(-1)!.candle_acc_trade_volume/base:null;
}

export function canonicalVwap(c:Candle[]){
  const q=c.reduce((s,x)=>s+x.candle_acc_trade_volume,0);
  return q?c.reduce((s,x)=>s+x.candle_acc_trade_price,0)/q:null;
}

export function structureProxy(c:Candle[]){
  if(c.length<10) return "INSUFFICIENT";
  const a=c.slice(-10,-5),b=c.slice(-5);
  const ah=Math.max(...a.map(x=>x.high_price)),al=Math.min(...a.map(x=>x.low_price));
  const bh=Math.max(...b.map(x=>x.high_price)),bl=Math.min(...b.map(x=>x.low_price));
  if(bh>ah&&bl>al) return "HH_HL";
  if(bh<ah&&bl<al) return "LH_LL";
  return bh>ah?"HH_LL":"LH_HL";
}

export function sameHourVolumeRatio(c:Candle[],days=20){
  if(!c.length) return null;
  const last=c.at(-1)!;
  const hour=last.candle_date_time_kst.slice(11,13);
  const hist=c.slice(0,-1)
    .filter(x=>x.candle_date_time_kst.slice(11,13)===hour)
    .slice(-days)
    .map(x=>x.candle_acc_trade_volume);
  const m=med(hist);
  return m?last.candle_acc_trade_volume/m:null;
}

export function quality(c:Candle[],expected:number){
  const issues:string[]=[];
  let fail=false;
  if(!c.length) return {status:"FAIL",issues:["no_data"]};
  const seen=new Set<string>();
  for(const x of c){
    if(seen.has(x.candle_date_time_kst)) issues.push("duplicate_timestamp");
    seen.add(x.candle_date_time_kst);
    if(
      x.low_price>x.high_price ||
      x.opening_price<x.low_price || x.opening_price>x.high_price ||
      x.trade_price<x.low_price || x.trade_price>x.high_price ||
      x.candle_acc_trade_volume<0
    ){
      fail=true;
      issues.push("invalid_ohlcv");
      break;
    }
  }
  if(c.length<Math.min(expected,20)) issues.push("short_history");
  return {status:fail?"FAIL":issues.length?"WARN":"PASS",issues:[...new Set(issues)]};
}

export function rr(entry:number,stop?:number,target?:number){
  if(!stop||!target||entry<=0||stop>=entry||target<=entry) return null;
  const risk=(entry-stop)/entry*100,reward=(target-entry)/entry*100;
  return {entry,stop,target,risk_pct:risk,reward_pct:reward,rr:reward/risk};
}
