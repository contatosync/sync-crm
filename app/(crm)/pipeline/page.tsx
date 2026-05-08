'use client'
import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import {
  DndContext, useDraggable, useDroppable, DragOverlay,
  PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import {
  X, Plus, Send, Paperclip, LayoutGrid, List as ListIcon,
  Search, MoreHorizontal, Zap, Check, CheckCheck,
  ChevronLeft, ChevronRight, ExternalLink, MessageSquare,
} from 'lucide-react'
import { isPast, isToday, parseISO } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { sendText, sendAudio, sendImage } from '@/lib/evolution'
import { formatPhone, formatDate, getDateLabel, nomeValido, parseMsgPreview } from '@/lib/utils'
import ContactAvatar from '@/components/ContactAvatar'
import AudioRecorder from '@/components/AudioRecorder'
import AudioPlayer from '@/components/AudioPlayer'
import ImageMessage from '@/components/ImageMessage'
import type { Contato, Conversa, EtapaFunil, Mensagem, Tarefa } from '@/types'

/* ─────────── helpers ─────────── */
const STATUS_DOT: Record<string, string> = {
  ativo: '#22C55E', qualificado: '#EAB308',
  ganho: '#8B5CF6', perdido: '#EF4444', novo: '#3B82F6',
}

function getValor(c: Contato): number {
  return Number((c.campos_custom as Record<string, unknown>)?.valor ?? 0) || 0
}

function fmtBRL(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 })
}

function getMediaMsgId(msg: Mensagem): string | undefined {
  return msg.messageId ?? msg.message_id ?? (() => {
    const m = msg.content?.match(/^\[(?:audio|ptt|image|document):([^\]]+)\]/)
    return m?.[1]
  })()
}
function isAudioMsg(msg: Mensagem) {
  return msg.media_type === 'audio' || msg.media_type === 'ptt' ||
    !!(msg.content?.startsWith('[audio') || msg.content?.startsWith('[ptt'))
}
function isImageMsg(msg: Mensagem) {
  return msg.media_type === 'image' || !!(msg.content?.startsWith('[image'))
}
function getMsgPreview(msg: Mensagem | undefined): string {
  return parseMsgPreview(msg).slice(0, 40)
}

/* ─────────── Card body (shared) ─────────── */
interface CardProps { contato: Contato; conv?: Conversa; tasks: Tarefa[] }

