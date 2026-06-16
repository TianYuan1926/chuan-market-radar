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
        <h2>候选池</h2>
        <span className="tag">异动流</span>
      </div>

      <div className="candidate-table">
        {signals.length === 0 ? (
          <div className="empty-state">
            <p>扫描池待接入。</p>
            <span>后续会接入真实扫描结果；当前页面只保留演示数据结构。</span>
          </div>
        ) : (
          signals.map((signal) => {
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
          })
        )}
      </div>
    </section>
  );
}
