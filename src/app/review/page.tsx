import { SiteNav } from '@/components/site-nav'
import { ReviewCenter } from '@/components/review-center'
import { ReviewEvolution } from '@/components/review/review-evolution'

export default function ReviewPage() {
  return (
    <main className="min-h-screen">
      <SiteNav />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <header className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">复盘进化中心</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            每日异动复盘、扫描帧回放与交易日记——让系统在样本中持续进化
          </p>
        </header>
        <ReviewCenter />

        {/* 后端承载位：信号生命周期 / MFE-MAE / 策略分型 / 漏判复查 / 进化建议 */}
        <ReviewEvolution />

        <p className="mt-8 text-center text-xs text-muted-foreground">
          数据均为模拟演示，仅供参考，不构成投资建议
        </p>
      </div>
    </main>
  )
}
