'use client'
import React, { useEffect, useState, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { format, parseISO, isToday, isYesterday } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  DndContext, DragOverlay, DragEndEvent,
  PointerSensor, useSensor, useSensors,
  useDraggable, useDroppable, pointerWithin,
} from '@dnd-kit/core'
import { supabase } from '@/lib/supabase'
import { sendText, sendAudio, sendImage } from '@/lib/evolution'
import ContactAvatar from '@/components/ContactAvatar'
import AudioPlayer from '@/components/AudioPlayer'
import AudioRecorder from '@/components/AudioRecorder'
import ImageMessage from '@/components/ImageMessage'
import { formatPhone, formatDate, isGroupPhone, getDateLabel, formatTime } from '@/lib/utils'
import {
  MessageSquare, X, Send, CheckSquare, Square, Plus, Paperclip,
  FileText, ExternalLink, LayoutList, Kanban
} from 'lucide-react'
import type { Contato, EtapaFunil, Conversa, Mensagem, Tarefa } from '@/types'

// ── Helpers ──────────────────────────────────────────────────────────────────

function getMediaMsgId(msg: Mensagem): string | undefined {
  if (msg.messageId) return msg.messageId
  if (msg.message_id) return msg.message_id
  const m = msg.content?.match(/^\[(?:audio|ptt|image|document):([^\]]+)\]/)
  return m?.[1]
}

function isAudioMsg(msg: Mensagem) {
  return msg.media_type === 'audio' || msg.media_type === 'ptt' ||
    msg.content?.startsWith('[audio]') || msg.content?.startsWith('[ptt]')
}

function isImageMsg(msg: Mensagem) {
  return msg.media_type === 'image' || msg.content?.startsWith('[image]')
}

// ── KanbanCard ────────────────────────────────────────────────────────────────

function KanbanCard({ contato, ultimaMensagem, etapa, onClick }: {
  contato: Contato; ultimaMensagem?: string; etapa?: EtapaFunil; onClick: () => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: contato.id })
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} onClick={onClick}
      style={{ opacity: isDragging ? 0.3 : 1, cursor: isDragging ? 'grabbing' : 'pointer' }}
      className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 hover:shadow-md transition-all touch-none select-none"
    >
      <div className="flex items-center gap-2 mb-2">
        <ContactAvatar nome={contato.nome} seed={contato.telefone} size={30} fotoUrl={contato.foto_url} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-primary truncate">{contato.nome ?? 'Sem nome'}</p>
          <p className="text-[10px] text-gray-400">{formatPhone(contato.telefone)}</p>
        </div>
      </div>
      {ultimaMensagem && <p className="text-xs text-gray-400 truncate mt-1">{ultimaMensagem}</p>}
      <div className="flex items-center justify-between mt-2">
        <span className="text-[10px] text-gray-300">{formatDate(contato.atualizado_em)}</span>
        {etapa && (
          <span className="text-[10px] text-white px-1.5 py-0.5 rounded-full" style={{ backgroundColor: etapa.cor }}>{etapa.nome}</span>
        )}
      </div>
    </div>
  )
}

// ── DroppableColumn ───────────────────────────────────────────────────────────

function DroppableColumn({ etapa, cards, getUltimaMensagem, getEtapa, onCardClick }: {
  etapa: EtapaFunil; cards: Contato[]
  getUltimaMensagem: (tel: string) => string | undefined
  getEtapa: (id: string | null) => EtapaFunil | undefined
  onCardClick: (c: Contato) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: etapa.id })
  return (
    <div className="w-64 flex-shrink-0 flex flex-col">
      <div className="mb-3">
        <div className="h-1 rounded-full mb-2.5" style={{ backgroundColor: etapa.cor }} />
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-bold text-gray-600 uppercase tracking-wide flex-1 truncate">{etapa.nome}</h2>
          <span className="bg-gray-100 text-gray-500 text-[10px] font-semibold px-2 py-0.5 rounded-full">{cards.length}</span>
        </div>
      </div>
      <div ref={setNodeRef}
        className={`flex-1 rounded-xl p-2 space-y-2 overflow-y-auto min-h-[120px] transition-colors ${
          isOver ? 'bg-primary/10 ring-2 ring-primary/30' : 'bg-gray-100/60'
        }`}
      >
        {cards.map(c => (
          <KanbanCard key={c.id} contato={c} ultimaMensagem={getUltimaMensagem(c.telefone)}
            etapa={getEtapa(c.etapa_funil_id)} onClick={() => onCardClick(c)} />
        ))}
        {cards.length === 0 && (
          <div className="flex items-center justify-center h-12 text-xs text-gray-400">Sem leads</div>
        )}
      </div>
    </div>
  )
}

