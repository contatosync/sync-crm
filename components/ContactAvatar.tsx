'use client'
import { useState } from 'react'
import { getAvatarColor, getInitials } from '@/lib/utils'

interface Props { nome?: string | null; telefone?: string; size?: 'sm'|'md'|'lg'|number; fotoUrl?: string | null; className?: string }

const SIZES = { sm: 28, md: 40, lg: 64 }

export default function ContactAvatar({ nome, telefone, size = 'md', fotoUrl, className = '' }: Props) {
  const [imgErr, setImgErr] = useState(false)
  const px = typeof size === 'number' ? size : SIZES[size]
  const seed = telefone ?? nome ?? '?'
  const color = getAvatarColor(seed)
  const initials = getInitials(nome)
  const fontSize = px < 32 ? 10 : px < 48 ? 13 : 20

  if (fotoUrl && !imgErr) {
    return (
      <img src={fotoUrl} alt={nome ?? ''} referrerPolicy="no-referrer" onError={() => setImgErr(true)}
        className={`rounded-full object-cover flex-shrink-0 ${className}`}
        style={{ width: px, height: px }} />
    )
  }
  return (
    <div className={`rounded-full flex items-center justify-center flex-shrink-0 ${className}`}
      style={{ width: px, height: px, backgroundColor: color }}>
      <span style={{ color: '#fff', fontSize, fontWeight: 600, lineHeight: 1, userSelect: 'none' }}>{initials}</span>
    </div>
  )
}
