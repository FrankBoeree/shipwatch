import Link from "next/link";
import { CameraFrame } from "@/components/camera-frame";
import type { Passage } from "@/lib/types";
import { formatDateTime, formatPercent, labelDirection, labelShipType } from "@/lib/format";

export function PassageGrid({ passages }: { passages: Passage[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {passages.map((passage) => (
        <Link
          key={passage.id}
          href={`/passages/${passage.id}`}
          className="overflow-hidden rounded-lg border border-slate-200 bg-white hover:border-cyan-700"
        >
          <CameraFrame className="bg-slate-100">
            {passage.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={passage.photoUrl}
                alt={`Passagefoto van ${passage.shipName ?? "onbekend schip"}`}
                className="absolute inset-0 h-full w-full object-contain"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-500">Geen foto beschikbaar</div>
            )}
          </CameraFrame>
          <div className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-950">{passage.shipName ?? "Onbekend schip"}</h3>
                <p className="mt-1 text-sm text-slate-500">{formatDateTime(passage.occurredAt)}</p>
              </div>
              <span className="shrink-0 rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                {formatPercent(passage.detectionConfidence)}
              </span>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs font-medium uppercase text-slate-500">Type</dt>
                <dd className="mt-1 text-slate-900">{labelShipType(passage.detectedType)}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase text-slate-500">Richting</dt>
                <dd className="mt-1 text-slate-900">{labelDirection(passage.direction)}</dd>
              </div>
            </dl>
            {passage.mmsi ? <p className="mt-3 text-xs text-slate-500">MMSI {passage.mmsi}</p> : null}
          </div>
        </Link>
      ))}
    </div>
  );
}
