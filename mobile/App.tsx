// Plan B (Expo Go). One app, two roles: Participant (attendee) and Organizer (Fieldday staff).
// The switch at the top is for the demo; in production these would be two separate logins.
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { YoungSerif_400Regular } from "@expo-google-fonts/young-serif";
import { Outfit_400Regular, Outfit_500Medium, Outfit_600SemiBold, Outfit_700Bold, Outfit_800ExtraBold } from "@expo-google-fonts/outfit";
import Participant from "./src/Participant";
import Organizer from "./src/Organizer";
import { ALERT, F, NIGHT, defaultServer, store, type Pal } from "./src/theme";
import { PalContext, Stars } from "./src/ui";

type Mode = "participant" | "organizer";

export default function App() {
  const [fontsLoaded] = useFonts({
    YoungSerif_400Regular,
    Outfit_400Regular, Outfit_500Medium, Outfit_600SemiBold, Outfit_700Bold, Outfit_800ExtraBold,
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
          <Stars />
          {/* Role switch: wordmark left, pill switch right */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4, gap: 12 }}>
            <Text style={{ fontFamily: fontsLoaded ? F.display : undefined, fontSize: 24, color: pal.name === "alert" ? pal.ink : pal.accent }}>Plan B</Text>
            <View style={{ flexDirection: "row", padding: 4, borderRadius: 999, backgroundColor: pal.name === "alert" ? "rgba(23,18,59,0.1)" : "rgba(255,244,222,0.08)", borderWidth: 1, borderColor: pal.line }}>
              {(["participant", "organizer"] as Mode[]).map((m) => {
                const on = mode === m;
                return (
                  <Pressable key={m} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => pick(m)} style={{ minHeight: 40, paddingHorizontal: 14, borderRadius: 999, justifyContent: "center", backgroundColor: on ? pal.ink : "transparent" }}>
                    <Text style={{ fontFamily: fontsLoaded ? F.bodySemi : undefined, fontSize: 14, color: on ? pal.bg : pal.sub }}>
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
