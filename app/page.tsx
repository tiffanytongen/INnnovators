// Judges' entry point. On a laptop: the Plan B phone app in a phone-sized frame, with a short guide.
// On a phone: the app fills the screen. The app itself is the Expo web build served from /app.
const STEPS: [string, string][] = [
  ["Attendee", "Open Mei, Tom or Jake to see their personal way home, written by Claude in their own language."],
  ["Organizer", "Type what happened, e.g. “Storm at 11pm, Gate A closed, Sandringham line 25 min late”, tap Check, then Approve & send."],
  ["Back to Attendee", "Their phone has switched to Plan B. Every plan was checked against real gates, paths, timetables and capacity."],
  ["Something new", "Try a situation nobody planned for, e.g. “Tree down on the canopy walk to Gate B”. Claude writes new plans in about 20 seconds for you to approve."],
  ["Pre-mortem", "The second organizer tab shows what Plan B found before the event, and the fix it verified."],
];

export default function Home() {
  return (
    <main className="pb-wrap">
      <style>{`
        .pb-wrap{min-height:100dvh;background:#F1F1F4;color:#16161D;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;display:flex;gap:56px;align-items:center;justify-content:center;padding:32px 24px;box-sizing:border-box}
        .pb-phone{flex:none;width:402px;height:min(874px,calc(100dvh - 64px));border-radius:56px;background:#16161D;padding:12px;box-shadow:0 30px 80px rgba(22,22,29,.25)}
        .pb-phone iframe{width:100%;height:100%;border:0;border-radius:44px;background:#F1F1F4;display:block}
        .pb-guide{max-width:440px;display:flex;flex-direction:column;gap:18px}
        .pb-dots{display:flex;gap:8px}.pb-dots i{width:16px;height:16px;border-radius:8px;display:block}
        .pb-guide h1{font-size:44px;font-weight:800;letter-spacing:-1px;margin:0}
        .pb-guide p{margin:0;line-height:1.5;color:#555562;font-size:16px}
        .pb-guide ol{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:12px}
        .pb-guide li{background:#FBFBFD;border-radius:20px;padding:14px 18px;font-size:15px;line-height:1.45;color:#3A3A46}
        .pb-guide li b{display:block;color:#16161D;font-size:16px;margin-bottom:2px}
        .pb-guide a{color:#6C5CE7;font-weight:700}
        @media (max-width:820px){
          .pb-wrap{padding:0;display:block}
          .pb-guide{display:none}
          .pb-phone{width:100vw;height:100dvh;border-radius:0;padding:0;box-shadow:none}
          .pb-phone iframe{border-radius:0}
        }
      `}</style>
      <div className="pb-phone"><iframe src="/app" title="Plan B app" /></div>
      <section className="pb-guide">
        <div className="pb-dots" aria-hidden="true"><i style={{ background: "#3DAA6E" }} /><i style={{ background: "#EF7A92" }} /><i style={{ background: "#F6C744" }} /><i style={{ background: "#6C5CE7" }} /></div>
        <h1>Plan B</h1>
        <p>Personal exit plans for Fieldday × Riverside. A phone app, shown here in a phone frame. Use the switch at the top of the app to move between the attendee and the organizer.</p>
        <ol>
          {STEPS.map(([t, d]) => <li key={t}><b>{t}</b>{d}</li>)}
        </ol>
        <p>Want both at once? <a href="/app" target="_blank" rel="noreferrer">Open a second phone</a> in another window: one as the organizer, one as an attendee. Everyone shares the same live demo; “All clear” on the organizer screen resets it. Texts and notifications are simulated.</p>
      </section>
    </main>
  );
}
