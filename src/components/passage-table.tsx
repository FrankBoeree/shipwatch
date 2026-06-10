import Link from "next/link";
import { ShipTypeBadge } from "@/components/ship-type-badge";
import type { Passage } from "@/lib/types";
import { formatDateTime, formatPercent, labelDirection } from "@/lib/format";

export function PassageTable({ passages }: { passages: Passage[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <table className="w-full min-w-[860px] border-collapse text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th className="px-4 py-3">Foto</th>
            <th className="px-4 py-3">Tijd</th>
            <th className="px-4 py-3">Schip</th>
            <th className="px-4 py-3">Type</th>
            <th className="px-4 py-3">Richting</th>
            <th className="px-4 py-3">Confidence</th>
            <th className="px-4 py-3">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {passages.map((passage) => (
            <tr key={passage.id} className="hover:bg-slate-50">
              <td className="w-28 px-4 py-3">
                <Link
                  href={`/passages/${passage.id}`}
                  className="block w-24 overflow-hidden rounded-md bg-slate-100 ring-1 ring-slate-200 aspect-camera"
                  aria-label={`Bekijk passagefoto van ${passage.shipName ?? "onbekend schip"}`}
                >
                  {passage.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={passage.photoUrl}
                      alt={`Passagefoto van ${passage.shipName ?? "onbekend schip"}`}
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center px-2 text-center text-[11px] leading-tight text-slate-500">
                      Geen foto
                    </span>
                  )}
                </Link>
              </td>
              <td className="px-4 py-3 font-medium text-slate-900">{formatDateTime(passage.occurredAt)}</td>
              <td className="px-4 py-3">
                <Link href={`/passages/${passage.id}`} className="text-cyan-900 hover:underline">
                  {passage.shipName ?? "Onbekend schip"}
                </Link>
                {passage.mmsi ? <span className="block text-xs text-slate-500">MMSI {passage.mmsi}</span> : null}
              </td>
              <td className="px-4 py-3">
                <ShipTypeBadge type={passage.detectedType} />
              </td>
              <td className="px-4 py-3">{labelDirection(passage.direction)}</td>
              <td className="px-4 py-3">{formatPercent(passage.detectionConfidence)}</td>
              <td className="px-4 py-3 capitalize">{passage.identificationStatus}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
