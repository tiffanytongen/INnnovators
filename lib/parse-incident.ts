// Free-text incident → scenario parts. Claude suggests; this file validates; staff approve.
import { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { claude, MODEL, FALLBACK_OPTS } from "./claude";
import { transport, scenarios } from "./data";
import { canonical, type ScenarioPart } from "./scenario";

const ParsedSchema = z.object({
  parts: z.array(
    z.object({
      type: z.enum(["STORM", "GATE_CLOSED", "TRAIN_DELAY", "SHUTTLE_FULL", "HEAT", "SET_DELAY"]),
      gate: z.string().nullable().describe("GATE_CLOSED only: A, B, C or D"),
      line_code: z.string().nullable().describe("TRAIN_DELAY only: one of the line codes"),
      stage: z.string().nullable().describe("SET_DELAY only: RIVER, LAWN or TENT"),
      mins: z.number().nullable().describe("TRAIN_DELAY / SET_DELAY: minutes"),
      at: z.string().nullable().describe("STORM only: HH:MM it arrives, if stated"),
      evidence: z.string().describe("The words in the staff message this came from"),
    }),
  ),
  human_only: z.array(z.object({ issue: z.string(), why: z.string() })).describe("Medical, lost/missing children, safety threats, crowd crush: never handled by Plan B"),
  unmatched: z.array(z.string()).describe("Anything in the message that matches no scenario type"),
});

const SYSTEM = `You turn a festival staff member's quick incident note into structured scenario parts for Plan B. You only suggest; a human approves.

Scenario types: ${JSON.stringify(scenarios.types.map((t) => ({ type: t.type, pattern: t.code_pattern, label: t.label, effects: t.effects })))}
Train lines (name → line_code): ${transport.trains.map((t) => `${t.line} → ${t.code}`).join(", ")}
Gates: A, B, C, D. Stages: RIVER, LAWN, TENT.
"Accessible shuttle full" / "shuttle full" → SHUTTLE_FULL.

Rules:
- Only output parts the message actually states. Don't guess delays or gates that aren't mentioned.
- Medical emergencies, lost or missing children, fights, weapons, threats, crowd crush → put in human_only, never in parts.
- Anything else you can't map → unmatched.`;

const SAFETY_NET = /\b(medical|ambulance|injur|unconscious|faint|seizure|overdose|lost (child|kid)|missing (child|kid|girl|boy)|child missing|weapon|knife|gun|fight|assault|threat|bomb|crush)/i;

export type ParsedIncident = { code: string | null; parts: ScenarioPart[]; human_only: { issue: string; why: string }[]; unmatched: string[]; evidence: string[] };

export async function parseIncident(text: string): Promise<ParsedIncident> {
  const res = await claude().beta.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    ...FALLBACK_OPTS,
    output_config: { effort: "low", format: betaZodOutputFormat(ParsedSchema) },
    system: SYSTEM,
    messages: [{ role: "user", content: text }],
  });
  const out = res.parsed_output ?? { parts: [], human_only: [], unmatched: [text] };

  const parts: ScenarioPart[] = [];
  const unmatched = [...out.unmatched];
  const evidence: string[] = [];
  const lineCodes = transport.trains.map((t) => t.code);
  for (const p of out.parts) {
    const bad = (why: string) => unmatched.push(`${p.evidence} (${why})`);
    if (p.type === "STORM") parts.push({ type: "STORM", at: p.at && /^\d{2}:\d{2}$/.test(p.at) ? p.at : "23:00" });
    else if (p.type === "GATE_CLOSED") {
      if (p.gate && /^[A-D]$/.test(p.gate)) parts.push({ type: "GATE_CLOSED", gate: p.gate });
      else bad("unknown gate");
    } else if (p.type === "TRAIN_DELAY") {
      if (p.line_code && lineCodes.includes(p.line_code) && p.mins && p.mins > 0 && p.mins <= 180) parts.push({ type: "TRAIN_DELAY", line_code: p.line_code, mins: Math.round(p.mins) });
      else bad("unknown line or delay");
    } else if (p.type === "SET_DELAY") {
      if (p.stage && ["RIVER", "LAWN", "TENT"].includes(p.stage) && p.mins && p.mins > 0) parts.push({ type: "SET_DELAY", stage: p.stage, mins: Math.round(p.mins) });
      else bad("unknown stage or delay");
    }
    else parts.push({ type: p.type } as ScenarioPart);
    evidence.push(`${p.type}: "${p.evidence}"`);
  }
  // Belt and braces: a keyword net on top of the model for human-only topics.
  const human_only = [...out.human_only];
  if (SAFETY_NET.test(text) && human_only.length === 0) human_only.push({ issue: text.match(SAFETY_NET)![0], why: "Safety keyword detected — route to staff/emergency services" });

  return { code: parts.length ? canonical(parts) : null, parts, human_only, unmatched, evidence };
}
