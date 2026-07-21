/**
 * BrandMark — Logo NexSac
 * Círculo com gradiente verde→violet→azul + bolha de chat com pulse line.
 * Props 'color' e 'strokeWidth' são ignoradas (mantidas só por backwards-compat
 * com chamadas antigas no codebase).
 */
export default function BrandMark({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" aria-label="NexSac">
      <defs>
        <linearGradient id="cs-ring" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"  stopColor="#10B981" />
          <stop offset="50%" stopColor="#8B5CF6" />
          <stop offset="100%" stopColor="#3B82F6" />
        </linearGradient>
      </defs>
      {/* Anel com gradiente */}
      <circle cx="50" cy="50" r="48" fill="url(#cs-ring)" />
      {/* Bolha de chat (branca, com cauda no canto inferior esquerdo) */}
      <path
        d="M50 17
           C 32 17, 18 31, 18 49
           C 18 60, 24 70, 33 75
           L 28 88
           C 27 90, 30 92, 32 90
           L 47 80
           C 48 80, 49 80, 50 80
           C 68 80, 82 67, 82 49
           C 82 31, 68 17, 50 17 Z"
        fill="#fff"
      />
      {/* Linha de pulse */}
      <path
        d="M30 51
           L 41 51
           L 46 41
           L 51 63
           L 57 38
           L 62 51
           L 72 51"
        stroke="#2563EB"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}
