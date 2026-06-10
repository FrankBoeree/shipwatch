import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getPassage } from "@/lib/db";
import { formatDateTime, formatPercent, labelDirection, labelShipType } from "@/lib/format";
export const revalidate = 15;

export default async function PassageDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const passage = await getPassage(id);

  if (!passage) {
    notFound();
  }

  return (
    <AppShell>
      <div className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-cyan-800">Passage</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{passage.shipName ?? "Onbekend schip"}</h1>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          {passage.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={passage.photoUrl} alt="Passagefoto" className="aspect-video w-full rounded-md object-cover" />
          ) : (
            <div className="flex aspect-video items-center justify-center rounded-md bg-slate-100 text-sm text-slate-500">
              Geen foto beschikbaar in demo-data
            </div>
          )}
        </section>
        <aside className="rounded-lg border border-slate-200 bg-white p-5">
          <dl className="space-y-4 text-sm">
            <div>
              <dt className="font-medium text-slate-500">Tijd</dt>
              <dd className="mt-1 text-slate-950">{formatDateTime(passage.occurredAt)}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Type</dt>
              <dd className="mt-1 text-slate-950">{labelShipType(passage.detectedType)}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Richting</dt>
              <dd className="mt-1 text-slate-950">{labelDirection(passage.direction)}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Confidence</dt>
              <dd className="mt-1 text-slate-950">{formatPercent(passage.detectionConfidence)}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Identificatie</dt>
              <dd className="mt-1 capitalize text-slate-950">{passage.identificationStatus}</dd>
            </div>
          </dl>
        </aside>
      </div>
    </AppShell>
  );
}
