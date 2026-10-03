import { Delete } from 'lucide-react'
import { cn } from '@/utils/cn'

const KEYS: { key: string; label: string; aria?: string; kind?: 'op' | 'action' }[] = [
  { key: '7', label: '7' },
  { key: '8', label: '8' },
  { key: '9', label: '9' },
  { key: '÷', label: '÷', aria: 'Divide', kind: 'op' },
  { key: '4', label: '4' },
  { key: '5', label: '5' },
  { key: '6', label: '6' },
  { key: '×', label: '×', aria: 'Multiply', kind: 'op' },
  { key: '1', label: '1' },
  { key: '2', label: '2' },
  { key: '3', label: '3' },
  { key: '−', label: '−', aria: 'Minus', kind: 'op' },
  { key: '.', label: '.', aria: 'Decimal point' },
  { key: '0', label: '0' },
  { key: 'back', label: '', aria: 'Delete last character', kind: 'action' },
  { key: '+', label: '+', aria: 'Plus', kind: 'op' },
]

interface Props {
  onKey: (key: string) => void
  className?: string
}

/** Calculator-style keypad for entering amounts on touch screens. */
export function AmountKeypad({ onKey, className }: Props) {
  return (
    <div
      role="group"
      aria-label="Amount keypad"
      className={cn('grid grid-cols-4 gap-2', className)}
    >
      {KEYS.map(({ key, label, aria, kind }) => (
        <button
          key={key}
          type="button"
          aria-label={aria}
          onClick={() => onKey(key)}
          onContextMenu={(e) => {
            if (key === 'back') {
              e.preventDefault()
              onKey('clear')
            }
          }}
          className={cn(
            'flex h-12 items-center justify-center rounded-lg text-xl font-medium transition-colors outline-none select-none focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-95',
            kind === 'op' ? 'bg-secondary text-primary' : 'bg-muted hover:bg-accent',
          )}
        >
          {key === 'back' ? <Delete className="size-5" aria-hidden /> : label}
        </button>
      ))}
    </div>
  )
}
