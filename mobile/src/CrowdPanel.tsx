// Organizer → Tonight → "Paths right now": staff mark each walking path clear / busy / heavy / closed.
// Phones re-rank their saved options with this (busy paths drop down, closed ones are skipped), and the
// server's route ranking uses it too. Logic from the jasmine-walking branch; restyled for the green identity.
import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { normalizeCrowd, type CrowdLevel, type CrowdState } from "../../lib/crowd-model";
import { displayTime } from "./participant-model";
import { C, F, getJSON, postJSON, s } from "./theme";
import { Btn, Txt, usePal } from "./ui";

const PATHS: [string, string][] = [
  ["route_A_open", "River Stage → Gate A"],
  ["covered_path_2", "Covered path → Gate C"],
  ["route_C_open", "Open path → Gate C"],
  ["route_B_canopy", "Canopy walk → Gate B"],
  ["route_B_lawn", "Lawn path → Gate B"],
  ["ramp_path_D", "Accessible ramp → Gate D"],
];
const LEVELS: [CrowdLevel, string][] = [["low", "Clear"], ["moderate", "Busy"], ["heavy", "Heavy"], ["closed", "Closed"]];

export default function CrowdPanel({ server }: { server: string }) {
  const p = usePal();
  const [crowd, setCrowd] = useState<CrowdState>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const revision = useRef(0);
  const updating = useRef(false);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      if (updating.current) return;
      const requested = revision.current;
      try {
        const r = await getJSON<{ crowd: unknown }>(`${server}/api/crowd`);
        if (active && requested === revision.current) { setCrowd(normalizeCrowd(r.crowd)); setError(""); }
      } catch (e) { if (active && requested === revision.current) setError(String(e)); }
    };
    void refresh();
    const timer = setInterval(refresh, 5000);
    return () => { active = false; clearInterval(timer); };
  }, [server]);

  async function send(body: object, key: string) {
    if (updating.current) return;
    updating.current = true;
    revision.current += 1;
    setBusy(key);
    setError("");
    try {
      const r = await postJSON<{ crowd: CrowdState }>(`${server}/api/crowd`, body);
      setCrowd(normalizeCrowd(r.crowd));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      updating.current = false;
      setBusy("");
    }
  }

  const tone = (l: CrowdLevel) => (l === "closed" ? C.ink : l === "heavy" ? C.pink : l === "moderate" ? C.yellow : C.green);

  return (
    <View style={{ gap: 4 }}>
      <Txt k="small" c="sub">Phones avoid busy paths and skip closed ones automatically.</Txt>
      {PATHS.map(([id, label]) => {
        const st = crowd[id];
        return (
          <View key={id} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: p.line, gap: 8 }}>
            <View style={s.between}>
              <Txt k="bodyStrong">{label}</Txt>
              <Txt k="small" c="sub">{st ? displayTime(st.updated_at) : "No report"}</Txt>
            </View>
            <View style={{ flexDirection: "row", gap: 6 }}>
              {LEVELS.map(([level, name]) => {
                const on = st?.level === level;
                return (
                  <Pressable
                    key={level}
                    disabled={!!busy}
                    onPress={() => send({ route_id: id, level }, id)}
                    style={({ pressed }) => [{ flex: 1, minHeight: 36, borderRadius: 999, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: on ? tone(level) : p.line, backgroundColor: on ? tone(level) : p.card }, pressed && s.pressed]}
                  >
                    <Text style={{ fontFamily: on ? F.bodySemi : F.body, fontSize: 14, color: on ? (level === "moderate" ? C.ink : C.white) : p.ink }}>{name}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      })}
      <Btn kind="ghost" title="Mark all paths clear" busy={busy === "reset"} onPress={() => send({ action: "reset" }, "reset")} style={{ alignSelf: "flex-start" }} />
      {error ? <Txt k="small" c="danger">{error}</Txt> : null}
    </View>
  );
}
