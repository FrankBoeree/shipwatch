import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { CameraFrame } from "@/components/camera-frame";
import { ShipTypeBadge } from "@/components/ship-type-badge";
import { listPassagesPage } from "@/lib/db";
import { formatCount, formatDateTime, labelDirection } from "@/lib/format";
import type { Passage } from "@/lib/types";

export const revalidate = 15;

const PAGE_SIZE = 24;

export default async function PassagesPage({
  searchParams,
}: {
  searchParams: Promise<{ pagina?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number.parseInt(params.pagina ?? "1", 10) || 1);
  const { passages, total } = await listPassagesPage(page, PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-cyan-800">Read-only</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Passages</h1>
        </div>
        <p className="text-sm text-slate-500">
          <span className="font-semibold text-slate-900">{formatCount(total)}</span> passages geregistreerd
        </p>
      </div>

      {passages.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-slate-200 bg-white py-16">
          <p className="text-sm text-slate-500">Geen passages gevonden op deze pagina.</p>
          <Link href="/passages" className="text-sm font-medium text-cyan-900 hover:underline">
            Terug naar de eerste pagina
          </Link>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {passages.map((passage) => (
            <PassageCard key={passage.id} passage={passage} />
          ))}
        </div>
      )}

      {totalPages > 1 ? <Pagination currentPage={page} totalPages={totalPages} /> : null}
    </AppShell>
  );
}

function PassageCard({ passage }: { passage: Passage }) {
  return (
    <Link
      href={`/passages/${passage.id}`}
      className="group overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:border-cyan-700"
    >
      <CameraFrame className="bg-slate-100">
        {passage.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={passage.photoUrl}
            alt={`Passagefoto van ${passage.shipName ?? "onbekend schip"}`}
            className="absolute inset-0 h-full w-full object-contain transition-transform duration-300 group-hover:scale-[1.02]"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-500">
            Geen foto beschikbaar
          </div>
        )}
        <div className="absolute left-3 top-3 z-10">
          <ShipTypeBadge type={passage.detectedType} className="shadow-sm" />
        </div>
      </CameraFrame>
      <div className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <h2 className="truncate font-semibold text-slate-950">{passage.shipName ?? "Onbekend schip"}</h2>
          <p className="mt-1 text-sm text-slate-500">{formatDateTime(passage.occurredAt)}</p>
        </div>
        <span className="shrink-0 text-right text-xs text-slate-500">{labelDirection(passage.direction)}</span>
      </div>
    </Link>
  );
}

/** Paginanummers met weglatingstekens rond de huidige pagina. */
function pageItems(currentPage: number, totalPages: number): Array<number | "gap"> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set<number>([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
  const sorted = [...pages].filter((value) => value >= 1 && value <= totalPages).sort((a, b) => a - b);

  const items: Array<number | "gap"> = [];
  let previous = 0;
  for (const value of sorted) {
    if (previous && value - previous > 1) items.push("gap");
    items.push(value);
    previous = value;
  }
  return items;
}

function Pagination({ currentPage, totalPages }: { currentPage: number; totalPages: number }) {
  const hrefFor = (page: number) => (page === 1 ? "/passages" : `/passages?pagina=${page}`);

  return (
    <nav aria-label="Paginering" className="mt-8 flex items-center justify-center gap-1.5">
      <PaginationArrow
        href={currentPage > 1 ? hrefFor(currentPage - 1) : null}
        label="Vorige pagina"
        icon={<ChevronLeft size={16} />}
      />
      {pageItems(currentPage, totalPages).map((item, index) =>
        item === "gap" ? (
          <span key={`gap-${index}`} className="px-1 text-sm text-slate-400">
            …
          </span>
        ) : (
          <Link
            key={item}
            href={hrefFor(item)}
            aria-current={item === currentPage ? "page" : undefined}
            className={`flex h-9 min-w-9 items-center justify-center rounded-lg border px-2 text-sm font-medium transition ${
              item === currentPage
                ? "border-cyan-800 bg-cyan-800 text-white"
                : "border-slate-200 bg-white text-slate-700 hover:border-cyan-700 hover:text-cyan-900"
            }`}
          >
            {item}
          </Link>
        ),
      )}
      <PaginationArrow
        href={currentPage < totalPages ? hrefFor(currentPage + 1) : null}
        label="Volgende pagina"
        icon={<ChevronRight size={16} />}
      />
    </nav>
  );
}

function PaginationArrow({ href, label, icon }: { href: string | null; label: string; icon: React.ReactNode }) {
  if (!href) {
    return (
      <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-100 bg-slate-50 text-slate-300">
        {icon}
      </span>
    );
  }

  return (
    <Link
      href={href}
      aria-label={label}
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 transition hover:border-cyan-700 hover:text-cyan-900"
    >
      {icon}
    </Link>
  );
}
