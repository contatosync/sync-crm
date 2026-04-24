const BASE = 'https://evolution-evolution-api.ojjpm7.easypanel.host'
const KEY = '429683C4C977415CAAFCCE10F7D57E11'
const INST = 'Teste'

export async function sendText(number: string, text: string) {
  const r = await fetch(`${BASE}/message/sendText/${INST}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: KEY },
    body: JSON.stringify({ number, text }),
  })
  if (!r.ok) throw new Error('Erro ao enviar texto')
  return r.json()
}

export async function sendAudio(number: string, audio: string) {
  const r = await fetch(`${BASE}/message/sendWhatsAppAudio/${INST}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: KEY },
    body: JSON.stringify({ number, audio, encoding: true }),
  })
  if (!r.ok) throw new Error('Erro ao enviar áudio')
}

export async function sendImage(number: string, media: string, caption?: string) {
  const b64 = media.includes(',') ? media.split(',')[1] : media
  const r = await fetch(`${BASE}/message/sendMedia/${INST}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: KEY },
    body: JSON.stringify({ number, mediatype: 'image', media: b64, caption: caption ?? '' }),
  })
  if (!r.ok) throw new Error('Erro ao enviar imagem')
}

export async function fetchMediaBase64(messageId: string, telefone: string, fromMe = false): Promise<string | null> {
  try {
    const digits = telefone.replace(/\D/g, '')
    const r = await fetch(`${BASE}/chat/getBase64FromMediaMessage/${INST}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: KEY },
      body: JSON.stringify({ message: { key: { id: messageId, remoteJid: `${digits}@s.whatsapp.net`, fromMe } } }),
    })
    if (!r.ok) return null
    const d = await r.json()
    return d.base64 ?? d.mediaUrl ?? null
  } catch { return null }
}

// Legacy aliases for backwards compat
export const sendTextMessage = sendText
export const sendAudioMessage = sendAudio
export const sendMediaMessage = (number: string, media: string, caption?: string) => sendImage(number, media, caption)
export const getMediaBase64 = fetchMediaBase64
