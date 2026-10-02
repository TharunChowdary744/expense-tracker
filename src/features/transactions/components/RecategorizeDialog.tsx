import { useState } from 'react'
import { SelectField } from '@/components/form/SelectField'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import type { Category } from '@/features/categories/types'
import { categoryPickerOptions } from '@/features/categories/utils'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  count: number
  kind: 'expense' | 'income'
  categories: readonly Category[]
  /** Resolves to an error message, or null on success. `null` category = uncategorised. */
  onApply: (categoryId: string | null) => Promise<string | null>
}

export function RecategorizeDialog({
  open,
  onOpenChange,
  count,
  kind,
  categories,
  onApply,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle className="text-lg font-semibold">Change category</DialogTitle>
        <DialogDescription className="text-sm text-muted-foreground">
          Move {count} {kind === 'expense' ? 'expense' : 'income'} transaction
          {count === 1 ? '' : 's'} to another category.
        </DialogDescription>
        {open && (
          <RecategorizeForm
            kind={kind}
            categories={categories}
            onApply={onApply}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function RecategorizeForm({
  kind,
  categories,
  onApply,
  onCancel,
}: Pick<Props, 'kind' | 'categories' | 'onApply'> & { onCancel: () => void }) {
  const options = categoryPickerOptions(categories, kind)
  const [categoryId, setCategoryId] = useState(options[0]?.id ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault()
        setSaving(true)
        const message = await onApply(categoryId || null)
        setSaving(false)
        if (message) setError(message)
      }}
    >
      <SelectField
        label="New category"
        value={categoryId}
        error={error ?? undefined}
        onChange={(e) => setCategoryId(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
        <option value="">Uncategorised</option>
      </SelectField>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Change category'}
        </Button>
      </div>
    </form>
  )
}
