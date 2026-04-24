'use client'
import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { sendTextMessage, sendAudioMessage, sendMediaMessage } from '@/lib/evolution'
import { formatDate, formatDateTime, formatPhone } from '@/lib/utils'
import { useUnread } from '@/lib/unread-context'
import ContactAvatar from '@/components/ContactAvatar'
import AudioPlayer from '@/components/AudioPlayer'
import AudioRecorder from '@/components/AudioRecorder'
import ImageMessage from '@/components/ImageMessage'
import { Search, Send, X, FileText, Paperclip } from 'lucide-react'
import type { Conversa, Contato, EtapaFunil, Mensagem } from '@/types'

export default function InboxPage() {
  const [conversas, setConversas] = useState<Conversa[]>([])
  const [contatos, setContatos] = useState<Record<string, Contato>>({})
  const [etapas, setEtapas] = useState<EtapaFunil[]>([])
  const [selecionada, setSelecionada] = useState<Conversa | null>(null)
  const [contatoSelecionado, setContatoSelecionado] = useState<Contato | null>(null)
  const [mensagem, setMensagem] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<string>('todas')
  const [editandoObs, setEditandoObs] = useState(false)
  const [obs, setObs] = useState('')
  const [isRecording, setIsRecording] = useState(false)

  // Imagens
  const [pendingImage, setPendingImage] = useState<{ dataUrl: string; file: File } | null>(null)
  const [localImages, setLocalImages] = useState<Record<string, string>>({}) // timestamp → dataUrl
  const fileInputRef = useRef<HTMLInputElement>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const { markAsRead } = useUnread()

  // ── Helpers de mídia ──────────────────────────────────────────────────────

  function isAudioMsg(msg: Mensagem) {
    return msg.media_type === 'audio' || msg.media_type === 'ptt' ||
      msg.content.startsWith('[audio]') || msg.content.startsWith('[ptt]')
  }

  function isImageMsg(msg: Mensagem) {
    return msg.media_type === 'image' || msg.content.startsWith('[image]')
  }

  function getMediaMsgId(msg: Mensagem): string | undefined {
    if (msg.message_id) return msg.message_id
    const msgAny = msg as any
    if (msgAny.messageId) return msgAny.messageId
    const m = msg.content?.match(/^\[(?:audio|ptt|image|document):([^\]]+)\]/)
    return m?.[1]
  }

  // Buscar dados iniciais
  useEffect(() => {
    loadData()
    const channel = supabase
      .channel('conversas-inbox')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversas' }, () => {
        loadData()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  async function loadData() {
    const [{ data: convData }, { data: contatoData }, { data: etapaData }] = await Promise.all([
      supabase.from('conversas').select('*').order('atualizado_em', { ascending: false }).range(0, 999),
      supabase.from('crm_contatos').select('*, etapa:etapas_funil(*)').range(0, 999),
      supabase.from('etapas_funil').select('*').order('ordem'),
    ])
    if (convData) setConversas(convData as Conversa[])
    if (contatoData) {
      const map: Record<string, Contato> = {}
      ;(contatoData as Contato[]).forEach(c => { map[c.telefone] = c })
      setContatos(map)
    }
    if (etapaData) setEtapas(etapaData as EtapaFunil[])
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [selecionada?.historico?.length])

  function selecionarConversa(conv: Conversa) {
    setSelecionada(conv)
    const contato = contatos[conv.telefone] ?? null
    setContatoSelecionado(contato)
    setObs(contato?.observacoes ?? '')
    setEditandoObs(false)
    setPendingImage(null)
    markAsRead(conv.telefone)
  }

  // Atualiza conversa selecionada quando dados recarregam
  useEffect(() => {
    if (selecionada) {
      const updated = conversas.find(c => c.telefone === selecionada.telefone)
      if (updated) {
        setSelecionada(updated)
        markAsRead(selecionada.telefone)
      }
      const contato = contatos[selecionada.telefone] ?? null
      setContatoSelecionado(contato)
    }
  }, [conversas, contatos])

  // ── Selecionar imagem ──────────────────────────────────────────────────────

  function handleImageSelect(file: File) {
    if (!file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onloadend = () => setPendingImage({ dataUrl: reader.result as string, file })
    reader.readAsDataURL(file)
  }

  // ── Enviar mensagem (texto ou imagem) ─────────────────────────────────────

  async function handleEnviar(e: React.FormEvent) {
    e.preventDefault()
    if (!selecionada || enviando) return

    if (pendingImage) {
      setEnviando(true)
      const agora = new Date().toISOString()
      const caption = mensagem.trim() || undefined
      const novaMensagem: Mensagem = {
        role: 'assistant',
        content: '[image]',
        media_type: 'image',
        timestamp: agora,
      }
      const novoHistorico = [...(selecionada.historico ?? []), novaMensagem]

      // Optimistic update com preview local
      setLocalImages(prev => ({ ...prev, [agora]: pendingImage.dataUrl }))
      setSelecionada(prev => prev ? { ...prev, historico: novoHistorico, atualizado_em: agora } : null)
      setPendingImage(null)
      setMensagem('')

      try {
        const base64 = pendingImage.dataUrl.split(',')[1]
        await sendMediaMessage(selecionada.telefone, base64, caption)
        await supabase.from('conversas').upsert({
          telefone: selecionada.telefone,
          historico: novoHistorico,
          atualizado_em: agora,
        }, { onConflict: 'telefone' })
      } catch {
        alert('Erro ao enviar imagem')
      } finally {
        setEnviando(false)
        await loadData()
      }
      return
    }

    if (!mensagem.trim()) return
    setEnviando(true)
    try {
      await sendTextMessage(selecionada.telefone, mensagem.trim())
      const novaMensagem = { role: 'assistant' as const, content: mensagem.trim(), timestamp: new Date().toISOString() }
      const novoHistorico = [...(selecionada.historico ?? []), novaMensagem]
      await supabase.from('conversas').upsert({
        telefone: selecionada.telefone,
        historico: novoHistorico,
        atualizado_em: new Date().toISOString(),
      }, { onConflict: 'telefone' })
      setMensagem('')
      await loadData()
    } catch {
      alert('Erro ao enviar mensagem')
    } finally {
      setEnviando(false)
    }
  }

  async function handleSendAudio(base64: string) {
    if (!selecionada) return
    await sendAudioMessage(selecionada.telefone, base64)
    const novaMensagem: Mensagem = {
      role: 'assistant',
      content: '[ptt]',
      media_type: 'ptt',
      timestamp: new Date().toISOString(),
    }
    const novoHistorico = [...(selecionada.historico ?? []), novaMensagem]
    await supabase.from('conversas').upsert({
      telefone: selecionada.telefone,
      historico: novoHistorico,
      atualizado_em: new Date().toISOString(),
    }, { onConflict: 'telefone' })
    await loadData()
  }

  async function salvarObs() {
    if (!contatoSelecionado) return
    await supabase.from('crm_contatos').update({ observacoes: obs }).eq('id', contatoSelecionado.id)
    setEditandoObs(false)
    await loadData()
  }

  const conversasFiltradas = conversas.filter(c => {
    const contato = contatos[c.telefone]
    const nome = contato?.nome ?? c.nome ?? ''
    const matchBusca = nome.toLowerCase().includes(busca.toLowerCase()) || c.telefone.includes(busca)
    const matchFiltro = filtro === 'todas' ? true : (contato?.status === filtro)
    return matchBusca && matchFiltro
  })

  const ultimaMensagem = (conv: Conversa) => {
    const h = conv.historico ?? []
    return h[h.length - 1] ?? null
  }

  const NOMES_IGNORADOS = new Set(['sync', 'sync studios', 'bot', 'assistant'])

  function nomeValido(nome: string | null, telefone: string): boolean {
    if (!nome || nome.trim() === '') return false
    if (nome === telefone) return false
    if (NOMES_IGNORADOS.has(nome.trim().toLowerCase())) return false
    return true
  }

  function resolverNome(conv: Conversa, contato?: Contato): string {
    const tel = conv.telefone
    if (nomeValido(contato?.nome ?? null, tel)) return contato!.nome!
    if (nomeValido(conv.nome ?? null, tel)) return conv.nome!
    return formatPhone(tel)
  }

  // ── Preview de última mensagem na lista ───────────────────────────────────

  function previewUltimaMensagem(conv: Conversa): React.ReactNode {
    const ultima = ultimaMensagem(conv)
    if (!ultima) return <span className="italic">Sem mensagens</span>
    const prefix = ultima.role === 'assistant' ? '✓ ' : ''
    if (isAudioMsg(ultima)) return prefix + '🎵 Áudio'
    if (isImageMsg(ultima)) return prefix + '🖼️ Imagem'
    return prefix + ultima.content
  }

  return (
    <div className="flex h-full">
      {/* Lista de conversas */}
      <div className="w-80 flex-shrink-0 bg-white border-r border-gray-100 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-100">
          <h1 className="text-lg font-bold text-gray-900 mb-3">Inbox</h1>
          <div className="relative mb-3">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar contato..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
            />
          </div>
          <div className="flex gap-1">
            {['todas','lead','qualificado','cliente'].map(f => (
              <button
                key={f}
                onClick={() => setFiltro(f)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize transition-colors ${
                  filtro === f ? 'bg-accent text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto">
          {conversasFiltradas.map(conv => {
            const contato = contatos[conv.telefone]
            const ativa = selecionada?.telefone === conv.telefone
            const nome = resolverNome(conv, contato)
            return (
              <button
                key={conv.telefone}
                onClick={() => selecionarConversa(conv)}
                className={`w-full flex items-start gap-3 p-4 border-b border-gray-50 hover:bg-gray-50 transition-colors text-left ${ativa ? 'bg-blue-50 border-l-2 border-l-accent' : ''}`}
              >
                <ContactAvatar nome={nome} seed={conv.telefone} size={44} />
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline gap-1">
                    <p className="text-sm font-semibold text-gray-900 truncate">{nome}</p>
                    <span className="text-xs text-gray-400 flex-shrink-0">{formatDate(conv.atualizado_em)}</span>
                  </div>
                  <p className="text-xs text-gray-400 truncate mt-0.5">
                    {formatPhone(conv.telefone)}
                  </p>
                  <p className="text-xs text-gray-500 truncate mt-0.5">
                    {previewUltimaMensagem(conv)}
                  </p>
                </div>
              </button>
            )
          })}
          {conversasFiltradas.length === 0 && (
            <div className="p-8 text-center text-gray-400 text-sm">Nenhuma conversa encontrada</div>
          )}
        </div>
      </div>

      {/* Área de chat */}
      {selecionada ? (
        <div className="flex-1 flex flex-col min-w-0">
          {/* Chat header */}
          <div className="h-14 bg-white border-b border-gray-100 flex items-center px-4 gap-3 flex-shrink-0">
            <ContactAvatar nome={resolverNome(selecionada, contatoSelecionado ?? undefined)} seed={selecionada.telefone} size={36} />
            <div>
              <p className="text-sm font-semibold text-gray-900">{resolverNome(selecionada, contatoSelecionado ?? undefined)}</p>
              <p className="text-xs text-gray-400">{formatPhone(selecionada.telefone)}</p>
            </div>
          </div>

          {/* Input de arquivo oculto */}
          <input
            type="file"
            ref={fileInputRef}
            accept="image/*"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleImageSelect(f); e.target.value = '' }}
          />

          {/* Mensagens — com suporte a drag & drop de imagens */}
          <div
            className="flex-1 overflow-y-auto p-4 space-y-2 bg-gray-50"
            onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }}
            onDrop={e => {
              e.preventDefault()
              const file = e.dataTransfer.files?.[0]
              if (file?.type.startsWith('image/')) handleImageSelect(file)
            }}
          >
            {(selecionada.historico ?? []).map((msg, i) => {
              const audio = isAudioMsg(msg)
              const image = isImageMsg(msg)
              const msgId = getMediaMsgId(msg)
              return (
                <div key={i} className={`flex ${msg.role === 'assistant' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`rounded-2xl px-4 py-2.5 ${
                    msg.role === 'assistant'
                      ? 'bg-whatsapp text-white rounded-tr-sm'
                      : 'bg-white text-gray-900 rounded-tl-sm shadow-sm'
                  } ${(audio || image) ? '' : 'max-w-xs lg:max-w-md xl:max-w-lg'}`}>
                    {audio ? (
                      <AudioPlayer
                        messageId={msgId}
                        telefone={selecionada.telefone}
                        isOwn={msg.role === 'assistant'}
                        darkBg={msg.role === 'assistant'}
                      />
                    ) : image ? (
                      <ImageMessage
                        messageId={msgId}
                        telefone={selecionada.telefone}
                        localDataUrl={localImages[msg.timestamp]}
                      />
                    ) : (
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    )}
                    <p className={`text-xs mt-1 ${msg.role === 'assistant' ? 'text-green-100' : 'text-gray-400'}`}>
                      {formatDateTime(msg.timestamp)}
                    </p>
                  </div>
                </div>
              )
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Preview de imagem pendente */}
          {pendingImage && (
            <div className="bg-gray-50 border-t border-gray-100 px-4 pt-2 pb-1 flex items-center gap-3 flex-shrink-0">
              <img src={pendingImage.dataUrl} alt="Preview" className="w-16 h-16 object-cover rounded-lg border border-gray-200" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-700 truncate">{pendingImage.file.name}</p>
                <p className="text-[10px] text-gray-400">{(pendingImage.file.size / 1024).toFixed(0)} KB · clique Enviar para confirmar</p>
              </div>
              <button type="button" onClick={() => setPendingImage(null)} className="text-gray-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition-colors">
                <X size={15} />
              </button>
            </div>
          )}

          {/* Input */}
          <form onSubmit={handleEnviar} className="bg-white border-t border-gray-100 p-3 flex gap-2 items-center flex-shrink-0">
            {/* Botão de anexar imagem */}
            {!isRecording && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={enviando}
                title="Enviar imagem"
                className="w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-xl text-gray-400 hover:text-accent hover:bg-accent/10 transition-colors disabled:opacity-40"
              >
                <Paperclip size={18} />
              </button>
            )}
            {!isRecording && (
              <input
                value={mensagem}
                onChange={e => setMensagem(e.target.value)}
                placeholder={pendingImage ? 'Legenda (opcional)…' : 'Digite uma mensagem...'}
                className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
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
                disabled={(!mensagem.trim() && !pendingImage) || enviando}
                className="bg-accent text-white rounded-xl px-4 py-2.5 hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                <Send size={16} />
                <span className="text-sm font-medium hidden sm:block">
                  {pendingImage ? 'Enviar' : 'Enviar'}
                </span>
              </button>
            )}
          </form>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-gray-50">
          <div className="text-center text-gray-400">
            <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-3">
              <Search size={24} />
            </div>
            <p className="text-sm">Selecione uma conversa</p>
          </div>
        </div>
      )}

      {/* Painel do contato */}
      {selecionada && (
        <div className="w-72 flex-shrink-0 bg-white border-l border-gray-100 overflow-y-auto">
          <div className="p-5">
            <div className="text-center mb-4">
              <ContactAvatar nome={resolverNome(selecionada, contatoSelecionado ?? undefined)} seed={selecionada.telefone} size={64} />
              <h2 className="text-base font-bold text-gray-900 mt-3">{resolverNome(selecionada, contatoSelecionado ?? undefined)}</h2>
              <p className="text-sm text-gray-500">{formatPhone(selecionada.telefone)}</p>
              {contatoSelecionado?.etapa && (
                <span className="inline-block mt-2 px-3 py-1 rounded-full text-xs font-medium text-white" style={{ backgroundColor: contatoSelecionado.etapa.cor }}>
                  {contatoSelecionado.etapa.nome}
                </span>
              )}
            </div>

            <div className="space-y-3 text-sm">
              {contatoSelecionado?.email && (
                <div className="flex items-center gap-2 text-gray-600">
                  <span className="text-gray-400">Email:</span>
                  <span className="truncate">{contatoSelecionado.email}</span>
                </div>
              )}
              <div className="flex items-center gap-2 text-gray-600">
                <span className="text-gray-400">Status:</span>
                <span className="capitalize">{contatoSelecionado?.status ?? '—'}</span>
              </div>
              <div className="flex items-center gap-2 text-gray-600">
                <span className="text-gray-400">Origem:</span>
                <span className="capitalize">{contatoSelecionado?.origem ?? '—'}</span>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1"><FileText size={12} />Observações</span>
                <button onClick={() => setEditandoObs(!editandoObs)} className="text-xs text-accent hover:underline">
                  {editandoObs ? 'Cancelar' : 'Editar'}
                </button>
              </div>
              {editandoObs ? (
                <div>
                  <textarea
                    value={obs}
                    onChange={e => setObs(e.target.value)}
                    rows={4}
                    className="w-full border border-gray-200 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent resize-none"
                  />
                  <button onClick={salvarObs} className="mt-2 w-full bg-accent text-white rounded-lg py-1.5 text-sm hover:bg-blue-700 transition-colors">
                    Salvar
                  </button>
                </div>
              ) : (
                <p className="text-sm text-gray-600">{obs || <span className="text-gray-400 italic">Sem observações</span>}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
