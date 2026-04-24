'use client'
import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { DndContext, useDraggable, useDroppable, DragEndEvent } from '@dnd-kit/core'
import { X, Plus, Send, Paperclip, ExternalLink } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { sendText, sendAudio, sendImage } from '@/lib/evolution'
import { formatPhone, formatDate, getDateLabel, getAvatarColor } from '@/lib/utils'
import ContactAvatar from '@/components/ContactAvatar'
import AudioRecorder from '@/components/AudioRecorder'
import AudioPlayer from '@/components/AudioPlayer'
import ImageMessage from '@/components/ImageMessage'
import type { Contato, Conversa, EtapaFunil, Mensagem, Tarefa } from '@/types'

function getMediaMsgId(msg: Mensagem): string | undefined {
  return msg.messageId ?? msg.message_id ?? (() => {
    const m = msg.content?.match(/^\[(?:audio|ptt|image|document):([^\]]+)\]/)
    return m?.[1]
  })()
}
function isAudioMsg(msg: Mensagem) { return msg.media_type==='audio'||msg.media_type==='ptt'||!!(msg.content?.startsWith('[audio')||msg.content?.startsWith('[ptt')) }
function isImageMsg(msg: Mensagem) { return msg.media_type==='image'||!!(msg.content?.startsWith('[image')) }

interface KanbanCardProps { contato: Contato; conv?: Conversa; onClick: () => void }
function KanbanCard({ contato, conv, onClick }: KanbanCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: contato.id })
  const last = conv?.historico?.[conv.historico.length - 1]
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} onClick={onClick}
      className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 cursor-pointer hover:shadow-md transition-shadow"
      style={{ transform: transform ? `translate(${transform.x}px,${transform.y}px)` : undefined, opacity: isDragging ? 0.5 : 1 }}>
      <div className="flex items-center gap-2 mb-2">
        <ContactAvatar nome={contato.nome} telefone={contato.telefone} fotoUrl={contato.foto_url} size="sm"/>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{contato.nome || formatPhone(contato.telefone)}</p>
          <p className="text-xs text-gray-400 truncate">{formatPhone(contato.telefone)}</p>
        </div>
      </div>
      {last && <p className="text-xs text-gray-500 truncate">{last.content?.replace(/^\[(?:audio|ptt|image|document):[^\]]+\]\s*/,'') || '—'}</p>}
      {conv && <p className="text-[10px] text-gray-400 mt-1">{formatDate(conv.atualizado_em)}</p>}
    </div>
  )
}

interface DroppableColProps { id: string; children: React.ReactNode }
function DroppableCol({ id, children }: DroppableColProps) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return <div ref={setNodeRef} className="flex-1 min-h-[200px] space-y-2 transition-colors rounded-xl p-1" style={{ backgroundColor: isOver ? 'rgba(37,99,235,0.05)' : undefined }}>{children}</div>
}

