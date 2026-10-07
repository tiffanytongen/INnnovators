// Plan B (Expo Go). One app, two roles: Participant (attendee) and Organizer (Fieldday staff).
// The switch at the top is for the demo; in production these would be two separate logins.
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { Jost_400Regular, Jost_500Medium, Jost_600SemiBold, Jost_700Bold } from "@expo-google-fonts/jost";
import Participant from "./src/Participant";
import Organizer from "./src/Organizer";
import { ALERT, CALM, F, defaultServer, store, type Pal } from "./src/theme";
import { PalContext } from "./src/ui";

type Mode = "participant" | "organizer";

export default function App() {
  const [fontsLoaded] = useFonts({
    Jost_400Regular, Jost_500Medium, Jost_600SemiBold, Jost_700Bold,
  });
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<Mode>("participant");
  const [server, setServer] = useState(defaultServer());
  const [alert, setAlert] = useState(false); // participant is on Plan B → band and accents turn coral

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

  const pal: Pal = mode === "participant" && alert ? ALERT : CALM;

  return (
    <SafeAreaProvider>
      <PalContext.Provider value={pal}>
        <StatusBar style="dark" />
        <SafeAreaView style={{ flex: 1, backgroundColor: pal.band }} edges={["top"]}>
          {/* Role switch: wordmark left, pill toggle right (sits on the header band) */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4, gap: 12 }}>
            <Text style={{ fontFamily: fontsLoaded ? F.displayBold : undefined, fontSize: 22, color: pal.ink }}>Plan B</Text>
            <View style={{ flexDirection: "row", padding: 4, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.55)" }}>
              {(["participant", "organizer"] as Mode[]).map((m) => {
                const on = mode === m;
                return (
                  <Pressable key={m} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => pick(m)} style={{ minHeight: 40, paddingHorizontal: 14, borderRadius: 999, justifyContent: "center", backgroundColor: on ? pal.card : "transparent" }}>
                    <Text style={{ fontFamily: fontsLoaded ? F.bodySemi : undefined, fontSize: 14, color: on ? pal.ink : pal.sub }}>
                      {m === "participant" ? "Participant" : "Organizer"}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <SafeAreaView style={{ flex: 1, backgroundColor: pal.bg }} edges={["bottom"]}>
            {!ready || !fontsLoaded ? null : mode === "participant" ? (
              <Participant server={server} onServer={changeServer} onAlert={setAlert} />
            ) : (
              <Organizer server={server} />
            )}
          </SafeAreaView>
        </SafeAreaView>
      </PalContext.Provider>
    </SafeAreaProvider>
  );
}
