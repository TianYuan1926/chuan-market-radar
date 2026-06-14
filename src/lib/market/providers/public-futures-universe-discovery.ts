import { createBinanceUniverseDiscoveryProvider } from "./binance-universe-discovery";
import type {
  UniverseDiscoveryFailure,
  UniverseDiscoveryProvider,
  UniverseDiscoveryResult,
} from "./binance-universe-discovery";
import { createBybitUniverseDiscoveryProvider } from "./bybit-universe-discovery";
import { createOkxUniverseDiscoveryProvider } from "./okx-universe-discovery";

export type PublicFuturesUniverseDiscoveryProviderOptions = {
  providers?: UniverseDiscoveryProvider[];
};

function failure(fields: Omit<UniverseDiscoveryFailure, "ok">): UniverseDiscoveryFailure {
  return {
    ok: false,
    ...fields,
  };
}

export function createPublicFuturesUniverseDiscoveryProvider({
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
      const notes = results.map((result) =>
        result.ok
          ? `${result.source} ok ${result.instruments.length} instruments`
          : `${result.source} ${result.reason}`
      );
      const successfulResults = results.filter((result) => result.ok);
      const instruments = successfulResults.flatMap((result) => result.instruments);

      if (instruments.length === 0) {
        return failure({
          source,
          reason: "upstream_error",
          error: `All universe discovery providers failed: ${notes.join(", ")}`,
          notes,
        });
      }

      return {
        ok: true,
        source,
        instruments,
        notes,
      };
    },
  };
}
