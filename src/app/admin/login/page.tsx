'use client';

import { useActionState } from 'react';

import { loginAction, type LoginState } from '@/lib/actions/auth';

const initialState: LoginState = { ok: false };

export default function AdminLoginPage() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-100 px-4 py-8 text-zinc-950 sm:px-6 sm:py-12">
      <form
        action={formAction}
        className="w-full max-w-md space-y-5 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6"
      >
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Admin login</h1>
          <p className="text-sm leading-6 text-zinc-600">Sign in to manage events and bookings.</p>
        </div>

        <label className="block space-y-2 text-sm font-medium">
          <span>Name</span>
          <input
            name="adminName"
            type="text"
            autoComplete="username"
            className="w-full rounded-md border border-zinc-300 px-3 py-3 text-base outline-none focus:border-zinc-900"
          />
        </label>

        <label className="block space-y-2 text-sm font-medium">
          <span>Password</span>
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            className="w-full rounded-md border border-zinc-300 px-3 py-3 text-base outline-none focus:border-zinc-900"
          />
        </label>

        {state.error ? (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {state.error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-zinc-950 px-4 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-zinc-500"
        >
          {pending ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
