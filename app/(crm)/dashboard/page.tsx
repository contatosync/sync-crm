'use client'
import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import { supabase } from '@/lib/supabase'
import { isToday, subDays, parseISO } from 'date-fns'
import type { Contato, Conversa, EtapaFunil, Tarefa, Mensagem } from '@/types'

type Period = 'hoje' | 'semana' | 'mes' | 'todos'

const PIE_COLORS = ['#6366F1','#8B5CF6','#EC4899','#EF4444','#F97316','#EAB308','#22C55E','#14B8A6','#3B82F6','#06B6D4']

function inPeriod(dateStr: string, period: Period): boolean {
  try {
    const d = parseISO(dateStr)
    const now = new Date()
    if (period === 'hoje') return isToday(d)
    if (period === 'semana') return d >= subDays(now, 7)
    if (period === 'mes') return d >= subDays(now, 30)
    return true
  } catch { return false }
}

export default function DashboardPage() {
  const [period, setPeriod] = useState<Period>('mes')
  const [conversas, setConversas] = useState<Conversa[]>([])
  const [contatos, setContatos] = useState<Contato[]>([])
  const [etapas, setEtapas] = useState<EtapaFunil[]>([])
  const [tarefas, setTarefas] = useState<Tarefa[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [{ data: c }, { data: cont }, { data: e }, { data: t }] = await Promise.all([
        supabase.from('conversas').select('atualizado_em, historico, telefone').range(0, 999),
        supabase.from('crm_contatos').select('*').range(0, 999),
        supabase.from('etapas_funil').select('*').order('ordem'),
        supabase.from('tarefas').select('*').range(0, 999),
      ])
      if (c) setConversas(c as Conversa[])
      if (cont) setContatos(cont as Contato[])
      if (e) setEtapas(e as EtapaFunil[])
      if (t) setTarefas(t as Tarefa[])
      setLoading(false)
    }
    load()
  }, [])

  const filteredConversas = conversas.filter(c => inPeriod(c.atualizado_em, period))
  const filteredContatos = contatos.filter(c => inPeriod(c.criado_em, period))

  const semResposta = conversas.filter(c => {
    const hist: Mensagem[] = c.historico ?? []
    const last = hist[hist.length - 1]
    return last?.role === 'user'
  })

  const tarefasPendentes = tarefas.filter(t => t.status === 'pendente')

  const leadsEtapa = etapas.map(e => ({
    nome: e.nome,
    total: contatos.filter(c => c.etapa_funil_id === e.id).length,
    cor: e.cor,
  })).filter(x => x.total > 0)

  const origemMap: Record<string, number> = {}
  contatos.forEach(c => {
    const o = c.origem || 'Desconhecido'
    origemMap[o] = (origemMap[o] ?? 0) + 1
  })
  const origemData = Object.entries(origemMap).map(([name, value]) => ({ name, value }))

  const stats = [
    { label: 'Mensagens Recebidas', value: filteredConversas.length, color: '#3B82F6', icon: '💬' },
    { label: 'Sem Resposta', value: semResposta.length, color: '#F97316', icon: '⏳' },
    { label: 'Novos Contatos', value: filteredContatos.length, color: '#22C55E', icon: '👤' },
    { label: 'Tarefas Pendentes', value: tarefasPendentes.length, color: '#8B5CF6', icon: '✅' },
  ]

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-6 py-4 border-b border-gray-200 bg-white flex items-center justify-between flex-shrink-0">
        <h1 className="text-lg font-semibold text-gray-900">Dashboard</h1>
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          {(['hoje','semana','mes','todos'] as Period[]).map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors capitalize ${period===p ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {p === 'hoje' ? 'Hoje' : p === 'semana' ? 'Semana' : p === 'mes' ? 'Mês' : 'Todos'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-gray-400">Carregando…</div>
      ) : (
        <div className="p-6 space-y-6">
          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {stats.map(s => (
              <div key={s.label} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-2xl">{s.icon}</span>
                  <div className="w-1 h-8 rounded-full" style={{ backgroundColor: s.color }}/>
                </div>
                <p className="text-3xl font-bold text-gray-900">{s.value}</p>
                <p className="text-sm text-gray-500 mt-1">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Leads por etapa */}
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <h3 className="font-semibold text-gray-900 mb-4">Leads por Etapa</h3>
              {leadsEtapa.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={leadsEtapa} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <XAxis dataKey="nome" tick={{ fontSize: 11 }} axisLine={false} tickLine={false}/>
                    <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false}/>
                    <Tooltip formatter={(v) => [v, 'Leads']}/>
                    <Bar dataKey="total" radius={[4,4,0,0]}>
                      {leadsEtapa.map((e, i) => <Cell key={i} fill={e.cor}/>)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="text-sm text-gray-400 text-center py-10">Sem dados</p>}
            </div>

            {/* Fontes de lead */}
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <h3 className="font-semibold text-gray-900 mb-4">Fontes de Lead</h3>
              {origemData.length > 0 ? (
                <div className="flex items-center gap-4">
                  <ResponsiveContainer width={180} height={180}>
                    <PieChart>
                      <Pie data={origemData} dataKey="value" cx="50%" cy="50%" outerRadius={80} innerRadius={40}>
                        {origemData.map((_e, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]}/>)}
                      </Pie>
                      <Tooltip formatter={(v, n) => [v, n]}/>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 space-y-2">
                    {origemData.map((o, i) => (
                      <div key={o.name} className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}/>
                        <span className="text-xs text-gray-600 truncate flex-1">{o.name}</span>
                        <span className="text-xs font-medium text-gray-900">{o.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : <p className="text-sm text-gray-400 text-center py-10">Sem dados de origem</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
