**Source Visual Truth**
- Path: `/var/folders/25/47myfpbx27jbw68qkwp7lw_80000gn/T/codex-clipboard-86380f39-6234-4059-aa1a-17a18b895593.png`
- Intent: light liquid-glass radar workstation, prominent `川` brand, top lens/banner, 2:6:2 desktop cockpit, centered candidate strip plus chart, compact right action rail and small companion dock.

**Implementation Evidence**
- Desktop screenshot: `.playwright-mcp/design-qa-radar-ui/radar-selected-ui-final-desktop-1536.png`
- Mobile screenshot: `.playwright-mcp/design-qa-radar-ui/radar-selected-ui-final-mobile-390.png`
- Phase 8.2f desktop home screenshot: `.playwright-mcp/design-qa-radar-ui/radar-8-2f-desktop-home.png`
- Phase 8.2f desktop review drawer screenshot: `.playwright-mcp/design-qa-radar-ui/radar-8-2f-desktop-review-drawer.png`
- Phase 8.2f mobile review drawer screenshot: `.playwright-mcp/design-qa-radar-ui/radar-8-2f-mobile-review-drawer.png`
- Desktop viewport: 1536 x 1024.
- Mobile viewport: 390 x 844.
- State: local `http://localhost:3000/`, default radar route, live refresh idle/watch state.

**Findings**
- No P0/P1/P2 blocking issues remain.
- Fonts and typography: hierarchy is now tighter and aligned to the selected workstation direction; brand, nav, runtime metrics, candidate tiles, chart labels, and right rail are readable on desktop and mobile.
- Spacing and layout rhythm: desktop now keeps top banner, runtime row, 2:6:2 shell, candidate tiles, primary chart, and right action rail in the first viewport. Mobile stacks safely without horizontal overflow.
- Colors and visual tokens: palette follows the chosen white/blue liquid-glass direction and uses the provided crystal lens image as the main visual anchor. The compact pixel companion no longer uses the old S680 vehicle direction.
- Image quality and asset fidelity: `/assets/radar-crystal-lens.png` is used in the top lens and is marked as priority plus eager for above-the-fold loading.
- Copy and content: first-screen content is Chinese-first and action-oriented. Secondary features are represented as drawer entries instead of all being dumped into the homepage.
- Phase 8.2f navigation: Radar / Signals / Review / Journal / Evolution / Settings are now real interactive states. Signals, Review, Journal, Evolution, and Settings open a workspace drawer; Radar returns to the main cockpit.
- Phase 8.2f drawer runtime check: all five desktop drawers opened with the expected title, closed back to zero open drawers, and produced no horizontal overflow. The 390px mobile Review drawer also had no horizontal overflow and closed with Escape.

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

**Follow-up Polish**
- P3: the next UI pass should make the chart itself more TradingView-like with denser candles and key-level overlays.
- P3: the mobile route should eventually switch to tabbed sections instead of a long vertical scroll.

**Final Result**
final result: passed
