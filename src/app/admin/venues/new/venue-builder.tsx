'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { buildSectionColorMap } from '@/lib/section-colors';
import { formatPrice } from '@/lib/currency';
import { SeatMap } from '@/components/seat-map';
import {
  createVenueAction,
  updateVenueAction,
  type VenueActionState,
} from '@/lib/actions/venues';

type RowDraft = {
  id: string;
  label: string;
  seatCount: number | null;
};

export type VenueBuilderInitialData = {
  name: string;
  address: string;
  rows: { id: string; label: string; seatCount: number }[];
  assignments: Record<string, string>;
  sectionPrices: Record<string, string>;
  gPrice: string;
};



function defaultRowLabel(index: number): string {
  let label = '';
  let n = index;
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}

function nextAvailableLabel(rows: RowDraft[]): string {
  const used = new Set(rows.map((row) => row.label));
  let index = 0;
  while (used.has(defaultRowLabel(index))) {
    index += 1;
  }
  return defaultRowLabel(index);
}

function maxRowIdNumber(rows: { id: string }[]): number {
  let max = 0;
  for (const row of rows) {
    const match = /^row-(\d+)$/.exec(row.id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return max;
}

function seatKey(rowId: string, seatNumber: number): string {
  return `${rowId}__${seatNumber}`;
}

function validPrice(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function VenueBuilder({
  initialData,
  venueId,
}: {
  initialData?: VenueBuilderInitialData;
  venueId?: string;
}) {
  const rowIdCounterRef = useRef(maxRowIdNumber(initialData?.rows ?? []));

  const [rows, setRows] = useState<RowDraft[]>(
    initialData
      ? initialData.rows.map((r) => ({ id: r.id, label: r.label, seatCount: r.seatCount }))
      : [{ id: 'row-initial', label: 'A', seatCount: 8 }]
  );
  // Committed assignments: seatKey -> section name. This is the real,
  // saved state of the venue-in-progress.
  const [assignments, setAssignments] = useState<Record<string, string>>(
    initialData?.assignments ?? {}
  );

  // The section currently being built: its name and price, and the set of
  // seats toggled "in" for it so far, not yet committed to `assignments`.
  const [draftSectionName, setDraftSectionName] = useState('');
  const [draftSectionPrice, setDraftSectionPrice] = useState('');
  const [selectedSeats, setSelectedSeats] = useState<Set<string>>(new Set());

  // Committed section prices, keyed by section name. "G" (the default for
  // unassigned seats) is tracked separately since it never goes through the
  // assign flow.
  const [sectionPrices, setSectionPrices] = useState<Record<string, string>>(
    initialData?.sectionPrices ?? {}
  );
  const [gPrice, setGPrice] = useState(initialData?.gPrice ?? '');

  const [name, setName] = useState(initialData?.name ?? '');
  const [address, setAddress] = useState(initialData?.address ?? '');
  const [result, setResult] = useState<VenueActionState>({ ok: false });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const router = useRouter();

  const isEditing = Boolean(venueId);

  useEffect(() => {
    if (result.ok && result.venueId) {
      router.push('/admin/venues');
    }
  }, [result, router]);

  function addRow() {
    const id = `row-${rowIdCounterRef.current + 1}`;
    rowIdCounterRef.current += 1;
    setRows((prev) => [
      ...prev,
      { id, label: nextAvailableLabel(prev), seatCount: 8 },
    ]);
  }

  function removeRow(rowId: string) {
    setRows((prev) => prev.filter((r) => r.id !== rowId));

    const prefix = `${rowId}__`;
    setAssignments((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        if (key.startsWith(prefix)) delete next[key];
      }
      return next;
    });
    setSelectedSeats((prev) => {
      const next = new Set(prev);
      for (const key of next) {
        if (key.startsWith(prefix)) next.delete(key);
      }
      return next;
    });
  }

  function updateRowLabel(rowId: string, label: string) {
    setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, label } : r)));
  }


  function pruneRowSeats(rowId: string, keepCount: number) {
    const prefix = `${rowId}__`;
    const isOutOfRange = (key: string) => {
      if (!key.startsWith(prefix)) return false;
      const seatNumber = Number(key.slice(prefix.length));
      return !Number.isFinite(seatNumber) || keepCount === 0 || seatNumber > keepCount;
    };

    setAssignments((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        if (isOutOfRange(key)) delete next[key];
      }
      return next;
    });

    setSelectedSeats((prev) => {
      const next = new Set(prev);
      for (const key of next) {
        if (isOutOfRange(key)) next.delete(key);
      }
      return next;
    });
  }

  function updateRowSeatCount(rowId: string, rawValue: string) {
    const trimmed = rawValue.trim();

    if (trimmed === '') {
      setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, seatCount: null } : r)));
      pruneRowSeats(rowId, 0);
      return;
    }

    const parsed = Number(trimmed);
    const isValidInteger = Number.isInteger(parsed) && parsed >= 1 && parsed <= 100;

    if (isValidInteger) {
      setRows((prev) =>
        prev.map((r) => (r.id === rowId ? { ...r, seatCount: parsed } : r))
      );
      pruneRowSeats(rowId, parsed);
    }
  }

  function toggleSeat(key: string) {
    setSelectedSeats((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function assignSelectedToSection() {
    const name = draftSectionName.trim();
    if (!name) return;
    if (selectedSeats.size === 0) return;
    if (validPrice(draftSectionPrice) === null) return;

    const price = draftSectionPrice.trim();
    if (name === 'G') {
      setGPrice(price);
    } else {
      setSectionPrices((prev) => ({ ...prev, [name]: price }));
    }
    setAssignments((prev) => {
      const next = { ...prev };
      for (const key of selectedSeats) {
        next[key] = name;
      }
      return next;
    });
    setSelectedSeats(new Set());
    setDraftSectionName('');
    setDraftSectionPrice('');
  }

  async function handleSubmit() {

    if (!isEditing && (!name.trim() || !address.trim())) {
      setResult({ ok: false, error: 'Venue name and address are required.' });
      return;
    }
    if (totalSeats === 0) {
      setResult({ ok: false, error: 'Add at least one row with seats.' });
      return;
    }

    const incompleteRow = rows.find((r) => r.seatCount === null);
    if (incompleteRow) {
      setResult({ ok: false, error: 'Every row needs a valid number of seats (1–100).' });
      return;
    }

    const labels = rows.map((r) => r.label.trim());
    const uniqueLabels = new Set(labels);
    
    if (uniqueLabels.size !== labels.length) {
      setResult({ ok: false, error: 'Row labels must be unique.' });
      return;
    }

    // Flatten the grid into a flat seat list, defaulting any seat that
    // never got explicitly assigned to section "G".
    const usedSectionNames = new Set<string>();
    const seats = rows.flatMap((row) =>
      Array.from({ length: row.seatCount ?? 0 }).map((_, seatIndex) => {
        const key = seatKey(row.id, seatIndex + 1);
        const section = assignments[key] ?? 'G';
        usedSectionNames.add(section);
        return {
          row: row.label, // display label is still what actually gets saved as the seat's row
          number: String(seatIndex + 1),
          section,
        };
      })
    );

    // Every section that actually has seats needs a price, including "G".
    const sections: { name: string; price: number }[] = [];
    for (const sectionName of usedSectionNames) {
      const rawPrice = sectionName === 'G' ? gPrice : (sectionPrices[sectionName] ?? '');
      const price = validPrice(rawPrice);
      if (price === null) {
        setResult({
          ok: false,
          error: `Section "${sectionName}" needs a price (a whole-dollar amount above zero).`,
        });
        return;
      }
      sections.push({ name: sectionName, price });
    }

    setIsSubmitting(true);
    try {
      const actionResult = isEditing && venueId
        ? await updateVenueAction(venueId, { sections, seats })
        : await createVenueAction({ name, address, sections, seats });
      setResult(actionResult);
    } catch {
      setResult({
        ok: false,
        error: isEditing
          ? 'Unable to save the venue. Please try again.'
          : 'Unable to create the venue. Please try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  const totalSeats = rows.reduce((sum, r) => sum + (r.seatCount ?? 0), 0);

  // Every assigned section name, plus "G" so it's always in the palette
  // even before anything is explicitly assigned to it.
  const sectionNames = Array.from(new Set([...Object.values(assignments), 'G']));
  const colorMap = buildSectionColorMap(sectionNames);

  return (
    <div>
      {!isEditing && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
          <h2 className="text-lg font-bold mb-4">Venue details</h2>
          <label className="block mb-4">
            <span className="text-sm font-medium text-gray-700">Venue name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
              placeholder="Grand Hall"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Address</span>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
              placeholder="12 Main Street, Baabda"
            />
          </label>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Rows</h2>
          <span className="text-sm text-gray-500">
            Total: <strong>{totalSeats}</strong> seats
          </span>
        </div>

        {rows.map((row, rowIndex) => (
          <div key={row.id} className="flex items-center gap-3 mb-2">
            <input
              type="text"
              value={row.label}
              onChange={(e) => updateRowLabel(row.id, e.target.value)}
              aria-label={`Row ${rowIndex + 1} label`}
              className="flex-1 border border-gray-300 rounded-md px-3 py-2"
              placeholder="Row label (e.g. A)"
            />
            <input
              type="number"
              min={1}
              max={100}
              value={row.seatCount ?? ''}
              onChange={(e) => updateRowSeatCount(row.id, e.target.value)}
              aria-label={`Row ${rowIndex + 1} seat count`}
              className="flex-1 border border-gray-300 rounded-md px-3 py-2"
              placeholder="Seats in this row"
            />
            {rows.length > 1 && (
              <button
                type="button"
                onClick={() => removeRow(row.id)}
                className="text-xs text-gray-400 hover:text-red-600 px-2"
              >
                Remove
              </button>
            )}
          </div>
        ))}

        <button
          type="button"
          onClick={addRow}
          className="mt-2 border border-gray-300 px-4 py-2 rounded-md font-medium text-sm hover:bg-gray-50"
        >
          + Add row
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
        <h2 className="text-lg font-bold mb-3">Build a section</h2>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <input
            type="text"
            value={draftSectionName}
            onChange={(e) => setDraftSectionName(e.target.value)}
            aria-label="Section name"
            className="w-full border border-gray-300 rounded-md px-3 py-2"
            placeholder="Section name (e.g. Front, VIP)"
          />
          <input
            type="number"
            min={1}
            step={1}
            value={draftSectionPrice}
            onChange={(e) => setDraftSectionPrice(e.target.value)}
            inputMode="numeric"
            aria-label="Section price in dollars"
            className="w-full border border-gray-300 rounded-md px-3 py-2"
            placeholder="Price in $ (e.g. 3)"
          />
        </div>
        {validPrice(draftSectionPrice) !== null ? (
          <p className="mt-1 text-xs text-gray-500">
            Equivalent: {formatPrice(validPrice(draftSectionPrice)!)}
          </p>
        ) : null}
        <button
          type="button"
          onClick={assignSelectedToSection}
          disabled={!draftSectionName.trim() || validPrice(draftSectionPrice) === null || selectedSeats.size === 0}
          className="bg-black text-white px-4 py-2 rounded-md font-medium text-sm disabled:opacity-40"
        >
          Assign {selectedSeats.size > 0 ? `${selectedSeats.size} seat(s)` : 'selected'}
        </button>
        {draftSectionName.trim() && selectedSeats.size > 0 && validPrice(draftSectionPrice) === null ? (
          <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            Add a price for section &quot;{draftSectionName.trim()}&quot; (a whole-dollar amount above zero) before assigning seats.
          </p>
        ) : null}
        <p className="text-sm text-gray-500 mt-3">
          Click seats below to select them for this section, then hit Assign. Any seat left
          unassigned will default to section &quot;G&quot; (General).
        </p>
        <div className="mt-4 flex items-center gap-3 border-t border-gray-200 pt-3">
          <label htmlFor="g-section-price" className="text-sm font-medium text-gray-700 whitespace-nowrap">
            Default &quot;G&quot; price
          </label>
          <input
            id="g-section-price"
            type="number"
            min={1}
            step={1}
            value={gPrice}
            onChange={(e) => setGPrice(e.target.value)}
            inputMode="numeric"
            className="w-40 border border-gray-300 rounded-md px-3 py-2"
            placeholder="Price in $ (e.g. 2)"
          />
          {validPrice(gPrice) !== null ? (
            <span className="text-xs text-gray-500">
              {formatPrice(validPrice(gPrice)!)}
            </span>
          ) : null}
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
        <h2 className="text-lg font-bold mb-4">Seat map</h2>
        <SeatMap
          rows={rows.map((row) => ({
            label: row.label,
            seats: Array.from({ length: row.seatCount ?? 0 }).map(
              (_, seatIndex) => {
                const key = seatKey(row.id, seatIndex + 1);
                const assignedSection = assignments[key] ?? 'G';
                return {
                  id: key,
                  color: colorMap.get(assignedSection) ?? '#e5e7eb',
                  selected: selectedSeats.has(key),
                  onClick: () => toggleSeat(key),
                  ariaLabel: `${row.label} seat ${seatIndex + 1}, ${assignedSection}`,
                };
              }
            ),
          }))}
          legend={sectionNames.map((sectionName) => {
            const price =
              sectionName === 'G'
                ? gPrice
                : (sectionPrices[sectionName] ?? '');
            return {
              name: sectionName,
              color: colorMap.get(sectionName) ?? '#e5e7eb',
              price: validPrice(price),
            };
          })}
        />
      </div>

      {result.error && (
        <div
          role="alert"
          className="bg-red-50 border border-red-200 text-red-700 rounded-md p-3 mb-4 text-sm"
        >
          {result.error}
        </div>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={isSubmitting}
        className="bg-black text-white px-6 py-2 rounded-md font-medium hover:bg-gray-800 disabled:opacity-50"
      >
        {isSubmitting
          ? isEditing
            ? 'Saving changes...'
            : 'Creating venue...'
          : isEditing
            ? 'Save changes'
            : 'Create venue'}
      </button>
    </div>
  );
}