'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import { logoutAction } from '@/lib/actions/auth';

const navItems = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/venues', label: 'Venues' },
  { href: '/admin/events', label: 'Events' },
  { href: '/admin/bookings', label: 'Bookings' },
];

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function AdminNav({ adminName }: { adminName: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <>
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="min-w-0 space-y-0.5">
            <p className="text-xs font-medium uppercase text-zinc-500">Ticketing admin</p>
            <p className="truncate text-lg font-semibold leading-tight">{adminName}</p>
          </div>

          <nav aria-label="Admin navigation" className="hidden items-center gap-2 lg:flex">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="inline-flex h-11 items-center whitespace-nowrap rounded-md border border-zinc-200 px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-100 hover:text-zinc-950"
              >
                {item.label}
              </Link>
            ))}
            <form action={logoutAction}>
              <button
                type="submit"
                className="inline-flex h-11 items-center whitespace-nowrap rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-100 hover:text-zinc-950"
              >
                Logout
              </button>
            </form>
          </nav>

          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            aria-expanded={open}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-md border border-zinc-200 text-zinc-700 lg:hidden"
          >
            <MenuIcon />
          </button>
        </div>
      </header>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-zinc-950/40"
          />
          <nav
            aria-label="Admin navigation"
            className="absolute inset-y-0 right-0 flex w-72 max-w-[85vw] flex-col gap-1 border-l border-zinc-200 bg-white p-4 shadow-lg"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold text-zinc-500">Menu</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="grid h-11 w-11 place-items-center rounded-md border border-zinc-200 text-zinc-700"
              >
                <CloseIcon />
              </button>
            </div>
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="flex h-11 items-center rounded-md px-4 text-base font-medium text-zinc-900 hover:bg-zinc-100"
              >
                {item.label}
              </Link>
            ))}
            <form action={logoutAction} className="mt-auto pt-4">
              <button
                type="submit"
                className="flex h-11 w-full items-center justify-center rounded-md border border-zinc-300 px-4 text-base font-medium text-zinc-700 hover:bg-zinc-100"
              >
                Logout
              </button>
            </form>
          </nav>
        </div>
      ) : null}
    </>
  );
}
