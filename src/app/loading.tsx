import { SiteNav } from "@/components/site-nav";

const blocks = [
  "雷达总控",
  "候选信号",
  "榜单合同",
  "系统状态",
  "复盘摘要",
  "数据源探针",
];

export default function Loading() {
  return (
    <div className="min-h-dvh bg-background">
      <SiteNav />
      <main className="mx-auto max-w-[1560px] px-4 py-5 sm:px-6">
        <div className="border border-border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="h-4 w-28 animate-pulse bg-muted" />
              <div className="mt-3 h-8 w-64 animate-pulse bg-muted/80" />
            </div>
            <div className="h-9 w-36 animate-pulse bg-muted/70" />
          </div>
          <div className="mt-5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {blocks.map((block, index) => (
              <div
                key={block}
                className="border border-border bg-background/40 p-4"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{block}</span>
                  <span className="size-2 animate-pulse bg-neon" />
                </div>
                <div className="mt-4 h-6 w-24 animate-pulse bg-muted" />
                <div className="mt-3 h-2 w-full animate-pulse bg-muted/60" />
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            正在读取后端真实合同，不触发额外 CoinGlass 深扫。
          </p>
        </div>
      </main>
    </div>
  );
}
