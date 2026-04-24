import { format, parseISO, isToday, isYesterday } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export function formatPhone(tel: string): string {
  const d = tel.replace(/\D/g, '')
  if (d.startsWith('120363')) return 'Grupo'
  if (d.length > 13) {
    const last11 = d.slice(-11)
    return `+55 (${last11.slice(0,2)}) ${last11.slice(2,7)}-${last11.slice(7)}`
  }
  if (d.length === 13) return `+${d.slice(0,2)} (${d.slice(2,4)}) ${d.slice(4,9)}-${d.slice(9)}`
  if (d.length === 12) return `+${d.slice(0,2)} (${d.slice(2,4)}) ${d.slice(4,8)}-${d.slice(8)}`
  if (d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`
  return tel
}

export function formatDate(ts: string): string {
  try {
    const d = parseISO(ts)
    if (isToday(d)) return format(d, 'HH:mm')
    if (isYesterday(d)) return 'Ontem'
    return format(d, 'dd/MM/yy')
  } catch { return '' }
}

export function formatDateFull(ts: string): string {
  try { return format(parseISO(ts), "dd 'de' MMMM 'de' yyyy", { locale: ptBR }) } catch { return '' }
}

export function formatTime(ts: string): string {
  try { return format(parseISO(ts), 'HH:mm') } catch { return '' }
}

export function formatDateTime(ts: string): string {
  try { return format(parseISO(ts), 'dd/MM/yyyy HH:mm', { locale: ptBR }) } catch { return '' }
}

export function isGroupPhone(tel: string): boolean {
  return tel.replace(/\D/g, '').startsWith('120363')
}

export function getAvatarColor(seed: string): string {
  const colors = ['#6366F1','#8B5CF6','#EC4899','#EF4444','#F97316','#EAB308','#22C55E','#14B8A6','#3B82F6','#06B6D4']
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return colors[h % colors.length]
}

export function getDateLabel(ts: string): string {
  try {
    const d = parseISO(ts)
    if (isToday(d)) return 'Hoje'
    if (isYesterday(d)) return 'Ontem'
    return format(d, "dd 'de' MMMM", { locale: ptBR })
  } catch { return '' }
}

export function getInitials(name: string | null): string {
  if (!name) return '?'
  return name.split(' ').filter(Boolean).slice(0,2).map(w => w[0].toUpperCase()).join('')
}
