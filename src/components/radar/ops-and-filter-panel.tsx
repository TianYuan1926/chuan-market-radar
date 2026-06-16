import type { ReactNode } from "react";

type OpsSummaryItem = {
  label: string;
  value: string;
};

type OpsAndFilterPanelProps = {
  eventCenterPanel: ReactNode;
  filterItems: OpsSummaryItem[];
  healthPanel: ReactNode;
  marketNote: string;
  summaryItems: OpsSummaryItem[];
};

export function OpsAndFilterPanel({
  eventCenterPanel,
  filterItems,
  healthPanel,
  marketNote,
  summaryItems,
}: OpsAndFilterPanelProps) {
  return (
    <div className="ops-filter-panel">
      <section className="module cockpit-briefing ops-filter-panel__briefing">
        <div className="module-head">
          <h2>运行简报</h2>
          <span className="tag">Live</span>
        </div>
        <div className="cockpit-briefing__grid ops-filter-panel__summary" aria-label="控制台运行状态">
          {summaryItems.map((item) => (
            <span key={item.label}><b>{item.value}</b>{item.label}</span>
          ))}
        </div>
        <div className="ops-filter-panel__filters" aria-label="机会过滤器">
          {filterItems.map((item) => (
            <span className="badge badge-sm" key={item.label}>
              {item.label} {item.value}
            </span>
          ))}
        </div>
        <div className="cockpit-briefing__note">
          <strong>时段提示</strong>
          <span>{marketNote}</span>
        </div>
      </section>

      {healthPanel}
      {eventCenterPanel}
    </div>
  );
}
