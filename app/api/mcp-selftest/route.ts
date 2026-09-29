export async function GET(request: Request) {
  const endpoint = new URL("/mcp", request.url);
  const call = async (body: unknown) => {
    const started = Date.now();
    try {
      const r = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "accept": "application/json, text/event-stream"
        },
        body: JSON.stringify(body),
        cache: "no-store",
        signal: AbortSignal.timeout(8000)
      });
      return {
        status: r.status,
        ms: Date.now() - started,
        body: (await r.text()).slice(0, 12000)
      };
    } catch (e) {
      return {
        status: 0,
        ms: Date.now() - started,
        error: e instanceof Error ? e.message : String(e)
      };
    }
  };

  const initialize = await call({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "bithumb-market-bridge-selftest", version: "1.0.0" }
    }
  });

  const toolsList = await call({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
    params: {}
  });

  return Response.json({
    ok: initialize.status === 200 && toolsList.status === 200,
    endpoint: endpoint.toString(),
    initialize,
    tools_list: toolsList
  });
}
