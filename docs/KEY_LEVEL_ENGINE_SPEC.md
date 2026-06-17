# Key Level Engine Spec

This document defines the v3 Key Level Engine and Forward Level Map for Altcoin Trend Radar v3.

## Goal

The Key Level Engine identifies meaningful support and resistance zones before price reaches them. A key level is always a zone, never a single price point.

## Non-Goals

- No automatic trading.
- No buy/sell decision from a touched support or resistance.
- No liquidation heatmap, liquidation-zone module, heatmap provider, or potential liquidation-zone trading logic.
- No unlimited chart line generation.

## KeyLevel Schema

`KeyLevel` must include:

- `id`
- `symbol`
- `timeframe`
- `type`
- `zoneLow`
- `zoneHigh`
- `midPrice`
- `direction`
- `keyScore`
- `reactionScore`
- `confluenceScore`
- `status`
- `reasons`
- `confirmationRules`
- `invalidationRule`

## Level Types

- `SWING_HIGH`
- `SWING_LOW`
- `RANGE_HIGH`
- `RANGE_LOW`
- `ROLE_FLIP`
- `VOLUME_NODE`
- `DYNAMIC_LEVEL`
- `PSYCHOLOGICAL`
- `STATE_CHANGE`

## Level Direction

- `SUPPORT`
- `RESISTANCE`
- `BOTH`

## Level Status

- `POTENTIAL`
- `ARRIVED`
- `REACTION_STARTED`
- `CONFIRMED`
- `WEAKENING`
- `BROKEN`
- `RECLAIMED`
- `INVALIDATED`

## Level Rules

- Higher timeframe levels have priority over lower timeframe levels.
- Low timeframe signals cannot invalidate higher timeframe levels alone.
- Output at most 3 support zones, 3 resistance zones, 1 primary breakout zone, and 1 primary invalidation zone.
- Every level must include reasons, confirmation rules, and an invalidation rule.
- Price touching support is not a long signal.
- Price touching resistance is not a short signal.
- Confirmation requires close acceptance, reaction quality, volume behavior, and structure change.

## Forward Level Map

Forward Map must generate:

- S1/S2/S3 support candidates.
- R1/R2/R3 resistance candidates.
- Current defense level.
- Next reaction zone.
- First rebound resistance.
- Trend change level.
- Invalidation level.

Forward Map must be saved or reviewable as a pre-event artifact. Later review must distinguish `prebuilt level reacted` from `post-event drawing`.

## Reaction Scores

Support reaction considers:

- Slower selling into support.
- Long lower wick reclaim.
- Selling volume fails to continue breakdown.
- Taker sell pressure fades.
- Taker buy improves.
- 15m / 1h CHoCH.
- Reclaim of zone high.
- Pullback holds.
- OI/Funding cools down.

Resistance reaction considers:

- Failed close above resistance.
- Long upper wick rejection.
- Volume spike but price stalls.
- Taker buy fades.
- OI rises but price does not.
- Funding overheats.
- Last higher low breaks on 1h / 4h.
- Rebound forms lower high.
