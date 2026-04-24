'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, Send, Paperclip, X, ExternalLink, CheckSquare, Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { sendText, sendAudio, sendImage } from '@/lib/evolution'
import { formatPhone, formatDate, getDateLabel, isGroupPhone } from '@/lib/utils'
import { useUnread } from '@/lib/unread-context'
import ContactAvatar from '@/components/ContactAvatar'
import AudioRecorder from '@/components/AudioRecorder'
import AudioPlayer from '@/components/AudioPlayer'
import ImageMessage from '@/components/ImageMessage'
import type { Conversa, Contato, EtapaFunil, Mensagem, Tarefa } from '@/types'

function getMediaMsgId(msg: Mensagem): string | undefined {
  return msg.messageId ?? msg.message_id ?? (() => {
    const m = msg.content?.match(/^\[(?:audio|ptt|image|document):([^\]]+)\]/)
    return m?.[1]
  })()
}

function isAudioMsg(msg: Mensagem): boolean {
  return msg.media_type === 'audio' || msg.media_type === 'ptt' ||
    !!(msg.content?.startsWith('[audio') || msg.content?.startsWith('[ptt'))
}

function isImageMsg(msg: Mensagem): boolean {
  return msg.media_type === 'image' || !!(msg.content?.startsWith('[image'))
}

function resolverNome(conv: Conversa, contato: Contato | undefined): string {
  if (contato?.nome?.trim()) return contato.nome.trim()
  if (conv.nome?.trim()) return conv.nome.trim()
  return formatPhone(conv.telefone)
}

