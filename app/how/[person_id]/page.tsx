import { Suspense } from "react";
import HowView from "./HowView";

export default function HowPage() {
  return (
    <Suspense fallback={<p className="p-8">Loading…</p>}>
      <HowView />
    </Suspense>
  );
}
