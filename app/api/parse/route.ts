import { parseIncident } from "@/lib/parse-incident";

export async function POST(req: Request) {
  const { text } = await req.json();
  if (!text?.trim()) return Response.json({ error: "Type what's happening" }, { status: 400 });
  try {
    return Response.json(await parseIncident(text));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
