'use client'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, MessageSquare, Kanban, List, Calendar, Users, BarChart2,
  Settings, LogOut, ChevronLeft, ChevronRight
} from 'lucide-react'

interface Props { userEmail: string; unreadCount: number; onLogout: () => void }

interface NavItem { label: string; href: string; icon: React.ElementType; badge?: number; exact?: boolean }
interface NavSection { title?: string; items: NavItem[] }

export default function Sidebar({ userEmail, unreadCount, onLogout }: Props) {
  const [collapsed, setCollapsed] = useState(false)
  const pathname = usePathname()

  const sections: NavSection[] = [
    { items: [{ label: 'Início', href: '/dashboard', icon: LayoutDashboard, exact: true }] },
    { title: 'Comunicações', items: [{ label: 'Inbox', href: '/inbox', icon: MessageSquare, badge: unreadCount }] },
    { title: 'Funis de vendas', items: [
      { label: 'Funil de vendas', href: '/pipeline', icon: Kanban, exact: true },
      { label: 'Todos os leads', href: '/pipeline?view=list', icon: List },
    ]},
    { items: [{ label: 'Calendário', href: '/calendario', icon: Calendar }] },
    { title: 'Listas', items: [{ label: 'Contatos', href: '/contatos', icon: Users }] },
    { title: 'Insights', items: [{ label: 'Painel', href: '/dashboard', icon: BarChart2, exact: true }] },
  ]

  function isActive(item: NavItem): boolean {
    if (item.href.includes('?')) return pathname + (typeof window !== 'undefined' ? window.location.search : '') === item.href || pathname === item.href.split('?')[0]
    if (item.exact) return pathname === item.href
    return pathname.startsWith(item.href)
  }

  const w = collapsed ? 52 : 220

  return (
    <aside className="flex flex-col flex-shrink-0 h-screen transition-all duration-200 overflow-hidden"
      style={{ width: w, minWidth: w, backgroundColor: '#1A1A2E' }}>

      {/* Header */}
      <div className="flex items-center px-2 py-3 border-b border-white/10 flex-shrink-0"
        style={{ minHeight: 56, justifyContent: collapsed ? 'center' : 'space-between' }}>
        {!collapsed && (
          <div className="flex items-center gap-2.5 ml-1">
            <div className="w-7 h-7 bg-primary rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-white font-black text-xs">S</span>
            </div>
            <span className="text-white font-bold text-base tracking-widest">SYNC</span>
          </div>
        )}
        {collapsed && (
          <div className="w-7 h-7 bg-primary rounded-lg flex items-center justify-center">
            <span className="text-white font-black text-xs">S</span>
          </div>
        )}
        {!collapsed && (
          <button onClick={() => setCollapsed(true)} className="text-white/40 hover:text-white p-1 rounded transition-colors">
            <ChevronLeft size={16}/>
          </button>
        )}
      </div>

      {/* Expand button when collapsed */}
      {collapsed && (
        <button onClick={() => setCollapsed(false)} className="mx-auto mt-2 p-1.5 text-white/40 hover:text-white rounded transition-colors">
          <ChevronRight size={16}/>
        </button>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
        {sections.map((section, si) => (
          <div key={si} className={si > 0 && section.title ? 'mt-4' : si > 0 ? 'mt-1' : ''}>
            {section.title && !collapsed && (
              <p className="text-[10px] font-semibold uppercase tracking-wider px-2 mb-1 mt-3"
                style={{ color: 'rgba(255,255,255,0.35)' }}>
                {section.title}
              </p>
            )}
            {section.items.map(item => {
              const active = isActive(item)
              const Icon = item.icon
              return (
                <Link key={item.href} href={item.href}
                  className="flex items-center rounded-lg transition-colors relative"
                  style={{
                    gap: collapsed ? 0 : 10,
                    padding: collapsed ? '8px 0' : '7px 10px',
                    justifyContent: collapsed ? 'center' : 'flex-start',
                    backgroundColor: active ? '#2563EB' : 'transparent',
                    color: active ? '#ffffff' : 'rgba(255,255,255,0.65)',
                  }}
                  onMouseEnter={e => { if(!active)(e.currentTarget as HTMLElement).style.backgroundColor='rgba(255,255,255,0.08)' }}
                  onMouseLeave={e => { if(!active)(e.currentTarget as HTMLElement).style.backgroundColor='transparent' }}
                >
                  <div className="relative flex-shrink-0">
                    <Icon size={18}/>
                    {item.badge !== undefined && item.badge > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[15px] h-[15px] flex items-center justify-center px-0.5 leading-none">
                        {item.badge > 99 ? '99+' : item.badge}
                      </span>
                    )}
                  </div>
                  {!collapsed && <span className="text-sm font-medium truncate">{item.label}</span>}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      {/* Settings */}
      <div className="px-2 pb-1">
        <Link href="/configuracoes"
          className="flex items-center rounded-lg transition-colors"
          style={{
            gap: collapsed ? 0 : 10,
            padding: collapsed ? '8px 0' : '7px 10px',
            justifyContent: collapsed ? 'center' : 'flex-start',
            color: pathname === '/configuracoes' ? '#ffffff' : 'rgba(255,255,255,0.65)',
            backgroundColor: pathname === '/configuracoes' ? '#2563EB' : 'transparent',
          }}>
          <Settings size={18} className="flex-shrink-0"/>
          {!collapsed && <span className="text-sm font-medium">Configurações</span>}
        </Link>
      </div>

      {/* Footer */}
      <div className="px-2 py-3 border-t border-white/10 flex-shrink-0">
        {collapsed ? (
          <button onClick={onLogout} className="w-full flex justify-center p-2 text-white/40 hover:text-white transition-colors">
            <LogOut size={16}/>
          </button>
        ) : (
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
              <span className="text-white text-xs font-bold">{userEmail?.[0]?.toUpperCase()||'U'}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-xs font-medium truncate">{userEmail}</p>
              <p className="text-white/40 text-[10px]">Administrador</p>
            </div>
            <button onClick={onLogout} className="text-white/40 hover:text-white transition-colors p-1">
              <LogOut size={14}/>
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}
