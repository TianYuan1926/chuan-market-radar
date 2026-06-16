# UI Reset Living Radar Cockpit Design

## Purpose

This spec locks the next frontend direction for Chuan Market Radar. The user rejected the current surface because it feels like a static paper page: too much text, weak hierarchy, little operational feedback, and no strong visual identity. The next frontend phase is a full UI reset of the presentation layer, not a small polish pass.

The product goal does not change: find early long/short opportunities in altcoin contract markets, explain the evidence, define entry/exit/invalidation conditions, and feed review results back into the system.

## Scope

Keep:

- Existing Next.js App Router project.
- Existing API routes, provider contracts, scan logic, analysis rules, journal, archive, rank, alert, health, and Neon persistence.
- CoinGlass as the primary contract-data provider under the amateur-plan budget.
- TradingView external opening behavior.
- Existing production stability and test standards.

Rebuild:

- Homepage information architecture.
- Visual system, spacing, density, hierarchy, and component shell.
- Top navbar/banner.
- Desktop cockpit layout.
- Mobile layout.
- Runtime feedback layer.
- Pixel companion area.
- Interaction linking between signal, strategy, chart, journal, companion, replay, and health surfaces.
- CSS/component organization for the frontend presentation layer.

Out of scope:

- Mainland China hosting, ICP filing, mainland CDN, or mainland access optimization.
- Background music.
- Auto trading or execution.
- Telegram/Webhook integration.
- Installing Element Plus into the React/Next.js app.
- Replacing the market engine during the UI reset.

## Product Principle

Every frontend decision must answer at least one of these questions faster:

- What should I pay attention to now?
- Is this a long setup, short setup, observation only, or no-trade state?
- What evidence supports it?
- What evidence argues against it?
- What exact condition would trigger action?
- Where is it invalidated?
- What should be reviewed later?
- Is the system live, stale, degraded, or waiting?

If a UI idea does not support those questions, it is decorative and should be removed, delayed, or hidden behind a user-controlled setting.

## Design System Decision

Use:

- Tailwind CSS for layout, spacing, responsive behavior, state classes, and motion.
- daisyUI for semantic UI primitives: navbar, card, badge, stats, tabs, drawer, dropdown, tooltip, progress, alert, button, and loading.

Reference only:

- Element UI / Element Plus design principles for consistency, feedback, efficiency, controllability, dense tables, clear form states, and status expression. Do not install Element Plus because this project is React/Next.js and Element Plus is Vue-oriented.

Custom CSS is allowed only for:

- Brand identity.
- Crystal Lens / radar-eye treatment.
- Pixel companion drawing and state animation.
- Low-level motion that Tailwind/daisyUI cannot express cleanly.
- Reduced-motion fallbacks.

## Visual Direction

The interface should feel like a living altcoin contract radar cockpit:

- Mature, sharp, and dense enough for repeated trading review.
- Distinctly "川", not generic SaaS or generic crypto dashboard.
- Pixel/anime-influenced, but not childish.
- Crystal Lens visual asset used as a controlled layer, not a full-page wallpaper.
- Data-first: visuals frame the evidence, never hide it.

Required brand signals:

- "川" appears in the first viewport as a real mark, not only small nav text.
- "Chuan Market Radar" remains visible.
- Crystal Lens appears as radar eye, boot lens, signal focus layer, or subtle cockpit texture.
- The site must avoid looking like a flat document, static spreadsheet, or marketing landing page.

## Page Architecture

### Top Layer: Live Navbar / Banner

Purpose: show brand and live system state immediately.

Required content:

- "川" mark.
- Chuan Market Radar name.
- CoinGlass live/fallback/stale status.
- Neon ready/degraded status.
- Last scan time.
- Next scan countdown when available.
- Current market session: Asia, London, New York, overlap, weekend/low-liquidity.
- Scan freshness.
- Request budget state.
- Health indicator.

Acceptance:

- Within the first glance, the user knows whether the radar is operating, stale, or degraded.

### Main Layer: Unified Cockpit

Desktop layout:

- One cockpit container.
- Columns: left / center / right = 2 : 6 : 2.
- No scattered card wall.
- No nested decorative cards.
- Stable dimensions for status chips, counters, and interactive controls.

Mobile layout:

- Opportunity surface first.
- Tabs or drawer for system, dossier, companion, journal, and replay.
- No forced three-column compression.
- No clipped text or overlapping controls.

### Left Column: Operations And Filters

Required modules:

- Provider status.
- Database status.
- Scan cadence and freshness.
- Scan coverage: current pool, scanned, pending, stale.
- CoinGlass request economy: daily budget, used, remaining, per-round estimate, limit state.
- Market-session clock.
- Filters: long, short, abnormal watch, near trigger, high risk, invalidated, stale.
- Event stream: new signal, signal disappeared, scan failed, data stale, review due.

Acceptance:

- The user can tell what the system is doing before reading any strategy card.

### Center Column: Altcoin Opportunity Radar

This is the main product surface.

Required modules:

- Altcoin Opportunity Board.
- Opportunity groups:
  - Long warming.
  - Short warming.
  - Near trigger.
  - Overextended / no chase.
  - New or long-tail watch.
  - Data-insufficient watch.
- Ranked candidate list with compact but readable evidence.
- Selected signal workspace.
- Evidence chain.
- Counter-evidence.
- Conditional long/short plan.
- Entry trigger.
- Exit / take-profit zone.
- Stop / invalidation.
- "Do not chase" state when applicable.
- TradingView open action.
- Signal lifecycle: discovered, watching, confirming, triggered, invalidated, review due, reviewed.

