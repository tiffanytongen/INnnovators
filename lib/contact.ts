// Emergency & pickup contact from the attendee Details page.
// Only a masked number/email is kept: the demo shows who WOULD be texted, and never needs a real number.
import { RELATIONSHIPS, type Contact } from "./data";

export function maskPhone(raw: string): string | null {
  const s = raw.replace(/[^\d+]/g, "");
  const m = s.match(/^\+(\d{1,3})(\d{6,12})$/);
  if (!m) return null;
  // Country code is 1-3 digits; show "+61"-style prefix (first 2 digits) and the last 3.
  return `+${s.slice(1, 3)} ••• ••• ${s.slice(-3)}`;
}

export function maskEmail(raw: string): string | null {
  const m = raw.trim().match(/^([^\s@])[^\s@]*@([^\s@]+\.[^\s@]+)$/);
  return m ? `${m[1]}•••@${m[2]}` : null;
}

/**
 * Validate the contact section. Returns { contact } (or contact: null when the section was left empty),
 * or { error } with a message for the form. The whole section is optional.
 */
export function parseContact(body: unknown, existing?: Contact): { contact: Contact | null } | { error: string } {
  if (!body || typeof body !== "object") return { contact: null };
  const b = body as Record<string, unknown>;
  const name = String(b.name ?? "").trim().slice(0, 40);
  const phone = String(b.phone ?? "").trim();
  const email = String(b.email ?? "").trim();
  if (!name && !phone && !email) return { contact: null };
  if (!name) return { error: "Add the contact's name, or leave the contact section empty." };
  const relationship = RELATIONSHIPS.find((r) => r === b.relationship) ?? "Other";
  // Editing: a blank phone keeps the saved (masked) number.
  const phone_masked = phone ? maskPhone(phone) : existing?.phone_masked ?? null;
  if (!phone_masked) return { error: "Add their mobile with the country code, e.g. +61 412 345 678." };
  const email_masked = email ? maskEmail(email) : existing?.email_masked ?? null;
  if (email && !email_masked) return { error: "That email doesn't look right. It's optional, so you can leave it blank." };
  return {
    contact: {
      name,
      relationship,
      phone_masked,
      ...(email_masked ? { email_masked } : {}),
      attendee_agreed: b.agreed === true,
      updated_at: new Date().toISOString(),
    },
  };
}
