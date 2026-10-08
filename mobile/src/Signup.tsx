// Ticket checkout step (not an account): name/language come from the ticket; 3 optional journey questions.
// The server creates the attendee profile, asks Claude for their Plan A now and prepares disruption plans in the background.
import { useState } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { postJSON, s } from "./theme";
import { Btn, Card, Chips, Field, Notice, Select, Toggle, Txt, usePal } from "./ui";

const LANGS: [string, string][] = [["en", "English"], ["zh", "中文"], ["vi", "Tiếng Việt"], ["ar", "العربية"], ["hi", "हिन्दी"], ["es", "Español"], ["ko", "한국어"]];
const LINES = ["Sandringham", "Frankston", "Belgrave", "Lilydale", "Craigieburn", "Werribee", "Hurstbridge", "Pakenham"];
const ZONES: [string, string][] = [["pickup_zone_1", "Zone 1 · Gate A"], ["pickup_zone_2", "Zone 2 · Gate B"], ["pickup_zone_3", "Zone 3 · Gate D"]];
const CONTACTS: [string, string][] = [["parent", "Parent"], ["friend", "Friend"], ["partner", "Partner"]];

// Suburb → the Metro line that serves it, for the 8 lines in the Flinders St timetable this prototype has.
// Only suburbs on exactly one of those lines; anything else just asks them to pick the line.
const SUBURB_LINE: Record<string, string> = Object.fromEntries(Object.entries({
  Sandringham: ["sandringham", "hampton", "brighton", "middle brighton", "north brighton", "gardenvale", "elsternwick", "ripponlea", "balaclava", "windsor", "prahran", "st kilda east"],
  Frankston: ["frankston", "seaford", "carrum", "chelsea", "edithvale", "aspendale", "mordialloc", "parkdale", "mentone", "cheltenham", "highett", "moorabbin", "bentleigh", "mckinnon", "ormond", "glen huntly", "malvern", "armadale", "toorak", "hawksburn", "kananook", "bonbeach"],
  Belgrave: ["belgrave", "tecoma", "upwey", "ferntree gully", "upper ferntree gully", "boronia", "bayswater", "heathmont"],
  Lilydale: ["lilydale", "mooroolbark", "croydon", "ringwood east"],
  Craigieburn: ["craigieburn", "roxburgh park", "coolaroo", "broadmeadows", "jacana", "glenroy", "oak park", "pascoe vale", "strathmore", "essendon", "glenbervie", "moonee ponds", "ascot vale", "newmarket", "kensington"],
  Werribee: ["werribee", "hoppers crossing", "williams landing", "point cook", "laverton", "aircraft", "westona", "altona", "seaholme", "newport", "spotswood", "yarraville", "seddon"],
  Hurstbridge: ["hurstbridge", "wattle glen", "diamond creek", "eltham", "montmorency", "greensborough", "watsonia", "macleod", "rosanna", "heidelberg", "eaglemont", "ivanhoe", "darebin", "alphington", "fairfield", "dennis"],
  Pakenham: ["pakenham", "officer", "beaconsfield", "berwick", "narre warren", "hallam", "dandenong", "yarraman", "noble park", "sandown park", "springvale", "westall", "clayton", "huntingdale", "oakleigh", "hughesdale", "murrumbeena", "carnegie"],
}).flatMap(([line, subs]) => subs.map((x) => [x, line])));
const lineFor = (suburb: string) => SUBURB_LINE[suburb.toLowerCase().replace(/\b\d{4}\b/g, "").replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim()];

