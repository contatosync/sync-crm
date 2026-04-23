import { format, parseISO, isToday, isYesterday } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export function formatPhone(phone: string): string {
  if (!phone) return ''

  // JID de grupo (começa com 120363)
  const raw = phone.replace(/\D/g, '')
  if (raw.startsWith('120363')) return 'Grupo'

  // Remove tudo que não for dígito
  let digits = raw

  // Números muito longos (>13 dígitos como addressingMode:lid) — pega últimos 11
  if (digits.length > 13) {
    digits = digits.slice(-11)
  }

  // Com código do país 55 (12 ou 13 dígitos)
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) {
    const ddd = digits.slice(2, 4)
    const num = digits.slice(4)
    if (num.length === 9) return `+55 (${ddd}) ${num.slice(0, 5)}-${num.slice(5)}`
    if (num.length === 8) return `+55 (${ddd}) ${num.slice(0, 4)}-${num.slice(4)}`
  }

  // Sem código do país (10 ou 11 dígitos)
  if (digits.length === 11) {
    return `+55 (${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  }
  if (digits.length === 10) {
    return `+55 (${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  }

  return `+${digits}`
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

const AVATAR_COLORS = [
  '#2563EB', '#16A34A', '#DC2626', '#9333EA', '#EA580C',
  '#0891B2', '#BE185D', '#65A30D', '#7C3AED', '#B45309',
]

// Gera cor estável baseada no telefone (mais estável que o nome)
export function getAvatarColor(seed: string | null): string {
  if (!seed) return AVATAR_COLORS[0]
  // Usa todos os caracteres para um hash mais distribuído
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}
