**Source Visual Truth**
- Path: `/Users/chuan/Downloads/虚拟货币异动检测网站 3/src/imports/image-7.png`
- Intent: black/gold `CHUANSCAN` anomaly radar, compact top nav, live ticker strip, KPI wall, primary signal-card grid, right alert/market-heat column, dark professional data surface.

**Implementation Evidence**
- Local URL: `http://localhost:3000/?qa=figma-rebuild-clean`
- Desktop screenshot: `/Users/chuan/Documents/web/.playwright-mcp/design-qa-chuanscan/chuan-scan-current-desktop.png`
- Mobile screenshot: `/Users/chuan/Documents/web/.playwright-mcp/design-qa-chuanscan/chuan-scan-current-mobile.png`
- Full-view comparison: `/Users/chuan/Documents/web/.playwright-mcp/design-qa-chuanscan/chuan-scan-design-comparison.png`
- Accessibility snapshot: `/Users/chuan/Documents/web/.playwright-mcp/design-qa-chuanscan/chuan-scan-redesign-accessibility.md`
- Desktop viewport: `1536 x 960`
- Mobile viewport: `390 x 844`
- State: default Radar screen after startup overlay auto-dismissed, local mock/provider state from `.env.local`.

**Findings**
- No P0/P1/P2 blocking issues remain.
- Fonts and typography: the implementation now uses the same dense black/gold dashboard hierarchy as the Figma source: large signal title, compact nav labels, tabular market numbers, score rings, and small operational labels. Mobile text remains readable without horizontal overflow.
- Spacing and layout rhythm: the old 2:6:2 cockpit was removed from the first screen. The new first screen follows the source structure: top nav, ticker strip, KPI wall, main signal grid, right alert/heat/status rail, and a compact selected-plan dock.
- Colors and visual tokens: black base, amber/gold accents, green/red market states, thin borders, low-opacity panel surfaces, and muted secondary text match the selected Figma direction. The prior light liquid-glass visual language is no longer driving the homepage.
- Image quality and asset fidelity: the Figma source screen is mostly UI-native. The implementation avoids fake chart screenshots or decorative image placeholders and uses real backend data surfaces instead.
- Copy and content: all visible app copy is Chinese-first and trading-workflow specific. The UI does not claim automatic execution, guaranteed direction, or fabricated K-line data.
- Interaction states: top nav opens functional drawers, filter tabs actually filter the signal list, signal cards select a candidate, the dossier button opens a signal dossier, journal buttons write through the existing `/api/journal` path, and TradingView opens the real external chart URL.
- Backend fusion: signal cards, KPI counts, market heat, scan proof, selected plan, alert list, assistant status, drawer content, and dossier content all use current `snapshot`, `health`, `backendContract`, `journalEvents`, or `dailyMoverArchive` props rather than copied Figma mock arrays.
- Mobile responsiveness: at `390px`, the screen stacks cleanly, keeps nav horizontally scrollable, preserves signal cards, plan dock, alert list, heat board, scan proof, and assistant card without horizontal overflow.
- Runtime console: current clean run at `http://localhost:3000/?qa=figma-current` has no application errors; the only console entries are React DevTools/HMR development messages.

**Patches Made**
- Replaced the homepage render path from `RadarWorkspace` to `ChuanScanWorkspace`.
- Rebuilt the first-screen UI around the black/gold Figma source instead of the previous light/liquid cockpit.
- Removed the old homepage visual structure from the rendered screen: no left scan-control column, no center chart-first module, no right action rail as the primary layout.
- Added real signal filtering: all, long candidates, short candidates, breakout/near-trigger, watch pool, and high-risk warnings.
- Kept non-primary modules behind drawers: Signals, Review, Journal, Evolution, Settings.
- Preserved the real backend contract: no Figma mock data, no `Math.random()` candles, no copied liquidation heatmap concepts.
- Fixed the earlier `next/image fill` parent-position warning by removing the fill-dependent hero image path from the new topbar design.
- Restarted the dev server after a Fast Refresh stale runtime error and re-captured clean desktop/mobile screenshots.

**Open Questions**
- The source Figma screen uses mock marketing-style quantities like broad “284” counters. The implementation intentionally replaces those with live backend counts, so numeric parity is not expected.
- The source has richer card-type badges such as `PUMP/WHALE/BREAK`. The current implementation maps to the project’s real direction/state/risk vocabulary. This is intentional until backend evidence families expose a stable display taxonomy for those labels.

**Implementation Checklist**
- Keep the black/gold shell as the new homepage baseline.
- Next frontend iteration should refine motion/hover polish, not restore the old liquid cockpit.
- Add a backend-backed display taxonomy for signal card badges if we want Figma-style `PUMP/BREAK/FLOW` tags without inventing labels.
- Capture another QA pass against production live CoinGlass data after deploy, because local `.env.local` currently renders mock/provider-preview values.

**Final Result**
final result: passed

**2026-06-20 Alert History QA**
- Local URL: `http://127.0.0.1:3100/`
- Mode: production build via `npm run build` + `PORT=3100 npm run start`
- Desktop viewport: `1536 x 960`
- Mobile viewport: `390 x 844`
- Desktop checks: homepage rendered, `站内告警` visible in the right rail, Settings drawer opened, `站内告警设置` visible, Telegram/Webhook disabled boundary visible.
- Mobile checks: topbar visible, `站内告警` visible, menu opened Settings drawer, `站内告警设置` visible, no horizontal overflow.
- API smoke: `/` 200, `/api/health` 200, `/api/scan` 200. Local `.env.local` rendered `mock` preview data; production live CoinGlass still needs server-side verification after deploy.
- Protected admin smoke: `/api/admin/deployment/readiness` returned 401 without Bearer token, which is expected for a protected endpoint.
- Runtime console: no warning/error messages captured.
- Result: passed.
