// Read / edit an attendee's Details. Only the emergency & pickup contact is editable after checkout
// (changing the journey home would mean re-planning). Contact numbers are only ever returned masked.
import { connection } from "next/server";
import { loadProfiles, saveProfiles } from "@/lib/data";
import { parseContact } from "@/lib/contact";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await ctx.params;
  const p = loadProfiles().find((x) => x.id === id);
  if (!p) return Response.json({ error: "unknown person" }, { status: 404 });
  return Response.json({ id: p.id, name: p.name, contact: p.contact ?? null });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const profiles = loadProfiles();
  const i = profiles.findIndex((x) => x.id === id);
  if (i < 0) return Response.json({ error: "unknown person" }, { status: 404 });
  const body = (await req.json().catch(() => null)) as { contact?: unknown } | null;
  const r = parseContact(body?.contact, profiles[i].contact);
  if ("error" in r) return Response.json(r, { status: 400 });
  const { contact: _old, ...rest } = profiles[i];
  void _old;
  profiles[i] = r.contact ? { ...rest, contact: r.contact } : rest;
  // Keep the pickup texting preference in step with the contact consent.
  const home = profiles[i].home;
  if (home.mode === "pickup") profiles[i] = { ...profiles[i], home: { ...home, notify: !!r.contact?.attendee_agreed, ...(r.contact ? { contact: r.contact.relationship.toLowerCase() } : {}) } };
  saveProfiles(profiles);
  return Response.json({ id, contact: profiles[i].contact ?? null });
}
