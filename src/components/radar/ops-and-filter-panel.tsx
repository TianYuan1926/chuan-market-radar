type OpsSummaryItem = {
  label: string;
  value: string;
};

type OpsAndFilterPanelProps = {
  eventItems: OpsSummaryItem[];
  filterItems: OpsSummaryItem[];
  healthItems: OpsSummaryItem[];
  marketNote: string;
  summaryItems: OpsSummaryItem[];
};

export function OpsAndFilterPanel({
  eventItems,
  filterItems,
  healthItems,
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

      <section className="module ops-filter-panel__compact" aria-label="系统状态摘要">
        <div className="module-head">
          <h2>系统状态</h2>
          <span className="tag">摘要</span>
        </div>
        <div className="ops-filter-panel__compact-grid">
          {healthItems.map((item) => (
            <span key={item.label}>
              <b>{item.value}</b>
              <small>{item.label}</small>
            </span>
          ))}
        </div>
        <button className="action-button action-button--ghost" type="button">
          打开系统详情
        </button>
      </section>

      <section className="module ops-filter-panel__compact" aria-label="事件中心摘要">
        <div className="module-head">
          <h2>事件中心</h2>
          <span className="tag">{eventItems.length} 条</span>
        </div>
        <div className="ops-filter-panel__event-list">
          {eventItems.map((item) => (
            <span key={`${item.label}-${item.value}`}>
              <b>{item.label}</b>
              <small>{item.value}</small>
            </span>
          ))}
        </div>
        <button className="action-button action-button--ghost" type="button">
          打开事件流
        </button>
      </section>
    </div>
  );
}
