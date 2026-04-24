'use client'
import React, { useEffect, useState, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { sendText, sendAudio, sendImage } from '@/lib/evolution'
import ContactAvatar from '@/components/ContactAvatar'
import AudioPlayer from '@/components/AudioPlayer'
import AudioRecorder from '@/components/AudioRecorder'
import ImageMessage from '@/components/ImageMessage'
import { formatPhone, formatDate, formatTime, isGroupPhone, getDateLabel } from '@/lib/utils'
import { Search, X, Plus, MessageSquare, CheckSquare, Square, Send, Paperclip, FileText } from 'lucide-react'
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

const STATUS_LABELS: Record<string, string> = {
  lead: 'Lead', qualificado: 'Qualificado', cliente: 'Cliente', perdido: 'Perdido'
}
const STATUS_COLORS: Record<string, string> = {
  cliente: 'bg-green-100 text-green-700',
  qualificado: 'bg-blue-100 text-blue-700',
  perdido: 'bg-red-100 text-red-700',
  lead: 'bg-gray-100 text-gray-600',
}

// ── Side panel ────────────────────────────────────────────────────────────────

function ContactSidePanel({ contato, etapas, onClose, onUpdate }: {
  contato: Contato; etapas: EtapaFunil[]; onClose: () => void
  onUpdate: (patch: Partial<Contato>) => void
}) {
  type Tab = 'historico' | 'tarefas' | 'detalhes'
  const [tab, setTab] = useState<Tab>('historico')
  const [conversa, setConversa] = useState<Conversa | null>(null)
  const [convLoading, setConvLoading] = useState(false)
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
  const [editOrigem, setEditOrigem] = useState(contato.origem ?? '')
  const [saving, setSaving] = useState(false)
  const [savedOk, setSavedOk] = useState(false)

  const [tarefas, setTarefas] = useState<Tarefa[]>([])
  const [addingTask, setAddingTask] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDate, setNewDate] = useState('')

  useEffect(() => {
    setTab('historico')
    setMsgText('')
    setPendingImage(null)
    setEditNome(contato.nome ?? '')
    setEditEmail(contato.email ?? '')
    setEditStatus(contato.status ?? '')
    setEditObs(contato.observacoes ?? '')
    setEditEtapa(contato.etapa_funil_id ?? '')
    setEditOrigem(contato.origem ?? '')
    loadConversa()
    loadTarefas()
  }, [contato.id])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [conversa?.historico?.length])

  async function loadConversa() {
    setConvLoading(true)
    const { data } = await supabase.from('conversas').select('*').eq('telefone', contato.telefone).maybeSingle()
    setConversa(data as Conversa | null)
    setConvLoading(false)
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
      } catch { alert('Erro ao enviar imagem') }
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
    } catch { alert('Erro ao enviar'); setMsgText(msg) }
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
    const patch = {
      nome: editNome || null, email: editEmail || null, status: editStatus || null,
      observacoes: editObs || null, etapa_funil_id: editEtapa || null, origem: editOrigem || null,
    }
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
    { key: 'historico', label: 'Histórico' },
    { key: 'tarefas', label: tarefas.length > 0 ? `Tarefas (${tarefas.length})` : 'Tarefas' },
    { key: 'detalhes', label: 'Detalhes' },
  ]

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[420px] bg-white shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 p-5 border-b border-gray-100">
          <div className="flex items-start gap-4">
            <ContactAvatar nome={contato.nome} seed={contato.telefone} size={56} fotoUrl={contato.foto_url} />
            <div className="flex-1 min-w-0">
              <p className="text-lg font-bold text-gray-900 truncate">{contato.nome ?? 'Sem nome'}</p>
              <p className="text-sm text-gray-500">{formatPhone(contato.telefone)}</p>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {contato.status && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold capitalize ${STATUS_COLORS[contato.status] ?? 'bg-gray-100 text-gray-600'}`}>{contato.status}</span>
                )}
                {contato.origem && (
                  <span className="text-xs bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full capitalize">{contato.origem}</span>
                )}
              </div>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1 rounded-lg hover:bg-gray-100 transition-colors flex-shrink-0"><X size={18} /></button>
          </div>
          <div className="flex mt-4 bg-gray-100 rounded-lg p-0.5 gap-0.5">
            {tabs.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab: Histórico */}
        {tab === 'historico' && (
          <>
            <input type="file" ref={fileInputRef} accept="image/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleImageSelect(f); e.target.value = '' }}
            />
            <div className="flex-1 overflow-y-auto p-3 space-y-1 bg-[#F0F2F5]"
              onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f?.type.startsWith('image/')) handleImageSelect(f) }}
            >
              {convLoading ? (
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
                </div>
                <button onClick={() => setPendingImage(null)} className="text-gray-400 hover:text-red-500 p-1"><X size={14} /></button>
              </div>
            )}
            <form onSubmit={handleSend} className="flex-shrink-0 p-3 bg-white border-t border-gray-100 flex gap-2 items-center">
              {!isRecording && (
                <button type="button" onClick={() => fileInputRef.current?.click()} disabled={sending}
                  className="w-9 h-9 flex items-center justify-center rounded-xl text-gray-400 hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-40">
                  <Paperclip size={17} />
                </button>
              )}
              {!isRecording && (
                <input value={msgText} onChange={e => setMsgText(e.target.value)}
                  placeholder={pendingImage ? 'Legenda...' : 'Digite uma mensagem...'}
                  className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              )}
              <AudioRecorder onSend={handleSendAudio} onRecordingChange={setIsRecording} disabled={sending} />
              {!isRecording && (
                <button type="submit" disabled={(!msgText.trim() && !pendingImage) || sending}
                  className="bg-primary text-white rounded-xl px-3 py-2.5 hover:bg-primary-dark disabled:opacity-50 transition-colors">
                  <Send size={15} />
                </button>
              )}
            </form>
          </>
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
                  <button onClick={() => toggleTask(t)} className="mt-0.5 flex-shrink-0">
                    {t.status === 'concluida' ? <CheckSquare size={18} className="text-green-500" /> : <Square size={18} className="text-gray-300" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${t.status === 'concluida' ? 'line-through text-gray-400' : 'text-gray-800'}`}>{t.titulo}</p>
                    {t.vencimento && <p className="text-xs text-gray-400 mt-0.5">{t.vencimento}</p>}
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
                    <button onClick={createTask} disabled={!newTitle.trim()} className="flex-1 bg-primary text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-50">Criar</button>
                    <button onClick={() => setAddingTask(false)} className="flex-1 border border-gray-200 text-gray-600 rounded-lg py-2 text-sm">Cancelar</button>
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

        {/* Tab: Detalhes */}
        {tab === 'detalhes' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {[
              { label: 'Nome', value: editNome, setter: setEditNome, type: 'text' },
              { label: 'Email', value: editEmail, setter: setEditEmail, type: 'email' },
              { label: 'Origem', value: editOrigem, setter: setEditOrigem, type: 'text' },
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
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none bg-white">
                <option value="">Sem status</option>
                {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Etapa do Funil</label>
              <select value={editEtapa} onChange={e => setEditEtapa(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none bg-white">
                <option value="">Sem etapa</option>
                {etapas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Observações</label>
              <textarea value={editObs} onChange={e => setEditObs(e.target.value)} rows={5} placeholder="Notas sobre o contato..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none resize-none" />
            </div>
            <button onClick={saveDetails} disabled={saving}
              className={`w-full rounded-lg py-2.5 text-sm font-semibold transition-all ${savedOk ? 'bg-green-500 text-white' : 'bg-primary text-white hover:bg-primary-dark disabled:opacity-50'}`}>
              {savedOk ? '✓ Salvo!' : saving ? 'Salvando...' : 'Salvar alterações'}
            </button>
          </div>
        )}
      </div>
    </>
  )
}

// ── NovoContatoModal ──────────────────────────────────────────────────────────

function NovoContatoModal({ etapas, onClose, onCreate }: {
  etapas: EtapaFunil[]; onClose: () => void; onCreate: () => void
}) {
  const [form, setForm] = useState({ nome: '', telefone: '', email: '', status: '', etapa_funil_id: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.telefone.trim()) { setError('Telefone é obrigatório'); return }
    setSaving(true)
    const { error: err } = await supabase.from('crm_contatos').insert({
      nome: form.nome || null, telefone: form.telefone.trim(),
      email: form.email || null, status: form.status || null,
      etapa_funil_id: form.etapa_funil_id || null,
    })
    setSaving(false)
    if (err) { setError(err.message); return }
    onCreate()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-bold text-gray-900">Novo Contato</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
              <input value={form.nome} onChange={e => setForm(f => ({...f, nome: e.target.value}))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" placeholder="Nome completo" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Telefone *</label>
              <input value={form.telefone} onChange={e => setForm(f => ({...f, telefone: e.target.value}))} required
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" placeholder="+55 11 99999-9999" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" placeholder="email@exemplo.com" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select value={form.status} onChange={e => setForm(f => ({...f, status: e.target.value}))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none bg-white">
                  <option value="">—</option>
                  {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Etapa</label>
                <select value={form.etapa_funil_id} onChange={e => setForm(f => ({...f, etapa_funil_id: e.target.value}))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none bg-white">
                  <option value="">—</option>
                  {etapas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
                </select>
              </div>
            </div>
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <div className="flex gap-3 pt-2">
              <button type="submit" disabled={saving}
                className="flex-1 bg-primary text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-primary-dark disabled:opacity-60">
                {saving ? 'Criando...' : 'Criar Contato'}
              </button>
              <button type="button" onClick={onClose} className="flex-1 bg-gray-100 text-gray-600 rounded-lg py-2.5 text-sm font-medium hover:bg-gray-200">
                Cancelar
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ContatosPage() {
  const [contatos, setContatos] = useState<Contato[]>([])
  const [etapas, setEtapas] = useState<EtapaFunil[]>([])
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [selected, setSelected] = useState<Contato | null>(null)
  const [novoOpen, setNovoOpen] = useState(false)
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  const loadPage = useCallback(async (p: number, search = '') => {
    const from = p * 50, to = from + 49
    let q = supabase.from('crm_contatos').select('*, etapa:etapas_funil(*)').order('atualizado_em', { ascending: false }).range(from, to)
    if (search) q = q.ilike('nome', `%${search}%`)
    if (filtroStatus) q = q.eq('status', filtroStatus)
    const { data } = await q
    if (!data) return
    const filtered = (data as Contato[]).filter(c => !isGroupPhone(c.telefone))
    if (p === 0) setContatos(filtered)
    else setContatos(prev => {
      const ids = new Set(prev.map(c => c.id))
      return [...prev, ...filtered.filter(c => !ids.has(c.id))]
    })
    setHasMore(data.length === 50)
    setPage(p + 1)
  }, [filtroStatus])

  useEffect(() => {
    supabase.from('etapas_funil').select('*').order('ordem').then(({ data }) => { if (data) setEtapas(data as EtapaFunil[]) })
    loadPage(0)
  }, [loadPage])

  // Debounced search
  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => loadPage(0, busca), 300)
    return () => clearTimeout(debounceRef.current)
  }, [busca, loadPage])

  async function loadMore() {
    setLoadingMore(true)
    await loadPage(page, busca)
    setLoadingMore(false)
  }

  function handleUpdate(patch: Partial<Contato>) {
    if (!selected) return
    setContatos(prev => prev.map(c => c.id === selected.id ? { ...c, ...patch } : c))
    setSelected(prev => prev ? { ...prev, ...patch } : null)
  }

  const statusFilters = ['', 'lead', 'qualificado', 'cliente', 'perdido']
  const statusLabels: Record<string, string> = { '': 'Todos', lead: 'Lead', qualificado: 'Qualificado', cliente: 'Cliente', perdido: 'Perdido' }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 pt-6 pb-4 flex-shrink-0 bg-white border-b border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-gray-900">Contatos</h1>
          <button onClick={() => setNovoOpen(true)}
            className="flex items-center gap-2 bg-primary text-white rounded-lg px-4 py-2 text-sm font-semibold hover:bg-primary-dark transition-colors">
            <Plus size={15} />NOVO CONTATO
          </button>
        </div>
        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={busca} onChange={e => setBusca(e.target.value)}
              placeholder="Buscar por nome, telefone ou email..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
          </div>
          <div className="flex gap-1">
            {statusFilters.map(s => (
              <button key={s} onClick={() => { setFiltroStatus(s); loadPage(0, busca) }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${filtroStatus === s ? 'bg-primary text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                {statusLabels[s]}
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-2">{contatos.length} contatos{hasMore ? '+' : ''}</p>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100 sticky top-0">
            <tr>
              <th className="text-left p-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Contato</th>
              <th className="text-left p-4 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Telefone</th>
              <th className="text-left p-4 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Email</th>
              <th className="text-left p-4 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Origem</th>
              <th className="text-left p-4 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Status</th>
              <th className="text-left p-4 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden xl:table-cell">Etapa</th>
              <th className="text-left p-4 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden xl:table-cell">Data</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {contatos.map(c => (
              <tr key={c.id} onClick={() => setSelected(c)} className="hover:bg-gray-50 cursor-pointer transition-colors">
                <td className="p-4">
                  <div className="flex items-center gap-3">
                    <ContactAvatar nome={c.nome} seed={c.telefone} size={36} fotoUrl={c.foto_url} />
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{c.nome ?? 'Sem nome'}</p>
                      <p className="text-xs text-gray-400 md:hidden">{formatPhone(c.telefone)}</p>
                    </div>
                  </div>
                </td>
                <td className="p-4 hidden md:table-cell text-sm text-gray-600">{formatPhone(c.telefone)}</td>
                <td className="p-4 hidden lg:table-cell text-sm text-gray-500 truncate max-w-[140px]">{c.email ?? '—'}</td>
                <td className="p-4 hidden lg:table-cell text-sm text-gray-500 capitalize">{c.origem ?? '—'}</td>
                <td className="p-4 hidden lg:table-cell">
                  {c.status && <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium capitalize ${STATUS_COLORS[c.status] ?? 'bg-gray-100 text-gray-600'}`}>{c.status}</span>}
                </td>
                <td className="p-4 hidden xl:table-cell">
                  {c.etapa && (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium text-white" style={{ backgroundColor: c.etapa.cor }}>
                      {c.etapa.nome}
                    </span>
                  )}
                </td>
                <td className="p-4 hidden xl:table-cell text-sm text-gray-400">{formatDate(c.atualizado_em)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {contatos.length === 0 && <div className="p-12 text-center text-gray-400 text-sm">Nenhum contato encontrado</div>}
        {hasMore && (
          <div className="p-4 text-center">
            <button onClick={loadMore} disabled={loadingMore} className="text-sm text-primary hover:underline disabled:opacity-50">
              {loadingMore ? 'Carregando...' : 'Carregar mais'}
            </button>
          </div>
        )}
      </div>

      {/* Side panel */}
      {selected && (
        <ContactSidePanel contato={selected} etapas={etapas} onClose={() => setSelected(null)} onUpdate={handleUpdate} />
      )}

      {/* Novo contato modal */}
      {novoOpen && (
        <NovoContatoModal etapas={etapas} onClose={() => setNovoOpen(false)} onCreate={() => loadPage(0, busca)} />
      )}
    </div>
  )
}
