'use server';

import { redirect } from 'next/navigation';

import { clearAdminSession, setAdminSession, verifyPassword } from '@/lib/auth';

export type LoginState = {
  ok: boolean;
  error?: string;
};

export async function loginAction(
  _previousState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const adminName = String(formData.get('adminName') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  if (!adminName || !password) {
    return { ok: false, error: 'Enter your name and password.' };
  }

  if (!verifyPassword(password)) {
    return { ok: false, error: 'Invalid admin credentials.' };
  }

  try {
    await setAdminSession(adminName);
  } catch {
    return { ok: false, error: 'Admin session is not configured.' };
  }

  redirect('/admin');
}

export async function logoutAction() {
  await clearAdminSession();
  redirect('/admin/login');
}