function CardBody({ contato, conv, tasks }: CardProps) {
  const lastMsg = conv?.historico?.[conv.historico.length - 1]
  const nextTask = tasks.find(t => t.status === 'pendente')
  const dot = STATUS_DOT[contato.status ?? ''] ?? '#9CA3AF'

  return (
    <>
      <div className="flex items-start justify-between gap-2 mb-1">
        <p className="text-sm font-bold text-blue-600 truncate leading-snug">
          {nomeValido(contato.nome, contato.telefone) ? contato.nome! : formatPhone(contato.telefone)}
        </p>
        <span className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5" style={{ backgroundColor: dot }} />
      </div>
      <p className="text-[10px] text-gray-400 mb-2">Lead #{contato.id.slice(-6)}</p>

      {nextTask ? (
        <div className="flex items-center gap-1 mb-2">
          <span className="text-[10px] font-medium text-blue-500 truncate">{nextTask.titulo}</span>
          {nextTask.vencimento && (
            <span className={`text-[10px] flex-shrink-0 ${
              isPast(parseISO(nextTask.vencimento)) && !isToday(parseISO(nextTask.vencimento))
                ? 'text-red-500' : 'text-blue-400'
            }`}>
              {new Date(nextTask.vencimento).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
            </span>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-1 mb-2">
          <span className="text-[10px] font-medium text-orange-400">Sem Tarefas</span>
          <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />
        </div>
      )}

      {getMsgPreview(lastMsg) === '—'
        ? <p className="text-[11px] text-gray-300 italic truncate">—</p>
        : <p className="text-[11px] text-gray-400 truncate">{getMsgPreview(lastMsg)}</p>
      }
      {conv && <p className="text-[10px] text-gray-300 text-right mt-1.5">{formatDate(conv.atualizado_em)}</p>}
    </>
  )
}

/* ─────────── Kanban card (draggable) ─────────── */
function KanbanCard({ contato, conv, tasks, onClick }: CardProps & { onClick: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: contato.id })
  return (
    <div
      ref={setNodeRef} {...listeners} {...attributes} onClick={onClick}
      style={{ opacity: isDragging ? 0 : 1 }}
      className="bg-white rounded-lg p-3 shadow-sm border border-gray-100 cursor-grab active:cursor-grabbing hover:shadow-md transition-all mb-2"
    >
      <CardBody contato={contato} conv={conv} tasks={tasks} />
    </div>
  )
}

/* ─────────── Drag overlay ghost ─────────── */
function KanbanCardGhost({ contato, conv, tasks }: CardProps) {
  return (
    <div className="bg-white rounded-lg p-3 shadow-2xl border border-blue-200 rotate-1 scale-105 cursor-grabbing">
      <CardBody contato={contato} conv={conv} tasks={tasks} />
    </div>
  )
}

/* ─────────── Droppable column ─────────── */
function DroppableColumn({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div ref={setNodeRef} className="min-h-[80px] rounded-xl transition-colors"
      style={{ backgroundColor: isOver ? 'rgba(37,99,235,0.06)' : undefined }}>
      {children}
    </div>
  )
}

/* ─────────── Contact panel ─────────── */
interface PanelProps {
  contato: Contato; etapas: EtapaFunil[]
  onClose: () => void; onUpdate: (c: Contato) => void; onDelete: (id: string) => void
}

function ContactPanel({ contato, etapas, onClose, onUpdate, onDelete }: PanelProps) {
  const [tab, setTab] = useState<'conversa' | 'detalhes' | 'tarefas'>('conversa')
  const [localConv, setLocalConv] = useState<Conversa | null>(null)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [pendingImage, setPendingImage] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isRecording, setIsRecording] = useState(false)

  const [nome, setNome] = useState(contato.nome ?? '')
  const [email, setEmail] = useState(contato.email ?? '')
  const [empresa, setEmpresa] = useState(
    ((contato.campos_custom as Record<string, unknown>)?.empresa as string) ?? ''
  )
  const [valor, setValor] = useState(
    String((contato.campos_custom as Record<string, unknown>)?.valor ?? '')
  )
  const [status, setStatus] = useState(contato.status ?? '')
  const [etapaId, setEtapaId] = useState(contato.etapa_funil_id ?? '')
  const [localEtapaId, setLocalEtapaId] = useState(contato.etapa_funil_id ?? '')
  const [obs, setObs] = useState(contato.observacoes ?? '')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  const [tarefas, setTarefas] = useState<Tarefa[]>([])
  const [novaTarefa, setNovaTarefa] = useState('')
  const [vencimento, setVencimento] = useState('')
  const [showAddTask, setShowAddTask] = useState(false)

  const fileRef = useRef<HTMLInputElement>(null)
  const msgsEndRef = useRef<HTMLDivElement>(null)
  const textAreaRef = useRef<HTMLTextAreaElement>(null)

  /* sync local display state when prop changes (e.g. after parent re-renders) */
  useEffect(() => {
    setLocalEtapaId(contato.etapa_funil_id ?? '')
    setEtapaId(contato.etapa_funil_id ?? '')
    setStatus(contato.status ?? '')
    setNome(contato.nome ?? '')
    setEmail(contato.email ?? '')
    setObs(contato.observacoes ?? '')
  }, [contato.id, contato.etapa_funil_id, contato.status, contato.nome, contato.email, contato.observacoes])

  useEffect(() => {
    supabase.from('conversas').select('*').eq('telefone', contato.telefone).maybeSingle()
      .then(({ data }) => { if (data) setLocalConv(data as Conversa) })

    const ch = supabase.channel(`panel-${contato.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversas' }, payload => {
        const row = payload.new as Conversa
        if (row?.telefone === contato.telefone) setLocalConv(row)
      }).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [contato.telefone, contato.id])

  useEffect(() => {
    supabase.from('tarefas').select('*').eq('contato_id', contato.id)
      .order('criado_em', { ascending: false })
      .then(({ data }) => { if (data) setTarefas(data as Tarefa[]) })
  }, [contato.id])

  useEffect(() => { msgsEndRef.current?.scrollIntoView() }, [localConv?.historico?.length])

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    const msgText = text.trim()
    if (!msgText && !pendingImage) return
    setSending(true)
    try {
      if (pendingImage) { await sendImage(contato.telefone, pendingImage); setPendingImage(null) }
      if (msgText) {
        await sendText(contato.telefone, msgText)
        setText('')
        const newMsg: Mensagem = { role: 'assistant', content: msgText, timestamp: new Date().toISOString() }
        const novoHist = [...((localConv?.historico ?? []) as Mensagem[]), newMsg]
        const now = new Date().toISOString()
        await supabase.from('conversas').upsert(
          { telefone: contato.telefone, nome: contato.nome ?? null, historico: novoHist, atualizado_em: now },
          { onConflict: 'telefone' }
        )
        setLocalConv(prev => prev
          ? { ...prev, historico: novoHist, atualizado_em: now }
          : { id: '', telefone: contato.telefone, nome: contato.nome ?? null, historico: novoHist, atualizado_em: now }
        )
      }
    } catch { /* noop */ }
    setSending(false)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return
    const r = new FileReader(); r.onloadend = () => setPendingImage(r.result as string); r.readAsDataURL(f)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setIsDragging(false)
    const f = e.dataTransfer.files[0]; if (!f?.type.startsWith('image/')) return
    const r = new FileReader(); r.onloadend = () => setPendingImage(r.result as string); r.readAsDataURL(f)
  }

  /* helper — optimistic update: UI reflects change immediately */
  function applyUpdate(updates: Partial<Contato>) {
    onUpdate({ ...contato, ...updates })
  }

  async function saveDetails() {
    setSaving(true); setSaveMsg('')
    const campos = { ...(contato.campos_custom as Record<string, unknown> ?? {}), empresa, valor: Number(valor) || 0 }
    /* optimistic — kanban and header update immediately */
    applyUpdate({ nome, email, status, etapa_funil_id: etapaId || null, observacoes: obs, campos_custom: campos })
    const { error } = await supabase.from('crm_contatos')
      .update({ nome, email, status, etapa_funil_id: etapaId || null, observacoes: obs, campos_custom: campos, atualizado_em: new Date().toISOString() })
      .eq('id', contato.id)
    setSaveMsg(error ? 'Erro ao salvar' : '✓ Salvo!')
    setSaving(false)
    setTimeout(() => setSaveMsg(''), 2000)
  }

  async function changeStatus(newStatus: string) {
    /* optimistic */
    applyUpdate({ status: newStatus })
    supabase.from('crm_contatos')
      .update({ status: newStatus, atualizado_em: new Date().toISOString() })
      .eq('id', contato.id).then(() => { /* background */ })
    /* close panel after brief delay so user sees the badge change */
    setTimeout(onClose, 600)
  }

  async function changeEtapa(newEtapaId: string) {
    setLocalEtapaId(newEtapaId)
    setEtapaId(newEtapaId)
    /* optimistic */
    applyUpdate({ etapa_funil_id: newEtapaId || null })
    supabase.from('crm_contatos')
      .update({ etapa_funil_id: newEtapaId || null, atualizado_em: new Date().toISOString() })
      .eq('id', contato.id).then(() => { /* background */ })
  }

  async function deleteContato() {
    if (!window.confirm('Deletar este contato permanentemente? Esta ação não pode ser desfeita.')) return
    await supabase.from('crm_contatos').delete().eq('id', contato.id)
    onDelete(contato.id)
    onClose()
  }

  async function addTarefa() {
    if (!novaTarefa.trim()) return
    const { data } = await supabase.from('tarefas')
      .insert({ titulo: novaTarefa.trim(), contato_id: contato.id, status: 'pendente', vencimento: vencimento || null })
      .select().single()
    if (data) { setTarefas(prev => [data as Tarefa, ...prev]); setNovaTarefa(''); setVencimento(''); setShowAddTask(false) }
  }

  async function toggleTarefa(t: Tarefa) {
    const ns = t.status === 'pendente' ? 'concluida' : 'pendente'
    await supabase.from('tarefas').update({ status: ns }).eq('id', t.id)
    setTarefas(prev => prev.map(x => x.id === t.id ? { ...x, status: ns } : x))
  }

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

  const etapaBadge = etapas.find(e => e.id === localEtapaId)

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-screen w-[400px] bg-white shadow-2xl z-50 flex flex-col border-l border-gray-200">

        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3 flex-shrink-0">
          <ContactAvatar nome={contato.nome} telefone={contato.telefone} fotoUrl={contato.foto_url} size={44} />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900 truncate">{nomeValido(contato.nome, contato.telefone) ? contato.nome! : formatPhone(contato.telefone)}</p>
            <p className="text-xs text-gray-400">{formatPhone(contato.telefone)}</p>
          </div>
          <a href={`https://wa.me/${contato.telefone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer"
            className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-green-500 transition-colors">
            <ExternalLink size={15} />
          </a>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Etapa select + ações rápidas */}
        <div className="px-3 py-2 border-b border-gray-100 flex-shrink-0 flex items-center gap-2">
          <select value={localEtapaId} onChange={e => changeEtapa(e.target.value)}
            className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-primary bg-white text-gray-700 font-medium">
            <option value="">Sem etapa</option>
            {etapas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </select>
          <button onClick={() => changeStatus('qualificado')} title="Aceitar (qualificado)"
            className="text-xs font-bold px-2.5 py-1.5 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 transition-colors">
            ✓
          </button>
          <button onClick={() => changeStatus('perdido')} title="Fechar (perdido)"
            className="text-xs font-bold px-2.5 py-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors">
            ✕
          </button>
          <button onClick={deleteContato} title="Deletar contato"
            className="text-xs font-bold px-2.5 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors">
            🗑
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 flex-shrink-0">
          {(['conversa', 'detalhes', 'tarefas'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-sm font-medium capitalize transition-colors ${
                tab === t ? 'text-primary border-b-2 border-primary' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* ── Conversa ── */}
        {tab === 'conversa' && (
          <>
            <div className="flex-1 overflow-y-auto px-3 py-3 bg-[#F0F2F5]"
              onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)} onDrop={handleDrop}
              style={isDragging ? { backgroundColor: 'rgba(37,99,235,0.04)' } : undefined}>
              {groupByDate(localConv?.historico ?? []).map((g, gi) => (
                <div key={gi}>
                  <div className="flex justify-center my-3">
                    <span className="text-[11px] text-gray-500 bg-white px-3 py-1 rounded-full shadow-sm">{g.label}</span>
                  </div>
                  {g.msgs.map((msg, i) => {
                    const isOwn = msg.role === 'assistant'
                    const msgId = getMediaMsgId(msg)
                    return (
                      <div key={i} className={`flex mb-1.5 ${isOwn ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] px-3 py-2 shadow-sm ${
                          isOwn ? 'bg-[#DCF8C6] text-gray-900 rounded-[12px_12px_4px_12px]'
                            : 'bg-white text-gray-900 rounded-[12px_12px_12px_4px]'
                        }`}>
                          {isAudioMsg(msg)
                            ? <AudioPlayer messageId={msgId} telefone={contato.telefone} fromMe={isOwn} isOwn={isOwn} />
                            : isImageMsg(msg)
                              ? <ImageMessage messageId={msgId} telefone={contato.telefone} fromMe={isOwn} />
                              : msg.media_type === 'document'
                                ? <span className="text-sm">📄 Documento</span>
                                : (() => {
                                    const t = (msg.content ?? '').replace(/^\[(?:audio|ptt|image|document):[^\]]+\]\s*/, '').trim()
                                    return (!t || /^\[(?:text|undefined)\]$/.test(t))
                                      ? <span className="text-sm leading-relaxed italic text-gray-400">Mensagem</span>
                                      : <span className="text-sm leading-relaxed whitespace-pre-wrap break-words">{t}</span>
                                  })()
                          }
                          <div className={`flex items-center gap-1 mt-0.5 ${isOwn ? 'justify-end' : ''}`}>
                            <span className="text-[10px] text-gray-400">
                              {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}
                            </span>
                            {isOwn && <CheckCheck size={11} className="text-blue-400" />}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))}
              {!localConv?.historico?.length && (
                <div className="flex flex-col items-center justify-center h-full py-10 gap-3 text-center px-6">
                  <MessageSquare size={48} className="text-gray-300" />
                  <p className="text-sm font-semibold text-gray-500">Nenhuma conversa ainda</p>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    Este contato ainda não iniciou uma conversa pelo WhatsApp
                  </p>
                  <button
                    onClick={() => textAreaRef.current?.focus()}
                    className="mt-1 px-4 py-2 bg-primary text-white text-xs font-semibold rounded-xl hover:bg-primary/90 transition-colors">
                    + Iniciar conversa
                  </button>
                </div>
              )}
              <div ref={msgsEndRef} />
            </div>
            <div className="px-3 py-3 border-t border-gray-100 bg-white flex-shrink-0">
              {pendingImage && (
                <div className="relative inline-block mb-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={pendingImage} alt="" className="h-14 w-14 object-cover rounded-lg border" />
                  <button onClick={() => setPendingImage(null)}
                    className="absolute -top-1 -right-1 w-4 h-4 bg-gray-700 text-white rounded-full flex items-center justify-center">
                    <X size={8} />
                  </button>
                </div>
              )}
              <form onSubmit={handleSend} className="flex items-center gap-2">
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                <button type="button" onClick={() => fileRef.current?.click()}
                  className="p-2 text-gray-400 hover:text-primary rounded-lg hover:bg-gray-100 transition-colors">
                  <Paperclip size={16} />
                </button>
                <textarea ref={textAreaRef} value={text} onChange={e => setText(e.target.value)}
                  placeholder="Mensagem..." disabled={isRecording || sending} rows={1}
                  className="flex-1 bg-gray-100 rounded-xl px-3 py-2 text-sm focus:outline-none resize-none"
                  style={{ maxHeight: 80 }}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend(e as unknown as React.FormEvent) } }} />
                <AudioRecorder
                  onSend={async b64 => { await sendAudio(contato.telefone, b64) }}
                  onRecordingChange={setIsRecording} disabled={sending} />
                {!isRecording && (
                  <button type="submit" disabled={sending || (!text.trim() && !pendingImage)}
                    className="w-9 h-9 bg-primary text-white rounded-xl flex items-center justify-center disabled:opacity-40 flex-shrink-0">
                    {sending
                      ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      : <Send size={14} />}
                  </button>
                )}
              </form>
            </div>
          </>
        )}

        {/* ── Detalhes ── */}
        {tab === 'detalhes' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {([
              { label: 'Nome', val: nome, set: setNome, type: 'text' },
              { label: 'Email', val: email, set: setEmail, type: 'email' },
              { label: 'Empresa', val: empresa, set: setEmpresa, type: 'text' },
              { label: 'Valor R$', val: valor, set: setValor, type: 'number' },
            ] as { label: string; val: string; set: (v: string) => void; type: string }[]).map(f => (
              <div key={f.label}>
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-1">{f.label}</label>
                <input type={f.type} value={f.val} onChange={e => f.set(e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-primary" />
              </div>
            ))}
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-1">Status</label>
              <select value={status} onChange={e => setStatus(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-primary bg-white">
                <option value="">—</option>
                {['ativo', 'qualificado', 'ganho', 'perdido'].map(s => (
                  <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-1">Etapa</label>
              <select value={etapaId} onChange={e => setEtapaId(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-primary bg-white">
                <option value="">Sem etapa</option>
                {etapas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-1">Observações</label>
              <textarea value={obs} onChange={e => setObs(e.target.value)} rows={4}
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-primary resize-none" />
            </div>
            <div className="flex items-center gap-3 mt-2">
              <button onClick={saveDetails} disabled={saving}
                className="flex-1 bg-primary text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-primary-dark disabled:opacity-60 transition-colors">
                {saving ? 'Salvando…' : 'Salvar alterações'}
              </button>
              {saveMsg && (
                <span className={`text-xs font-semibold ${saveMsg.startsWith('✓') ? 'text-green-600' : 'text-red-500'}`}>
                  {saveMsg}
                </span>
              )}
            </div>
          </div>
        )}

        {/* ── Tarefas ── */}
        {tab === 'tarefas' && (
          <div className="flex-1 overflow-y-auto p-4">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-gray-700">Tarefas ({tarefas.length})</p>
              <button onClick={() => setShowAddTask(v => !v)}
                className="flex items-center gap-1 text-sm text-primary hover:text-primary-dark font-medium">
                <Plus size={14} /> Nova
              </button>
            </div>
            {showAddTask && (
              <div className="bg-gray-50 rounded-xl p-3 mb-4 space-y-2">
                <input value={novaTarefa} onChange={e => setNovaTarefa(e.target.value)}
                  placeholder="Título da tarefa..." autoFocus
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-primary bg-white" />
                <input type="datetime-local" value={vencimento} onChange={e => setVencimento(e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-primary bg-white" />
                <div className="flex gap-2">
                  <button onClick={addTarefa} disabled={!novaTarefa.trim()}
                    className="flex-1 bg-primary text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50">
                    Adicionar
                  </button>
                  <button onClick={() => { setShowAddTask(false); setNovaTarefa(''); setVencimento('') }}
                    className="px-3 border border-gray-200 text-gray-500 rounded-lg text-sm hover:bg-gray-50">
                    Cancelar
                  </button>
                </div>
              </div>
            )}
            <div className="space-y-2">
              {tarefas.map(t => {
                const isVencida = t.vencimento && t.status === 'pendente' &&
                  isPast(parseISO(t.vencimento)) && !isToday(parseISO(t.vencimento))
                return (
                  <div key={t.id} className={`flex items-start gap-2.5 p-3 rounded-xl border ${
                    isVencida ? 'bg-red-50 border-red-100' : 'bg-gray-50 border-gray-100'
                  }`}>
                    <button onClick={() => toggleTarefa(t)}
                      className={`mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                        t.status === 'concluida' ? 'bg-green-500 border-green-500'
                          : isVencida ? 'border-red-400' : 'border-gray-300 hover:border-green-400'
                      }`}>
                      {t.status === 'concluida' && <Check size={8} className="text-white" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${t.status === 'concluida' ? 'line-through text-gray-400' : isVencida ? 'text-red-700' : 'text-gray-900'}`}>
                        {t.titulo}
                      </p>
                      {t.vencimento && (
                        <p className={`text-[10px] mt-0.5 ${isVencida ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
                          {isVencida ? '⚠️ ' : '📅 '}
                          {new Date(t.vencimento).toLocaleDateString('pt-BR')}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
              {tarefas.length === 0 && (
                <div className="text-center py-8 text-gray-400 text-sm">Nenhuma tarefa</div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  )
}

/* ─────────── Novo Lead modal ─────────── */
interface ModalProps { etapas: EtapaFunil[]; onClose: () => void; onCreated: (c: Contato) => void }

function NovoLeadModal({ etapas, onClose, onCreated }: ModalProps) {
  const [nome, setNome] = useState('')
  const [tel, setTel] = useState('')
  const [email, setEmail] = useState('')
  const [empresa, setEmpresa] = useState('')
  const [etapaId, setEtapaId] = useState('')
  const [valor, setValor] = useState('')
  const [responsavel, setResponsavel] = useState('')
  const [obs, setObs] = useState('')
  const [criando, setCriando] = useState(false)

  async function criar() {
    if (!tel.trim()) return
    setCriando(true)
    try {
      const { data } = await supabase.from('crm_contatos').insert({
        nome: nome.trim() || null, telefone: tel.trim(),
        email: email.trim() || null, etapa_funil_id: etapaId || null,
        status: 'ativo', observacoes: obs.trim() || null,
        campos_custom: {
          empresa: empresa.trim() || null,
          valor: Number(valor) || 0,
          responsavel: responsavel.trim() || null,
        },
      }).select().single()
      if (data) {
        await supabase.from('conversas').upsert(
          { telefone: tel.trim(), nome: nome.trim() || null, historico: [], atualizado_em: new Date().toISOString() },
          { onConflict: 'telefone', ignoreDuplicates: true }
        )
        onCreated(data as Contato)
      }
    } catch { /* noop */ }
    setCriando(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-bold text-gray-900">Novo Lead</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-1">Nome</label>
              <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome do lead"
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-primary" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-1">Telefone *</label>
              <input value={tel} onChange={e => setTel(e.target.value)} placeholder="5511999999999"
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-primary" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-1">E-mail</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@exemplo.com"
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-primary" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-1">Empresa</label>
              <input value={empresa} onChange={e => setEmpresa(e.target.value)} placeholder="Nome da empresa"
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-primary" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-1">Etapa do funil</label>
              <select value={etapaId} onChange={e => setEtapaId(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-primary bg-white">
                <option value="">Sem etapa</option>
                {etapas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-1">Valor R$</label>
              <input type="number" value={valor} onChange={e => setValor(e.target.value)} placeholder="0"
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-primary" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-1">Responsável</label>
            <input value={responsavel} onChange={e => setResponsavel(e.target.value)} placeholder="Nome do responsável"
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-primary" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-1">Observações</label>
            <textarea value={obs} onChange={e => setObs(e.target.value)} rows={2} placeholder="Observações..."
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-primary resize-none" />
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose}
            className="flex-1 border border-gray-200 text-gray-600 rounded-xl py-2.5 text-sm font-medium hover:bg-gray-50">
            Cancelar
          </button>
          <button onClick={criar} disabled={criando || !tel.trim()}
            className="flex-1 bg-primary text-white rounded-xl py-2.5 text-sm font-bold hover:bg-primary-dark disabled:opacity-60 transition-colors">
            {criando ? 'Criando…' : '+ CRIAR LEAD'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─────────── Main pipeline content ─────────── */
function PipelineContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const isListView = searchParams.get('view') === 'list'

  const [contatos, setContatos] = useState<Contato[]>([])
  const [conversas, setConversas] = useState<Record<string, Conversa>>({})
  const [etapas, setEtapas] = useState<EtapaFunil[]>([])
  const [tarefasMap, setTarefasMap] = useState<Record<string, Tarefa[]>>({})
  const [panelContato, setPanelContato] = useState<Contato | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [listPage, setListPage] = useState(0)
  const [filterEtapa, setFilterEtapa] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const filtersRef = useRef<HTMLDivElement>(null)

  const LIST_PAGE = 50
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  // Debounce
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setListPage(0) }, 300)
    return () => clearTimeout(t)
  }, [search])

  // Close filter dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (filtersRef.current && !filtersRef.current.contains(e.target as Node)) {
        setShowFilters(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const load = useCallback(async () => {
    const [{ data: c }, { data: conv }, { data: e }, { data: t }] = await Promise.all([
      supabase.from('crm_contatos').select('*').range(0, 499),
      supabase.from('conversas').select('telefone, historico, atualizado_em, nome').range(0, 499),
      supabase.from('etapas_funil').select('*').order('ordem'),
      supabase.from('tarefas').select('*').eq('status', 'pendente').range(0, 999),
    ])
    if (c) setContatos((c as Contato[]).filter(x => x.telefone && x.telefone.length <= 15))
    if (conv) {
      const map: Record<string, Conversa> = {}
      ;(conv as Conversa[]).forEach(x => { map[x.telefone] = x })
      setConversas(map)
    }
    if (e) setEtapas(e as EtapaFunil[])
    if (t) {
      const map: Record<string, Tarefa[]> = {}
      ;(t as Tarefa[]).forEach(task => {
        if (task.contato_id) {
          if (!map[task.contato_id]) map[task.contato_id] = []
          map[task.contato_id].push(task)
        }
      })
      setTarefasMap(map)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleDragEnd(e: DragEndEvent) {
    setActiveId(null)
    const { active, over } = e
    if (!over) return
    const contatoId = active.id as string
    const novaEtapaId = over.id as string
    const atual = contatos.find(c => c.id === contatoId)?.etapa_funil_id ?? null
    const nova = novaEtapaId === 'ENTRADA' ? null : novaEtapaId
    if (nova === atual) return
    setContatos(prev => prev.map(c => c.id === contatoId ? { ...c, etapa_funil_id: nova } : c))
    const { error } = await supabase.from('crm_contatos').update({ etapa_funil_id: nova }).eq('id', contatoId)
    if (error) setContatos(prev => prev.map(c => c.id === contatoId ? { ...c, etapa_funil_id: atual } : c))
  }

  const filteredContatos = contatos.filter(c => {
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase()
      if (!(c.nome ?? '').toLowerCase().includes(q) && !c.telefone.includes(q)) return false
    }
    if (filterEtapa && c.etapa_funil_id !== filterEtapa) return false
    if (filterStatus && c.status !== filterStatus) return false
    return true
  })

  const totalValor = filteredContatos.reduce((s, c) => s + getValor(c), 0)

  const cols = [
    { id: 'ENTRADA', nome: 'ENTRADA', cor: '#9CA3AF', items: filteredContatos.filter(c => !c.etapa_funil_id) },
    ...etapas.map(e => ({ id: e.id, nome: e.nome.toUpperCase(), cor: e.cor, items: filteredContatos.filter(c => c.etapa_funil_id === e.id) })),
  ]

  const totalPages = Math.max(1, Math.ceil(filteredContatos.length / LIST_PAGE))
  const paginatedContatos = filteredContatos.slice(listPage * LIST_PAGE, (listPage + 1) * LIST_PAGE)
  const activeContato = activeId ? contatos.find(c => c.id === activeId) : null

  function toggleSelect(id: string) {
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleSelectAll() {
    setSelectedIds(prev => prev.size === paginatedContatos.length ? new Set() : new Set(paginatedContatos.map(c => c.id)))
  }

  async function markAsWon(id: string) {
    await supabase.from('crm_contatos').update({ status: 'ganho' }).eq('id', id)
    setContatos(prev => prev.map(c => c.id === id ? { ...c, status: 'ganho' } : c))
  }

  return (
    <div className="flex flex-col h-full">

      {/* ── Header ── */}
      <div className="px-4 py-2.5 border-b border-gray-200 bg-white flex items-center gap-2.5 flex-shrink-0">
        <div className="flex items-center gap-2 mr-1 flex-shrink-0">
          <span className="text-sm font-bold text-gray-800 tracking-widest uppercase">Leads</span>
          <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded-full">Leads ativos</span>
        </div>

        {/* View toggle */}
        <div className="flex items-center bg-gray-100 rounded-lg p-0.5 flex-shrink-0">
          <button onClick={() => router.push('/pipeline')}
            className={`p-1.5 rounded-md transition-colors ${!isListView ? 'bg-white shadow-sm text-primary' : 'text-gray-400 hover:text-gray-600'}`}
            title="Kanban">
            <LayoutGrid size={14} />
          </button>
          <button onClick={() => router.push('/pipeline?view=list')}
            className={`p-1.5 rounded-md transition-colors ${isListView ? 'bg-white shadow-sm text-primary' : 'text-gray-400 hover:text-gray-600'}`}
            title="Lista">
            <ListIcon size={14} />
          </button>
        </div>

        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Busca e filtro"
            className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:border-primary" />
        </div>

        <span className="text-xs text-gray-500 whitespace-nowrap flex-shrink-0">
          {filteredContatos.length} leads: {fmtBRL(totalValor)}
        </span>

        {/* Filters dropdown */}
        <div className="relative flex-shrink-0" ref={filtersRef}>
          <button onClick={() => setShowFilters(v => !v)}
            className={`p-2 rounded-xl transition-colors ${showFilters ? 'bg-gray-100 text-gray-700' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'}`}>
            <MoreHorizontal size={16} />
          </button>
          {showFilters && (
            <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-20 w-56 py-2">
              <div className="px-3 pb-2 border-b border-gray-100">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Etapa</p>
                <select value={filterEtapa} onChange={e => { setFilterEtapa(e.target.value); setListPage(0) }}
                  className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none bg-white">
                  <option value="">Todas</option>
                  {etapas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
                </select>
              </div>
              <div className="px-3 pt-2">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Status</p>
                <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setListPage(0) }}
                  className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none bg-white">
                  <option value="">Todos</option>
                  {['ativo', 'qualificado', 'ganho', 'perdido'].map(s => (
                    <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                  ))}
                </select>
              </div>
              {(filterEtapa || filterStatus) && (
                <div className="px-3 pt-2 border-t border-gray-100 mt-2">
                  <button onClick={() => { setFilterEtapa(''); setFilterStatus(''); setListPage(0) }}
                    className="w-full text-xs text-red-500 hover:text-red-700 font-medium py-1">
                    Limpar filtros
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <button className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors flex-shrink-0">
          <Zap size={12} /> AUTOMATIZE
        </button>

        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 bg-primary text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-primary-dark transition-colors flex-shrink-0">
          <Plus size={14} /> NOVO LEAD
        </button>
      </div>

      {/* ── Kanban view ── */}
      {!isListView && (
        <div className="flex-1 overflow-x-auto overflow-y-hidden p-4">
          <DndContext sensors={sensors}
            onDragStart={e => setActiveId(e.active.id as string)}
            onDragEnd={handleDragEnd}>
            <div className="flex gap-3 h-full" style={{ minWidth: cols.length * 262 }}>
              {cols.map(col => (
                <div key={col.id} className="flex flex-col flex-shrink-0" style={{ width: 252 }}>
                  {/* Column header */}
                  <div className="mb-2">
                    <div className="h-1 rounded-t-full mb-2" style={{ backgroundColor: col.cor }} />
                    <div className="flex items-center justify-between px-0.5">
                      <span className="text-[11px] font-bold text-gray-500 tracking-wider">{col.nome}</span>
                      <span className="text-[10px] text-gray-400">
                        {col.items.length} · {fmtBRL(col.items.reduce((s, c) => s + getValor(c), 0))}
                      </span>
                    </div>
                  </div>

                  {/* Scrollable cards */}
                  <div className="flex-1 overflow-y-auto pr-0.5">
                    <DroppableColumn id={col.id}>
                      {col.items.map(c => (
                        <KanbanCard key={c.id} contato={c} conv={conversas[c.telefone]}
                          tasks={tarefasMap[c.id] ?? []} onClick={() => setPanelContato(c)} />
                      ))}
                      {col.items.length === 0 && (
                        <div className="h-16 flex items-center justify-center text-[11px] text-gray-300 border-2 border-dashed border-gray-100 rounded-xl">
                          Solte aqui
                        </div>
                      )}
                    </DroppableColumn>
                  </div>

                  <button onClick={() => setShowModal(true)}
                    className="mt-2 flex items-center gap-1 text-[11px] text-gray-400 hover:text-primary px-1 py-1 hover:bg-primary/5 rounded-lg transition-colors">
                    <Plus size={12} /> Adicionar lead
                  </button>
                </div>
              ))}
            </div>

            <DragOverlay>
              {activeContato && (
                <KanbanCardGhost contato={activeContato} conv={conversas[activeContato.telefone]}
                  tasks={tarefasMap[activeContato.id] ?? []} />
              )}
            </DragOverlay>
          </DndContext>
        </div>
      )}

      {/* ── List view ── */}
      {isListView && (
        <div className="flex-1 overflow-y-auto p-4">
          {selectedIds.size > 0 && (
            <div className="mb-3 flex items-center gap-3 bg-blue-50 border border-blue-100 rounded-xl px-4 py-2.5">
              <span className="text-sm font-medium text-blue-700">
                {selectedIds.size} selecionado{selectedIds.size > 1 ? 's' : ''}
              </span>
              <button
                onClick={async () => { for (const id of Array.from(selectedIds)) await markAsWon(id); setSelectedIds(new Set()) }}
                className="text-xs text-blue-600 hover:text-blue-800 font-semibold">
                ✓ Marcar como ganho
              </button>
              <button onClick={() => setSelectedIds(new Set())} className="ml-auto text-blue-400 hover:text-blue-600">
                <X size={14} />
              </button>
            </div>
          )}

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/80">
                  <th className="px-4 py-3 w-10">
                    <input type="checkbox"
                      checked={selectedIds.size === paginatedContatos.length && paginatedContatos.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded border-gray-300 text-primary focus:ring-primary" />
                  </th>
                  {['Lead', 'Contato', 'Empresa', 'Etapa', 'Venda R$', 'Ações'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginatedContatos.map(c => {
                  const etapa = etapas.find(e => e.id === c.etapa_funil_id)
                  const emp = ((c.campos_custom as Record<string, unknown>)?.empresa as string) || '—'
                  return (
                    <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors">
                      <td className="px-4 py-3">
                        <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleSelect(c.id)}
                          onClick={e => e.stopPropagation()}
                          className="rounded border-gray-300 text-primary focus:ring-primary" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button onClick={() => setPanelContato(c)}
                            className="text-sm font-semibold text-blue-600 hover:text-blue-800 hover:underline">
                            Lead #{c.id.slice(-6)}
                          </button>
                          <a href={`/inbox?tel=${c.telefone}`}
                            className="px-1.5 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded hover:bg-green-200 transition-colors">
                            Bate-papo
                          </a>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <ContactAvatar nome={c.nome} telefone={c.telefone} fotoUrl={c.foto_url} size={28} />
                          <span className="text-sm text-gray-800">{nomeValido(c.nome, c.telefone) ? c.nome! : formatPhone(c.telefone)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{emp}</td>
                      <td className="px-4 py-3">
                        {etapa
                          ? <span className="px-2 py-0.5 rounded-full text-xs font-semibold text-white" style={{ backgroundColor: etapa.cor }}>{etapa.nome}</span>
                          : <span className="text-sm text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-700">
                        {getValor(c) > 0 ? fmtBRL(getValor(c)) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => markAsWon(c.id)}
                            className="p-1.5 hover:bg-green-50 rounded-lg text-gray-400 hover:text-green-500 transition-colors"
                            title="Marcar como ganho">
                            <Check size={14} />
                          </button>
                          <a href={`https://wa.me/${c.telefone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer"
                            className="p-1.5 hover:bg-blue-50 rounded-lg text-gray-400 hover:text-blue-500 transition-colors"
                            title="Abrir WhatsApp">
                            <ExternalLink size={14} />
                          </a>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {paginatedContatos.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-gray-400 text-sm">
                      Nenhum lead encontrado
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 px-1">
              <button onClick={() => setListPage(p => Math.max(0, p - 1))} disabled={listPage === 0}
                className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-40 disabled:cursor-not-allowed">
                <ChevronLeft size={16} /> Anterior
              </button>
              <span className="text-sm text-gray-500">Página {listPage + 1} de {totalPages}</span>
              <button onClick={() => setListPage(p => Math.min(totalPages - 1, p + 1))} disabled={listPage >= totalPages - 1}
                className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-40 disabled:cursor-not-allowed">
                Próximo <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Contact panel */}
      {panelContato && (
        <ContactPanel
          contato={panelContato}
          etapas={etapas}
          onClose={() => setPanelContato(null)}
          onUpdate={updated => {
            setContatos(prev => prev.map(c => c.id === updated.id ? updated : c))
            setPanelContato(updated)
          }}
          onDelete={id => {
            setContatos(prev => prev.filter(c => c.id !== id))
            setPanelContato(null)
          }}
        />
      )}

      {/* New lead modal */}
      {showModal && (
        <NovoLeadModal
          etapas={etapas}
          onClose={() => setShowModal(false)}
          onCreated={c => { setContatos(prev => [...prev, c]); setShowModal(false) }}
        />
      )}
    </div>
  )
}

/* ─────────── Page export ─────────── */
export default function PipelinePage() {
  return (
    <Suspense fallback={<div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Carregando…</div>}>
      <PipelineContent />
    </Suspense>
  )
}
