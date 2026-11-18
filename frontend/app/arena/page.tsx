"use client"

import { Suspense, useCallback, useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { VideoOff } from "lucide-react"
import { ArenaVideoCard } from "@/components/arena-video-card"
import { VideoShell } from "@/components/video-shell"
import { EmptyState, SegmentedControl, SuccessCheck } from "@/components/workspace-controls"
import { VIDEO_CATEGORIES, videoApi, type ArenaPair, type Category, type VideoOutput } from "@/lib/video-api"

const voteOptions = [["a", "A is better"], ["b", "B is better"], ["tie", "Tie"], ["both-bad", "Both are bad"], ["skip", "Skip"]]
const sides = ["a", "b"] as const
const mutedPair = { a: true, b: true }

function ArenaPage() {
  const router = useRouter()
  const query = useSearchParams()
  const category: Category = query.get("category") === "image-to-video" ? "image-to-video" : "text-to-video"
  const challengeId = query.get("challenge_id")
  const specificPair = query.get("pair_id")
  const [pair, setPair] = useState<ArenaPair | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [revealed, setRevealed] = useState<{ a: VideoOutput; b: VideoOutput } | null>(null)
  const [mediaError, setMediaError] = useState({ a: false, b: false })
  const [muted, setMuted] = useState(mutedPair)
  const [startingPlayback, setStartingPlayback] = useState(false)
  const aRef = useRef<HTMLVideoElement>(null)
  const bRef = useRef<HTMLVideoElement>(null)
  const loadVersion = useRef(0)

  const load = useCallback(async (next = false) => {
    const version = ++loadVersion.current
    setLoading(true)
    setPair(null)
    setStartingPlayback(false)
    setError("")
    setRevealed(null)
    setMediaError({ a: false, b: false })
    try {
      await videoApi("/session")
      const params = new URLSearchParams({ category })
      if (challengeId) params.set("challenge_id", challengeId)
      if (specificPair && !next) params.set("pair_id", specificPair)
      const result = await videoApi<ArenaPair>(`/arena/next?${params}`)
      if (version === loadVersion.current) setPair(result)
    } catch (error) {
      if (version === loadVersion.current) setError((error as Error).message)
    } finally {
      if (version === loadVersion.current) setLoading(false)
    }
  }, [category, challengeId, specificPair])

  useEffect(() => {
    void load()
    return () => { loadVersion.current++ }
  }, [load])

  function changeCategory(next: Category) {
    if (next !== category) router.push(`/arena?category=${next}`, { scroll: false })
  }

  async function playBoth(replay: boolean) {
    const a = aRef.current
    const b = bRef.current
    if (!a || !b || startingPlayback) return
    const version = loadVersion.current
    setStartingPlayback(true)
    setError("")
    let timeout: ReturnType<typeof setTimeout> | undefined
    try {
      if (replay) { a.currentTime = 0; b.currentTime = 0 }
      await Promise.race([
        Promise.all([a.play(), b.play()]),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error("Video loading timed out. Please retry.")), 20000)
        }),
      ])
    } catch (error) {
      if (version === loadVersion.current) {
        a.pause()
        b.pause()
        setError(error instanceof DOMException ? "Could not play both videos. Try again or skip this comparison." : (error as Error).message)
      }
    } finally {
      clearTimeout(timeout)
      if (version === loadVersion.current) setStartingPlayback(false)
    }
  }

  async function vote(choice: string) {
    if (!pair || pair.empty || busy || revealed) return
    const version = loadVersion.current
    setBusy(true)
    setError("")
    try {
      const result = await videoApi<{ a: VideoOutput; b: VideoOutput }>("/votes", { session_id: pair.session_id, choice })
      if (version === loadVersion.current) setRevealed(result)
    } catch (error) {
      if (version === loadVersion.current) setError((error as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const anyAudible = Boolean((pair?.a?.audio && !muted.a) || (pair?.b?.audio && !muted.b))
  const playbackDisabled = startingPlayback || mediaError.a || mediaError.b

  return (
    <VideoShell title="Video comparison">
      <div className="video-hero">
        <div>
          <p className="eyebrow">Anonymous comparison</p>
          <h1>Choose the stronger video</h1>
          <p>Watch both outputs, then vote. Model identities appear only after your vote is saved.</p>
        </div>
        <Link href="/methodology">How it works</Link>
      </div>
      <div className="video-tabs">
        <SegmentedControl label="Video category" options={VIDEO_CATEGORIES} value={category} onChange={changeCategory} disabled={busy} />
      </div>
      {loading ? <p role="status">Loading comparison…</p>
        : pair?.empty ? (
          <EmptyState icon={<VideoOff/>} title="No comparisons available"
            description={pair.reason ?? "There is no eligible pair for this category right now."}>
            <Link className="video-link-button" href="/methodology">Read the methodology</Link>
            <Link className="video-link-button" href="/challenges">Explore challenges</Link>
          </EmptyState>
        ) : pair && <>
          <div className="video-panel">
            <p className="eyebrow">{pair.challenge.title}</p>
            <h2>Challenge prompt</h2><p>{pair.challenge.prompt}</p>
            <h3>Evaluation criterion</h3><p>{pair.challenge.criterion}</p>
            {pair.challenge.source_image && <img className="source-image" src={pair.challenge.source_image} alt="Original source for image-to-video challenge"/>}
            <Link href={`/challenges/${pair.challenge.id}`}>View challenge</Link>
          </div>
          <div className="video-grid">
            {sides.map(side => (
              <ArenaVideoCard key={`${pair.session_id}-${side}`} label={side === "a" ? "A" : "B"}
                output={pair[side]} videoRef={side === "a" ? aRef : bRef} muted={muted[side]}
                onMute={value => setMuted(previous => ({ ...previous, [side]: value }))}
                onMediaError={() => setMediaError(previous => ({ ...previous, [side]: true }))} />
            ))}
          </div>
          <div className="video-actions">
            <button onClick={() => playBoth(false)} disabled={playbackDisabled}>{startingPlayback ? "Preparing videos…" : "Play both"}</button>
            <button onClick={() => playBoth(true)} disabled={playbackDisabled}>Replay both</button>
            <button disabled={!pair.a.audio && !pair.b.audio}
              onClick={() => setMuted({ a: anyAudible || !pair.a.audio, b: anyAudible || !pair.b.audio })}>
              {anyAudible ? "Mute both" : "Unmute both"}
            </button>
          </div>
          {revealed ? (
            <div className="video-panel">
              <h2 role="status"><SuccessCheck>Vote saved · Models revealed</SuccessCheck></h2>
              <div className="video-grid">
                {sides.map(side => (
                  <div key={side}>
                    <h3>{side.toUpperCase()}: {revealed[side].model} · {revealed[side].provider}</h3>
                    <p>Version {revealed[side].version} · Generated on {revealed[side].platform}</p>
                    <pre>{JSON.stringify(revealed[side].settings, null, 2)}</pre>
                  </div>
                ))}
              </div>
              <button onClick={() => load(true)}>Next comparison</button>
            </div>
          ) : (
            <div className="video-panel">
              <h2>Your vote</h2>
              <div className="video-actions">
                {voteOptions.map(([choice, label]) => (
                  <button key={choice} disabled={busy || (choice !== "skip" && (mediaError.a || mediaError.b))}
                    onClick={() => vote(choice)}>{label}</button>
                ))}
              </div>
            </div>
          )}
        </>}
      {error && <div className="video-status video-error" role="alert">{error} {!pair && <button onClick={() => load()}>Retry</button>}</div>}
    </VideoShell>
  )
}

export default function Page() {
  return <Suspense fallback={<VideoShell title="Video comparison"><p>Loading Arena…</p></VideoShell>}><ArenaPage/></Suspense>
}
