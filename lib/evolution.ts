const BASE_URL = process.env.NEXT_PUBLIC_EVOLUTION_URL!
const API_KEY = process.env.NEXT_PUBLIC_EVOLUTION_KEY!
const INSTANCE = process.env.NEXT_PUBLIC_EVOLUTION_INSTANCE!

export async function sendTextMessage(number: string, text: string) {
  const res = await fetch(`${BASE_URL}/message/sendText/${INSTANCE}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: API_KEY,
    },
    body: JSON.stringify({ number, text }),
  })
  if (!res.ok) throw new Error('Falha ao enviar mensagem')
  return res.json()
}
