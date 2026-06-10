import { AppShell } from "@/components/app-shell";
import { PassageTable } from "@/components/passage-table";
import { listPassages } from "@/lib/db";
export const revalidate = 15;

export default async function PassagesPage() {
  const passages = await listPassages(100);

  return (
    <AppShell>
      <div className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-cyan-800">Read-only</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Passages</h1>
      </div>
      <PassageTable passages={passages} />
    </AppShell>
  );
}
