'use client'
import { useState, useRef, useEffect } from 'react'
import { Play, Pause } from 'lucide-react'
import { getAudioBase64 } from '@/lib/evolution'

interface Props {
  /** ID da mensagem WhatsApp (campo messageId ou message_id no historico) */
  messageId?: string
  /** Telefone do contato — usado para construir o remoteJid na Evolution API */
  telefone?: string
  /** true = mensagem enviada por nós (verde), false = recebida (cinza) */
  isOwn: boolean
  /** true = bolha com fundo escuro (inbox assistant, bg-whatsapp) */
  darkBg?: boolean
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtTime(s: number): string {
  if (!isFinite(s) || isNaN(s) || s < 0) return '0:00'
  return `${Math.floor(s / 60).toString().padStart(2, '0')}:${Math.floor(s % 60).toString().padStart(2, '0')}`
}

/**
 * Converte base64 (com ou sem prefixo data:) em um Blob URL.
 * Usar Blob URL em vez de data: URL melhora a compatibilidade entre browsers,
 * especialmente para audio/ogg no Safari.
 */
function base64ToBlobUrl(b64: string): string {
  let mimeType = 'audio/ogg'
  let raw = b64

  if (b64.startsWith('data:')) {
    const semi = b64.indexOf(';base64,')
    if (semi !== -1) {
      mimeType = b64.slice(5, semi)
      raw = b64.slice(semi + 8)
    }
  }

  try {
    const binary = atob(raw)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    const blob = new Blob([bytes], { type: mimeType })
    return URL.createObjectURL(blob)
  } catch {
    // Fallback: usar como data URL se atob falhar
    return b64.startsWith('data:') ? b64 : `data:${mimeType};base64,${b64}`
  }
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function AudioPlayer({ messageId, telefone, isOwn, darkBg = false }: Props) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [fetchState, setFetchState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const audioRef = useRef<HTMLAudioElement>(null)
  const pendingPlay = useRef(false)
  const blobUrlRef = useRef<string | null>(null)

  // Revoga Blob URL ao desmontar para liberar memória
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
    }
  }, [])

  async function loadAndPlay() {
    if (!messageId) return
    if (fetchState === 'loading') return

    // Se já temos o blob, só toca
    if (blobUrl && audioRef.current) {
      playing ? audioRef.current.pause() : audioRef.current.play()
      return
    }

    setFetchState('loading')
    pendingPlay.current = true

    const result = await getAudioBase64(messageId, telefone)
    if (!result) {
      setFetchState('error')
      pendingPlay.current = false
      return
    }

    const url = base64ToBlobUrl(result)
    blobUrlRef.current = url
    setBlobUrl(url)       // dispara re-render; <audio src={url}> vai carregar
    setFetchState('idle')
    // playback será iniciado no onCanPlay quando src estiver pronto
  }

  function handleCanPlay() {
    if (pendingPlay.current && audioRef.current) {
      audioRef.current.play().catch(() => {})
      pendingPlay.current = false
    }
  }

  function handlePlayPause() {
    if (!blobUrl) {
      loadAndPlay()
      return
    }
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

  // Paleta de cores por contexto
  const s = darkBg
    ? { btn: 'bg-white/25 hover:bg-white/40 text-white', track: 'bg-white/20', fill: 'bg-white/80', time: 'text-white/70' }
    : isOwn
    ? { btn: 'bg-green-600 hover:bg-green-700 text-white', track: 'bg-green-900/20', fill: 'bg-green-700', time: 'text-gray-500' }
    : { btn: 'bg-gray-500 hover:bg-gray-600 text-white',   track: 'bg-gray-200',      fill: 'bg-gray-500', time: 'text-gray-400' }

  // Sem messageId: não há como buscar o áudio
  if (!messageId) {
    return (
      <div className="flex items-center gap-2 py-0.5 text-sm opacity-70">
        <span>🎵</span><span>Áudio (não disponível)</span>
      </div>
    )
  }

  // Erro ao buscar
  if (fetchState === 'error') {
    return (
      <div className="flex items-center gap-2 py-0.5 text-sm opacity-70">
        <span>🎵</span><span>Áudio indisponível</span>
      </div>
    )
  }

  const progress = duration > 0 ? currentTime / duration : 0
  const isLoading = fetchState === 'loading'

  return (
    <div className="flex items-center gap-2.5 w-[220px]">
      {/* Elemento audio oculto — gerenciado via ref */}
      {blobUrl && (
        <audio
          ref={audioRef}
          src={blobUrl}
          preload="auto"
          onCanPlay={handleCanPlay}
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
      )}

      {/* Botão play/pause */}
      <button
        onClick={handlePlayPause}
        className={`w-9 h-9 flex-shrink-0 rounded-full flex items-center justify-center transition-colors ${s.btn}`}
        title={isLoading ? 'Carregando…' : playing ? 'Pausar' : 'Reproduzir'}
      >
        {isLoading
          ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin opacity-70" />
          : playing
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
            className={`absolute left-0 top-0 h-full rounded-full transition-all ${s.fill}`}
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <div className="flex justify-between">
          <span className={`text-[10px] tabular-nums ${s.time}`}>{fmtTime(currentTime)}</span>
          <span className={`text-[10px] tabular-nums ${s.time}`}>{blobUrl ? fmtTime(duration) : '—'}</span>
        </div>
      </div>
    </div>
  )
}
