'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { buildSectionColorMap } from '@/lib/section-colors';
import { createVenueAction, type VenueActionState } from '@/lib/actions/venues';

type RowDraft = {
  id: string;
  label: string;
  seatCount: number | null;
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

let rowIdCounter = 0;
function nextRowId(): string {
  rowIdCounter += 1;
  return `row-${rowIdCounter}`;
}

function seatKey(rowId: string, seatNumber: number): string {
  return `${rowId}__${seatNumber}`;
}

export function VenueBuilder() {
  const [rows, setRows] = useState<RowDraft[]>([{ id: nextRowId(), label: 'A', seatCount: 8 }]);
  // Committed assignments: seatKey -> section name. This is the real,
  // saved state of the venue-in-progress.
  const [assignments, setAssignments] = useState<Record<string, string>>({});

  // The section currently being built: its name, and the set of seats
  // toggled "in" for it so far, not yet committed to `assignments`.
  const [draftSectionName, setDraftSectionName] = useState('');
  const [selectedSeats, setSelectedSeats] = useState<Set<string>>(new Set());

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [result, setResult] = useState<VenueActionState>({ ok: false });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const router = useRouter();

  useEffect(() => {
    if (result.ok && result.venueId) {
      router.push('/admin/venues');
    }
  }, [result, router]);

  function addRow() {
    setRows((prev) => [
      ...prev,
      { id: nextRowId(), label: defaultRowLabel(prev.length), seatCount: 8 },
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


    function updateRowSeatCount(rowId: string, rawValue: string) {
    const trimmed = rawValue.trim();

    if (trimmed === '') {
      setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, seatCount: null } : r)));
      return;
    }

    const parsed = Number(trimmed);
    const isValidInteger = Number.isInteger(parsed) && parsed >= 1 && parsed <= 100;

    setRows((prev) =>
      prev.map((r) =>
        r.id === rowId ? { ...r, seatCount: isValidInteger ? parsed : r.seatCount } : r
      )
    );
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

    setAssignments((prev) => {
      const next = { ...prev };
      for (const key of selectedSeats) {
        next[key] = name;
      }
      return next;
    });
    setSelectedSeats(new Set());
    setDraftSectionName('');
  }

  async function handleSubmit() {

    if (!name.trim() || !address.trim()) {
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
    const seats = rows.flatMap((row) =>
      Array.from({ length: row.seatCount ?? 0 }).map((_, seatIndex) => {
        const key = seatKey(row.id, seatIndex + 1);
        return {
          row: row.label, // display label is still what actually gets saved as the seat's row
          number: String(seatIndex + 1),
          section: assignments[key] ?? 'G',
        };
      })
    );

    setIsSubmitting(true);
    try {
      const actionResult = await createVenueAction({ name, address, seats });
      setResult(actionResult);
    } catch {
      setResult({ ok: false, error: 'Unable to create the venue. Please try again.' });
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

      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Rows</h2>
          <span className="text-sm text-gray-500">
            Total: <strong>{totalSeats}</strong> seats
          </span>
        </div>

        {rows.map((row) => (
          <div key={row.id} className="flex items-center gap-3 mb-2">
            <input
              type="text"
              value={row.label}
              onChange={(e) => updateRowLabel(row.id, e.target.value)}
              className="flex-1 border border-gray-300 rounded-md px-3 py-2"
              placeholder="Row label (e.g. A)"
            />
            <input
              type="number"
              min={1}
              max={100}
              value={row.seatCount ?? ''}
              onChange={(e) => updateRowSeatCount(row.id, e.target.value)}
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
        <div className="flex items-center gap-3 mb-4">
          <input
            type="text"
            value={draftSectionName}
            onChange={(e) => setDraftSectionName(e.target.value)}
            className="flex-1 border border-gray-300 rounded-md px-3 py-2"
            placeholder="Section name (e.g. Front, VIP)"
          />
          <button
            type="button"
            onClick={assignSelectedToSection}
            disabled={!draftSectionName.trim() || selectedSeats.size === 0}
            className="bg-black text-white px-4 py-2 rounded-md font-medium text-sm disabled:opacity-40"
          >
            Assign {selectedSeats.size > 0 ? `${selectedSeats.size} seat(s)` : 'selected'}
          </button>
        </div>
        <p className="text-sm text-gray-500">
          Click seats below to select them for this section, then hit Assign. Any seat left
          unassigned will default to section &quot;G&quot; (General).
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
        <h2 className="text-lg font-bold mb-4">Seat map</h2>
        <div className="flex flex-col items-center gap-2 mb-4">
          {rows.map((row) => (
            <div key={row.id} className="flex items-center gap-2">
              <span className="w-8 text-xs text-gray-500 text-right">{row.label}</span>
              <div className="flex gap-1">
                {Array.from({ length: row.seatCount ?? 0 }).map((_, seatIndex) => {
                  const key = seatKey(row.id, seatIndex + 1);
                  const isSelected = selectedSeats.has(key);
                  const assignedSection = assignments[key];
                  const backgroundColor = assignedSection
                    ? colorMap.get(assignedSection)
                    : undefined;

                  return (
                    <button
                      key={seatIndex}
                      type="button"
                      onClick={() => toggleSeat(key)}
                      aria-pressed={isSelected}
                      aria-label={`${row.label} seat ${seatIndex + 1}, ${
                        assignedSection ?? 'unassigned; defaults to G'
                      }`}
                      title={`${row.label}${seatIndex + 1}${
                        assignedSection ? ` — ${assignedSection}` : ''
                      }`}
                      className={`w-6 h-6 rounded-full border transition ${
                        isSelected
                          ? 'ring-2 ring-offset-1 ring-black border-black'
                          : 'border-gray-300'
                      }`}
                      style={{
                        backgroundColor: backgroundColor ?? '#e5e7eb',
                      }}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {sectionNames.length > 0 && (
          <div className="flex flex-wrap gap-3 pt-3 border-t border-gray-200">
            {sectionNames.map((sectionName) => (
              <div key={sectionName} className="flex items-center gap-1.5 text-sm text-gray-600">
                <span
                  className="w-3 h-3 rounded-full inline-block"
                  style={{ backgroundColor: colorMap.get(sectionName) }}
                />
                {sectionName}
              </div>
            ))}
          </div>
        )}
      </div>

      {result.error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-md p-3 mb-4 text-sm">
          {result.error}
        </div>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={isSubmitting}
        className="bg-black text-white px-6 py-2 rounded-md font-medium hover:bg-gray-800 disabled:opacity-50"
      >
        {isSubmitting ? 'Creating venue...' : 'Create venue'}
      </button>
    </div>
  );
}