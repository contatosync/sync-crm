'use client'
import { useState, useEffect } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'
import { supabase } from '@/lib/supabase'
import { subDays, parseISO, isToday, isYesterday, startOfDay, format, differenceInMinutes } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { Contato, Conversa, EtapaFunil, Tarefa, Mensagem } from '@/types'

type Period = 'hoje' | 'ontem' | 'semana' | 'mes' | 'todos'

const PERIOD_LABELS: Record<Period, string> = {
  hoje: 'Hoje', ontem: 'Ontem', semana: 'Semana', mes: 'Mês', todos: 'Todos',
}

const PIE_COLORS = ['#6366F1', '#8B5CF6', '#EC4899', '#EF4444', '#F97316', '#EAB308', '#22C55E', '#14B8A6', '#3B82F6', '#06B6D4']

function getPeriodRange(period: Period): { from: Date | null; to: Date | null } {
  const now = new Date()
  if (period === 'hoje') return { from: startOfDay(now), to: now }
  if (period === 'ontem') {
    const y = subDays(now, 1)
    return { from: startOfDay(y), to: startOfDay(now) }
  }
  if (period === 'semana') return { from: subDays(now, 7), to: now }
  if (period === 'mes') return { from: subDays(now, 30), to: now }
  return { from: null, to: null }
}

function inPeriod(dateStr: string, range: { from: Date | null; to: Date | null }): boolean {
  if (!range.from) return true
  try {
    const d = parseISO(dateStr)
    return d >= range.from && d <= (range.to ?? new Date())
  } catch { return false }
}

function formatRelative(dateStr: string): string {
  try {
    const d = parseISO(dateStr)
    const now = new Date()
    const diff = differenceInMinutes(now, d)
    if (diff < 1) return 'agora'
    if (diff < 60) return `há ${diff}min`
    if (diff < 1440) return `há ${Math.floor(diff / 60)}h`
    if (diff < 2880) return 'ontem'
    return `há ${Math.floor(diff / 1440)} dias`
  } catch { return '' }
}

