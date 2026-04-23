'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import { format, subDays, parseISO, startOfDay, isAfter } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Users, MessageSquare, TrendingUp, Star } from 'lucide-react'
import type { Contato, Conversa, EtapaFunil } from '@/types'

export default function DashboardPage() {
  const [contatos, setContatos] = useState<Contato[]>([])
  const [conversas, setConversas] = useState<Conversa[]>([])
  const [etapas, setEtapas] = useState<EtapaFunil[]>([])

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const [{ data: c }, { data: conv }, { data: e }] = await Promise.all([
      supabase.from('crm_contatos').select('*'),
      supabase.from('conversas').select('atualizado_em, historico'),
      supabase.from('etapas_funil').select('*').order('ordem'),
    ])
    if (c) setContatos(c as Contato[])
    if (conv) setConversas(conv as Conversa[])
    if (e) setEtapas(e as EtapaFunil[])
  }

  // Conversas por dia (últimos 7 dias)
  const diasData = Array.from({ length: 7 }, (_, i) => {
    const dia = subDays(new Date(), 6 - i)
    const label = format(dia, 'EEE', { locale: ptBR })
    const count = conversas.filter(c => {
      try { return format(parseISO(c.atualizado_em), 'yyyy-MM-dd') === format(dia, 'yyyy-MM-dd') } catch { return false }
    }).length
    return { dia: label, conversas: count }
  })

  // Leads esta semana
  const semanaAtras = subDays(new Date(), 7)
  const leadsNovos = contatos.filter(c => { try { return isAfter(parseISO(c.criado_em), semanaAtras) } catch { return false } }).length

  // Qualificados
  const qualificados = contatos.filter(c => c.status === 'qualificado' || c.status === 'cliente').length

  // Conversas hoje
  const hoje = format(new Date(), 'yyyy-MM-dd')
  const conversasHoje = conversas.filter(c => { try { return format(parseISO(c.atualizado_em), 'yyyy-MM-dd') === hoje } catch { return false } }).length

  // Distribuição por etapa
  const pieData = etapas.map(e => ({
    name: e.nome,
    value: contatos.filter(c => c.etapa_funil_id === e.id).length,
    cor: e.cor,
  })).filter(d => d.value > 0)

  const metrics = [
    { label: 'Total Contatos', value: contatos.length, icon: Users, color: 'bg-blue-500' },
    { label: 'Conversas Hoje', value: conversasHoje, icon: MessageSquare, color: 'bg-green-500' },
    { label: 'Leads Esta Semana', value: leadsNovos, icon: TrendingUp, color: 'bg-purple-500' },
    { label: 'Qualificados', value: qualificados, icon: Star, color: 'bg-amber-500' },
  ]

  return (
    <div className="h-full overflow-y-auto p-6">
      <h1 className="text-xl font-bold text-gray-900 mb-6">Dashboard</h1>

      {/* Métricas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {metrics.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <div className={`w-10 h-10 ${color} rounded-xl flex items-center justify-center mb-3`}>
              <Icon size={20} className="text-white" />
            </div>
            <p className="text-2xl font-bold text-gray-900">{value}</p>
            <p className="text-sm text-gray-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Gráfico barras */}
        <div className="lg:col-span-2 bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Conversas por dia (últimos 7 dias)</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={diasData} barSize={32}>
              <XAxis dataKey="dia" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9CA3AF' }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9CA3AF' }} width={24} />
              <Tooltip contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
              <Bar dataKey="conversas" fill="#2563EB" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Gráfico donut */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Distribuição por Etapa</h2>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                  {pieData.map((entry, i) => <Cell key={i} fill={entry.cor} />)}
                </Pie>
                <Legend formatter={(value) => <span style={{ fontSize: 11, color: '#6B7280' }}>{value}</span>} />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Sem dados</div>}
        </div>

        {/* Atividade recente */}
        <div className="lg:col-span-3 bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Atividade Recente</h2>
          <div className="space-y-3">
            {conversas.slice(0, 8).map((conv, i) => {
              const ultima = conv.historico?.[conv.historico.length - 1]
              return (
                <div key={i} className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
                  <div className="w-2 h-2 rounded-full bg-accent mt-2 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700 truncate">{ultima?.content ?? '—'}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{format(parseISO(conv.atualizado_em), 'dd/MM HH:mm')}</p>
                  </div>
                </div>
              )
            })}
            {conversas.length === 0 && <p className="text-sm text-gray-400">Nenhuma atividade recente</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
