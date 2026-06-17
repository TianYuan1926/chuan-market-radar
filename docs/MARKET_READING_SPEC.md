# Market Reading Engine Spec

This document defines the v3 market-reading layer for Chuan Market Radar / Altcoin Trend Radar v3.

## Goal

The Market Reading Engine converts OHLCV candles into structure facts. It does not create trade decisions, does not issue buy/sell calls, and does not bypass EvidenceItem or Risk Gate.

## Non-Goals

- No automatic trading.
- No prediction of guaranteed upside or downside.
- No liquidation heatmap, liquidation-zone module, heatmap provider, or potential liquidation-zone trading logic.
- No report-generator judgment.
- No single-indicator decision.

## Required Structure Features

- Swing highs and swing lows.
- HH / HL / LH / LL.
- BOS: break of structure.
- CHoCH: change of character.
- Range high and range low.
- Range compression.
- ATR contraction and volatility expansion.
- Close above range and close below range.
- Long upper wick fake breakout.
- Long lower wick fake breakdown.
- Pullback quality after bullish breakout.
- Retest quality after bearish breakdown.
- Trend integrity.
- Exhaustion risk.

## Market Grammar

Structure facts must be translated into market grammar before strategy scoring:

- `RANGE + COMPRESSION + LOW_VOLUME` => range compression.
- `COMPRESSION + APPROACHING_RESISTANCE + HIGHER_LOWS` => pre-trend long.
- `COMPRESSION + APPROACHING_SUPPORT + LOWER_HIGHS` => pre-trend short.
- `BREAKOUT + CLOSE_ABOVE + VOLUME_EXPANSION` => long breakout confirmation.
- `BREAKDOWN + CLOSE_BELOW + VOLUME_EXPANSION` => short breakdown confirmation.
- `BREAKOUT + LONG_UPPER_WICK + CLOSE_BACK_IN_RANGE` => fakeout risk.
- `BREAKDOWN + LONG_LOWER_WICK + CLOSE_BACK_IN_RANGE` => fake breakdown risk.
- `UPTREND + LOW_VOLUME_PULLBACK + STRUCTURE_HOLD` => healthy long pullback.
- `DOWNTREND + LOW_VOLUME_RETEST + RESISTANCE_HOLD` => healthy short retest.
- `HIGH_PRICE + VOLUME_SPIKE + PRICE_STALL` => long exhaustion risk.
- `LOW_PRICE + SELLING_CLIMAX + RECLAIM` => initial support reaction.

## Trend States

The state machine must support:

- `RANGE_IDLE`
- `RANGE_COMPRESSION`
- `PRE_TREND_LONG`
- `PRE_TREND_SHORT`
- `LONG_BREAKOUT`
- `SHORT_BREAKDOWN`
- `LONG_PULLBACK_CONFIRM`
- `SHORT_RETEST_CONFIRM`
- `LONG_TREND_ACCELERATION`
- `SHORT_TREND_ACCELERATION`
- `LONG_EXHAUSTION`
- `SHORT_EXHAUSTION`
- `INVALIDATED`
- `CONFLICT`

## Timeframe Responsibilities

- `1w` / `1d`: macro boundaries, major levels, large trend context.
- `4h`: primary trading structure.
- `1h`: plan detail, entry area, structural stop refinement.
- `15m`: trigger confirmation and reclaim/retest confirmation.
- `5m`: execution refinement only; it cannot decide direction.

Low timeframe signals cannot override higher timeframe structure.
