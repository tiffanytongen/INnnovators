"use client";
// 30-second sign-up from the ticket email link. Creates a profile, then opens the plan screen.
import { useState } from "react";
import { useRouter } from "next/navigation";

const LANGS = [["en", "English"], ["zh", "中文"], ["vi", "Tiếng Việt"], ["ar", "العربية"], ["hi", "हिन्दी"], ["es", "Español"], ["ko", "한국어"]];
const LINES = ["Sandringham", "Frankston", "Belgrave", "Lilydale", "Craigieburn", "Werribee", "Hurstbridge", "Pakenham"];

export default function SignupPage() {
  const router = useRouter();
  const [f, setF] = useState({ name: "", age: "", lang: "en", mode: "train", line: "Sandringham", zone: "pickup_zone_2", contact: "parent", group_size: "1", wheelchair: false, step_free: false, first_timer: false });
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string | boolean) => setF({ ...f, [k]: v });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = await fetch("/api/profile", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(f) });
    const { id } = await r.json();
    router.push(`/me/${id}`);
  }

  const field = "w-full rounded-xl border border-neutral-300 bg-white border border-[#E7E4DD] p-3 text-lg";
  const chip = (on: boolean) => `rounded-xl border p-3 text-lg ${on ? "border-[#FFD400] bg-[#FFD400] font-bold text-black" : "border-neutral-300"}`;

  return (
    <form onSubmit={submit} className="mx-auto max-w-md space-y-5 p-5">
      <h1 className="text-3xl font-black">Your Plan B</h1>
      <p className="text-neutral-500">30 seconds. We use this to plan your way home tonight, and what to do if things change.</p>

      <div className="grid grid-cols-[1fr_6rem] gap-3">
        <input required placeholder="First name" value={f.name} onChange={(e) => set("name", e.target.value)} className={field} />
        <input required placeholder="Age" inputMode="numeric" value={f.age} onChange={(e) => set("age", e.target.value)} className={field} />
      </div>

      <select value={f.lang} onChange={(e) => set("lang", e.target.value)} className={field} aria-label="Language">
        {LANGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-neutral-500">How are you getting home?</legend>
        <div className="grid grid-cols-3 gap-2">
          {[["train", "Train"], ["shuttle", "Shuttle"], ["pickup", "Pickup"]].map(([v, l]) => (
            <button type="button" key={v} onClick={() => set("mode", v)} className={chip(f.mode === v)}>{l}</button>
          ))}
        </div>
        {f.mode === "train" && (
          <select value={f.line} onChange={(e) => set("line", e.target.value)} className={field} aria-label="Train line">
            {LINES.map((l) => <option key={l} value={l}>{l} line</option>)}
          </select>
        )}
        {f.mode === "pickup" && (
          <div className="grid grid-cols-2 gap-2">
            <select value={f.zone} onChange={(e) => set("zone", e.target.value)} className={field} aria-label="Pickup zone">
              <option value="pickup_zone_1">Zone 1 (Gate A)</option>
              <option value="pickup_zone_2">Zone 2 (Gate B)</option>
              <option value="pickup_zone_3">Zone 3 (Gate D, accessible)</option>
            </select>
            <select value={f.contact} onChange={(e) => set("contact", e.target.value)} className={field} aria-label="Who picks you up">
              <option value="parent">Parent</option>
              <option value="friend">Friend</option>
              <option value="partner">Partner</option>
            </select>
          </div>
        )}
      </fieldset>

      <label className="flex items-center justify-between text-lg">
        <span>People in your group</span>
        <input inputMode="numeric" value={f.group_size} onChange={(e) => set("group_size", e.target.value)} className="w-20 rounded-xl border border-neutral-300 bg-white border border-[#E7E4DD] p-3 text-center" />
      </label>

      <div className="grid grid-cols-1 gap-2">
        <button type="button" onClick={() => set("wheelchair", !f.wheelchair)} className={chip(f.wheelchair)}>I use a wheelchair</button>
        <button type="button" onClick={() => set("step_free", !f.step_free)} className={chip(f.step_free)}>I need step-free routes</button>
        <button type="button" onClick={() => set("first_timer", !f.first_timer)} className={chip(f.first_timer)}>It&apos;s my first festival</button>
      </div>

      <button disabled={busy} className="w-full rounded-2xl bg-[#FFD400] py-4 text-xl font-black text-black disabled:opacity-60">
        {busy ? "Making your plan…" : "Make my plan"}
      </button>
      <p className="text-xs text-neutral-500">Your plans are saved on your phone. Data is deleted after the event. Medical needs? Tell the info tent — staff handle those, not the app.</p>
    </form>
  );
}
