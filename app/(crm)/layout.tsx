'use client'
import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import {
  Home, MessageSquare, Kanban, LayoutList, Calendar, Users, BarChart3,
  Settings, LogOut, ChevronLeft, ChevronRight
} from 'lucide-react'
import { UnreadContext } from '@/lib/unread-context'
import type { Conversa, Mensagem } from '@/types'

function playBeep() {
  try {
    const AudioCtx = window.AudioContext || (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    gain.gain.setValueAtTime(0.12, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.35)
  } catch { /* AudioContext not available */ }
}

interface NavItem {
  href: string
  icon: React.ElementType
  label: string
  badge?: number
  exact?: boolean
}

interface NavSection {
  title?: string
  items: NavItem[]
}

export default function CRMLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [userEmail, setUserEmail] = useState('')
  const [conversas, setConversas] = useState<Conversa[]>([])
  const [lastSeen, setLastSeen] = useState<Record<string, number>>({})
  const [collapsed, setCollapsed] = useState(false)
  const knownTimestamps = useRef<Record<string, number>>({})
  const initialized = useRef(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.push('/login')
      else setUserEmail(session.user.email ?? '')
    })
  }, [router])

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  async function loadConversas() {
    const { data } = await supabase
      .from('conversas')
      .select('telefone, atualizado_em, historico, nome, id')
      .order('atualizado_em', { ascending: false })
      .range(0, 999)
    if (!data) return
    const convs = data as Conversa[]

    if (!initialized.current) {
      let existingSeen: Record<string, number> = {}
      try {
        const stored = localStorage.getItem('sync-crm-last-seen')
        if (stored) existingSeen = JSON.parse(stored)
      } catch { /* ignore */ }

      const now = Date.now()
      const nextSeen = { ...existingSeen }
      let changed = false
      convs.forEach(c => {
        knownTimestamps.current[c.telefone] = new Date(c.atualizado_em).getTime()
        if (!nextSeen[c.telefone]) { nextSeen[c.telefone] = now; changed = true }
      })
      if (changed) localStorage.setItem('sync-crm-last-seen', JSON.stringify(nextSeen))
      setLastSeen(nextSeen)
      initialized.current = true
    }
    setConversas(convs)
  }

  useEffect(() => {
    loadConversas()
    const channel = supabase
      .channel('crm-layout-conversas')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversas' }, (payload) => {
        const row = payload.new as Conversa
        if (!row?.telefone) { loadConversas(); return }
        const prevTs = knownTimestamps.current[row.telefone] ?? 0
        const newTs = new Date(row.atualizado_em).getTime()
        if (newTs > prevTs && initialized.current) {
          const historico: Mensagem[] = row.historico ?? []
          const lastMsg = historico[historico.length - 1]
          if (lastMsg?.role === 'user') {
            playBeep()
            if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
              const nome = row.nome?.trim() ? row.nome : row.telefone
              new Notification(nome, { body: lastMsg.content, icon: '/favicon.ico', tag: row.telefone })
            }
          }
        }
        knownTimestamps.current[row.telefone] = newTs
        loadConversas()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const markAsRead = useCallback((telefone: string) => {
    const now = Date.now()
    setLastSeen(prev => {
      const next = { ...prev, [telefone]: now }
      localStorage.setItem('sync-crm-last-seen', JSON.stringify(next))
      return next
    })
  }, [])

  const unreadCount = useMemo(() => {
    return conversas.filter(c => {
      const historico: Mensagem[] = c.historico ?? []
      const lastMsg = historico[historico.length - 1]
      if (!lastMsg || lastMsg.role !== 'user') return false
      const seen = lastSeen[c.telefone]
      if (!seen) return true
      return new Date(c.atualizado_em).getTime() > seen
    }).length
  }, [conversas, lastSeen])

  useEffect(() => {
    document.title = unreadCount > 0 ? `(${unreadCount}) Sync CRM` : 'Sync CRM'
  }, [unreadCount])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const navSections: NavSection[] = [
    {
      items: [
        { href: '/dashboard', icon: Home, label: 'Início', exact: true },
      ],
    },
    {
      title: 'Comunicações',
      items: [
        { href: '/inbox', icon: MessageSquare, label: 'Inbox', badge: unreadCount },
      ],
    },
    {
      title: 'Funis de vendas',
      items: [
        { href: '/pipeline', icon: Kanban, label: 'Funil de vendas', exact: true },
        { href: '/pipeline?view=lista', icon: LayoutList, label: 'Todos os leads' },
      ],
    },
    {
      items: [
        { href: '/calendario', icon: Calendar, label: 'Calendário' },
      ],
    },
    {
      title: 'Listas',
      items: [
        { href: '/contatos', icon: Users, label: 'Contatos' },
      ],
    },
    {
      title: 'Insights',
      items: [
        { href: '/dashboard', icon: BarChart3, label: 'Painel', exact: true },
      ],
    },
  ]

  function isActive(item: NavItem): boolean {
    if (item.href.includes('?')) return pathname === item.href.split('?')[0]
    if (item.exact) return pathname === item.href
    return pathname.startsWith(item.href)
  }

  return (
    <UnreadContext.Provider value={{ unreadCount, markAsRead }}>
      <div className="flex h-screen overflow-hidden bg-surface">
        {/* Sidebar */}
        <aside
          className="flex flex-col flex-shrink-0 transition-all duration-200"
          style={{ width: collapsed ? 52 : 220, backgroundColor: '#1A1A2E' }}
        >
          {/* Logo */}
          <div className="flex items-center gap-3 px-3 py-4 border-b border-white/10 flex-shrink-0">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-white font-black text-sm">S</span>
            </div>
            {!collapsed && <span className="text-white font-bold text-base tracking-widest">SYNC</span>}
          </div>

          {/* Nav */}
          <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
            {navSections.map((section, si) => (
              <div key={si} className={si > 0 ? 'mt-4' : ''}>
                {section.title && !collapsed && (
                  <p className="text-white/40 text-[10px] uppercase tracking-widest font-semibold px-2 pb-1.5">{section.title}</p>
                )}
                {section.items.map(item => {
                  const active = isActive(item)
                  return (
                    <Link
                      key={item.href + item.label}
                      href={item.href}
                      className={`relative flex items-center gap-3 px-2 py-2 rounded-lg transition-colors mb-0.5 ${
                        active ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white/90 hover:bg-white/5'
                      } ${collapsed ? 'justify-center' : ''}`}
                    >
                      <div className="relative flex-shrink-0">
                        <item.icon size={18} />
                        {item.badge !== undefined && item.badge > 0 && (
                          <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[15px] h-[15px] flex items-center justify-center px-0.5 leading-none">
                            {item.badge > 99 ? '99+' : item.badge}
                          </span>
                        )}
                      </div>
                      {!collapsed && (
                        <span className="text-sm font-medium truncate flex-1">{item.label}</span>
                      )}
                      {!collapsed && active && (
                        <div className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                      )}
                    </Link>
                  )
                })}
              </div>
            ))}
          </nav>

          {/* Bottom */}
          <div className="flex-shrink-0 border-t border-white/10 p-2 space-y-1">
            <Link
              href="/configuracoes"
              className={`flex items-center gap-3 px-2 py-2 rounded-lg text-white/60 hover:text-white/90 hover:bg-white/5 transition-colors ${collapsed ? 'justify-center' : ''}`}
            >
              <Settings size={18} className="flex-shrink-0" />
              {!collapsed && <span className="text-sm font-medium">Configurações</span>}
            </Link>

            <div className={`flex items-center gap-2 px-2 py-2 ${collapsed ? 'justify-center' : ''}`}>
              <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                <span className="text-white text-xs font-bold">{userEmail?.[0]?.toUpperCase() ?? 'U'}</span>
              </div>
              {!collapsed && (
                <>
                  <p className="text-white/70 text-xs truncate flex-1">{userEmail}</p>
                  <button onClick={handleLogout} className="text-white/40 hover:text-white transition-colors flex-shrink-0">
                    <LogOut size={14} />
                  </button>
                </>
              )}
            </div>

            {/* Collapse toggle */}
            <button
              onClick={() => setCollapsed(c => !c)}
              className={`w-full flex items-center gap-3 px-2 py-2 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors ${collapsed ? 'justify-center' : 'justify-end'}`}
            >
              {collapsed ? <ChevronRight size={16} /> : (
                <>
                  <span className="text-xs">Recolher</span>
                  <ChevronLeft size={16} />
                </>
              )}
            </button>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-hidden">{children}</main>
      </div>
    </UnreadContext.Provider>
  )
}
