import {
  M2_HISTORICAL_INSTRUMENT_CAPABILITY_VERSION,
  M2_HISTORICAL_INSTRUMENT_COVERAGE_VERSION,
  buildM2HistoricalInstrumentCapabilityArtifact,
  buildM2HistoricalInstrumentCoverageArtifact,
} from "./historical-instrument-identity";

export const M2_BINANCE_VISION_ARCHIVE_PRESENCE_CAPABILITY =
  buildM2HistoricalInstrumentCapabilityArtifact({
    schemaVersion: M2_HISTORICAL_INSTRUMENT_CAPABILITY_VERSION,
    capabilityRegistryId:
      "binance-vision-usds-futures-archive-presence.v1",
    providerId: "BINANCE_USDS_FUTURES",
    sourceOperator: "Binance",
    sourceClass: "VENUE_OFFICIAL",
    evidenceMode: "ARCHIVE_OBJECT_PRESENCE_ONLY",
    assessedAt: "2026-07-20T07:39:00.000Z",
    captureStartedAt: null,
    coverage: { startedAt: null, endedAt: null },
    documentation: [{
      evidenceId: "binance-public-data-readme-reference",
      evidenceType: "OFFICIAL_DOCUMENTATION",
      url: "https://github.com/binance/binance-public-data",
      capturedAt: "2026-07-20T07:30:00.000Z",
      contentDigest: null,
      contentBytes: null,
      captureStatus: "REFERENCE_ONLY_UNHASHED",
      retentionClass: "REFERENCE_ONLY",
      claimScope: "HISTORICAL_INSTRUMENT_COVERAGE",
    }],
    guarantees: {
      fullUniverseDenominator: false,
      includesDelistedInstruments: false,
      onboardAt: false,
      delistAt: false,
      contractType: false,
      settlementAsset: false,
      underlyingClass: false,
      tradingStatusIntervals: false,
      symbolReuseDisambiguation: false,
    },
    declaredLimitations: [
      "archive_object_presence_is_not_instrument_eligibility",
      "archive_paths_do_not_prove_contract_identity_or_status",
    ],
  });

export const M2_BINANCE_VISION_TECHNICAL_PILOT_INSTRUMENT_COVERAGE =
  buildM2HistoricalInstrumentCoverageArtifact({
    schemaVersion: M2_HISTORICAL_INSTRUMENT_COVERAGE_VERSION,
    generatedAt: "2026-07-20T07:39:30.000Z",
    requestedWindow: {
      startedAt: "2026-06-01T00:00:00.000Z",
      endedAt: "2026-07-01T00:00:00.000Z",
    },
    denominator: {
      mode: "TECHNICAL_PILOT_ONLY",
      manifestDigest: null,
      expectedInstruments: [{
        providerInstrumentKey: "BINANCE_USDS_FUTURES:BTCUSDT:PILOT_ONLY",
        providerSymbol: "BTCUSDT",
      }],
    },
    capability: M2_BINANCE_VISION_ARCHIVE_PRESENCE_CAPABILITY,
    records: [],
  });

export const M2_BINANCE_CURRENT_INSTRUMENT_CAPABILITY =
  buildM2HistoricalInstrumentCapabilityArtifact({
    schemaVersion: M2_HISTORICAL_INSTRUMENT_CAPABILITY_VERSION,
    capabilityRegistryId: "binance-usds-exchange-info-current.v1",
    providerId: "BINANCE_USDS_FUTURES",
    sourceOperator: "Binance",
    sourceClass: "VENUE_OFFICIAL",
    evidenceMode: "CURRENT_SNAPSHOT_ONLY",
    assessedAt: "2026-07-20T10:36:05.000Z",
    captureStartedAt: null,
    coverage: { startedAt: null, endedAt: null },
    documentation: [{
      evidenceId: "binance-usds-exchange-info-doc",
      evidenceType: "OFFICIAL_DOCUMENTATION",
      url: "https://developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-usd-s-m-futures/api/rest-api/market-data#exchange-information",
      capturedAt: "2026-07-20T10:35:00.000Z",
      contentDigest: null,
      contentBytes: null,
      captureStatus: "REFERENCE_ONLY_UNHASHED",
      retentionClass: "REFERENCE_ONLY",
      claimScope: "CURRENT_INSTRUMENT_FIELDS",
    }],
    guarantees: {
      fullUniverseDenominator: true,
      includesDelistedInstruments: false,
      onboardAt: true,
      delistAt: false,
      contractType: true,
      settlementAsset: true,
      underlyingClass: true,
      tradingStatusIntervals: false,
      symbolReuseDisambiguation: false,
    },
    declaredLimitations: [
      "official_endpoint_is_documented_as_current_exchange_information",
      "current_snapshot_cannot_backfill_historical_status_intervals",
    ],
  });

