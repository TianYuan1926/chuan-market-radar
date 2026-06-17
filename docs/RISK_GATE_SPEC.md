# Risk Gate Spec

This document defines v3 hard gates for Altcoin Trend Radar v3.

## Goal

Risk Gate decides whether a setup is allowed to become a trade plan. It has priority over PreTrendScore, TrendEnergyScore, technical indicators, and AI review.

## Hard Gates

- Reward/risk below `3:1` => no trade.
- Stop loss without structural meaning => no trade.
- Stop distance too far from structure => avoid chase and wait for pullback or retest.
- RiskScore too high => no chase.
- Severe evidence conflict => `CONFLICT_WAIT`.
- Structure invalidated => `INVALIDATED`.
- Major market regime deterioration => downgrade or no trade.
- Liquidity too poor => no trade.
- Funding/OI extremely crowded => no chase.
- Low timeframe signal against higher timeframe support/resistance => conflict or avoid chase.

## Long-Side Chase Risk

Avoid long chase when:

- Price is far above breakout zone.
- Funding is extreme.
- OI spikes while price stalls.
- Resistance zone is too close.
- Reward/risk is below threshold.
- Long upper wick rejection appears near higher timeframe resistance.

## Short-Side Chase Risk

Avoid short chase when:

- Price is far below breakdown zone.
- Support zone is too close.
- Price prints a long lower wick reclaim.
- Taker sell pressure fades.
- Reward/risk is below threshold.
- Low timeframe breakdown hits higher timeframe support.

## Report Boundary

Risk Gate output is structural data. The report generator may explain why a gate blocked a setup, but it cannot invent a new direction or override the blocked decision.
