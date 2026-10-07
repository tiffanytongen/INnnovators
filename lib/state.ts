// The one piece of live state: the latest approved broadcast. Stored in a file so it survives dev reloads.
import fs from "node:fs";
import path from "node:path";

const STATE_PATH = path.join(process.cwd(), "data", "state", "broadcast.json");

export type Broadcast = {
  trigger: string; // signed trigger string sent to phones
  code: string;
  approved_by: string;
  approved_at: string;
  original_text: string;
  simulated_sms: { to: string; text: string }[];
};

export function readBroadcast(): Broadcast | null {
  return fs.existsSync(STATE_PATH) ? JSON.parse(fs.readFileSync(STATE_PATH, "utf8")) : null;
}

export function writeBroadcast(b: Broadcast) {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(b, null, 2));
}
