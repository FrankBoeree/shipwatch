import Link from "next/link";
import { Anchor, BarChart3, Camera, ShipWheel } from "lucide-react";

const navItems = [
  { href: "/", label: "Overzicht", icon: Anchor },
  { href: "/passages", label: "Passages", icon: ShipWheel },
  { href: "/ships", label: "Schepen", icon: ShipWheel },
  { href: "/stats", label: "Statistieken", icon: BarChart3 },
  ...(process.env.NODE_ENV === "development" ? [{ href: "/capture", label: "Capture", icon: Camera }] : []),
];

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f4f7f8] text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-5 md:flex-row md:items-center md:justify-between">
          <Link href="/" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-cyan-900 text-white">
              <Anchor size={21} />
            </span>
            <span>
              <span className="block text-lg font-semibold">IJ Ship Tracker</span>
              <span className="block text-sm text-slate-500">Publieke read-only viewer</span>
            </span>
          </Link>
          <nav className="flex flex-wrap gap-2">
            {navItems.map((item) => {
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:border-cyan-700 hover:text-cyan-900"
                >
                  <Icon size={16} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl px-5 py-8">{children}</main>
    </div>
  );
}
