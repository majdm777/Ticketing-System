'use client';

import { useActionState, useState } from 'react';

import { loginAction, type LoginState } from '@/lib/actions/auth';

const initialState: LoginState = { ok: false };

function EyeIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" className="h-5 w-5">
      <path d="M10 3.5c-4.5 0-7 5-7 6.5s2.5 6.5 7 6.5 7-5 7-6.5-2.5-6.5-7-6.5Z" />
      <circle cx="10" cy="10" r="2.5" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" className="h-5 w-5">
      <path d="M3 3l14 14M8.5 4.52A6.5 6.5 0 0 1 17 10c-.36.82-1.17 2.42-2.5 3.75M5.5 7.25A6.5 6.5 0 0 0 3 10c.36.82 1.17 2.42 2.5 3.75" />
      <path d="M13.73 13.73A6.5 6.5 0 0 1 3 10c.36.82 1.17 2.42 2.5 3.75" />
      <path d="M10 16.5c4.5 0 7-5 7-6.5 0-.56-.16-1.15-.45-1.68" />
    </svg>
  );
}

export default function AdminLoginPage() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);
  const [showPassword, setShowPassword] = useState(false);

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
          <div className="relative">
            <input
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              className="w-full rounded-md border border-zinc-300 px-3 py-3 pr-12 text-base outline-none focus:border-zinc-900"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute inset-y-0 right-0 grid w-11 place-items-center text-zinc-500 transition-colors hover:text-zinc-700"
            >
              {showPassword ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
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
