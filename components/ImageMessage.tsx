'use client'
import { useState } from 'react'
import { X } from 'lucide-react'
import { useMediaMessage } from '@/lib/hooks'

interface Props { messageId?: string; telefone: string; fromMe?: boolean; localDataUrl?: string }

export default function ImageMessage({ messageId, telefone, fromMe = false, localDataUrl }: Props) {
  const { src: fetched, loading, error } = useMediaMessage(localDataUrl ? undefined : messageId, telefone, fromMe)
  const [lightbox, setLightbox] = useState(false)
  const src = localDataUrl ?? fetched

  if (!messageId && !localDataUrl) return <div className="flex items-center gap-1.5 text-sm opacity-60 py-1">🖼️ <span>Imagem não disponível</span></div>
  if (error) return <div className="flex items-center gap-1.5 text-sm opacity-60 py-1">🖼️ <span>Imagem expirada</span></div>
  if (loading || !src) return <div className="w-40 h-28 bg-black/10 rounded-lg animate-pulse" />

  return (
    <>
      <img src={src} alt="Imagem" onClick={() => setLightbox(true)}
        className="rounded-lg max-w-[200px] max-h-[200px] object-cover cursor-pointer hover:opacity-90 transition-opacity" />
      {lightbox && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center z-[200]" onClick={() => setLightbox(false)}>
          <button className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white" onClick={() => setLightbox(false)}><X size={20} /></button>
          <img src={src} alt="Imagem" className="max-w-[90vw] max-h-[90vh] rounded-xl object-contain" onClick={e => e.stopPropagation()} />
        </div>
      )}
    </>
  )
}
