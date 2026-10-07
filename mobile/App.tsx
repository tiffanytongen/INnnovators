// Plan B (Expo Go). One app, two roles: Participant (attendee) and Organizer (Fieldday staff).
// The switch at the top is for the demo; in production these would be two separate logins.
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { BigShoulders_700Bold, BigShoulders_800ExtraBold, BigShoulders_900Black } from "@expo-google-fonts/big-shoulders";
import { FamiljenGrotesk_400Regular, FamiljenGrotesk_500Medium, FamiljenGrotesk_600SemiBold, FamiljenGrotesk_700Bold } from "@expo-google-fonts/familjen-grotesk";
import Participant from "./src/Participant";
import Organizer from "./src/Organizer";
import { ALERT, F, NIGHT, defaultServer, store, type Pal } from "./src/theme";
import { PalContext } from "./src/ui";

type Mode = "participant" | "organizer";

export default function App() {
  const [fontsLoaded] = useFonts({
    BigShoulders_700Bold, BigShoulders_800ExtraBold, BigShoulders_900Black,
    FamiljenGrotesk_400Regular, FamiljenGrotesk_500Medium, FamiljenGrotesk_600SemiBold, FamiljenGrotesk_700Bold,
  });
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<Mode>("participant");
  const [server, setServer] = useState(defaultServer());
  const [alert, setAlert] = useState(false); // participant is on Plan B → whole app goes yellow

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

  const pal: Pal = mode === "participant" && alert ? ALERT : NIGHT;

  return (
    <SafeAreaProvider>
      <PalContext.Provider value={pal}>
        <StatusBar style={pal.name === "alert" ? "dark" : "light"} />
        <SafeAreaView style={{ flex: 1, backgroundColor: pal.bg }} edges={["top", "bottom"]}>
          {/* Role switch: wordmark left, two plain tabs right */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 6, borderBottomWidth: 1, borderBottomColor: pal.line }}>
            <Text style={{ fontFamily: fontsLoaded ? F.display : undefined, fontSize: 22, color: pal.ink, letterSpacing: 0.5 }}>PLAN B</Text>
            <View style={{ flexDirection: "row", gap: 18 }}>
              {(["participant", "organizer"] as Mode[]).map((m) => {
                const on = mode === m;
                return (
                  <Pressable key={m} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => pick(m)} style={{ minHeight: 44, justifyContent: "center", borderBottomWidth: 3, borderBottomColor: on ? (pal.name === "alert" ? pal.ink : pal.accent) : "transparent" }}>
                    <Text style={{ fontFamily: fontsLoaded ? F.bodySemi : undefined, fontSize: 15, color: on ? pal.ink : pal.sub }}>
                      {m === "participant" ? "Participant" : "Organizer"}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          {!ready || !fontsLoaded ? null : mode === "participant" ? (
            <Participant server={server} onServer={changeServer} onAlert={setAlert} />
          ) : (
            <Organizer server={server} />
          )}
        </SafeAreaView>
      </PalContext.Provider>
    </SafeAreaProvider>
  );
}
