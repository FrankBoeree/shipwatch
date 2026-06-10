import { AppShell } from "@/components/app-shell";
import { notFound } from "next/navigation";
import { CaptureClient } from "./capture-client";

export default function CapturePage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  return (
    <AppShell>
      <div className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-cyan-800">Lokale capture</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Camera invoer</h1>
        <p className="mt-2 max-w-2xl text-slate-600">
          Open deze pagina lokaal op de laptop met webcam. De huidige lokale motion-mode toont beweging voor debugging, maar registreert geen passages als schip.
        </p>
      </div>
      <CaptureClient />
    </AppShell>
  );
}
