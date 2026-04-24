'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { LogOut, Wifi, WifiOff, Users, MessageSquare, CheckSquare, Database } from 'lucide-react'

const BASE = 'https://evolution-evolution-api.ojjpm7.easypanel.host'
const KEY = '429683C4C977415CAAFCCE10F7D57E11'
const INST = 'Teste'

export default function ConfiguracoesPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [tab, setTab] = useState<'perfil' | 'integracao' | 'sistema'>('perfil')

  // Evolution connection
  const [connStatus, setConnStatus] = useState<'idle' | 'loading' | 'connected' | 'disconnected'>('idle')

  // System stats
  const [stats, setStats] = useState<{ contatos: number; conversas: number; tarefas: number } | null>(null)
  const [loadingStats, setLoadingStats] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      setEmail(session.user.email ?? '')
    })
  }, [router])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  async function testarConexao() {
    setConnStatus('loading')
    try {
      const r = await fetch(`${BASE}/instance/connectionState/${INST}`, {
        headers: { apikey: KEY },
      })
      if (!r.ok) { setConnStatus('disconnected'); return }
      const d = await r.json()
      const state = d?.instance?.state ?? d?.state ?? ''
      setConnStatus(state === 'open' ? 'connected' : 'disconnected')
    } catch {
      setConnStatus('disconnected')
    }
  }

  async function loadStats() {
    setLoadingStats(true)
    const [{ count: c }, { count: cv }, { count: t }] = await Promise.all([
      supabase.from('crm_contatos').select('*', { count: 'exact', head: true }),
      supabase.from('conversas').select('*', { count: 'exact', head: true }),
      supabase.from('tarefas').select('*', { count: 'exact', head: true }),
    ])
    setStats({ contatos: c ?? 0, conversas: cv ?? 0, tarefas: t ?? 0 })
    setLoadingStats(false)
  }

  useEffect(() => {
    if (tab === 'sistema') loadStats()
  }, [tab])

  const initials = email?.[0]?.toUpperCase() ?? 'U'

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto p-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-bold text-gray-900">Configurações</h1>
          <p className="text-sm text-gray-500 mt-0.5">Gerencie sua conta e integrações</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-gray-200 mb-6">
          {(['perfil', 'integracao', 'sistema'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors capitalize ${
                tab === t ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t === 'perfil' ? 'Perfil' : t === 'integracao' ? 'Integração' : 'Sistema'}
            </button>
          ))}
        </div>

        {/* ── Perfil ── */}
        {tab === 'perfil' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-2xl font-bold">{initials}</span>
                </div>
                <div>
                  <p className="text-base font-semibold text-gray-900">{email}</p>
                  <p className="text-sm text-gray-500">Administrador</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    value={email} readOnly
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-gray-50 text-gray-500 cursor-not-allowed"
                  />
                  <p className="text-xs text-gray-400 mt-1">Para alterar o email, contacte o suporte.</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-red-100 shadow-sm p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-1">Sair da conta</h3>
              <p className="text-sm text-gray-500 mb-4">Você será redirecionado para a página de login.</p>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 bg-red-50 text-red-600 border border-red-200 rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-red-100 transition-colors"
              >
                <LogOut size={16} />
                Sair
              </button>
            </div>
          </div>
        )}

        {/* ── Integração ── */}
        {tab === 'integracao' && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-whatsapp/10 flex items-center justify-center">
                  <MessageSquare size={20} className="text-whatsapp" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Evolution API</h3>
                  <p className="text-xs text-gray-500">WhatsApp via Evolution API</p>
                </div>
                <div className="ml-auto">
                  {connStatus === 'connected' && (
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-green-600 bg-green-50 px-2.5 py-1 rounded-full">
                      <Wifi size={12} />Conectado
                    </span>
                  )}
                  {connStatus === 'disconnected' && (
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-red-600 bg-red-50 px-2.5 py-1 rounded-full">
                      <WifiOff size={12} />Desconectado
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">URL da API</label>
                  <input readOnly value={BASE}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-gray-50 text-gray-500 font-mono cursor-not-allowed" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Instância</label>
                  <input readOnly value={INST}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-gray-50 text-gray-600 cursor-not-allowed" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">API Key</label>
                  <input readOnly value={`${KEY.slice(0, 8)}${'•'.repeat(24)}`}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-gray-50 text-gray-500 font-mono cursor-not-allowed" />
                </div>
              </div>

              <button
                onClick={testarConexao}
                disabled={connStatus === 'loading'}
                className="mt-4 flex items-center gap-2 bg-primary text-white rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-60"
              >
                {connStatus === 'loading' ? (
                  <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Testando…</>
                ) : (
                  <><Wifi size={16} />Testar Conexão</>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ── Sistema ── */}
        {tab === 'sistema' && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                  <Database size={16} className="text-gray-400" />
                  Estatísticas do sistema
                </h3>
                <button onClick={loadStats} disabled={loadingStats}
                  className="text-xs text-primary hover:underline disabled:opacity-60">
                  {loadingStats ? 'Carregando…' : 'Atualizar'}
                </button>
              </div>

              {loadingStats ? (
                <div className="grid grid-cols-3 gap-4">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="h-20 bg-gray-100 rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : stats ? (
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { label: 'Contatos', value: stats.contatos, icon: Users, color: 'text-blue-500', bg: 'bg-blue-50' },
                    { label: 'Conversas', value: stats.conversas, icon: MessageSquare, color: 'text-green-500', bg: 'bg-green-50' },
                    { label: 'Tarefas', value: stats.tarefas, icon: CheckSquare, color: 'text-purple-500', bg: 'bg-purple-50' },
                  ].map(({ label, value, icon: Icon, color, bg }) => (
                    <div key={label} className={`${bg} rounded-xl p-4`}>
                      <Icon size={20} className={`${color} mb-2`} />
                      <p className="text-2xl font-bold text-gray-900">{value.toLocaleString('pt-BR')}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Versão do sistema</h3>
              <div className="space-y-2 text-sm text-gray-600">
                <div className="flex justify-between">
                  <span className="text-gray-500">Aplicação</span>
                  <span className="font-medium">Sync CRM v2.0</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Framework</span>
                  <span className="font-medium">Next.js 14</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Database</span>
                  <span className="font-medium">Supabase (PostgreSQL)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">WhatsApp</span>
                  <span className="font-medium">Evolution API</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
