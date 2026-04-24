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

/** Busca base64 de uma mídia (áudio, imagem) pelo ID da mensagem no WhatsApp */
export async function getAudioBase64(messageId: string, telefone?: string): Promise<string | null> {
  try {
    const key: Record<string, string> = { id: messageId }
    if (telefone) {
      // remoteJid obrigatório pela Evolution API para localizar a mídia
      const digits = telefone.replace(/\D/g, '')
      key.remoteJid = `${digits}@s.whatsapp.net`
    }
    const res = await fetch(`${BASE_URL}/chat/getBase64FromMediaMessage/${INSTANCE}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: API_KEY },
      body: JSON.stringify({ message: { key }, convertToMp4: false }),
    })
    if (!res.ok) return null
    const data = await res.json()
    // Evolution API pode retornar { base64: "..." } ou { mediaUrl: "..." }
    return data.base64 ?? data.mediaUrl ?? null
  } catch {
    return null
  }
}

/** Envia mensagem de áudio (PTT) via Evolution API */
export async function sendAudioMessage(number: string, audioBase64: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/message/sendWhatsAppAudio/${INSTANCE}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: API_KEY },
    body: JSON.stringify({ number, audio: audioBase64, encoding: true }),
  })
  if (!res.ok) throw new Error('Falha ao enviar áudio')
}
