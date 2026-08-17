'use client';

import { useEffect, useRef } from 'react';

export function ConfirmationDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
      cancelRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  function onClose(event: React.SyntheticEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) {
      onCancel();
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-label={title}
      onClose={onClose}
      className="fixed inset-0 z-50 m-auto w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-0 shadow-lg backdrop:bg-zinc-950/40 open:flex open:flex-col"
    >
      <div className="space-y-3 p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-zinc-950">{title}</h2>
        <p className="text-base leading-6 text-zinc-600">{message}</p>
      </div>
      <div className="flex gap-3 border-t border-zinc-100 px-5 py-4 sm:px-6">
        <button
          ref={cancelRef}
          type="button"
          onClick={onCancel}
          className="inline-flex h-11 flex-1 items-center justify-center rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="inline-flex h-11 flex-1 items-center justify-center rounded-md border border-red-300 bg-red-600 px-4 text-sm font-medium text-white transition-colors hover:bg-red-700"
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
