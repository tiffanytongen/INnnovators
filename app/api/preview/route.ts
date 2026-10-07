import { buildPreview } from "@/lib/preview";
import { canonicalCode } from "@/lib/scenario";

export async function POST(req: Request) {
  const { code } = await req.json();
  const c = canonicalCode(code ?? "");
  if (!c) return Response.json({ error: `Unknown scenario code: ${code}` }, { status: 400 });
  return Response.json(buildPreview(c));
}
