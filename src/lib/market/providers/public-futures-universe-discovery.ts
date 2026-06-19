import { createBinanceUniverseDiscoveryProvider } from "./binance-universe-discovery";
import type { ContractInstrument, ScanDiscoverySourceDiagnostic } from "../types";
import type {
  UniverseDiscoveryFailure,
  UniverseDiscoveryProvider,
  UniverseDiscoveryResult,
} from "./binance-universe-discovery";
import { createBybitUniverseDiscoveryProvider } from "./bybit-universe-discovery";
import { createOkxUniverseDiscoveryProvider } from "./okx-universe-discovery";
import { buildStaticFuturesUniverseSeed } from "./static-futures-universe-seed";

export type PublicFuturesUniverseDiscoveryProviderOptions = {
  fallbackSeed?: ContractInstrument[];
  minimumLiveInstruments?: number;
  providers?: UniverseDiscoveryProvider[];
};

function failure(fields: Omit<UniverseDiscoveryFailure, "ok">): UniverseDiscoveryFailure {
  return {
    ok: false,
    ...fields,
  };
}

function sourceDiagnostic(result: UniverseDiscoveryResult): ScanDiscoverySourceDiagnostic {
  if (result.ok) {
    return {
      instrumentCount: result.instruments.length,
      requestCount: result.requestCount ?? 0,
      source: result.source,
      status: result.instruments.length > 0 ? "ok" : "partial",
    };
  }

  return {
    error: result.error,
    instrumentCount: 0,
    reason: result.reason,
    requestCount: result.requestCount ?? 0,
    source: result.source,
    status: "failed",
    statusCode: result.status,
  };
}

export function createPublicFuturesUniverseDiscoveryProvider({
  fallbackSeed,
  minimumLiveInstruments = 50,
  providers = [
    createBinanceUniverseDiscoveryProvider(),
    createOkxUniverseDiscoveryProvider(),
    createBybitUniverseDiscoveryProvider(),
  ],
}: PublicFuturesUniverseDiscoveryProviderOptions = {}): UniverseDiscoveryProvider {
  const source = "public-futures-multi-exchange";

  return {
    id: source,
    label: "Public Futures Multi-Exchange Universe Discovery",

    async discoverInstruments(): Promise<UniverseDiscoveryResult> {
      const results = await Promise.all(providers.map((provider) => provider.discoverInstruments()));
      const requestCount = results.reduce((total, result) => total + (result.requestCount ?? 0), 0);
      const notes = results.map((result) =>
        result.ok
          ? `${result.source} ok ${result.instruments.length} instruments`
          : `${result.source} ${result.reason}`
      );
      const diagnostics = results.map(sourceDiagnostic);
      const successfulResults = results.filter((result) => result.ok);
      const instruments = successfulResults.flatMap((result) => result.instruments);

      if (instruments.length >= minimumLiveInstruments) {
        return {
          ok: true,
          source,
          diagnostics,
          fallbackActivated: false,
          fallbackInstrumentCount: 0,
          instruments,
          liveInstrumentCount: instruments.length,
          notes,
          requestCount,
        };
      }

      const seed = fallbackSeed ?? buildStaticFuturesUniverseSeed();

      if (seed.length === 0 && instruments.length === 0) {
        return failure({
          source,
          reason: "upstream_error",
          error: `All universe discovery providers failed: ${notes.join(", ")}`,
          diagnostics,
          notes,
          requestCount,
        });
      }

      if (seed.length === 0) {
        return {
          ok: true,
          source,
          diagnostics,
          fallbackActivated: false,
          fallbackInstrumentCount: 0,
          instruments,
          liveInstrumentCount: instruments.length,
          notes: [
            ...notes,
            `fallback seed unavailable: live ${instruments.length} below ${minimumLiveInstruments}`,
          ],
          requestCount,
        };
      }

      return {
        ok: true,
        source,
        diagnostics: [
          ...diagnostics,
          {
            instrumentCount: seed.length,
            requestCount: 0,
            source: "static-usdt-perp-fallback",
            status: "fallback",
          },
        ],
        fallbackActivated: true,
        fallbackInstrumentCount: seed.length,
        instruments: [...instruments, ...seed],
        liveInstrumentCount: instruments.length,
        notes: [
          ...notes,
          `fallback seed activated: live ${instruments.length} below ${minimumLiveInstruments}, seed ${seed.length}`,
        ],
        requestCount,
      };
    },
  };
}
