// Adapted from BoardUI's free stat-cards registry item. See README.md.
import type { ReactNode } from "react"

export type Stat = { label: string; value: string; caption: string; icon: ReactNode }

export function StatCards({ stats }: { stats: Stat[] }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Workspace statistics">
      {stats.map(stat => (
        <div className="min-w-0 rounded-xl border bg-card px-4 py-3.5" key={stat.label}>
          <dt className="flex items-center gap-2 text-sm text-muted-foreground">
            <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-lg border bg-muted [&_svg]:size-4">{stat.icon}</span>
            {stat.label}
          </dt>
          <dd className="mt-2 text-2xl font-semibold tabular-nums">{stat.value}</dd>
          <dd className="mt-1 text-xs text-muted-foreground">{stat.caption}</dd>
        </div>
      ))}
    </dl>
  )
}
