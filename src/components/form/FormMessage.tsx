interface Props {
  kind: 'error' | 'success'
  children: React.ReactNode
}

/** Form-level feedback. Errors are announced immediately; success is polite. */
export function FormMessage({ kind, children }: Props) {
  return (
    <p
      role={kind === 'error' ? 'alert' : 'status'}
      className={
        kind === 'error'
          ? 'rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive'
          : 'rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm text-success'
      }
    >
      {children}
    </p>
  )
}