export const M2_OKX_CURRENT_INSTRUMENT_CAPABILITY =
  buildM2HistoricalInstrumentCapabilityArtifact({
    schemaVersion: M2_HISTORICAL_INSTRUMENT_CAPABILITY_VERSION,
    capabilityRegistryId: "okx-public-instruments-current.v1",
    providerId: "OKX_SWAP",
    sourceOperator: "OKX",
    sourceClass: "VENUE_OFFICIAL",
    evidenceMode: "CURRENT_SNAPSHOT_ONLY",
    assessedAt: "2026-07-20T10:36:05.000Z",
    captureStartedAt: null,
    coverage: { startedAt: null, endedAt: null },
    documentation: [{
      evidenceId: "okx-public-instruments-official-sdk-reference",
      evidenceType: "OFFICIAL_DOCUMENTATION",
      url: "https://github.com/okxapi/python-okx/blob/master/okx/PublicData.py",
      capturedAt: "2026-07-20T10:35:00.000Z",
      contentDigest: null,
      contentBytes: null,
      captureStatus: "REFERENCE_ONLY_UNHASHED",
      retentionClass: "REFERENCE_ONLY",
      claimScope: "LISTING_AND_DELISTING_FIELDS",
    }],
    guarantees: {
      fullUniverseDenominator: true,
      includesDelistedInstruments: false,
      onboardAt: true,
      delistAt: true,
      contractType: true,
      settlementAsset: true,
      underlyingClass: true,
      tradingStatusIntervals: false,
      symbolReuseDisambiguation: false,
    },
    declaredLimitations: [
      "list_and_expiry_fields_are_current_endpoint_state",
      "continuous_capture_has_not_started",
      "official_historical_download_does_not_advertise_instrument_snapshots",
    ],
  });

export const M2_BYBIT_CURRENT_INSTRUMENT_CAPABILITY =
  buildM2HistoricalInstrumentCapabilityArtifact({
    schemaVersion: M2_HISTORICAL_INSTRUMENT_CAPABILITY_VERSION,
    capabilityRegistryId: "bybit-linear-instruments-current.v1",
    providerId: "BYBIT_LINEAR_PERPETUAL",
    sourceOperator: "Bybit",
    sourceClass: "VENUE_OFFICIAL",
    evidenceMode: "CURRENT_SNAPSHOT_ONLY",
    assessedAt: "2026-07-20T10:36:05.000Z",
    captureStartedAt: null,
    coverage: { startedAt: null, endedAt: null },
    documentation: [{
      evidenceId: "bybit-instruments-info-doc-capture",
      evidenceType: "OFFICIAL_DOCUMENTATION",
      url: "https://bybit-exchange.github.io/docs/v5/market/instrument",
      capturedAt: "2026-07-20T10:36:05.000Z",
      contentDigest:
        "sha256:b9c06340c6f4544bcf67da9acb7d91a8c15a4bf3d269deaa7cdb3bc77ff974c5",
      contentBytes: 222_363,
      captureStatus: "HASHED_CONTENT_CAPTURED",
      retentionClass: "EXTERNAL_CONTENT_ADDRESSED_EVIDENCE_STORE",
      claimScope: "CURRENT_INSTRUMENT_FIELDS",
    }],
    guarantees: {
      fullUniverseDenominator: true,
      includesDelistedInstruments: false,
      onboardAt: true,
      delistAt: true,
      contractType: true,
      settlementAsset: true,
      underlyingClass: true,
      tradingStatusIntervals: false,
      symbolReuseDisambiguation: false,
    },
    declaredLimitations: [
      "official_endpoint_queries_online_trading_pairs",
      "current_status_and_launch_fields_are_not_historical_snapshots",
    ],
  });

