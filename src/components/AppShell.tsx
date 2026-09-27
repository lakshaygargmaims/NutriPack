'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { clsx } from 'clsx';

const NAV = [
  { href: '/', label: 'Home' },
  { href: '/solution', label: 'Complete Solution' },
  { href: '/analyzer', label: 'New Analysis' },
  { href: '/route', label: 'Route Intelligence' },
  { href: '/supply-chain', label: 'Supply Chain' },
  { href: '/farmer', label: 'Farmer Mode' },
  { href: '/formats', label: 'Formats & Parts' },
  { href: '/materials', label: 'Materials' },
  { href: '/compare', label: 'Compare' },
  { href: '/twin', label: 'Packaging Model' },
  { href: '/validation', label: 'Validation Lab' },
  { href: '/projects', label: 'Projects' },
  { href: '/admin', label: 'Admin' },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<{ name: string; role: string } | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('nutripack.auth');
      if (raw) setUser(JSON.parse(raw));
    } catch {}
  }, [pathname]);

  function logout() {
    localStorage.removeItem('nutripack.auth');
    setUser(null);
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 border-b border-ink-200 bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 h-14 flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 font-bold text-ink-900">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600 text-white text-sm">P</span>
            <span>
              Nutri<span className="text-brand-600">Pack</span>
            </span>
          </Link>
          <nav className="hidden lg:flex items-center gap-1 text-sm">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={clsx(
                  'px-2.5 py-1.5 rounded-lg font-medium',
                  pathname === n.href ? 'bg-brand-50 text-brand-700' : 'text-ink-600 hover:bg-ink-100',
                )}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            {user ? (
              <>
                <span className="hidden sm:block text-xs text-ink-500">
                  {user.name} · {user.role}
                </span>
                <button onClick={logout} className="btn-ghost !py-1.5 !px-3 text-xs">
                  Sign out
                </button>
              </>
            ) : (
              <Link href="/login" className="btn-primary !py-1.5 !px-3 text-xs">
                Sign in
              </Link>
            )}
            <button className="lg:hidden btn-ghost !p-2" onClick={() => setOpen(!open)} aria-label="Toggle menu">
              ☰
            </button>
          </div>
        </div>
        {open && (
          <nav className="lg:hidden border-t border-ink-200 bg-white px-4 py-2 flex flex-col">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className="py-2 text-sm text-ink-700">
                {n.label}
              </Link>
            ))}
          </nav>
        )}
      </header>
      <main className="flex-1 mx-auto w-full max-w-7xl px-4 py-6">{children}</main>
      <footer className="border-t border-ink-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-4 text-xs text-ink-500 flex flex-col sm:flex-row gap-2 justify-between">
          <span>NutriPack — “Intelligent Packaging. Smarter Decisions.” (SIH 2026 prototype)</span>
          <span>All shelf-life and impact figures are model-based estimates requiring experimental validation.</span>
        </div>
      </footer>
    </div>
  );
}
