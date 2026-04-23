'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { formatDateTime } from '@/lib/utils'
import { Plus, CheckCircle2, Circle, AlertCircle, Clock, Calendar, X } from 'lucide-react'
import { format, parseISO, isToday, isBefore, isFuture, startOfTomorrow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { Tarefa, Contato } from '@/types'

export default function TarefasPage() {
  const [tarefas, setTarefas] = useState<Tarefa[]>([])
  const [contatos, setContatos] = useState<Contato[]>([])
  const [modalAberto, setModalAberto] = useState(false)
  const [form, setForm] = useState({ titulo: '', descricao: '', contato_id: '', vencimento: '' })
  const [salvando, setSalvando] = useState(false)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const [{ data: t }, { data: c }] = await Promise.all([
      supabase.from('tarefas').select('*, contato:crm_contatos(id,nome,telefone,foto_url)').order('vencimento', { ascending: true, nullsFirst: false }),
      supabase.from('crm_contatos').select('id,nome,telefone').order('nome'),
    ])
    if (t) setTarefas(t as Tarefa[])
    if (c) setContatos(c as Contato[])
  }

  async function criarTarefa(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true)
    await supabase.from('tarefas').insert({
      titulo: form.titulo,
      descricao: form.descricao || null,
      contato_id: form.contato_id || null,
      vencimento: form.vencimento || null,
      status: 'pendente',
    })
    setSalvando(false)
    setModalAberto(false)
    setForm({ titulo: '', descricao: '', contato_id: '', vencimento: '' })
    await loadData()
  }

  async function toggleStatus(tarefa: Tarefa) {
    const novoStatus = tarefa.status === 'concluida' ? 'pendente' : 'concluida'
    await supabase.from('tarefas').update({ status: novoStatus }).eq('id', tarefa.id)
    await loadData()
  }

  function categorizar(t: Tarefa[]): { vencidas: Tarefa[]; hoje: Tarefa[]; proximas: Tarefa[] } {
    const pendentes = t.filter(t => t.status === 'pendente')
    const agora = new Date()
    return {
      vencidas: pendentes.filter(t => t.vencimento && isBefore(parseISO(t.vencimento), agora) && !isToday(parseISO(t.vencimento))),
      hoje: pendentes.filter(t => t.vencimento && isToday(parseISO(t.vencimento))),
      proximas: pendentes.filter(t => !t.vencimento || (isFuture(parseISO(t.vencimento)) && !isToday(parseISO(t.vencimento)))),
    }
  }

  const { vencidas, hoje, proximas } = categorizar(tarefas)
  const concluidas = tarefas.filter(t => t.status === 'concluida')

  function TarefaCard({ tarefa }: { tarefa: Tarefa }) {
    const vencida = tarefa.vencimento && isBefore(parseISO(tarefa.vencimento), new Date()) && tarefa.status === 'pendente'
    return (
      <div className={`bg-white rounded-lg p-4 shadow-sm border flex items-start gap-3 ${vencida ? 'border-red-200' : 'border-gray-100'}`}>
        <button onClick={() => toggleStatus(tarefa)} className="mt-0.5 flex-shrink-0">
          {tarefa.status === 'concluida'
            ? <CheckCircle2 size={20} className="text-green-500" />
            : <Circle size={20} className={vencida ? 'text-red-400' : 'text-gray-300'} />}
        </button>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium ${tarefa.status === 'concluida' ? 'line-through text-gray-400' : 'text-gray-900'}`}>
            {tarefa.titulo}
          </p>
          {tarefa.descricao && <p className="text-xs text-gray-500 mt-0.5">{tarefa.descricao}</p>}
          <div className="flex items-center gap-3 mt-2">
            {tarefa.vencimento && (
              <span className={`flex items-center gap-1 text-xs ${vencida ? 'text-red-500' : 'text-gray-400'}`}>
                <Calendar size={12} />{format(parseISO(tarefa.vencimento), 'dd/MM HH:mm')}
              </span>
            )}
            {tarefa.contato && (
              <span className="text-xs text-gray-400">{(tarefa.contato as any).nome ?? (tarefa.contato as any).telefone}</span>
            )}
          </div>
        </div>
      </div>
    )
  }

  function Section({ title, tasks, icon: Icon, color }: { title: string; tasks: Tarefa[]; icon: any; color: string }) {
    if (tasks.length === 0 && title !== 'Próximas') return null
    return (
      <div className="mb-6">
        <div className={`flex items-center gap-2 mb-3`}>
          <Icon size={16} className={color} />
          <h2 className="text-sm font-semibold text-gray-700">{title}</h2>
          <span className="bg-gray-100 text-gray-500 text-xs px-2 py-0.5 rounded-full">{tasks.length}</span>
        </div>
        <div className="space-y-2">
          {tasks.length === 0
            ? <p className="text-sm text-gray-400 py-2">Nenhuma tarefa</p>
            : tasks.map(t => <TarefaCard key={t.id} tarefa={t} />)}
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Tarefas</h1>
          <p className="text-sm text-gray-500 mt-0.5">{tarefas.filter(t => t.status === 'pendente').length} pendentes</p>
        </div>
        <button onClick={() => setModalAberto(true)} className="flex items-center gap-2 bg-accent text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 transition-colors">
          <Plus size={16} />Nova Tarefa
        </button>
      </div>

      <div className="max-w-2xl">
        <Section title="Vencidas" tasks={vencidas} icon={AlertCircle} color="text-red-500" />
        <Section title="Hoje" tasks={hoje} icon={Clock} color="text-amber-500" />
        <Section title="Próximas" tasks={proximas} icon={Calendar} color="text-blue-500" />
        {concluidas.length > 0 && (
          <div className="mt-6 pt-6 border-t border-gray-100">
            <details>
              <summary className="text-sm font-semibold text-gray-400 cursor-pointer mb-3">Concluídas ({concluidas.length})</summary>
              <div className="space-y-2 mt-3">
                {concluidas.map(t => <TarefaCard key={t.id} tarefa={t} />)}
              </div>
            </details>
          </div>
        )}
      </div>

      {/* Modal nova tarefa */}
      {modalAberto && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="p-6">
              <div className="flex justify-between items-center mb-5">
                <h2 className="text-lg font-bold">Nova Tarefa</h2>
                <button onClick={() => setModalAberto(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
              </div>
              <form onSubmit={criarTarefa} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Título *</label>
                  <input value={form.titulo} onChange={e => setForm(f => ({...f, titulo: e.target.value}))} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent" placeholder="Ex: Fazer follow-up" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
                  <textarea value={form.descricao} onChange={e => setForm(f => ({...f, descricao: e.target.value}))} rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent resize-none" placeholder="Detalhes opcionais..." />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Contato vinculado</label>
                  <select value={form.contato_id} onChange={e => setForm(f => ({...f, contato_id: e.target.value}))} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/20">
                    <option value="">Nenhum</option>
                    {contatos.map(c => <option key={c.id} value={c.id}>{c.nome ?? c.telefone}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Vencimento</label>
                  <input type="datetime-local" value={form.vencimento} onChange={e => setForm(f => ({...f, vencimento: e.target.value}))} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent" />
                </div>
                <div className="flex gap-2 pt-2">
                  <button type="submit" disabled={salvando} className="flex-1 bg-accent text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-60">
                    {salvando ? 'Criando...' : 'Criar Tarefa'}
                  </button>
                  <button type="button" onClick={() => setModalAberto(false)} className="flex-1 bg-gray-100 text-gray-600 rounded-lg py-2.5 text-sm font-medium hover:bg-gray-200 transition-colors">
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
