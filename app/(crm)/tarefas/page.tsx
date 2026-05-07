'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Plus, X, ChevronDown, ChevronRight, Search, Pencil, Trash2, Check } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { format, parseISO, isPast, isToday, isTomorrow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { Tarefa, Contato } from '@/types'

type TarefaRich = Tarefa & { contato?: { nome: string | null; telefone: string } | null }
type FilterTab = 'todas' | 'pendentes' | 'vencidas' | 'concluidas'

function formatVenc(v: string | null): string {
  if (!v) return 'Sem prazo'
  try {
    const d = parseISO(v)
    if (isToday(d)) return 'Hoje · ' + format(d, 'HH:mm')
    if (isTomorrow(d)) return 'Amanhã · ' + format(d, 'HH:mm')
    return format(d, "dd 'de' MMM · HH:mm", { locale: ptBR })
  } catch { return '' }
}

function vencClass(v: string | null, status: string): string {
  if (status === 'concluida') return 'text-gray-400'
  if (!v) return 'text-gray-400'
  try {
    const d = parseISO(v)
    if (isPast(d) && !isToday(d)) return 'text-red-500 font-semibold'
    if (isToday(d)) return 'text-orange-500 font-semibold'
    return 'text-gray-500'
  } catch { return 'text-gray-400' }
}

