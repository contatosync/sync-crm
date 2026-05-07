'use client'
import { useState, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight, Plus, X, Check, Pencil, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, subDays, isSameMonth, isSameDay, parseISO, addMonths, subMonths,
  addWeeks, subWeeks, isPast, isToday, startOfWeek as sowFn,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { Tarefa, Contato } from '@/types'

type ViewMode = 'mes' | 'semana' | 'dia'
type TarefaRich = Tarefa & { contato?: { nome: string | null; telefone: string } | null }

function eventColor(t: TarefaRich): { bg: string; text: string; dot: string } {
  if (t.status === 'concluida') return { bg: '#DCFCE7', text: '#15803D', dot: '#22C55E' }
  if (t.vencimento && isPast(parseISO(t.vencimento)) && !isToday(parseISO(t.vencimento)))
    return { bg: '#FEE2E2', text: '#B91C1C', dot: '#EF4444' }
  if (t.vencimento && isToday(parseISO(t.vencimento)))
    return { bg: '#FEF3C7', text: '#92400E', dot: '#F59E0B' }
  return { bg: '#DBEAFE', text: '#1E40AF', dot: '#3B82F6' }
}

/* ─── Task Modal ──────────────────────────────── */
interface ModalProps {
  task?: TarefaRich | null
  initialDate?: string
  contatos: Contato[]
  onSave: (t: TarefaRich) => void
  onClose: () => void
}
function TarefaModal({ task, initialDate, contatos, onSave, onClose }: ModalProps) {
  const [titulo, setTitulo] = useState(task?.titulo ?? '')
  const [descricao, setDescricao] = useState(task?.descricao ?? '')
  const [contatoId, setContatoId] = useState(task?.contato_id ?? '')
  const [vencimento, setVencimento] = useState(
    task?.vencimento
      ? format(parseISO(task.vencimento), "yyyy-MM-dd'T'HH:mm")
      : initialDate ?? ''
  )
  const [status, setStatus] = useState<Tarefa['status']>(task?.status ?? 'pendente')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!titulo.trim()) return
    setSaving(true)
    const payload = {
      titulo: titulo.trim(), descricao: descricao.trim() || null,
      contato_id: contatoId || null, vencimento: vencimento || null, status,
    }
    let result: TarefaRich | null = null
    if (task?.id) {
      const { data } = await supabase.from('tarefas').update(payload).eq('id', task.id)
        .select('*, contato:crm_contatos(nome,telefone)').single()
      result = data as TarefaRich
    } else {
      const { data } = await supabase.from('tarefas').insert(payload)
        .select('*, contato:crm_contatos(nome,telefone)').single()
      result = data as TarefaRich
    }
    if (result) onSave(result)
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-base font-bold text-gray-900">{task ? 'Editar Tarefa' : 'Nova Tarefa'}</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400">
            <X size={16} />
          </button>
        </div>
        <div className="px-6 py-4 space-y-3">
          <input value={titulo} onChange={e => setTitulo(e.target.value)} autoFocus
            placeholder="Título *"
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary" />
          <textarea value={descricao} onChange={e => setDescricao(e.target.value)}
            placeholder="Descrição (opcional)" rows={2}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary resize-none" />
          <select value={contatoId} onChange={e => setContatoId(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary bg-white">
            <option value="">— Sem contato</option>
            {contatos.map(c => <option key={c.id} value={c.id}>{c.nome || c.telefone}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-3">
            <input type="datetime-local" value={vencimento} onChange={e => setVencimento(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary" />
            <select value={status} onChange={e => setStatus(e.target.value as Tarefa['status'])}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary bg-white">
              <option value="pendente">Pendente</option>
              <option value="em_andamento">Em andamento</option>
              <option value="concluida">Concluída</option>
            </select>
          </div>
        </div>
        <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose}
            className="flex-1 border border-gray-200 text-gray-600 rounded-xl py-2.5 text-sm font-medium hover:bg-gray-50">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving || !titulo.trim()}
            className="flex-1 bg-primary text-white rounded-xl py-2.5 text-sm font-bold hover:bg-primary-dark disabled:opacity-60 transition-colors">
            {saving ? 'Salvando…' : task ? 'Salvar' : 'Criar'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─── Task Detail Modal ───────────────────────── */
function TarefaDetailModal({
  task, onClose, onToggle, onEdit, onDelete,
}: {
  task: TarefaRich; onClose: () => void
  onToggle: () => void; onEdit: () => void; onDelete: () => void
}) {
  const colors = eventColor(task)
  const [confirmDel, setConfirmDel] = useState(false)
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: colors.dot }} />
            <span className="text-sm font-bold text-gray-900 leading-snug">{task.titulo}</span>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400">
            <X size={16} />
          </button>
        </div>
        <div className="px-5 py-4 space-y-2.5">
          {task.descricao && (
            <p className="text-sm text-gray-600">{task.descricao}</p>
          )}
          {task.contato && (
            <p className="text-sm text-gray-500">👤 {task.contato.nome || task.contato.telefone}</p>
          )}
          {task.vencimento && (
            <p className="text-sm text-gray-500">
              📅 {format(parseISO(task.vencimento), "dd/MM/yyyy 'às' HH:mm")}
            </p>
          )}
          <div className="flex items-center gap-2 pt-1">
            <span className="text-xs font-bold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: colors.bg, color: colors.text }}>
              {task.status === 'concluida' ? 'Concluída' : (task.status as string) === 'em_andamento' ? 'Em andamento' : 'Pendente'}
            </span>
          </div>
        </div>
        <div className="flex gap-2 px-5 py-4 border-t border-gray-100">
          <button onClick={onToggle}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
              task.status === 'concluida'
                ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                : 'bg-green-500 text-white hover:bg-green-600'
            }`}>
            {task.status === 'concluida' ? 'Reabrir' : '✓ Concluir'}
          </button>
          <button onClick={onEdit}
            className="px-3 py-2.5 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50">
            <Pencil size={14} />
          </button>
          {confirmDel ? (
            <div className="flex gap-1">
              <button onClick={onDelete}
                className="px-3 py-2.5 bg-red-500 text-white rounded-xl text-xs font-bold">Excluir</button>
              <button onClick={() => setConfirmDel(false)}
                className="px-2 py-2.5 border border-gray-200 rounded-xl text-xs text-gray-500">Não</button>
            </div>
          ) : (
            <button onClick={() => setConfirmDel(true)}
              className="px-3 py-2.5 border border-gray-200 rounded-xl text-red-400 hover:bg-red-50">
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/* ─── Month View ──────────────────────────────── */
function MonthView({
  current, tarefas, onDayClick, onEventClick,
}: {
  current: Date; tarefas: TarefaRich[]
  onDayClick: (day: Date) => void; onEventClick: (t: TarefaRich) => void
}) {
  const start = startOfWeek(startOfMonth(current), { weekStartsOn: 0 })
  const end = endOfWeek(endOfMonth(current), { weekStartsOn: 0 })
  const days: Date[] = []
  let d = start
  while (d <= end) { days.push(d); d = addDays(d, 1) }

  const tarefasForDay = (day: Date) =>
    tarefas.filter(t => t.vencimento && isSameDay(parseISO(t.vencimento), day))

  const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex-1 flex flex-col min-h-0">
      <div className="grid grid-cols-7 border-b border-gray-100 flex-shrink-0">
        {weekDays.map(w => (
          <div key={w} className="py-2.5 text-center text-[10px] font-bold text-gray-400 uppercase tracking-wide">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 flex-1 overflow-hidden" style={{ gridAutoRows: '1fr' }}>
        {days.map((day, i) => {
          const inMonth = isSameMonth(day, current)
          const isNow = isToday(day)
          const dayTasks = tarefasForDay(day)
          return (
            <div key={i} onClick={() => onDayClick(day)}
              className={`border-b border-r border-gray-50 p-1.5 cursor-pointer hover:bg-gray-50/80 transition-colors overflow-hidden ${!inMonth ? 'opacity-35' : ''}`}>
              <div className={`w-7 h-7 flex items-center justify-center rounded-full text-sm font-semibold mb-1 flex-shrink-0 ${
                isNow ? 'bg-primary text-white' : 'text-gray-700'
              }`}>
                {format(day, 'd')}
              </div>
              <div className="space-y-0.5">
                {dayTasks.slice(0, 3).map(t => {
                  const clr = eventColor(t)
                  return (
                    <div key={t.id}
                      onClick={e => { e.stopPropagation(); onEventClick(t) }}
                      className="text-[10px] px-1.5 py-0.5 rounded-md truncate cursor-pointer font-medium hover:opacity-80 transition-opacity"
                      style={{ backgroundColor: clr.bg, color: clr.text }}>
                      {t.titulo}
                    </div>
                  )
                })}
                {dayTasks.length > 3 && (
                  <div className="text-[10px] text-gray-400 px-1">+{dayTasks.length - 3} mais</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ─── Week View ───────────────────────────────── */
function WeekView({
  current, tarefas, onDayClick, onEventClick,
}: {
  current: Date; tarefas: TarefaRich[]
  onDayClick: (day: Date) => void; onEventClick: (t: TarefaRich) => void
}) {
  const weekStart = sowFn(current, { weekStartsOn: 0 })
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const tarefasForDay = (day: Date) =>
    tarefas.filter(t => t.vencimento && isSameDay(parseISO(t.vencimento), day))

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex-1 flex flex-col min-h-0">
      {/* Header row */}
      <div className="grid grid-cols-7 border-b border-gray-100 flex-shrink-0">
        {days.map((day, i) => {
          const isNow = isToday(day)
          return (
            <div key={i} className="py-3 text-center border-r border-gray-50 last:border-r-0">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">
                {format(day, 'EEE', { locale: ptBR })}
              </p>
              <div className={`w-8 h-8 flex items-center justify-center rounded-full text-sm font-bold mx-auto mt-1 ${
                isNow ? 'bg-primary text-white' : 'text-gray-700'
              }`}>
                {format(day, 'd')}
              </div>
            </div>
          )
        })}
      </div>
      {/* Events */}
      <div className="grid grid-cols-7 flex-1 overflow-y-auto">
        {days.map((day, i) => {
          const dayTasks = tarefasForDay(day)
          return (
            <div key={i}
              className="border-r border-gray-50 last:border-r-0 p-2 space-y-1.5 cursor-pointer hover:bg-gray-50/50 transition-colors min-h-[200px]"
              onClick={() => onDayClick(day)}>
              {dayTasks.map(t => {
                const clr = eventColor(t)
                return (
                  <div key={t.id}
                    onClick={e => { e.stopPropagation(); onEventClick(t) }}
                    className="p-1.5 rounded-lg cursor-pointer hover:opacity-80 transition-opacity"
                    style={{ backgroundColor: clr.bg }}>
                    {t.vencimento && (
                      <p className="text-[9px] font-bold mb-0.5" style={{ color: clr.text }}>
                        {format(parseISO(t.vencimento), 'HH:mm')}
                      </p>
                    )}
                    <p className="text-[11px] font-semibold leading-snug truncate" style={{ color: clr.text }}>
                      {t.titulo}
                    </p>
                    {t.contato && (
                      <p className="text-[9px] mt-0.5 truncate" style={{ color: clr.text, opacity: 0.7 }}>
                        {t.contato.nome || t.contato.telefone}
                      </p>
                    )}
                  </div>
                )
              })}
              {dayTasks.length === 0 && (
                <div className="h-full flex items-start justify-center pt-4">
                  <Plus size={14} className="text-gray-200" />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ─── Day View ────────────────────────────────── */
function DayView({
  current, tarefas, onEventClick, onAddClick,
}: {
  current: Date; tarefas: TarefaRich[]
  onEventClick: (t: TarefaRich) => void; onAddClick: () => void
}) {
  const dayTasks = tarefas.filter(t => t.vencimento && isSameDay(parseISO(t.vencimento), current))
  const noTime = tarefas.filter(t => !t.vencimento && isToday(current))

  // Group by hour
  const byHour: Record<number, TarefaRich[]> = {}
  dayTasks.forEach(t => {
    if (!t.vencimento) return
    const h = parseISO(t.vencimento).getHours()
    byHour[h] = [...(byHour[h] ?? []), t]
  })

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex-1 flex flex-col min-h-0">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
        <div>
          <p className="text-base font-bold text-gray-900 capitalize">
            {format(current, "EEEE, dd 'de' MMMM", { locale: ptBR })}
          </p>
          <p className="text-xs text-gray-400">{dayTasks.length} tarefa{dayTasks.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={onAddClick}
          className="flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary-dark">
          <Plus size={14} /> Adicionar
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {Array.from({ length: 24 }, (_, h) => {
          const tasks = byHour[h] ?? []
          return (
            <div key={h} className={`flex gap-3 py-2 border-b border-gray-50 ${tasks.length > 0 ? 'items-start' : 'items-center'}`}>
              <span className="text-xs text-gray-400 w-12 flex-shrink-0 text-right font-mono">
                {String(h).padStart(2, '0')}:00
              </span>
              <div className="flex-1 min-h-[24px] space-y-1.5">
                {tasks.map(t => {
                  const clr = eventColor(t)
                  return (
                    <div key={t.id} onClick={() => onEventClick(t)}
                      className="p-2.5 rounded-xl cursor-pointer hover:opacity-80 transition-opacity"
                      style={{ backgroundColor: clr.bg }}>
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold" style={{ color: clr.text }}>{t.titulo}</p>
                        <span className="text-[10px] font-mono" style={{ color: clr.text, opacity: 0.7 }}>
                          {format(parseISO(t.vencimento!), 'HH:mm')}
                        </span>
                      </div>
                      {t.contato && (
                        <p className="text-xs mt-0.5" style={{ color: clr.text, opacity: 0.7 }}>
                          👤 {t.contato.nome || t.contato.telefone}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
        {noTime.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Sem horário</p>
            {noTime.map(t => {
              const clr = eventColor(t)
              return (
                <div key={t.id} onClick={() => onEventClick(t)}
                  className="p-2.5 rounded-xl cursor-pointer hover:opacity-80 transition-opacity mb-1.5"
                  style={{ backgroundColor: clr.bg }}>
                  <p className="text-sm font-semibold" style={{ color: clr.text }}>{t.titulo}</p>
                </div>
              )
            })}
          </div>
        )}
        {dayTasks.length === 0 && noTime.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <div className="text-4xl mb-2">📅</div>
            <p className="text-sm">Nenhuma tarefa neste dia</p>
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── Main Page ───────────────────────────────── */
export default function CalendarioPage() {
  const [view, setView] = useState<ViewMode>('mes')
  const [current, setCurrent] = useState(new Date())
  const [tarefas, setTarefas] = useState<TarefaRich[]>([])
  const [contatos, setContatos] = useState<Contato[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editTask, setEditTask] = useState<TarefaRich | null>(null)
  const [detailTask, setDetailTask] = useState<TarefaRich | null>(null)
  const [prefilledDate, setPrefilledDate] = useState('')

  const load = useCallback(async () => {
    const start = startOfMonth(subMonths(current, 1)).toISOString()
    const end = endOfMonth(addMonths(current, 1)).toISOString()
    const { data } = await supabase
      .from('tarefas')
      .select('*, contato:crm_contatos(nome,telefone)')
      .not('vencimento', 'is', null)
      .gte('vencimento', start).lte('vencimento', end)
      .order('vencimento')
    const { data: all } = await supabase
      .from('tarefas').select('*, contato:crm_contatos(nome,telefone)')
      .is('vencimento', null)
    const combined = [...(data ?? []), ...(all ?? [])]
    setTarefas(combined as TarefaRich[])
  }, [current])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    supabase.from('crm_contatos').select('id,nome,telefone').range(0, 999)
      .then(({ data }) => { if (data) setContatos(data as Contato[]) })
  }, [])

  function navigate(dir: 1 | -1) {
    if (view === 'mes') setCurrent(dir === 1 ? addMonths(current, 1) : subMonths(current, 1))
    else if (view === 'semana') setCurrent(dir === 1 ? addWeeks(current, 1) : subWeeks(current, 1))
    else setCurrent(dir === 1 ? addDays(current, 1) : subDays(current, 1))
  }

  function getPeriodLabel(): string {
    if (view === 'mes') return format(current, 'MMMM yyyy', { locale: ptBR })
    if (view === 'semana') {
      const ws = sowFn(current, { weekStartsOn: 0 })
      const we = addDays(ws, 6)
      return `${format(ws, 'dd MMM', { locale: ptBR })} – ${format(we, 'dd MMM yyyy', { locale: ptBR })}`
    }
    return format(current, "dd 'de' MMMM yyyy", { locale: ptBR })
  }

  function handleDayClick(day: Date) {
    if (view === 'mes') {
      setPrefilledDate(format(day, "yyyy-MM-dd'T'09:00"))
      setShowModal(true)
    } else {
      setCurrent(day)
    }
  }

  function handleEventClick(t: TarefaRich) {
    setDetailTask(t)
  }

  async function toggleTask(t: TarefaRich) {
    const ns = t.status === 'concluida' ? 'pendente' : 'concluida'
    await supabase.from('tarefas').update({ status: ns }).eq('id', t.id)
    setTarefas(prev => prev.map(x => x.id === t.id ? { ...x, status: ns as Tarefa['status'] } : x))
    if (detailTask?.id === t.id)
      setDetailTask(prev => prev ? { ...prev, status: ns as Tarefa['status'] } : null)
  }

  async function deleteTask(id: string) {
    await supabase.from('tarefas').delete().eq('id', id)
    setTarefas(prev => prev.filter(t => t.id !== id))
    setDetailTask(null)
  }

  function onSaved(t: TarefaRich) {
    setTarefas(prev => {
      const idx = prev.findIndex(x => x.id === t.id)
      if (idx >= 0) { const n = [...prev]; n[idx] = t; return n }
      return [...prev, t]
    })
    setShowModal(false)
    setEditTask(null)
    setDetailTask(null)
  }

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ── */}
      <div className="px-5 py-3 border-b border-gray-200 bg-white flex items-center gap-3 flex-shrink-0">
        <span className="text-sm font-black text-gray-800 tracking-widest uppercase flex-shrink-0">Calendário</span>

        {/* Navigation */}
        <div className="flex items-center gap-1">
          <button onClick={() => navigate(-1)}
            className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-600 transition-colors">
            <ChevronLeft size={16} />
          </button>
          <button onClick={() => setCurrent(new Date())}
            className="px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            Hoje
          </button>
          <button onClick={() => navigate(1)}
            className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-600 transition-colors">
            <ChevronRight size={16} />
          </button>
        </div>

        <h2 className="text-sm font-semibold text-gray-800 capitalize min-w-[180px]">
          {getPeriodLabel()}
        </h2>

        {/* View toggle */}
        <div className="flex gap-1 p-1 bg-gray-100 rounded-xl ml-2">
          {(['mes', 'semana', 'dia'] as ViewMode[]).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors capitalize ${
                view === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {v === 'mes' ? 'Mês' : v === 'semana' ? 'Semana' : 'Dia'}
            </button>
          ))}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 ml-2">
          {[
            { label: 'Pendente', color: '#3B82F6' },
            { label: 'Hoje', color: '#F59E0B' },
            { label: 'Vencida', color: '#EF4444' },
            { label: 'Concluída', color: '#22C55E' },
          ].map(l => (
            <div key={l.label} className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: l.color }} />
              <span className="text-[10px] text-gray-400">{l.label}</span>
            </div>
          ))}
        </div>

        <button onClick={() => { setPrefilledDate(''); setShowModal(true) }}
          className="flex items-center gap-1.5 bg-primary text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-primary-dark transition-colors ml-auto flex-shrink-0">
          <Plus size={14} /> NOVA TAREFA
        </button>
      </div>

      {/* ── Calendar ── */}
      <div className="flex-1 min-h-0 p-5 flex flex-col">
        {view === 'mes' && (
          <MonthView
            current={current} tarefas={tarefas}
            onDayClick={handleDayClick} onEventClick={handleEventClick}
          />
        )}
        {view === 'semana' && (
          <WeekView
            current={current} tarefas={tarefas}
            onDayClick={handleDayClick} onEventClick={handleEventClick}
          />
        )}
        {view === 'dia' && (
          <DayView
            current={current} tarefas={tarefas}
            onEventClick={handleEventClick}
            onAddClick={() => { setPrefilledDate(format(current, "yyyy-MM-dd'T'09:00")); setShowModal(true) }}
          />
        )}
      </div>

      {/* Modals */}
      {(showModal || editTask) && (
        <TarefaModal
          task={editTask}
          initialDate={prefilledDate}
          contatos={contatos}
          onSave={onSaved}
          onClose={() => { setShowModal(false); setEditTask(null) }}
        />
      )}

      {detailTask && !editTask && (
        <TarefaDetailModal
          task={detailTask}
          onClose={() => setDetailTask(null)}
          onToggle={() => toggleTask(detailTask)}
          onEdit={() => { setEditTask(detailTask); setDetailTask(null) }}
          onDelete={() => deleteTask(detailTask.id)}
        />
      )}
    </div>
  )
}
