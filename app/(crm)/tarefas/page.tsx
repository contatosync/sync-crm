'use client'
import { useState, useEffect } from 'react'
import { Plus, X, ChevronDown, ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { format, parseISO, isPast, isToday, isTomorrow, addDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { Tarefa, Contato } from '@/types'

type TarefaRich = Tarefa & { contato?: { nome: string | null; telefone: string } | null }

function formatVencimento(v: string | null): string {
  if (!v) return ''
  try {
    const d = parseISO(v)
    if (isToday(d)) return 'Hoje'
    if (isTomorrow(d)) return 'Amanhã'
    return format(d, "dd 'de' MMMM", { locale: ptBR })
  } catch { return '' }
}

function getVencClass(v: string | null, status: string): string {
  if (status === 'concluida') return 'text-gray-400'
  if (!v) return 'text-gray-400'
  try {
    const d = parseISO(v)
    if (isPast(d) && !isToday(d)) return 'text-red-500 font-medium'
    if (isToday(d)) return 'text-orange-500 font-medium'
    return 'text-gray-500'
  } catch { return 'text-gray-400' }
}

export default function TarefasPage() {
  const [tarefas, setTarefas] = useState<TarefaRich[]>([])
  const [contatos, setContatos] = useState<Contato[]>([])
  const [showModal, setShowModal] = useState(false)
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [contatoId, setContatoId] = useState('')
  const [vencimento, setVencimento] = useState('')
  const [criando, setCriando] = useState(false)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ concluidas: true })

  async function load() {
    const { data } = await supabase.from('tarefas').select('*, contato:crm_contatos(nome,telefone)').order('criado_em', { ascending: false })
    if (data) setTarefas(data as TarefaRich[])
  }

  useEffect(() => {
    load()
    supabase.from('crm_contatos').select('id, nome, telefone').range(0, 999).then(({ data }) => {
      if (data) setContatos(data as Contato[])
    })
  }, [])

  async function toggle(t: TarefaRich) {
    const ns = t.status === 'pendente' ? 'concluida' : 'pendente'
    await supabase.from('tarefas').update({ status: ns }).eq('id', t.id)
    setTarefas(prev => prev.map(x => x.id === t.id ? { ...x, status: ns } : x))
  }

  async function criar() {
    if (!titulo.trim()) return
    setCriando(true)
    const { data } = await supabase.from('tarefas').insert({
      titulo: titulo.trim(), descricao: descricao || null,
      contato_id: contatoId || null, status: 'pendente',
      vencimento: vencimento || null
    }).select('*, contato:crm_contatos(nome,telefone)').single()
    if (data) { setTarefas(prev => [data as TarefaRich, ...prev]); setShowModal(false); setTitulo(''); setDescricao(''); setContatoId(''); setVencimento('') }
    setCriando(false)
  }

  const now = new Date()
  const vencidas = tarefas.filter(t => t.status === 'pendente' && t.vencimento && isPast(parseISO(t.vencimento)) && !isToday(parseISO(t.vencimento)))
  const hoje = tarefas.filter(t => t.status === 'pendente' && t.vencimento && isToday(parseISO(t.vencimento)))
  const proximas = tarefas.filter(t => t.status === 'pendente' && (!t.vencimento || (!isPast(parseISO(t.vencimento)) || isToday(parseISO(t.vencimento))) && !isToday(parseISO(t.vencimento ?? ''))) && !vencidas.includes(t) && !hoje.includes(t))
  const concluidas = tarefas.filter(t => t.status === 'concluida')

  // Recalculate proximas properly
  const proximasReal = tarefas.filter(t => {
    if (t.status !== 'pendente') return false
    if (!t.vencimento) return true
    const d = parseISO(t.vencimento)
    return !isPast(d) || isToday(d)
  }).filter(t => !hoje.includes(t))

  const sections = [
    { key: 'vencidas', label: 'Vencidas', items: vencidas, color: 'text-red-600', bg: 'bg-red-50 border-red-100' },
    { key: 'hoje', label: 'Hoje', items: hoje, color: 'text-orange-600', bg: 'bg-orange-50 border-orange-100' },
    { key: 'proximas', label: 'Próximas', items: proximasReal, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-100' },
    { key: 'concluidas', label: 'Concluídas', items: concluidas, color: 'text-gray-500', bg: 'bg-gray-50 border-gray-100' },
  ]

  function TarefaCard({ t }: { t: TarefaRich }) {
    return (
      <div className="flex items-start gap-3 p-4 bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
        <button onClick={() => toggle(t)}
          className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${t.status==='concluida' ? 'bg-green-500 border-green-500' : 'border-gray-300 hover:border-green-400'}`}>
          {t.status === 'concluida' && <span className="text-white text-[8px]">✓</span>}
        </button>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium ${t.status==='concluida' ? 'line-through text-gray-400' : 'text-gray-900'}`}>{t.titulo}</p>
          {t.descricao && <p className="text-xs text-gray-400 mt-0.5 truncate">{t.descricao}</p>}
          <div className="flex items-center gap-3 mt-1">
            {t.contato && <span className="text-xs text-gray-400">👤 {t.contato.nome || t.contato.telefone}</span>}
            {t.vencimento && (
              <span className={`text-xs ${getVencClass(t.vencimento, t.status)}`}>
                📅 {formatVencimento(t.vencimento)}
              </span>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-6 py-4 border-b border-gray-200 bg-white flex items-center justify-between flex-shrink-0">
        <h1 className="text-lg font-semibold text-gray-900">Tarefas</h1>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-primary-dark">
          <Plus size={16}/> Nova Tarefa
        </button>
      </div>

      <div className="flex-1 p-6 space-y-4">
        {sections.map(s => s.items.length > 0 && (
          <div key={s.key}>
            <button onClick={() => setCollapsed(prev => ({ ...prev, [s.key]: !prev[s.key] }))}
              className={`flex items-center gap-2 w-full text-left px-3 py-2 rounded-xl border mb-2 ${s.bg}`}>
              {collapsed[s.key] ? <ChevronRight size={14} className={s.color}/> : <ChevronDown size={14} className={s.color}/>}
              <span className={`text-sm font-semibold ${s.color}`}>{s.label}</span>
              <span className={`text-xs ml-auto ${s.color} opacity-70`}>{s.items.length}</span>
            </button>
            {!collapsed[s.key] && (
              <div className="space-y-2 ml-2">
                {s.items.map(t => <TarefaCard key={t.id} t={t}/>)}
              </div>
            )}
          </div>
        ))}
        {tarefas.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <div className="text-4xl mb-3">✅</div>
            <p className="font-medium">Nenhuma tarefa ainda</p>
            <p className="text-sm mt-1">Clique em Nova Tarefa para começar</p>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Nova Tarefa</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><X size={18}/></button>
            </div>
            <div className="space-y-3">
              <input value={titulo} onChange={e=>setTitulo(e.target.value)} placeholder="Título *"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary"/>
              <textarea value={descricao} onChange={e=>setDescricao(e.target.value)} placeholder="Descrição (opcional)" rows={2}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary resize-none"/>
              <select value={contatoId} onChange={e=>setContatoId(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary">
                <option value="">Sem contato</option>
                {contatos.map(c => <option key={c.id} value={c.id}>{c.nome || c.telefone}</option>)}
              </select>
              <input type="datetime-local" value={vencimento} onChange={e=>setVencimento(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary"/>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowModal(false)} className="flex-1 border border-gray-200 text-gray-600 rounded-xl py-2.5 text-sm">Cancelar</button>
              <button onClick={criar} disabled={criando || !titulo.trim()}
                className="flex-1 bg-primary text-white rounded-xl py-2.5 text-sm font-medium hover:bg-primary-dark disabled:opacity-60">
                {criando ? 'Criando…' : 'Criar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