// ── ContactPanel ──────────────────────────────────────────────────────────────

function ContactPanel({ contato, etapas, onClose, onUpdate }: {
  contato: Contato; etapas: EtapaFunil[]
  onClose: () => void; onUpdate: (patch: Partial<Contato>) => void
}) {
  type Tab = 'conversa' | 'detalhes' | 'tarefas'
  const [tab, setTab] = useState<Tab>('conversa')
  const [conversa, setConversa] = useState<Conversa | null>(null)
  const [loading, setLoading] = useState(false)
  const [msgText, setMsgText] = useState('')
  const [sending, setSending] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [pendingImage, setPendingImage] = useState<{ dataUrl: string; file: File } | null>(null)
  const [localImages, setLocalImages] = useState<Record<string, string>>({})
  const fileInputRef = useRef<HTMLInputElement>(null)
  const endRef = useRef<HTMLDivElement>(null)

  const [editNome, setEditNome] = useState(contato.nome ?? '')
  const [editEmail, setEditEmail] = useState(contato.email ?? '')
  const [editStatus, setEditStatus] = useState(contato.status ?? '')
  const [editObs, setEditObs] = useState(contato.observacoes ?? '')
  const [editEtapa, setEditEtapa] = useState(contato.etapa_funil_id ?? '')
  const [saving, setSaving] = useState(false)
  const [savedOk, setSavedOk] = useState(false)

  const [tarefas, setTarefas] = useState<Tarefa[]>([])
  const [newTitle, setNewTitle] = useState('')
  const [newDate, setNewDate] = useState('')
  const [addingTask, setAddingTask] = useState(false)

  useEffect(() => {
    setTab('conversa')
    setMsgText('')
    setPendingImage(null)
    setEditNome(contato.nome ?? '')
    setEditEmail(contato.email ?? '')
    setEditStatus(contato.status ?? '')
    setEditObs(contato.observacoes ?? '')
    setEditEtapa(contato.etapa_funil_id ?? '')
    loadConversa()
    loadTarefas()
  }, [contato.id])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [conversa?.historico?.length])

  async function loadConversa() {
    setLoading(true)
    const { data } = await supabase.from('conversas').select('*').eq('telefone', contato.telefone).maybeSingle()
    setConversa(data as Conversa | null)
    setLoading(false)
  }

  async function loadTarefas() {
    const { data } = await supabase.from('tarefas').select('*').eq('contato_id', contato.id).order('criado_em', { ascending: false })
    if (data) setTarefas(data as Tarefa[])
  }

  function handleImageSelect(file: File) {
    if (!file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onloadend = () => setPendingImage({ dataUrl: reader.result as string, file })
    reader.readAsDataURL(file)
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (sending) return
    if (pendingImage) {
      setSending(true)
      const agora = new Date().toISOString()
      const caption = msgText.trim() || undefined
      const novaMensagem: Mensagem = { role: 'assistant', content: '[image]', media_type: 'image', timestamp: agora }
      const prev = conversa?.historico ?? []
      const novoHist = [...prev, novaMensagem]
      setLocalImages(p => ({ ...p, [agora]: pendingImage.dataUrl }))
      setConversa(c => ({ id: c?.id ?? '', nome: c?.nome ?? contato.nome, telefone: contato.telefone, historico: novoHist, atualizado_em: agora }))
      setPendingImage(null); setMsgText('')
      try {
        await sendImage(contato.telefone, pendingImage.dataUrl.split(',')[1], caption)
        await supabase.from('conversas').upsert({ telefone: contato.telefone, historico: novoHist, atualizado_em: agora }, { onConflict: 'telefone' })
      } catch { alert('Erro ao enviar imagem'); setConversa(c => c ? { ...c, historico: prev } : null) }
      finally { setSending(false) }
      return
    }
    if (!msgText.trim()) return
    setSending(true)
    const msg = msgText.trim()
    const agora = new Date().toISOString()
    const novaMensagem: Mensagem = { role: 'assistant', content: msg, timestamp: agora }
    const prev = conversa?.historico ?? []
    const novoHist = [...prev, novaMensagem]
    setConversa(c => ({ id: c?.id ?? '', nome: c?.nome ?? contato.nome, telefone: contato.telefone, historico: novoHist, atualizado_em: agora }))
    setMsgText('')
    try {
      await sendText(contato.telefone, msg)
      await supabase.from('conversas').upsert({ telefone: contato.telefone, historico: novoHist, atualizado_em: agora }, { onConflict: 'telefone' })
    } catch { alert('Erro ao enviar'); setConversa(c => c ? { ...c, historico: prev } : null); setMsgText(msg) }
    finally { setSending(false) }
  }

  async function handleSendAudio(base64: string) {
    const agora = new Date().toISOString()
    const novaMensagem: Mensagem = { role: 'assistant', content: '[ptt]', media_type: 'ptt', timestamp: agora }
    const novoHist = [...(conversa?.historico ?? []), novaMensagem]
    setConversa(c => ({ id: c?.id ?? '', nome: c?.nome ?? contato.nome, telefone: contato.telefone, historico: novoHist, atualizado_em: agora }))
    await sendAudio(contato.telefone, base64)
    await supabase.from('conversas').upsert({ telefone: contato.telefone, historico: novoHist, atualizado_em: agora }, { onConflict: 'telefone' })
  }

  async function saveDetails() {
    setSaving(true)
    const patch = { nome: editNome || null, email: editEmail || null, status: editStatus || null, observacoes: editObs || null, etapa_funil_id: editEtapa || null }
    await supabase.from('crm_contatos').update(patch).eq('id', contato.id)
    setSaving(false); setSavedOk(true); setTimeout(() => setSavedOk(false), 2000)
    onUpdate(patch)
  }

  async function createTask() {
    if (!newTitle.trim()) return
    const { data } = await supabase.from('tarefas').insert({ contato_id: contato.id, titulo: newTitle.trim(), vencimento: newDate || null, status: 'pendente' }).select().single()
    if (data) setTarefas(p => [data as Tarefa, ...p])
    setNewTitle(''); setNewDate(''); setAddingTask(false)
  }

  async function toggleTask(t: Tarefa) {
    const s = t.status === 'concluida' ? 'pendente' : 'concluida'
    setTarefas(p => p.map(x => x.id === t.id ? { ...x, status: s } : x))
    await supabase.from('tarefas').update({ status: s }).eq('id', t.id)
  }

  const hist = conversa?.historico ?? []
  const tabs: { key: Tab; label: string }[] = [
    { key: 'conversa', label: 'Conversa' },
    { key: 'detalhes', label: 'Detalhes' },
    { key: 'tarefas', label: tarefas.length > 0 ? `Tarefas (${tarefas.length})` : 'Tarefas' },
  ]

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[420px] bg-white shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 p-4 border-b border-gray-100">
          <div className="flex items-start gap-3">
            <ContactAvatar nome={contato.nome} seed={contato.telefone} size={48} fotoUrl={contato.foto_url} />
            <div className="flex-1 min-w-0">
              <p className="text-base font-bold text-gray-900 truncate">{editNome || contato.nome || 'Sem nome'}</p>
              <p className="text-sm text-gray-500">{formatPhone(contato.telefone)}</p>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {(editStatus || contato.status) && (
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full capitalize">{editStatus || contato.status}</span>
                )}
                {contato.origem && (
                  <span className="text-xs bg-blue-50 text-primary px-2 py-0.5 rounded-full capitalize">{contato.origem}</span>
                )}
              </div>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 flex-shrink-0 p-1 rounded-lg hover:bg-gray-100 transition-colors">
              <X size={18} />
            </button>
          </div>
          <div className="flex mt-4 bg-gray-100 rounded-lg p-0.5 gap-0.5">
            {tabs.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >{t.label}</button>
            ))}
          </div>
        </div>

        {/* Tab: Conversa */}
        {tab === 'conversa' && (
          <>
            <input type="file" ref={fileInputRef} accept="image/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleImageSelect(f); e.target.value = '' }}
            />
            <div className="flex-1 overflow-y-auto p-3 space-y-1 bg-[#F0F2F5]"
              onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f?.type.startsWith('image/')) handleImageSelect(f) }}
            >
              {loading ? (
                <div className="flex justify-center py-10"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
              ) : hist.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-gray-400">
                  <MessageSquare size={32} className="mb-2 opacity-30" />
                  <p className="text-sm">Nenhuma mensagem</p>
                </div>
              ) : (() => {
                let lastDate = ''
                return hist.map((msg, i) => {
                  const dateLabel = getDateLabel(msg.timestamp)
                  const showSep = dateLabel !== lastDate
                  if (showSep) lastDate = dateLabel
                  const isOwn = msg.role === 'assistant'
                  const audio = isAudioMsg(msg)
                  const image = isImageMsg(msg)
                  const msgId = getMediaMsgId(msg)
                  return (
                    <React.Fragment key={i}>
                      {showSep && (
                        <div className="flex items-center gap-2 py-2">
                          <div className="flex-1 h-px bg-gray-200/80" />
                          <span className="text-[10px] text-gray-500 font-medium bg-[#F0F2F5] px-2 whitespace-nowrap">{dateLabel}</span>
                          <div className="flex-1 h-px bg-gray-200/80" />
                        </div>
                      )}
                      <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                        <div className={`rounded-2xl shadow-sm ${isOwn ? 'bg-[#DCF8C6] text-gray-900 rounded-tr-sm' : 'bg-white text-gray-900 rounded-tl-sm'} ${(audio || image) ? 'p-2' : 'px-3 py-2 max-w-[82%]'}`}>
                          {audio ? (
                            <AudioPlayer messageId={msgId} telefone={contato.telefone} fromMe={isOwn} isOwn={isOwn} />
                          ) : image ? (
                            <ImageMessage messageId={msgId} telefone={contato.telefone} fromMe={isOwn} localDataUrl={localImages[msg.timestamp]} />
                          ) : (
                            <p className="text-sm whitespace-pre-wrap break-words leading-snug">{msg.content}</p>
                          )}
                          <p className="text-[10px] text-gray-400 mt-0.5 text-right">{formatTime(msg.timestamp)}</p>
                        </div>
                      </div>
                    </React.Fragment>
                  )
                })
              })()}
              <div ref={endRef} />
            </div>
            {pendingImage && (
              <div className="flex-shrink-0 bg-gray-50 border-t border-gray-100 px-3 pt-2 pb-1 flex items-center gap-2">
                <img src={pendingImage.dataUrl} alt="Preview" className="w-14 h-14 object-cover rounded-lg border border-gray-200" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-700 truncate">{pendingImage.file.name}</p>
                  <p className="text-[10px] text-gray-400">{(pendingImage.file.size / 1024).toFixed(0)} KB</p>
                </div>
                <button onClick={() => setPendingImage(null)} className="text-gray-400 hover:text-red-500 p-1 transition-colors"><X size={14} /></button>
              </div>
            )}
            <form onSubmit={handleSend} className="flex-shrink-0 p-3 bg-white border-t border-gray-100 flex gap-2 items-center">
              {!isRecording && (
                <button type="button" onClick={() => fileInputRef.current?.click()} disabled={sending}
                  className="w-9 h-9 flex items-center justify-center rounded-xl text-gray-400 hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-40"
                ><Paperclip size={17} /></button>
              )}
              {!isRecording && (
                <input value={msgText} onChange={e => setMsgText(e.target.value)}
                  placeholder={pendingImage ? 'Legenda (opcional)...' : 'Digite uma mensagem...'}
                  className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              )}
              <AudioRecorder onSend={handleSendAudio} onRecordingChange={setIsRecording} disabled={sending} />
              {!isRecording && (
                <button type="submit" disabled={(!msgText.trim() && !pendingImage) || sending}
                  className="bg-primary text-white rounded-xl px-3 py-2.5 hover:bg-primary-dark disabled:opacity-50 transition-colors"
                ><Send size={15} /></button>
              )}
            </form>
          </>
        )}

        {/* Tab: Detalhes */}
        {tab === 'detalhes' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {[
              { label: 'Nome', value: editNome, setter: setEditNome, type: 'text' },
              { label: 'Email', value: editEmail, setter: setEditEmail, type: 'email' },
            ].map(f => (
              <div key={f.label}>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{f.label}</label>
                <input type={f.type} value={f.value} onChange={e => f.setter(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
              </div>
            ))}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Status</label>
              <select value={editStatus} onChange={e => setEditStatus(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 bg-white">
                <option value="">Sem status</option>
                <option value="lead">Lead</option>
                <option value="qualificado">Qualificado</option>
                <option value="cliente">Cliente</option>
                <option value="perdido">Perdido</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Etapa do Funil</label>
              <select value={editEtapa} onChange={e => setEditEtapa(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 bg-white">
                <option value="">Sem etapa</option>
                {etapas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Observações</label>
              <textarea value={editObs} onChange={e => setEditObs(e.target.value)} rows={5}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none" />
            </div>
            <button onClick={saveDetails} disabled={saving}
              className={`w-full rounded-lg py-2.5 text-sm font-semibold transition-all ${savedOk ? 'bg-green-500 text-white' : 'bg-primary text-white hover:bg-primary-dark disabled:opacity-50'}`}>
              {savedOk ? '✓ Salvo!' : saving ? 'Salvando...' : 'Salvar alterações'}
            </button>
          </div>
        )}

        {/* Tab: Tarefas */}
        {tab === 'tarefas' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {tarefas.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-36 text-gray-400">
                  <CheckSquare size={32} className="mb-2 opacity-30" />
                  <p className="text-sm">Nenhuma tarefa</p>
                </div>
              ) : tarefas.map(t => (
                <div key={t.id} className="flex items-start gap-3 bg-gray-50 hover:bg-gray-100 rounded-xl p-3 transition-colors">
                  <button onClick={() => toggleTask(t)} className="mt-0.5 flex-shrink-0 text-gray-400 hover:text-green-500 transition-colors">
                    {t.status === 'concluida' ? <CheckSquare size={18} className="text-green-500" /> : <Square size={18} />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium leading-snug ${t.status === 'concluida' ? 'line-through text-gray-400' : 'text-gray-800'}`}>{t.titulo}</p>
                    {t.vencimento && (
                      <p className="text-xs text-gray-400 mt-0.5">Vencimento: {format(parseISO(t.vencimento), 'dd/MM/yyyy')}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex-shrink-0 p-4 border-t border-gray-100">
              {addingTask ? (
                <div className="space-y-2">
                  <input autoFocus value={newTitle} onChange={e => setNewTitle(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') createTask() }}
                    placeholder="Título da tarefa"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  <div className="flex gap-2">
                    <button onClick={createTask} disabled={!newTitle.trim()}
                      className="flex-1 bg-primary text-white rounded-lg py-2 text-sm font-semibold hover:bg-primary-dark disabled:opacity-50">Criar</button>
                    <button onClick={() => setAddingTask(false)}
                      className="flex-1 border border-gray-200 text-gray-600 rounded-lg py-2 text-sm font-medium hover:bg-gray-50">Cancelar</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setAddingTask(true)}
                  className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 text-gray-400 hover:border-primary hover:text-primary rounded-xl py-3 text-sm font-medium transition-colors">
                  <Plus size={16} />Nova tarefa
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  )
}

// ── NovoLeadModal ─────────────────────────────────────────────────────────────

function NovoLeadModal({ etapas, onClose, onCreate }: {
  etapas: EtapaFunil[]; onClose: () => void; onCreate: (c: Contato) => void
}) {
  const [form, setForm] = useState({ nome: '', telefone: '', etapa_funil_id: '', status: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.telefone.trim()) { setError('Telefone é obrigatório'); return }
    setSaving(true)
    const { data, error: err } = await supabase.from('crm_contatos').insert({
      nome: form.nome || null, telefone: form.telefone.trim(),
      etapa_funil_id: form.etapa_funil_id || null,
      status: form.status || null,
    }).select('*, etapa:etapas_funil(*)').single()
    setSaving(false)
    if (err) { setError(err.message); return }
    onCreate(data as Contato)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-bold text-gray-900">Novo Lead</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
              <input value={form.nome} onChange={e => setForm(f => ({...f, nome: e.target.value}))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" placeholder="Nome do lead" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Telefone *</label>
              <input value={form.telefone} onChange={e => setForm(f => ({...f, telefone: e.target.value}))} required
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" placeholder="+55 11 99999-9999" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Etapa</label>
              <select value={form.etapa_funil_id} onChange={e => setForm(f => ({...f, etapa_funil_id: e.target.value}))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 bg-white">
                <option value="">Sem etapa</option>
                {etapas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select value={form.status} onChange={e => setForm(f => ({...f, status: e.target.value}))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 bg-white">
                <option value="">Sem status</option>
                <option value="lead">Lead</option>
                <option value="qualificado">Qualificado</option>
                <option value="cliente">Cliente</option>
                <option value="perdido">Perdido</option>
              </select>
            </div>
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <div className="flex gap-3 pt-2">
              <button type="submit" disabled={saving}
                className="flex-1 bg-primary text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-primary-dark disabled:opacity-60 transition-colors">
                {saving ? 'Criando...' : 'Criar Lead'}
              </button>
              <button type="button" onClick={onClose}
                className="flex-1 bg-gray-100 text-gray-600 rounded-lg py-2.5 text-sm font-medium hover:bg-gray-200 transition-colors">
                Cancelar
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

// ── PipelinePageInner ─────────────────────────────────────────────────────────

function PipelinePageInner() {
  const searchParams = useSearchParams()
  const viewParam = searchParams.get('view')
  const [view, setView] = useState<'kanban' | 'lista'>(viewParam === 'lista' ? 'lista' : 'kanban')
  const [etapas, setEtapas] = useState<EtapaFunil[]>([])
  const [contatos, setContatos] = useState<Contato[]>([])
  const [conversas, setConversas] = useState<Record<string, Conversa>>({})
  const [activeId, setActiveId] = useState<string | null>(null)
  const [panel, setPanel] = useState<Contato | null>(null)
  const [novoLeadOpen, setNovoLeadOpen] = useState(false)
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const [{ data: etapaData }, { data: contatoData }, { data: convData }] = await Promise.all([
      supabase.from('etapas_funil').select('*').order('ordem'),
      supabase.from('crm_contatos').select('*').order('atualizado_em', { ascending: false }).range(0, 999),
      supabase.from('conversas').select('telefone, historico, atualizado_em').range(0, 999),
    ])
    if (etapaData) setEtapas(etapaData as EtapaFunil[])
    if (contatoData) setContatos((contatoData as Contato[]).filter(c => !isGroupPhone(c.telefone)))
    if (convData) {
      const map: Record<string, Conversa> = {}
      ;(convData as Conversa[]).forEach(c => { map[c.telefone] = c })
      setConversas(map)
    }
  }

  async function loadListPage(p: number) {
    const from = p * 50, to = from + 49
    const { data } = await supabase.from('crm_contatos').select('*').order('atualizado_em', { ascending: false }).range(from, to)
    if (!data) return
    if (p === 0) setContatos((data as Contato[]).filter(c => !isGroupPhone(c.telefone)))
    else setContatos(prev => {
      const existing = new Set(prev.map(c => c.id))
      return [...prev, ...(data as Contato[]).filter(c => !isGroupPhone(c.telefone) && !existing.has(c.id))]
    })
    setHasMore(data.length === 50)
    setPage(p + 1)
  }

  function getUltimaMensagem(telefone: string): string | undefined {
    const conv = conversas[telefone]
    if (!conv?.historico?.length) return undefined
    const last = conv.historico[conv.historico.length - 1]
    if (isAudioMsg(last)) return '🎵 Áudio'
    if (isImageMsg(last)) return '🖼️ Imagem'
    return last.content
  }

  function getEtapa(id: string | null): EtapaFunil | undefined {
    return etapas.find(e => e.id === id)
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveId(null)
    if (!over) return
    const cardId = active.id as string
    const targetEtapaId = over.id as string
    if (!etapas.find(e => e.id === targetEtapaId)) return
    const contato = contatos.find(c => c.id === cardId)
    if (!contato || contato.etapa_funil_id === targetEtapaId) return
    setContatos(prev => prev.map(c => c.id === cardId ? { ...c, etapa_funil_id: targetEtapaId } : c))
    await supabase.from('crm_contatos').update({ etapa_funil_id: targetEtapaId }).eq('id', cardId)
  }

  function handleUpdate(id: string, patch: Partial<Contato>) {
    setContatos(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c))
    setPanel(prev => prev?.id === id ? { ...prev, ...patch } : prev)
  }

  const semEtapa = contatos.filter(c => !c.etapa_funil_id)
  const activeContato = activeId ? contatos.find(c => c.id === activeId) : null

  // Status badge colors
  const statusColor: Record<string, string> = {
    cliente: 'bg-green-100 text-green-700',
    qualificado: 'bg-blue-100 text-blue-700',
    perdido: 'bg-red-100 text-red-700',
    lead: 'bg-gray-100 text-gray-600',
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 pt-6 pb-4 flex-shrink-0 bg-white border-b border-gray-100">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900 uppercase tracking-wide">LEADS</h1>
          <div className="flex items-center gap-3">
            <div className="flex bg-gray-100 rounded-lg p-0.5">
              <button onClick={() => setView('kanban')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${view === 'kanban' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                <Kanban size={13} />Kanban
              </button>
              <button onClick={() => { setView('lista'); loadListPage(0) }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${view === 'lista' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                <LayoutList size={13} />Lista
              </button>
            </div>
            <button onClick={() => setNovoLeadOpen(true)}
              className="flex items-center gap-2 bg-primary text-white rounded-lg px-4 py-2 text-sm font-semibold hover:bg-primary-dark transition-colors">
              <Plus size={15} />NOVO LEAD
            </button>
          </div>
        </div>
        <p className="text-sm text-gray-400 mt-1">{contatos.length} leads no funil</p>
      </div>

      {/* Kanban view */}
      {view === 'kanban' && (
        <div className="flex-1 overflow-x-auto px-6 py-5">
          <DndContext sensors={sensors} collisionDetection={pointerWithin}
            onDragStart={e => setActiveId(e.active.id as string)} onDragEnd={handleDragEnd}>
            <div className="flex gap-5 h-full" style={{ minWidth: (etapas.length + 1) * 276 }}>
              {etapas.map(etapa => (
                <DroppableColumn key={etapa.id} etapa={etapa}
                  cards={contatos.filter(c => c.etapa_funil_id === etapa.id)}
                  getUltimaMensagem={getUltimaMensagem} getEtapa={getEtapa}
                  onCardClick={setPanel}
                />
              ))}
              {/* Sem etapa column */}
              {semEtapa.length > 0 && (
                <div className="w-64 flex-shrink-0 flex flex-col">
                  <div className="mb-3">
                    <div className="h-1 rounded-full mb-2.5 bg-gray-300" />
                    <div className="flex items-center gap-2">
                      <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide flex-1">SEM ETAPA</h2>
                      <span className="bg-gray-100 text-gray-500 text-[10px] font-semibold px-2 py-0.5 rounded-full">{semEtapa.length}</span>
                    </div>
                  </div>
                  <div className="flex-1 rounded-xl p-2 space-y-2 overflow-y-auto min-h-[120px] bg-gray-100/60">
                    {semEtapa.map(c => (
                      <KanbanCard key={c.id} contato={c} ultimaMensagem={getUltimaMensagem(c.telefone)} onClick={() => setPanel(c)} />
                    ))}
                  </div>
                </div>
              )}
            </div>
            <DragOverlay dropAnimation={{ duration: 150, easing: 'cubic-bezier(0.18,0.67,0.6,1.22)' }}>
              {activeContato && (
                <div className="bg-white rounded-xl p-3 shadow-xl border border-gray-200 rotate-1 w-64 opacity-95">
                  <div className="flex items-center gap-2">
                    <ContactAvatar nome={activeContato.nome} seed={activeContato.telefone} size={30} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{activeContato.nome ?? 'Sem nome'}</p>
                      <p className="text-xs text-gray-400">{formatPhone(activeContato.telefone)}</p>
                    </div>
                  </div>
                </div>
              )}
            </DragOverlay>
          </DndContext>
        </div>
      )}

      {/* Lista view */}
      {view === 'lista' && (
        <div className="flex-1 overflow-y-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100 sticky top-0">
              <tr>
                <th className="text-left p-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Nome</th>
                <th className="text-left p-4 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Telefone</th>
                <th className="text-left p-4 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Etapa</th>
                <th className="text-left p-4 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Status</th>
                <th className="text-left p-4 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden xl:table-cell">Data</th>
                <th className="p-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {contatos.map(c => {
                const etapa = getEtapa(c.etapa_funil_id)
                return (
                  <tr key={c.id} onClick={() => setPanel(c)} className="hover:bg-gray-50 cursor-pointer transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <ContactAvatar nome={c.nome} seed={c.telefone} size={36} fotoUrl={c.foto_url} />
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{c.nome ?? 'Sem nome'}</p>
                          <p className="text-xs text-gray-400 md:hidden">{formatPhone(c.telefone)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 hidden md:table-cell">
                      <span className="text-sm text-gray-600">{formatPhone(c.telefone)}</span>
                    </td>
                    <td className="p-4 hidden lg:table-cell">
                      {etapa && (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium text-white" style={{ backgroundColor: etapa.cor }}>
                          {etapa.nome}
                        </span>
                      )}
                    </td>
                    <td className="p-4 hidden lg:table-cell">
                      {c.status && (
                        <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium capitalize ${statusColor[c.status] ?? 'bg-gray-100 text-gray-600'}`}>{c.status}</span>
                      )}
                    </td>
                    <td className="p-4 hidden xl:table-cell text-sm text-gray-400">{formatDate(c.atualizado_em)}</td>
                    <td className="p-4">
                      <button onClick={e => { e.stopPropagation(); setPanel(c) }}
                        className="text-xs text-primary hover:underline">Detalhes</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {hasMore && (
            <div className="p-4 text-center">
              <button onClick={() => loadListPage(page)} className="text-sm text-primary hover:underline">Carregar mais</button>
            </div>
          )}
          {contatos.length === 0 && <div className="p-12 text-center text-gray-400 text-sm">Nenhum lead encontrado</div>}
        </div>
      )}

      {/* Contact panel */}
      {panel && (
        <ContactPanel contato={panel} etapas={etapas} onClose={() => setPanel(null)}
          onUpdate={patch => handleUpdate(panel.id, patch)} />
      )}

      {/* Novo lead modal */}
      {novoLeadOpen && (
        <NovoLeadModal etapas={etapas} onClose={() => setNovoLeadOpen(false)}
          onCreate={c => { setContatos(prev => [c, ...prev]); setNovoLeadOpen(false) }} />
      )}
    </div>
  )
}

export default function PipelinePage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>}>
      <PipelinePageInner />
    </Suspense>
  )
}
