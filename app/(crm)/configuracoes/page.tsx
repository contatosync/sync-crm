'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, X, Plus, Loader2, Check, AlertCircle, LogOut, ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'

/* ─── Types ─────────────────────────────────────── */
type SideTab = 'perfil' | 'geral' | 'usuarios' | 'evolution'

interface Toast { id: number; type: 'success' | 'error'; message: string }

interface WorkspaceConfig {
  nome_empresa?: string
  fuso_horario?: string
  formato_data?: string
  moeda?: string
}

interface EvolutionConfig {
  url?: string
  api_key?: string
  instancia?: string
}

interface UserRecord {
  id: string; nome: string; email: string; role: 'admin' | 'operador'
}

/* ─── Toast System ──────────────────────────────── */
function ToastContainer({ toasts, onRemove }: { toasts: Toast[]; onRemove: (id: number) => void }) {
  return (
    <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div key={t.id}
          className={`flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-xl text-sm font-medium pointer-events-auto ${
            t.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
          }`}>
          {t.type === 'success' ? <Check size={15} /> : <AlertCircle size={15} />}
          {t.message}
          <button onClick={() => onRemove(t.id)} className="ml-2 opacity-70 hover:opacity-100">
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  )
}

/* ─── SQL Notice ────────────────────────────────── */
const SQL_NOTICE = `create table if not exists config (
  id uuid primary key default gen_random_uuid(),
  chave text unique not null,
  valor jsonb,
  criado_em timestamptz default now(),
  atualizado_em timestamptz default now()
);`

