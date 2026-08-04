import Link from 'next/link';

import { logoutAction } from '@/lib/actions/auth';
import { getAdminSession } from '@/lib/auth';

const navItems = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/venues', label: 'Venues' },
  { href: '/admin/events', label: 'Events' },
  { href: '/admin/bookings', label: 'Bookings' },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getAdminSession();

  if (!session) {
    return children;
  }

  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-950">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-0.5">
            <p className="text-xs font-medium uppercase text-zinc-500">Ticketing admin</p>
            <p className="text-lg font-semibold leading-tight">{session?.adminName ?? 'Admin'}</p>
          </div>

          <nav className="flex w-full gap-2 overflow-x-auto pb-1 lg:w-auto lg:flex-wrap lg:pb-0">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="whitespace-nowrap rounded-md border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 hover:text-zinc-950"
              >
                {item.label}
              </Link>
            ))}
            <form action={logoutAction}>
              <button
                type="submit"
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 hover:text-zinc-950"
              >
                Logout
              </button>
            </form>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:py-8">{children}</main>
    </div>
  );
}
