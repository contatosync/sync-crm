import { format, parseISO, isToday, isYesterday } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export function formatPhone(tel: string): string {
  const d = tel.replace(/\D/g, '')
  const n = d.length > 13 ? d.slice(-11) : d.length === 13 ? d.slice(2) : d
  if (n.length === 11) return `(${n.slice(0,2)}) ${n.slice(2,7)}-${n.slice(7)}`
  if (n.length === 10) return `(${n.slice(0,2)}) ${n.slice(2,6)}-${n.slice(6)}`
  return tel
}

export function getAvatarColor(str: string): string {
  const colors = ['#6366F1','#8B5CF6','#EC4899','#EF4444','#F97316','#EAB308','#22C55E','#14B8A6','#3B82F6','#06B6D4']
  let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0
  return colors[h % colors.length]
}

export function getInitials(nome: string | null | undefined): string {
  if (!nome?.trim()) return '?'
  return nome.trim().split(/\s+/).slice(0,2).map(w => w[0].toUpperCase()).join('')
}

export function formatDate(ts: string): string {
  try {
    const d = parseISO(ts)
    if (isToday(d)) return format(d, 'HH:mm')
    if (isYesterday(d)) return 'Ontem'
    return format(d, 'dd/MM/yy')
  } catch { return '' }
}

export function formatDateTime(ts: string): string {
  try { return format(parseISO(ts), 'dd/MM HH:mm') } catch { return '' }
}

export function formatFullDate(ts: string): string {
  try { return format(parseISO(ts), "dd 'de' MMMM", { locale: ptBR }) } catch { return '' }
}

export function getDateLabel(ts: string): string {
  try {
    const d = parseISO(ts)
    if (isToday(d)) return 'Hoje'
    if (isYesterday(d)) return 'Ontem'
    return format(d, "dd 'de' MMMM", { locale: ptBR })
  } catch { return '' }
}

export function isGroupPhone(tel: string): boolean {
  return tel.replace(/\D/g, '').startsWith('120363')
}

/* ─── Nome filtering ─── */
const NOMES_IGNORADOS = ['sync', 'sincronizar', 'contatosync']

export function nomeValido(nome: string | null | undefined, telefone: string): boolean {
  if (!nome?.trim()) return false
  const n = nome.toLowerCase().trim()
  if (NOMES_IGNORADOS.some(x => n.includes(x))) return false
  if (nome.trim() === telefone) return false
  return true
}

/* ─── Message content parsing ─── */
const BARE_BRACKETS = /^\[(?:text|undefined)\]$/

export function parseMsgPreview(msg: { content?: string; media_type?: string } | undefined, prefix = ''): string {
  if (!msg) return '—'
  if (msg.media_type === 'image') return prefix + '🖼️ Imagem'
  if (msg.media_type === 'audio' || msg.media_type === 'ptt') return prefix + '🎵 Áudio'
  if (msg.media_type === 'document') return prefix + '📄 Documento'
  let txt = (msg.content ?? '').replace(/^\[(?:audio|ptt|image|document):[^\]]+\]\s*/, '').trim()
  if (!txt || BARE_BRACKETS.test(txt)) {
    if (msg.content?.startsWith('[audio') || msg.content?.startsWith('[ptt')) return prefix + '🎵 Áudio'
    if (msg.content?.startsWith('[image')) return prefix + '🖼️ Imagem'
    if (msg.content?.startsWith('[document')) return prefix + '📄 Documento'
    return prefix + '💬 Mensagem'
  }
  return prefix + txt
}
