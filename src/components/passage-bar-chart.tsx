"use client";

import { useEffect, useMemo, useState } from "react";
import { formatPeriodLabel } from "@/lib/format";
import type { PassageTimeBucket, TimeGranularity } from "@/lib/types";

type PassageBarChartProps = {
  initialBuckets: PassageTimeBucket[];
  initialGranularity?: TimeGranularity;
};

const granularityOptions: Array<{ value: TimeGranularity; label: string }> = [
  { value: "day", label: "Dag" },
  { value: "week", label: "Week" },
  { value: "month", label: "Maand" },
];

export function PassageBarChart({ initialBuckets, initialGranularity = "day" }: PassageBarChartProps) {
  const [granularity, setGranularity] = useState<TimeGranularity>(initialGranularity);
  const [splitByDirection, setSplitByDirection] = useState(false);
  const [buckets, setBuckets] = useState(initialBuckets);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (granularity === initialGranularity) {
      setBuckets(initialBuckets);
      return;
    }

    let cancelled = false;

    async function loadBuckets() {
      setLoading(true);

      try {
        const response = await fetch(`/api/stats/passages-over-time?granularity=${granularity}`);
        if (!response.ok) return;

        const payload = (await response.json()) as { buckets: PassageTimeBucket[] };
        if (!cancelled) {
          setBuckets(payload.buckets);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadBuckets();

    return () => {
      cancelled = true;
    };
  }, [granularity, initialBuckets, initialGranularity]);

  const maxValue = useMemo(() => {
    if (buckets.length === 0) return 1;

    if (splitByDirection) {
      return Math.max(
        ...buckets.flatMap((bucket) => [bucket.leftToRight, bucket.rightToLeft]),
        1,
      );
    }

    return Math.max(...buckets.map((bucket) => bucket.total), 1);
  }, [buckets, splitByDirection]);

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-semibold">Passages over tijd</h2>
          <p className="mt-1 text-sm text-slate-500">
            Bekijk het aantal passages per dag, week of maand. Optioneel gesplitst op vaarrichting.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-1">
            {granularityOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setGranularity(option.value)}
                className={`rounded px-3 py-1.5 text-sm font-medium transition ${
                  granularity === option.value
                    ? "bg-white text-cyan-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={splitByDirection}
              onChange={(event) => setSplitByDirection(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-cyan-800 focus:ring-cyan-700"
            />
            Per richting
          </label>
        </div>
      </div>

      {splitByDirection ? (
        <div className="mt-4 flex flex-wrap gap-4 text-sm">
          <LegendSwatch color="bg-cyan-700" label="Links naar rechts" />
          <LegendSwatch color="bg-amber-600" label="Rechts naar links" />
        </div>
      ) : null}

      <div className={`mt-6 ${loading ? "opacity-60" : ""}`}>
        {buckets.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-500">Geen passages in deze periode.</p>
        ) : (
          <div className="overflow-x-auto pb-2">
            <div
              className="flex min-w-full items-end gap-2"
              style={{ minHeight: "16rem" }}
              role="img"
              aria-label="Staafdiagram met passages over tijd"
            >
              {buckets.map((bucket) => (
                <div key={bucket.period} className="flex min-w-10 flex-1 flex-col items-center gap-2">
                  <div className="flex h-52 w-full items-end justify-center gap-1">
                    {splitByDirection ? (
                      <>
                        <Bar
                          value={bucket.leftToRight}
                          max={maxValue}
                          color="bg-cyan-700"
                          title={`Links naar rechts: ${bucket.leftToRight}`}
                        />
                        <Bar
                          value={bucket.rightToLeft}
                          max={maxValue}
                          color="bg-amber-600"
                          title={`Rechts naar links: ${bucket.rightToLeft}`}
                        />
                      </>
                    ) : (
                      <Bar
                        value={bucket.total}
                        max={maxValue}
                        color="bg-cyan-800"
                        title={`Totaal: ${bucket.total}`}
                        wide
                      />
                    )}
                  </div>
                  <div className="text-center">
                    <p className="text-xs font-medium text-slate-700">
                      {formatPeriodLabel(bucket.period, granularity)}
                    </p>
                    <p className="text-[11px] text-slate-500">{bucket.total}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function Bar({
  value,
  max,
  color,
  title,
  wide = false,
}: {
  value: number;
  max: number;
  color: string;
  title: string;
  wide?: boolean;
}) {
  const height = value === 0 ? 0 : Math.max(8, (value / max) * 100);

  return (
    <div
      className={`${wide ? "w-full max-w-8" : "w-3.5"} rounded-t-sm ${color} transition-all duration-300`}
      style={{ height: `${height}%` }}
      title={title}
      aria-label={title}
    />
  );
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`h-3 w-3 rounded-sm ${color}`} />
      {label}
    </span>
  );
}
