'use client';

import { useEffect, useRef, useState } from 'react';

function ArrowUpIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-5 w-5"
    >
      <path d="M10 16V4M4 10l6-6 6 6" />
    </svg>
  );
}

export function ScrollToTop({ threshold = 300 }: { threshold?: number }) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setVisible(window.scrollY > threshold);

    function onScroll() {
      if (timerRef.current !== null) {
        return;
      }
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        setVisible(window.scrollY > threshold);
      }, 100);
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [threshold]);

  if (!visible) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="Scroll back to top"
      className="fixed bottom-6 right-6 z-40 grid h-12 w-12 place-items-center rounded-full border border-zinc-200 bg-white text-zinc-700 shadow-lg transition-colors hover:bg-zinc-50 sm:bottom-8 sm:right-8"
    >
      <ArrowUpIcon />
    </button>
  );
}
