export async function GET() {
  return Response.json({ status: "alive", timestamp: new Date().toISOString() });
}

export async function POST(request: Request) {
  const body = await request.json();
  return Response.json({ received: true, keys: Object.keys(body) });
}
