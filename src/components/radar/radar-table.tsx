import { signalStateLabels } from "@/lib/analysis/constants";
import type { MarketSignal } from "@/lib/analysis/types";

type RadarTableProps = {
  signals: MarketSignal[];
  selectedId?: string;
  onOpenDossier?: (id: string) => void;
  onSelect: (id: string) => void;
};

export function RadarTable({ signals, selectedId, onOpenDossier, onSelect }: RadarTableProps) {
  return (
    <section className="module">
      <div className="module-head">
        <div>
          <h2>候选池</h2>
          <span className="candidate-table__subtitle">完整信号列表 · 不做静默截断</span>
        </div>
        <span className="tag">{signals.length} 全量</span>
      </div>

      <div className="candidate-table">
        {signals.length === 0 ? (
          <div className="empty-state">
            <p>当前轮没有通过候选门的信号。</p>
            <span>这不代表系统未运行；请查看覆盖率、下一轮批次、风控阻断和扫描回放。</span>
          </div>
        ) : (
          <>
            <div className="candidate-table__meta" aria-label="候选池完整性">
              <span>已展示 <b>{signals.length}</b> / 共 <b>{signals.length}</b></span>
              <span>排序来源：后端扫描结果</span>
              <span>点击任意行打开信号档案</span>
            </div>
            {signals.map((signal) => {
              const shortSymbol = signal.symbol.replace("USDT", "");

              return (
                <button
                  className={selectedId === signal.id ? "candidate-row is-selected" : "candidate-row"}
                  key={signal.id}
                  onClick={() => {
                    onSelect(signal.id);
                    onOpenDossier?.(signal.id);
                  }}
                  type="button"
                >
                  <span>
                    <span className="row-symbol">{shortSymbol}</span>
                    <span className="row-note">{signalStateLabels[signal.state]}</span>
                  </span>
                  <span className="row-score">{signal.confidence}</span>
                  <span className="row-note">{signal.summary}</span>
                  <span className="row-trigger">触发 {signal.strategy.entry}</span>
                  <span className="row-risk">失效 {signal.strategy.invalidation}</span>
                </button>
              );
            })}
          </>
        )}
      </div>
    </section>
  );
}
