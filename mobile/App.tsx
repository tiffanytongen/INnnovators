// Plan B (Expo Go). One demo app, two roles: Participant (attendee view, as it would appear inside the
// event's own app) and Organizer (Fieldday staff). The switch at the top is for the demo only.
import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { Jost_400Regular, Jost_500Medium, Jost_600SemiBold, Jost_700Bold } from "@expo-google-fonts/jost";
import Participant from "./src/Participant";
import Organizer from "./src/Organizer";
import { ATTENDEE, ORGANIZER, PLANB, F, defaultServer, store, type Pal } from "./src/theme";
import { PalContext } from "./src/ui";

type Mode = "participant" | "organizer";

export default function App() {
  const [fontsLoaded] = useFonts({ Jost_400Regular, Jost_500Medium, Jost_600SemiBold, Jost_700Bold });
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<Mode>("participant");
  const [server, setServer] = useState(defaultServer());
  const [planB, setPlanB] = useState(false);

  useEffect(() => {
    (async () => {
      const [m, sv] = await Promise.all([store.get<Mode>("planb:mode"), store.get<string>("planb:server")]);
      if (m) setMode(m);
      if (sv) setServer(sv);
      setReady(true);
    })();
  }, []);

  const pick = (m: Mode) => {
    setMode(m);
    store.set("planb:mode", m);
  };
  const changeServer = (v: string) => {
    setServer(v);
    store.set("planb:server", v);
  };
  const onPlanB = useCallback((on: boolean) => setPlanB(on), []);

  const pal: Pal = mode === "organizer" ? ORGANIZER : planB ? PLANB : ATTENDEE;
  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: pal.bg }} />;

  return (
    <SafeAreaProvider>
      <PalContext.Provider value={pal}>
        <StatusBar style="dark" />
        <SafeAreaView style={{ flex: 1, backgroundColor: pal.band }} edges={["top"]}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 6, paddingBottom: 6, backgroundColor: pal.band }}>
            <Text style={{ fontFamily: F.displayBold, fontSize: 22, color: pal.ink }}>Plan B</Text>
            <View style={{ flexDirection: "row", padding: 4, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.55)" }}>
              {(["participant", "organizer"] as Mode[]).map((m) => {
                const on = mode === m;
                return (
                  <Pressable key={m} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => pick(m)} style={{ minHeight: 36, paddingHorizontal: 14, borderRadius: 999, justifyContent: "center", backgroundColor: on ? "#FFFFFF" : "transparent" }}>
                    <Text style={{ fontFamily: on ? F.bodySemi : F.body, fontSize: 14, color: on ? pal.ink : pal.sub }}>{m === "participant" ? "Participant" : "Organizer"}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <View style={{ flex: 1, backgroundColor: pal.bg }}>
            {!ready ? null : mode === "participant" ? <Participant server={server} onServer={changeServer} onPlanB={onPlanB} /> : <Organizer server={server} />}
          </View>
        </SafeAreaView>
      </PalContext.Provider>
    </SafeAreaProvider>
  );
}