/* ─── Task Modal ─────────────────────────────── */
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
  const [contatoSearch, setContatoSearch] = useState('')

  const filteredContatos = contatos.filter(c =>
    (c.nome || c.telefone).toLowerCase().includes(contatoSearch.toLowerCase())
  )

  async function handleSave() {
    if (!titulo.trim()) return
    setSaving(true)
    const payload = {
      titulo: titulo.trim(),
      descricao: descricao.trim() || null,
      contato_id: contatoId || null,
      vencimento: vencimento || null,
      status,
    }
    if (task?.id) {
      const { data } = await supabase.from('tarefas')
        .update(payload)
        .eq('id', task.id)
        .select('*, contato:crm_contatos(nome,telefone)')
        .single()
      if (data) onSave(data as TarefaRich)
    } else {
      const { data } = await supabase.from('tarefas')
        .insert(payload)
        .select('*, contato:crm_contatos(nome,telefone)')
        .single()
      if (data) onSave(data as TarefaRich)
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-base font-bold text-gray-900">
            {task ? 'Editar Tarefa' : 'Nova Tarefa'}
          </h3>
          <button onClick={onClose}
            className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600">
            <X size={16} />
          </button>
        </div>
        <div className="px-6 py-4 space-y-3">
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide block mb-1">
              Título *
            </label>
            <input value={titulo} onChange={e => setTitulo(e.target.value)} autoFocus
              placeholder="Título da tarefa"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide block mb-1">
              Descrição
            </label>
            <textarea value={descricao} onChange={e => setDescricao(e.target.value)}
              placeholder="Detalhes (opcional)" rows={2}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary resize-none" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide block mb-1">
              Contato
            </label>
            <input value={contatoSearch} onChange={e => setContatoSearch(e.target.value)}
              placeholder="Buscar contato..."
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary mb-1" />
            <select value={contatoId} onChange={e => setContatoId(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary bg-white">
              <option value="">— Sem contato</option>
              {filteredContatos.map(c => (
                <option key={c.id} value={c.id}>{c.nome || c.telefone}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide block mb-1">
                Vencimento
              </label>
              <input type="datetime-local" value={vencimento} onChange={e => setVencimento(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide block mb-1">
                Status
              </label>
              <select value={status} onChange={e => setStatus(e.target.value as Tarefa['status'])}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary bg-white">
                <option value="pendente">Pendente</option>
                <option value="em_andamento">Em andamento</option>
                <option value="concluida">Concluída</option>
              </select>
            </div>
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

/* ─── Task Card ──────────────────────────────── */
function TarefaCard({
  t, overdue, onToggle, onEdit, onDelete,
}: {
  t: TarefaRich; overdue?: boolean
  onToggle: () => void; onEdit: () => void; onDelete: () => void
}) {
  const [confirmDel, setConfirmDel] = useState(false)
  return (
    <div className={`flex items-start gap-3 p-4 bg-white rounded-xl border shadow-sm hover:shadow-md transition-shadow ${
      overdue ? 'border-red-200 border-l-4 border-l-red-400' : 'border-gray-100 border-l-4 border-l-transparent'
    }`}>
      <button onClick={onToggle}
        className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
          t.status === 'concluida' ? 'bg-green-500 border-green-500' : 'border-gray-300 hover:border-green-400'
        }`}>
        {t.status === 'concluida' && <Check size={9} className="text-white" />}
      </button>

      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold leading-snug ${
          t.status === 'concluida' ? 'line-through text-gray-400'
            : overdue ? 'text-red-700' : 'text-gray-900'
        }`}>{t.titulo}</p>
        {t.descricao && <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{t.descricao}</p>}
        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
          {t.contato && (
            <a href={`/contatos?id=${t.contato_id}`}
              className="text-xs text-blue-500 hover:underline flex items-center gap-1">
              👤 {t.contato.nome || t.contato.telefone}
            </a>
          )}
          {t.vencimento && (
            <span className={`text-xs flex items-center gap-1 ${vencClass(t.vencimento, t.status)}`}>
              📅 {formatVenc(t.vencimento)}
            </span>
          )}
          {overdue && t.status !== 'concluida' && (
            <span className="text-[9px] font-black text-red-500 bg-red-100 px-1.5 py-0.5 rounded-full uppercase">
              Vencida
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 flex-shrink-0">
        <button onClick={onEdit}
          className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors">
          <Pencil size={12} />
        </button>
        {confirmDel ? (
          <div className="flex items-center gap-1">
            <button onClick={() => { onDelete(); setConfirmDel(false) }}
              className="px-2 py-1 text-[10px] font-bold bg-red-500 text-white rounded-lg">
              OK
            </button>
            <button onClick={() => setConfirmDel(false)}
              className="px-2 py-1 text-[10px] font-bold bg-gray-100 text-gray-600 rounded-lg">
              Não
            </button>
          </div>
        ) : (
          <button onClick={() => setConfirmDel(true)}
            className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-500 transition-colors">
            <Trash2 size={12} />
          </button>
        )}
      </div>
    </div>
  )
}

/* ─── Section Header ─────────────────────────── */
function SectionHeader({
  label, count, color, bg, border, collapsed, onToggle,
}: {
  label: string; count: number; color: string; bg: string; border: string
  collapsed: boolean; onToggle: () => void
}) {
  return (
    <button onClick={onToggle}
      className={`flex items-center gap-2.5 w-full text-left px-4 py-2.5 rounded-xl border ${bg} ${border} mb-2 transition-colors`}>
      {collapsed
        ? <ChevronRight size={14} className={color} />
        : <ChevronDown size={14} className={color} />}
      <span className={`text-sm font-bold ${color}`}>{label}</span>
      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ml-auto ${bg} ${color}`}>
        {count}
      </span>
    </button>
  )
}

/* ─── Main Page ──────────────────────────────── */
export default function TarefasPage() {
  const [tarefas, setTarefas] = useState<TarefaRich[]>([])
  const [contatos, setContatos] = useState<Contato[]>([])
  const [filterTab, setFilterTab] = useState<FilterTab>('todas')
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editTask, setEditTask] = useState<TarefaRich | null>(null)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ concluidas: true })

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('tarefas')
      .select('*, contato:crm_contatos(nome,telefone)')
      .order('vencimento', { ascending: true, nullsFirst: false })
    if (data) setTarefas(data as TarefaRich[])
  }, [])

  useEffect(() => {
    load()
    supabase.from('crm_contatos').select('id,nome,telefone').range(0, 999)
      .then(({ data }) => { if (data) setContatos(data as Contato[]) })
  }, [load])

  async function toggleStatus(t: TarefaRich) {
    const ns = t.status === 'concluida' ? 'pendente' : 'concluida'
    await supabase.from('tarefas').update({ status: ns }).eq('id', t.id)
    setTarefas(prev => prev.map(x => x.id === t.id ? { ...x, status: ns as Tarefa['status'] } : x))
  }

  async function deleteTask(id: string) {
    await supabase.from('tarefas').delete().eq('id', id)
    setTarefas(prev => prev.filter(t => t.id !== id))
  }

  function onSaved(t: TarefaRich) {
    setTarefas(prev => {
      const idx = prev.findIndex(x => x.id === t.id)
      if (idx >= 0) { const n = [...prev]; n[idx] = t; return n }
      return [t, ...prev]
    })
    setShowModal(false)
    setEditTask(null)
  }

  function toggleCollapse(key: string) {
    setCollapsed(prev => ({ ...prev, [key]: !prev[key] }))
  }

  // Filter by tab + search
  const q = search.toLowerCase()
  const base = tarefas.filter(t =>
    !q || t.titulo.toLowerCase().includes(q) || t.contato?.nome?.toLowerCase().includes(q) || false
  )

  const isOverdue = (t: TarefaRich) =>
    !!t.vencimento && isPast(parseISO(t.vencimento)) && !isToday(parseISO(t.vencimento)) && t.status !== 'concluida'

  let displayed = base
  if (filterTab === 'pendentes') displayed = base.filter(t => t.status === 'pendente')
  if (filterTab === 'vencidas') displayed = base.filter(t => isOverdue(t))
  if (filterTab === 'concluidas') displayed = base.filter(t => t.status === 'concluida')

  // Sections
  const vencidas = displayed.filter(t => isOverdue(t))
  const hoje = displayed.filter(t => t.status !== 'concluida' && !!t.vencimento && isToday(parseISO(t.vencimento)))
  const proximas = displayed.filter(t => {
    if (t.status === 'concluida') return false
    if (isOverdue(t) || hoje.includes(t)) return false
    return true
  })
  const concluidas = displayed.filter(t => t.status === 'concluida')

  const FILTER_TABS: { id: FilterTab; label: string }[] = [
    { id: 'todas', label: 'Todas' },
    { id: 'pendentes', label: 'Pendentes' },
    { id: 'vencidas', label: 'Vencidas' },
    { id: 'concluidas', label: 'Concluídas' },
  ]

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ── */}
      <div className="px-5 py-3 border-b border-gray-200 bg-white flex items-center gap-3 flex-shrink-0">
        <span className="text-sm font-black text-gray-800 tracking-widest uppercase flex-shrink-0">Tarefas</span>

        {/* Filter Tabs */}
        <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
          {FILTER_TABS.map(tab => (
            <button key={tab.id} onClick={() => setFilterTab(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                filterTab === tab.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por título..."
            className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:border-primary" />
        </div>

        <span className="text-xs text-gray-400 ml-auto">{tarefas.length} tarefas</span>

        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 bg-primary text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-primary-dark transition-colors flex-shrink-0">
          <Plus size={14} /> NOVA TAREFA
        </button>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {/* Vencidas */}
        {vencidas.length > 0 && (
          <div>
            <SectionHeader
              label="⚠️ Vencidas" count={vencidas.length}
              color="text-red-600" bg="bg-red-50" border="border-red-100"
              collapsed={!!collapsed['vencidas']} onToggle={() => toggleCollapse('vencidas')}
            />
            {!collapsed['vencidas'] && (
              <div className="space-y-2 ml-1">
                {vencidas.map(t => (
                  <TarefaCard key={t.id} t={t} overdue
                    onToggle={() => toggleStatus(t)}
                    onEdit={() => setEditTask(t)}
                    onDelete={() => deleteTask(t.id)} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Hoje */}
        {hoje.length > 0 && (
          <div>
            <SectionHeader
              label="🔵 Hoje" count={hoje.length}
              color="text-blue-600" bg="bg-blue-50" border="border-blue-100"
              collapsed={!!collapsed['hoje']} onToggle={() => toggleCollapse('hoje')}
            />
            {!collapsed['hoje'] && (
              <div className="space-y-2 ml-1">
                {hoje.map(t => (
                  <TarefaCard key={t.id} t={t}
                    onToggle={() => toggleStatus(t)}
                    onEdit={() => setEditTask(t)}
                    onDelete={() => deleteTask(t.id)} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Próximas */}
        {proximas.length > 0 && (
          <div>
            <SectionHeader
              label="📋 Próximas" count={proximas.length}
              color="text-gray-600" bg="bg-gray-50" border="border-gray-200"
              collapsed={!!collapsed['proximas']} onToggle={() => toggleCollapse('proximas')}
            />
            {!collapsed['proximas'] && (
              <div className="space-y-2 ml-1">
                {proximas.map(t => (
                  <TarefaCard key={t.id} t={t}
                    onToggle={() => toggleStatus(t)}
                    onEdit={() => setEditTask(t)}
                    onDelete={() => deleteTask(t.id)} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Concluídas */}
        {concluidas.length > 0 && (
          <div>
            <SectionHeader
              label="✅ Concluídas" count={concluidas.length}
              color="text-green-600" bg="bg-green-50" border="border-green-100"
              collapsed={collapsed['concluidas'] !== false}
              onToggle={() => toggleCollapse('concluidas')}
            />
            {collapsed['concluidas'] === false && (
              <div className="space-y-2 ml-1">
                {concluidas.map(t => (
                  <TarefaCard key={t.id} t={t}
                    onToggle={() => toggleStatus(t)}
                    onEdit={() => setEditTask(t)}
                    onDelete={() => deleteTask(t.id)} />
                ))}
              </div>
            )}
          </div>
        )}

        {displayed.length === 0 && (
          <div className="text-center py-20 text-gray-400">
            <div className="text-5xl mb-4">✅</div>
            <p className="font-semibold text-gray-600">Nenhuma tarefa encontrada</p>
            <p className="text-sm mt-1">
              {search ? 'Tente outro termo de busca' : 'Clique em Nova Tarefa para começar'}
            </p>
          </div>
        )}
      </div>

      {/* Modals */}
      {(showModal || editTask) && (
        <TarefaModal
          task={editTask}
          contatos={contatos}
          onSave={onSaved}
          onClose={() => { setShowModal(false); setEditTask(null) }}
        />
      )}
    </div>
  )
}
