'use client'
import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { MessageSquare, Kanban, Users, BarChart3, CheckSquare, Settings, LogOut } from 'lucide-react'
import { UnreadContext } from '@/lib/unread-context'
import type { Conversa } from '@/types'

function playBeep() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
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
  } catch {
    // AudioContext não disponível
  }
}

export default function CRMLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [userEmail, setUserEmail] = useState('')
  const [conversas, setConversas] = useState<Conversa[]>([])
  const [lastSeen, setLastSeen] = useState<Record<string, number>>({})
  const knownTimestamps = useRef<Record<string, number>>({})
  const initialized = useRef(false)

  // lastSeen é carregado e inicializado dentro de loadConversas() na primeira carga

  // Verificação de auth
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.push('/login')
      else setUserEmail(session.user.email ?? '')
    })
  }, [router])

  // Pede permissão de notificação
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  async function loadConversas() {
    const { data } = await supabase
      .from('conversas')
      .select('telefone, atualizado_em, historico, nome')
      .order('atualizado_em', { ascending: false })
      .range(0, 999)

    if (!data) return

    const convs = data as Conversa[]

    // Na primeira carga: registra timestamps E inicializa lastSeen para evitar
    // falsos "não lidos" em conversas já existentes antes do app abrir.
    if (!initialized.current) {
      let existingSeen: Record<string, number> = {}
      try {
        const stored = localStorage.getItem('sync-crm-last-seen')
        if (stored) existingSeen = JSON.parse(stored)
      } catch {}

      const now = Date.now()
      const nextSeen = { ...existingSeen }
      let changed = false

      convs.forEach(c => {
        knownTimestamps.current[c.telefone] = new Date(c.atualizado_em).getTime()
        // Marca como "vista agora" se nunca foi vista — evita unread flood no primeiro acesso
        if (!nextSeen[c.telefone]) {
          nextSeen[c.telefone] = now
          changed = true
        }
      })

      if (changed) {
        localStorage.setItem('sync-crm-last-seen', JSON.stringify(nextSeen))
      }
      setLastSeen(nextSeen)
      initialized.current = true
    }

    setConversas(convs)
  }

  // Realtime para notificações
  useEffect(() => {
    loadConversas()

    const channel = supabase
      .channel('conversas-notifications')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversas' }, (payload) => {
        const row = payload.new as Conversa
        if (!row?.telefone) { loadConversas(); return }

        const prevTs = knownTimestamps.current[row.telefone] ?? 0
        const newTs = new Date(row.atualizado_em).getTime()

        if (newTs > prevTs && initialized.current) {
          const historico = row.historico ?? []
          const lastMsg = historico[historico.length - 1]

          if (lastMsg?.role === 'user') {
            // Beep
            playBeep()

            // Notificação do browser
            if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
              const nome = row.nome && row.nome.trim() ? row.nome : row.telefone
              new Notification(nome, {
                body: lastMsg.content,
                icon: '/favicon.ico',
                tag: row.telefone, // evita duplicatas para o mesmo contato
              })
            }
          }
        }

        knownTimestamps.current[row.telefone] = newTs
        loadConversas()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
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
      const historico = c.historico ?? []
      const lastMsg = historico[historico.length - 1]
      if (!lastMsg || lastMsg.role !== 'user') return false
      const seen = lastSeen[c.telefone]
      if (!seen) return true
      return new Date(c.atualizado_em).getTime() > seen
    }).length
  }, [conversas, lastSeen])

  // Atualiza título da aba
  useEffect(() => {
    document.title = unreadCount > 0 ? `(${unreadCount}) Sync CRM` : 'Sync CRM'
  }, [unreadCount])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const navItems = [
    { href: '/inbox',      icon: MessageSquare, label: 'Inbox',     badge: unreadCount },
    { href: '/pipeline',   icon: Kanban,        label: 'Pipeline',  badge: 0 },
    { href: '/contatos',   icon: Users,         label: 'Contatos',  badge: 0 },
    { href: '/dashboard',  icon: BarChart3,     label: 'Dashboard', badge: 0 },
    { href: '/tarefas',    icon: CheckSquare,   label: 'Tarefas',   badge: 0 },
  ]

  return (
    <UnreadContext.Provider value={{ unreadCount, markAsRead }}>
      <div className="flex h-screen bg-surface overflow-hidden">
        {/* Sidebar */}
        <aside className="w-16 lg:w-56 bg-sidebar flex flex-col flex-shrink-0">
          {/* Logo */}
          <div className="p-4 flex items-center gap-3 border-b border-white/10">
            <div className="w-8 h-8 bg-accent rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-white font-black text-sm">S</span>
            </div>
            <span className="text-white font-bold text-lg hidden lg:block tracking-wide">SYNC</span>
          </div>

          {/* Nav */}
          <nav className="flex-1 p-3 space-y-1">
            {navItems.map(({ href, icon: Icon, label, badge }) => {
              const active = pathname.startsWith(href)
              return (
                <Link
                  key={href}
                  href={href}
                  className={`relative flex items-center gap-3 px-2 py-2.5 rounded-lg transition-colors ${
                    active
                      ? 'bg-accent text-white'
                      : 'text-white/60 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <div className="relative flex-shrink-0">
                    <Icon size={20} />
                    {badge > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-0.5 leading-none">
                        {badge > 99 ? '99+' : badge}
                      </span>
                    )}
                  </div>
                  <span className="text-sm font-medium hidden lg:block">{label}</span>
                </Link>
              )
            })}
          </nav>

          {/* Footer */}
          <div className="p-3 border-t border-white/10 space-y-1">
            <Link href="/configuracoes" className="flex items-center gap-3 px-2 py-2.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors">
              <Settings size={20} className="flex-shrink-0" />
              <span className="text-sm font-medium hidden lg:block">Config</span>
            </Link>
            <div className="flex items-center gap-3 px-2 py-2 mt-2">
              <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center flex-shrink-0">
                <span className="text-white text-xs font-bold">
                  {userEmail?.[0]?.toUpperCase() ?? 'U'}
                </span>
              </div>
              <div className="hidden lg:block flex-1 min-w-0">
                <p className="text-white text-xs font-medium truncate">{userEmail}</p>
              </div>
              <button onClick={handleLogout} className="text-white/40 hover:text-white transition-colors hidden lg:block">
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 overflow-hidden">{children}</main>
      </div>
    </UnreadContext.Provider>
  )
}
