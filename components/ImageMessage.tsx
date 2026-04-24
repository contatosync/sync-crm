'use client'
import { useState, useEffect } from 'react'
import { X, Image as ImageIcon } from 'lucide-react'
import { getMediaBase64 } from '@/lib/evolution'

interface Props {
  messageId?: string
  telefone?: string
  /** Data URL local para imagens recém-enviadas (optimistic update) */
  localDataUrl?: string
}

export default function ImageMessage({ messageId, telefone, localDataUrl }: Props) {
  const [src, setSrc] = useState<string | null>(localDataUrl ?? null)
  const [loading, setLoading] = useState(!localDataUrl && !!messageId)
  const [error, setError] = useState(false)
  const [lightbox, setLightbox] = useState(false)

  useEffect(() => {
    if (localDataUrl || !messageId) {
      if (!localDataUrl && !messageId) setError(true)
      return
    }
    setLoading(true)
    getMediaBase64(messageId, telefone).then(data => {
      if (data) setSrc(data)
      else setError(true)
      setLoading(false)
    })
  }, [messageId, telefone, localDataUrl])

  if (error || (!messageId && !localDataUrl)) {
    return (
      <div className="flex items-center gap-1.5 text-sm opacity-60 py-1">
        <ImageIcon size={16} />
        <span>Imagem não disponível</span>
      </div>
    )
  }

  if (loading) {
    return <div className="w-40 h-28 bg-black/10 rounded-lg animate-pulse" />
  }

  return (
    <>
      <img
        src={src!}
        alt="Imagem"
        className="rounded-lg max-w-[200px] max-h-[200px] object-cover cursor-pointer hover:opacity-90 transition-opacity"
        onClick={() => setLightbox(true)}
      />

      {lightbox && (
        <div
          className="fixed inset-0 bg-black/85 flex items-center justify-center z-[200]"
          onClick={() => setLightbox(false)}
        >
          <button
            type="button"
            className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center bg-white/20 rounded-full text-white hover:bg-white/30 transition-colors"
            onClick={() => setLightbox(false)}
          >
            <X size={20} />
          </button>
          <img
            src={src!}
            alt="Imagem"
            className="max-w-[90vw] max-h-[90vh] rounded-xl object-contain shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </>
  )
}
