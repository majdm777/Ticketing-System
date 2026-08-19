export const USD_TO_LBP = 90_000;

export function usdToLbp(usd: number): number {
  return Math.round(usd * USD_TO_LBP);
}

export function lbpToUsd(lbp: number): number {
  return lbp / USD_TO_LBP;
}

export function formatUsd(usd: number, locale = 'en-US'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(usd);
}

export function formatLbp(lbp: number, locale = 'en-US'): string {
  return new Intl.NumberFormat(locale).format(lbp);
}

// "X / Y LBP" — the whole-dollar price followed by its LBP equivalent.
export function formatPrice(usd: number, locale = 'en-US'): string {
  return `${formatUsd(usd, locale)} / ${formatLbp(usdToLbp(usd), locale)} LBP`;
}
