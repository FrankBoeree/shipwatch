"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { CameraFrame } from "@/components/camera-frame";
import { ShipTypeBadge } from "@/components/ship-type-badge";
import type { Passage } from "@/lib/types";
import { formatDateTime, labelDirection } from "@/lib/format";

export function PassageCarousel({ passages }: { passages: Passage[] }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    setCanScrollLeft(scroller.scrollLeft > 4);
    setCanScrollRight(scroller.scrollLeft < scroller.scrollWidth - scroller.clientWidth - 4);
  }, []);

  useEffect(() => {
    updateScrollState();
    window.addEventListener("resize", updateScrollState);
    return () => window.removeEventListener("resize", updateScrollState);
  }, [updateScrollState]);

  const scrollByCard = (direction: 1 | -1) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const card = scroller.querySelector("article");
    const step = card ? card.clientWidth + 20 : scroller.clientWidth * 0.8;
    scroller.scrollBy({ left: direction * step, behavior: "smooth" });
  };

  if (passages.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-slate-200 bg-white py-16">
        <p className="text-sm text-slate-500">Nog geen passages geregistreerd.</p>
      </div>
    );
  }

  return (
    <div className="relative">
      <div
        ref={scrollerRef}
        onScroll={updateScrollState}
        className="flex snap-x snap-mandatory gap-5 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {passages.map((passage) => (
          <article
            key={passage.id}
            className="w-96 shrink-0 snap-start overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:border-cyan-700 sm:w-[26rem] lg:w-[30rem]"
          >
            <Link href={`/passages/${passage.id}`} className="block">
              <CameraFrame className="bg-slate-100">
                {passage.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={passage.photoUrl}
                    alt={`Passagefoto van ${passage.shipName ?? "onbekend schip"}`}
                    className="absolute inset-0 h-full w-full object-contain"
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
              <div className="p-4">
                <h3 className="truncate font-semibold text-slate-950">{passage.shipName ?? "Onbekend schip"}</h3>
                <p className="mt-1 text-sm text-slate-500">{formatDateTime(passage.occurredAt)}</p>
                <p className="mt-1 text-xs text-slate-500">{labelDirection(passage.direction)}</p>
              </div>
            </Link>
          </article>
        ))}
      </div>

      <CarouselButton direction="left" onClick={() => scrollByCard(-1)} visible={canScrollLeft} />
      <CarouselButton direction="right" onClick={() => scrollByCard(1)} visible={canScrollRight} />
    </div>
  );
}

function CarouselButton({
  direction,
  onClick,
  visible,
}: {
  direction: "left" | "right";
  onClick: () => void;
  visible: boolean;
}) {
  const Icon = direction === "left" ? ChevronLeft : ChevronRight;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={direction === "left" ? "Vorige schepen" : "Volgende schepen"}
      className={`absolute top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-md transition hover:border-cyan-700 hover:text-cyan-900 ${
        direction === "left" ? "-left-3" : "-right-3"
      } ${visible ? "opacity-100" : "pointer-events-none opacity-0"}`}
    >
      <Icon size={20} />
    </button>
  );
}
