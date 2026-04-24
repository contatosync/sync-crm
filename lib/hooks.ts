'use client'
import { useState, useEffect } from 'react'
import { fetchMediaBase64 } from './evolution'

// Module-level cache: key = `${messageId}:${telefone}:${fromMe}`
const cache = new Map<string, string>()

export function useMediaMessage(messageId: string | undefined, telefone: string, fromMe = false) {
  const [src, setSrc] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!messageId) { setError(true); return }
    const key = `${messageId}:${telefone}:${fromMe}`
    if (cache.has(key)) { setSrc(cache.get(key)!); return }
    setLoading(true)
    fetchMediaBase64(messageId, telefone, fromMe).then(result => {
      if (result) { cache.set(key, result); setSrc(result) }
      else setError(true)
      setLoading(false)
    })
  }, [messageId, telefone, fromMe])

  return { src, loading, error }
}
