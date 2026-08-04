import { getAdminSession } from '@/lib/auth';

import { AdminNav } from './admin-nav';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getAdminSession();

  if (!session) {
    return children;
  }

  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-950">
      <AdminNav adminName={session.adminName} />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:py-8">{children}</main>
    </div>
  );
}
