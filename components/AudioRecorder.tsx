'use client'
import { useState, useRef, useEffect } from 'react'
import { Mic, X, Check } from 'lucide-react'

interface Props {
  onSend: (base64: string, mimeType: string) => Promise<void>
  /** Notifica o pai sobre mudanças no estado de gravação */
  onRecordingChange?: (recording: boolean) => void
  disabled?: boolean
}

function fmtSecs(s: number): string {
  return `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`
}

export default function AudioRecorder({ onSend, onRecordingChange, disabled }: Props) {
  const [state, setState] = useState<'idle' | 'recording' | 'sending'>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [toast, setToast] = useState('')
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  // Cleanup ao desmontar
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (recorderRef.current?.state !== 'inactive') recorderRef.current?.stop()
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 4500)
  }

  async function startRecording() {
    if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      showToast('Seu browser não suporta gravação de áudio')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const mimeType =
        MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' :
        MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'

      const recorder = new MediaRecorder(stream, { mimeType })
      recorderRef.current = recorder
      chunksRef.current = []
      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.start(100)

      setState('recording')
      onRecordingChange?.(true)
      setElapsed(0)
      timerRef.current = setInterval(() => setElapsed(p => p + 1), 1000)
    } catch {
      showToast('Permita o acesso ao microfone nas configurações do browser')
    }
  }

  function cancelRecording() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    if (recorderRef.current?.state !== 'inactive') recorderRef.current?.stop()
    streamRef.current?.getTracks().forEach(t => t.stop())
    chunksRef.current = []
    setElapsed(0)
    setState('idle')
    onRecordingChange?.(false)
  }

  async function confirmSend() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    setState('sending')
    const recorder = recorderRef.current
    if (!recorder) { setState('idle'); onRecordingChange?.(false); return }

    // Aguarda o último chunk
    await new Promise<void>(res => {
      recorder.onstop = () => res()
      if (recorder.state !== 'inactive') recorder.stop()
      else res()
    })
    streamRef.current?.getTracks().forEach(t => t.stop())

    const mimeType = recorder.mimeType || 'audio/webm'
    const blob = new Blob(chunksRef.current, { type: mimeType })

    const base64: string = await new Promise((res, rej) => {
      const reader = new FileReader()
      reader.onloadend = () => res((reader.result as string).split(',')[1])
      reader.onerror = rej
      reader.readAsDataURL(blob)
    })

    try {
      await onSend(base64, mimeType)
    } catch {
      showToast('Erro ao enviar áudio')
    }

    chunksRef.current = []
    setElapsed(0)
    setState('idle')
    onRecordingChange?.(false)
  }

  // ── Estado idle: apenas botão de mic ──
  if (state === 'idle') {
    return (
      <div className="relative flex-shrink-0">
        {toast && (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-gray-800 text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap z-10 shadow-lg max-w-[280px] text-center">
            {toast}
          </div>
        )}
        <button
          type="button"
          onClick={startRecording}
          disabled={disabled}
          title="Gravar áudio"
          className="w-10 h-10 flex items-center justify-center rounded-xl text-gray-400 hover:text-accent hover:bg-accent/10 transition-colors disabled:opacity-40"
        >
          <Mic size={18} />
        </button>
      </div>
    )
  }

  // ── Estado gravando / enviando ──
  return (
    <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 flex-shrink-0">
      {/* Dot pulsante */}
      <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" />

      {/* Timer */}
      <span className="text-sm font-mono text-red-600 min-w-[40px] tabular-nums">
        {fmtSecs(elapsed)}
      </span>

      {/* Cancelar */}
      <button
        type="button"
        onClick={cancelRecording}
        disabled={state === 'sending'}
        title="Cancelar"
        className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-200 text-gray-600 hover:bg-gray-300 disabled:opacity-50 transition-colors"
      >
        <X size={13} />
      </button>

      {/* Confirmar */}
      <button
        type="button"
        onClick={confirmSend}
        disabled={state === 'sending' || elapsed === 0}
        title="Enviar áudio"
        className="w-7 h-7 flex items-center justify-center rounded-full bg-green-500 text-white hover:bg-green-600 disabled:opacity-50 transition-colors"
      >
        {state === 'sending'
          ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
          : <Check size={13} />}
      </button>
    </div>
  )
}