/* ─── Perfil Tab ────────────────────────────────── */
function PerfilTab({ addToast }: { addToast: (type: 'success' | 'error', msg: string) => void }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [novaSenha, setNovaSenha] = useState('')
  const [confirmarSenha, setConfirmarSenha] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setEmail(user.email ?? '')
        setNome((user.user_metadata?.nome as string) ?? '')
        setTelefone((user.user_metadata?.telefone as string) ?? '')
      }
    })
  }, [])

  async function handleSave() {
    if (novaSenha && novaSenha !== confirmarSenha) {
      addToast('error', 'Senhas não coincidem')
      return
    }
    setSaving(true)
    const updates: Record<string, unknown> = {
      data: { nome, telefone },
    }
    if (novaSenha) updates.password = novaSenha
    const { error } = await supabase.auth.updateUser(updates as Parameters<typeof supabase.auth.updateUser>[0])
    if (error) addToast('error', error.message)
    else { addToast('success', 'Perfil salvo com sucesso!'); setNovaSenha(''); setConfirmarSenha('') }
    setSaving(false)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const initial = (nome || email || 'U')[0].toUpperCase()

  return (
    <div className="max-w-lg">
      <h2 className="text-base font-black text-gray-900 mb-6 tracking-wide uppercase">Configurações de Perfil</h2>

      {/* Avatar */}
      <div className="flex items-center gap-5 mb-7">
        <div className="relative">
          <div className="w-20 h-20 rounded-full bg-primary flex items-center justify-center text-white text-2xl font-black shadow-md">
            {initial}
          </div>
          <button onClick={() => fileRef.current?.click()}
            className="absolute -bottom-1 -right-1 w-7 h-7 bg-white border border-gray-200 rounded-full flex items-center justify-center shadow-sm hover:bg-gray-50 transition-colors text-gray-500"
            title="Alterar foto">
            <span className="text-xs">✏️</span>
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" />
        </div>
        <div>
          <p className="font-bold text-gray-900">{nome || '—'}</p>
          <p className="text-sm text-gray-400">{email}</p>
          <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full mt-1 inline-block">
            Administrador
          </span>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1.5">
            Nome completo
          </label>
          <input value={nome} onChange={e => setNome(e.target.value)}
            placeholder="Seu nome completo"
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary" />
        </div>
        <div>
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1.5">
            Email
          </label>
          <input value={email} readOnly
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-gray-50 text-gray-500 cursor-not-allowed" />
        </div>
        <div>
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1.5">
            Telefone
          </label>
          <input value={telefone} onChange={e => setTelefone(e.target.value)}
            placeholder="+55 11 99999-9999"
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary" />
        </div>

        <div className="pt-2 border-t border-gray-100">
          <p className="text-xs font-bold text-gray-500 mb-3">Alterar senha (opcional)</p>
          <div className="space-y-3">
            <div className="relative">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1.5">
                Nova senha
              </label>
              <input type={showPass ? 'text' : 'password'} value={novaSenha}
                onChange={e => setNovaSenha(e.target.value)}
                placeholder="Deixe em branco para não alterar"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary pr-10" />
              <button type="button" onClick={() => setShowPass(v => !v)}
                className="absolute right-3 top-[38px] text-gray-400 hover:text-gray-600">
                {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1.5">
                Confirmar senha
              </label>
              <input type={showPass ? 'text' : 'password'} value={confirmarSenha}
                onChange={e => setConfirmarSenha(e.target.value)}
                placeholder="Repita a nova senha"
                className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary ${
                  confirmarSenha && confirmarSenha !== novaSenha ? 'border-red-300 bg-red-50' : 'border-gray-200'
                }`} />
              {confirmarSenha && confirmarSenha !== novaSenha && (
                <p className="text-xs text-red-500 mt-1">Senhas não coincidem</p>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={handleSave} disabled={saving}
            className="flex-1 bg-primary text-white rounded-xl py-2.5 text-sm font-bold hover:bg-primary-dark disabled:opacity-60 transition-colors flex items-center justify-center gap-2">
            {saving ? <><Loader2 size={14} className="animate-spin" /> Salvando…</> : 'Salvar alterações'}
          </button>
          <button onClick={handleLogout}
            className="flex items-center gap-1.5 px-4 border border-red-200 text-red-500 rounded-xl text-sm font-semibold hover:bg-red-50 transition-colors">
            <LogOut size={14} /> Sair
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─── Geral Tab ─────────────────────────────────── */
function GeralTab({ addToast }: { addToast: (type: 'success' | 'error', msg: string) => void }) {
  const [config, setConfig] = useState<WorkspaceConfig>({
    nome_empresa: 'Sync Studios',
    fuso_horario: 'America/Sao_Paulo',
    formato_data: 'dd/MM/yyyy',
    moeda: 'BRL',
  })
  const [saving, setSaving] = useState(false)
  const [showSql, setShowSql] = useState(false)

  useEffect(() => {
    supabase.from('config').select('valor').eq('chave', 'workspace').maybeSingle()
      .then(({ data }) => {
        if (data?.valor) setConfig(data.valor as WorkspaceConfig)
      })
  }, [])

  async function handleSave() {
    setSaving(true)
    const { error } = await supabase.from('config').upsert(
      { chave: 'workspace', valor: config, atualizado_em: new Date().toISOString() },
      { onConflict: 'chave' }
    )
    if (error) addToast('error', 'Erro ao salvar: ' + error.message)
    else addToast('success', 'Configurações salvas!')
    setSaving(false)
  }

  return (
    <div className="max-w-lg">
      <h2 className="text-base font-black text-gray-900 mb-6 tracking-wide uppercase">Configurações Gerais</h2>

      {/* SQL Notice */}
      <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4">
        <div className="flex items-start gap-2">
          <AlertCircle size={15} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-xs font-bold text-amber-700 mb-1">Tabela necessária no Supabase</p>
            <p className="text-xs text-amber-600 mb-2">Execute o SQL abaixo no Supabase para habilitar o salvamento de configurações.</p>
            <button onClick={() => setShowSql(v => !v)}
              className="text-xs font-bold text-amber-700 hover:text-amber-900 flex items-center gap-1">
              <ChevronRight size={11} className={`transition-transform ${showSql ? 'rotate-90' : ''}`} />
              {showSql ? 'Ocultar SQL' : 'Ver SQL'}
            </button>
            {showSql && (
              <pre className="mt-2 text-[10px] bg-white border border-amber-200 rounded-lg p-3 overflow-x-auto text-gray-700 whitespace-pre-wrap">
                {SQL_NOTICE}
              </pre>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1.5">Nome da empresa</label>
          <input value={config.nome_empresa ?? ''} onChange={e => setConfig(p => ({ ...p, nome_empresa: e.target.value }))}
            placeholder="Ex: Sync Studios"
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary" />
        </div>
        <div>
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1.5">Fuso horário</label>
          <select value={config.fuso_horario ?? ''} onChange={e => setConfig(p => ({ ...p, fuso_horario: e.target.value }))}
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary bg-white">
            <option value="America/Sao_Paulo">America/Sao_Paulo (GMT-3)</option>
            <option value="America/Manaus">America/Manaus (GMT-4)</option>
            <option value="America/Belem">America/Belém (GMT-3)</option>
            <option value="America/New_York">America/New_York (GMT-5)</option>
            <option value="Europe/Lisbon">Europe/Lisbon (GMT+0)</option>
            <option value="UTC">UTC</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1.5">Formato de data</label>
          <select value={config.formato_data ?? ''} onChange={e => setConfig(p => ({ ...p, formato_data: e.target.value }))}
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary bg-white">
            <option value="dd/MM/yyyy">dd/MM/yyyy (ex: 07/05/2026)</option>
            <option value="MM/dd/yyyy">MM/dd/yyyy (ex: 05/07/2026)</option>
            <option value="yyyy-MM-dd">yyyy-MM-dd (ex: 2026-05-07)</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1.5">Moeda</label>
          <select value={config.moeda ?? ''} onChange={e => setConfig(p => ({ ...p, moeda: e.target.value }))}
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary bg-white">
            <option value="BRL">BRL — Real Brasileiro (R$)</option>
            <option value="USD">USD — Dólar Americano ($)</option>
            <option value="EUR">EUR — Euro (€)</option>
          </select>
        </div>

        <button onClick={handleSave} disabled={saving}
          className="w-full bg-primary text-white rounded-xl py-2.5 text-sm font-bold hover:bg-primary-dark disabled:opacity-60 transition-colors flex items-center justify-center gap-2">
          {saving ? <><Loader2 size={14} className="animate-spin" /> Salvando…</> : 'Salvar configurações'}
        </button>
      </div>
    </div>
  )
}

/* ─── Usuários Tab ──────────────────────────────── */
function UsuariosTab({ addToast }: { addToast: (type: 'success' | 'error', msg: string) => void }) {
  const [users, setUsers] = useState<UserRecord[]>([])
  const [showModal, setShowModal] = useState(false)
  const [newNome, setNewNome] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newRole, setNewRole] = useState<'admin' | 'operador'>('operador')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('config').select('valor').eq('chave', 'usuarios').maybeSingle()
      .then(({ data }) => {
        if (data?.valor) setUsers(data.valor as UserRecord[])
      })
  }, [])

  async function saveUsers(list: UserRecord[]) {
    await supabase.from('config').upsert(
      { chave: 'usuarios', valor: list, atualizado_em: new Date().toISOString() },
      { onConflict: 'chave' }
    )
    setUsers(list)
  }

  async function addUser() {
    if (!newNome.trim() || !newEmail.trim()) return
    setSaving(true)
    const newUser: UserRecord = {
      id: crypto.randomUUID(),
      nome: newNome.trim(),
      email: newEmail.trim(),
      role: newRole,
    }
    const updated = [...users, newUser]
    await saveUsers(updated)
    addToast('success', 'Usuário adicionado!')
    setNewNome(''); setNewEmail(''); setNewRole('operador'); setShowModal(false)
    setSaving(false)
  }

  async function removeUser(id: string) {
    const updated = users.filter(u => u.id !== id)
    await saveUsers(updated)
    addToast('success', 'Usuário removido')
  }

  const ROLE_LABELS = { admin: 'Admin', operador: 'Operador' }
  const ROLE_COLORS = { admin: 'bg-purple-100 text-purple-700', operador: 'bg-blue-100 text-blue-700' }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-base font-black text-gray-900 tracking-wide uppercase">Gestão de Usuários</h2>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 bg-primary text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-primary-dark transition-colors">
          <Plus size={13} /> Adicionar Usuário
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              {['', 'Nome', 'Email', 'Perfil', 'Ações'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                <td className="px-4 py-3">
                  <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white text-xs font-bold">
                    {u.nome[0].toUpperCase()}
                  </div>
                </td>
                <td className="px-4 py-3 text-sm font-semibold text-gray-900">{u.nome}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{u.email}</td>
                <td className="px-4 py-3">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${ROLE_COLORS[u.role]}`}>
                    {ROLE_LABELS[u.role]}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => removeUser(u.id)}
                    className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-500 transition-colors">
                    <X size={13} />
                  </button>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center py-10 text-gray-400 text-sm">
                  Nenhum usuário adicionado
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400 mt-3">
        * Os usuários são gerenciados localmente. Para criar usuários com acesso ao sistema, use o painel do Supabase.
      </p>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-sm font-bold text-gray-900">Adicionar Usuário</h3>
              <button onClick={() => setShowModal(false)} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400">
                <X size={15} />
              </button>
            </div>
            <div className="px-6 py-4 space-y-3">
              <input value={newNome} onChange={e => setNewNome(e.target.value)} autoFocus
                placeholder="Nome completo *"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary" />
              <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)}
                placeholder="Email *"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary" />
              <select value={newRole} onChange={e => setNewRole(e.target.value as 'admin' | 'operador')}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary bg-white">
                <option value="operador">Operador</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
              <button onClick={() => setShowModal(false)}
                className="flex-1 border border-gray-200 text-gray-600 rounded-xl py-2.5 text-sm font-medium hover:bg-gray-50">
                Cancelar
              </button>
              <button onClick={addUser} disabled={saving || !newNome.trim() || !newEmail.trim()}
                className="flex-1 bg-primary text-white rounded-xl py-2.5 text-sm font-bold hover:bg-primary-dark disabled:opacity-60">
                {saving ? 'Adicionando…' : 'Adicionar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── Evolution API Tab ─────────────────────────── */
function EvolutionTab({ addToast }: { addToast: (type: 'success' | 'error', msg: string) => void }) {
  const [url, setUrl] = useState('https://evolution-evolution-api.ojjpm7.easypanel.host')
  const [apiKey, setApiKey] = useState('429683C4C977415CAAFCCE10F7D57E11')
  const [instancia, setInstancia] = useState('Teste')
  const [showKey, setShowKey] = useState(false)
  const [connStatus, setConnStatus] = useState<'idle' | 'testing' | 'connected' | 'error'>('idle')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('config').select('valor').eq('chave', 'evolution_api').maybeSingle()
      .then(({ data }) => {
        if (data?.valor) {
          const v = data.valor as EvolutionConfig
          if (v.url) setUrl(v.url)
          if (v.api_key) setApiKey(v.api_key)
          if (v.instancia) setInstancia(v.instancia)
        }
      })
  }, [])

  async function testConnection() {
    setConnStatus('testing')
    try {
      const r = await fetch(`${url}/instance/fetchInstances`, {
        headers: { apikey: apiKey },
      })
      if (r.ok) {
        setConnStatus('connected')
        addToast('success', 'Conectado com sucesso ✓')
      } else {
        setConnStatus('error')
        addToast('error', `Erro de conexão — HTTP ${r.status}`)
      }
    } catch (err) {
      setConnStatus('error')
      addToast('error', 'Erro de conexão — verifique a URL e a API Key')
    }
  }

  async function handleSave() {
    setSaving(true)
    const { error } = await supabase.from('config').upsert(
      {
        chave: 'evolution_api',
        valor: { url, api_key: apiKey, instancia } as EvolutionConfig,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: 'chave' }
    )
    if (error) addToast('error', 'Erro ao salvar: ' + error.message)
    else addToast('success', 'Configurações da Evolution API salvas!')
    setSaving(false)
  }

  return (
    <div className="max-w-lg">
      <h2 className="text-base font-black text-gray-900 mb-6 tracking-wide uppercase">Evolution API</h2>

      <div className="space-y-4">
        <div>
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1.5">
            URL da API
          </label>
          <input value={url} onChange={e => setUrl(e.target.value)}
            placeholder="https://sua-evolution-api.exemplo.com"
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary font-mono" />
        </div>

        <div>
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1.5">
            API Key
          </label>
          <div className="relative">
            <input type={showKey ? 'text' : 'password'} value={apiKey} onChange={e => setApiKey(e.target.value)}
              placeholder="Sua API Key"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary font-mono pr-10" />
            <button type="button" onClick={() => setShowKey(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>

        <div>
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1.5">
            Nome da Instância
          </label>
          <input value={instancia} onChange={e => setInstancia(e.target.value)}
            placeholder="Teste"
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary" />
        </div>

        {/* Status indicator */}
        {connStatus !== 'idle' && (
          <div className={`flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm font-semibold ${
            connStatus === 'connected' ? 'bg-green-50 text-green-700 border border-green-200'
              : connStatus === 'error' ? 'bg-red-50 text-red-700 border border-red-200'
              : 'bg-gray-50 text-gray-600 border border-gray-200'
          }`}>
            {connStatus === 'testing' && <Loader2 size={14} className="animate-spin" />}
            {connStatus === 'connected' && <Check size={14} />}
            {connStatus === 'error' && <AlertCircle size={14} />}
            {connStatus === 'testing' ? 'Testando conexão…'
              : connStatus === 'connected' ? 'Conectado com sucesso'
              : 'Falha na conexão — verifique URL e API Key'}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button onClick={testConnection} disabled={connStatus === 'testing'}
            className="flex-1 border-2 border-primary text-primary rounded-xl py-2.5 text-sm font-bold hover:bg-primary/5 disabled:opacity-60 transition-colors flex items-center justify-center gap-2">
            {connStatus === 'testing'
              ? <><Loader2 size={14} className="animate-spin" /> Testando…</>
              : '⚡ Testar Conexão'}
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 bg-primary text-white rounded-xl py-2.5 text-sm font-bold hover:bg-primary-dark disabled:opacity-60 transition-colors flex items-center justify-center gap-2">
            {saving ? <><Loader2 size={14} className="animate-spin" /> Salvando…</> : 'Salvar'}
          </button>
        </div>
      </div>

      {/* Info boxes */}
      <div className="mt-6 space-y-3">
        <div className="bg-gray-50 border border-gray-100 rounded-xl p-4">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Supabase URL</p>
          <p className="text-xs font-mono text-gray-700 break-all">https://tsluxdsckwzvcnjwzelu.supabase.co</p>
        </div>
        <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 space-y-2">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Endpoints configurados</p>
          <div className="text-xs text-gray-600 space-y-1">
            <p>• <code className="text-primary">/message/sendText/{'{instancia}'}</code> — Enviar texto</p>
            <p>• <code className="text-primary">/message/sendWhatsAppAudio/{'{instancia}'}</code> — Enviar áudio</p>
            <p>• <code className="text-primary">/message/sendMedia/{'{instancia}'}</code> — Enviar mídia</p>
            <p>• <code className="text-primary">/chat/getBase64FromMediaMessage/{'{instancia}'}</code> — Buscar mídia</p>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── Main Page ─────────────────────────────────── */
export default function ConfiguracoesPage() {
  const [tab, setTab] = useState<SideTab>('perfil')
  const [toasts, setToasts] = useState<Toast[]>([])
  const toastId = useRef(0)

  function addToast(type: 'success' | 'error', message: string) {
    const id = ++toastId.current
    setToasts(prev => [...prev, { id, type, message }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000)
  }

  function removeToast(id: number) {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  const NAV: { id: SideTab; label: string; icon: string; section?: string }[] = [
    { id: 'perfil', label: 'Perfil', icon: '👤', section: 'Conta' },
    { id: 'geral', label: 'Configurações Gerais', icon: '⚙️', section: 'Área de trabalho' },
    { id: 'usuarios', label: 'Gestão de Usuários', icon: '👥' },
    { id: 'evolution', label: 'Evolution API', icon: '💬', section: 'Integrações' },
  ]

  return (
    <div className="flex h-full">
      {/* ── Internal Sidebar ── */}
      <div className="w-52 border-r border-gray-200 bg-white flex flex-col flex-shrink-0 overflow-y-auto">
        <div className="px-4 py-4 border-b border-gray-100 flex-shrink-0">
          <p className="text-xs font-black text-gray-800 tracking-widest uppercase">Configurações</p>
        </div>
        <nav className="flex-1 py-2 px-2">
          {NAV.map((item, i) => {
            const prevSection = i > 0 ? NAV[i - 1].section : undefined
            const showSection = item.section && item.section !== prevSection
            return (
              <div key={item.id}>
                {showSection && (
                  <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest px-3 py-2 mt-2">
                    {item.section}
                  </p>
                )}
                {!showSection && i > 0 && !item.section && (
                  <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest px-3 py-2 mt-2 opacity-0">
                    ‌
                  </p>
                )}
                <button onClick={() => setTab(item.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-semibold mb-0.5 transition-colors flex items-center gap-2.5 ${
                    tab === item.id
                      ? 'bg-primary/10 text-primary'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800'
                  }`}>
                  <span className="text-base">{item.icon}</span>
                  <span className="leading-tight">{item.label}</span>
                </button>
              </div>
            )
          })}
        </nav>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto p-8">
        {tab === 'perfil' && <PerfilTab addToast={addToast} />}
        {tab === 'geral' && <GeralTab addToast={addToast} />}
        {tab === 'usuarios' && <UsuariosTab addToast={addToast} />}
        {tab === 'evolution' && <EvolutionTab addToast={addToast} />}
      </div>

      {/* Toasts */}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  )
}
