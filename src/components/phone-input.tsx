'use client';

import { parsePhoneNumber, type CountryCode } from 'libphonenumber-js';
import { useEffect, useId, useRef, useState } from 'react';

import {
  COUNTRIES,
  flagEmoji,
  getCountry,
  resolveDefaultCountryCode,
} from '@/lib/countries';

// Validates a full E.164 value against the selected country's numbering plan
// so the attendee sees a field error for a wrong-length or impossible number
// before submit (the server enforces the same check in phoneSchema).
function isPhoneValid(value: string, isoCode: string): boolean {
  try {
    return parsePhoneNumber(value, isoCode as CountryCode).isValid();
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
export function PhoneInput({ defaultCountryCode }: { defaultCountryCode: string }) {
  const [countryCode, setCountryCode] = useState(() =>
    getCountry(defaultCountryCode)
      ? defaultCountryCode
      : resolveDefaultCountryCode(),
  );
  const [nationalNumber, setNationalNumber] = useState('');
  const [open, setOpen] = useState(false);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
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
      ? `Enter a valid ${country.name} phone number.`
      : null;

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
        Your phone number
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
            className="flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-l-md px-3 text-base text-zinc-950 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-950"
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
            id={inputId}
            name="userPhoneNational"
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            placeholder="Your phone number"
            required
            value={nationalNumber}
            onChange={(event) => setNationalNumber(event.target.value)}
            aria-invalid={phoneError ? true : undefined}
            aria-describedby={phoneError ? `${inputId}-error` : undefined}
            className="min-w-0 flex-1 rounded-r-md border-0 bg-transparent py-3 pl-3 pr-3 text-base text-zinc-950 outline-none placeholder:text-zinc-400"
          />
        </div>

        <input type="hidden" name="userPhone" value={fullNumber} />

        {open ? (
          <ul
            id={listboxId}
            role="listbox"
            aria-label="Country code"
            className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-md border border-zinc-200 bg-white py-1 shadow-lg"
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
                  className={`flex w-full min-h-11 cursor-pointer items-center gap-3 px-3 text-left text-base text-zinc-950 outline-none focus-visible:bg-zinc-100 ${
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

      <p className="text-sm leading-5 text-zinc-500">
        We will send your ticket to this number by WhatsApp.
      </p>
    </div>
  );
}
