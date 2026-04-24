'use client'
import React, { useEffect, useState, useMemo } from 'react'
import {
  format, parseISO, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, addMonths, subMonths, isSameDay, isSameMonth, isToday, getDay,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { supabase } from '@/lib/supabase'
import { ChevronLeft, ChevronRight, Plus, X, CheckCircle2, Circle } from 'lucide-react'
import type { Tarefa, Contato } from '@/types'

type TarefaRich = Tarefa & { contato?: { nome: string | null; telefone: string } | null }

const STATUS_COLORS: Record<string, string> = {
  pendente: '#3B82F6',
  concluida: '#22C55E',
}

export default function CalendarioPage() {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [tarefas, setTarefas] = useState<TarefaRich[]>([])
  const [contatos, setContatos] = useState<Contato[]>([])
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [detailTask, setDetailTask] = useState<TarefaRich | null>(null)
  const [form, setForm] = useState({ titulo: '', contato_id: '', vencimento: '', descricao: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadData() }, [currentMonth])

  async function loadData() {
    const start = format(startOfMonth(currentMonth), 'yyyy-MM-dd')
    const end = format(endOfMonth(currentMonth), 'yyyy-MM-dd')
    const [{ data: t }, { data: c }] = await Promise.all([
      supabase.from('tarefas')
        .select('*, contato:crm_contatos(nome,telefone)')
        .gte('vencimento', start)
        .lte('vencimento', end)
        .order('vencimento'),
      supabase.from('crm_contatos').select('id,nome,telefone').order('nome').range(0, 999),
    ])
    if (t) setTarefas(t as TarefaRich[])
    if (c) setContatos(c as Contato[])
  }

  // Build calendar grid (6 weeks starting from Sunday before month start)
  const calendarDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 0 })
    const end = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 0 })
    const days: Date[] = []
    let d = start
    while (d <= end) { days.push(d); d = addDays(d, 1) }
    return days
  }, [currentMonth])

  function getTasksForDay(day: Date): TarefaRich[] {
    return tarefas.filter(t => t.vencimento && isSameDay(parseISO(t.vencimento), day))
  }

  async function toggleStatus(tarefa: TarefaRich) {
    const novoStatus = tarefa.status === 'concluida' ? 'pendente' : 'concluida'
    await supabase.from('tarefas').update({ status: novoStatus }).eq('id', tarefa.id)
    await loadData()
    if (detailTask?.id === tarefa.id) setDetailTask({ ...tarefa, status: novoStatus })
  }

  async function criarTarefa(e: React.FormEvent) {
    e.preventDefault()
    if (!form.titulo.trim()) return
    setSaving(true)
    await supabase.from('tarefas').insert({
      titulo: form.titulo.trim(),
      descricao: form.descricao || null,
      contato_id: form.contato_id || null,
      vencimento: form.vencimento || null,
      status: 'pendente',
    })
    setSaving(false)
    setModalOpen(false)
    setForm({ titulo: '', contato_id: '', vencimento: '', descricao: '' })
    await loadData()
  }

  function openNewTask(day?: Date) {
    const date = day ?? selectedDay ?? new Date()
    setForm({ titulo: '', contato_id: '', vencimento: format(date, 'yyyy-MM-dd'), descricao: '' })
    setModalOpen(true)
  }

  const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 bg-white border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-gray-900">Calendário</h1>
          <div className="flex items-center gap-2">
            <button onClick={() => setCurrentMonth(m => subMonths(m, 1))}
              className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors">
              <ChevronLeft size={18} />
            </button>
            <span className="text-base font-semibold text-gray-800 min-w-[160px] text-center capitalize">
              {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
            </span>
            <button onClick={() => setCurrentMonth(m => addMonths(m, 1))}
              className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors">
              <ChevronRight size={18} />
            </button>
            <button onClick={() => setCurrentMonth(new Date())}
              className="ml-2 text-xs font-medium text-primary border border-primary/30 rounded-lg px-3 py-1.5 hover:bg-primary/5 transition-colors">
              Hoje
            </button>
          </div>
        </div>
        <button onClick={() => openNewTask()}
          className="flex items-center gap-2 bg-primary text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-primary-dark transition-colors">
          <Plus size={16} />Nova Tarefa
        </button>
      </div>

      {/* Calendar grid */}
      <div className="flex-1 overflow-auto p-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-gray-100">
            {weekDays.map(d => (
              <div key={d} className="py-2 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
                {d}
              </div>
            ))}
          </div>

          {/* Days */}
          <div className="grid grid-cols-7">
            {calendarDays.map((day, i) => {
              const dayTasks = getTasksForDay(day)
              const inMonth = isSameMonth(day, currentMonth)
              const today = isToday(day)
              const selected = selectedDay && isSameDay(day, selectedDay)
              const isLastRow = i >= calendarDays.length - 7

              return (
                <div
                  key={day.toISOString()}
                  onClick={() => setSelectedDay(day)}
                  className={`min-h-[100px] p-2 border-r border-b border-gray-50 cursor-pointer transition-colors
                    ${!inMonth ? 'bg-gray-50/50' : 'bg-white hover:bg-blue-50/30'}
                    ${selected ? 'ring-2 ring-inset ring-primary/30' : ''}
                    ${isLastRow ? 'border-b-0' : ''}`}
                >
                  {/* Day number */}
                  <div className="flex items-center justify-between mb-1">
                    <span className={`w-7 h-7 flex items-center justify-center rounded-full text-sm font-medium
                      ${today ? 'bg-primary text-white' : inMonth ? 'text-gray-800' : 'text-gray-300'}`}>
                      {format(day, 'd')}
                    </span>
                    {inMonth && (
                      <button
                        onClick={e => { e.stopPropagation(); openNewTask(day) }}
                        className="opacity-0 group-hover:opacity-100 hover:opacity-100 w-5 h-5 rounded flex items-center justify-center text-gray-400 hover:text-primary hover:bg-primary/10 transition-all"
                      >
                        <Plus size={12} />
                      </button>
                    )}
                  </div>

                  {/* Tasks for this day */}
                  <div className="space-y-0.5">
                    {dayTasks.slice(0, 3).map(t => (
                      <div
                        key={t.id}
                        onClick={e => { e.stopPropagation(); setDetailTask(t) }}
                        className={`text-[10px] font-medium px-1.5 py-0.5 rounded truncate cursor-pointer hover:opacity-80 transition-opacity
                          ${t.status === 'concluida' ? 'bg-green-100 text-green-700 line-through' : 'bg-blue-100 text-blue-700'}`}
                      >
                        {t.titulo}
                      </div>
                    ))}
                    {dayTasks.length > 3 && (
                      <div className="text-[10px] text-gray-400 pl-1">+{dayTasks.length - 3} mais</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Selected day tasks list */}
        {selectedDay && (
          <div className="mt-4 bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-800">
                {format(selectedDay, "dd 'de' MMMM", { locale: ptBR })}
                {' '}— {getTasksForDay(selectedDay).length} tarefa(s)
              </h3>
              <button onClick={() => openNewTask(selectedDay)}
                className="text-xs text-primary hover:underline flex items-center gap-1">
                <Plus size={12} />Nova
              </button>
            </div>
            {getTasksForDay(selectedDay).length === 0 ? (
              <p className="text-sm text-gray-400">Nenhuma tarefa neste dia.</p>
            ) : (
              <div className="space-y-2">
                {getTasksForDay(selectedDay).map(t => (
                  <div key={t.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors">
                    <button onClick={() => toggleStatus(t)} className="flex-shrink-0">
                      {t.status === 'concluida'
                        ? <CheckCircle2 size={18} className="text-green-500" />
                        : <Circle size={18} className="text-gray-300" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${t.status === 'concluida' ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                        {t.titulo}
                      </p>
                      {t.contato && (
                        <p className="text-xs text-gray-400">{t.contato.nome ?? t.contato.telefone}</p>
                      )}
                    </div>
                    <span className="text-xs text-gray-400">
                      {t.vencimento ? format(parseISO(t.vencimento), 'HH:mm') : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal: task detail */}
      {detailTask && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setDetailTask(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <h3 className="text-base font-bold text-gray-900 flex-1 pr-4">{detailTask.titulo}</h3>
              <button onClick={() => setDetailTask(null)} className="text-gray-400 hover:text-gray-600 flex-shrink-0">
                <X size={18} />
              </button>
            </div>
            {detailTask.descricao && (
              <p className="text-sm text-gray-600 mb-4">{detailTask.descricao}</p>
            )}
            <div className="space-y-2 text-sm text-gray-500 mb-5">
              {detailTask.vencimento && (
                <p>📅 {format(parseISO(detailTask.vencimento), "dd 'de' MMMM yyyy", { locale: ptBR })}</p>
              )}
              {detailTask.contato && (
                <p>👤 {detailTask.contato.nome ?? detailTask.contato.telefone}</p>
              )}
            </div>
            <button
              onClick={() => toggleStatus(detailTask)}
              className={`w-full py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                detailTask.status === 'concluida'
                  ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  : 'bg-success text-white hover:opacity-90'
              }`}
            >
              {detailTask.status === 'concluida' ? 'Reabrir tarefa' : '✓ Marcar como concluída'}
            </button>
          </div>
        </div>
      )}

      {/* Modal: new task */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setModalOpen(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-bold text-gray-900">Nova Tarefa</h2>
                <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
              </div>
              <form onSubmit={criarTarefa} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Título *</label>
                  <input
                    value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))}
                    placeholder="Ex: Fazer follow-up" required autoFocus
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
                  <textarea
                    value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
                    rows={2} placeholder="Detalhes opcionais..."
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Contato vinculado</label>
                  <select
                    value={form.contato_id} onChange={e => setForm(f => ({ ...f, contato_id: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 bg-white"
                  >
                    <option value="">Nenhum</option>
                    {contatos.map(c => <option key={c.id} value={c.id}>{c.nome ?? c.telefone}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Vencimento</label>
                  <input
                    type="date" value={form.vencimento} onChange={e => setForm(f => ({ ...f, vencimento: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <button type="submit" disabled={saving || !form.titulo.trim()}
                    className="flex-1 bg-primary text-white rounded-lg py-2.5 text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-60">
                    {saving ? 'Criando…' : 'Criar Tarefa'}
                  </button>
                  <button type="button" onClick={() => setModalOpen(false)}
                    className="flex-1 bg-gray-100 text-gray-600 rounded-lg py-2.5 text-sm font-medium hover:bg-gray-200 transition-colors">
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
