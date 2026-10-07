import Link from "next/link";
import Console from "./Console";

export default function OrganiserPage() {
  return (
    <div className="mx-auto max-w-5xl p-6">
      <header className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-black">Plan B · Organiser</h1>
          <p className="text-neutral-500">Something changed? Tell us in one sentence. Every attendee&apos;s phone gets their own next step.</p>
        </div>
        <Link href="/organiser/premortem" className="text-neutral-500 underline">Pre-mortem →</Link>
      </header>
      <Console />
    </div>
  );
}
