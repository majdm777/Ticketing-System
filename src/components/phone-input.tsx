'use client';

import { parsePhoneNumber, type CountryCode } from 'libphonenumber-js/max';
import { useEffect, useId, useRef, useState } from 'react';

import {
  COUNTRIES,
  flagEmoji,
  getCountry,
  resolveDefaultCountryCode,
} from '@/lib/countries';

// Validates the composed E.164 value against the selected country's numbering
// plan before submit (the server enforces the same checks in phoneSchema).
// `fullNumber` always starts with `+`, so libphonenumber derives the country
// from the digits, not the defaultCountry argument — pin the parsed country to
// the one the attendee selected, otherwise a US number would pass validation
// while Canada (or any other +1 country) is selected. The `max` metadata set
// enforces digit patterns, not just lengths.
function isPhoneValid(value: string, isoCode: string): boolean {
  try {
    const parsed = parsePhoneNumber(value, isoCode as CountryCode);
    return parsed.isValid() && parsed.country === isoCode;
  } catch {
    return false;
  }
}

function ChevronIcon({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M5 8l5 5 5-5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Attendee phone field: one bordered row holding a compact country-code prefix
// (flag + dial code + chevron) that opens the country picker, a thin divider,
// and the local phone number. The submitted value is always full E.164
// (`+<dial><digits>`) in a hidden `userPhone` input, so the existing server
// action and validation keep working unchanged.
export function PhoneInput({
  defaultCountryCode,
  label = 'Your phone number',
  placeholder = 'Your phone number',
  phoneErrorTemplate,
  countryPickerLabel = 'Country code',
}: {
  defaultCountryCode: string;
  label?: string;
  placeholder?: string;
  phoneErrorTemplate?: string;
  countryPickerLabel?: string;
}) {
  const [countryCode, setCountryCode] = useState(() =>
    getCountry(defaultCountryCode)
      ? defaultCountryCode
      : resolveDefaultCountryCode(),
  );
  const [nationalNumber, setNationalNumber] = useState('');
  const [open, setOpen] = useState(false);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = COUNTRIES.findIndex(
    (country) => country.code === countryCode,
  );

  const listboxId = useId();
  const inputId = useId();

  const country = getCountry(countryCode) ?? COUNTRIES[0];
  const nationalDigits = nationalNumber.replace(/\D/g, '');
  const fullNumber = `+${country.dial}${nationalDigits}`;
  const phoneError =
    nationalNumber.trim() !== '' && !isPhoneValid(fullNumber, country.code)
      ? (phoneErrorTemplate?.replace('{country}', country.name) ?? `Enter a valid ${country.name} phone number.`)
      : null;

  // Reflect the computed phone error into native constraint validation so the
  // browser blocks submit for a non-empty invalid number, not just for an empty
  // one (the server enforces the same checks in phoneSchema).
  useEffect(() => {
    inputRef.current?.setCustomValidity(phoneError ?? '');
  }, [phoneError]);

  // Focus the currently selected country when the list opens, and close on any
  // tap outside the control.
  useEffect(() => {
    if (!open) {
      return;
    }
    optionRefs.current[selectedIndex]?.focus();
    optionRefs.current[selectedIndex]?.scrollIntoView({ block: 'nearest' });
    function onOutsideClick(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onOutsideClick);
    return () => document.removeEventListener('mousedown', onOutsideClick);
  }, [open, selectedIndex]);

  function select(code: string) {
    setCountryCode(code);
    setOpen(false);
    buttonRef.current?.focus();
  }

  function moveFocus(nextIndex: number) {
    const clamped = Math.min(Math.max(nextIndex, 0), COUNTRIES.length - 1);
    optionRefs.current[clamped]?.focus();
    optionRefs.current[clamped]?.scrollIntoView({ block: 'nearest' });
  }

  return (
    <div className="space-y-2">
      <label
        htmlFor={inputId}
        className="block text-base font-medium text-zinc-950"
      >
        {label}
      </label>

      <div ref={rootRef} className="relative">
        <div className="flex items-stretch rounded-md border border-zinc-300 bg-white transition-colors focus-within:border-zinc-950 focus-within:ring-1 focus-within:ring-zinc-950">
          <button
            ref={buttonRef}
            type="button"
            onClick={() => setOpen((current) => !current)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                setOpen(true);
              }
            }}
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls={open ? listboxId : undefined}
            className="flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-s-md px-3 text-base text-zinc-950 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-950"
          >
            <span aria-hidden="true">{flagEmoji(country.code)}</span>
            <span>+{country.dial}</span>
            <ChevronIcon className="h-4 w-4 text-zinc-500" />
          </button>

          <span
            aria-hidden="true"
            className="my-3 w-px shrink-0 bg-zinc-300"
          />

          <input
            ref={inputRef}
            id={inputId}
            name="userPhoneNational"
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            placeholder={placeholder}
            required
            value={nationalNumber}
            onChange={(event) => setNationalNumber(event.target.value)}
            aria-invalid={phoneError ? true : undefined}
            aria-describedby={phoneError ? `${inputId}-error` : undefined}
            className="min-w-0 flex-1 rounded-e-md border-0 bg-transparent py-3 ps-3 pe-3 text-base text-zinc-950 outline-none placeholder:text-zinc-400"
          />
        </div>

        <input type="hidden" name="userPhone" value={fullNumber} />

        {open ? (
          <ul
            id={listboxId}
            role="listbox"
            aria-label={countryPickerLabel}
            className="absolute start-0 end-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-md border border-zinc-200 bg-white py-1 shadow-lg"
          >
            {COUNTRIES.map((option, index) => (
              <li key={option.code} role="presentation">
                <button
                  ref={(element) => {
                    optionRefs.current[index] = element;
                  }}
                  type="button"
                  role="option"
                  id={`${listboxId}-${option.code}`}
                  aria-selected={option.code === countryCode}
                  onClick={() => select(option.code)}
                  onKeyDown={(event) => {
                    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                      event.preventDefault();
                      moveFocus(
                        event.key === 'ArrowDown' ? index + 1 : index - 1,
                      );
                    } else if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      select(option.code);
                    } else if (event.key === 'Escape') {
                      event.preventDefault();
                      setOpen(false);
                      buttonRef.current?.focus();
                    } else if (event.key === 'Tab') {
                      setOpen(false);
                    }
                  }}
                  className={`flex w-full min-h-11 cursor-pointer items-center gap-3 px-3 text-start text-base text-zinc-950 outline-none focus-visible:bg-zinc-100 ${
                    option.code === countryCode ? 'bg-zinc-100' : ''
                  }`}
                >
                  <span aria-hidden="true">{flagEmoji(option.code)}</span>
                  <span className="flex-1 truncate">{option.name}</span>
                  <span className="shrink-0 text-zinc-500">
                    +{option.dial}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {phoneError ? (
        <p id={`${inputId}-error`} className="text-sm leading-5 text-red-700">
          {phoneError}
        </p>
      ) : null}
    </div>
  );
}
