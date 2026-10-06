import { zodResolver } from '@hookform/resolvers/zod'
import { router } from 'expo-router'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { Pressable, StyleSheet, View } from 'react-native'
import { useCreateGroupMutation, useUpdateGroupSettingsMutation } from '@/features/groups/api'
import { useActor } from '@/features/groups/hooks/useActor'
import {
  DEFAULT_GROUP_EMOJI,
  GROUP_EMOJIS,
  GROUP_NAME_MAX,
  groupFormSchema,
  type GroupFormValues,
} from '@/features/groups/schemas'
import type { Group } from '@/features/groups/types'
import { activity } from '@/features/groups/utils'
import { actorName } from '@/features/groups/writes'
import { useUserSettings } from '@/features/settings/hooks'
import { useToast } from '@/features/ui/hooks'
import { currencyOptions } from '@/utils/currency'
import { FormSelectField, FormTextField } from '@m/components/form/Controlled'
import { FormMessage } from '@m/components/form/FormMessage'
import { Button } from '@m/components/ui/Button'
import { Sheet } from '@m/components/ui/Sheet'
import { Text } from '@m/components/ui/Text'
import { radius } from '@m/theme/colors'
import { useColors } from '@m/theme/ThemeProvider'

export function GroupForm({
  group,
  baseCurrency,
  locale,
  onSubmit,
  onCancel,
}: {
  group?: Group
  baseCurrency: string
  locale: string
  /** Resolves to an error message, or null on success. */
  onSubmit: (values: GroupFormValues) => Promise<string | null>
  onCancel: () => void
}) {
  const c = useColors()
  const [error, setError] = useState<string | null>(null)
  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<GroupFormValues>({
    resolver: zodResolver(groupFormSchema),
    defaultValues: {
      name: group?.name ?? '',
      currency: group?.currency ?? baseCurrency,
      emoji: group?.emoji ?? DEFAULT_GROUP_EMOJI,
    },
  })
  const submit = handleSubmit(async (values) => {
    setError(null)
    const message = await onSubmit(values)
    if (message) setError(message)
  })

  return (
    <View style={styles.form}>
      {error ? <FormMessage kind="error">{error}</FormMessage> : null}
      <FormTextField
        control={control}
        name="name"
        label="Name"
        maxLength={GROUP_NAME_MAX}
        placeholder="e.g. Goa trip"
        autoComplete="off"
      />
      <FormSelectField
        control={control}
        name="currency"
        label="Currency"
        searchable
        disabled={Boolean(group)}
        hint={group ? "A group's currency can't change after it is created." : undefined}
        options={currencyOptions(locale, group?.currency)}
      />
      <Controller
        control={control}
        name="emoji"
        render={({ field }) => (
          <View style={styles.emojiBlock}>
            <Text weight="600">Cover emoji</Text>
            <View
              accessibilityRole="radiogroup"
              accessibilityLabel="Cover emoji"
              style={styles.emojis}
            >
              {GROUP_EMOJIS.map((emoji) => {
                const on = field.value === emoji
                return (
                  <Pressable
                    key={emoji}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={emoji}
                    onPress={() => field.onChange(emoji)}
                    style={[
                      styles.emoji,
                      {
                        borderColor: on ? c.primary : c.border,
                        backgroundColor: on ? c.accent : 'transparent',
                      },
                    ]}
                  >
                    <Text style={styles.emojiText}>{emoji}</Text>
                  </Pressable>
                )
              })}
            </View>
          </View>
        )}
      />
      <View style={styles.actions}>
        <Button title="Cancel" variant="ghost" onPress={onCancel} />
        <Button
          title={isSubmitting ? 'Saving…' : group ? 'Save changes' : 'Create group'}
          loading={isSubmitting}
          onPress={() => void submit()}
        />
      </View>
    </View>
  )
}

/** Create a group (then open its Members tab to invite people), or edit name and emoji. */
export function GroupSheet({
  open,
  onClose,
  group,
}: {
  open: boolean
  onClose: () => void
  group?: Group
}) {
  const actor = useActor()
  const toast = useToast()
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
      onClose()
      return null
    }
    const result = await createGroup({ actor, values })
    if ('error' in result) return String(result.error)
    toast({ title: `${values.name} created`, variant: 'success' })
    onClose()
    if (result.data) {
      router.push({
        pathname: '/group/[groupId]',
        params: { groupId: result.data.id, tab: 'members' },
      })
    }
    return null
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={group ? 'Edit group' : 'New group'}
      subtitle={group ? 'Change the name or cover.' : 'You can invite people next.'}
    >
      {open ? (
        <GroupForm
          key={group?.id ?? 'new'}
          group={group}
          baseCurrency={baseCurrency}
          locale={locale}
          onSubmit={onSubmit}
          onCancel={onClose}
        />
      ) : null}
    </Sheet>
  )
}

const styles = StyleSheet.create({
  form: { gap: 16 },
  emojiBlock: { gap: 8 },
  emojis: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  emoji: {
    width: 44,
    height: 44,
    borderWidth: 1,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiText: { fontSize: 22, lineHeight: 28 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, paddingTop: 8 },
})
