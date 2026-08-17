'use client';

import { useEffect, useRef, useState } from 'react';

function CheckIcon({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M4 10.5l4 4 8-8"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className={className ?? 'h-4 w-4'}
    >
      <rect
        x="6.5"
        y="6.5"
        width="9"
        height="9"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M13.5 6.5V5a1.5 1.5 0 0 0-1.5-1.5H5A1.5 1.5 0 0 0 3.5 5v7A1.5 1.5 0 0 0 5 13.5h1.5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

export function CopyCodeButton({
  value,
  compact = false,
}: {
  value: string;
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const resetTimer = useRef<number | undefined>(undefined);
  const copyAttempt = useRef(0);

  useEffect(() => {
    return () => {
      copyAttempt.current += 1;
      if (resetTimer.current !== undefined) {
        window.clearTimeout(resetTimer.current);
      }
    };
  }, []);

  async function copy() {
    const attempt = ++copyAttempt.current;
    try {
      await navigator.clipboard.writeText(value);
      if (attempt !== copyAttempt.current) return;
      setFailed(false);
      setCopied(true);
    } catch {
      if (attempt !== copyAttempt.current) return;
      setCopied(false);
      setFailed(true);
    }
    if (attempt !== copyAttempt.current) return;
    if (resetTimer.current !== undefined) {
      window.clearTimeout(resetTimer.current);
    }
    resetTimer.current = window.setTimeout(() => {
      setCopied(false);
      setFailed(false);
    }, 2000);
  }

  if (compact) {
    return (
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? 'Copied' : failed ? 'Copy failed' : 'Copy code'}
        aria-live="polite"
        className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
      >
        {copied ? (
          <CheckIcon className="h-4 w-4 text-emerald-600" />
        ) : (
          <CopyIcon className={failed ? 'text-red-600' : undefined} />
        )}
      </button>
    );
  }

  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        type="button"
        onClick={copy}
        aria-label="Copy payment reference code"
        aria-live="polite"
        className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-md border border-zinc-600 px-3 text-sm font-medium text-white transition-colors hover:border-zinc-400"
      >
        {copied ? (
          <CheckIcon className="h-4 w-4" />
        ) : (
          <CopyIcon />
        )}
        {copied ? 'Copied' : 'Copy'}
      </button>
      {failed ? (
        <p role="status" className="max-w-full text-sm text-zinc-300">
          Copy failed — press and hold the code to copy it manually.
        </p>
      ) : null}
    </div>
  );
}
