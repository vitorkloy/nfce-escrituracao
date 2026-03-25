export type BadgeTone = 'green' | 'amber' | 'red' | 'teal' | 'gray'

const TONE_CLASS: Record<BadgeTone, string> = {
  green: 'bg-blue-950/50 text-blue-300 border-blue-800/60',
  amber: 'bg-amber-900/40 text-amber-400 border-amber-800/60',
  red: 'bg-red-900/40 text-red-400 border-red-800/60',
  teal: 'bg-sky-950/50 text-sky-300 border-sky-800/60',
  gray: 'bg-zinc-800/60 text-zinc-400 border-zinc-700/60',
}

export function Badge({ tone, label }: { tone: BadgeTone; label: string }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono border ${TONE_CLASS[tone]}`}
    >
      {label}
    </span>
  )
}
