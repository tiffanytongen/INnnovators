// Filming page: organiser console + three phones side by side.
import Console from "../organiser/Console";

const PHONES = [
  { id: "mei_19", label: "Mei, 19 · Mandarin · train to Sandringham" },
  { id: "tom_70", label: "Tom, 70 · wheelchair · accessible shuttle" },
  { id: "jake_16", label: "Jake, 16 · first-timer · parent pickup" },
];

export default function DemoPage() {
  return (
    <div className="flex min-h-dvh gap-6 bg-[#F5F4F0] p-6">
      <aside className="w-[420px] shrink-0">
        <h1 className="text-xl font-black">Plan B</h1>
        <p className="mb-4 text-sm text-neutral-500">Plan A is your day. Plan B is what happens when it changes.</p>
        <Console compact />
      </aside>
      <main className="flex flex-1 justify-center gap-5">
        {PHONES.map((p) => (
          <figure key={p.id} className="flex flex-col items-center">
            <div className="h-[780px] w-[360px] overflow-hidden rounded-[2.5rem] border-[10px] border-[#E7E4DD] bg-[#F5F4F0] shadow-2xl">
              <iframe src={`/me/${p.id}`} title={p.label} className="h-full w-full" />
            </div>
            <figcaption className="mt-2 text-sm text-neutral-500">{p.label}</figcaption>
          </figure>
        ))}
      </main>
    </div>
  );
}
