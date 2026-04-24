'use client'
import React, { useEffect, useState, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { sendText, sendAudio, sendImage } from '@/lib/evolution'
import { formatDate, formatTime, formatPhone, getDateLabel, isGroupPhone } from '@/lib/utils'
import { useUnread } from '@/lib/unread-context'
import ContactAvatar from '@/components/ContactAvatar'
import AudioPlayer from '@/components/AudioPlayer'
import AudioRecorder from '@/components/AudioRecorder'
import ImageMessage from '@/components/ImageMessage'
import {
  Search, Send, X, Paperclip, ExternalLink, FileText, CheckSquare, Square, Plus,
  ChevronDown, MessageSquare
} from 'lucide-react'
import type { Conversa, Contato, EtapaFunil, Mensagem, Tarefa } from '@/types'

// ── Helper: extract media message ID ─────────────────────────────────────────
function getMediaMsgId(msg: Mensagem): string | undefined {
  if (msg.messageId) return msg.messageId
  if (msg.message_id) return msg.message_id
  const m = msg.content?.match(/^\[(?:audio|ptt|image|document):([^\]]+)\]/)
  return m?.[1]
}

function isAudioMsg(msg: Mensagem): boolean {
  return msg.media_type === 'audio' || msg.media_type === 'ptt' ||
    msg.content?.startsWith('[audio]') || msg.content?.startsWith('[ptt]')
}

