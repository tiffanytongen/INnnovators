import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto max-w-md space-y-6 p-8">
      <h1 className="text-5xl font-black">Plan B</h1>
      <p className="text-xl text-neutral-700">Plan A is your day. Plan B is what happens when it changes.</p>
      <nav className="flex flex-col gap-3 text-lg">
        <Link className="rounded-xl bg-[#FFD400] p-4 font-bold text-black" href="/signup">Sign up (30 seconds)</Link>
        <Link className="rounded-xl border border-neutral-300 p-4" href="/demo">Demo: 3 phones + console</Link>
        <Link className="rounded-xl border border-neutral-300 p-4" href="/organiser">Organiser console</Link>
        <Link className="rounded-xl border border-neutral-300 p-4" href="/organiser/premortem">Pre-mortem</Link>
        <Link className="rounded-xl border border-neutral-300 p-4" href="/how/mei_19">How the AI makes a plan</Link>
        <div className="flex gap-3 text-neutral-500">
          <Link className="underline" href="/me/mei_19">Mei</Link>
          <Link className="underline" href="/me/tom_70">Tom</Link>
          <Link className="underline" href="/me/jake_16">Jake</Link>
        </div>
      </nav>
    </main>
  );
}
