// Signed trigger codes. Format: "<scenario>|<issued_at unix s>|<ed25519 sig, base64url>"
// e.g. "STORM+GATE_A+TRAIN_SAND_25+SHUTTLE_FULL|1791370140|Qm9v..." — small enough for an SMS.
// Phones hold only the public key (cached with their plans), so they can verify offline but can't forge.
import nacl from "tweetnacl";

const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const enc = (s: string) => new TextEncoder().encode(s);

export type Trigger = { code: string; issued_at: number; raw: string };

export function verifyTrigger(raw: string, publicKeyB64: string): Trigger | null {
  const [code, issued, sig] = raw.split("|");
  if (!code || !issued || !sig) return null;
  try {
    const ok = nacl.sign.detached.verify(enc(`${code}|${issued}`), fromB64url(sig), fromB64url(publicKeyB64));
    return ok ? { code, issued_at: Number(issued), raw } : null;
  } catch {
    return null;
  }
}

// ---- server side ----
function keyPair() {
  const secret = process.env.TRIGGER_SECRET || "plan-b-demo-secret";
  const seed = nacl.hash(enc(secret)).slice(0, 32);
  return nacl.sign.keyPair.fromSeed(seed);
}

export const publicKey = () => b64url(keyPair().publicKey);

export function signTrigger(code: string, issued_at = Math.floor(Date.now() / 1000)): string {
  const sig = nacl.sign.detached(enc(`${code}|${issued_at}`), keyPair().secretKey);
  return `${code}|${issued_at}|${b64url(sig)}`;
}
