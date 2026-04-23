'use client'
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { MessageSquare, Kanban, Users, BarChart3, CheckSquare, Settings, LogOut } from 'lucide-react'

const navItems = [
  { href: '/inbox', icon: MessageSquare, label: 'Inbox' },
  { href: '/pipeline', icon: Kanban, label: 'Pipeline' },
  { href: '/contatos', icon: Users, label: 'Contatos' },
  { href: '/dashboard', icon: BarChart3, label: 'Dashboard' },
  { href: '/tarefas', icon: CheckSquare, label: 'Tarefas' },
]

export default function CRMLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [userEmail, setUserEmail] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.push('/login')
      else setUserEmail(session.user.email ?? '')
    })
  }, [router])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
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
          {navItems.map(({ href, icon: Icon, label }) => {
            const active = pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 px-2 py-2.5 rounded-lg transition-colors ${
                  active
                    ? 'bg-accent text-white'
                    : 'text-white/60 hover:text-white hover:bg-white/10'
                }`}
              >
                <Icon size={20} className="flex-shrink-0" />
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
  )
}
