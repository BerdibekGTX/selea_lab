"use client"

import { useEffect, useState } from "react"
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react"
import { VideoShell } from "@/components/video-shell"
import { SegmentedControl } from "@/components/workspace-controls"
import { VIDEO_CATEGORIES, videoApi, type Category } from "@/lib/video-api"

type Ranking = {
  id: string; name: string; provider: string; version: string
  wins: number; losses: number; ties: number; both_bad: number
  eligible_comparisons: number; challenge_coverage: number
  score: number | null; preliminary: boolean
}
type SortColumn = "score" | "votes"
type Sort = { column: SortColumn; direction: "ascending" | "descending" }

const votes = (row: Ranking) => row.wins + row.losses + row.ties + row.both_bad

export default function VideoLeaderboard({ initialCategory = "text-to-video" }: { initialCategory?: Category }) {
  const [category, setCategory] = useState<Category>(initialCategory)
  const [source, setSource] = useState("public")
  const [rows, setRows] = useState<Ranking[]>([])
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState("")
  const [sort, setSort] = useState<Sort>({ column: "score", direction: "descending" })

  useEffect(() => setCategory(initialCategory), [initialCategory])
  useEffect(() => {
    let active = true
    setBusy(true)
    setError("")
    videoApi<{ rankings: Ranking[] }>(`/leaderboard?category=${category}&source=${source}`)
      .then(result => { if (active) setRows(result.rankings) })
      .catch(error => { if (active) setError(error.message) })
      .finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [category, source])

  const ordered = [...rows].sort((a, b) => {
    if (sort.column === "score" && (a.score === null) !== (b.score === null)) return a.score === null ? 1 : -1
    const difference = sort.column === "score" ? (a.score ?? 0) - (b.score ?? 0) : votes(a) - votes(b)
    return difference * (sort.direction === "ascending" ? 1 : -1) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id)
  })

  function sortBy(column: SortColumn) {
    setSort(previous => ({
      column,
      direction: previous.column === column && previous.direction === "descending" ? "ascending" : "descending",
    }))
  }

  return (
    <VideoShell title="Leaderboard">
      <div className="video-hero">
        <div>
          <p className="eyebrow">Video comparisons</p>
          <h1>Video model rankings</h1>
          <p>Preference scores reflect only the challenges and opponents evaluated here.</p>
        </div>
      </div>
      <div className="video-tabs">
        <SegmentedControl label="Video category" options={VIDEO_CATEGORIES} value={category} onChange={setCategory} />
        <select aria-label="Evaluation source" value={source} onChange={event => setSource(event.target.value)}>
          <option value="public">Public votes</option>
          <option value="team">Selea team evaluations</option>
        </select>
      </div>
      {busy ? <p role="status">Loading rankings…</p>
        : error ? <p role="alert" className="video-error">{error}</p>
        : ordered.length ? (
          <div className="video-table-wrap" tabIndex={0} role="region" aria-label="Video model rankings table">
            <table className="video-table">
              <thead>
                <tr>
                  <th scope="col">Model</th>
                  {(["score", "votes"] as const).map(column => {
                    const direction = sort.column === column ? sort.direction : undefined
                    const Icon = direction === "ascending" ? ArrowUp : direction === "descending" ? ArrowDown : ArrowUpDown
                    return <th scope="col" aria-sort={direction} key={column}>
                      <button className="video-sort-button" type="button" onClick={() => sortBy(column)}>
                        {column === "score" ? "Score" : "Votes"}<Icon size={13} aria-hidden="true"/>
                      </button>
                    </th>
                  })}
                  {["Wins", "Losses", "Ties", "Both bad", "Eligible pairs", "Challenges"].map(label => <th scope="col" key={label}>{label}</th>)}
                </tr>
              </thead>
              <tbody>
                {ordered.map(row => <tr key={row.id}>
                  <th scope="row">{row.name}<small>{row.provider} · {row.version}</small></th>
                  <td>{row.score === null ? "Unrated" : `${(row.score * 100).toFixed(1)}%${row.preliminary ? " · Preliminary" : ""}`}</td>
                  <td>{votes(row)}</td><td>{row.wins}</td><td>{row.losses}</td><td>{row.ties}</td><td>{row.both_bad}</td>
                  <td>{row.eligible_comparisons}</td><td>{row.challenge_coverage}</td>
                </tr>)}
              </tbody>
            </table>
          </div>
        ) : <div className="video-panel">No active models yet.</div>}
      <p className="muted">Preference score = (wins + 0.5 × ties) / (wins + losses + ties). Votes include both-bad outcomes. Skips are excluded. Fewer than 20 scored outcomes are preliminary.</p>
    </VideoShell>
  )
}
