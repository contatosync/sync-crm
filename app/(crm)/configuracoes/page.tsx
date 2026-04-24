'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Tab = 'perfil' | 'integracao' | 'sistema'

export default function ConfiguracoesPage() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('perfil')
  const [email, setEmail] = useState('')
  const [connStatus, setConnStatus] = useState<'idle'|'testing'|'connected'|'error'>('idle')
  const [stats, setStats] = useState({ contatos: 0, conversas: 0, tarefas: 0 })
  const [loadingStats, setLoadingStats] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user.email) setEmail(session.user.email)
    })
  }, [])

  useEffect(() => {
    if (tab === 'sistema') loadStats()
  }, [tab])

  async function loadStats() {
    setLoadingStats(true)
    const [{ count: c }, { count: conv }, { count: t }] = await Promise.all([
      supabase.from('crm_contatos').select('*', { count: 'exact', head: true }),
      supabase.from('conversas').select('*', { count: 'exact', head: true }),
      supabase.from('tarefas').select('*', { count: 'exact', head: true }),
    ])
    setStats({ contatos: c ?? 0, conversas: conv ?? 0, tarefas: t ?? 0 })
    setLoadingStats(false)
  }

  async function testConnection() {
    setConnStatus('testing')
    try {
      const r = await fetch('https://evolution-evolution-api.ojjpm7.easypanel.host/instance/connectionState/Teste', {
        headers: { apikey: '429683C4C977415CAAFCCE10F7D57E11' }
      })
      if (r.ok) {
        const d = await r.json()
        setConnStatus(d.instance?.state === 'open' ? 'connected' : 'error')
      } else setConnStatus('error')
    } catch { setConnStatus('error') }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const getInitial = (e: string) => e?.[0]?.toUpperCase() || 'U'

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-6 py-4 border-b border-gray-200 bg-white flex-shrink-0">
        <h1 className="text-lg font-semibold text-gray-900">Configurações</h1>
      </div>

      <div className="flex flex-1">
        {/* Side tabs */}
        <div className="w-48 border-r border-gray-200 bg-white p-3 flex-shrink-0">
          {(['perfil','integracao','sistema'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium mb-1 transition-colors ${tab===t ? 'bg-primary/10 text-primary' : 'text-gray-600 hover:bg-gray-50'}`}>
              {t === 'perfil' ? 'Perfil' : t === 'integracao' ? 'Integração' : 'Sistema'}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 p-6">
          {tab === 'perfil' && (
            <div className="max-w-md">
              <h2 className="text-base font-semibold text-gray-900 mb-6">Perfil</h2>
              <div className="flex items-center gap-4 mb-6">
                <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-2xl font-bold">{getInitial(email)}</span>
                </div>
                <div>
                  <p className="font-medium text-gray-900">{email}</p>
                  <p className="text-sm text-gray-500">Administrador</p>
                </div>
              </div>
              <div className="bg-gray-50 rounded-xl p-4 mb-4">
                <p className="text-sm text-gray-600"><strong>Email:</strong> {email}</p>
                <p className="text-sm text-gray-600 mt-1"><strong>Função:</strong> Administrador</p>
              </div>
              <button onClick={handleLogout}
                className="w-full border border-red-200 text-red-600 rounded-xl py-2.5 text-sm font-medium hover:bg-red-50 transition-colors">
                Sair da conta
              </button>
            </div>
          )}

          {tab === 'integracao' && (
            <div className="max-w-md">
              <h2 className="text-base font-semibold text-gray-900 mb-6">Evolution API</h2>
              <div className="space-y-4">
                <div className="bg-gray-50 rounded-xl p-4">
                  <label className="text-xs font-semibold text-gray-500 uppercase block mb-1">URL</label>
                  <p className="text-sm text-gray-800 font-mono">https://evolution-evolution-api.ojjpm7.easypanel.host</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-4">
                  <label className="text-xs font-semibold text-gray-500 uppercase block mb-1">Instância</label>
                  <p className="text-sm text-gray-800 font-mono">Teste</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-4">
                  <label className="text-xs font-semibold text-gray-500 uppercase block mb-1">Supabase URL</label>
                  <p className="text-sm text-gray-800 font-mono truncate">https://tsluxdsckwzvcnjwzelu.supabase.co</p>
                </div>
                <button onClick={testConnection} disabled={connStatus === 'testing'}
                  className="w-full bg-primary text-white rounded-xl py-2.5 text-sm font-medium hover:bg-primary-dark disabled:opacity-60 transition-colors">
                  {connStatus === 'testing' ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>Testando…
                    </span>
                  ) : 'Testar conexão'}
                </button>
                {connStatus === 'connected' && (
                  <div className="flex items-center gap-2 text-green-600 bg-green-50 rounded-xl px-4 py-3">
                    <div className="w-2 h-2 rounded-full bg-green-500"/>
                    <span className="text-sm font-medium">Conectado</span>
                  </div>
                )}
                {connStatus === 'error' && (
                  <div className="flex items-center gap-2 text-red-600 bg-red-50 rounded-xl px-4 py-3">
                    <div className="w-2 h-2 rounded-full bg-red-500"/>
                    <span className="text-sm font-medium">Desconectado</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'sistema' && (
            <div className="max-w-lg">
              <h2 className="text-base font-semibold text-gray-900 mb-6">Sistema</h2>
              {loadingStats ? (
                <div className="text-sm text-gray-400">Carregando…</div>
              ) : (
                <div className="grid grid-cols-3 gap-4 mb-6">
                  {[
                    { label: 'Contatos', value: stats.contatos, icon: '👥' },
                    { label: 'Conversas', value: stats.conversas, icon: '💬' },
                    { label: 'Tarefas', value: stats.tarefas, icon: '✅' },
                  ].map(s => (
                    <div key={s.label} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 text-center">
                      <div className="text-2xl mb-1">{s.icon}</div>
                      <p className="text-2xl font-bold text-gray-900">{s.value}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
                    </div>
                  ))}
                </div>
              )}
              <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Tecnologias</h3>
                {[
                  { label: 'Framework', value: 'Next.js 14' },
                  { label: 'Banco de dados', value: 'Supabase (PostgreSQL)' },
                  { label: 'Mensageria', value: 'Evolution API (WhatsApp)' },
                  { label: 'IA', value: 'Claude Sonnet 4.6' },
                ].map(i => (
                  <div key={i.label} className="flex justify-between text-sm">
                    <span className="text-gray-500">{i.label}</span>
                    <span className="text-gray-800 font-medium">{i.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
