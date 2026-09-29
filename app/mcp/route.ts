import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { rawCandles,scan,snapshot } from "../../lib/service";

const ro={readOnlyHint:true,destructiveHint:false,openWorldHint:true,idempotentHint:true};

const handler=createMcpHandler(server=>{
  server.registerTool("market_snapshot",{
    title:"Bithumb market snapshot",
    description:"Get a read-only Bithumb KRW market snapshot with day, 4H, 1H and 10m OHLC, MA7/14/20/30/60/90, EMA20/50, volume, structure metrics, BTC relative strength, session VWAP, same-hour volume context, data-quality checks, and optional R/R from a planned entry or current price.",
    inputSchema:z.object({
      symbol:z.string().describe("Ticker such as SUI, XRP, or KRW-BTC"),
      planned_entry:z.number().positive().optional(),
      stop:z.number().positive().optional(),
      target:z.number().positive().optional()
    }),
    annotations:ro
  },async a=>{
    const data=await snapshot(a.symbol,a.planned_entry,a.stop,a.target);
    return {structuredContent:data,content:[{type:"text",text:JSON.stringify(data)}]};
  });

  server.registerTool("market_candles",{
    title:"Bithumb historical candles",
    description:"Fetch read-only Bithumb historical candles with pagination. Supports 10m, 1H, 4H and daily data, up to 1500 candles per call, and marks closed versus in-progress candles.",
    inputSchema:z.object({
      symbol:z.string(),
      timeframe:z.enum(["10m","60m","240m","1d"]),
      count:z.number().int().min(1).max(1500).default(200),
      before:z.string().optional().describe("Optional KST cutoff: YYYY-MM-DDTHH:mm:ss")
    }),
    annotations:ro
  },async a=>{
    const data=await rawCandles(a.symbol,a.timeframe,a.count,a.before);
    return {structuredContent:data,content:[{type:"text",text:`${data.market} ${data.timeframe}: ${data.count} candles, quality ${data.quality.status}`}]};
  });

  server.registerTool("market_scan",{
    title:"Bithumb KRW market scan",
    description:"Create a read-only mechanical shortlist of liquid Bithumb KRW markets using current liquidity, 4H/1H structure proxies, BTC relative strength, RSI and volume context. This is data filtering, not a buy recommendation.",
    inputSchema:z.object({
      limit:z.number().int().min(1).max(20).default(10),
      min_trade_value_krw:z.number().min(0).default(2000000000)
    }),
    annotations:ro
  },async a=>{
    const data=await scan(a.limit,a.min_trade_value_krw);
    return {structuredContent:data,content:[{type:"text",text:`Scanned Bithumb KRW markets; returned ${data.candidates.length} mechanical candidates.`}]};
  });
},{serverInfo:{name:"bithumb-market-bridge",version:"0.1.0"}});

export {handler as GET,handler as POST};