function MetricCard({
  title, value, subtitle, valueColor = '#ffffff', icon,
}: {
  title: string; value: string | number; subtitle?: string; valueColor?: string; icon?: string
}) {
  return (
    <div className="rounded-xl p-5 border flex flex-col gap-2"
      style={{ backgroundColor: '#1A2535', borderColor: '#2A3A4A' }}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.45)' }}>
          {title}
        </p>
        {icon && <span className="text-lg">{icon}</span>}
      </div>
      <p className="text-3xl font-black" style={{ color: valueColor }}>{value}</p>
      {subtitle && <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{subtitle}</p>}
    </div>
  )
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
        supabase.from('conversas').select('atualizado_em,historico,telefone,nome').range(0, 999),
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

  const range = getPeriodRange(period)

  // ── Metrics ──
  const filteredConversas = conversas.filter(c => inPeriod(c.atualizado_em, range))
  const filteredContatos = contatos.filter(c => inPeriod(c.criado_em, range))

  const semResposta = conversas.filter(c => {
    const hist: Mensagem[] = c.historico ?? []
    const last = hist[hist.length - 1]
    return last?.role === 'user'
  })

  const contatosAtivos = contatos.filter(c => c.status === 'ativo')
  const contatosGanhos = contatos.filter(c => c.status === 'ganho' && inPeriod(c.criado_em, range))
  const tarefasPendentes = tarefas.filter(t => t.status === 'pendente')
  const tarefasVencidas = tarefas.filter(t => {
    if (t.status !== 'pendente' || !t.vencimento) return false
    try { return parseISO(t.vencimento) < new Date() } catch { return false }
  })

  // ── Tempo médio de resposta ──
  let totalMinutes = 0, totalPairs = 0
  conversas.forEach(conv => {
    const hist: Mensagem[] = conv.historico ?? []
    for (let i = 1; i < hist.length; i++) {
      if (hist[i - 1].role === 'user' && hist[i].role === 'assistant') {
        const t1 = hist[i - 1].timestamp, t2 = hist[i].timestamp
        if (t1 && t2) {
          try {
            const diff = differenceInMinutes(parseISO(t2), parseISO(t1))
            if (diff >= 0 && diff < 1440) { totalMinutes += diff; totalPairs++ }
          } catch { /* noop */ }
        }
      }
    }
  })
  const avgResponseMin = totalPairs > 0 ? Math.round(totalMinutes / totalPairs) : null
  const avgResponseStr = avgResponseMin === null ? '—'
    : avgResponseMin < 60 ? `${avgResponseMin}min`
    : `${Math.floor(avgResponseMin / 60)}h ${avgResponseMin % 60}min`

  // ── Contato mais tempo esperando ──
  type LongestWaiting = { nome: string; diff: string }
  let longestWaiting: LongestWaiting | null = null
  let longestMs = 0
  conversas.forEach(conv => {
    const hist: Mensagem[] = conv.historico ?? []
    const last = hist[hist.length - 1]
    if (last?.role !== 'user' || !last.timestamp) return
    try {
      const diff = Date.now() - parseISO(last.timestamp).getTime()
      if (diff > longestMs) {
        longestMs = diff
        const minutes = Math.floor(diff / 60000)
        const diffStr = minutes < 60 ? `${minutes}min` : minutes < 1440 ? `${Math.floor(minutes / 60)}h` : `${Math.floor(minutes / 1440)} dias`
        longestWaiting = { nome: conv.nome || conv.telefone, diff: diffStr }
      }
    } catch { /* noop */ }
  })
  const waiting = longestWaiting as LongestWaiting | null

  // ── Origem pie chart ──
  const origemMap: Record<string, number> = {}
  contatos.forEach(c => {
    const o = c.origem || 'Desconhecido'
    origemMap[o] = (origemMap[o] ?? 0) + 1
  })
  const origemData = Object.entries(origemMap).map(([name, value]) => ({ name, value }))

  // ── Activity line chart (últimos 7 dias) ──
  const activityData = Array.from({ length: 7 }, (_, i) => {
    const day = subDays(new Date(), 6 - i)
    const dayStart = startOfDay(day)
    const dayEnd = startOfDay(subDays(day, -1))
    const msgs = conversas.filter(c => {
      try { const d = parseISO(c.atualizado_em); return d >= dayStart && d < dayEnd } catch { return false }
    }).length
    const leads = contatos.filter(c => {
      try { const d = parseISO(c.criado_em); return d >= dayStart && d < dayEnd } catch { return false }
    }).length
    return { dia: format(day, 'EEE', { locale: ptBR }), mensagens: msgs, leads }
  })

  // ── Leads por etapa ──
  const leadsEtapa = etapas.map(e => ({
    nome: e.nome, total: contatos.filter(c => c.etapa_funil_id === e.id).length, cor: e.cor,
  })).filter(x => x.total > 0)

  // ── Atividades recentes ──
  type Activity = { icon: string; text: string; time: string; ts: string }
  const activities: Activity[] = []

  conversas
    .slice()
    .sort((a, b) => b.atualizado_em.localeCompare(a.atualizado_em))
    .slice(0, 5)
    .forEach(c => {
      const hist: Mensagem[] = c.historico ?? []
      const last = hist[hist.length - 1]
      if (last?.role === 'user') {
        activities.push({
          icon: '💬',
          text: `Nova mensagem de ${c.nome || c.telefone}`,
          time: formatRelative(c.atualizado_em),
          ts: c.atualizado_em,
        })
      }
    })

  contatos
    .slice()
    .sort((a, b) => b.criado_em.localeCompare(a.criado_em))
    .slice(0, 5)
    .forEach(c => {
      activities.push({
        icon: '👤',
        text: `Novo lead: ${c.nome || c.telefone}`,
        time: formatRelative(c.criado_em),
        ts: c.criado_em,
      })
    })

  activities.sort((a, b) => b.ts.localeCompare(a.ts))
  const recentActivities = activities.slice(0, 10)

  // ── Valor total leads ganhos ──
  const valorGanhos = contatosGanhos.reduce((acc, c) => {
    const v = (c.campos_custom as Record<string, unknown> | null)?.valor
    return acc + (typeof v === 'number' ? v : 0)
  }, 0)

  return (
    <div className="flex flex-col h-full overflow-y-auto" style={{ backgroundColor: '#0F1923' }}>
      {/* ── Header ── */}
      <div className="px-6 py-4 border-b flex items-center justify-between flex-shrink-0"
        style={{ borderColor: '#2A3A4A', backgroundColor: '#131E2B' }}>
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-black text-white tracking-wide">SYNC STUDIOS</h1>
          <span className="text-xs px-2 py-1 rounded-full font-semibold" style={{ backgroundColor: '#1A2535', color: 'rgba(255,255,255,0.5)' }}>
            CRM
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button className="text-xs font-bold px-3 py-2 rounded-lg border"
            style={{ borderColor: '#2A3A4A', color: 'rgba(255,255,255,0.6)' }}>
            ≡ ATIVIDADES
          </button>
        </div>
      </div>

      {/* ── Period Filter ── */}
      <div className="px-6 pt-5 pb-2 flex items-center gap-2 flex-shrink-0">
        <div className="flex gap-1 p-1 rounded-xl" style={{ backgroundColor: '#1A2535' }}>
          {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className="px-4 py-1.5 rounded-lg text-xs font-bold transition-all"
              style={{
                backgroundColor: period === p ? '#2563EB' : 'transparent',
                color: period === p ? '#ffffff' : 'rgba(255,255,255,0.45)',
              }}>
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center" style={{ color: 'rgba(255,255,255,0.3)' }}>
          Carregando…
        </div>
      ) : (
        <div className="p-6 space-y-6 flex-1">

          {/* ── Row 1: 3 metric cards + pie chart ── */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <MetricCard
              title="Mensagens Recebidas"
              value={filteredConversas.length}
              subtitle="WhatsApp Cloud API"
              valueColor="#00C853"
              icon="💬"
            />
            <MetricCard
              title="Conversas Ativas"
              value={contatosAtivos.length}
              subtitle="no período"
              valueColor="#7C3AED"
              icon="🔥"
            />
            <MetricCard
              title="Chats Sem Resposta"
              value={semResposta.length}
              subtitle="aguardando retorno"
              valueColor="#F44336"
              icon="⏳"
            />
            {/* Pie chart card */}
            <div className="rounded-xl p-4 border" style={{ backgroundColor: '#1A2535', borderColor: '#2A3A4A' }}>
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'rgba(255,255,255,0.45)' }}>
                Fontes de Lead
              </p>
              {origemData.length > 0 ? (
                <div className="flex items-center gap-2">
                  <ResponsiveContainer width={80} height={80}>
                    <PieChart>
                      <Pie data={origemData} dataKey="value" cx="50%" cy="50%" outerRadius={38} innerRadius={18}>
                        {origemData.map((_e, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip
                        contentStyle={{ backgroundColor: '#1A2535', border: '1px solid #2A3A4A', borderRadius: 8 }}
                        itemStyle={{ color: '#fff' }}
                        formatter={(v, n) => [v, n]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 space-y-1 min-w-0">
                    {origemData.slice(0, 4).map((o, i) => (
                      <div key={o.name} className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                        <span className="text-[10px] truncate flex-1" style={{ color: 'rgba(255,255,255,0.55)' }}>{o.name}</span>
                        <span className="text-[10px] font-bold text-white">{o.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-center py-4" style={{ color: 'rgba(255,255,255,0.3)' }}>Sem dados</p>
              )}
            </div>
          </div>

          {/* ── Row 2: response time, waiting, ganhos, leads, tarefas ── */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <MetricCard
              title="Tempo Médio Resposta"
              value={avgResponseStr}
              subtitle="entre mensagens"
              valueColor="#F59E0B"
              icon="⚡"
            />
            <div className="rounded-xl p-5 border" style={{ backgroundColor: '#1A2535', borderColor: '#2A3A4A' }}>
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'rgba(255,255,255,0.45)' }}>
                Mais Tempo Esperando ⏰
              </p>
              {waiting ? (
                <>
                  <p className="text-base font-bold text-white truncate">{waiting.nome}</p>
                  <p className="text-xs mt-1" style={{ color: '#F44336' }}>há {waiting.diff}</p>
                </>
              ) : (
                <p className="text-2xl font-black text-white">—</p>
              )}
            </div>
            <MetricCard
              title="Leads Ganhos"
              value={contatosGanhos.length}
              subtitle={valorGanhos > 0 ? `R$ ${valorGanhos.toLocaleString('pt-BR')}` : 'R$ 0'}
              valueColor="#00C853"
              icon="🏆"
            />
            <MetricCard
              title="Leads Ativos"
              value={contatosAtivos.length}
              subtitle="R$ 0"
              valueColor="#3B82F6"
              icon="📊"
            />
            <div className="rounded-xl p-5 border" style={{ backgroundColor: '#1A2535', borderColor: '#2A3A4A' }}>
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'rgba(255,255,255,0.45)' }}>
                Tarefas ✅
              </p>
              <p className="text-3xl font-black" style={{ color: tarefasVencidas.length > 0 ? '#F44336' : '#ffffff' }}>
                {tarefasPendentes.length}
              </p>
              {tarefasVencidas.length > 0 && (
                <p className="text-xs mt-1 font-bold" style={{ color: '#F44336' }}>
                  {tarefasVencidas.length} vencida{tarefasVencidas.length > 1 ? 's' : ''}
                </p>
              )}
            </div>
          </div>

          {/* ── Row 3: Line chart + Recent activities ── */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Activity chart */}
            <div className="lg:col-span-2 rounded-xl p-5 border" style={{ backgroundColor: '#1A2535', borderColor: '#2A3A4A' }}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-white">Atividade — Últimos 7 dias</h3>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-0.5 rounded-full bg-green-400" />
                    <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.45)' }}>Mensagens</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-0.5 rounded-full bg-blue-400" />
                    <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.45)' }}>Leads</span>
                  </div>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={activityData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <XAxis dataKey="dia" tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.35)' }}
                    axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.35)' }}
                    axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#131E2B', border: '1px solid #2A3A4A', borderRadius: 8 }}
                    itemStyle={{ color: '#fff' }}
                    labelStyle={{ color: 'rgba(255,255,255,0.6)', fontSize: 11 }}
                  />
                  <Line type="monotone" dataKey="mensagens" stroke="#4ADE80" strokeWidth={2}
                    dot={false} activeDot={{ r: 4, fill: '#4ADE80' }} name="Mensagens" />
                  <Line type="monotone" dataKey="leads" stroke="#60A5FA" strokeWidth={2}
                    dot={false} activeDot={{ r: 4, fill: '#60A5FA' }} name="Leads" />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Recent activities */}
            <div className="rounded-xl p-5 border flex flex-col" style={{ backgroundColor: '#1A2535', borderColor: '#2A3A4A' }}>
              <h3 className="text-sm font-bold text-white mb-4">Atividades Recentes</h3>
              <div className="flex-1 space-y-3 overflow-y-auto">
                {recentActivities.length > 0 ? recentActivities.map((a, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <span className="text-base flex-shrink-0 mt-0.5">{a.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-white leading-snug">{a.text}</p>
                      <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>{a.time}</p>
                    </div>
                  </div>
                )) : (
                  <p className="text-xs text-center py-4" style={{ color: 'rgba(255,255,255,0.3)' }}>Sem atividades</p>
                )}
              </div>
            </div>
          </div>

          {/* ── Row 4: Leads por etapa ── */}
          {leadsEtapa.length > 0 && (
            <div className="rounded-xl p-5 border" style={{ backgroundColor: '#1A2535', borderColor: '#2A3A4A' }}>
              <h3 className="text-sm font-bold text-white mb-4">Leads por Etapa do Funil</h3>
              <div className="flex items-end gap-3">
                {leadsEtapa.map((e, i) => {
                  const maxH = Math.max(...leadsEtapa.map(x => x.total))
                  const h = Math.round((e.total / maxH) * 120)
                  return (
                    <div key={i} className="flex flex-col items-center gap-1.5 flex-1">
                      <span className="text-xs font-bold text-white">{e.total}</span>
                      <div className="w-full rounded-t-lg transition-all" style={{ height: h, backgroundColor: e.cor, minHeight: 8 }} />
                      <span className="text-[9px] text-center truncate w-full"
                        style={{ color: 'rgba(255,255,255,0.4)' }}>{e.nome}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Row 5: New contacts in period ── */}
          <div className="rounded-xl p-5 border" style={{ backgroundColor: '#1A2535', borderColor: '#2A3A4A' }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-white">Novos Contatos — {PERIOD_LABELS[period]}</h3>
              <span className="text-xs font-bold px-2 py-1 rounded-lg" style={{ backgroundColor: '#0F1923', color: '#00C853' }}>
                +{filteredContatos.length}
              </span>
            </div>
            {filteredContatos.length > 0 ? (
              <div className="space-y-2">
                {filteredContatos.slice(0, 6).map(c => {
                  const etapa = etapas.find(e => e.id === c.etapa_funil_id)
                  return (
                    <div key={c.id} className="flex items-center gap-3 py-1.5 px-3 rounded-lg"
                      style={{ backgroundColor: '#0F1923' }}>
                      <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold text-white"
                        style={{ backgroundColor: etapa?.cor ?? '#6366F1' }}>
                        {(c.nome || c.telefone || '?')[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-white truncate">{c.nome || c.telefone}</p>
                        <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
                          {c.origem || '—'} · {formatRelative(c.criado_em)}
                        </p>
                      </div>
                      {etapa && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded text-white flex-shrink-0"
                          style={{ backgroundColor: etapa.cor }}>
                          {etapa.nome}
                        </span>
                      )}
                    </div>
                  )
                })}
                {filteredContatos.length > 6 && (
                  <p className="text-xs text-center pt-1" style={{ color: 'rgba(255,255,255,0.35)' }}>
                    +{filteredContatos.length - 6} mais
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-center py-4" style={{ color: 'rgba(255,255,255,0.3)' }}>Nenhum contato novo no período</p>
            )}
          </div>

        </div>
      )}
    </div>
  )
}