Acceptance:

- Clicking one symbol must answer: why it is here, what direction it leans, what must happen next, how it fails, and what to review.

### Right Column: Companion, Rank, Journal, Review

The old vehicle/S680 line is removed from the active product direction. The companion is a male pixel co-pilot.

Required modules:

- Pixel male co-pilot with BTC necklace.
- Rank and discipline snapshot.
- Equipment state based on level/discipline.
- Contextual speech tied to the selected signal or system state.
- Quick journal action.
- Review reminders.
- Lightweight replay/lifecycle summary.
- Easter eggs tied to discipline and review, not profit promises.

Acceptance:

- The companion is not a static image. It reflects system state, selected signal, discipline state, and review behavior.

## Runtime Feedback

Required:

- Short skippable boot animation.
- Intro briefing that states site purpose, current scan source, and risk boundary.
- Scan heartbeat.
- Last update and stale-state dimming.
- New signal highlight.
- Numeric transition for changed metrics.
- Event stream movement.
- Loading, empty, stale, degraded, and error states.
- Reduced-motion fallback.

Rejected:

- Background music.
- Motion that exists only as decoration.
- Fake realtime effects when data is stale.
- Auto popups that cover the main signal without user action.

Acceptance:

- The page visibly feels alive because real state changes are represented, not because decorative animation loops run forever.

## Interaction Contracts

Required links:

- Candidate click updates selected signal details.
- Selected signal updates TradingView symbol and timeframe actions.
- Selected signal updates companion speech.
- "Record observation" pre-fills journal context with symbol, direction, evidence, and planned review timing.
- Invalidated signal enters review queue.
- New scan event updates left event stream and top health state.
- Rank/discipline changes update companion equipment and speech.
- Macro regime changes are visible as risk/weather context, not hidden weight mutations.

Acceptance:

- The homepage behaves like one workflow, not separate panels sharing a page.

## Macro And Altcoin Balance

Primary target:

- Altcoins, including newer and long-tail contract names.

Environment layer:

- BTC and ETH remain required as market-weather filters.
- ETF/macro/CoinGlass extra data can be added later only when the actual available endpoint and quota are verified.

Rule:

- Macro context changes confidence, timing, and risk explanation. It must not bury the altcoin opportunity board.

## Data Boundaries

Frontend must clearly distinguish:

- Live CoinGlass data.
- Cached/stale data.
- Public OHLCV data.
- Derived evidence.
- Rule-engine judgment.
- AI review, when available later.
- User journal/review data.

Frontend must not:

- Present incomplete data as complete.
- Convert daily movers into direct trade signals.
- Hide missing fields.
- Say "must buy" or "must short".

## Stability And DIY Requirements

The UI reset must keep future changes safe:

- Split large UI into focused components where practical.
- Keep business logic out of presentation-only components.
- Make filters, copy, companion lines, equipment, and animation preferences configurable over time.
- Keep every optional layer degradable.
- Preserve existing tests and add repository hygiene tests for architectural constraints.
- Run typecheck, lint, test, build, and diff checks before handoff.

## Suggested Component Boundaries

- `TopRadarBar`: live brand/status/session layer.
- `RadarBootBriefing`: short startup and purpose/risk briefing.
- `RadarCockpitShell`: desktop 2:6:2 and mobile tab/drawer layout.
- `OpsAndFilterPanel`: provider, scan economy, filters, event stream.
- `AltcoinOpportunityBoard`: grouped opportunity surface.
- `SignalFocusPanel`: selected signal evidence, counter-evidence, plan, invalidation.
- `MacroWeatherPanel`: BTC/ETH environment context.
- `SignalLifecyclePanel`: discovered/watching/triggered/invalidated/reviewed path.
- `PixelCoPilot`: male pixel companion state machine.
- `QuickJournalPanel`: selected-signal journal actions.

These are target boundaries. Implementation can migrate gradually, but the final UI reset should not keep all presentation behavior inside one oversized workspace component.

## Acceptance Checklist

- [ ] Tailwind CSS and daisyUI are actually installed/configured before claiming they are used.
- [ ] Element Plus is documented as reference only, not installed.
- [ ] The homepage is a new cockpit shell, not the old page with extra classes.
- [ ] Desktop uses 2:6:2 within one cockpit container.
- [ ] Mobile prioritizes the opportunity board and uses tabs/drawer for secondary surfaces.
- [ ] Top bar shows live/stale/degraded state.
- [ ] The center board is clearly altcoin-first.
- [ ] BTC/ETH appear as market weather, not the main replacement surface.
- [ ] Candidate selection updates signal detail, TradingView, companion, and journal context.
- [ ] Pixel co-pilot replaces the S680 product direction.
- [ ] Crystal Lens is integrated without covering market evidence.
- [ ] Boot/briefing is short, skippable, and reduced-motion friendly.
- [ ] No background music is added.
- [ ] Mainland access work is excluded.
- [ ] Empty/error/stale/loading states exist.
- [ ] Browser QA checks desktop and mobile overflow before handoff when local port permission allows it.

## Implementation Order

1. Correct dependency and CSS foundation: Tailwind CSS + daisyUI.
2. Build the new app shell: top bar, boot briefing, cockpit layout.
3. Migrate left operations and filters.
4. Build center altcoin opportunity board and selected signal focus.
5. Migrate right companion, rank, journal, and review.
6. Add runtime feedback and lifecycle linking.
7. Add mobile tabs/drawer.
8. Run browser QA and verification.

