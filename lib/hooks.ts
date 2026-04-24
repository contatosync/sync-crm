'use client'
import { useState, useEffect } from 'react'
import { getMediaBase64 } from './evolution'

// Module-level cache prevents duplicate fetches across component instances
const mediaCache = new Map<string, string>()

export function useMediaMessage(
  messageId: string | undefined,
  telefone: string,
  fromMe = false
): { src: string | null; loading: boolean; error: boolean } {
  const [src, setSrc] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!messageId) { setError(true); return }
    const key = `${messageId}:${telefone}:${fromMe}`
    if (mediaCache.has(key)) { setSrc(mediaCache.get(key)!); return }
    setLoading(true)
    setError(false)
    getMediaBase64(messageId, telefone, fromMe).then(result => {
      if (result) { mediaCache.set(key, result); setSrc(result) }
      else setError(true)
      setLoading(false)
    })
  }, [messageId, telefone, fromMe])

  return { src, loading, error }
}
