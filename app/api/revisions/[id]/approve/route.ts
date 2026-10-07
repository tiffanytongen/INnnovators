import { approveProposal, RevisionError } from "@/lib/plan-revisions";

// Matches the app's existing named-organiser approval model. This prototype does
// not have authenticated roles; deploy behind authentication before public use.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body: unknown = await req.json();
    if (!body || typeof body !== "object" || !("approved_by" in body) || typeof body.approved_by !== "string") {
      return Response.json({ error: "A named organiser must approve" }, { status: 400 });
    }
    return Response.json(approveProposal(id, body.approved_by), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof RevisionError) return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof SyntaxError) return Response.json({ error: "Invalid JSON request" }, { status: 400 });
    return Response.json({ error: "Could not approve the plan. The existing approved plan remains available; refresh before retrying." }, { status: 500 });
  }
}
