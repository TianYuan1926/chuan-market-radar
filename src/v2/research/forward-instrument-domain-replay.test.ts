import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  MutableForwardInstrumentClock,
  syntheticForwardInstrumentFetch,
  syntheticForwardInstrumentState,
  TEST_FORWARD_INSTRUMENT_RELEASE_ID,
} from "../testing/forward-instrument-harness";
import {
  runM2ForwardInstrumentCapture,
} from "./forward-instrument-capture-runner";
import {
  replayLatestM2ForwardInstrumentDomains,
} from "./forward-instrument-domain-replay";
import {
  createM2ForwardInstrumentEvidenceStore,
} from "./forward-instrument-evidence-store";

test("replays real-shaped retained bytes into separate fail-closed asset domains", async () => {
  const root = await mkdtemp(join(tmpdir(), "forward-domain-replay-"));
  try {
    const state = syntheticForwardInstrumentState();
    state.binanceRows = [
      {
        baseAsset: "AAA",
        contractType: "PERPETUAL",
        filters: [
          { filterType: "PRICE_FILTER", tickSize: "0.01" },
          { filterType: "LOT_SIZE", stepSize: "1" },
        ],
        marginAsset: "USDT",
        quoteAsset: "USDT",
        status: "TRADING",
        symbol: "AAAUSDT",
        underlyingType: "COIN",
      },
      {
        baseAsset: "ACME",
        contractType: "PERPETUAL",
        filters: [
          { filterType: "PRICE_FILTER", tickSize: "0.01" },
          { filterType: "LOT_SIZE", stepSize: "0.1" },
        ],
        marginAsset: "USDT",
        quoteAsset: "USDT",
        status: "TRADING",
        symbol: "ACMEUSDT",
        underlyingType: "STOCK",
      },
    ];
    state.okxRows = [
      {
        ctType: "linear",
        ctVal: "1",
        ctValCcy: "BBB",
        instCategory: "1",
        instFamily: "BBB-USDT",
        instId: "BBB-USDT-SWAP",
        instType: "SWAP",
        lotSz: "1",
        quoteCcy: "USDT",
        settleCcy: "USDT",
        state: "live",
        tickSz: "0.01",
        uly: "BBB-USDT",
      },
      {
        ctType: "linear",
        ctVal: "1",
        ctValCcy: "MEGA",
        instCategory: "3",
        instFamily: "MEGA-USDT",
        instId: "MEGA-USDT-SWAP",
        instType: "SWAP",
        lotSz: "0.1",
        quoteCcy: "USDT",
        settleCcy: "USDT",
        state: "live",
        tickSz: "0.01",
        uly: "MEGA-USDT",
      },
    ];
    state.bybitPages = [[
      {
        baseCoin: "CCC",
        contractType: "LinearPerpetual",
        lotSizeFilter: { qtyStep: "1" },
        priceFilter: { tickSize: "0.01" },
        quoteCoin: "USDT",
        settleCoin: "USDT",
        status: "Trading",
        symbol: "CCCUSDT",
        symbolType: "",
      },
      {
        baseCoin: "GLOBAL",
        contractType: "LinearPerpetual",
        lotSizeFilter: { qtyStep: "0.1" },
        priceFilter: { tickSize: "0.01" },
        quoteCoin: "USDT",
        settleCoin: "USDT",
        status: "Trading",
        symbol: "GLOBALUSDT",
        symbolType: "stock",
      },
    ]];
    const evidenceRoot = join(root, "evidence");
    const capture = await runM2ForwardInstrumentCapture({
      evidenceRoot,
      fetchImplementation: syntheticForwardInstrumentFetch(state),
      now: new MutableForwardInstrumentClock(
        "2026-07-20T23:00:00.000Z",
      ).now,
      releaseId: TEST_FORWARD_INSTRUMENT_RELEASE_ID,
      repositoryRoot: process.cwd(),
    });
    const store = await createM2ForwardInstrumentEvidenceStore({
      mode: "READ_ONLY_EXISTING",
      repositoryRoot: process.cwd(),
      root: evidenceRoot,
    });
    const replay = await replayLatestM2ForwardInstrumentDomains({
      snapshots: capture.snapshots,
      store,
    });
    assert.equal(replay.status, "PASS_LATEST_RAW_DOMAIN_REPLAY");
    assert.equal(replay.providerCount, 3);
    assert.equal(replay.multiAssetSeparationObserved, true);
    assert.equal(replay.unresolvedClassificationObserved, true);
    assert.ok(replay.providerResults.every((result) =>
      result.normalizationStatus === "PASS" &&
      result.rawRecordCount === 2 &&
      result.observationCount === 2 &&
      result.exactIdentityCount === 2 &&
      result.partialIdentityCount === 0 &&
      result.unresolvedIdentityCount === 0));
    assert.equal(
      replay.providerResults.find((result) =>
        result.providerId === "BINANCE_USDS_FUTURES"
      )?.countsByAssetDomain.EQUITY_SINGLE_NAME_PERPETUAL,
      1,
    );
    assert.equal(
      replay.providerResults.find((result) =>
        result.providerId === "OKX_SWAP"
      )?.countsByAssetDomain.EQUITY_SINGLE_NAME_PERPETUAL,
      1,
    );
    const bybit = replay.providerResults.find((result) =>
      result.providerId === "BYBIT_LINEAR_PERPETUAL");
    assert.equal(bybit?.countsByAssetDomain.OTHER_RWA_DERIVATIVE, 1);
    assert.equal(bybit?.broadEquitySubtypeUnresolvedCount, 1);
    assert.equal(replay.officialMappingCompletenessProven, false);
    assert.equal(replay.candidateEmissionAllowed, false);
    assert.equal(replay.strategyAuthorityAllowed, false);
    assert.equal(replay.readyAuthorityAllowed, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
