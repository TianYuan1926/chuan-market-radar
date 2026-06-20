export const dynamic = "force-static";

export default function Home() {
  return (
    <main className="frontend-reset-shell" aria-label="前端重建占位页">
      <section className="frontend-reset-card">
        <p className="frontend-reset-kicker">Frontend reset</p>
        <h1>前端已清空</h1>
        <p>
          当前只保留最小占位页，等待重新设计。后端 API、扫描、数据库、复盘、
          分析引擎和 Worker 未被删除。
        </p>
        <nav className="frontend-reset-links" aria-label="后端验证入口">
          <a href="/api/health">/api/health</a>
          <a href="/api/scan">/api/scan</a>
          <a href="/api/radar">/api/radar</a>
          <a href="/api/radar/backend-contract">/api/radar/backend-contract</a>
        </nav>
      </section>
    </main>
  );
}
