# Bithumb Market Bridge

Read-only MCP server for Bithumb KRW market data.

- No account access
- No API keys
- No orders or balances
- No news/catalyst logic
- Daily / 4H / 1H / 10m candles
- Historical pagination up to 1500 candles per call
- planned_entry/current_price R/R
- same-hour 1H volume context
- canonical session VWAP
- BTC relative strength
- MA/EMA/RSI/ATR
- data-quality gate

Tools: `market_snapshot`, `market_candles`, `market_scan`

MCP endpoint: `/mcp`
