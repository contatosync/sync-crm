'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Search, Send, Paperclip, X, Filter, MoreHorizontal,
  ChevronDown, Plus, Check, CheckCheck, Image as ImageIcon
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { sendText, sendAudio, sendImage } from '@/lib/evolution'
import { formatPhone, formatDate, getDateLabel, isGroupPhone } from '@/lib/utils'
import { useUnread } from '@/lib/unread-context'
import ContactAvatar from '@/components/ContactAvatar'
import AudioRecorder from '@/components/AudioRecorder'
import AudioPlayer from '@/components/AudioPlayer'
import ImageMessage from '@/components/ImageMessage'
import type { Conversa, Contato, EtapaFunil, Mensagem, Tarefa } from '@/types'

/* ─────────────── helpers ─────────────── */
function getPreview(msg: Mensagem | undefined): string {
  if (!msg) return '—'
  if (msg.media_type === 'image') return '🖼️ Imagem'
  if (msg.media_type === 'audio' || msg.media_type === 'ptt') return '🎵 Áudio'
  if (msg.media_type === 'document') return '📄 Documento'
  const prefix = msg.role === 'assistant' ? '✓ ' : ''
  const raw = msg.content?.replace(/^\[(?:audio|ptt|image|document):[^\]]+\]\s*/, '') || '—'
  return (prefix + raw).slice(0, 45)
}

function getMediaMsgId(msg: Mensagem): string | undefined {
  return msg.messageId ?? msg.message_id ?? (() => {
    const m = msg.content?.match(/^\[(?:audio|ptt|image|document):([^\]]+)\]/)
    return m?.[1]
  })()
}

function isAudioMsg(msg: Mensagem): boolean {
  return (
    msg.media_type === 'audio' || msg.media_type === 'ptt' ||
    !!(msg.content?.startsWith('[audio') || msg.content?.startsWith('[ptt'))
  )
}

function isImageMsg(msg: Mensagem): boolean {
  return msg.media_type === 'image' || !!(msg.content?.startsWith('[image'))
}

function resolverNome(conv: Conversa, contato?: Contato | null): string {
  if (contato?.nome?.trim()) return contato.nome.trim()
  if (conv.nome?.trim()) return conv.nome.trim()
  return formatPhone(conv.telefone)
}

/* WhatsApp SVG inline (used in multiple places) */
function WaIcon({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </svg>
  )
}

