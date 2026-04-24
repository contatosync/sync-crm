'use client'
import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import { UnreadContext } from '@/lib/unread-context'
import type { Conversa, Mensagem } from '@/types'

function playBeep() {
  try {
    const Ctx = window.AudioContext || (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx(), osc = ctx.createOscillator(), gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    osc.type = 'sine'; osc.frequency.setValueAtTime(880, ctx.currentTime)
    gain.gain.setValueAtTime(0.1, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.3)
  } catch {}
}

export default function CRMLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [userEmail, setUserEmail] = useState('')
  const [conversas, setConversas] = useState<Conversa[]>([])
  const [lastSeen, setLastSeen] = useState<Record<string, number>>({})
  const knownTs = useRef<Record<string, number>>({})
  const initialized = useRef(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.push('/login')
      else setUserEmail(session.user.email ?? '')
    })
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission()
  }, [router])

  async function loadConversas() {
    const { data } = await supabase.from('conversas').select('telefone, atualizado_em, historico, nome').order('atualizado_em', { ascending: false }).range(0, 999)
    if (!data) return
    const convs = data as Conversa[]
    if (!initialized.current) {
      let stored: Record<string, number> = {}
      try { const s = localStorage.getItem('sync-seen'); if (s) stored = JSON.parse(s) } catch {}
      const now = Date.now(); const next = { ...stored }; let ch = false
      convs.forEach(c => {
        knownTs.current[c.telefone] = new Date(c.atualizado_em).getTime()
        if (!next[c.telefone]) { next[c.telefone] = now; ch = true }
      })
      if (ch) localStorage.setItem('sync-seen', JSON.stringify(next))
      setLastSeen(next); initialized.current = true
    }
    setConversas(convs)
  }

  useEffect(() => {
    loadConversas()
    const ch = supabase.channel('crm-layout').on('postgres_changes', { event: '*', schema: 'public', table: 'conversas' }, payload => {
      const row = payload.new as Conversa
      if (!row?.telefone) { loadConversas(); return }
      const prevTs = knownTs.current[row.telefone] ?? 0
      const newTs = new Date(row.atualizado_em).getTime()
      if (newTs > prevTs && initialized.current) {
        const hist: Mensagem[] = row.historico ?? []
        const last = hist[hist.length - 1]
        if (last?.role === 'user') {
          playBeep()
          if (Notification.permission === 'granted') {
            const nome = row.nome?.trim() || row.telefone
            new Notification(nome, { body: last.content, icon: '/favicon.ico', tag: row.telefone })
          }
        }
      }
      knownTs.current[row.telefone] = newTs
      loadConversas()
    }).subscribe()
    return () => { supabase.removeChannel(ch) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const markAsRead = useCallback((tel: string) => {
    const now = Date.now()
    setLastSeen(prev => {
      const next = { ...prev, [tel]: now }
      localStorage.setItem('sync-seen', JSON.stringify(next))
      return next
    })
  }, [])

  const unreadCount = useMemo(() => conversas.filter(c => {
    const h: Mensagem[] = c.historico ?? []
    const last = h[h.length - 1]
    if (!last || last.role !== 'user') return false
    const seen = lastSeen[c.telefone]
    return seen ? new Date(c.atualizado_em).getTime() > seen : true
  }).length, [conversas, lastSeen])

  useEffect(() => { document.title = unreadCount > 0 ? `(${unreadCount}) Sync CRM` : 'Sync CRM' }, [unreadCount])

  async function handleLogout() { await supabase.auth.signOut(); router.push('/login') }

  return (
    <UnreadContext.Provider value={{ unreadCount, markAsRead }}>
      <div className="flex h-screen overflow-hidden" style={{ backgroundColor: '#F4F5F7' }}>
        <Sidebar userEmail={userEmail} unreadCount={unreadCount} onLogout={handleLogout}/>
        <main className="flex-1 overflow-hidden">{children}</main>
      </div>
    </UnreadContext.Provider>
  )
}
