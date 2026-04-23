import { getInitials, getAvatarColor } from '@/lib/utils'

interface Props {
  nome: string | null
  fotoUrl: string | null
  size?: number
}

export default function ContactAvatar({ nome, fotoUrl, size = 40 }: Props) {
  if (fotoUrl) {
    return (
      <div style={{ width: size, height: size }} className="rounded-full overflow-hidden flex-shrink-0">
        <img src={fotoUrl} alt={nome ?? ''} width={size} height={size} className="w-full h-full object-cover" />
      </div>
    )
  }
  return (
    <div
      style={{ width: size, height: size, backgroundColor: getAvatarColor(nome), fontSize: size * 0.38 }}
      className="rounded-full flex items-center justify-center flex-shrink-0 text-white font-bold"
    >
      {getInitials(nome)}
    </div>
  )
}
