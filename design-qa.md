**Source Visual Truth**
- Path: `/var/folders/25/47myfpbx27jbw68qkwp7lw_80000gn/T/codex-clipboard-86380f39-6234-4059-aa1a-17a18b895593.png`
- Intent: light liquid-glass radar workstation, prominent `川` brand, top lens/banner, 2:6:2 desktop cockpit, centered candidate strip plus chart, compact right action rail and small companion dock.

**Implementation Evidence**
- Desktop screenshot: `.playwright-mcp/design-qa-radar-ui/radar-selected-ui-final-desktop-1536.png`
- Mobile screenshot: `.playwright-mcp/design-qa-radar-ui/radar-selected-ui-final-mobile-390.png`
- Phase 8.2f desktop home screenshot: `.playwright-mcp/design-qa-radar-ui/radar-8-2f-desktop-home.png`
- Phase 8.2f desktop review drawer screenshot: `.playwright-mcp/design-qa-radar-ui/radar-8-2f-desktop-review-drawer.png`
- Phase 8.2f mobile review drawer screenshot: `.playwright-mcp/design-qa-radar-ui/radar-8-2f-mobile-review-drawer.png`
- Phase 8.2g desktop boot briefing screenshot: `.playwright-mcp/design-qa-radar-ui/radar-8-2g-desktop-boot-briefing.png`
- Phase 8.2g mobile boot briefing screenshot: `.playwright-mcp/design-qa-radar-ui/radar-8-2g-mobile-boot-briefing.png`
- Phase 8.2g console evidence: `.playwright-mcp/design-qa-radar-ui/radar-8-2g-console.log`
- Phase 8.2h desktop signal dossier screenshot: `.playwright-mcp/design-qa-radar-ui/radar-8-2h-desktop-signal-dossier.png`
- Phase 8.2h mobile signal dossier screenshot: `.playwright-mcp/design-qa-radar-ui/radar-8-2h-mobile-signal-dossier.png`
- Phase 8.2h console evidence: `.playwright-mcp/design-qa-radar-ui/radar-8-2h-console.log`
- Desktop viewport: 1536 x 1024.
- Mobile viewport: 390 x 844.
- State: local `http://localhost:3001/`, default radar route, first-visit boot briefing state, drawer entry checks, and selected ENA Signal Dossier open state.

**Findings**
- No P0/P1/P2 blocking issues remain.
- Fonts and typography: hierarchy is now tighter and aligned to the selected workstation direction; brand, nav, runtime metrics, candidate tiles, chart labels, and right rail are readable on desktop and mobile.
- Spacing and layout rhythm: desktop now keeps top banner, runtime row, 2:6:2 shell, candidate tiles, primary chart, and right action rail in the first viewport. Mobile stacks safely without horizontal overflow.
- Colors and visual tokens: palette follows the chosen white/blue liquid-glass direction and uses the provided crystal lens image as the main visual anchor. The compact pixel companion no longer uses the old S680 vehicle direction.
- Image quality and asset fidelity: `/assets/radar-crystal-lens.png` is used in the top lens and is marked as priority plus eager for above-the-fold loading.
- Copy and content: first-screen content is Chinese-first and action-oriented. Secondary features are represented as drawer entries instead of all being dumped into the homepage.
- Phase 8.2f navigation: Radar / Signals / Review / Journal / Evolution / Settings are now real interactive states. Signals, Review, Journal, Evolution, and Settings open a workspace drawer; Radar returns to the main cockpit.
- Phase 8.2f drawer runtime check: all five desktop drawers opened with the expected title, closed back to zero open drawers, and produced no horizontal overflow. The 390px mobile Review drawer also had no horizontal overflow and closed with Escape.
- Phase 8.2g startup briefing: the first-visit boot briefing appears on desktop and mobile, carries the selected liquid-glass lens asset, preserves the `川` brand mark, and states the product boundary as a full-market altcoin trend-switch radar rather than a marketing page.
- Phase 8.2g interaction check: `查看信号池` opens the Signals drawer, `看复盘链路` opens the Review drawer, and `进入雷达` dismisses the briefing with `localStorage` persistence. Desktop and 390px mobile checks both reported no horizontal overflow.
- Phase 8.2h Signal Dossier: the selected ENA dossier opens as a right-side evidence room on desktop and a bottom sheet on mobile. It exposes one decision overview, four strategy status cells, three v3 evidence-path cards, the plan section, evidence room, and copilot discipline card. The current mock signal has no real `strategyV3`, so the dossier shows an explicit v3 pending state rather than fabricating a Forward Map.
- Phase 8.2h responsiveness: desktop `1536px` and mobile `390px` checks both reported no horizontal overflow. Drawer rects stayed within viewport: desktop `638px` right drawer, mobile `390px` bottom sheet.
- Runtime console: 0 errors and 0 warnings for the 8.2h Playwright QA run.

**Patches Made**
- Reordered the center workspace so the candidate strip and chart sit before deep review modules.
- Replaced the old rhythm strip with focused candidate tiles.
- Compressed the left ops panel and right action rail.
- Added mobile compaction rules and verified runtime grid columns at 390px.
- Removed the LCP warning by using priority plus eager loading for the above-the-fold lens image.
- Rechecked the desktop runtime console after the hydration clock fix: 0 errors and 0 warnings.
- Added functional workspace drawers for Signals, Review, Journal, Evolution, and Settings.
- Wired DailyMover manual calibration and strategy-draft confirmation actions into `/api/journal` as review records only.
- Preserved the homepage rule: full Replay, DailyMover, Journal, Rank, and Health modules stay behind navigation drawers instead of permanently occupying the first screen.
- Rebuilt `RadarBootBriefing` as a first-visit startup layer with real runtime data, skip persistence, Signals/Review drawer entry points, and reduced-motion-compatible brand motion.
- Added Phase 8.2g repository hygiene coverage for the startup briefing boundaries: no background music, no callout behavior, no automatic trading, and no static-only marketing surface.
- Upgraded `SignalDossier` into a light liquid-glass evidence room with a decision overview, status rail, v3 evidence path, clearer plan/evidence/review sections, and a discipline-focused copilot card.
- Added a v3 pending state so preview data without `strategyV3` remains honest: it states that Forward Map is waiting for data and does not affect live ranking.
- Added Phase 8.2h repository hygiene coverage for the Signal Dossier hierarchy and no-forbidden-module boundary.

**Follow-up Polish**
- P3: the next UI pass should make the chart itself more TradingView-like with denser candles and key-level overlays.
- P3: the mobile route should eventually switch to tabbed sections instead of a long vertical scroll.
- P3: when live `strategyV3` is present, capture a second dossier screenshot with real Key Levels / Forward Map populated instead of the mock pending state.

**Final Result**
final result: passed
