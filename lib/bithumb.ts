import type { Candle } from "./metrics";

const API="https://api.bithumb.com";
const j=async<T>(url:string):Promise<T>=>{
  const r=await fetch(url,{headers:{accept:"application/json"},cache:"no-store"});
  if(!r.ok) throw new Error(`Bithumb ${r.status}`);
  return r.json();
};

export const market=(s:string)=>s.startsWith("KRW-")?s:`KRW-${s.toUpperCase()}`;

export async function markets(){
  return j<Array<{market:string;korean_name:string;english_name:string;market_warning?:string}>>(`${API}/v1/market/all?isDetails=true`);
}

export async function tickers(ms:string[]){
  const out:any[]=[];
  for(let i=0;i<ms.length;i+=80)
    out.push(...await j<any[]>(`${API}/v1/ticker?markets=${encodeURIComponent(ms.slice(i,i+80).join(","))}`));
  return out;
}

export async function ticker(m:string){ return (await tickers([m]))[0]; }

function closed(c:Candle,tf:string){
  const t=new Date(c.candle_date_time_kst+"+09:00").getTime();
  const dur=tf==="1d"?864e5:Number(tf.replace("m",""))*60000;
  return t+dur<=Date.now();
}

export async function candles(m:string,tf:"10m"|"60m"|"240m"|"1d",count=200,before?:string){
  const path=tf==="1d"?"/v1/candles/days":`/v1/candles/minutes/${tf.replace("m","")}`;
  const out:Candle[]=[];
  let to=before;
  while(out.length<count){
    const n=Math.min(200,count-out.length);
    const q=new URLSearchParams({market:m,count:String(n)});
    if(to) q.set("to",to);
    const batch=await j<Candle[]>(`${API}${path}?${q}`);
    if(!batch.length) break;
    out.push(...batch);
    const oldest=batch.at(-1)!;
    to=oldest.candle_date_time_kst;
    if(batch.length<n) break;
  }
  return out
    .sort((a,b)=>a.candle_date_time_kst.localeCompare(b.candle_date_time_kst))
    .map(x=>({...x,closed:closed(x,tf)}));
}