export const M2_TARDIS_INSTRUMENT_CAPABILITY_CANDIDATE =
  buildM2HistoricalInstrumentCapabilityArtifact({
    schemaVersion: M2_HISTORICAL_INSTRUMENT_CAPABILITY_VERSION,
    capabilityRegistryId: "tardis-instrument-metadata-candidate.v1",
    providerId: "MULTI_VENUE_REFERENCE",
    sourceOperator: "Tardis.dev",
    sourceClass: "LICENSED_VENDOR",
    evidenceMode: "LICENSED_POINT_IN_TIME_REFERENCE",
    assessedAt: "2026-07-20T10:36:05.000Z",
    captureStartedAt: null,
    coverage: { startedAt: null, endedAt: null },
    documentation: [{
      evidenceId: "tardis-instrument-metadata-doc-capture",
      evidenceType: "VENDOR_DOCUMENTATION",
      url: "https://docs.tardis.dev/api/instruments-metadata-api",
      capturedAt: "2026-07-20T10:36:05.000Z",
      contentDigest:
        "sha256:daac1114ae41c07cad2c44a2cb2dd1a2f9f70d0c505dc7299f46aa5284b6a688",
      contentBytes: 810_561,
      captureStatus: "HASHED_CONTENT_CAPTURED",
      retentionClass: "EXTERNAL_CONTENT_ADDRESSED_EVIDENCE_STORE",
      claimScope: "HISTORICAL_INSTRUMENT_COVERAGE",
    }],
    guarantees: {
      fullUniverseDenominator: true,
      includesDelistedInstruments: true,
      onboardAt: false,
      delistAt: false,
      contractType: true,
      settlementAsset: false,
      underlyingClass: true,
      tradingStatusIntervals: false,
      symbolReuseDisambiguation: false,
    },
    declaredLimitations: [
      "listing_date_is_if_known",
      "available_to_can_lag_actual_delisting",
      "non_multiplier_metadata_changes_are_best_effort",
      "provider_symbol_reuse_requires_external_disambiguation",
      "contractual_capability_sla_not_reviewed",
    ],
  });

export const M2_KAIKO_INSTRUMENT_CAPABILITY_CANDIDATE =
  buildM2HistoricalInstrumentCapabilityArtifact({
    schemaVersion: M2_HISTORICAL_INSTRUMENT_CAPABILITY_VERSION,
    capabilityRegistryId: "kaiko-reference-instruments-candidate.v1",
    providerId: "MULTI_VENUE_REFERENCE",
    sourceOperator: "Kaiko",
    sourceClass: "LICENSED_VENDOR",
    evidenceMode: "LICENSED_POINT_IN_TIME_REFERENCE",
    assessedAt: "2026-07-20T10:36:05.000Z",
    captureStartedAt: null,
    coverage: { startedAt: null, endedAt: null },
    documentation: [{
      evidenceId: "kaiko-reference-instruments-doc-capture",
      evidenceType: "VENDOR_DOCUMENTATION",
      url: "https://docs.kaiko.com/rest-api/data-feeds/reference-data/basic-tier/exchange-trading-pair-codes-instruments",
      capturedAt: "2026-07-20T10:36:05.000Z",
      contentDigest:
        "sha256:dd80616e2ad3b6cf68a2810993a8ea8b83eb775cff0dbed897078a73f19beb4f",
      contentBytes: 1_422_334,
      captureStatus: "HASHED_CONTENT_CAPTURED",
      retentionClass: "EXTERNAL_CONTENT_ADDRESSED_EVIDENCE_STORE",
      claimScope: "HISTORICAL_INSTRUMENT_COVERAGE",
    }],
    guarantees: {
      fullUniverseDenominator: false,
      includesDelistedInstruments: true,
      onboardAt: false,
      delistAt: false,
      contractType: true,
      settlementAsset: false,
      underlyingClass: true,
      tradingStatusIntervals: false,
      symbolReuseDisambiguation: false,
    },
    declaredLimitations: [
      "trade_start_and_end_are_data_availability_not_listing_status",
      "point_in_time_status_transition_history_unproven",
      "contractual_capability_sla_not_reviewed",
    ],
  });

export const M2_HISTORICAL_INSTRUMENT_SOURCE_CANDIDATES = Object.freeze([
  M2_BINANCE_CURRENT_INSTRUMENT_CAPABILITY,
  M2_OKX_CURRENT_INSTRUMENT_CAPABILITY,
  M2_BYBIT_CURRENT_INSTRUMENT_CAPABILITY,
  M2_TARDIS_INSTRUMENT_CAPABILITY_CANDIDATE,
  M2_KAIKO_INSTRUMENT_CAPABILITY_CANDIDATE,
]);
