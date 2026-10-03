import { useNavigate } from 'react-router'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { useUserSettings } from '@/features/settings/hooks'
import { useToast } from '@/features/ui/hooks'
import { useCreateGroupMutation, useUpdateGroupSettingsMutation } from '../api'
import { useActor } from '../hooks/useActor'
import type { GroupFormValues } from '../schemas'
import type { Group } from '../types'
import { activity } from '../utils'
import { actorName } from '../writes'
import { GroupForm } from './GroupForm'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Edit this group (name and emoji); omit to create one. */
  group?: Group
}

export function GroupDialog({ open, onOpenChange, group }: Props) {
  const actor = useActor()
  const toast = useToast()
  const navigate = useNavigate()
  const { baseCurrency, locale } = useUserSettings()
  const [createGroup] = useCreateGroupMutation()
  const [updateGroup] = useUpdateGroupSettingsMutation()

  async function onSubmit(values: GroupFormValues): Promise<string | null> {
    if (group) {
      const renamed = values.name !== group.name
      const result = await updateGroup({
        actor,
        groupId: group.id,
        changes: { name: values.name, emoji: values.emoji },
        summary: renamed
          ? activity.renamed(actorName(actor), values.name)
          : activity.updated(actorName(actor)),
      })
      if ('error' in result) return String(result.error)
      toast({ title: 'Group saved', variant: 'success' })
      onOpenChange(false)
      return null
    }
    const result = await createGroup({ actor, values })
    if ('error' in result) return String(result.error)
    toast({ title: `${values.name} created`, variant: 'success' })
    onOpenChange(false)
    if (result.data) void navigate(`/groups/${result.data.id}?tab=members`)
    return null
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogTitle className="text-lg font-semibold">
          {group ? 'Edit group' : 'New group'}
        </DialogTitle>
        <DialogDescription className="text-sm text-muted-foreground">
          {group
            ? 'Change the name or cover.'
            : 'Share expenses with friends, flatmates or a trip. You can invite people next.'}
        </DialogDescription>
        {open && (
          <GroupForm
            key={group?.id ?? 'new'}
            group={group}
            baseCurrency={baseCurrency}
            locale={locale}
            onSubmit={onSubmit}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
