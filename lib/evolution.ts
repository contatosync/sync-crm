const BASE = 'https://evolution-evolution-api.ojjpm7.easypanel.host'
const KEY = '429683C4C977415CAAFCCE10F7D57E11'
const INST = 'Teste'
const H = { 'Content-Type': 'application/json', apikey: KEY }

export async function sendText(number: string, text: string) {
  const r = await fetch(`${BASE}/message/sendText/${INST}`, { method: 'POST', headers: H, body: JSON.stringify({ number, text }) })
  if (!r.ok) throw new Error('Erro ao enviar texto')
  return r.json()
}

export async function sendAudio(number: string, audio: string) {
  const r = await fetch(`${BASE}/message/sendWhatsAppAudio/${INST}`, { method: 'POST', headers: H, body: JSON.stringify({ number, audio, encoding: true }) })
  if (!r.ok) throw new Error('Erro ao enviar áudio')
}

export async function sendImage(number: string, mediaBase64: string, caption?: string) {
  const media = mediaBase64.includes(',') ? mediaBase64.split(',')[1] : mediaBase64
  const r = await fetch(`${BASE}/message/sendMedia/${INST}`, { method: 'POST', headers: H, body: JSON.stringify({ number, mediatype: 'image', media, caption: caption ?? '' }) })
  if (!r.ok) throw new Error('Erro ao enviar imagem')
}

export async function getMediaBase64(messageId: string, telefone: string, fromMe = false): Promise<string | null> {
  try {
    const digits = telefone.replace(/\D/g, '')
    const r = await fetch(`${BASE}/chat/getBase64FromMediaMessage/${INST}`, {
      method: 'POST', headers: H,
      body: JSON.stringify({ message: { key: { id: messageId, remoteJid: `${digits}@s.whatsapp.net`, fromMe } } }),
    })
    if (!r.ok) return null
    const d = await r.json()
    return d.base64 ?? d.mediaUrl ?? null
  } catch { return null }
}
