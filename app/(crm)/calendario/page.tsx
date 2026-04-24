'use client'
import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Plus, X, Check } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isSameDay, parseISO, addMonths, subMonths } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { Tarefa, Contato } from '@/types'

type TarefaRich = Tarefa & { contato?: { nome: string | null; telefone: string } | null }

export default function CalendarioPage() {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [tarefas, setTarefas] = useState<TarefaRich[]>([])
  const [contatos, setContatos] = useState<Contato[]>([])
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [showDetail, setShowDetail] = useState<TarefaRich | null>(null)
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [contatoId, setContatoId] = useState('')
  const [vencimento, setVencimento] = useState('')
  const [criando, setCriando] = useState(false)

  async function loadTarefas(month: Date) {
    const start = startOfMonth(month).toISOString()
    const end = endOfMonth(month).toISOString()
    const { data } = await supabase
      .from('tarefas')
      .select('*, contato:crm_contatos(nome,telefone)')
      .or(`vencimento.gte.${start},vencimento.lte.${end}`)
      .order('vencimento')
    if (data) setTarefas(data as TarefaRich[])
  }

  async function loadContatos() {
    const { data } = await supabase.from('crm_contatos').select('id, nome, telefone').range(0, 999)
    if (data) setContatos(data as Contato[])
  }

  useEffect(() => { loadTarefas(currentMonth); loadContatos() }, [currentMonth])

  function getDays() {
    const start = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 0 })
    const end = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 0 })
    const days: Date[] = []
    let d = start
    while (d <= end) { days.push(d); d = addDays(d, 1) }
    return days
  }

  function tarefasForDay(day: Date) {
    return tarefas.filter(t => t.vencimento && isSameDay(parseISO(t.vencimento), day))
  }

  const selectedDayTasks = selectedDay ? tarefasForDay(selectedDay) : []

  async function criarTarefa() {
    if (!titulo.trim()) return
    setCriando(true)
    const { data } = await supabase.from('tarefas').insert({
      titulo: titulo.trim(), descricao: descricao || null,
      contato_id: contatoId || null, status: 'pendente',
      vencimento: vencimento || null
    }).select('*, contato:crm_contatos(nome,telefone)').single()
    if (data) {
      setTarefas(prev => [...prev, data as TarefaRich])
      setShowModal(false); setTitulo(''); setDescricao(''); setContatoId(''); setVencimento('')
    }
    setCriando(false)
  }

  async function toggleTarefa(t: TarefaRich) {
    const ns = t.status === 'pendente' ? 'concluida' : 'pendente'
    await supabase.from('tarefas').update({ status: ns }).eq('id', t.id)
    setTarefas(prev => prev.map(x => x.id === t.id ? { ...x, status: ns } : x))
    if (showDetail?.id === t.id) setShowDetail(prev => prev ? { ...prev, status: ns } : null)
  }

  const days = getDays()
  const weekDays = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 bg-white flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold text-gray-900">Calendário</h1>
          <div className="flex items-center gap-2">
            <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-600">
              <ChevronLeft size={16}/>
            </button>
            <span className="text-sm font-medium text-gray-700 capitalize min-w-[140px] text-center">
              {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
            </span>
            <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-600">
              <ChevronRight size={16}/>
            </button>
          </div>
          <button onClick={() => setCurrentMonth(new Date())} className="text-sm text-primary hover:underline">Hoje</button>
        </div>
        <button onClick={() => { setShowModal(true); if (selectedDay) setVencimento(format(selectedDay, "yyyy-MM-dd'T'HH:mm")) }}
          className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-primary-dark">
          <Plus size={16}/> Nova Tarefa
        </button>
      </div>

      <div className="flex-1 p-6 space-y-4">
        {/* Calendar grid */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {/* Week headers */}
          <div className="grid grid-cols-7 border-b border-gray-100">
            {weekDays.map(w => (
              <div key={w} className="py-2 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">{w}</div>
            ))}
          </div>
          {/* Days grid */}
          <div className="grid grid-cols-7">
            {days.map((day, i) => {
              const isCurrentMonth = isSameMonth(day, currentMonth)
              const isSelected = selectedDay && isSameDay(day, selectedDay)
              const isToday = isSameDay(day, new Date())
              const dayTasks = tarefasForDay(day)
              return (
                <div key={i}
                  onClick={() => setSelectedDay(isSameDay(day, selectedDay ?? new Date('1900')) ? null : day)}
                  className={`min-h-[90px] border-b border-r border-gray-50 p-2 cursor-pointer hover:bg-gray-50 transition-colors ${!isCurrentMonth ? 'opacity-40' : ''} ${isSelected ? 'bg-primary/5 ring-1 ring-inset ring-primary/20' : ''}`}>
                  <div className={`w-7 h-7 flex items-center justify-center rounded-full text-sm font-medium mb-1 ${isToday ? 'bg-primary text-white' : 'text-gray-700'} ${isSelected && !isToday ? 'bg-primary/10 text-primary' : ''}`}>
                    {format(day, 'd')}
                  </div>
                  <div className="space-y-0.5">
                    {dayTasks.slice(0,3).map(t => (
                      <div key={t.id} onClick={e => { e.stopPropagation(); setShowDetail(t) }}
                        className={`text-[10px] px-1.5 py-0.5 rounded truncate cursor-pointer ${t.status === 'concluida' ? 'bg-green-100 text-green-700 line-through' : 'bg-primary/10 text-primary'}`}>
                        {t.titulo}
                      </div>
                    ))}
                    {dayTasks.length > 3 && <div className="text-[10px] text-gray-400">+{dayTasks.length-3} mais</div>}
                    <button onClick={e => { e.stopPropagation(); setSelectedDay(day); setVencimento(format(day, "yyyy-MM-dd'T'09:00")); setShowModal(true) }}
                      className="opacity-0 hover:opacity-100 group-hover:opacity-100 w-full text-center text-[10px] text-gray-400 hover:text-primary transition-opacity py-0.5">
                      <Plus size={10} className="inline"/>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Selected day tasks */}
        {selectedDay && selectedDayTasks.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <h3 className="font-semibold text-gray-900 mb-3 capitalize">{format(selectedDay, "dd 'de' MMMM", { locale: ptBR })}</h3>
            <div className="space-y-2">
              {selectedDayTasks.map(t => (
                <div key={t.id} onClick={() => setShowDetail(t)}
                  className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors">
                  <button onClick={e => { e.stopPropagation(); toggleTarefa(t) }}
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${t.status === 'concluida' ? 'bg-green-500 border-green-500' : 'border-gray-300'}`}>
                    {t.status === 'concluida' && <Check size={10} className="text-white"/>}
                  </button>
                  <div className="flex-1">
                    <p className={`text-sm font-medium ${t.status === 'concluida' ? 'line-through text-gray-400' : 'text-gray-900'}`}>{t.titulo}</p>
                    {t.contato && <p className="text-xs text-gray-400">{t.contato.nome || t.contato.telefone}</p>}
                  </div>
                  {t.vencimento && <p className="text-xs text-gray-400">{format(parseISO(t.vencimento), 'HH:mm')}</p>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Task detail modal */}
      {showDetail && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">{showDetail.titulo}</h3>
              <button onClick={() => setShowDetail(null)} className="text-gray-400 hover:text-gray-600"><X size={18}/></button>
            </div>
            {showDetail.descricao && <p className="text-sm text-gray-600 mb-3">{showDetail.descricao}</p>}
            {showDetail.contato && <p className="text-sm text-gray-500 mb-3">👤 {showDetail.contato.nome || showDetail.contato.telefone}</p>}
            {showDetail.vencimento && <p className="text-sm text-gray-500 mb-4">📅 {format(parseISO(showDetail.vencimento), "dd/MM/yyyy 'às' HH:mm")}</p>}
            <button onClick={() => { toggleTarefa(showDetail); setShowDetail(null) }}
              className={`w-full py-2.5 rounded-xl text-sm font-medium transition-colors ${showDetail.status === 'concluida' ? 'bg-gray-100 text-gray-700 hover:bg-gray-200' : 'bg-green-500 text-white hover:bg-green-600'}`}>
              {showDetail.status === 'concluida' ? 'Reabrir tarefa' : 'Marcar como concluída'}
            </button>
          </div>
        </div>
      )}

      {/* Create task modal */}
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
              <button onClick={criarTarefa} disabled={criando || !titulo.trim()}
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
