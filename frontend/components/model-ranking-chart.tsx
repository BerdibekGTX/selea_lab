"use client"

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"

const config = { winRate: { label: "Win rate", color: "#9c9caa" } }

export function ModelRankingChart({ rows }: {
  rows: { id: string; model: string; winRate: number; votes: number }[]
}) {
  const percent = (value: number) => `${value.toFixed(1)}%`
  const labels = new Map(rows.map(row => {
    const name = row.model.length > 13 ? row.model.slice(0, 12) + "…" : row.model
    return [row.id, `${name} · ${percent(row.winRate)}`]
  }))

  return (
    <figure aria-label="Win rate of the top 10 models">
      <ol className="sr-only">
        {rows.map(row => <li key={row.id}>{row.model}, {percent(row.winRate)}, {row.votes} {row.votes === 1 ? "vote" : "votes"}</li>)}
      </ol>
      <ChartContainer config={config} className="aspect-auto w-full" style={{ height: rows.length * 34 + 38 }}>
        <BarChart layout="vertical" data={rows} margin={{ top: 4, right: 17, bottom: 4, left: 0 }}>
          <CartesianGrid horizontal={false} stroke="var(--border)" />
          <XAxis type="number" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]}
            tickFormatter={value => `${value}%`} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="id" width={134} tickLine={false} axisLine={false}
            tickFormatter={(id: string) => labels.get(id) ?? id} />
          <ChartTooltip content={<ChartTooltipContent hideLabel formatter={(value, _, item) => (
            <span>{item.payload?.model} · {percent(Number(value))} · {item.payload?.votes} {item.payload?.votes === 1 ? "vote" : "votes"}</span>
          )} />} />
          <Bar dataKey="winRate" fill="var(--color-winRate)" radius={4} maxBarSize={20} isAnimationActive={false} />
        </BarChart>
      </ChartContainer>
    </figure>
  )
}
