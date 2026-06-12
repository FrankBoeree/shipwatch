import { ArrowLeft, ArrowRight, Sparkles } from "lucide-react";
import { formatCount } from "@/lib/format";
import type { DashboardStats } from "@/lib/dashboard-stats";

function SplitBar({ left, right, leftColor, rightColor }: { left: number; right: number; leftColor: string; rightColor: string }) {
  const total = left + right;
  const leftPct = total > 0 ? (left / total) * 100 : 50;

  return (
    <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">
      <div className={`${leftColor} transition-all duration-500`} style={{ width: `${leftPct}%` }} />
      <div className={`${rightColor} flex-1 transition-all duration-500`} />
    </div>
  );
}

export function DirectionCard({
  direction,
  newVsReturning,
}: {
  direction: DashboardStats["direction30d"];
  newVsReturning: DashboardStats["newVsReturning"];
}) {
  const { towardIJmuiden, towardIJmeer } = direction;
  const directionTotal = towardIJmuiden + towardIJmeer;
  const recognitionTotal = newVsReturning.newShips + newVsReturning.returningShips;

  return (
    <section className="flex h-full flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <h2 className="text-lg font-semibold text-slate-950">Vaarrichting</h2>
      <p className="mt-1 text-sm text-slate-500">Waar varen de schepen heen? Laatste 30 dagen</p>

      <div className="mt-6 grid grid-cols-2 gap-4">
        <div className="rounded-lg bg-amber-50 p-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-700">
            <ArrowLeft size={14} /> IJmuiden
          </p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{formatCount(towardIJmuiden)}</p>
          <p className="text-xs text-slate-500">
            {directionTotal > 0 ? `${Math.round((towardIJmuiden / directionTotal) * 100)}% van de passages` : "Geen passages"}
          </p>
        </div>
        <div className="rounded-lg bg-cyan-50 p-4">
          <p className="flex items-center justify-end gap-1.5 text-right text-xs font-semibold uppercase tracking-wide text-cyan-700">
            IJmeer <ArrowRight size={14} />
          </p>
          <p className="mt-2 text-right text-2xl font-semibold text-slate-950">{formatCount(towardIJmeer)}</p>
          <p className="text-right text-xs text-slate-500">
            {directionTotal > 0 ? `${Math.round((towardIJmeer / directionTotal) * 100)}% van de passages` : "Geen passages"}
          </p>
        </div>
      </div>

      <div className="mt-3">
        <SplitBar left={towardIJmuiden} right={towardIJmeer} leftColor="bg-amber-500" rightColor="bg-cyan-600" />
      </div>

      <div className="mt-6 border-t border-slate-100 pt-5">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
          <Sparkles size={15} className="text-cyan-700" /> Nieuw of bekend?
        </p>
        <div className="mt-3">
          <SplitBar
            left={newVsReturning.newShips}
            right={newVsReturning.returningShips}
            leftColor="bg-emerald-500"
            rightColor="bg-slate-300"
          />
        </div>
        <div className="mt-2 flex justify-between text-xs text-slate-500">
          <span>
            <span className="font-semibold text-emerald-700">{formatCount(newVsReturning.newShips)}</span> nieuw gespot
          </span>
          <span>
            <span className="font-semibold text-slate-700">{formatCount(newVsReturning.returningShips)}</span> eerder gezien
          </span>
        </div>
        {recognitionTotal === 0 ? <p className="mt-2 text-xs text-slate-400">Nog geen passages in deze periode.</p> : null}
      </div>
    </section>
  );
}
