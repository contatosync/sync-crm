'use client'
import { useState, useRef, useEffect } from 'react'
import { Play, Pause } from 'lucide-react'
import { getAudioBase64 } from '@/lib/evolution'

interface Props {
  /** ID da mensagem para buscar áudio via Evolution API */
  messageId?: string
  /** URL direta (data URL ou blob URL) — ephemeral, não persiste */
  src?: string
  /** true = mensagem própria (verde), false = recebida (cinza) */
  isOwn: boolean
  /** true = fundo escuro (inbox assistant bg-whatsapp) */
  darkBg?: boolean
}

function fmtTime(s: number): string {
  if (!isFinite(s) || isNaN(s) || s < 0) return '0:00'
  const m = Math.floor(s / 60).toString().padStart(2, '0')
  const sec = Math.floor(s % 60).toString().padStart(2, '0')
  return `${m}:${sec}`
}

export default function AudioPlayer({ messageId, src: initialSrc, isOwn, darkBg = false }: Props) {
  const [audioSrc, setAudioSrc] = useState<string | null>(initialSrc ?? null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const audioRef = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    if (!initialSrc && messageId) fetchAudio()
  }, [messageId, initialSrc])

  async function fetchAudio() {
    setLoading(true)
    const result = await getAudioBase64(messageId!)
    if (result) {
      // result pode ser data URL completo ou base64 puro
      setAudioSrc(result.startsWith('data:') ? result : `data:audio/ogg;base64,${result}`)
    } else {
      setLoadError(true)
    }
    setLoading(false)
  }

  function togglePlay() {
    const a = audioRef.current
    if (!a) return
    playing ? a.pause() : a.play()
  }

  function handleSeek(e: React.MouseEvent<HTMLDivElement>) {
    const a = audioRef.current
    if (!a || !a.duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    a.currentTime = ((e.clientX - rect.left) / rect.width) * a.duration
  }

  // Paleta de cores baseada no contexto da bolha
  const s = darkBg
    ? { btn: 'bg-white/25 hover:bg-white/40 text-white', track: 'bg-white/20', fill: 'bg-white/80', time: 'text-white/70' }
    : isOwn
    ? { btn: 'bg-green-600 hover:bg-green-700 text-white', track: 'bg-green-900/20', fill: 'bg-green-700', time: 'text-gray-500' }
    : { btn: 'bg-gray-500 hover:bg-gray-600 text-white', track: 'bg-gray-200', fill: 'bg-gray-500', time: 'text-gray-400' }

  // Sem fonte: fallback estático
  if (!messageId && !initialSrc) {
    return (
      <div className="flex items-center gap-2 py-0.5 text-sm opacity-80">
        <span>🎵</span><span>Áudio</span>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center gap-3 w-[220px] py-1">
        <div className={`w-9 h-9 flex-shrink-0 rounded-full flex items-center justify-center ${s.btn}`}>
          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin opacity-70" />
        </div>
        <span className="text-xs opacity-60 italic">Carregando…</span>
      </div>
    )
  }

  if (loadError || !audioSrc) {
    return (
      <div className="flex items-center gap-2 py-0.5 text-sm opacity-70">
        <span>🎵</span><span>Áudio</span>
      </div>
    )
  }

  const progress = duration > 0 ? currentTime / duration : 0

  return (
    <div className="flex items-center gap-2.5 w-[220px]">
      <audio
        ref={audioRef}
        src={audioSrc}
        preload="metadata"
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false)
          setCurrentTime(0)
          if (audioRef.current) audioRef.current.currentTime = 0
        }}
      />

      {/* Botão play/pause */}
      <button
        onClick={togglePlay}
        className={`w-9 h-9 flex-shrink-0 rounded-full flex items-center justify-center transition-colors ${s.btn}`}
      >
        {playing
          ? <Pause size={15} />
          : <Play size={15} className="translate-x-0.5" />}
      </button>

      {/* Barra de progresso + tempos */}
      <div className="flex-1 flex flex-col gap-1 min-w-0">
        <div
          className={`relative h-1.5 rounded-full cursor-pointer ${s.track}`}
          onClick={handleSeek}
        >
          <div
            className={`absolute left-0 top-0 h-full rounded-full ${s.fill}`}
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <div className="flex justify-between">
          <span className={`text-[10px] tabular-nums ${s.time}`}>{fmtTime(currentTime)}</span>
          <span className={`text-[10px] tabular-nums ${s.time}`}>{fmtTime(duration)}</span>
        </div>
      </div>
    </div>
  )
}
