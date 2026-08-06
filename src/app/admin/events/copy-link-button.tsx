'use client';

import { useRef, useState } from 'react';

export function CopyLinkButton({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function handleCopy() {
    const url = `${window.location.origin}/e/${slug}`;

    let ok = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        ok = true;
      }
    } catch {
      ok = false;
    }

    if (!ok) {
      window.prompt('Copy the booking link:', url);
      return;
    }

    setCopied(true);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      setCopied(false);
      timerRef.current = null;
    }, 1500);
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex h-11 w-full items-center justify-center rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-100 sm:w-auto"
    >
      {copied ? 'Copied!' : 'Copy link'}
    </button>
  );
}
