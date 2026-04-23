export interface EtapaFunil {
  id: string
  nome: string
  ordem: number
  cor: string
}

export interface Contato {
  id: string
  telefone: string
  nome: string | null
  email: string | null
  origem: string | null
  status: string | null
  etapa_funil_id: string | null
  campos_custom: Record<string, unknown> | null
  observacoes: string | null
  foto_url: string | null
  criado_em: string
  atualizado_em: string
  etapa?: EtapaFunil
}

export interface Mensagem {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  /** 'audio' | 'ptt' indica mensagem de áudio; outros tipos reservados para futuro */
  media_type?: 'audio' | 'ptt' | 'image' | 'document'
  /** ID da mensagem no WhatsApp — usado para buscar mídia via Evolution API */
  message_id?: string
}

export interface Conversa {
  id: string
  telefone: string
  nome: string | null
  historico: Mensagem[]
  atualizado_em: string
  contato?: Contato
}

export interface Tarefa {
  id: string
  contato_id: string | null
  titulo: string
  descricao: string | null
  status: 'pendente' | 'concluida'
  vencimento: string | null
  criado_em: string
  contato?: Contato
}
