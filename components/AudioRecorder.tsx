'use client'
import { useState, useRef, useEffect } from 'react'
import { Mic, X, Check } from 'lucide-react'

interface Props { onSend: (base64: string) => Promise<void>; onRecordingChange?: (r: boolean) => void; disabled?: boolean }

function fmtSecs(s: number) { return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}` }

export default function AudioRecorder({ onSend, onRecordingChange, disabled }: Props) {
  const [state, setState] = useState<'idle'|'recording'|'sending'>('idle')
  const [elapsed, setElapsed] = useState(0)
  const recorderRef = useRef<MediaRecorder|null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval>|null>(null)
  const streamRef = useRef<MediaStream|null>(null)

  useEffect(() => () => { timerRef.current && clearInterval(timerRef.current); streamRef.current?.getTracks().forEach(t=>t.stop()) }, [])

  async function startRec() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
      const rec = new MediaRecorder(stream, { mimeType: mime })
      recorderRef.current = rec; chunksRef.current = []
      rec.ondataavailable = e => { if (e.data.size>0) chunksRef.current.push(e.data) }
      rec.start(100); setState('recording'); onRecordingChange?.(true)
      setElapsed(0); timerRef.current = setInterval(() => setElapsed(p=>p+1), 1000)
    } catch { alert('Permita acesso ao microfone') }
  }

  function cancel() {
    timerRef.current && clearInterval(timerRef.current)
    recorderRef.current?.state !== 'inactive' && recorderRef.current?.stop()
    streamRef.current?.getTracks().forEach(t=>t.stop())
    chunksRef.current=[]; setState('idle'); setElapsed(0); onRecordingChange?.(false)
  }

  async function confirm() {
    timerRef.current && clearInterval(timerRef.current)
    setState('sending')
    const rec = recorderRef.current!
    await new Promise<void>(res => { rec.onstop=()=>res(); rec.state!=='inactive'?rec.stop():res() })
    streamRef.current?.getTracks().forEach(t=>t.stop())
    const blob = new Blob(chunksRef.current, { type: rec.mimeType||'audio/webm' })
    const b64: string = await new Promise((res,rej) => { const r=new FileReader(); r.onloadend=()=>res((r.result as string).split(',')[1]); r.onerror=rej; r.readAsDataURL(blob) })
    try { await onSend(b64) } catch { alert('Erro ao enviar áudio') }
    chunksRef.current=[]; setState('idle'); setElapsed(0); onRecordingChange?.(false)
  }

  if (state==='idle') return (
    <button type="button" onClick={startRec} disabled={disabled}
      className="w-10 h-10 flex items-center justify-center rounded-xl text-gray-400 hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-40" title="Gravar áudio">
      <Mic size={18}/>
    </button>
  )

  return (
    <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
      <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"/>
      <span className="text-sm font-mono text-red-600 min-w-[40px]">{fmtSecs(elapsed)}</span>
      <button type="button" onClick={cancel} disabled={state==='sending'}
        className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-200 text-gray-600 hover:bg-gray-300 disabled:opacity-50">
        <X size={12}/>
      </button>
      <button type="button" onClick={confirm} disabled={state==='sending'||elapsed===0}
        className="w-7 h-7 flex items-center justify-center rounded-full bg-green-500 text-white hover:bg-green-600 disabled:opacity-50">
        {state==='sending' ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"/> : <Check size={12}/>}
      </button>
    </div>
  )
}
