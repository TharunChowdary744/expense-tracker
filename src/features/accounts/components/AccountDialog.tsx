import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { useUid } from '@/features/auth/hooks'
import { useUserSettings } from '@/features/settings/hooks'
import { useToast } from '@/features/ui/hooks'
import { useCreateAccountMutation, useUpdateAccountMutation } from '../api'
import type { AccountFormValues } from '../schemas'
import type { Account } from '../types'
import { AccountForm } from './AccountForm'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Edit this account; omit to create a new one. */
  account?: Account
}

export function AccountDialog({ open, onOpenChange, account }: Props) {
  const uid = useUid()
  const toast = useToast()
  const { baseCurrency, locale } = useUserSettings()
  const [createAccount] = useCreateAccountMutation()
  const [updateAccount] = useUpdateAccountMutation()

  async function onSubmit(values: AccountFormValues): Promise<string | null> {
    const result = account
      ? await updateAccount({ uid, id: account.id, values })
      : await createAccount({ uid, values })
    if ('error' in result) return String(result.error)
    toast({ title: account ? 'Account saved' : 'Account created', variant: 'success' })
    onOpenChange(false)
    return null
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogTitle className="text-lg font-semibold">
          {account ? 'Edit account' : 'New account'}
        </DialogTitle>
        <DialogDescription className="text-sm text-muted-foreground">
          {account
            ? 'Changes apply everywhere this account is used.'
            : 'Add a bank account, card, wallet or cash you want to track.'}
        </DialogDescription>
        {/* Remount per open so the form starts from the right values. */}
        {open && (
          <AccountForm
            key={account?.id ?? 'new'}
            account={account}
            defaultCurrency={baseCurrency}
            locale={locale}
            onSubmit={onSubmit}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
