import { format, parseISO, isToday, isYesterday } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 13) {
    return `+${digits.slice(0,2)} (${digits.slice(2,4)}) ${digits.slice(4,9)}-${digits.slice(9)}`
  }
  if (digits.length === 11) {
    return `(${digits.slice(0,2)}) ${digits.slice(2,7)}-${digits.slice(7)}`
  }
  return phone
}

export function formatDate(dateStr: string): string {
  try {
    const date = parseISO(dateStr)
    if (isToday(date)) return format(date, 'HH:mm')
    if (isYesterday(date)) return 'Ontem'
    return format(date, 'dd/MM/yyyy', { locale: ptBR })
  } catch {
    return ''
  }
}

export function formatDateTime(dateStr: string): string {
  try {
    return format(parseISO(dateStr), 'dd/MM/yyyy HH:mm', { locale: ptBR })
  } catch {
    return ''
  }
}

export function getInitials(name: string | null): string {
  if (!name) return '?'
  return name.split(' ').slice(0,2).map(n => n[0]).join('').toUpperCase()
}

export function getAvatarColor(name: string | null): string {
  const colors = [
    '#2563EB','#7C3AED','#DB2777','#DC2626','#D97706',
    '#059669','#0891B2','#4F46E5','#BE185D','#B45309',
  ]
  if (!name) return colors[0]
  const idx = name.charCodeAt(0) % colors.length
  return colors[idx]
}
