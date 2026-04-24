const BASE_URL = process.env.NEXT_PUBLIC_EVOLUTION_URL!
const API_KEY = process.env.NEXT_PUBLIC_EVOLUTION_KEY!
const INSTANCE = process.env.NEXT_PUBLIC_EVOLUTION_INSTANCE!

export async function sendTextMessage(number: string, text: string) {
  const res = await fetch(`${BASE_URL}/message/sendText/${INSTANCE}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: API_KEY },
    body: JSON.stringify({ number, text }),
  })
  if (!res.ok) throw new Error('Falha ao enviar mensagem')
  return res.json()
}

/**
 * Busca base64 de qualquer mídia (áudio, imagem, documento) pelo ID da mensagem.
 * Inclui fromMe: false e remoteJid para máxima compatibilidade com a Evolution API.
 */
export async function getMediaBase64(messageId: string, telefone?: string): Promise<string | null> {
  try {
    const key: Record<string, unknown> = { id: messageId, fromMe: false }
    if (telefone) {
      const digits = telefone.replace(/\D/g, '')
      key.remoteJid = `${digits}@s.whatsapp.net`
    }
    const res = await fetch(`${BASE_URL}/chat/getBase64FromMediaMessage/${INSTANCE}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: API_KEY },
      body: JSON.stringify({ message: { key } }),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.base64 ?? data.mediaUrl ?? null
  } catch {
    return null
  }
}

/** @deprecated Use getMediaBase64 — mantido para compatibilidade com AudioPlayer */
export const getAudioBase64 = getMediaBase64

/** Envia mensagem de áudio (PTT) via Evolution API */
export async function sendAudioMessage(number: string, audioBase64: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/message/sendWhatsAppAudio/${INSTANCE}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: API_KEY },
    body: JSON.stringify({ number, audio: audioBase64, encoding: true }),
  })
  if (!res.ok) throw new Error('Falha ao enviar áudio')
}

/** Envia imagem via Evolution API */
export async function sendMediaMessage(number: string, mediaBase64: string, caption?: string): Promise<void> {
  // Remove prefixo data:…;base64, se presente
  const media = mediaBase64.includes(',') ? mediaBase64.split(',')[1] : mediaBase64
  const res = await fetch(`${BASE_URL}/message/sendMedia/${INSTANCE}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: API_KEY },
    body: JSON.stringify({ number, mediatype: 'image', media, caption: caption ?? '' }),
  })
  if (!res.ok) throw new Error('Falha ao enviar imagem')
}
