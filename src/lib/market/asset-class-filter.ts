const NON_CRYPTO_UNDERLYING_DENYLIST = new Set([
  "AAPL",
  "AAOI",
  "AMD",
  "AMZN",
  "ARM",
  "AVGO",
  "BABA",
  "BIDU",
  "BRK",
  "CIEN",
  "CL",
  "COIN",
  "CRCL",
  "CSCO",
  "DIA",
  "DIS",
  "DRAM",
  "EWY",
  "EWJ",
  "FXI",
  "GOOG",
  "GOOGL",
  "HOOD",
  "HYUNDAI",
  "IBM",
  "INTC",
  "ISRG",
  "IWM",
  "JD",
  "KLAC",
  "KWEB",
  "LRCX",
  "META",
  "MRVL",
  "MSTR",
  "MSFT",
  "MU",
  "NATGAS",
  "NBIS",
  "NFLX",
  "NOK",
  "NOKIA",
  "NVO",
  "NVDA",
  "PDD",
  "PLTR",
  "POET",
  "QCOM",
  "QQQ",
  "RIVN",
  "RKLB",
  "SKHYNIX",
  "SNDK",
  "SOXL",
  "SPCX",
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
