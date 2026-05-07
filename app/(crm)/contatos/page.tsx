'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Search, Plus, X, Send, Paperclip, MessageSquare,
  Check, CheckCheck, SlidersHorizontal, Download, Upload, RefreshCw,
} from 'lucide-react'
import { isPast, isToday, parseISO } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { sendText, sendAudio, sendImage } from '@/lib/evolution'
import { formatPhone, formatDate, getDateLabel } from '@/lib/utils'
import ContactAvatar from '@/components/ContactAvatar'
import AudioRecorder from '@/components/AudioRecorder'
import AudioPlayer from '@/components/AudioPlayer'
import ImageMessage from '@/components/ImageMessage'
import type { Contato, Conversa, EtapaFunil, Mensagem, Tarefa } from '@/types'

/* ─── helpers ─── */
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

const STATUS_COLORS: Record<string, string> = {
  ativo: '#22C55E', qualificado: '#3B82F6',
  ganho: '#15803D', perdido: '#EF4444', novo: '#6B7280',
}
const STATUS_LABELS: Record<string, string> = {
  ativo: 'Ativo', qualificado: 'Qualificado',
  ganho: 'Ganho', perdido: 'Perdido', novo: 'Novo',
}
const PAGE = 50

/* ──────────────────────────────────────────
   CONTACT PANEL (slide-in 480px)
────────────────────────────────────────── */
interface PanelProps {
  contato: Contato; etapas: EtapaFunil[]
  onClose: () => void; onUpdate: (c: Contato) => void
}

