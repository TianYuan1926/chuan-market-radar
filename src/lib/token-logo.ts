export function logoLookupSymbol(symbol: string): string {
  const clean = symbol
    .trim()
    .toLowerCase()
    .replace(/^binance:/, "")
    .replace(/\.p$/, "")
    .replace(/[^a-z0-9]/g, "")
    .replace(/(usdt|usdc|busd|usd|perp|swap)$/u, "");

  return clean.replace(/^(1000000|10000|1000)(?=[a-z])/u, "");
}

export function realLogoUrl(symbol: string): string | null {
  const key = logoLookupSymbol(symbol);
  return key ? `https://assets.coincap.io/assets/icons/${key}@2x.png` : null;
}