function isImageMsg(msg: Mensagem): boolean {
  return msg.media_type === 'image' || msg.content?.startsWith('[image]')
}

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string | null }) {
  if (!status) return null
  const cls =
    status === 'cliente' ? 'bg-green-100 text-green-700' :
    status === 'qualificado' ? 'bg-blue-100 text-blue-700' :
    status === 'perdido' ? 'bg-red-100 text-red-700' :
    'bg-gray-100 text-gray-600'
  return <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-semibold capitalize ${cls}`}>{status}</span>
}

// ── Conversa list item preview ────────────────────────────────────────────────
function msgPreview(msg: Mensagem | undefined): string {
  if (!msg) return 'Sem mensagens'
  const prefix = msg.role === 'assistant' ? '✓ ' : ''
  if (isAudioMsg(msg)) return prefix + '🎵 Áudio'
  if (isImageMsg(msg)) return prefix + '🖼️ Imagem'
  if (msg.media_type === 'document') return prefix + '📄 Documento'
  return prefix + (msg.content ?? '')
}

// ── Name resolution ───────────────────────────────────────────────────────────
const IGNORED = new Set(['sync', 'sync studios', 'bot', 'assistant'])
function resolverNome(conv: Conversa, contato?: Contato | null): string {
  const check = (n: string | null | undefined): boolean => {
    if (!n?.trim()) return false
    if (n === conv.telefone) return false
    return !IGNORED.has(n.trim().toLowerCase())
  }
  if (check(contato?.nome)) return contato!.nome!
  if (check(conv.nome)) return conv.nome!
  return formatPhone(conv.telefone)
}

// ─────────────────────────────────────────────────────────────────────────────

export default function InboxPage() {
  // Data
  const [conversas, setConversas] = useState<Conversa[]>([])
  const [contatos, setContatos] = useState<Record<string, Contato>>({})
  const [etapas, setEtapas] = useState<EtapaFunil[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const pageRef = useRef(0)

  // Selection
  const [selected, setSelected] = useState<Conversa | null>(null)
  const [selectedContato, setSelectedContato] = useState<Contato | null>(null)

  // Chat input
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [pendingImage, setPendingImage] = useState<{ dataUrl: string; file: File } | null>(null)
  const [localImages, setLocalImages] = useState<Record<string, string>>({})
  const fileInputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Lead panel
  const [obs, setObs] = useState('')
  const [editingObs, setEditingObs] = useState(false)
  const [savingObs, setSavingObs] = useState(false)
  const [etapaOpen, setEtapaOpen] = useState(false)
  const [tarefas, setTarefas] = useState<Tarefa[]>([])
  const [tarefasOpen, setTarefasOpen] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskDate, setNewTaskDate] = useState('')
  const [addingTask, setAddingTask] = useState(false)

  // UI
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<'abertas' | 'todas'>('abertas')

  const { markAsRead } = useUnread()

  // ── Load data ─────────────────────────────────────────────────────────────

  const loadConversas = useCallback(async (reset = true) => {
    const page = reset ? 0 : pageRef.current
    const from = page * 50
    const to = from + 49
    const { data } = await supabase
      .from('conversas')
      .select('*')
      .order('atualizado_em', { ascending: false })
      .range(from, to)
    if (!data) return
    if (reset) {
      setConversas(data as Conversa[])
      pageRef.current = 1
    } else {
      setConversas(prev => {
        const existing = new Set(prev.map(c => c.telefone))
        const newOnes = (data as Conversa[]).filter(c => !existing.has(c.telefone))
        return [...prev, ...newOnes]
      })
      pageRef.current = page + 1
    }
    setHasMore(data.length === 50)
  }, [])

  const loadContatos = useCallback(async () => {
    const { data } = await supabase.from('crm_contatos').select('*, etapa:etapas_funil(*)').range(0, 999)
    if (data) {
      const map: Record<string, Contato> = {}
      ;(data as Contato[]).forEach(c => { map[c.telefone] = c })
      setContatos(map)
    }
  }, [])

  const loadEtapas = useCallback(async () => {
    const { data } = await supabase.from('etapas_funil').select('*').order('ordem')
    if (data) setEtapas(data as EtapaFunil[])
  }, [])

  useEffect(() => {
    loadConversas()
    loadContatos()
    loadEtapas()

    const channel = supabase
      .channel('inbox-conversas')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversas' }, () => {
        loadConversas()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [loadConversas, loadContatos, loadEtapas])

  // Update selected conv when data refreshes
  useEffect(() => {
    if (!selected) return
    const updated = conversas.find(c => c.telefone === selected.telefone)
    if (updated) {
      setSelected(updated)
      markAsRead(selected.telefone)
    }
    const c = contatos[selected.telefone] ?? null
    setSelectedContato(c)
    setObs(c?.observacoes ?? '')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversas, contatos])

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [selected?.historico?.length])

  // Load tasks for selected contact
  useEffect(() => {
    if (!selectedContato) { setTarefas([]); return }
    supabase.from('tarefas').select('*').eq('contato_id', selectedContato.id).order('criado_em', { ascending: false })
      .then(({ data }) => { if (data) setTarefas(data as Tarefa[]) })
  }, [selectedContato?.id])

  // ── Handlers ──────────────────────────────────────────────────────────────

  function selectConv(conv: Conversa) {
    setSelected(conv)
    const c = contatos[conv.telefone] ?? null
    setSelectedContato(c)
    setObs(c?.observacoes ?? '')
    setEditingObs(false)
    setPendingImage(null)
    setEtapaOpen(false)
    markAsRead(conv.telefone)
  }

  function handleImageSelect(file: File) {
    if (!file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onloadend = () => setPendingImage({ dataUrl: reader.result as string, file })
    reader.readAsDataURL(file)
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!selected || sending) return

    if (pendingImage) {
      setSending(true)
      const agora = new Date().toISOString()
      const caption = text.trim() || undefined
      const novaMensagem: Mensagem = { role: 'assistant', content: '[image]', media_type: 'image', timestamp: agora }
      const novoHist = [...(selected.historico ?? []), novaMensagem]
      setLocalImages(prev => ({ ...prev, [agora]: pendingImage.dataUrl }))
      setSelected(prev => prev ? { ...prev, historico: novoHist, atualizado_em: agora } : null)
      setPendingImage(null)
      setText('')
      try {
        const b64 = pendingImage.dataUrl.split(',')[1]
        await sendImage(selected.telefone, b64, caption)
        await supabase.from('conversas').upsert({ telefone: selected.telefone, historico: novoHist, atualizado_em: agora }, { onConflict: 'telefone' })
      } catch { alert('Erro ao enviar imagem') }
      finally { setSending(false); loadConversas() }
      return
    }

    if (!text.trim()) return
    setSending(true)
    const msg = text.trim()
    const agora = new Date().toISOString()
    const novaMensagem: Mensagem = { role: 'assistant', content: msg, timestamp: agora }
    const novoHist = [...(selected.historico ?? []), novaMensagem]
    setSelected(prev => prev ? { ...prev, historico: novoHist, atualizado_em: agora } : null)
    setText('')
    try {
      await sendText(selected.telefone, msg)
      await supabase.from('conversas').upsert({ telefone: selected.telefone, historico: novoHist, atualizado_em: agora }, { onConflict: 'telefone' })
    } catch { alert('Erro ao enviar mensagem'); setText(msg) }
    finally { setSending(false); loadConversas() }
  }

  async function handleSendAudio(base64: string) {
    if (!selected) return
    const agora = new Date().toISOString()
    const novaMensagem: Mensagem = { role: 'assistant', content: '[ptt]', media_type: 'ptt', timestamp: agora }
    const novoHist = [...(selected.historico ?? []), novaMensagem]
    setSelected(prev => prev ? { ...prev, historico: novoHist, atualizado_em: agora } : null)
    await sendAudio(selected.telefone, base64)
    await supabase.from('conversas').upsert({ telefone: selected.telefone, historico: novoHist, atualizado_em: agora }, { onConflict: 'telefone' })
    loadConversas()
  }

  async function saveObs() {
    if (!selectedContato) return
    setSavingObs(true)
    await supabase.from('crm_contatos').update({ observacoes: obs }).eq('id', selectedContato.id)
    setSavingObs(false)
    setEditingObs(false)
    loadContatos()
  }

  async function changeEtapa(etapaId: string) {
    if (!selectedContato) return
    setEtapaOpen(false)
    await supabase.from('crm_contatos').update({ etapa_funil_id: etapaId || null }).eq('id', selectedContato.id)
    loadContatos()
  }

  async function createTask() {
    if (!newTaskTitle.trim() || !selectedContato) return
    const { data } = await supabase.from('tarefas').insert({
      contato_id: selectedContato.id, titulo: newTaskTitle.trim(),
      vencimento: newTaskDate || null, status: 'pendente',
    }).select().single()
    if (data) setTarefas(prev => [data as Tarefa, ...prev])
    setNewTaskTitle('')
    setNewTaskDate('')
    setAddingTask(false)
  }

  async function toggleTask(t: Tarefa) {
    const s = t.status === 'concluida' ? 'pendente' : 'concluida'
    setTarefas(prev => prev.map(x => x.id === t.id ? { ...x, status: s } : x))
    await supabase.from('tarefas').update({ status: s }).eq('id', t.id)
  }

  async function loadMore() {
    setLoadingMore(true)
    await loadConversas(false)
    setLoadingMore(false)
  }

  // ── Filtered list ─────────────────────────────────────────────────────────

  const filtered = conversas.filter(c => {
    if (isGroupPhone(c.telefone)) return false
    const contato = contatos[c.telefone]
    const nome = resolverNome(c, contato)
    const matchBusca = nome.toLowerCase().includes(busca.toLowerCase()) || c.telefone.includes(busca)
    if (!matchBusca) return false
    if (filtro === 'abertas') {
      const hist = c.historico ?? []
      const last = hist[hist.length - 1]
      return last?.role === 'user'
    }
    return true
  })

  // ── Unread check ──────────────────────────────────────────────────────────
  function isUnread(conv: Conversa): boolean {
    const hist = conv.historico ?? []
    const last = hist[hist.length - 1]
    return last?.role === 'user' && conv.telefone !== selected?.telefone
  }

  // ── Etapa display ─────────────────────────────────────────────────────────
  const currentEtapa = etapas.find(e => e.id === selectedContato?.etapa_funil_id)

  return (
    <div className="flex h-full">
      {/* ── Column 1: Conversation list ──────────────────────────────────────── */}
      <div className="w-80 flex-shrink-0 bg-white border-r border-gray-100 flex flex-col">
        <div className="p-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-base font-bold text-gray-900">Conversas</h1>
            <span className="bg-gray-100 text-gray-500 text-xs font-semibold px-2 py-0.5 rounded-full">{filtered.length}</span>
          </div>
          <div className="relative mb-3">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={busca} onChange={e => setBusca(e.target.value)}
              placeholder="Buscar contato..."
              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>
          <div className="flex gap-1">
            {(['abertas', 'todas'] as const).map(f => (
              <button key={f} onClick={() => setFiltro(f)}
                className={`px-3 py-1 rounded-full text-xs font-semibold capitalize transition-colors ${
                  filtro === f ? 'bg-primary text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                {f === 'abertas' ? 'Abertas' : 'Todas'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.map(conv => {
            const contato = contatos[conv.telefone]
            const active = selected?.telefone === conv.telefone
            const nome = resolverNome(conv, contato)
            const hist = conv.historico ?? []
            const lastMsg = hist[hist.length - 1]
            const unread = isUnread(conv)
            return (
              <button key={conv.telefone} onClick={() => selectConv(conv)}
                className={`relative w-full flex items-center gap-3 p-3.5 border-b border-gray-50 hover:bg-gray-50 transition-colors text-left ${
                  active ? 'bg-blue-50' : ''
                }`}
              >
                {active && <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-primary rounded-r" />}
                {unread && !active && <div className="absolute left-1 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-primary" />}
                <div className="relative flex-shrink-0">
                  <ContactAvatar nome={nome} seed={conv.telefone} size={42} fotoUrl={contato?.foto_url} />
                  <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-whatsapp rounded-full flex items-center justify-center">
                    <MessageSquare size={9} className="text-white" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline gap-1">
                    <p className={`text-sm truncate ${unread && !active ? 'font-bold text-gray-900' : 'font-semibold text-gray-800'}`}>{nome}</p>
                    <span className="text-[10px] text-gray-400 flex-shrink-0">{formatDate(conv.atualizado_em)}</span>
                  </div>
                  <p className={`text-xs truncate mt-0.5 ${unread && !active ? 'text-gray-700 font-medium' : 'text-gray-400'}`}>
                    {msgPreview(lastMsg)}
                  </p>
                </div>
              </button>
            )
          })}

          {filtered.length === 0 && (
            <div className="p-8 text-center text-gray-400 text-sm">Nenhuma conversa encontrada</div>
          )}

          {hasMore && (
            <div className="p-3 text-center">
              <button onClick={loadMore} disabled={loadingMore}
                className="text-sm text-primary hover:underline disabled:opacity-50"
              >
                {loadingMore ? 'Carregando...' : 'Carregar mais'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Column 2: Lead details ────────────────────────────────────────────── */}
      <div className="w-72 flex-shrink-0 bg-white border-r border-gray-100 flex flex-col overflow-y-auto">
        {selected ? (
          <>
            <div className="p-4 border-b border-gray-100 flex-shrink-0">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Lead #{formatPhone(selected.telefone)}</p>

              {/* Etapa dropdown */}
              <div className="relative mt-2">
                <button onClick={() => setEtapaOpen(o => !o)}
                  className="flex items-center gap-2 text-sm font-medium rounded-lg px-3 py-1.5 w-full border border-gray-200 hover:bg-gray-50 transition-colors"
                >
                  {currentEtapa ? (
                    <>
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: currentEtapa.cor }} />
                      <span className="flex-1 text-left">{currentEtapa.nome}</span>
                    </>
                  ) : (
                    <span className="flex-1 text-left text-gray-400">Sem etapa</span>
                  )}
                  <ChevronDown size={14} className="text-gray-400 flex-shrink-0" />
                </button>
                {etapaOpen && (
                  <div className="absolute left-0 top-full mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg z-10">
                    <button onClick={() => changeEtapa('')}
                      className="w-full text-left px-3 py-2 text-sm text-gray-500 hover:bg-gray-50"
                    >Sem etapa</button>
                    {etapas.map(e => (
                      <button key={e.id} onClick={() => changeEtapa(e.id)}
                        className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                      >
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: e.cor }} />
                        {e.nome}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {/* Informações */}
              <div className="p-4 border-b border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Informações</p>
                <div className="flex items-center gap-3 mb-3">
                  <ContactAvatar nome={resolverNome(selected, selectedContato)} seed={selected.telefone} size={44} fotoUrl={selectedContato?.foto_url} />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-900 truncate">{resolverNome(selected, selectedContato)}</p>
                    <a href={`https://wa.me/${selected.telefone.replace(/\D/g,'')}`} target="_blank" rel="noreferrer"
                      className="text-xs text-whatsapp hover:underline flex items-center gap-1"
                    >
                      <MessageSquare size={10} />{formatPhone(selected.telefone)}
                    </a>
                  </div>
                </div>

                <div className="space-y-2 text-sm">
                  {selectedContato?.email && (
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400 text-xs">Email</span>
                      <span className="text-gray-700 text-xs truncate max-w-[160px]">{selectedContato.email}</span>
                    </div>
                  )}
                  {selectedContato?.status && (
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400 text-xs">Status</span>
                      <StatusBadge status={selectedContato.status} />
                    </div>
                  )}
                  {selectedContato?.origem && (
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400 text-xs">Origem</span>
                      <span className="text-gray-600 text-xs capitalize">{selectedContato.origem}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400 text-xs">WhatsApp</span>
                    <a href={`https://wa.me/${selected.telefone.replace(/\D/g,'')}`} target="_blank" rel="noreferrer"
                      className="text-xs text-primary hover:underline flex items-center gap-1"
                    >
                      Abrir <ExternalLink size={10} />
                    </a>
                  </div>
                </div>
              </div>

              {/* Tarefas */}
              <div className="p-4 border-b border-gray-100">
                <button onClick={() => setTarefasOpen(o => !o)}
                  className="w-full flex items-center justify-between text-xs font-semibold text-gray-500 uppercase tracking-wide"
                >
                  <span className="flex items-center gap-1.5">
                    <CheckSquare size={12} />Tarefas
                    {tarefas.length > 0 && <span className="bg-gray-100 px-1.5 py-0.5 rounded-full text-gray-500">{tarefas.filter(t=>t.status==='pendente').length}</span>}
                  </span>
                  <ChevronDown size={12} className={`transition-transform ${tarefasOpen ? 'rotate-180' : ''}`} />
                </button>

                {tarefasOpen && (
                  <div className="mt-3 space-y-2">
                    {tarefas.slice(0,5).map(t => (
                      <button key={t.id} onClick={() => toggleTask(t)}
                        className="w-full flex items-start gap-2 text-left"
                      >
                        {t.status === 'concluida'
                          ? <CheckSquare size={14} className="text-green-500 flex-shrink-0 mt-0.5" />
                          : <Square size={14} className="text-gray-300 flex-shrink-0 mt-0.5" />}
                        <span className={`text-xs leading-snug ${t.status === 'concluida' ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                          {t.titulo}
                        </span>
                      </button>
                    ))}
                    {addingTask ? (
                      <div className="space-y-2">
                        <input value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)}
                          placeholder="Título da tarefa"
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                          onKeyDown={e => { if (e.key === 'Enter') createTask() }}
                          autoFocus
                        />
                        <input type="date" value={newTaskDate} onChange={e => setNewTaskDate(e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                        <div className="flex gap-2">
                          <button onClick={createTask} className="flex-1 bg-primary text-white rounded py-1 text-xs">Criar</button>
                          <button onClick={() => setAddingTask(false)} className="flex-1 bg-gray-100 text-gray-600 rounded py-1 text-xs">Cancelar</button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => setAddingTask(true)}
                        className="w-full flex items-center gap-1.5 text-xs text-gray-400 hover:text-primary transition-colors py-1"
                      >
                        <Plus size={12} />Nova tarefa
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Observações */}
              <div className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                    <FileText size={12} />Observações
                  </span>
                  {selectedContato && (
                    <button onClick={() => setEditingObs(o => !o)} className="text-xs text-primary hover:underline">
                      {editingObs ? 'Cancelar' : 'Editar'}
                    </button>
                  )}
                </div>
                {editingObs ? (
                  <div>
                    <textarea value={obs} onChange={e => setObs(e.target.value)} rows={4}
                      className="w-full border border-gray-200 rounded-lg p-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                    />
                    <button onClick={saveObs} disabled={savingObs}
                      className="mt-2 w-full bg-primary text-white rounded-lg py-1.5 text-xs font-semibold hover:bg-primary-dark disabled:opacity-50"
                    >
                      {savingObs ? 'Salvando...' : 'Salvar'}
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-gray-600 leading-relaxed">
                    {obs || <span className="text-gray-400 italic">Sem observações</span>}
                  </p>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <MessageSquare size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">Selecione uma conversa</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Column 3: Chat area ───────────────────────────────────────────────── */}
      {selected ? (
        <div className="flex-1 flex flex-col min-w-0">
          {/* Chat header */}
          <div className="h-14 bg-white border-b border-gray-100 flex items-center px-4 gap-3 flex-shrink-0">
            <ContactAvatar nome={resolverNome(selected, selectedContato)} seed={selected.telefone} size={36} fotoUrl={selectedContato?.foto_url} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-900 truncate">{resolverNome(selected, selectedContato)}</p>
              <p className="text-xs text-gray-400">{formatPhone(selected.telefone)}</p>
            </div>
            <a href={`https://wa.me/${selected.telefone.replace(/\D/g,'')}`} target="_blank" rel="noreferrer"
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-whatsapp/10 text-whatsapp hover:bg-whatsapp/20 transition-colors flex-shrink-0"
              title="Abrir no WhatsApp"
            >
              <ExternalLink size={15} />
            </a>
          </div>

          {/* Hidden file input */}
          <input type="file" ref={fileInputRef} accept="image/*" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleImageSelect(f); e.target.value = '' }}
          />

          {/* Messages */}
          <div className="flex-1 overflow-y-auto bg-[#F0F2F5] p-4 space-y-1"
            onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f?.type.startsWith('image/')) handleImageSelect(f) }}
          >
            {(() => {
              let lastDate = ''
              return (selected.historico ?? []).map((msg, i) => {
                const dateLabel = getDateLabel(msg.timestamp)
                const showSep = dateLabel !== lastDate
                if (showSep) lastDate = dateLabel
                const isOwn = msg.role === 'assistant'
                const audio = isAudioMsg(msg)
                const image = isImageMsg(msg)
                const doc = msg.media_type === 'document'
                const msgId = getMediaMsgId(msg)

                return (
                  <React.Fragment key={i}>
                    {showSep && (
                      <div className="flex items-center gap-2 py-2 my-1">
                        <div className="flex-1 h-px bg-gray-200/80" />
                        <span className="text-[10px] text-gray-500 font-medium bg-[#F0F2F5] px-2 whitespace-nowrap">{dateLabel}</span>
                        <div className="flex-1 h-px bg-gray-200/80" />
                      </div>
                    )}
                    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                      {!isOwn && (
                        <div className="flex-shrink-0 mr-2 mt-1">
                          <ContactAvatar nome={resolverNome(selected, selectedContato)} seed={selected.telefone} size={28} fotoUrl={selectedContato?.foto_url} />
                        </div>
                      )}
                      <div className={`rounded-2xl shadow-sm ${
                        isOwn
                          ? 'bg-[#DCF8C6] text-gray-900 rounded-tr-sm'
                          : 'bg-white text-gray-900 rounded-tl-sm'
                      } ${(audio || image) ? 'p-2' : 'px-3 py-2 max-w-xs lg:max-w-sm xl:max-w-md'}`}>
                        {audio ? (
                          <AudioPlayer messageId={msgId} telefone={selected.telefone} fromMe={isOwn} isOwn={isOwn} />
                        ) : image ? (
                          <ImageMessage messageId={msgId} telefone={selected.telefone} fromMe={isOwn} localDataUrl={localImages[msg.timestamp]} />
                        ) : doc ? (
                          <div className="flex items-center gap-2 py-1 text-sm">
                            <FileText size={16} className="text-gray-500" />
                            <span className="text-gray-600">Documento</span>
                          </div>
                        ) : (
                          <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">{msg.content}</p>
                        )}
                        <div className={`flex items-center justify-end gap-1 mt-0.5 ${audio || image ? 'px-1' : ''}`}>
                          <span className="text-[10px] text-gray-400">{formatTime(msg.timestamp)}</span>
                          {isOwn && <span className="text-[10px] text-gray-400">✓</span>}
                        </div>
                      </div>
                    </div>
                  </React.Fragment>
                )
              })
            })()}
            <div ref={messagesEndRef} />
          </div>

          {/* Image preview */}
          {pendingImage && (
            <div className="bg-gray-50 border-t border-gray-100 px-4 pt-2 pb-1 flex items-center gap-3 flex-shrink-0">
              <img src={pendingImage.dataUrl} alt="Preview" className="w-14 h-14 object-cover rounded-lg border border-gray-200" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-700 truncate">{pendingImage.file.name}</p>
                <p className="text-[10px] text-gray-400">{(pendingImage.file.size / 1024).toFixed(0)} KB</p>
              </div>
              <button onClick={() => setPendingImage(null)} className="text-gray-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition-colors">
                <X size={14} />
              </button>
            </div>
          )}

          {/* Input */}
          <form onSubmit={handleSend} className="bg-white border-t border-gray-100 px-3 py-2.5 flex gap-2 items-center flex-shrink-0">
            {!isRecording && (
              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={sending}
                className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-40 flex-shrink-0"
                title="Enviar imagem"
              >
                <Paperclip size={17} />
              </button>
            )}
            {!isRecording && (
              <input value={text} onChange={e => setText(e.target.value)}
                placeholder={pendingImage ? 'Legenda (opcional)...' : 'Digite uma mensagem...'}
                className="flex-1 border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            )}
            <AudioRecorder onSend={handleSendAudio} onRecordingChange={setIsRecording} disabled={sending} />
            {!isRecording && (
              <button type="submit" disabled={(!text.trim() && !pendingImage) || sending}
                className="bg-primary text-white rounded-xl px-4 py-2 hover:bg-primary-dark transition-colors disabled:opacity-50 flex items-center gap-2 flex-shrink-0"
              >
                <Send size={15} />
                <span className="text-sm font-medium hidden sm:block">Enviar</span>
              </button>
            )}
          </form>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-[#F0F2F5]">
          <div className="text-center text-gray-400">
            <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-3">
              <MessageSquare size={28} className="opacity-50" />
            </div>
            <p className="text-sm font-medium">Selecione uma conversa</p>
            <p className="text-xs text-gray-300 mt-1">para começar a atender</p>
          </div>
        </div>
      )}
    </div>
  )
}