interface ContactPanelProps {
  contato: Contato
  conv: Conversa | undefined
  etapas: EtapaFunil[]
  onClose: () => void
  onUpdate: (c: Contato) => void
}
function ContactPanel({ contato, conv, etapas, onClose, onUpdate }: ContactPanelProps) {
  const [tab, setTab] = useState<'conversa'|'detalhes'|'tarefas'>('conversa')
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [pendingImage, setPendingImage] = useState<string|null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [nome, setNome] = useState(contato.nome ?? '')
  const [email, setEmail] = useState(contato.email ?? '')
  const [status, setStatus] = useState(contato.status ?? '')
  const [etapaId, setEtapaId] = useState(contato.etapa_funil_id ?? '')
  const [obs, setObs] = useState(contato.observacoes ?? '')
  const [saving, setSaving] = useState(false)
  const [tarefas, setTarefas] = useState<Tarefa[]>([])
  const [novaTarefa, setNovaTarefa] = useState('')
  const [vencimento, setVencimento] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const msgsEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase.from('tarefas').select('*').eq('contato_id', contato.id).order('criado_em', { ascending: false })
      .then(({ data }) => { if (data) setTarefas(data as Tarefa[]) })
  }, [contato.id])

  useEffect(() => { msgsEndRef.current?.scrollIntoView() }, [conv?.historico?.length])

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim() && !pendingImage) return
    setSending(true)
    try {
      if (pendingImage) { await sendImage(contato.telefone, pendingImage); setPendingImage(null) }
      if (text.trim()) { await sendText(contato.telefone, text.trim()); setText('') }
    } catch { alert('Erro ao enviar') }
    setSending(false)
  }

  async function handleAudio(b64: string) { await sendAudio(contato.telefone, b64) }

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
    const { data } = await supabase.from('crm_contatos').update({ nome, email, status, etapa_funil_id: etapaId || null, observacoes: obs }).eq('id', contato.id).select().single()
    if (data) onUpdate(data as Contato)
    setSaving(false)
  }

  async function addTarefa() {
    if (!novaTarefa.trim()) return
    const { data } = await supabase.from('tarefas').insert({ titulo: novaTarefa.trim(), contato_id: contato.id, status: 'pendente', vencimento: vencimento || null }).select().single()
    if (data) { setTarefas(prev => [data as Tarefa, ...prev]); setNovaTarefa(''); setVencimento('') }
  }

  async function toggleTarefa(t: Tarefa) {
    const ns = t.status === 'pendente' ? 'concluida' : 'pendente'
    await supabase.from('tarefas').update({ status: ns }).eq('id', t.id)
    setTarefas(prev => prev.map(x => x.id === t.id ? { ...x, status: ns } : x))
  }

  function renderMsg(msg: Mensagem) {
    const isOwn = msg.role === 'assistant'
    const msgId = getMediaMsgId(msg)
    return (
      <div key={`${msg.timestamp}-${msg.role}`} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
        <div className={`max-w-[75%] rounded-2xl px-3 py-2 ${isOwn ? 'bg-primary text-white rounded-tr-sm' : 'bg-white text-gray-900 rounded-tl-sm shadow-sm border border-gray-100'}`}>
          {isAudioMsg(msg) ? <AudioPlayer messageId={msgId} telefone={contato.telefone} fromMe={isOwn} isOwn={isOwn}/>
            : isImageMsg(msg) ? <ImageMessage messageId={msgId} telefone={contato.telefone} fromMe={isOwn}/>
            : msg.media_type === 'document' ? <span className="text-sm">📄 Documento</span>
            : <span className="text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.content?.replace(/^\[(?:audio|ptt|image|document):[^\]]+\]\s*/,'')}</span>}
          <p className={`text-[10px] mt-1 ${isOwn ? 'text-white/60 text-right' : 'text-gray-400'}`}>{msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}</p>
        </div>
      </div>
    )
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

  return (
    <div className="fixed right-0 top-0 h-screen w-[420px] bg-white shadow-2xl z-50 flex flex-col border-l border-gray-200">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3 flex-shrink-0">
        <ContactAvatar nome={contato.nome} telefone={contato.telefone} fotoUrl={contato.foto_url} size="sm"/>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 truncate">{contato.nome || formatPhone(contato.telefone)}</p>
          <p className="text-xs text-gray-400">{formatPhone(contato.telefone)}</p>
        </div>
        <a href={`https://wa.me/${contato.telefone.replace(/\D/g,'')}`} target="_blank" rel="noopener noreferrer" className="text-whatsapp hover:text-green-600">
          <ExternalLink size={15}/>
        </a>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><X size={18}/></button>
      </div>
      {/* Tabs */}
      <div className="flex border-b border-gray-100 flex-shrink-0">
        {(['conversa','detalhes','tarefas'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2.5 text-sm font-medium capitalize transition-colors ${tab===t ? 'text-primary border-b-2 border-primary' : 'text-gray-500 hover:text-gray-700'}`}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'conversa' && (
        <>
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3"
            onDragOver={e=>{e.preventDefault();setIsDragging(true)}} onDragLeave={()=>setIsDragging(false)} onDrop={handleDrop}
            style={{ backgroundColor: isDragging ? 'rgba(37,99,235,0.04)' : undefined }}>
            {groupByDate(conv?.historico ?? []).map(g => (
              <div key={g.label}>
                <div className="flex justify-center mb-2"><span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{g.label}</span></div>
                <div className="space-y-2">{g.msgs.map(renderMsg)}</div>
              </div>
            ))}
            {(!conv?.historico || conv.historico.length === 0) && <p className="text-center text-sm text-gray-400 mt-8">Nenhuma mensagem</p>}
            <div ref={msgsEndRef}/>
          </div>
          <div className="px-3 py-3 border-t border-gray-100 flex-shrink-0">
            {pendingImage && (
              <div className="relative inline-block mb-2">
                <img src={pendingImage} alt="" className="h-16 w-16 object-cover rounded-lg border"/>
                <button onClick={()=>setPendingImage(null)} className="absolute -top-1 -right-1 w-4 h-4 bg-gray-700 text-white rounded-full flex items-center justify-center"><X size={8}/></button>
              </div>
            )}
            <form onSubmit={handleSend} className="flex items-center gap-2">
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange}/>
              <button type="button" onClick={()=>fileRef.current?.click()} className="text-gray-400 hover:text-primary p-1"><Paperclip size={16}/></button>
              <input value={text} onChange={e=>setText(e.target.value)} placeholder="Mensagem…" disabled={isRecording||sending}
                className="flex-1 bg-gray-100 rounded-xl px-3 py-2 text-sm focus:outline-none"/>
              <AudioRecorder onSend={handleAudio} onRecordingChange={setIsRecording} disabled={sending}/>
              <button type="submit" disabled={sending||(!text.trim()&&!pendingImage)}
                className="w-9 h-9 bg-primary text-white rounded-xl flex items-center justify-center disabled:opacity-40">
                {sending ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"/> : <Send size={14}/>}
              </button>
            </form>
          </div>
        </>
      )}

      {tab === 'detalhes' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {[
            { label: 'Nome', value: nome, setValue: setNome, type: 'text' },
            { label: 'Email', value: email, setValue: setEmail, type: 'email' },
          ].map(f => (
            <div key={f.label}>
              <label className="text-xs font-medium text-gray-500 block mb-1">{f.label}</label>
              <input type={f.type} value={f.value} onChange={e=>f.setValue(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-primary"/>
            </div>
          ))}
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Status</label>
            <select value={status} onChange={e=>setStatus(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-primary">
              {['','novo','ativo','negociando','fechado','perdido'].map(s => <option key={s} value={s}>{s || '—'}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Etapa</label>
            <select value={etapaId} onChange={e=>setEtapaId(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-primary">
              <option value="">Sem etapa</option>
              {etapas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Observações</label>
            <textarea value={obs} onChange={e=>setObs(e.target.value)} rows={4}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-primary resize-none"/>
          </div>
          <button onClick={saveDetails} disabled={saving}
            className="w-full bg-primary text-white rounded-xl py-2.5 text-sm font-medium hover:bg-primary-dark disabled:opacity-60">
            {saving ? 'Salvando…' : 'Salvar alterações'}
          </button>
        </div>
      )}

      {tab === 'tarefas' && (
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-2 mb-4">
            <input value={novaTarefa} onChange={e=>setNovaTarefa(e.target.value)} placeholder="Nova tarefa…"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-primary"/>
            <input type="datetime-local" value={vencimento} onChange={e=>setVencimento(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-primary"/>
            <button onClick={addTarefa} disabled={!novaTarefa.trim()}
              className="w-full bg-primary text-white rounded-xl py-2 text-sm font-medium hover:bg-primary-dark disabled:opacity-50">
              Adicionar
            </button>
          </div>
          <div className="space-y-2">
            {tarefas.map(t => (
              <div key={t.id} className="flex items-start gap-2 p-3 bg-gray-50 rounded-xl">
                <button onClick={()=>toggleTarefa(t)} className={`mt-0.5 flex-shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center ${t.status==='concluida' ? 'bg-green-500 border-green-500' : 'border-gray-300'}`}>
                  {t.status==='concluida' && <span className="text-white text-[8px]">✓</span>}
                </button>
                <div className="flex-1">
                  <p className={`text-sm ${t.status==='concluida' ? 'line-through text-gray-400' : 'text-gray-900'}`}>{t.titulo}</p>
                  {t.vencimento && <p className="text-xs text-gray-400 mt-0.5">{new Date(t.vencimento).toLocaleDateString('pt-BR')}</p>}
                </div>
              </div>
            ))}
            {tarefas.length === 0 && <p className="text-center text-sm text-gray-400">Nenhuma tarefa</p>}
          </div>
        </div>
      )}
    </div>
  )
}

function PipelineContent() {
  const searchParams = useSearchParams()
  const view = searchParams.get('view')
  const [contatos, setContatos] = useState<Contato[]>([])
  const [conversas, setConversas] = useState<Record<string, Conversa>>({})
  const [etapas, setEtapas] = useState<EtapaFunil[]>([])
  const [selected, setSelected] = useState<Contato | null>(null)
  const [showNovoLead, setShowNovoLead] = useState(false)
  const [novoNome, setNovoNome] = useState('')
  const [novoTel, setNovoTel] = useState('')
  const [novoEtapa, setNovoEtapa] = useState('')
  const [novoStatus, setNovoStatus] = useState('novo')
  const [criando, setCriando] = useState(false)

  async function load() {
    const [{ data: c }, { data: conv }, { data: e }] = await Promise.all([
      supabase.from('crm_contatos').select('*').range(0, 999),
      supabase.from('conversas').select('telefone, historico, atualizado_em').range(0, 999),
      supabase.from('etapas_funil').select('*').order('ordem'),
    ])
    if (c) setContatos(c as Contato[])
    if (conv) {
      const map: Record<string, Conversa> = {}
      ;(conv as Conversa[]).forEach(x => { map[x.telefone] = x })
      setConversas(map)
    }
    if (e) setEtapas(e as EtapaFunil[])
  }

  useEffect(() => { load() }, [])

  async function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const contatoId = active.id as string
    const etapaId = over.id as string
    await supabase.from('crm_contatos').update({ etapa_funil_id: etapaId === 'SEM_ETAPA' ? null : etapaId }).eq('id', contatoId)
    setContatos(prev => prev.map(c => c.id === contatoId ? { ...c, etapa_funil_id: etapaId === 'SEM_ETAPA' ? null : etapaId } : c))
  }

  async function criarLead() {
    if (!novoTel.trim()) return
    setCriando(true)
    const { data } = await supabase.from('crm_contatos').insert({
      nome: novoNome.trim() || null, telefone: novoTel.trim(), etapa_funil_id: novoEtapa || null, status: novoStatus
    }).select().single()
    if (data) { setContatos(prev => [...prev, data as Contato]); setShowNovoLead(false); setNovoNome(''); setNovoTel(''); setNovoEtapa(''); setNovoStatus('novo') }
    setCriando(false)
  }

  const cols = [
    { id: 'SEM_ETAPA', nome: 'SEM ETAPA', cor: '#9CA3AF', items: contatos.filter(c => !c.etapa_funil_id) },
    ...etapas.map(e => ({ id: e.id, nome: e.nome.toUpperCase(), cor: e.cor, items: contatos.filter(c => c.etapa_funil_id === e.id) }))
  ]

  const statusColors: Record<string, string> = { novo: '#3B82F6', ativo: '#22C55E', negociando: '#F97316', fechado: '#8B5CF6', perdido: '#EF4444' }

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-gray-200 bg-white flex items-center justify-between flex-shrink-0">
        <h1 className="text-lg font-semibold text-gray-900">{view === 'list' ? 'Todos os leads' : 'Funil de vendas'}</h1>
        <button onClick={() => setShowNovoLead(true)}
          className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-primary-dark transition-colors">
          <Plus size={16}/> Novo Lead
        </button>
      </div>

      {view === 'list' ? (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <table className="w-full">
              <thead><tr className="border-b border-gray-100">
                {['Nome','Telefone','Status','Etapa','Data'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {contatos.map(c => {
                  const etapa = etapas.find(e => e.id === c.etapa_funil_id)
                  return (
                    <tr key={c.id} onClick={() => setSelected(c)} className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <ContactAvatar nome={c.nome} telefone={c.telefone} fotoUrl={c.foto_url} size="sm"/>
                          <span className="text-sm font-medium text-gray-900">{c.nome || '—'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{formatPhone(c.telefone)}</td>
                      <td className="px-4 py-3">
                        {c.status && <span className="px-2 py-0.5 rounded-full text-xs font-medium text-white" style={{ backgroundColor: statusColors[c.status] ?? '#6B7280' }}>{c.status}</span>}
                      </td>
                      <td className="px-4 py-3">
                        {etapa && <span className="px-2 py-0.5 rounded-full text-xs font-medium text-white" style={{ backgroundColor: etapa.cor }}>{etapa.nome}</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400">{new Date(c.criado_em).toLocaleDateString('pt-BR')}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-x-auto p-4">
          <DndContext onDragEnd={handleDragEnd}>
            <div className="flex gap-4 h-full" style={{ minWidth: cols.length * 260 }}>
              {cols.map(col => (
                <div key={col.id} className="flex flex-col flex-shrink-0" style={{ width: 252 }}>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="h-0.5 w-6 rounded-full flex-shrink-0" style={{ backgroundColor: col.cor }}/>
                    <span className="text-xs font-bold text-gray-500 tracking-wide">{col.nome}</span>
                    <span className="text-xs text-gray-400 ml-auto">{col.items.length}</span>
                  </div>
                  <DroppableCol id={col.id}>
                    {col.items.map(c => (
                      <KanbanCard key={c.id} contato={c} conv={conversas[c.telefone]} onClick={() => setSelected(c)}/>
                    ))}
                  </DroppableCol>
                </div>
              ))}
            </div>
          </DndContext>
        </div>
      )}

      {/* Contact panel */}
      {selected && (
        <ContactPanel
          contato={selected}
          conv={conversas[selected.telefone]}
          etapas={etapas}
          onClose={() => setSelected(null)}
          onUpdate={updated => {
            setContatos(prev => prev.map(c => c.id === updated.id ? updated : c))
            setSelected(updated)
          }}
        />
      )}

      {/* Novo Lead modal */}
      {showNovoLead && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Novo Lead</h3>
              <button onClick={() => setShowNovoLead(false)} className="text-gray-400 hover:text-gray-600"><X size={18}/></button>
            </div>
            <div className="space-y-3">
              <input value={novoNome} onChange={e=>setNovoNome(e.target.value)} placeholder="Nome"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary"/>
              <input value={novoTel} onChange={e=>setNovoTel(e.target.value)} placeholder="Telefone *" required
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary"/>
              <select value={novoEtapa} onChange={e=>setNovoEtapa(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary">
                <option value="">Sem etapa</option>
                {etapas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
              </select>
              <select value={novoStatus} onChange={e=>setNovoStatus(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary">
                {['novo','ativo','negociando','fechado','perdido'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowNovoLead(false)} className="flex-1 border border-gray-200 text-gray-600 rounded-xl py-2.5 text-sm font-medium">Cancelar</button>
              <button onClick={criarLead} disabled={criando || !novoTel.trim()}
                className="flex-1 bg-primary text-white rounded-xl py-2.5 text-sm font-medium hover:bg-primary-dark disabled:opacity-60">
                {criando ? 'Criando…' : 'Criar lead'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function PipelinePage() {
  return (
    <Suspense fallback={<div className="flex-1 flex items-center justify-center text-gray-400">Carregando…</div>}>
      <PipelineContent/>
    </Suspense>
  )
}
