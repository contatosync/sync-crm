import { getInitials, getAvatarColor } from '@/lib/utils'

interface Props {
  nome: string | null
  /** @deprecated URLs do WhatsApp CDN expiram — não usado */
  fotoUrl?: string | null
  /** Seed estável para a cor — preferencialmente o telefone */
  seed?: string | null
  size?: number
}

export default function ContactAvatar({ nome, seed, size = 40 }: Props) {
  // Usa o telefone (seed) como base da cor para ser estável mesmo quando o nome muda
  const colorSeed = seed ?? nome ?? ''

  return (
    <div
      style={{
        width: size,
        height: size,
        backgroundColor: getAvatarColor(colorSeed),
        fontSize: Math.round(size * 0.36),
        flexShrink: 0,
      }}
      className="rounded-full flex items-center justify-center text-white font-bold select-none"
      aria-label={nome ?? 'Contato'}
    >
      {getInitials(nome)}
    </div>
  )
}
