// Plan B (Expo Go). One app, two roles: Participant (attendee) and Organizer (Fieldday staff).
// The switch at the top is for the demo; in production these would be two separate logins.
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import Participant from "./src/Participant";
import Organizer from "./src/Organizer";
import { C, s, defaultServer, store } from "./src/theme";

type Mode = "participant" | "organizer";

export default function App() {
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<Mode>("participant");
  const [server, setServer] = useState(defaultServer());

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

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <SafeAreaView style={s.screen} edges={["top", "bottom"]}>
        <View style={{ flexDirection: "row", margin: 12, marginBottom: 4, backgroundColor: "#EAE7E0", borderRadius: 999, padding: 4 }}>
          {(["participant", "organizer"] as Mode[]).map((m) => (
            <Pressable key={m} onPress={() => pick(m)} style={{ flex: 1, paddingVertical: 8, borderRadius: 999, alignItems: "center", backgroundColor: mode === m ? C.card : "transparent" }}>
              <Text style={{ fontSize: 15, fontWeight: mode === m ? "800" : "600", color: mode === m ? C.text : C.muted }}>
                {m === "participant" ? "🎟 Participant" : "🦺 Organizer"}
              </Text>
            </Pressable>
          ))}
        </View>
        {!ready ? null : mode === "participant" ? <Participant server={server} onServer={changeServer} /> : <Organizer server={server} />}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
