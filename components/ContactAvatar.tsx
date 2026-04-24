'use client'
import { useState } from 'react'
import { getAvatarColor, getInitials } from '@/lib/utils'

interface Props { nome?: string | null; seed: string; size?: number; fotoUrl?: string | null }

export default function ContactAvatar({ nome, seed, size = 36, fotoUrl }: Props) {
  const [imgError, setImgError] = useState(false)
  const initials = getInitials(nome ?? seed)
  const color = getAvatarColor(seed)
  const px = size
  const fontSize = size < 32 ? 10 : size < 48 ? 13 : 18

  if (fotoUrl && !imgError) {
    return (
      <img src={fotoUrl} alt={nome ?? ''} referrerPolicy="no-referrer"
        onError={() => setImgError(true)}
        style={{ width: px, height: px, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
      />
    )
  }

  return (
    <div style={{ width: px, height: px, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <span style={{ color: '#fff', fontSize, fontWeight: 600, lineHeight: 1 }}>{initials || '?'}</span>
    </div>
  )
}
