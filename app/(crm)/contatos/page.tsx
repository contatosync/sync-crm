'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import ContactAvatar from '@/components/ContactAvatar'
import { formatPhone, formatDate, formatDateTime } from '@/lib/utils'
import { Search, X, MessageSquare, Phone, Mail } from 'lucide-react'
import type { Contato, EtapaFunil, Conversa } from '@/types'

export default function ContatosPage() {
  const [contatos, setContatos] = useState<Contato[]>([])
  const [etapas, setEtapas] = useState<EtapaFunil[]>([])
  const [conversas, setConversas] = useState<Record<string, Conversa>>({})
  const [busca, setBusca] = useState('')
  const [filtroEtapa, setFiltroEtapa] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [selecionado, setSelecionado] = useState<Contato | null>(null)
  const [editando, setEditando] = useState(false)
  const [form, setForm] = useState<Partial<Contato>>({})

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const [{ data: c }, { data: e }, { data: conv }] = await Promise.all([
      supabase.from('crm_contatos').select('*, etapa:etapas_funil(*)').order('atualizado_em', { ascending: false }),
      supabase.from('etapas_funil').select('*').order('ordem'),
      supabase.from('conversas').select('*'),
    ])
    if (c) setContatos(c as Contato[])
    if (e) setEtapas(e as EtapaFunil[])
    if (conv) {
      const map: Record<string, Conversa> = {}
      ;(conv as Conversa[]).forEach(v => { map[v.telefone] = v })
      setConversas(map)
    }
  }

  const filtrados = contatos.filter(c => {
    const nome = c.nome ?? ''
    const matchBusca = nome.toLowerCase().includes(busca.toLowerCase()) || c.telefone.includes(busca) || (c.email ?? '').toLowerCase().includes(busca.toLowerCase())
    const matchEtapa = !filtroEtapa || c.etapa_funil_id === filtroEtapa
    const matchStatus = !filtroStatus || c.status === filtroStatus
    return matchBusca && matchEtapa && matchStatus
  })

  function abrirDetalhes(contato: Contato) {
    setSelecionado(contato)
    setForm({ nome: contato.nome ?? '', email: contato.email ?? '', status: contato.status ?? '', observacoes: contato.observacoes ?? '', etapa_funil_id: contato.etapa_funil_id ?? '' })
    setEditando(false)
  }

  async function salvarEdicao() {
    if (!selecionado) return
    await supabase.from('crm_contatos').update({
      nome: form.nome, email: form.email, status: form.status, observacoes: form.observacoes, etapa_funil_id: form.etapa_funil_id || null
    }).eq('id', selecionado.id)
    setEditando(false)
    await loadData()
    const updated = contatos.find(c => c.id === selecionado.id)
    if (updated) setSelecionado({ ...updated, ...form } as Contato)
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-6 pb-4 flex-shrink-0 bg-white border-b border-gray-100">
        <h1 className="text-xl font-bold text-gray-900 mb-3">Contatos</h1>
        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nome, telefone ou email..." className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent" />
          </div>
          <select value={filtroEtapa} onChange={e => setFiltroEtapa(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/20">
            <option value="">Todas as etapas</option>
            {etapas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </select>
          <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/20">
            <option value="">Todos os status</option>
            <option value="lead">Lead</option>
            <option value="qualificado">Qualificado</option>
            <option value="cliente">Cliente</option>
          </select>
        </div>
        <p className="text-xs text-gray-400 mt-2">{filtrados.length} contatos</p>
      </div>

      <div className="flex-1 overflow-y-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100 sticky top-0">
            <tr>
              <th className="text-left p-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Contato</th>
              <th className="text-left p-4 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Telefone</th>
              <th className="text-left p-4 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Etapa</th>
              <th className="text-left p-4 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Status</th>
              <th className="text-left p-4 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden xl:table-cell">Último contato</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtrados.map(contato => (
              <tr key={contato.id} onClick={() => abrirDetalhes(contato)} className="hover:bg-gray-50 cursor-pointer transition-colors">
                <td className="p-4">
                  <div className="flex items-center gap-3">
                    <ContactAvatar nome={contato.nome} fotoUrl={contato.foto_url} size={36} />
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{contato.nome ?? 'Sem nome'}</p>
                      <p className="text-xs text-gray-400 md:hidden">{formatPhone(contato.telefone)}</p>
                    </div>
                  </div>
                </td>
                <td className="p-4 hidden md:table-cell">
                  <span className="text-sm text-gray-600">{formatPhone(contato.telefone)}</span>
                </td>
                <td className="p-4 hidden lg:table-cell">
                  {contato.etapa && (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium text-white" style={{ backgroundColor: contato.etapa.cor }}>
                      {contato.etapa.nome}
                    </span>
                  )}
                </td>
                <td className="p-4 hidden lg:table-cell">
                  <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium capitalize ${
                    contato.status === 'cliente' ? 'bg-green-100 text-green-700' :
                    contato.status === 'qualificado' ? 'bg-blue-100 text-blue-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>{contato.status ?? '—'}</span>
                </td>
                <td className="p-4 hidden xl:table-cell text-sm text-gray-400">{formatDate(contato.atualizado_em)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtrados.length === 0 && <div className="p-12 text-center text-gray-400 text-sm">Nenhum contato encontrado</div>}
      </div>

      {/* Painel lateral */}
      {selecionado && (
        <div className="fixed inset-0 bg-black/40 flex justify-end z-50" onClick={() => setSelecionado(null)}>
          <div className="w-96 bg-white h-full overflow-y-auto shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <h2 className="text-lg font-bold">Detalhes do Contato</h2>
                <button onClick={() => setSelecionado(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
              </div>

              {/* Avatar e nome */}
              <div className="text-center mb-6">
                <ContactAvatar nome={selecionado.nome} fotoUrl={selecionado.foto_url} size={80} />
                {editando ? (
                  <input value={form.nome ?? ''} onChange={e => setForm(f => ({...f, nome: e.target.value}))} className="mt-2 text-center border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-full focus:outline-none focus:ring-2 focus:ring-accent/20" />
                ) : (
                  <h3 className="text-xl font-bold mt-3 text-gray-900">{selecionado.nome ?? 'Sem nome'}</h3>
                )}
                <p className="text-sm text-gray-500 flex items-center justify-center gap-1 mt-1">
                  <Phone size={12} />{formatPhone(selecionado.telefone)}
                </p>
              </div>

              {/* Campos */}
              <div className="space-y-3 mb-6">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Email</label>
                  {editando ? <input value={form.email ?? ''} onChange={e => setForm(f => ({...f, email: e.target.value}))} type="email" className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/20" /> :
                  <p className="text-sm text-gray-700 mt-1">{selecionado.email ?? '—'}</p>}
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</label>
                  {editando ? (
                    <select value={form.status ?? ''} onChange={e => setForm(f => ({...f, status: e.target.value}))} className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/20">
                      <option value="">—</option>
                      <option value="lead">Lead</option>
                      <option value="qualificado">Qualificado</option>
                      <option value="cliente">Cliente</option>
                    </select>
                  ) : <p className="text-sm text-gray-700 mt-1 capitalize">{selecionado.status ?? '—'}</p>}
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Etapa do Funil</label>
                  {editando ? (
                    <select value={form.etapa_funil_id ?? ''} onChange={e => setForm(f => ({...f, etapa_funil_id: e.target.value}))} className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/20">
                      <option value="">—</option>
                      {etapas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
                    </select>
                  ) : <p className="text-sm text-gray-700 mt-1">{selecionado.etapa?.nome ?? '—'}</p>}
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Observações</label>
                  {editando ? <textarea value={form.observacoes ?? ''} onChange={e => setForm(f => ({...f, observacoes: e.target.value}))} rows={3} className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 resize-none" /> :
                  <p className="text-sm text-gray-700 mt-1">{selecionado.observacoes ?? '—'}</p>}
                </div>
              </div>

              {editando ? (
                <div className="flex gap-2">
                  <button onClick={salvarEdicao} className="flex-1 bg-accent text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 transition-colors">Salvar</button>
                  <button onClick={() => setEditando(false)} className="flex-1 bg-gray-100 text-gray-600 rounded-lg py-2 text-sm font-medium hover:bg-gray-200 transition-colors">Cancelar</button>
                </div>
              ) : (
                <button onClick={() => setEditando(true)} className="w-full bg-accent text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 transition-colors">Editar Contato</button>
              )}

              {/* Histórico de conversas */}
              {conversas[selecionado.telefone] && (
                <div className="mt-6 pt-6 border-t border-gray-100">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">ÚLTIMAS MENSAGENS</h4>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {[...(conversas[selecionado.telefone].historico ?? [])].reverse().slice(0, 10).map((msg, i) => (
                      <div key={i} className={`p-2 rounded-lg text-xs ${msg.role === 'assistant' ? 'bg-blue-50 text-blue-800' : 'bg-gray-50 text-gray-700'}`}>
                        <p className="font-medium mb-0.5">{msg.role === 'assistant' ? 'Bot' : 'Cliente'}</p>
                        <p className="truncate">{msg.content}</p>
                        <p className="text-gray-400 mt-0.5">{formatDateTime(msg.timestamp)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
