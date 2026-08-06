'use client';

import { useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  try {
    window.addEventListener('storage', listener);
  } catch {
    // window unavailable — keep the in-memory listener only.
  }
  return () => {
    listeners.delete(listener);
    try {
      window.removeEventListener('storage', listener);
    } catch {
      // window unavailable.
    }
  };
}

function isHidden(storageKey: string): boolean {
  try {
    return localStorage.getItem(storageKey) === '1';
  } catch {
    return false;
  }
}

export function EventSection({
  title,
  count,
  storageKey,
  children,
}: {
  title: string;
  count: number;
  storageKey: string;
  children: React.ReactNode;
}) {
  const hidden = useSyncExternalStore(
    subscribe,
    () => isHidden(storageKey),
    () => false,
  );

  function toggle() {
    try {
      localStorage.setItem(storageKey, hidden ? '0' : '1');
    } catch {
      // localStorage unavailable — keep the in-memory state.
    }
    for (const listener of listeners) {
      listener();
    }
  }

  return (
    <section className="space-y-3">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={!hidden}
        className="flex min-h-11 w-full items-center justify-between rounded-md px-1 text-left"
      >
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          {title}
          <span className="ml-2 normal-case tracking-normal text-zinc-400">{count}</span>
        </h2>
        <span className="text-sm font-medium text-zinc-500">
          {hidden ? 'Show' : 'Hide'}
        </span>
      </button>
      {!hidden ? children : null}
    </section>
  );
}
