"use client"

import { useRef, useState, type RefObject } from "react"
import { Maximize, Pause, Play, Volume2, VolumeX } from "lucide-react"
import type { VideoOutput } from "@/lib/video-api"

function timeLabel(seconds: number) {
  const rounded = Math.floor(seconds)
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`
}

export function ArenaVideoCard({
  label, output, videoRef, muted, onMute, onMediaError,
}: {
  label: "A" | "B"
  output: VideoOutput
  videoRef: RefObject<HTMLVideoElement | null>
  muted: boolean
  onMute: (muted: boolean) => void
  onMediaError: () => void
}) {
  const player = useRef<HTMLDivElement>(null)
  const [duration, setDuration] = useState(0)
  const [position, setPosition] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [notice, setNotice] = useState("")

  async function togglePlayback() {
    const video = videoRef.current
    if (!video) return
    setNotice("")
    try {
      if (video.paused || video.ended) await video.play()
      else video.pause()
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setNotice("Could not start playback. Try again.")
      }
    }
  }

  async function toggleFullscreen() {
    const video = videoRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null
    setNotice("")
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else if (document.fullscreenEnabled && player.current) await player.current.requestFullscreen()
      else if (video?.webkitEnterFullscreen) video.webkitEnterFullscreen()
      else setNotice("Fullscreen is unavailable in this browser.")
    } catch {
      setNotice("Fullscreen is unavailable in this browser.")
    }
  }

  return (
    <article className="video-card">
      <h2>Output {label}</h2>
      <div className="arena-player" ref={player}>
        <video ref={videoRef} muted={muted} playsInline preload="metadata"
          poster={output.thumbnail || undefined} src={output.video}
          onDurationChange={event => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)}
          onTimeUpdate={event => setPosition(event.currentTarget.currentTime)}
          onCanPlay={() => setLoading(false)} onWaiting={() => setLoading(true)}
          onPlay={() => setPlaying(true)} onPlaying={() => setLoading(false)}
          onPause={() => { setPlaying(false); setLoading(false) }}
          onEnded={() => setPlaying(false)}
          onError={() => { setFailed(true); setLoading(false); setPlaying(false); onMediaError() }}
          aria-label={`Anonymous output ${label}`} />
        <div className="arena-player-controls" role="group" aria-label={`Output ${label} controls`}>
          <button type="button" aria-label={`${playing ? "Pause" : "Play"} output ${label}`}
            disabled={failed} onClick={togglePlayback}>{playing ? <Pause size={16}/> : <Play size={16}/>}</button>
          <input type="range" aria-label={`Seek output ${label}`}
            aria-valuetext={`${timeLabel(position)} of ${timeLabel(duration)}`}
            min={0} max={duration || 1} step={0.1} value={Math.min(position, duration)}
            disabled={failed || !duration} onChange={event => {
              const time = event.target.valueAsNumber
              if (videoRef.current) videoRef.current.currentTime = time
              setPosition(time)
            }} />
          <span className="arena-player-time" aria-hidden="true">{timeLabel(position)} / {timeLabel(duration)}</span>
          <button type="button" aria-label={`${muted ? "Unmute" : "Mute"} output ${label}`}
            disabled={failed || !output.audio} onClick={() => onMute(!muted)}>{muted || !output.audio ? <VolumeX size={16}/> : <Volume2 size={16}/>}</button>
          <button type="button" aria-label={`Fullscreen output ${label}`}
            disabled={failed || !duration} onClick={toggleFullscreen}><Maximize size={16}/></button>
        </div>
        {notice && <p className="arena-player-notice" role="status">{notice}</p>}
      </div>
      <p className="muted" role="status">
        {failed ? "This video could not be loaded." : loading ? (playing ? "Buffering video…" : "Loading video…") : playing ? "Playing" : "Ready to play"}
      </p>
    </article>
  )
}
