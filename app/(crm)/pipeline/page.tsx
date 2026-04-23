'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DndContext, DragOverlay, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { supabase } from '@/lib/supabase'
import ContactAvatar from '@/components/ContactAvatar'
import { formatPhone, formatDate, isGroupPhone } from '@/lib/utils'
import { MessageSquare, Users } from 'lucide-react'
import type { Contato, EtapaFunil, Conversa } from '@/types'

// ─── Kanban card (funil) ────────────────────────────────────────────────────

function KanbanCard({ contato, ultimaMensagem, onClick }: {
  contato: Contato
  ultimaMensagem?: string
  onClick: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: contato.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className="bg-white rounded-lg p-3 shadow-sm border border-gray-100 cursor-pointer hover:shadow-md transition-shadow"
    >
      <div className="flex items-center gap-2 mb-2">
        <ContactAvatar nome={contato.nome} seed={contato.telefone} size={32} />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{contato.nome ?? 'Sem nome'}</p>
          <p className="text-xs text-gray-400">{formatPhone(contato.telefone)}</p>
        </div>
      </div>
      {ultimaMensagem && <p className="text-xs text-gray-500 truncate">{ultimaMensagem}</p>}
      <p className="text-xs text-gray-400 mt-1">{formatDate(contato.atualizado_em)}</p>
    </div>
  )
}

// ─── Group card ─────────────────────────────────────────────────────────────

