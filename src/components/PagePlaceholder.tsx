import type { LucideIcon } from 'lucide-react'

interface Props {
  title: string
  description: string
  icon: LucideIcon
}

export function PagePlaceholder({ title, description, icon: Icon }: Props) {
  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-10 text-center">
        <Icon className="size-10 text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </section>
  )
}