export default function Signup({ server, onDone, onCancel }: { server: string; onDone: (id: string) => void; onCancel: () => void }) {
  const p = usePal();
  const [f, setF] = useState({ name: "", lang: "en", suburb: "", mode: "train", line: "Sandringham", zone: "pickup_zone_2", contact: "parent", notify: true, contact_phone: "", step_free: false, leave_by: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF({ ...f, [k]: v });

  async function submit() {
    if (!f.name.trim()) return setError("Add the name on the ticket.");
    if (f.leave_by && !/^\d{2}:\d{2}$/.test(f.leave_by)) return setError("Use a time like 23:15, or leave it blank.");
    setBusy(true);
    setError("");
    try {
      const { id } = await postJSON<{ id: string }>(`${server}/api/profile`, { ...f, wheelchair: false, age: 20, group_size: 1 }, 90000);
      onDone(id);
    } catch (e) {
      setError(e instanceof Error && !e.message.includes("abort") ? e.message : `Can't reach the Plan B server at ${server}.`);
      setBusy(false);
    }
  }

  if (busy)
    return (
      <View style={{ flex: 1, backgroundColor: p.bg, alignItems: "center", justifyContent: "center", padding: 32, gap: 16 }}>
        <ActivityIndicator size="large" color={p.accent} />
        <Txt k="headline" style={{ textAlign: "center" }}>Preparing your journey home…</Txt>
        <Txt c="sub" style={{ textAlign: "center" }}>About 20 seconds. Alternatives for storms, closures and delays are prepared in the background.</Txt>
      </View>
    );

  return (
    <ScrollView style={{ backgroundColor: p.bg }} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <View style={{ backgroundColor: p.band, paddingHorizontal: 24, paddingTop: 12, paddingBottom: 28, gap: 6 }}>
        <Btn kind="ghost" title="‹ Back" onPress={onCancel} style={{ alignSelf: "flex-start", minHeight: 36 }} />
        <Txt k="eyebrow" c="sub">Ticket checkout · step 3 of 4</Txt>
        <Txt k="title">Getting home after Fieldday</Txt>
        <Txt c="sub">3 optional questions at checkout. Plan B combines your ticket details with these to plan your way home, and a safer one if conditions change. No extra app.</Txt>
      </View>

      <View style={{ padding: 20, gap: 22 }}>
        <Card>
          <Txt k="small" c="sub">From your ticket</Txt>
          <Field value={f.name} onChangeText={(v) => set("name", v)} placeholder="Name on ticket" />
          <Select options={LANGS} value={f.lang} onChange={(v) => set("lang", v)} />
        </Card>

        <View style={{ gap: 10 }}>
          <Txt k="bodyStrong">1. Where are you heading after?</Txt>
          <Field value={f.suburb} onChangeText={(v) => setF({ ...f, suburb: v, ...(lineFor(v) ? { line: lineFor(v) } : {}) })} placeholder="Suburb, e.g. Brighton" />
          {f.mode === "train" && f.suburb.trim().length > 2 ? (
            <Txt k="small" c="sub">{lineFor(f.suburb) ? `${lineFor(f.suburb)} line selected for ${f.suburb.trim()}. Change it below if that's wrong.` : "Pick your train line below."}</Txt>
          ) : null}
        </View>

        <View style={{ gap: 10 }}>
          <Txt k="bodyStrong">2. How are you getting home?</Txt>
          <Chips options={[["train", "Train"], ["shuttle", "Festival shuttle"], ["pickup", "Someone's picking me up"]]} value={f.mode} onChange={(v) => set("mode", v)} />
          {f.mode === "train" && (
            <>
              <Txt k="small" c="sub">Which train line?</Txt>
              <Select options={LINES.map((l) => [l, `${l} line`])} value={f.line} onChange={(v) => set("line", v)} />
            </>
          )}
          {f.mode === "pickup" && (
            <>
              <Txt k="small" c="sub">Who is picking you up?</Txt>
              <Select options={CONTACTS} value={f.contact} onChange={(v) => set("contact", v)} />
              <Txt k="small" c="sub">Where are they meeting you?</Txt>
              <Select options={ZONES} value={f.zone} onChange={(v) => set("zone", v)} />
              <Toggle label={`Text my ${f.contact} if the pickup changes`} on={f.notify} onPress={() => set("notify", !f.notify)} />
              {f.notify && (
                <Field value={f.contact_phone} onChangeText={(v) => set("contact_phone", v)} placeholder={`Their mobile (optional)`} keyboardType="phone-pad" />
              )}
              <Txt k="small" c="sub">{f.notify ? `If a storm, closure or delay moves your pickup point or time, Plan B texts your ${f.contact} the new details once staff approve it. Demo: the text is simulated, nothing is sent.` : `Nobody is texted. If your pickup changes, Plan B will remind you to tell your ${f.contact}.`}</Txt>
            </>
          )}
        </View>

        <View style={{ gap: 4 }}>
          <Txt k="bodyStrong">3. Anything that affects how you travel?</Txt>
          <Toggle label="I need step-free routes" on={f.step_free} onPress={() => set("step_free", !f.step_free)} />
          <View style={[s.row, { marginTop: 10 }]}>
            <Txt style={{ flex: 1 }}>Need to be on your way by (optional)</Txt>
            <Field value={f.leave_by} onChangeText={(v) => set("leave_by", v)} placeholder="23:15" keyboardType="numbers-and-punctuation" style={{ width: 96, textAlign: "center" }} />
          </View>
        </View>

        {error ? <Notice>{error}</Notice> : null}
        <Btn title="Continue to payment" onPress={submit} />
        <Txt k="small" c="sub">Used only for getting you home safely, and deleted after the event. Medical needs are handled by staff at the info tents, not by Plan B.</Txt>
      </View>
    </ScrollView>
  );
}