export default function InboxPage() {
  const { markAsRead } = useUnread()
  const [conversas, setConversas] = useState<Conversa[]>([])
  const [contatos, setContatos] = useState<Record<string, Contato>>({})
  const [etapas, setEtapas] = useState<EtapaFunil[]>([])
  const [selected, setSelected] = useState<Conversa | null>(null)
  const [selectedContato, setSelectedContato] = useState<Contato | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'abertas' | 'todas'>('abertas')
  const [text, setText] = useState('')
  const [pendingImage, setPendingImage] = useState<string | null>(null)
  const [localImages] = useState<Record<string, string>>({})
  const [isRecording, setIsRecording] = useState(false)
  const [sending, setSending] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [obs, setObs] = useState('')
  const [savingObs, setSavingObs] = useState(false)
  const [tarefas, setTarefas] = useState<Tarefa[]>([])
  const [novaTarefa, setNovaTarefa] = useState('')
  const [showTarefaInput, setShowTarefaInput] = useState(false)
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const msgsEndRef = useRef<HTMLDivElement>(null)
  const PAGE = 50

  const loadConversas = useCallback(async (pg = 0) => {
    const from = pg * PAGE
    const { data, count } = await supabase
      .from('conversas')
      .select('*', { count: 'exact' })
      .order('atualizado_em', { ascending: false })
      .range(from, from + PAGE - 1)
    if (data) {
      if (pg === 0) setConversas(data as Conversa[])
      else setConversas(prev => [...prev, ...(data as Conversa[])])
      setHasMore((count ?? 0) > from + PAGE)
      setPage(pg)
    }
  }, [])

  async function loadContatos() {
    const { data } = await supabase.from('crm_contatos').select('*').range(0, 999)
    if (data) {
      const map: Record<string, Contato> = {}
      ;(data as Contato[]).forEach(c => { map[c.telefone] = c })
      setContatos(map)
    }
  }

  async function loadEtapas() {
    const { data } = await supabase.from('etapas_funil').select('*').order('ordem')
    if (data) setEtapas(data as EtapaFunil[])
  }

  async function loadTarefas(contatoId: string) {
    const { data } = await supabase.from('tarefas').select('*').eq('contato_id', contatoId).order('criado_em', { ascending: false })
    if (data) setTarefas(data as Tarefa[])
  }

  useEffect(() => {
    loadConversas()
    loadContatos()
    loadEtapas()
    const ch = supabase.channel('inbox-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversas' }, () => loadConversas())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [loadConversas])

  useEffect(() => {
    msgsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [selected?.historico?.length])

  function selectConv(conv: Conversa) {
    setSelected(conv)
    const c = contatos[conv.telefone] ?? null
    setSelectedContato(c)
    setObs(c?.observacoes ?? '')
    if (c) loadTarefas(c.id)
    else setTarefas([])
    markAsRead(conv.telefone)
  }

  const filtered = conversas.filter(c => {
    if (isGroupPhone(c.telefone)) return false
    if (filter === 'abertas') {
      const last = c.historico?.[c.historico.length - 1]
      if (!last || last.role !== 'user') return false
    }
    if (!search) return true
    const nome = resolverNome(c, contatos[c.telefone])
    return nome.toLowerCase().includes(search.toLowerCase()) || c.telefone.includes(search)
  })

  async function handleSendText(e: React.FormEvent) {
    e.preventDefault()
    if (!selected || (!text.trim() && !pendingImage)) return
    setSending(true)
    try {
      if (pendingImage) {
        await sendImage(selected.telefone, pendingImage)
        setPendingImage(null)
      }
      if (text.trim()) {
        await sendText(selected.telefone, text.trim())
        setText('')
      }
    } catch { alert('Erro ao enviar mensagem') }
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
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (!file || !file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onloadend = () => setPendingImage(reader.result as string)
    reader.readAsDataURL(file)
  }

  async function changeEtapa(etapaId: string) {
    if (!selectedContato) return
    const { data } = await supabase.from('crm_contatos').update({ etapa_funil_id: etapaId || null }).eq('id', selectedContato.id).select().single()
    if (data) {
      setSelectedContato(data as Contato)
      setContatos(prev => ({ ...prev, [selectedContato.telefone]: data as Contato }))
    }
  }

  async function saveObs() {
    if (!selectedContato) return
    setSavingObs(true)
    await supabase.from('crm_contatos').update({ observacoes: obs }).eq('id', selectedContato.id)
    setSavingObs(false)
  }

  async function addTarefa() {
    if (!novaTarefa.trim() || !selectedContato) return
    const { data } = await supabase.from('tarefas').insert({ titulo: novaTarefa.trim(), contato_id: selectedContato.id, status: 'pendente' }).select().single()
    if (data) { setTarefas(prev => [data as Tarefa, ...prev]); setNovaTarefa(''); setShowTarefaInput(false) }
  }

  async function toggleTarefa(t: Tarefa) {
    const ns = t.status === 'pendente' ? 'concluida' : 'pendente'
    await supabase.from('tarefas').update({ status: ns }).eq('id', t.id)
    setTarefas(prev => prev.map(x => x.id === t.id ? { ...x, status: ns } : x))
  }

  function renderMsgContent(msg: Mensagem, isOwn: boolean) {
    const msgId = getMediaMsgId(msg)
    if (isAudioMsg(msg)) return <AudioPlayer messageId={msgId} telefone={selected!.telefone} fromMe={isOwn} isOwn={isOwn}/>
    if (isImageMsg(msg)) {
      const localUrl = msgId ? localImages[msgId] : undefined
      return <ImageMessage messageId={msgId} telefone={selected!.telefone} fromMe={isOwn} localDataUrl={localUrl}/>
    }
    if (msg.media_type === 'document' || msg.content?.startsWith('[document')) return <div className="flex items-center gap-1.5 text-sm">📄 <span>Documento</span></div>
    const text = msg.content?.replace(/^\[(?:audio|ptt|image|document):[^\]]+\]\s*/,'') || ''
    return <span className="text-sm leading-relaxed whitespace-pre-wrap break-words">{text}</span>
  }

  // Group messages by date
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

  const statusColors: Record<string, string> = { novo: '#3B82F6', ativo: '#22C55E', negociando: '#F97316', fechado: '#8B5CF6', perdido: '#EF4444' }

  return (
    <div className="flex h-full">
      {/* Left: conversation list */}
      <div className="w-80 flex flex-col border-r border-gray-200 bg-white flex-shrink-0">
        <div className="px-4 pt-4 pb-2 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900">Conversas</h2>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{filtered.length}</span>
          </div>
          <div className="relative mb-3">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar…"
              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-primary"/>
          </div>
          <div className="flex gap-1">
            {(['abertas','todas'] as const).map(f => (
              <button key={f} onClick={()=>setFilter(f)}
                className={`flex-1 text-xs py-1.5 rounded-lg font-medium transition-colors ${filter===f ? 'bg-primary text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
                {f==='abertas' ? 'Abertas' : 'Todas'}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.map(conv => {
            const c = contatos[conv.telefone]
            const nome = resolverNome(conv, c)
            const last = conv.historico?.[conv.historico.length - 1]
            const isSelected = selected?.telefone === conv.telefone
            return (
              <button key={conv.telefone} onClick={() => selectConv(conv)}
                className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors border-b border-gray-50 ${isSelected ? 'bg-primary/5 border-l-2 border-l-primary' : ''}`}>
                <div className="relative flex-shrink-0">
                  <ContactAvatar nome={nome} telefone={conv.telefone} fotoUrl={c?.foto_url} size="md"/>
                  <span className="absolute bottom-0 right-0 w-3 h-3 bg-whatsapp rounded-full border-2 border-white"/>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-sm font-medium text-gray-900 truncate">{nome}</span>
                    <span className="text-[10px] text-gray-400 ml-2 flex-shrink-0">{formatDate(conv.atualizado_em)}</span>
                  </div>
                  <p className="text-xs text-gray-500 truncate">{last?.content?.replace(/^\[(?:audio|ptt|image|document):[^\]]+\]\s*/, '') || '—'}</p>
                </div>
              </button>
            )
          })}
          {hasMore && (
            <button onClick={() => loadConversas(page + 1)} className="w-full py-3 text-sm text-primary hover:bg-gray-50 transition-colors text-center">
              Carregar mais
            </button>
          )}
        </div>
      </div>

      {/* Middle: lead details */}
      <div className="w-72 flex flex-col border-r border-gray-200 bg-white flex-shrink-0 overflow-y-auto">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Sem conversa selecionada</div>
        ) : (
          <div className="p-4 space-y-4">
            {/* Contact header */}
            <div className="text-center pt-2">
              <ContactAvatar nome={resolverNome(selected, selectedContato ?? undefined)} telefone={selected.telefone} fotoUrl={selectedContato?.foto_url} size="lg" className="mx-auto mb-3"/>
              <h3 className="font-semibold text-gray-900 text-base">{resolverNome(selected, selectedContato ?? undefined)}</h3>
              <p className="text-sm text-gray-500">{formatPhone(selected.telefone)}</p>
              {selectedContato?.status && (
                <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium text-white"
                  style={{ backgroundColor: statusColors[selectedContato.status] ?? '#6B7280' }}>
                  {selectedContato.status}
                </span>
              )}
            </div>
            {/* Etapa */}
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-1">Etapa</label>
              <select value={selectedContato?.etapa_funil_id ?? ''} onChange={e => changeEtapa(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-primary">
                <option value="">Sem etapa</option>
                {etapas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
              </select>
            </div>
            {/* Info */}
            {(selectedContato?.email || selectedContato?.origem) && (
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide block">Info</label>
                {selectedContato.email && <p className="text-sm text-gray-700">✉️ {selectedContato.email}</p>}
                {selectedContato.origem && <p className="text-sm text-gray-700">📌 {selectedContato.origem}</p>}
              </div>
            )}
            {/* Observações */}
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-1">Observações</label>
              <textarea value={obs} onChange={e=>setObs(e.target.value)} rows={3}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-primary resize-none"/>
              <button onClick={saveObs} disabled={savingObs}
                className="mt-1 text-xs text-primary hover:underline disabled:opacity-50">
                {savingObs ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
            {/* Tarefas */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Tarefas</label>
                <button onClick={() => setShowTarefaInput(true)} className="text-primary hover:text-primary-dark">
                  <Plus size={14}/>
                </button>
              </div>
              {showTarefaInput && (
                <div className="flex gap-1 mb-2">
                  <input value={novaTarefa} onChange={e=>setNovaTarefa(e.target.value)} placeholder="Nova tarefa…"
                    className="flex-1 text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-primary"
                    onKeyDown={e => e.key === 'Enter' && addTarefa()}/>
                  <button onClick={addTarefa} className="text-xs text-primary px-2">OK</button>
                  <button onClick={() => setShowTarefaInput(false)} className="text-xs text-gray-400"><X size={12}/></button>
                </div>
              )}
              <div className="space-y-1.5">
                {tarefas.map(t => (
                  <div key={t.id} className="flex items-start gap-2">
                    <button onClick={() => toggleTarefa(t)} className={`mt-0.5 flex-shrink-0 ${t.status === 'concluida' ? 'text-green-500' : 'text-gray-300'}`}>
                      <CheckSquare size={14}/>
                    </button>
                    <span className={`text-xs ${t.status === 'concluida' ? 'line-through text-gray-400' : 'text-gray-700'}`}>{t.titulo}</span>
                  </div>
                ))}
                {tarefas.length === 0 && <p className="text-xs text-gray-400">Nenhuma tarefa</p>}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Right: chat */}
      <div className="flex-1 flex flex-col min-w-0">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <div className="text-5xl mb-3">💬</div>
              <p className="text-lg font-medium">Selecione uma conversa</p>
              <p className="text-sm mt-1">Escolha uma conversa na lista ao lado</p>
            </div>
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div className="px-5 py-3 border-b border-gray-200 bg-white flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <ContactAvatar nome={resolverNome(selected, selectedContato ?? undefined)} telefone={selected.telefone} fotoUrl={selectedContato?.foto_url} size="sm"/>
                <div>
                  <p className="font-medium text-gray-900 text-sm">{resolverNome(selected, selectedContato ?? undefined)}</p>
                  <p className="text-xs text-gray-400">{formatPhone(selected.telefone)}</p>
                </div>
              </div>
              <a href={`https://wa.me/${selected.telefone.replace(/\D/g,'')}`} target="_blank" rel="noopener noreferrer"
                className="text-whatsapp hover:text-green-600 transition-colors">
                <ExternalLink size={16}/>
              </a>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
              onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              style={{ backgroundColor: isDragging ? 'rgba(37,99,235,0.04)' : undefined }}>
              {groupByDate(selected.historico ?? []).map(group => (
                <div key={group.label}>
                  <div className="flex justify-center mb-3">
                    <span className="text-xs text-gray-400 bg-gray-100 px-3 py-1 rounded-full">{group.label}</span>
                  </div>
                  <div className="space-y-2">
                    {group.msgs.map((msg, i) => {
                      const isOwn = msg.role === 'assistant'
                      return (
                        <div key={i} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[72%] rounded-2xl px-3 py-2 ${isOwn ? 'bg-primary text-white rounded-tr-sm' : 'bg-white text-gray-900 rounded-tl-sm shadow-sm border border-gray-100'}`}>
                            {renderMsgContent(msg, isOwn)}
                            <p className={`text-[10px] mt-1 ${isOwn ? 'text-white/60 text-right' : 'text-gray-400'}`}>
                              {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}
                            </p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
              <div ref={msgsEndRef}/>
            </div>

            {/* Input area */}
            <div className="px-4 py-3 border-t border-gray-200 bg-white flex-shrink-0">
              {pendingImage && (
                <div className="relative inline-block mb-2">
                  <img src={pendingImage} alt="Preview" className="h-20 w-20 object-cover rounded-lg border border-gray-200"/>
                  <button onClick={() => setPendingImage(null)} className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-gray-700 text-white rounded-full flex items-center justify-center">
                    <X size={10}/>
                  </button>
                </div>
              )}
              <form onSubmit={handleSendText} className="flex items-center gap-2">
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange}/>
                <button type="button" onClick={() => fileRef.current?.click()}
                  className="w-10 h-10 flex items-center justify-center rounded-xl text-gray-400 hover:text-primary hover:bg-primary/10 transition-colors">
                  <Paperclip size={18}/>
                </button>
                <input value={text} onChange={e=>setText(e.target.value)} placeholder="Digite uma mensagem…"
                  disabled={isRecording || sending}
                  className="flex-1 bg-gray-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"/>
                {!isRecording && (
                  <AudioRecorder onSend={handleSendAudio} onRecordingChange={setIsRecording} disabled={sending}/>
                )}
                {isRecording && (
                  <AudioRecorder onSend={handleSendAudio} onRecordingChange={setIsRecording} disabled={sending}/>
                )}
                <button type="submit" disabled={sending || (!text.trim() && !pendingImage)}
                  className="w-10 h-10 bg-primary hover:bg-primary-dark text-white rounded-xl flex items-center justify-center transition-colors disabled:opacity-40">
                  {sending ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/> : <Send size={16}/>}
                </button>
              </form>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
