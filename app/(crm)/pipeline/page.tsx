'use client'
import React, { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { format, parseISO, isToday, isYesterday } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { DndContext, DragOverlay, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { supabase } from '@/lib/supabase'
import { sendTextMessage, sendAudioMessage } from '@/lib/evolution'
import ContactAvatar from '@/components/ContactAvatar'
import AudioPlayer from '@/components/AudioPlayer'
import AudioRecorder from '@/components/AudioRecorder'
import { formatPhone, formatDate, isGroupPhone } from '@/lib/utils'
import { MessageSquare, Users, X, Send, CheckSquare, Square, Plus } from 'lucide-react'
import type { Contato, EtapaFunil, Conversa, Mensagem, Tarefa } from '@/types'

// ─── Helpers ────────────────────────────────────────────────────────────────

function getDateLabel(timestamp: string): string {
  try {
    const d = parseISO(timestamp)
    if (isToday(d)) return 'Hoje'
    if (isYesterday(d)) return 'Ontem'
    return format(d, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
  } catch { return '' }
}

function msgTime(timestamp: string): string {
  try { return format(parseISO(timestamp), 'HH:mm') } catch { return '' }
}

// ─── KanbanCard ─────────────────────────────────────────────────────────────

function KanbanCard({ contato, ultimaMensagem, onClick }: {
  contato: Contato
  ultimaMensagem?: string
  onClick: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: contato.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className="bg-white rounded-lg p-3 shadow-sm border border-gray-100 cursor-pointer hover:shadow-md transition-shadow"
    >
      <div className="flex items-center gap-2 mb-2">
        <ContactAvatar nome={contato.nome} seed={contato.telefone} size={32} />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{contato.nome ?? 'Sem nome'}</p>
          <p className="text-xs text-gray-400">{formatPhone(contato.telefone)}</p>
        </div>
      </div>
      {ultimaMensagem && <p className="text-xs text-gray-500 truncate">{ultimaMensagem}</p>}
      <p className="text-xs text-gray-400 mt-1">{formatDate(contato.atualizado_em)}</p>
    </div>
  )
}

// ─── GroupCard ──────────────────────────────────────────────────────────────

function GroupCard({ contato, ultimaMensagem, onOpen }: {
  contato: Contato
  ultimaMensagem?: string
  onOpen: () => void
}) {
  return (
    <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm hover:shadow-md transition-shadow flex flex-col">
      <div className="flex items-start gap-3">
        <ContactAvatar nome={contato.nome} seed={contato.telefone} size={48} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{contato.nome ?? 'Grupo'}</p>
          <p className="text-xs text-gray-400 truncate mt-0.5 font-mono">
            {contato.telefone.slice(0, 20)}{contato.telefone.length > 20 ? '…' : ''}
          </p>
          {ultimaMensagem && (
            <p className="text-xs text-gray-500 truncate mt-1.5 italic">"{ultimaMensagem}"</p>
          )}
          <p className="text-xs text-gray-400 mt-1">{formatDate(contato.atualizado_em)}</p>
        </div>
      </div>
      <button
        onClick={onOpen}
        className="mt-3 w-full text-xs font-semibold text-accent hover:text-blue-700 border border-accent/40 hover:border-accent rounded-lg py-1.5 transition-colors flex items-center justify-center gap-1.5"
      >
        <MessageSquare size={12} />
        Abrir conversa
      </button>
    </div>
  )
}

// ─── ContactPanel ────────────────────────────────────────────────────────────

function ContactPanel({ contato, onClose, onUpdate }: {
  contato: Contato
  onClose: () => void
  onUpdate: (updated: Partial<Contato>) => void
}) {
  type PanelTab = 'conversa' | 'detalhes' | 'tarefas'
  const [panelTab, setPanelTab] = useState<PanelTab>('conversa')

  // Conversa
  const [conversa, setConversa] = useState<Conversa | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [msgTexto, setMsgTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  function isAudioMsg(msg: Mensagem) {
    return msg.media_type === 'audio' || msg.media_type === 'ptt' ||
      msg.content.startsWith('[audio]') || msg.content.startsWith('[ptt]')
  }

  function getAudioMsgId(msg: Mensagem): string | undefined {
    if (msg.message_id) return msg.message_id
    const m = msg.content.match(/^\[(?:audio|ptt):([^\]]+)\]/)
    return m?.[1]
  }

  // Detalhes
  const [editNome, setEditNome]     = useState(contato.nome ?? '')
  const [editEmail, setEditEmail]   = useState(contato.email ?? '')
  const [editStatus, setEditStatus] = useState(contato.status ?? '')
  const [editObs, setEditObs]       = useState(contato.observacoes ?? '')
  const [salvando, setSalvando]     = useState(false)
  const [salvoOk, setSalvoOk]       = useState(false)

  // Tarefas
  const [tarefas, setTarefas]           = useState<Tarefa[]>([])
  const [novaTarefaOpen, setNovaTarefaOpen] = useState(false)
  const [novaTitulo, setNovaTitulo]     = useState('')
  const [novaData, setNovaData]         = useState('')

  // Carrega dados ao abrir/trocar contato
  useEffect(() => {
    setPanelTab('conversa')
    setMsgTexto('')
    setEditNome(contato.nome ?? '')
    setEditEmail(contato.email ?? '')
    setEditStatus(contato.status ?? '')
    setEditObs(contato.observacoes ?? '')
    loadConversa()
    loadTarefas()
  }, [contato.id])

  // Auto-scroll ao fim das mensagens
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [conversa?.historico?.length])

  async function loadConversa() {
    setCarregando(true)
    const { data } = await supabase
      .from('conversas')
      .select('*')
      .eq('telefone', contato.telefone)
      .maybeSingle()
    setConversa(data as Conversa | null)
    setCarregando(false)
  }

  async function loadTarefas() {
    const { data } = await supabase
      .from('tarefas')
      .select('*')
      .eq('contato_id', contato.id)
      .order('criado_em', { ascending: false })
    if (data) setTarefas(data as Tarefa[])
  }

  async function handleEnviarMsg(e: React.FormEvent) {
    e.preventDefault()
    if (!msgTexto.trim() || enviando) return
    setEnviando(true)
    const text = msgTexto.trim()
    const agora = new Date().toISOString()
    const novaMensagem: Mensagem = { role: 'assistant', content: text, timestamp: agora }
    const prevHistorico = conversa?.historico ?? []
    const novoHistorico = [...prevHistorico, novaMensagem]

    // Optimistic update
    setConversa(prev => ({
      id: prev?.id ?? '',
      nome: prev?.nome ?? contato.nome,
      telefone: contato.telefone,
      historico: novoHistorico,
      atualizado_em: agora,
    }))
    setMsgTexto('')

    try {
      await sendTextMessage(contato.telefone, text)
      await supabase.from('conversas').upsert({
        telefone: contato.telefone,
        historico: novoHistorico,
        atualizado_em: agora,
      }, { onConflict: 'telefone' })
    } catch {
      alert('Erro ao enviar mensagem')
      setConversa(prev => prev ? { ...prev, historico: prevHistorico } : null)
      setMsgTexto(text)
    } finally {
      setEnviando(false)
    }
  }

  async function salvarDetalhes() {
    setSalvando(true)
    const patch = {
      nome:        editNome  || null,
      email:       editEmail || null,
      status:      editStatus || null,
      observacoes: editObs   || null,
    }
    await supabase.from('crm_contatos').update(patch).eq('id', contato.id)
    setSalvando(false)
    setSalvoOk(true)
    setTimeout(() => setSalvoOk(false), 2000)
    onUpdate(patch)
  }

  async function handleSendAudio(base64: string) {
    await sendAudioMessage(contato.telefone, base64)
    const agora = new Date().toISOString()
    const novaMensagem: Mensagem = { role: 'assistant', content: '[ptt]', media_type: 'ptt', timestamp: agora }
    const prevHistorico = conversa?.historico ?? []
    const novoHistorico = [...prevHistorico, novaMensagem]
    setConversa(prev => ({
      id: prev?.id ?? '', nome: prev?.nome ?? contato.nome, telefone: contato.telefone,
      historico: novoHistorico, atualizado_em: agora,
    }))
    await supabase.from('conversas').upsert({
      telefone: contato.telefone, historico: novoHistorico, atualizado_em: agora,
    }, { onConflict: 'telefone' })
  }

  async function criarTarefa() {
    if (!novaTitulo.trim()) return
    const { data } = await supabase
      .from('tarefas')
      .insert({
        contato_id: contato.id,
        titulo: novaTitulo.trim(),
        vencimento: novaData || null,
        status: 'pendente',
      })
      .select()
      .single()
    if (data) setTarefas(prev => [data as Tarefa, ...prev])
    setNovaTarefaOpen(false)
    setNovaTitulo('')
    setNovaData('')
  }

  async function toggleTarefa(tarefa: Tarefa) {
    const novoStatus = tarefa.status === 'concluida' ? 'pendente' : 'concluida'
    setTarefas(prev => prev.map(t => t.id === tarefa.id ? { ...t, status: novoStatus } : t))
    await supabase.from('tarefas').update({ status: novoStatus }).eq('id', tarefa.id)
  }

  const historico = conversa?.historico ?? []
  const tabLabels: Record<PanelTab, string> = {
    conversa: 'Conversa',
    detalhes: 'Detalhes',
    tarefas:  tarefas.length > 0 ? `Tarefas (${tarefas.length})` : 'Tarefas',
  }

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />

      {/* Painel */}
      <div className="fixed right-0 top-0 h-full w-[420px] bg-white shadow-2xl z-50 flex flex-col">

        {/* ── Header do contato ── */}
        <div className="flex-shrink-0 p-4 border-b border-gray-100">
          <div className="flex items-start gap-3">
            <ContactAvatar nome={contato.nome} seed={contato.telefone} size={48} />
            <div className="flex-1 min-w-0">
              <p className="text-base font-bold text-gray-900 truncate">{editNome || contato.nome || 'Sem nome'}</p>
              <p className="text-sm text-gray-500">{formatPhone(contato.telefone)}</p>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {(editStatus || contato.status) && (
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full capitalize">
                    {editStatus || contato.status}
                  </span>
                )}
                {contato.origem && (
                  <span className="text-xs bg-blue-50 text-accent px-2 py-0.5 rounded-full capitalize">
                    {contato.origem}
                  </span>
                )}
              </div>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 flex-shrink-0 mt-0.5 p-1 rounded-lg hover:bg-gray-100 transition-colors">
              <X size={18} />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex mt-4 bg-gray-100 rounded-lg p-0.5 gap-0.5">
            {(['conversa', 'detalhes', 'tarefas'] as PanelTab[]).map(t => (
              <button
                key={t}
                onClick={() => setPanelTab(t)}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${
                  panelTab === t
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tabLabels[t]}
              </button>
            ))}
          </div>
        </div>

        {/* ── Aba: Conversa ── */}
        {panelTab === 'conversa' && (
          <>
            <div className="flex-1 overflow-y-auto p-3 space-y-1 bg-[#F0F2F5]">
              {carregando ? (
                <div className="flex justify-center py-10">
                  <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                </div>
              ) : historico.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-gray-400">
                  <MessageSquare size={32} className="mb-2 opacity-30" />
                  <p className="text-sm">Nenhuma mensagem ainda</p>
                </div>
              ) : (() => {
                let lastDate = ''
                return historico.map((msg, i) => {
                  const dateLabel = getDateLabel(msg.timestamp)
                  const showSep = dateLabel !== lastDate
                  if (showSep) lastDate = dateLabel
                  return (
                    <React.Fragment key={i}>
                      {showSep && (
                        <div className="flex items-center gap-2 py-2">
                          <div className="flex-1 h-px bg-gray-200/80" />
                          <span className="text-[10px] text-gray-500 font-medium bg-[#F0F2F5] px-2 whitespace-nowrap">
                            {dateLabel}
                          </span>
                          <div className="flex-1 h-px bg-gray-200/80" />
                        </div>
                      )}
                      <div className={`flex ${msg.role === 'assistant' ? 'justify-end' : 'justify-start'}`}>
                        {(() => {
                          const audio = isAudioMsg(msg)
                          const msgId = getAudioMsgId(msg)
                          return (
                            <div className={`rounded-2xl px-3 py-2 shadow-sm ${
                              msg.role === 'assistant'
                                ? 'bg-[#DCF8C6] text-gray-900 rounded-tr-sm'
                                : 'bg-white text-gray-900 rounded-tl-sm'
                            } ${audio ? '' : 'max-w-[82%]'}`}>
                              {audio ? (
                                <AudioPlayer
                                  messageId={msgId}
                                  isOwn={msg.role === 'assistant'}
                                  darkBg={false}
                                />
                              ) : (
                                <p className="text-sm whitespace-pre-wrap break-words leading-snug">{msg.content}</p>
                              )}
                              <p className="text-[10px] text-gray-400 mt-0.5 text-right">{msgTime(msg.timestamp)}</p>
                            </div>
                          )
                        })()}
                      </div>
                    </React.Fragment>
                  )
                })
              })()}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleEnviarMsg} className="flex-shrink-0 p-3 bg-white border-t border-gray-100 flex gap-2 items-center">
              {!isRecording && (
                <input
                  value={msgTexto}
                  onChange={e => setMsgTexto(e.target.value)}
                  placeholder="Digite uma mensagem..."
                  className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
                />
              )}
              <AudioRecorder
                onSend={handleSendAudio}
                onRecordingChange={setIsRecording}
                disabled={enviando}
              />
              {!isRecording && (
                <button
                  type="submit"
                  disabled={!msgTexto.trim() || enviando}
                  className="bg-accent text-white rounded-xl px-3 py-2.5 hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center"
                >
                  <Send size={15} />
                </button>
              )}
            </form>
          </>
        )}

        {/* ── Aba: Detalhes ── */}
        {panelTab === 'detalhes' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Nome</label>
              <input
                value={editNome}
                onChange={e => setEditNome(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Email</label>
              <input
                type="email"
                value={editEmail}
                onChange={e => setEditEmail(e.target.value)}
                placeholder="email@exemplo.com"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Status</label>
              <select
                value={editStatus}
                onChange={e => setEditStatus(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent bg-white"
              >
                <option value="">Sem status</option>
                <option value="lead">Lead</option>
                <option value="qualificado">Qualificado</option>
                <option value="cliente">Cliente</option>
                <option value="perdido">Perdido</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Observações</label>
              <textarea
                value={editObs}
                onChange={e => setEditObs(e.target.value)}
                rows={6}
                placeholder="Notas sobre o contato..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent resize-none"
              />
            </div>
            <button
              onClick={salvarDetalhes}
              disabled={salvando}
              className={`w-full rounded-lg py-2.5 text-sm font-semibold transition-all ${
                salvoOk
                  ? 'bg-green-500 text-white'
                  : 'bg-accent text-white hover:bg-blue-700 disabled:opacity-50'
              }`}
            >
              {salvoOk ? '✓ Salvo com sucesso!' : salvando ? 'Salvando…' : 'Salvar alterações'}
            </button>
          </div>
        )}

        {/* ── Aba: Tarefas ── */}
        {panelTab === 'tarefas' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {tarefas.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-36 text-gray-400">
                  <CheckSquare size={32} className="mb-2 opacity-30" />
                  <p className="text-sm">Nenhuma tarefa</p>
                </div>
              ) : (
                tarefas.map(tarefa => (
                  <div
                    key={tarefa.id}
                    className="flex items-start gap-3 bg-gray-50 hover:bg-gray-100 rounded-xl p-3 transition-colors"
                  >
                    <button
                      onClick={() => toggleTarefa(tarefa)}
                      className="mt-0.5 flex-shrink-0 text-gray-400 hover:text-green-500 transition-colors"
                    >
                      {tarefa.status === 'concluida'
                        ? <CheckSquare size={18} className="text-green-500" />
                        : <Square size={18} />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium leading-snug ${
                        tarefa.status === 'concluida' ? 'line-through text-gray-400' : 'text-gray-800'
                      }`}>
                        {tarefa.titulo}
                      </p>
                      {tarefa.vencimento && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          Vencimento: {format(parseISO(tarefa.vencimento), 'dd/MM/yyyy')}
                        </p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex-shrink-0 p-4 border-t border-gray-100">
              <button
                onClick={() => setNovaTarefaOpen(true)}
                className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 text-gray-500 hover:border-accent hover:text-accent rounded-xl py-3 text-sm font-medium transition-colors"
              >
                <Plus size={16} />
                Nova tarefa
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Modal nova tarefa ── */}
      {novaTarefaOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]" onClick={() => setNovaTarefaOpen(false)}>
          <div className="bg-white rounded-2xl p-5 w-80 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-gray-900 mb-4">Nova Tarefa</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Título</label>
                <input
                  autoFocus
                  value={novaTitulo}
                  onChange={e => setNovaTitulo(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') criarTarefa() }}
                  placeholder="O que precisa ser feito?"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Vencimento <span className="font-normal text-gray-400">(opcional)</span>
                </label>
                <input
                  type="date"
                  value={novaData}
                  onChange={e => setNovaData(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => { setNovaTarefaOpen(false); setNovaTitulo(''); setNovaData('') }}
                className="flex-1 border border-gray-200 text-gray-600 rounded-lg py-2 text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={criarTarefa}
                disabled={!novaTitulo.trim()}
                className="flex-1 bg-accent text-white rounded-lg py-2 text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                Criar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ─── PipelinePage ────────────────────────────────────────────────────────────

export default function PipelinePage() {
  const router = useRouter()
  const [tab, setTab] = useState<'funil' | 'grupos'>('funil')
  const [etapas, setEtapas] = useState<EtapaFunil[]>([])
  const [contatos, setContatos] = useState<Contato[]>([])
  const [conversas, setConversas] = useState<Record<string, Conversa>>({})
  const [activeId, setActiveId] = useState<string | null>(null)
  const [detalhes, setDetalhes] = useState<Contato | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const [{ data: etapaData }, { data: contatoData }, { data: convData }] = await Promise.all([
      supabase.from('etapas_funil').select('*').order('ordem'),
      supabase.from('crm_contatos').select('*').order('atualizado_em', { ascending: false }),
      supabase.from('conversas').select('telefone, historico, atualizado_em'),
    ])
    if (etapaData) setEtapas(etapaData as EtapaFunil[])
    if (contatoData) setContatos(contatoData as Contato[])
    if (convData) {
      const map: Record<string, Conversa> = {}
      ;(convData as Conversa[]).forEach(c => { map[c.telefone] = c })
      setConversas(map)
    }
  }

  function getContatosByEtapa(etapaId: string) {
    return contatosFunil.filter(c => c.etapa_funil_id === etapaId)
  }

  function getUltimaMensagem(telefone: string) {
    const conv = conversas[telefone]
    if (!conv?.historico?.length) return undefined
    return conv.historico[conv.historico.length - 1].content
  }

  async function handleDragEnd(event: any) {
    const { active, over } = event
    setActiveId(null)
    if (!over || active.id === over.id) return
    const targetEtapaId =
      etapas.find(e => e.id === over.id)?.id ??
      contatos.find(c => c.id === over.id)?.etapa_funil_id
    if (!targetEtapaId) return
    const contato = contatos.find(c => c.id === active.id)
    if (!contato || contato.etapa_funil_id === targetEtapaId) return
    setContatos(prev => prev.map(c => c.id === active.id ? { ...c, etapa_funil_id: targetEtapaId } : c))
    await supabase.from('crm_contatos').update({ etapa_funil_id: targetEtapaId }).eq('id', active.id)
  }

  function handleContatoUpdate(id: string, patch: Partial<Contato>) {
    setContatos(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c))
    // Atualiza o painel aberto também
    setDetalhes(prev => prev?.id === id ? { ...prev, ...patch } : prev)
  }

  const contatosFunil = contatos.filter(c => !isGroupPhone(c.telefone))
  const contatosGrupo = contatos.filter(c => isGroupPhone(c.telefone))
  const activeContato = activeId ? contatosFunil.find(c => c.id === activeId) : null

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-6 pb-0 flex-shrink-0">
        <div className="flex items-end justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Pipeline</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {tab === 'funil'
                ? `${contatosFunil.length} contatos no funil`
                : `${contatosGrupo.length} grupo${contatosGrupo.length !== 1 ? 's' : ''} do WhatsApp`}
            </p>
          </div>
        </div>

        {/* Tabs funil/grupos */}
        <div className="flex gap-1 border-b border-gray-200">
          {([
            { key: 'funil'  as const, label: 'Funil',  count: contatosFunil.length, icon: null },
            { key: 'grupos' as const, label: 'Grupos', count: contatosGrupo.length, icon: <Users size={14} /> },
          ]).map(({ key, label, count, icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                tab === key
                  ? 'border-accent text-accent'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {icon}
              <span>{label}</span>
              <span className={`text-xs rounded-full px-1.5 py-0.5 ${
                tab === key ? 'bg-accent/10 text-accent' : 'bg-gray-100 text-gray-500'
              }`}>{count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab: Funil ── */}
      {tab === 'funil' && (
        <div className="flex-1 overflow-x-auto px-6 py-4">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={e => setActiveId(e.active.id as string)}
            onDragEnd={handleDragEnd}
          >
            <div className="flex gap-4 h-full" style={{ minWidth: etapas.length * 280 }}>
              {etapas.map(etapa => {
                const cards = getContatosByEtapa(etapa.id)
                return (
                  <div key={etapa.id} className="w-64 flex-shrink-0 flex flex-col">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: etapa.cor }} />
                      <h2 className="text-sm font-semibold text-gray-700">{etapa.nome}</h2>
                      <span className="ml-auto bg-gray-100 text-gray-500 text-xs font-medium px-2 py-0.5 rounded-full">{cards.length}</span>
                    </div>
                    <div className="flex-1 bg-gray-100/60 rounded-xl p-2 space-y-2 overflow-y-auto min-h-32">
                      <SortableContext items={cards.map(c => c.id)} strategy={verticalListSortingStrategy}>
                        {cards.map(contato => (
                          <KanbanCard
                            key={contato.id}
                            contato={contato}
                            ultimaMensagem={getUltimaMensagem(contato.telefone)}
                            onClick={() => setDetalhes(contato)}
                          />
                        ))}
                      </SortableContext>
                      {cards.length === 0 && (
                        <div className="flex items-center justify-center h-16 text-xs text-gray-400">Sem contatos</div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            <DragOverlay>
              {activeContato && (
                <div className="bg-white rounded-lg p-3 shadow-lg border border-gray-200 rotate-2 w-64">
                  <div className="flex items-center gap-2">
                    <ContactAvatar nome={activeContato.nome} seed={activeContato.telefone} size={32} />
                    <p className="text-sm font-semibold">{activeContato.nome}</p>
                  </div>
                </div>
              )}
            </DragOverlay>
          </DndContext>
        </div>
      )}

      {/* ── Tab: Grupos ── */}
      {tab === 'grupos' && (
        <div className="flex-1 overflow-y-auto p-6">
          {contatosGrupo.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-400">
              <Users size={32} className="mb-2 opacity-40" />
              <p className="text-sm">Nenhum grupo encontrado</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {contatosGrupo.map(contato => (
                <GroupCard
                  key={contato.id}
                  contato={contato}
                  ultimaMensagem={getUltimaMensagem(contato.telefone)}
                  onOpen={() => router.push('/inbox')}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Painel de detalhes ── */}
      {detalhes && (
        <ContactPanel
          contato={detalhes}
          onClose={() => setDetalhes(null)}
          onUpdate={patch => handleContatoUpdate(detalhes.id, patch)}
        />
      )}
    </div>
  )
}
