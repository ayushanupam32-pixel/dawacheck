import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { LabelTool } from "@/components/label-tool";

export const metadata = {
  title: "Labeling tool | DawaCheck (local only)",
  robots: { index: false },
};

// Local development tool for the evaluation. On the live site it shows "not found".
// With Cache Components, anything that waits for a request must sit inside <Suspense>, so the
// shell can still be pre-rendered; the check itself runs per request.
async function DevOnly() {
  await connection();
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <>
      <h1 className="text-2xl font-bold">Evaluation labeling tool (local only)</h1>
      <LabelTool />
    </>
  );
}

export default function LabelPage() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 px-4 py-6">
      <Suspense fallback={null}>
        <DevOnly />
      </Suspense>
    </div>
  );
}