function ContatoPanel({ contato, etapas, onClose, onUpdate }: PanelProps) {
  const [tab, setTab] = useState<'conversa' | 'detalhes' | 'tarefas' | 'notas'>('conversa')
  const [localConv, setLocalConv] = useState<Conversa | null>(null)

  /* chat */
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [pendingImage, setPendingImage] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isRecording, setIsRecording] = useState(false)

  /* detalhes */
  const [nome, setNome] = useState(contato.nome ?? '')
  const [telefone, setTelefone] = useState(contato.telefone)
  const [email, setEmail] = useState(contato.email ?? '')
  const [empresa, setEmpresa] = useState(
    ((contato.campos_custom as Record<string, unknown>)?.empresa as string) ?? '')
  const [cargo, setCargo] = useState(
    ((contato.campos_custom as Record<string, unknown>)?.posicao as string) ?? '')
  const [origem, setOrigem] = useState(contato.origem ?? '')
  const [status, setStatus] = useState(contato.status ?? '')
  const [etapaId, setEtapaId] = useState(contato.etapa_funil_id ?? '')
  const [valor, setValor] = useState(
    String((contato.campos_custom as Record<string, unknown>)?.valor ?? ''))
  const [obs, setObs] = useState(contato.observacoes ?? '')
  const [saving, setSaving] = useState(false)

  /* tarefas */
  const [tarefas, setTarefas] = useState<Tarefa[]>([])
  const [showAddTask, setShowAddTask] = useState(false)
  const [novaTarefa, setNovaTarefa] = useState('')
  const [novaTarefaDesc, setNovaTarefaDesc] = useState('')
  const [novaTarefaVenc, setNovaTarefaVenc] = useState('')

  /* notas */
  const [notas, setNotas] = useState(contato.observacoes ?? '')
  const [savingNotas, setSavingNotas] = useState(false)

  const fileRef = useRef<HTMLInputElement>(null)
  const msgsEndRef = useRef<HTMLDivElement>(null)

  /* load conv + realtime */
  useEffect(() => {
    supabase.from('conversas').select('*').eq('telefone', contato.telefone).maybeSingle()
      .then(({ data }) => { if (data) setLocalConv(data as Conversa) })
    const ch = supabase.channel(`cpanel-${contato.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversas' }, payload => {
        const row = payload.new as Conversa
        if (row?.telefone === contato.telefone) setLocalConv(row)
      }).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [contato.telefone, contato.id])

  /* load tasks */
  useEffect(() => {
    supabase.from('tarefas').select('*').eq('contato_id', contato.id)
      .order('criado_em', { ascending: false })
      .then(({ data }) => { if (data) setTarefas(data as Tarefa[]) })
  }, [contato.id])

  /* scroll to bottom */
  useEffect(() => { msgsEndRef.current?.scrollIntoView() }, [localConv?.historico?.length])

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim() && !pendingImage) return
    setSending(true)
    try {
      if (pendingImage) { await sendImage(contato.telefone, pendingImage); setPendingImage(null) }
      if (text.trim()) { await sendText(contato.telefone, text.trim()); setText('') }
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

  async function saveDetails() {
    setSaving(true)
    const campos = {
      ...(contato.campos_custom as Record<string, unknown> ?? {}),
      empresa, posicao: cargo, valor: Number(valor) || 0,
    }
    const { data } = await supabase.from('crm_contatos')
      .update({ nome, telefone, email, origem: origem || null, status, etapa_funil_id: etapaId || null, observacoes: obs, campos_custom: campos })
      .eq('id', contato.id).select().single()
    if (data) onUpdate(data as Contato)
    setSaving(false)
  }

  async function saveNotas() {
    setSavingNotas(true)
    await supabase.from('crm_contatos').update({ observacoes: notas }).eq('id', contato.id)
    setSavingNotas(false)
  }

  async function addTarefa() {
    if (!novaTarefa.trim()) return
    const { data } = await supabase.from('tarefas').insert({
      titulo: novaTarefa.trim(), descricao: novaTarefaDesc || null,
      contato_id: contato.id, status: 'pendente', vencimento: novaTarefaVenc || null,
    }).select().single()
    if (data) {
      setTarefas(prev => [data as Tarefa, ...prev])
      setNovaTarefa(''); setNovaTarefaDesc(''); setNovaTarefaVenc('')
      setShowAddTask(false)
    }
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

  const etapaBadge = etapas.find(e => e.id === contato.etapa_funil_id)
  const TABS = [
    { id: 'conversa', label: 'Conversa' },
    { id: 'detalhes', label: 'Detalhes' },
    { id: 'tarefas', label: `Tarefas${tarefas.length ? ` (${tarefas.length})` : ''}` },
    { id: 'notas', label: 'Notas' },
  ] as const

  return (
    <>
      <div className="fixed inset-0 bg-black/25 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-screen w-[480px] bg-white shadow-2xl z-50 flex flex-col border-l border-gray-200">

        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-start gap-4 mb-3">
            <ContactAvatar nome={contato.nome} telefone={contato.telefone}
              fotoUrl={contato.foto_url} size={64} />
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-gray-900 truncate">{contato.nome || formatPhone(contato.telefone)}</h2>
              <a href={`tel:+${contato.telefone.replace(/\D/g, '')}`}
                className="text-sm text-primary hover:underline">{formatPhone(contato.telefone)}</a>
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                {etapaBadge && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold text-white"
                    style={{ backgroundColor: etapaBadge.cor }}>
                    {etapaBadge.nome}
                  </span>
                )}
                {contato.status && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold text-white"
                    style={{ backgroundColor: STATUS_COLORS[contato.status] ?? '#6B7280' }}>
                    {STATUS_LABELS[contato.status] ?? contato.status}
                  </span>
                )}
              </div>
            </div>
            <button onClick={onClose}
              className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0">
              <X size={18} />
            </button>
          </div>
          {/* Action buttons */}
          <div className="flex gap-2">
            <a href={`/inbox?tel=${contato.telefone}`}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
              <MessageSquare size={13} /> Chat
            </a>
            <button onClick={() => setTab('detalhes')}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
              ✏️ Editar
            </button>
            <a href={`https://wa.me/${contato.telefone.replace(/\D/g, '')}`}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center px-3 py-2 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
              🔗
            </a>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 flex-shrink-0 px-2">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-3 py-2.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                tab === t.id
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-gray-500 hover:text-gray-700'
              }`}>
              {t.label}
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
                                : <span className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                                    {msg.content?.replace(/^\[(?:audio|ptt|image|document):[^\]]+\]\s*/, '')}
                                  </span>
                          }
                          <div className={`flex items-center gap-1 mt-0.5 ${isOwn ? 'justify-end' : ''}`}>
                            <span className="text-[10px] text-gray-400">
                              {msg.timestamp
                                ? new Date(msg.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                                : ''}
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
                <div className="flex items-center justify-center h-32 text-gray-400 text-sm">Sem histórico</div>
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
                <textarea value={text} onChange={e => setText(e.target.value)}
                  placeholder="Escreva uma mensagem..." disabled={isRecording || sending}
                  rows={1} className="flex-1 bg-gray-100 rounded-xl px-3 py-2 text-sm focus:outline-none resize-none"
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
          <div className="flex-1 overflow-y-auto p-5">
            <div className="grid grid-cols-2 gap-4">
              {([
                { label: 'Nome', val: nome, set: setNome, type: 'text', span: false },
                { label: 'Telefone', val: telefone, set: setTelefone, type: 'text', span: false },
                { label: 'E-mail', val: email, set: setEmail, type: 'email', span: false },
                { label: 'Empresa', val: empresa, set: setEmpresa, type: 'text', span: false },
                { label: 'Cargo / Posição', val: cargo, set: setCargo, type: 'text', span: false },
                { label: 'Valor R$', val: valor, set: setValor, type: 'number', span: false },
              ] as { label: string; val: string; set: (v: string) => void; type: string; span: boolean }[]).map(f => (
                <div key={f.label} className={f.span ? 'col-span-2' : ''}>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide block mb-1">{f.label}</label>
                  <input type={f.type} value={f.val} onChange={e => f.set(e.target.value)}
                    className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-primary" />
                </div>
              ))}

              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide block mb-1">Origem</label>
                <select value={origem} onChange={e => setOrigem(e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-primary bg-white">
                  <option value="">—</option>
                  {['whatsapp', 'manual', 'indicação', 'site'].map(o => (
                    <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide block mb-1">Status</label>
                <select value={status} onChange={e => setStatus(e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-primary bg-white">
                  <option value="">—</option>
                  {['ativo', 'qualificado', 'ganho', 'perdido'].map(s => (
                    <option key={s} value={s}>{STATUS_LABELS[s] ?? s}</option>
                  ))}
                </select>
              </div>

              <div className="col-span-2">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide block mb-1">Etapa do funil</label>
                <select value={etapaId} onChange={e => setEtapaId(e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-primary bg-white">
                  <option value="">Sem etapa</option>
                  {etapas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
                </select>
              </div>

              <div className="col-span-2">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide block mb-1">Observações</label>
                <textarea value={obs} onChange={e => setObs(e.target.value)} rows={3}
                  className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-primary resize-none" />
              </div>
            </div>

            <button onClick={saveDetails} disabled={saving}
              className="w-full mt-5 bg-primary text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-primary-dark disabled:opacity-60 transition-colors">
              {saving ? 'Salvando…' : 'Salvar alterações'}
            </button>
          </div>
        )}

        {/* ── Tarefas ── */}
        {tab === 'tarefas' && (
          <div className="flex-1 overflow-y-auto p-4">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-gray-800">Tarefas</p>
              <button onClick={() => setShowAddTask(v => !v)}
                className="flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary-dark">
                <Plus size={13} /> Nova Tarefa
              </button>
            </div>

            {showAddTask && (
              <div className="bg-gray-50 rounded-xl p-3 mb-4 space-y-2.5 border border-gray-100">
                <input value={novaTarefa} onChange={e => setNovaTarefa(e.target.value)}
                  placeholder="Título da tarefa *" autoFocus
                  className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-primary bg-white" />
                <textarea value={novaTarefaDesc} onChange={e => setNovaTarefaDesc(e.target.value)}
                  placeholder="Descrição (opcional)" rows={2}
                  className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-primary bg-white resize-none" />
                <input type="datetime-local" value={novaTarefaVenc} onChange={e => setNovaTarefaVenc(e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-primary bg-white" />
                <div className="flex gap-2">
                  <button onClick={addTarefa} disabled={!novaTarefa.trim()}
                    className="flex-1 bg-primary text-white rounded-xl py-2 text-sm font-semibold disabled:opacity-50">
                    Adicionar
                  </button>
                  <button onClick={() => { setShowAddTask(false); setNovaTarefa(''); setNovaTarefaDesc(''); setNovaTarefaVenc('') }}
                    className="px-3 border border-gray-200 rounded-xl text-sm text-gray-500 hover:bg-gray-50">
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
                  <div key={t.id} className={`p-3 rounded-xl border ${
                    isVencida ? 'bg-red-50 border-red-100' : 'bg-gray-50 border-gray-100'
                  }`}>
                    <div className="flex items-start gap-2.5">
                      <button onClick={() => toggleTarefa(t)}
                        className={`mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                          t.status === 'concluida' ? 'bg-green-500 border-green-500'
                            : isVencida ? 'border-red-400 hover:border-red-600' : 'border-gray-300 hover:border-green-400'
                        }`}>
                        {t.status === 'concluida' && <Check size={8} className="text-white" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${
                          t.status === 'concluida' ? 'line-through text-gray-400'
                            : isVencida ? 'text-red-700' : 'text-gray-900'
                        }`}>{t.titulo}</p>
                        {t.descricao && <p className="text-xs text-gray-500 mt-0.5">{t.descricao}</p>}
                        {t.vencimento && (
                          <p className={`text-[10px] mt-1 font-medium ${isVencida ? 'text-red-500' : 'text-gray-400'}`}>
                            {isVencida ? '⚠️ Vencida · ' : '📅 '}
                            {new Date(t.vencimento).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        )}
                      </div>
                      {isVencida && (
                        <span className="text-[9px] font-bold text-red-500 bg-red-100 px-1.5 py-0.5 rounded-full flex-shrink-0">
                          VENCIDA
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
              {tarefas.length === 0 && (
                <div className="text-center py-10 text-gray-400 text-sm">Nenhuma tarefa</div>
              )}
            </div>
          </div>
        )}

        {/* ── Notas ── */}
        {tab === 'notas' && (
          <div className="flex-1 flex flex-col p-4">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Notas rápidas</p>
            <textarea
              value={notas}
              onChange={e => setNotas(e.target.value)}
              onBlur={saveNotas}
              placeholder="Escreva suas notas aqui... (salvo automaticamente ao sair do campo)"
              className="flex-1 text-sm text-gray-700 border border-gray-200 rounded-xl p-4 focus:outline-none focus:border-primary resize-none"
            />
            <div className="flex items-center justify-between mt-3">
              {savingNotas
                ? <p className="text-xs text-gray-400">Salvando...</p>
                : <p className="text-xs text-gray-400">Auto-salvo ao sair do campo</p>}
              <button onClick={saveNotas} disabled={savingNotas}
                className="text-xs font-semibold text-primary hover:text-primary-dark disabled:opacity-50">
                Salvar agora
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

/* ──────────────────────────────────────────
   NOVO CONTATO MODAL
────────────────────────────────────────── */
interface NovoContatoProps { etapas: EtapaFunil[]; onClose: () => void; onCreated: (c: Contato) => void }

function NovoContatoModal({ etapas, onClose, onCreated }: NovoContatoProps) {
  const [nome, setNome] = useState('')
  const [tel, setTel] = useState('')
  const [email, setEmail] = useState('')
  const [empresa, setEmpresa] = useState('')
  const [etapaId, setEtapaId] = useState('')
  const [status, setStatus] = useState('ativo')
  const [origem, setOrigem] = useState('manual')
  const [criando, setCriando] = useState(false)

  async function criar() {
    if (!tel.trim()) return
    setCriando(true)
    try {
      const { data } = await supabase.from('crm_contatos').insert({
        nome: nome.trim() || null, telefone: tel.trim(),
        email: email.trim() || null, status, origem,
        etapa_funil_id: etapaId || null,
        campos_custom: { empresa: empresa.trim() || null },
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
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-bold text-gray-900">Novo Contato</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>
        <div className="space-y-3">
          <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome"
            className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-primary" />
          <input value={tel} onChange={e => setTel(e.target.value)} placeholder="Telefone *"
            className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-primary" />
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="E-mail"
            className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-primary" />
          <input value={empresa} onChange={e => setEmpresa(e.target.value)} placeholder="Empresa"
            className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-primary" />
          <select value={etapaId} onChange={e => setEtapaId(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-primary bg-white">
            <option value="">Sem etapa</option>
            {etapas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-3">
            <select value={status} onChange={e => setStatus(e.target.value)}
              className="text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-primary bg-white">
              {['ativo', 'qualificado', 'ganho', 'perdido'].map(s => (
                <option key={s} value={s}>{STATUS_LABELS[s] ?? s}</option>
              ))}
            </select>
            <select value={origem} onChange={e => setOrigem(e.target.value)}
              className="text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-primary bg-white">
              {['manual', 'whatsapp', 'indicação', 'site'].map(o => (
                <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose}
            className="flex-1 border border-gray-200 text-gray-600 rounded-xl py-2.5 text-sm font-medium hover:bg-gray-50">
            Cancelar
          </button>
          <button onClick={criar} disabled={criando || !tel.trim()}
            className="flex-1 bg-primary text-white rounded-xl py-2.5 text-sm font-bold hover:bg-primary-dark disabled:opacity-60 transition-colors">
            {criando ? 'Criando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────
   MAIN PAGE
────────────────────────────────────────── */
type SortBy = 'atualizado_em' | 'nome' | 'criado_em'

type ConversaPreview = { lastMsg: string; lastMsgTime: string }

function getMsgPreview(hist: Mensagem[]): string {
  const last = hist[hist.length - 1]
  if (!last) return ''
  let txt = last.content ?? ''
  txt = txt.replace(/^\[(?:audio|ptt|image|document):[^\]]+\]\s*/, '')
  if (!txt) {
    if (last.media_type === 'audio' || last.media_type === 'ptt') return '🎤 Áudio'
    if (last.media_type === 'image') return '🖼️ Imagem'
    if (last.media_type === 'document') return '📄 Documento'
  }
  return txt.slice(0, 90)
}

function getDisplayName(c: Contato): string {
  if (c.nome && c.nome.trim() && c.nome !== c.telefone) return c.nome.trim()
  return formatPhone(c.telefone)
}

export default function ContatosPage() {
  const [contatos, setContatos] = useState<Contato[]>([])
  const [etapas, setEtapas] = useState<EtapaFunil[]>([])
  const [total, setTotal] = useState(0)
  const [pg, setPg] = useState(0)
  const [sortBy, setSortBy] = useState<SortBy>('atualizado_em')
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [previews, setPreviews] = useState<Record<string, ConversaPreview>>({})

  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterEtapa, setFilterEtapa] = useState('')
  const [filterOrigem, setFilterOrigem] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [panelContato, setPanelContato] = useState<Contato | null>(null)
  const [showNovo, setShowNovo] = useState(false)

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const filtersRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async (
    q: string, sStatus: string, sEtapa: string, sOrigem: string,
    page: number, sort: SortBy, silent = false,
  ) => {
    if (!silent) setLoading(true)

    // ── 1. Count (separate HEAD query) ──────────────────────────
    let cntQ = supabase.from('crm_contatos').select('*', { count: 'exact', head: true })
    if (q) cntQ = cntQ.or(`nome.ilike.%${q}%,telefone.ilike.%${q}%,email.ilike.%${q}%`)
    if (sStatus) cntQ = cntQ.eq('status', sStatus)
    if (sEtapa) cntQ = cntQ.eq('etapa_funil_id', sEtapa)
    if (sOrigem) cntQ = cntQ.eq('origem', sOrigem)

    // ── 2. Data query with pagination ────────────────────────────
    let dtQ = supabase.from('crm_contatos').select('*')
    if (q) dtQ = dtQ.or(`nome.ilike.%${q}%,telefone.ilike.%${q}%,email.ilike.%${q}%`)
    if (sStatus) dtQ = dtQ.eq('status', sStatus)
    if (sEtapa) dtQ = dtQ.eq('etapa_funil_id', sEtapa)
    if (sOrigem) dtQ = dtQ.eq('origem', sOrigem)
    if (sort === 'nome') dtQ = dtQ.order('nome', { ascending: true, nullsFirst: false })
    else if (sort === 'criado_em') dtQ = dtQ.order('criado_em', { ascending: true })
    else dtQ = dtQ.order('atualizado_em', { ascending: false })
    dtQ = dtQ.range(page * PAGE, page * PAGE + PAGE - 1)

    const [{ count }, { data }] = await Promise.all([cntQ, dtQ])
    const contacts = (data ?? []) as Contato[]
    setContatos(contacts)
    setTotal(count ?? 0)
    setPg(page)

    // ── 3. Conversation previews (batch fetch) ────────────────────
    if (contacts.length > 0) {
      const phones = contacts.map(c => c.telefone)
      const { data: convs } = await supabase
        .from('conversas')
        .select('telefone, historico, atualizado_em')
        .in('telefone', phones)
      if (convs) {
        const map: Record<string, ConversaPreview> = {}
        convs.forEach(conv => {
          const preview = getMsgPreview((conv.historico ?? []) as Mensagem[])
          if (preview) map[conv.telefone] = { lastMsg: preview, lastMsgTime: conv.atualizado_em }
        })
        setPreviews(map)
      }
    }

    if (!silent) setLoading(false)
  }, [])

  // ── Realtime subscription ──────────────────────────────────────
  useEffect(() => {
    const ch = supabase.channel('contatos-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'crm_contatos' }, payload => {
        const novo = payload.new as Contato
        setContatos(prev => [novo, ...prev])
        setTotal(t => t + 1)
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'crm_contatos' }, payload => {
        const updated = payload.new as Contato
        setContatos(prev => prev.map(c => c.id === updated.id ? updated : c))
        setPanelContato(prev => prev?.id === updated.id ? updated : prev)
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  useEffect(() => {
    load('', '', '', '', 0, 'atualizado_em')
    supabase.from('etapas_funil').select('*').order('ordem')
      .then(({ data }) => { if (data) setEtapas(data as EtapaFunil[]) })
  }, [load])

  useEffect(() => {
    function h(e: MouseEvent) {
      if (filtersRef.current && !filtersRef.current.contains(e.target as Node)) setShowFilters(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  function handleSearch(val: string) {
    setSearch(val)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => load(val, filterStatus, filterEtapa, filterOrigem, 0, sortBy), 300)
  }

  function applyFilter(key: 'status' | 'etapa' | 'origem', val: string) {
    const ns = key === 'status' ? val : filterStatus
    const ne = key === 'etapa' ? val : filterEtapa
    const no = key === 'origem' ? val : filterOrigem
    if (key === 'status') setFilterStatus(val)
    if (key === 'etapa') setFilterEtapa(val)
    if (key === 'origem') setFilterOrigem(val)
    load(search, ns, ne, no, 0, sortBy)
  }

  function clearFilters() {
    setFilterStatus(''); setFilterEtapa(''); setFilterOrigem('')
    load(search, '', '', '', 0, sortBy)
  }

  function handleSort(s: SortBy) {
    setSortBy(s)
    load(search, filterStatus, filterEtapa, filterOrigem, 0, s)
  }

  async function handleRefresh() {
    setRefreshing(true)
    await load(search, filterStatus, filterEtapa, filterOrigem, pg, sortBy, true)
    setRefreshing(false)
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleSelectAll() {
    setSelectedIds(prev =>
      prev.size === contatos.length ? new Set() : new Set(contatos.map(c => c.id))
    )
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE))

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ── */}
      <div className="px-5 py-3 border-b border-gray-200 bg-white flex items-center gap-3 flex-shrink-0">
        <span className="text-sm font-bold text-gray-800 tracking-widest uppercase flex-shrink-0">Contatos</span>

        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input value={search} onChange={e => handleSearch(e.target.value)}
            placeholder="Buscar por nome, telefone ou e-mail..."
            className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:border-primary" />
        </div>

        {/* Filters dropdown */}
        <div className="relative flex-shrink-0" ref={filtersRef}>
          <button onClick={() => setShowFilters(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-2 border rounded-xl text-xs font-semibold transition-colors ${
              (filterStatus || filterEtapa || filterOrigem) || showFilters
                ? 'border-primary text-primary bg-primary/5' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}>
            <SlidersHorizontal size={13} />
            Filtros {(filterStatus || filterEtapa || filterOrigem) ? '●' : ''}
          </button>
          {showFilters && (
            <div className="absolute left-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-20 w-64 p-3 space-y-3">
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Status</p>
                <select value={filterStatus} onChange={e => applyFilter('status', e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none bg-white">
                  <option value="">Todos</option>
                  {['ativo', 'qualificado', 'ganho', 'perdido'].map(s => (
                    <option key={s} value={s}>{STATUS_LABELS[s] ?? s}</option>
                  ))}
                </select>
              </div>
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Etapa</p>
                <select value={filterEtapa} onChange={e => applyFilter('etapa', e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none bg-white">
                  <option value="">Todas</option>
                  {etapas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
                </select>
              </div>
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Origem</p>
                <select value={filterOrigem} onChange={e => applyFilter('origem', e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none bg-white">
                  <option value="">Todas</option>
                  {['whatsapp', 'manual', 'indicação', 'site'].map(o => (
                    <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>
                  ))}
                </select>
              </div>
              {(filterStatus || filterEtapa || filterOrigem) && (
                <button onClick={clearFilters}
                  className="w-full text-xs text-red-500 hover:text-red-700 font-semibold py-1 border-t border-gray-100 pt-2">
                  Limpar filtros
                </button>
              )}
            </div>
          )}
        </div>

        {/* Sort */}
        <select value={sortBy} onChange={e => handleSort(e.target.value as SortBy)}
          className="text-xs border border-gray-200 rounded-xl px-3 py-2 focus:outline-none bg-white text-gray-600 font-medium flex-shrink-0">
          <option value="atualizado_em">Mais recentes</option>
          <option value="nome">Nome A–Z</option>
          <option value="criado_em">Mais antigas</option>
        </select>

        <span className="text-xs text-gray-400 flex-shrink-0">{total} contatos</span>

        <div className="flex items-center gap-2 ml-auto">
          {/* Refresh */}
          <button onClick={handleRefresh} disabled={refreshing}
            title="Atualizar lista"
            className="p-2 border border-gray-200 rounded-xl text-gray-500 hover:bg-gray-50 hover:text-primary transition-colors disabled:opacity-50">
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
          </button>
          <button className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
            <Upload size={12} /> Importar
          </button>
          <button className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
            <Download size={12} /> Exportar
          </button>
          <button onClick={() => setShowNovo(true)}
            className="flex items-center gap-1.5 bg-primary text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-primary-dark transition-colors">
            <Plus size={14} /> NOVO CONTATO
          </button>
        </div>
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="px-5 py-2.5 bg-blue-50 border-b border-blue-100 flex items-center gap-3 flex-shrink-0">
          <span className="text-sm font-semibold text-blue-700">
            {selectedIds.size} selecionado{selectedIds.size > 1 ? 's' : ''}
          </span>
          <button className="text-xs text-blue-600 hover:text-blue-800 font-semibold">Mudar etapa</button>
          <button onClick={() => setSelectedIds(new Set())} className="ml-auto text-blue-400 hover:text-blue-600">
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── Table ── */}
      <div className="flex-1 overflow-y-auto p-5">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">

          {/* Loading state */}
          {loading && (
            <div className="flex items-center justify-center py-12 gap-2 text-gray-400 text-sm">
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              Carregando contatos…
            </div>
          )}

          {!loading && (
            <>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/80">
                    <th className="px-4 py-3 w-10">
                      <input type="checkbox"
                        checked={selectedIds.size === contatos.length && contatos.length > 0}
                        onChange={toggleSelectAll}
                        className="rounded border-gray-300 text-primary focus:ring-primary" />
                    </th>
                    {['Nome', 'Telefone', 'Email', 'Etapa', 'Status', 'Origem', 'Atualizado', 'Ações'].map(h => (
                      <th key={h} className="text-left px-3 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {contatos.map(c => {
                    const etapa = etapas.find(e => e.id === c.etapa_funil_id)
                    const preview = previews[c.telefone]
                    const displayName = getDisplayName(c)
                    return (
                      <tr key={c.id}
                        className={`border-b border-gray-50 hover:bg-gray-50/60 transition-colors ${
                          panelContato?.id === c.id ? 'bg-blue-50/40' : ''
                        }`}>
                        <td className="px-4 py-3">
                          <input type="checkbox" checked={selectedIds.has(c.id)}
                            onChange={() => toggleSelect(c.id)}
                            onClick={e => e.stopPropagation()}
                            className="rounded border-gray-300 text-primary focus:ring-primary" />
                        </td>
                        {/* Nome + preview */}
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2.5">
                            <ContactAvatar nome={c.nome} telefone={c.telefone} fotoUrl={c.foto_url} size={36} />
                            <div className="min-w-0">
                              <button onClick={() => setPanelContato(c)}
                                className="text-sm font-semibold text-blue-600 hover:text-blue-800 hover:underline text-left truncate max-w-[140px] block leading-tight">
                                {displayName}
                              </button>
                              {preview && (
                                <p className="text-[10px] text-gray-400 truncate max-w-[140px] mt-0.5 leading-tight">
                                  {preview.lastMsg}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-sm text-gray-600 whitespace-nowrap">
                          {formatPhone(c.telefone)}
                        </td>
                        <td className="px-3 py-3 text-sm text-gray-500 truncate max-w-[140px]">
                          {c.email || '—'}
                        </td>
                        <td className="px-3 py-3">
                          {etapa
                            ? <span className="px-2 py-0.5 rounded text-[10px] font-bold text-white"
                                style={{ backgroundColor: etapa.cor }}>{etapa.nome}</span>
                            : <span className="text-sm text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-3">
                          {c.status
                            ? <span className="px-2 py-0.5 rounded text-[10px] font-bold text-white"
                                style={{ backgroundColor: STATUS_COLORS[c.status] ?? '#6B7280' }}>
                                {STATUS_LABELS[c.status] ?? c.status}
                              </span>
                            : <span className="text-sm text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-3 text-xs text-gray-500 capitalize">{c.origem || '—'}</td>
                        <td className="px-3 py-3 text-xs text-gray-400 whitespace-nowrap">
                          {formatDate(c.atualizado_em)}
                        </td>
                        <td className="px-3 py-3">
                          <a href={`/inbox?tel=${c.telefone}`}
                            className="p-1.5 hover:bg-blue-50 rounded-lg text-gray-400 hover:text-blue-500 transition-colors inline-flex"
                            title="Abrir chat" onClick={e => e.stopPropagation()}>
                            <MessageSquare size={13} />
                          </a>
                        </td>
                      </tr>
                    )
                  })}
                  {contatos.length === 0 && (
                    <tr>
                      <td colSpan={9} className="text-center py-14 text-gray-400 text-sm">
                        Nenhum contato encontrado
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              {/* Pagination */}
              <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
                <button disabled={pg === 0}
                  onClick={() => load(search, filterStatus, filterEtapa, filterOrigem, pg - 1, sortBy)}
                  className="flex items-center gap-1 text-sm text-gray-600 hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed font-medium">
                  ← Anterior
                </button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                    const page = totalPages <= 7 ? i
                      : i === 0 ? 0 : i === 6 ? totalPages - 1
                      : pg <= 3 ? i
                      : pg >= totalPages - 4 ? totalPages - 7 + i
                      : pg - 3 + i
                    return (
                      <button key={i}
                        onClick={() => load(search, filterStatus, filterEtapa, filterOrigem, page, sortBy)}
                        className={`w-7 h-7 rounded-lg text-xs font-semibold transition-colors ${
                          page === pg ? 'bg-primary text-white' : 'text-gray-500 hover:bg-gray-100'
                        }`}>
                        {page + 1}
                      </button>
                    )
                  })}
                </div>
                <button disabled={(pg + 1) * PAGE >= total}
                  onClick={() => load(search, filterStatus, filterEtapa, filterOrigem, pg + 1, sortBy)}
                  className="flex items-center gap-1 text-sm text-gray-600 hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed font-medium">
                  Próximo →
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Contact panel */}
      {panelContato && (
        <ContatoPanel
          contato={panelContato}
          etapas={etapas}
          onClose={() => setPanelContato(null)}
          onUpdate={updated => {
            setContatos(prev => prev.map(c => c.id === updated.id ? updated : c))
            setPanelContato(updated)
          }}
        />
      )}

      {/* Novo contato modal */}
      {showNovo && (
        <NovoContatoModal
          etapas={etapas}
          onClose={() => setShowNovo(false)}
          onCreated={c => { setContatos(prev => [c, ...prev]); setTotal(t => t + 1); setShowNovo(false) }}
        />
      )}
    </div>
  )
}
