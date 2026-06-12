import { WEEKDAY_LABELS_SHORT, type DashboardStats } from "@/lib/dashboard-stats";

function cellColor(count: number, max: number): string {
  if (count === 0 || max === 0) return "#f1f5f9";
  const intensity = 0.12 + 0.88 * (count / max);
  return `rgba(8, 145, 178, ${intensity.toFixed(2)})`;
}

export function PeakHeatmap({ heatmap }: { heatmap: DashboardStats["heatmap"] }) {
  const hourLabels = Array.from({ length: 24 }, (_, hour) => (hour % 3 === 0 ? String(hour).padStart(2, "0") : ""));

  return (
    <section className="flex h-full flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Piekmomenten</h2>
          <p className="mt-1 text-sm text-slate-500">
            Wanneer is het druk op het IJ? Per weekdag en uur, laatste {heatmap.weeks} weken.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          Rustig
          <span
            className="h-2.5 w-20 rounded-full"
            style={{ background: "linear-gradient(to right, #f1f5f9, rgba(8,145,178,1))" }}
          />
          Druk
        </div>
      </div>

      <div className="mt-6 flex-1 overflow-x-auto">
        <div className="min-w-[560px]">
          <div className="grid grid-cols-[2.25rem_repeat(24,minmax(0,1fr))] gap-1">
            {heatmap.cells.map((row, dayIndex) => (
              <div key={WEEKDAY_LABELS_SHORT[dayIndex]} className="contents">
                <div className="flex items-center text-xs font-medium text-slate-500">
                  {WEEKDAY_LABELS_SHORT[dayIndex]}
                </div>
                {row.map((count, hour) => (
                  <div
                    key={hour}
                    className="aspect-square min-h-4 rounded-[4px] transition-transform hover:scale-110 hover:ring-2 hover:ring-cyan-600/40"
                    style={{ backgroundColor: cellColor(count, heatmap.max) }}
                    title={`${WEEKDAY_LABELS_SHORT[dayIndex]} ${String(hour).padStart(2, "0")}:00 – ${count} passages in ${heatmap.weeks} weken`}
                  />
                ))}
              </div>
            ))}
            <div />
            {hourLabels.map((label, hour) => (
              <div key={hour} className="text-center text-[10px] text-slate-400">
                {label}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