function GroupCard({ contato, ultimaMensagem, onOpen }: {
  contato: Contato
  ultimaMensagem?: string
  onOpen: () => void
}) {
  return (
    <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm hover:shadow-md transition-shadow flex flex-col">
      <div className="flex items-start gap-3">
        <ContactAvatar nome={contato.nome} seed={contato.telefone} size={48} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{contato.nome ?? 'Grupo'}</p>
          <p className="text-xs text-gray-400 truncate mt-0.5 font-mono">{contato.telefone.slice(0, 20)}{contato.telefone.length > 20 ? '…' : ''}</p>
          {ultimaMensagem && (
            <p className="text-xs text-gray-500 truncate mt-1.5 italic">"{ultimaMensagem}"</p>
          )}
          <p className="text-xs text-gray-400 mt-1">{formatDate(contato.atualizado_em)}</p>
        </div>
      </div>
      <button
        onClick={onOpen}
        className="mt-3 w-full text-xs font-semibold text-accent hover:text-blue-700 border border-accent/40 hover:border-accent rounded-lg py-1.5 transition-colors flex items-center justify-center gap-1.5"
      >
        <MessageSquare size={12} />
        Abrir conversa
      </button>
    </div>
  )
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function PipelinePage() {
  const router = useRouter()
  const [tab, setTab] = useState<'funil' | 'grupos'>('funil')
  const [etapas, setEtapas] = useState<EtapaFunil[]>([])
  const [contatos, setContatos] = useState<Contato[]>([])
  const [conversas, setConversas] = useState<Record<string, Conversa>>({})
  const [activeId, setActiveId] = useState<string | null>(null)
  const [detalhes, setDetalhes] = useState<Contato | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const [{ data: etapaData }, { data: contatoData }, { data: convData }] = await Promise.all([
      supabase.from('etapas_funil').select('*').order('ordem'),
      supabase.from('crm_contatos').select('*').order('atualizado_em', { ascending: false }),
      supabase.from('conversas').select('telefone, historico, atualizado_em'),
    ])
    if (etapaData) setEtapas(etapaData as EtapaFunil[])
    if (contatoData) setContatos(contatoData as Contato[])
    if (convData) {
      const map: Record<string, Conversa> = {}
      ;(convData as Conversa[]).forEach(c => { map[c.telefone] = c })
      setConversas(map)
    }
  }

  function getContatosByEtapa(etapaId: string) {
    return contatosFunil.filter(c => c.etapa_funil_id === etapaId)
  }

  function getUltimaMensagem(telefone: string) {
    const conv = conversas[telefone]
    if (!conv?.historico?.length) return undefined
    return conv.historico[conv.historico.length - 1].content
  }

  async function handleDragEnd(event: any) {
    const { active, over } = event
    setActiveId(null)
    if (!over || active.id === over.id) return
    const targetEtapaId = etapas.find(e => e.id === over.id)?.id ??
      contatos.find(c => c.id === over.id)?.etapa_funil_id
    if (!targetEtapaId) return
    const contato = contatos.find(c => c.id === active.id)
    if (!contato || contato.etapa_funil_id === targetEtapaId) return
    setContatos(prev => prev.map(c => c.id === active.id ? { ...c, etapa_funil_id: targetEtapaId } : c))
    await supabase.from('crm_contatos').update({ etapa_funil_id: targetEtapaId }).eq('id', active.id)
  }

  const contatosFunil = contatos.filter(c => !isGroupPhone(c.telefone))
  const contatosGrupo = contatos.filter(c => isGroupPhone(c.telefone))
  const activeContato = activeId ? contatosFunil.find(c => c.id === activeId) : null

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-6 pb-0 flex-shrink-0">
        <div className="flex items-end justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Pipeline</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {tab === 'funil'
                ? `${contatosFunil.length} contatos no funil`
                : `${contatosGrupo.length} grupo${contatosGrupo.length !== 1 ? 's' : ''} do WhatsApp`}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-gray-200">
          <button
            onClick={() => setTab('funil')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === 'funil'
                ? 'border-accent text-accent'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <span>Funil</span>
            <span className={`text-xs rounded-full px-1.5 py-0.5 ${tab === 'funil' ? 'bg-accent/10 text-accent' : 'bg-gray-100 text-gray-500'}`}>
              {contatosFunil.length}
            </span>
          </button>
          <button
            onClick={() => setTab('grupos')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === 'grupos'
                ? 'border-accent text-accent'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Users size={14} />
            <span>Grupos</span>
            <span className={`text-xs rounded-full px-1.5 py-0.5 ${tab === 'grupos' ? 'bg-accent/10 text-accent' : 'bg-gray-100 text-gray-500'}`}>
              {contatosGrupo.length}
            </span>
          </button>
        </div>
      </div>

      {/* ── Tab: Funil ──────────────────────────────────────────────── */}
      {tab === 'funil' && (
        <div className="flex-1 overflow-x-auto px-6 py-4">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={e => setActiveId(e.active.id as string)}
            onDragEnd={handleDragEnd}
          >
            <div className="flex gap-4 h-full" style={{ minWidth: etapas.length * 280 }}>
              {etapas.map(etapa => {
                const cards = getContatosByEtapa(etapa.id)
                return (
                  <div key={etapa.id} className="w-64 flex-shrink-0 flex flex-col">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: etapa.cor }} />
                      <h2 className="text-sm font-semibold text-gray-700">{etapa.nome}</h2>
                      <span className="ml-auto bg-gray-100 text-gray-500 text-xs font-medium px-2 py-0.5 rounded-full">{cards.length}</span>
                    </div>
                    <div className="flex-1 bg-gray-100/60 rounded-xl p-2 space-y-2 overflow-y-auto min-h-32">
                      <SortableContext items={cards.map(c => c.id)} strategy={verticalListSortingStrategy}>
                        {cards.map(contato => (
                          <KanbanCard
                            key={contato.id}
                            contato={contato}
                            ultimaMensagem={getUltimaMensagem(contato.telefone)}
                            onClick={() => setDetalhes(contato)}
                          />
                        ))}
                      </SortableContext>
                      {cards.length === 0 && (
                        <div className="flex items-center justify-center h-16 text-xs text-gray-400">Sem contatos</div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            <DragOverlay>
              {activeContato && (
                <div className="bg-white rounded-lg p-3 shadow-lg border border-gray-200 rotate-2 w-64">
                  <div className="flex items-center gap-2">
                    <ContactAvatar nome={activeContato.nome} seed={activeContato.telefone} size={32} />
                    <p className="text-sm font-semibold">{activeContato.nome}</p>
                  </div>
                </div>
              )}
            </DragOverlay>
          </DndContext>
        </div>
      )}

      {/* ── Tab: Grupos ─────────────────────────────────────────────── */}
      {tab === 'grupos' && (
        <div className="flex-1 overflow-y-auto p-6">
          {contatosGrupo.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-400">
              <Users size={32} className="mb-2 opacity-40" />
              <p className="text-sm">Nenhum grupo encontrado</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {contatosGrupo.map(contato => (
                <GroupCard
                  key={contato.id}
                  contato={contato}
                  ultimaMensagem={getUltimaMensagem(contato.telefone)}
                  onOpen={() => router.push('/inbox')}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Painel detalhes */}
      {detalhes && (
        <div className="fixed inset-0 bg-black/40 flex justify-end z-50" onClick={() => setDetalhes(null)}>
          <div className="w-80 bg-white h-full overflow-y-auto p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-lg font-bold">Detalhes</h2>
              <button onClick={() => setDetalhes(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="text-center mb-4">
              <ContactAvatar nome={detalhes.nome} seed={detalhes.telefone} size={64} />
              <h3 className="text-base font-bold mt-2">{detalhes.nome}</h3>
              <p className="text-sm text-gray-500">{formatPhone(detalhes.telefone)}</p>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Email</span><span>{detalhes.email ?? '—'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Status</span><span className="capitalize">{detalhes.status ?? '—'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Origem</span><span className="capitalize">{detalhes.origem ?? '—'}</span></div>
            </div>
            {detalhes.observacoes && (
              <div className="mt-4 pt-4 border-t">
                <p className="text-xs font-semibold text-gray-500 mb-1">OBSERVAÇÕES</p>
                <p className="text-sm text-gray-700">{detalhes.observacoes}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
