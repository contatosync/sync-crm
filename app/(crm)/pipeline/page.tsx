'use client'
import { useEffect, useState } from 'react'
import { DndContext, DragOverlay, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { supabase } from '@/lib/supabase'
import ContactAvatar from '@/components/ContactAvatar'
import { formatPhone, formatDate } from '@/lib/utils'
import type { Contato, EtapaFunil, Conversa } from '@/types'

function KanbanCard({ contato, ultimaMensagem, onClick }: { contato: Contato; ultimaMensagem?: string; onClick: () => void }) {
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
        <ContactAvatar nome={contato.nome} fotoUrl={contato.foto_url} size={32} />
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

export default function PipelinePage() {
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
    return contatos.filter(c => c.etapa_funil_id === etapaId)
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
    // over.id can be an etapa id (column) or a card id
    // Find which etapa the card was dropped into
    const targetEtapaId = etapas.find(e => e.id === over.id)?.id ??
      contatos.find(c => c.id === over.id)?.etapa_funil_id
    if (!targetEtapaId) return
    const contato = contatos.find(c => c.id === active.id)
    if (!contato || contato.etapa_funil_id === targetEtapaId) return
    // Optimistic update
    setContatos(prev => prev.map(c => c.id === active.id ? { ...c, etapa_funil_id: targetEtapaId } : c))
    await supabase.from('crm_contatos').update({ etapa_funil_id: targetEtapaId }).eq('id', active.id)
  }

  const activeContato = activeId ? contatos.find(c => c.id === activeId) : null

  return (
    <div className="h-full flex flex-col">
      <div className="p-6 pb-4 flex-shrink-0">
        <h1 className="text-xl font-bold text-gray-900">Pipeline</h1>
        <p className="text-sm text-gray-500 mt-0.5">{contatos.length} contatos no funil</p>
      </div>

      <div className="flex-1 overflow-x-auto px-6 pb-6">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={e => setActiveId(e.active.id as string)} onDragEnd={handleDragEnd}>
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
                  <ContactAvatar nome={activeContato.nome} fotoUrl={activeContato.foto_url} size={32} />
                  <p className="text-sm font-semibold">{activeContato.nome}</p>
                </div>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </div>

      {/* Painel detalhes */}
      {detalhes && (
        <div className="fixed inset-0 bg-black/40 flex justify-end z-50" onClick={() => setDetalhes(null)}>
          <div className="w-80 bg-white h-full overflow-y-auto p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-lg font-bold">Detalhes</h2>
              <button onClick={() => setDetalhes(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="text-center mb-4">
              <ContactAvatar nome={detalhes.nome} fotoUrl={detalhes.foto_url} size={64} />
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
