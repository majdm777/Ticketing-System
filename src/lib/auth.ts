import { cookies } from 'next/headers';

import {
  ADMIN_SESSION_COOKIE,
  createSessionValue,
  sessionExpiresAt,
  verifySessionValue,
} from './admin-session';

export { ADMIN_SESSION_COOKIE, verifyPassword } from './admin-session';

export async function getAdminSession() {
  const cookieStore = await cookies();
  return verifySessionValue(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
}

export async function setAdminSession(adminName: string) {
  const cookieStore = await cookies();

  cookieStore.set({
    name: ADMIN_SESSION_COOKIE,
    value: createSessionValue(adminName),
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    expires: sessionExpiresAt(),
    path: '/',
  });
}

export async function clearAdminSession() {
  const cookieStore = await cookies();

  cookieStore.set({
    name: ADMIN_SESSION_COOKIE,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 0,
    path: '/',
  });
}
