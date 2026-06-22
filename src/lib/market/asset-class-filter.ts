const NON_CRYPTO_UNDERLYING_DENYLIST = new Set([
  "AAPL",
  "AMZN",
  "BABA",
  "BIDU",
  "BRK",
  "CIEN",
  "COIN",
  "CRCL",
  "DIA",
  "DIS",
  "EWJ",
  "FXI",
  "GOOG",
  "GOOGL",
  "HOOD",
  "HYUNDAI",
  "IBM",
  "INTC",
  "IWM",
  "JD",
  "KWEB",
  "META",
  "MSTR",
  "MSFT",
  "NFLX",
  "NOKIA",
  "NVO",
  "NVDA",
  "PDD",
  "QQQ",
  "SNDK",
  "SOXL",
  "SPY",
  "TCEHY",
  "TSLA",
  "TSM",
  "USO",
  "WDC",
  "XAG",
  "XAU",
  "XOM",
]);

export function normalizeBaseAssetForClass(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[-_/]/g, "")
    .replace(/(USDT|USDC|USD|PERP|SWAP)\.?P?$/u, "");
}

export function isCryptoFuturesUnderlying(value: string) {
  const baseAsset = normalizeBaseAssetForClass(value);

  if (!baseAsset) {
    return false;
  }

  return !NON_CRYPTO_UNDERLYING_DENYLIST.has(baseAsset);
}
