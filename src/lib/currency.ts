export const USD_TO_LBP = 90_000;

export function usdToLbp(usd: number): number {
  return Math.round(usd * USD_TO_LBP);
}

export function lbpToUsd(lbp: number): number {
  return lbp / USD_TO_LBP;
}

const usdFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const lbpFormatter = new Intl.NumberFormat('en-US');

export function formatUsd(usd: number): string {
  return usdFormatter.format(usd);
}

export function formatLbp(lbp: number): string {
  return lbpFormatter.format(lbp);
}

// "X / Y LBP" — the whole-dollar price followed by its LBP equivalent.
export function formatPrice(usd: number): string {
  return `${formatUsd(usd)} / ${formatLbp(usdToLbp(usd))} LBP`;
}