/* ─────────────── page ─────────────── */
export default function InboxPage() {
  const { markAsRead } = useUnread()

  // Data
  const [conversas, setConversas] = useState<Conversa[]>([])
  const [contatos, setContatos] = useState<Record<string, Contato>>({})
  const [etapas, setEtapas] = useState<EtapaFunil[]>([])

  // Selection
  const [selected, setSelected] = useState<Conversa | null>(null)
  const [selectedContato, setSelectedContato] = useState<Contato | null>(null)

  // UI
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'abertas' | 'todas'>('abertas')
  const [col2Tab, setCol2Tab] = useState<'principal' | 'midia'>('principal')
  const [showEtapaDropdown, setShowEtapaDropdown] = useState(false)

  // Chat input
  const [text, setText] = useState('')
  const [pendingImage, setPendingImage] = useState<string | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [sending, setSending] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  // Lead fields
  const [obs, setObs] = useState('')
  const [savingField, setSavingField] = useState<string | null>(null)

  // Tasks
  const [tarefas, setTarefas] = useState<Tarefa[]>([])
  const [novaTarefa, setNovaTarefa] = useState('')
  const [showTarefaInput, setShowTarefaInput] = useState(false)

  // Pagination / totals
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [totalCount, setTotalCount] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)

  // Infinite-scroll sentinel
  const sentinelRef = useRef<HTMLDivElement>(null)

  // Unread tracking (mirrors layout.tsx localStorage schema)
  const [lastSeen, setLastSeen] = useState<Record<string, number>>({})

  const fileRef = useRef<HTMLInputElement>(null)
  const msgsEndRef = useRef<HTMLDivElement>(null)
  const PAGE = 50

  /* ── Load lastSeen from localStorage ── */
  useEffect(() => {
    try {
      const s = localStorage.getItem('sync-seen')
      if (s) setLastSeen(JSON.parse(s))
    } catch { /* noop */ }
  }, [])

  /* ── Load conversations + batch-fetch contacts ── */
  const loadConversas = useCallback(async (pg = 0) => {
    if (pg > 0) setLoadingMore(true)
    const from = pg * PAGE
    const { data, count } = await supabase
      .from('conversas')
      .select('*', { count: 'exact' })
      .order('atualizado_em', { ascending: false })
      .range(from, from + PAGE - 1)

    if (data) {
      const convs = data as Conversa[]
      if (pg === 0) setConversas(convs)
      else setConversas(prev => {
        // Deduplicate by telefone
        const existing = new Set(prev.map(c => c.telefone))
        return [...prev, ...convs.filter(c => !existing.has(c.telefone))]
      })
      setHasMore((count ?? 0) > from + PAGE)
      setTotalCount(count ?? 0)
      setPage(pg)

      // Batch-fetch crm_contatos for this page of phones
      if (convs.length > 0) {
        const phones = convs.map(c => c.telefone)
        const { data: ctData } = await supabase
          .from('crm_contatos')
          .select('*')
          .in('telefone', phones)
        if (ctData) {
          setContatos(prev => {
            const next = { ...prev }
            ;(ctData as Contato[]).forEach(c => { next[c.telefone] = c })
            return next
          })
        }
      }
    }
    if (pg > 0) setLoadingMore(false)
  }, [])

  /* ── Load stages ── */
  async function loadEtapas() {
    const { data } = await supabase.from('etapas_funil').select('*').order('ordem')
    if (data) setEtapas(data as EtapaFunil[])
  }

  /* ── Load tasks for selected contact ── */
  async function loadTarefas(contatoId: string) {
    const { data } = await supabase
      .from('tarefas').select('*')
      .eq('contato_id', contatoId)
      .order('criado_em', { ascending: false })
    if (data) setTarefas(data as Tarefa[])
  }

  /* ── Initial setup + realtime ── */
  useEffect(() => {
    loadConversas()
    loadEtapas()

    const ch = supabase.channel('inbox-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversas' }, payload => {
        const row = payload.new as Conversa
        if (!row?.telefone) { loadConversas(); return }
        // Move/insert to top of list
        setConversas(prev => {
          const next = prev.filter(c => c.telefone !== row.telefone)
          return [row, ...next]
        })
        // Update selected conversation messages in real time
        setSelected(prev => prev?.telefone === row.telefone ? { ...prev, ...row } : prev)
      })
      .subscribe()

    return () => { supabase.removeChannel(ch) }
  }, [loadConversas])

  /* ── Infinite scroll via IntersectionObserver ── */
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const obs = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore && !loadingMore) {
        loadConversas(page + 1)
      }
    }, { threshold: 0.1 })
    obs.observe(sentinel)
    return () => obs.disconnect()
  }, [hasMore, loadingMore, page, loadConversas])

  /* ── Auto-scroll to bottom ── */
  useEffect(() => {
    msgsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [selected?.telefone, selected?.historico?.length])

  /* ── Select conversation ── */
  function selectConv(conv: Conversa) {
    setSelected(conv)
    const c = contatos[conv.telefone] ?? null
    setSelectedContato(c)
    setObs(c?.observacoes ?? '')
    setCol2Tab('principal')
    setShowEtapaDropdown(false)
    if (c) loadTarefas(c.id)
    else setTarefas([])
    markAsRead(conv.telefone)
    // Mark as seen locally
    const now = Date.now()
    setLastSeen(prev => {
      const next = { ...prev, [conv.telefone]: now }
      try { localStorage.setItem('sync-seen', JSON.stringify(next)) } catch { /* noop */ }
      return next
    })
  }

  /* ── Unread check ── */
  function isUnread(conv: Conversa): boolean {
    const hist = conv.historico ?? []
    const last = hist[hist.length - 1]
    if (!last || last.role !== 'user') return false
    const seen = lastSeen[conv.telefone]
    return seen ? new Date(conv.atualizado_em).getTime() > seen : true
  }

  /* ── Filtered list ──
     "Abertas" = todas as conversas (tabela não tem campo status).
     Filtro só aplica busca por nome/telefone. Grupos sempre excluídos. */
  const filtered = conversas.filter(c => {
    if (isGroupPhone(c.telefone)) return false
    if (!search) return true
    const nome = resolverNome(c, contatos[c.telefone])
    return nome.toLowerCase().includes(search.toLowerCase()) || c.telefone.includes(search)
  })

  /* ── Send text ── */
  async function handleSend(e?: React.FormEvent) {
    e?.preventDefault()
    if (!selected || (!text.trim() && !pendingImage)) return
    setSending(true)
    const tel = selected.telefone
    try {
      if (pendingImage) {
        await sendImage(tel, pendingImage)
        setPendingImage(null)
      }
      if (text.trim()) {
        const msg = text.trim()
        setText('')
        // Optimistic UI update
        const optimistic: Mensagem = {
          role: 'assistant', content: msg, timestamp: new Date().toISOString(),
        }
        setSelected(prev => prev ? { ...prev, historico: [...(prev.historico ?? []), optimistic] } : prev)
        await sendText(tel, msg)
      }
    } catch { /* silently ignore */ }
    setSending(false)
  }

  async function handleSendAudio(b64: string) {
    if (!selected) return
    await sendAudio(selected.telefone, b64)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onloadend = () => setPendingImage(reader.result as string)
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (!file || !file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onloadend = () => setPendingImage(reader.result as string)
    reader.readAsDataURL(file)
  }

  /* ── Change stage ── */
  async function changeEtapa(etapaId: string) {
    if (!selectedContato) return
    setShowEtapaDropdown(false)
    const { data } = await supabase
      .from('crm_contatos').update({ etapa_funil_id: etapaId || null })
      .eq('id', selectedContato.id).select().single()
    if (data) {
      setSelectedContato(data as Contato)
      setContatos(prev => ({ ...prev, [selectedContato.telefone]: data as Contato }))
    }
  }

  /* ── Auto-save field on blur ── */
  async function saveField(field: string, value: string) {
    if (!selectedContato) return
    setSavingField(field)
    const { data } = await supabase
      .from('crm_contatos').update({ [field]: value })
      .eq('id', selectedContato.id).select().single()
    if (data) {
      setSelectedContato(data as Contato)
      setContatos(prev => ({ ...prev, [selectedContato.telefone]: data as Contato }))
    }
    setSavingField(null)
  }

  /* ── Tasks ── */
  async function addTarefa() {
    if (!novaTarefa.trim() || !selectedContato) return
    const { data } = await supabase
      .from('tarefas').insert({ titulo: novaTarefa.trim(), contato_id: selectedContato.id, status: 'pendente' })
      .select().single()
    if (data) { setTarefas(prev => [data as Tarefa, ...prev]); setNovaTarefa(''); setShowTarefaInput(false) }
  }

  async function toggleTarefa(t: Tarefa) {
    const ns = t.status === 'pendente' ? 'concluida' : 'pendente'
    await supabase.from('tarefas').update({ status: ns }).eq('id', t.id)
    setTarefas(prev => prev.map(x => x.id === t.id ? { ...x, status: ns } : x))
  }

  /* ── Group messages by date ── */
  function groupByDate(msgs: Mensagem[]) {
    const groups: { label: string; msgs: Mensagem[] }[] = []
    msgs.forEach(msg => {
      const label = getDateLabel(msg.timestamp)
      const last = groups[groups.length - 1]
      if (last?.label === label) last.msgs.push(msg)
      else groups.push({ label, msgs: [msg] })
    })
    return groups
  }

  /* ── Render message content ── */
  function renderMsgContent(msg: Mensagem, isOwn: boolean) {
    const msgId = getMediaMsgId(msg)
    if (isAudioMsg(msg)) {
      return <AudioPlayer messageId={msgId} telefone={selected!.telefone} fromMe={isOwn} isOwn={isOwn} />
    }
    if (isImageMsg(msg)) {
      return <ImageMessage messageId={msgId} telefone={selected!.telefone} fromMe={isOwn} />
    }
    if (msg.media_type === 'document' || msg.content?.startsWith('[document')) {
      return <div className="flex items-center gap-2 text-sm">📄 <span>Documento</span></div>
    }
    const txt = msg.content?.replace(/^\[(?:audio|ptt|image|document):[^\]]+\]\s*/, '') || ''
    return <span className="text-sm leading-relaxed whitespace-pre-wrap break-words">{txt}</span>
  }

  /* ── Derived ── */
  const etapaAtual = etapas.find(e => e.id === selectedContato?.etapa_funil_id)
  const imageMsgs = (selected?.historico ?? []).filter(m => isImageMsg(m))
  const lastMsg = selected?.historico?.[selected.historico.length - 1]

  /* ─────────────────────────── RENDER ─────────────────────────── */
  return (
    <div className="flex h-full overflow-hidden">

      {/* ══════════════════════════════════════════
          COLUNA 1 — Lista de conversas (320px)
      ══════════════════════════════════════════ */}
      <div className="w-80 flex flex-col border-r border-gray-200 bg-white flex-shrink-0">

        {/* Header */}
        <div className="px-4 pt-3 pb-2 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              <button className="flex items-center gap-1.5 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors">
                <Filter size={13} />
                <span>Filtro</span>
              </button>
              <span className="text-[11px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full font-medium">
                Total: {totalCount}
              </span>
            </div>
            <button className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors">
              <MoreHorizontal size={15} />
            </button>
          </div>

          {/* Search */}
          <div className="relative mb-2.5">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar..."
              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:border-primary focus:bg-white transition-colors"
            />
          </div>

          {/* Tabs */}
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
            {(['abertas', 'todas'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`flex-1 text-xs py-1.5 rounded-lg font-medium transition-colors ${
                  filter === f ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {f === 'abertas' ? 'Abertas' : 'Todas'}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center h-32 text-gray-400">
              <p className="text-sm">Nenhuma conversa</p>
            </div>
          )}

          {filtered.map(conv => {
            const c = contatos[conv.telefone]
            const nome = resolverNome(conv, c)
            const hist = conv.historico ?? []
            const lastMsgItem = hist[hist.length - 1]
            const preview = getPreview(lastMsgItem)
            const unread = isUnread(conv)
            const isSelected = selected?.telefone === conv.telefone

            return (
              <button
                key={conv.telefone}
                onClick={() => selectConv(conv)}
                className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors border-b border-gray-50
                  ${isSelected
                    ? 'bg-[#EFF6FF] border-l-[3px] border-l-blue-500 pl-[13px]'
                    : 'hover:bg-[#F9FAFB]'
                  }`}
              >
                {/* Avatar + WA badge */}
                <div className="relative flex-shrink-0">
                  <ContactAvatar nome={nome} telefone={conv.telefone} fotoUrl={c?.foto_url} size={44} />
                  <span className="absolute bottom-0 right-0 w-4 h-4 bg-[#25D366] rounded-full border-2 border-white flex items-center justify-center">
                    <WaIcon size={8} className="text-white" />
                  </span>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-1 mb-0.5">
                    <span className={`text-sm truncate ${unread ? 'font-bold text-gray-900' : 'font-medium text-gray-800'}`}>
                      {nome}
                    </span>
                    <span className="text-[10px] text-gray-400 flex-shrink-0 mt-0.5">
                      {formatDate(conv.atualizado_em)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-1">
                    <p className={`text-xs truncate ${unread ? 'text-gray-700 font-medium' : 'text-gray-500'}`}>
                      {preview}
                    </p>
                    {unread && (
                      <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                    )}
                  </div>
                </div>
              </button>
            )
          })}

          {/* Infinite-scroll sentinel */}
          <div ref={sentinelRef} className="h-1" />
          {loadingMore && (
            <div className="flex items-center justify-center py-3 gap-2 text-gray-400">
              <div className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="text-xs">Carregando…</span>
            </div>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════
          COLUNA 2 — Detalhes do lead (300px)
      ══════════════════════════════════════════ */}
      <div className="w-[300px] flex flex-col border-r border-gray-200 bg-white flex-shrink-0 overflow-hidden">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-gray-300">
              <div className="text-4xl mb-2">👤</div>
              <p className="text-sm">Selecione uma conversa</p>
            </div>
          </div>
        ) : (
          <>
            {/* Col2 header */}
            <div className="px-4 py-3 border-b border-gray-100 flex-shrink-0">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-500 truncate max-w-[200px]">
                  Lead #{formatPhone(selected.telefone)}
                </span>
                <button className="p-1 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors">
                  <MoreHorizontal size={14} />
                </button>
              </div>

              {/* Etapa badge + dropdown */}
              <div className="relative mb-3">
                <button
                  onClick={() => setShowEtapaDropdown(v => !v)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border w-full transition-colors"
                  style={{
                    backgroundColor: etapaAtual?.cor ? etapaAtual.cor + '20' : '#F3F4F6',
                    borderColor: etapaAtual?.cor ?? '#E5E7EB',
                    color: etapaAtual?.cor ?? '#6B7280',
                  }}
                >
                  <span className="flex-1 text-left">{etapaAtual?.nome ?? 'Sem etapa'}</span>
                  <ChevronDown size={11} />
                </button>

                {showEtapaDropdown && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-30 overflow-hidden">
                    <button
                      onClick={() => changeEtapa('')}
                      className="w-full text-left px-3 py-2 text-xs text-gray-500 hover:bg-gray-50 transition-colors"
                    >
                      Sem etapa
                    </button>
                    {etapas.map(e => (
                      <button
                        key={e.id}
                        onClick={() => changeEtapa(e.id)}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 transition-colors flex items-center gap-2"
                      >
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: e.cor }} />
                        <span className="flex-1">{e.nome}</span>
                        {e.id === selectedContato?.etapa_funil_id && (
                          <Check size={10} className="text-green-500" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Tabs: Principal | Mídia */}
              <div className="flex gap-4">
                {(['principal', 'midia'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setCol2Tab(t)}
                    className={`text-xs font-semibold pb-1 border-b-2 transition-colors ${
                      col2Tab === t
                        ? 'border-primary text-primary'
                        : 'border-transparent text-gray-400 hover:text-gray-600'
                    }`}
                  >
                    {t === 'principal' ? 'Principal' : 'Mídia'}
                  </button>
                ))}
              </div>
            </div>

            {/* Col2 content (scrollable) */}
            <div className="flex-1 overflow-y-auto">

              {/* ── Aba Principal ── */}
              {col2Tab === 'principal' && (
                <div className="p-4 space-y-4">

                  {/* Contact header */}
                  <div className="flex items-center gap-3">
                    <ContactAvatar
                      nome={resolverNome(selected, selectedContato)}
                      telefone={selected.telefone}
                      fotoUrl={selectedContato?.foto_url}
                      size={48}
                    />
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 text-sm truncate">
                        {resolverNome(selected, selectedContato)}
                      </p>
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-[#DCF8C6] text-[#128C7E] text-[10px] font-bold rounded-full">
                        <WaIcon size={8} />
                        WhatsApp Business
                      </span>
                    </div>
                  </div>

                  {/* Fields */}
                  <div className="space-y-3 divide-y divide-gray-50">

                    <FieldRow label="Responsável" value="—" />

                    <div className="pt-3">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Venda</p>
                      <input
                        placeholder="R$ 0,00"
                        className="text-sm text-gray-700 w-full focus:outline-none border-b border-transparent focus:border-gray-300 pb-0.5 bg-transparent placeholder-gray-400"
                      />
                    </div>

                    <div className="pt-3">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Tel. comercial</p>
                      <a
                        href={`tel:+${selected.telefone.replace(/\D/g, '')}`}
                        className="text-sm text-primary hover:underline"
                      >
                        {formatPhone(selected.telefone)}
                      </a>
                    </div>

                    <div className="pt-3">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">E-mail</p>
                      <p className="text-sm text-gray-700">{selectedContato?.email || '—'}</p>
                    </div>

                    <div className="pt-3">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Origem</p>
                      <p className="text-sm text-gray-700">{selectedContato?.origem || '—'}</p>
                    </div>

                    <div className="pt-3">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Status</p>
                      <select
                        value={selectedContato?.status ?? ''}
                        onChange={e => saveField('status', e.target.value)}
                        className="text-sm text-gray-700 border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:border-primary w-full bg-white"
                      >
                        <option value="">—</option>
                        <option value="ativo">Ativo</option>
                        <option value="qualificado">Qualificado</option>
                        <option value="ganho">Ganho</option>
                        <option value="perdido">Perdido</option>
                      </select>
                    </div>

                    <div className="pt-3">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Observações</p>
                      <textarea
                        value={obs}
                        onChange={e => setObs(e.target.value)}
                        onBlur={() => saveField('observacoes', obs)}
                        placeholder="Adicionar observação..."
                        rows={3}
                        className="w-full text-sm text-gray-700 border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-primary resize-none placeholder-gray-300"
                      />
                      {savingField === 'observacoes' && (
                        <p className="text-[10px] text-gray-400 mt-0.5">Salvando...</p>
                      )}
                    </div>
                  </div>

                  {/* Tasks */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Tarefas</p>
                      <button
                        onClick={() => setShowTarefaInput(true)}
                        className="text-primary hover:text-primary-dark transition-colors"
                      >
                        <Plus size={14} />
                      </button>
                    </div>

                    {showTarefaInput && (
                      <div className="flex gap-1 mb-2.5">
                        <input
                          value={novaTarefa}
                          onChange={e => setNovaTarefa(e.target.value)}
                          placeholder="Nova tarefa..."
                          autoFocus
                          className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-primary"
                          onKeyDown={e => e.key === 'Enter' && addTarefa()}
                        />
                        <button onClick={addTarefa} className="text-xs text-primary font-semibold px-2">OK</button>
                        <button
                          onClick={() => { setShowTarefaInput(false); setNovaTarefa('') }}
                          className="text-gray-400 hover:text-gray-600"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    )}

                    <div className="space-y-2">
                      {tarefas.map(t => (
                        <div key={t.id} className="flex items-start gap-2">
                          <button
                            onClick={() => toggleTarefa(t)}
                            className={`mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                              t.status === 'concluida'
                                ? 'bg-green-500 border-green-500'
                                : 'border-gray-300 hover:border-green-400'
                            }`}
                          >
                            {t.status === 'concluida' && <Check size={8} className="text-white" />}
                          </button>
                          <span className={`text-xs leading-relaxed ${
                            t.status === 'concluida' ? 'line-through text-gray-400' : 'text-gray-700'
                          }`}>
                            {t.titulo}
                          </span>
                        </div>
                      ))}
                      {tarefas.length === 0 && (
                        <p className="text-xs text-gray-400">Nenhuma tarefa</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ── Aba Mídia ── */}
              {col2Tab === 'midia' && (
                <div className="p-3">
                  {imageMsgs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-gray-300">
                      <ImageIcon size={36} className="mb-2" />
                      <p className="text-sm">Nenhuma imagem</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-1.5">
                      {imageMsgs.map((msg, i) => {
                        const msgId = getMediaMsgId(msg)
                        if (!msgId) return null
                        return (
                          <div key={i} className="aspect-square overflow-hidden rounded-lg bg-gray-100">
                            <ImageMessage
                              messageId={msgId}
                              telefone={selected!.telefone}
                              fromMe={msg.role === 'assistant'}
                            />
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Col2 footer */}
            <div className="border-t border-gray-100 px-4 py-3 flex-shrink-0 bg-white">
              <div className="flex gap-2 mb-2.5">
                <button className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-green-500 text-white text-xs font-semibold rounded-xl hover:bg-green-600 transition-colors">
                  <Check size={13} /> Aceitar
                </button>
                <button className="flex items-center justify-center w-9 h-9 border border-gray-200 text-gray-500 rounded-xl hover:bg-gray-50 transition-colors text-sm">
                  🔗
                </button>
                <button className="flex items-center justify-center w-9 h-9 border border-red-100 text-red-400 rounded-xl hover:bg-red-50 transition-colors text-sm">
                  🗑️
                </button>
              </div>
              <div className="flex items-center justify-between text-[10px] text-gray-400">
                <button className="hover:text-gray-600 transition-colors underline-offset-2 hover:underline">
                  Fechar conversa
                </button>
                <span>Conversa Nº A{selected.id?.slice(-6) ?? '—'}</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ══════════════════════════════════════════
          COLUNA 3 — Chat (flex)
      ══════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#F0F2F5]">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="text-6xl mb-4 opacity-30">💬</div>
              <p className="text-lg font-semibold text-gray-500">Selecione uma conversa</p>
              <p className="text-sm text-gray-400 mt-1">Escolha uma conversa na lista ao lado</p>
            </div>
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div className="px-5 py-3 border-b border-gray-200 bg-white flex items-center justify-between flex-shrink-0 shadow-sm">
              <div className="flex items-center gap-3">
                <ContactAvatar
                  nome={resolverNome(selected, selectedContato)}
                  telefone={selected.telefone}
                  fotoUrl={selectedContato?.foto_url}
                  size={38}
                />
                <div>
                  <p className="font-semibold text-gray-900 text-sm leading-tight">
                    {resolverNome(selected, selectedContato)}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] text-gray-400">
                      {lastMsg
                        ? `${new Date(lastMsg.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · WhatsApp Business`
                        : 'WhatsApp Business'
                      }
                    </span>
                    <CheckCheck size={11} className="text-blue-400" />
                    <span className="text-[10px] text-blue-400">Lido</span>
                  </div>
                </div>
              </div>
              <a
                href={`https://wa.me/${selected.telefone.replace(/\D/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
                title="Abrir no WhatsApp"
              >
                <WaIcon size={18} className="text-[#25D366]" />
              </a>
            </div>

            {/* Messages */}
            <div
              className="flex-1 overflow-y-auto px-4 py-3"
              onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              style={isDragging ? { backgroundColor: 'rgba(37,99,235,0.04)' } : undefined}
            >
              {groupByDate(selected.historico ?? []).map((group, gi) => (
                <div key={gi}>
                  {/* Date separator */}
                  <div className="flex justify-center my-3">
                    <span className="text-[11px] text-gray-500 bg-white/90 px-3 py-1 rounded-full shadow-sm border border-gray-100">
                      {group.label}
                    </span>
                  </div>

                  {/* Messages */}
                  {group.msgs.map((msg, i) => {
                    const isOwn = msg.role === 'assistant'
                    const time = msg.timestamp
                      ? new Date(msg.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                      : ''
                    return (
                      <div key={i} className={`flex mb-1.5 ${isOwn ? 'justify-end' : 'justify-start'}`}>
                        {!isOwn && (
                          <div className="flex-shrink-0 mr-2 self-end mb-5">
                            <ContactAvatar
                              nome={resolverNome(selected, selectedContato)}
                              telefone={selected.telefone}
                              fotoUrl={selectedContato?.foto_url}
                              size={28}
                            />
                          </div>
                        )}
                        <div className={`flex flex-col max-w-[65%] ${isOwn ? 'items-end' : 'items-start'}`}>
                          <div className={`px-3 py-2 shadow-sm ${
                            isOwn
                              ? 'bg-[#DCF8C6] text-gray-900 rounded-[12px_12px_4px_12px]'
                              : 'bg-white text-gray-900 rounded-[12px_12px_12px_4px]'
                          }`}>
                            {renderMsgContent(msg, isOwn)}
                          </div>
                          <div className={`flex items-center gap-1 mt-0.5 px-1 ${isOwn ? 'flex-row-reverse' : ''}`}>
                            <span className="text-[10px] text-gray-400">{time}</span>
                            {isOwn && <CheckCheck size={11} className="text-blue-400" />}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))}
              <div ref={msgsEndRef} />
            </div>

            {/* Input area */}
            <div className="px-4 py-3 bg-white border-t border-gray-100 flex-shrink-0">
              {/* Chat tab bar */}
              <div className="flex gap-4 mb-2">
                <span className="text-xs font-semibold text-primary border-b-2 border-primary pb-1">
                  Bate-papo
                </span>
              </div>

              {/* Image preview */}
              {pendingImage && (
                <div className="relative inline-block mb-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={pendingImage} alt="Preview" className="h-20 w-20 object-cover rounded-xl border border-gray-200" />
                  <button
                    onClick={() => setPendingImage(null)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-gray-800 hover:bg-gray-900 text-white rounded-full flex items-center justify-center"
                  >
                    <X size={10} />
                  </button>
                </div>
              )}

              <form onSubmit={handleSend}>
                <div className="flex items-end gap-2">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={handleFileChange}
                  />

                  {/* Attachment */}
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-xl text-gray-400 hover:text-primary hover:bg-gray-100 transition-colors mb-0.5"
                  >
                    <Paperclip size={18} />
                  </button>

                  {/* Textarea */}
                  <textarea
                    value={text}
                    onChange={e => setText(e.target.value)}
                    placeholder="Escreva uma mensagem..."
                    disabled={isRecording || sending}
                    rows={1}
                    className="flex-1 bg-gray-100 rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none disabled:opacity-50 overflow-y-auto"
                    style={{ minHeight: 40, maxHeight: 120 }}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend() }
                    }}
                  />

                  {/* Audio recorder (always rendered — handles its own state) */}
                  <AudioRecorder
                    onSend={handleSendAudio}
                    onRecordingChange={setIsRecording}
                    disabled={sending}
                  />

                  {/* Send button — hidden while recording */}
                  {!isRecording && (
                    <button
                      type="submit"
                      disabled={sending || (!text.trim() && !pendingImage)}
                      className="w-9 h-9 flex-shrink-0 bg-primary hover:bg-primary-dark text-white rounded-xl flex items-center justify-center transition-colors disabled:opacity-40 mb-0.5"
                    >
                      {sending
                        ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        : <Send size={15} />
                      }
                    </button>
                  )}
                </div>
              </form>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/* ── Small helper component ── */
function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="pt-3">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">{label}</p>
      <p className="text-sm text-gray-500">{value}</p>
    </div>
  )
}
