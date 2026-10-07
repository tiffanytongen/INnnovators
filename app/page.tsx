// The website has been retired: both Participant and Organizer use the Expo app (mobile/).
// This server now only serves the app's API (plans, AI calls, triggers, pre-mortem, wallpaper).
export default function Home() {
  return (
    <main style={{ fontFamily: "system-ui", padding: 32, maxWidth: 560 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800 }}>Plan B server is running ✓</h1>
      <p>Open the Plan B app in Expo Go (run <code>npm run mobile</code> and scan the QR code). This server provides its data and AI.</p>
    </main>
  );
}
