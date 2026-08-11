import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';

import { ADMIN_SESSION_COOKIE, verifySessionValue } from '@/lib/admin-session';

export default async function Home() {
  const session = verifySessionValue(
    (await cookies()).get(ADMIN_SESSION_COOKIE)?.value,
  );
  redirect(session ? '/admin' : '/admin/login');
}
