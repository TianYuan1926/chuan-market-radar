import { SiteNav } from '@/components/site-nav'
import { ReviewEvolution } from '@/components/review/review-evolution'
import { getReviewContractForPage } from '@/lib/frontend-contract-server'
import { PAGE_DISPLAY_NAMES } from '@/lib/ui-schema/display-names'

export const dynamic = 'force-dynamic'

export default async function ReviewPage() {
  const review = await getReviewContractForPage()

  return (
    <main className="min-h-screen">
      <SiteNav />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <header className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">{PAGE_DISPLAY_NAMES.review}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            每日异动复盘、扫描帧回放与交易日记——让系统在样本中持续进化
          </p>
        </header>
        <div className="space-y-6">
          <ReviewEvolution contract={review} />
        </div>

        <p className="mt-8 text-center text-xs text-muted-foreground">
          后端契约数据仅供市场研究与系统校准，不构成投资建议
        </p>
      </div>
    </main>
  )
}
