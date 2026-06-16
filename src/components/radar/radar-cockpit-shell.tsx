import type { ReactNode } from "react";

type RadarCockpitShellProps = {
  center: ReactNode;
  left: ReactNode;
  right: ReactNode;
};

export function RadarCockpitShell({ center, left, right }: RadarCockpitShellProps) {
  return (
    <section className="radar-cockpit-shell cockpit-card drawer" data-cockpit-ratio="2:6:2" aria-label="Cockpit Card">
      <nav className="radar-cockpit-shell__tabs tabs tabs-box" role="tablist" aria-label="移动端控制台分区">
        <a className="tab tab-active" href="#radar-ops-panel">运行</a>
        <a className="tab" href="#radar-opportunity-panel">机会</a>
        <a className="tab" href="#radar-review-panel">复盘</a>
      </nav>

      <div className="radar-cockpit-shell__grid grid gap-3 lg:grid-cols-[minmax(220px,2fr)_minmax(0,6fr)_minmax(220px,2fr)]">
        <aside className="studio-stack studio-stack--left cockpit-column cockpit-column--left" id="radar-ops-panel">
          {left}
        </aside>

        <section className="studio-stack studio-stack--center cockpit-column cockpit-column--center" id="radar-opportunity-panel">
          {center}
        </section>

        <aside className="studio-stack studio-stack--right cockpit-column cockpit-column--right" id="radar-review-panel">
          {right}
        </aside>
      </div>
    </section>
  );
}
