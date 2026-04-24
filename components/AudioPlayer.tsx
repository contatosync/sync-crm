'use client'
import { useState, useRef, useEffect } from 'react'
import { Play, Pause } from 'lucide-react'
import { useMediaMessage } from '@/lib/hooks'

interface Props { messageId?: string; telefone: string; fromMe?: boolean; isOwn: boolean }

function fmtTime(s: number) {
  if (!isFinite(s) || s < 0) return '0:00'
  return `${Math.floor(s/60).toString().padStart(2,'0')}:${Math.floor(s%60).toString().padStart(2,'0')}`
}

function toBlobUrl(b64: string): string {
  try {
    let mime = 'audio/ogg', raw = b64
    if (b64.startsWith('data:')) { const i = b64.indexOf(';base64,'); mime = b64.slice(5,i); raw = b64.slice(i+8) }
    const bytes = Uint8Array.from(atob(raw), c => c.charCodeAt(0))
    return URL.createObjectURL(new Blob([bytes], { type: mime }))
  } catch { return b64.startsWith('data:') ? b64 : `data:audio/ogg;base64,${b64}` }
}

export default function AudioPlayer({ messageId, telefone, fromMe = false, isOwn }: Props) {
  const { src: b64, loading, error } = useMediaMessage(messageId, telefone, fromMe)
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  const audioRef = useRef<HTMLAudioElement>(null)
  const blobRef = useRef<string | null>(null)

  useEffect(() => {
    if (b64 && !blobUrl) {
      const url = toBlobUrl(b64)
      blobRef.current = url
      setBlobUrl(url)
    }
    return () => { if (blobRef.current) URL.revokeObjectURL(blobRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b64])

  if (!messageId) return <div className="flex items-center gap-1.5 text-sm opacity-60 py-0.5">🎵 <span>Áudio não indexado</span></div>
  if (error) return <div className="flex items-center gap-1.5 text-sm opacity-60 py-0.5">🎵 <span>Indisponível</span></div>

  const progress = duration > 0 ? current / duration : 0
  const btnCls = isOwn ? 'bg-white/20 hover:bg-white/30 text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
  const trackCls = isOwn ? 'bg-white/20' : 'bg-gray-200'
  const fillCls = isOwn ? 'bg-white/80' : 'bg-primary'
  const timeCls = isOwn ? 'text-white/70' : 'text-gray-400'

  return (
    <div className="flex items-center gap-2.5 w-56">
      {blobUrl && (
        <audio ref={audioRef} src={blobUrl} preload="auto"
          onTimeUpdate={() => setCurrent(audioRef.current?.currentTime ?? 0)}
          onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)}
          onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
          onEnded={() => { setPlaying(false); setCurrent(0); if (audioRef.current) audioRef.current.currentTime = 0 }}
        />
      )}
      <button onClick={() => blobUrl ? (playing ? audioRef.current?.pause() : audioRef.current?.play()) : null}
        className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${btnCls}`}
      >
        {loading ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          : playing ? <Pause size={14} /> : <Play size={14} className="translate-x-0.5" />}
      </button>
      <div className="flex-1 flex flex-col gap-1">
        <div className={`relative h-1.5 rounded-full cursor-pointer ${trackCls}`}
          onClick={e => { const a = audioRef.current; if (!a?.duration) return; const r = e.currentTarget.getBoundingClientRect(); a.currentTime = ((e.clientX - r.left) / r.width) * a.duration }}>
          <div className={`absolute left-0 top-0 h-full rounded-full ${fillCls}`} style={{ width: `${progress*100}%` }} />
        </div>
        <div className="flex justify-between">
          <span className={`text-[10px] tabular-nums ${timeCls}`}>{fmtTime(current)}</span>
          <span className={`text-[10px] tabular-nums ${timeCls}`}>{blobUrl ? fmtTime(duration) : '—'}</span>
        </div>
      </div>
    </div>
  )
}
