export async function GET() {
  return Response.json({ok:true,service:"bithumb-market-bridge",read_only:true});
}
