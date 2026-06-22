const NON_CRYPTO_UNDERLYING_DENYLIST = new Set([
  "AAPL",
  "AMZN",
  "BABA",
  "COIN",
  "DIA",
  "EWJ",
  "GOOG",
  "GOOGL",
  "HYUNDAI",
  "IBM",
  "INTC",
  "IWM",
  "META",
  "MSTR",
  "MSFT",
  "NOKIA",
  "NVDA",
  "QQQ",
  "SPY",
  "TSLA",
  "USO",
  "XAG",
  "XAU",
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
