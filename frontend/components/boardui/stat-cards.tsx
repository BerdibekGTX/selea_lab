// Adapted from BoardUI's free stat-cards registry item. See README.md.
import type {ReactNode} from "react";

export type Stat = {label:string; value:string; caption:string; icon:ReactNode};

export function StatCards({stats}:{stats:Stat[]}) {
  return <div className="bui-stats" aria-label="Workspace statistics">
    {stats.map(stat=><section className="bui-stat" key={stat.label}>
      <span className="bui-stat-icon" aria-hidden="true">{stat.icon}</span>
      <div><p className="bui-stat-label">{stat.label}</p><p className="bui-stat-value">{stat.value}</p></div>
      <p className="bui-stat-caption">{stat.caption}</p>
    </section>)}
  </div>;
}
