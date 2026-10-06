import { useState } from 'react'
import type { Category } from '@/features/categories/types'
import { categoryPickerOptions } from '@/features/categories/utils'
import { Button } from '@m/components/ui/Button'
import { Dialog } from '@m/components/ui/Dialog'
import { SelectField } from '@m/components/ui/Select'

const NONE = '__none__'

/** Moves the selected transactions to another category (or none). */
export function RecategorizeDialog({
  open,
  onClose,
  count,
  kind,
  categories,
  onApply,
}: {
  open: boolean
  onClose: () => void
  count: number
  kind: 'expense' | 'income'
  categories: readonly Category[]
  /** Resolves to an error message, or null on success. `null` category = uncategorised. */
  onApply: (categoryId: string | null) => Promise<string | null>
}) {
  const options = categoryPickerOptions(categories, kind)
  const [categoryId, setCategoryId] = useState(options[0]?.id ?? NONE)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Change category"
      description={`Move ${count} ${kind} transaction${count === 1 ? '' : 's'} to another category.`}
      actions={
        <>
          <Button title="Cancel" variant="secondary" onPress={onClose} />
          <Button
            title={saving ? 'Saving…' : 'Change category'}
            loading={saving}
            onPress={async () => {
              setSaving(true)
              const message = await onApply(categoryId === NONE ? null : categoryId)
              setSaving(false)
              setError(message)
            }}
          />
        </>
      }
    >
      <SelectField
        label="New category"
        value={categoryId}
        error={error ?? undefined}
        onChange={setCategoryId}
        options={[
          ...options.map((o) => ({ value: o.id, label: o.label, depth: o.depth })),
          { value: NONE, label: 'Uncategorised' },
        ]}
      />
    </Dialog>
  )
}
