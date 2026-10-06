import { zodResolver } from '@hookform/resolvers/zod'
import * as Clipboard from 'expo-clipboard'
import * as Linking from 'expo-linking'
import { Check, Copy, Link2, Mail, Share2 } from 'lucide-react-native'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Share, StyleSheet, View } from 'react-native'
import { useCreateInviteMutation } from '@/features/groups/api'
import { useActor } from '@/features/groups/hooks/useActor'
import { generateInviteToken, inviteMailto, inviteUrl } from '@/features/groups/invites'
import { GROUP_MEMBER_MAX, INVITE_DAYS, inviteEmailSchema } from '@/features/groups/schemas'
import type { Group } from '@/features/groups/types'
import { actorName } from '@/features/groups/writes'
import { FormTextField } from '@m/components/form/Controlled'
import { FormMessage } from '@m/components/form/FormMessage'
import { Button } from '@m/components/ui/Button'
import { TextField } from '@m/components/ui/Field'
import { Sheet } from '@m/components/ui/Sheet'
import { Text } from '@m/components/ui/Text'
import { env } from '@m/lib/env'

/**
 * The link people open to join. With EXPO_PUBLIC_WEB_APP_URL set it is the web app's link (opens
 * for anyone, and in this app when app links are set up); otherwise the app's own scheme.
 */
export function shareableInviteUrl(token: string, webAppUrl: string = env.webAppUrl): string {
  return webAppUrl ? inviteUrl(webAppUrl, token) : Linking.createURL(`/join/${token}`)
}

type Created = { url: string; email: string | null }

export function InviteSheet({
  group,
  open,
  onClose,
}: {
  group: Group
  open: boolean
  onClose: () => void
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Invite people"
      subtitle={`${group.emoji} ${group.name}`}
    >
      <Text tone="muted">
        Invites work for {INVITE_DAYS} days. Anyone with a link invite can join; an email invite
        works once, for that address.
      </Text>
      {open ? <InviteBody group={group} /> : null}
    </Sheet>
  )
}

function InviteBody({ group }: { group: Group }) {
  const actor = useActor()
  const [createInvite, { isLoading }] = useCreateInviteMutation()
  const [created, setCreated] = useState<Created | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const full = group.memberIds.length >= GROUP_MEMBER_MAX
  const { control, handleSubmit, reset } = useForm<{ email: string }>({
    resolver: zodResolver(inviteEmailSchema),
    defaultValues: { email: '' },
  })

  async function create(email: string | null) {
    setError(null)
    setCopied(false)
    const token = generateInviteToken()
    const result = await createInvite({
      actor,
      group: { id: group.id, name: group.name, emoji: group.emoji },
      token,
      ...(email ? { email } : {}),
    })
    if ('error' in result) {
      setError(String(result.error))
      return
    }
    reset({ email: '' })
    setCreated({ url: shareableInviteUrl(token), email })
  }

  async function copy(url: string) {
    try {
      await Clipboard.setStringAsync(url)
      setCopied(true)
    } catch {
      setError('Copying failed. Select the link and copy it yourself.')
    }
  }

  async function share(url: string) {
    try {
      await Share.share({
        title: `Join ${group.name} on Ledgerly`,
        message: `${actorName(actor)} invited you to share expenses in "${group.name}" on Ledgerly: ${url}`,
      })
    } catch {
      // Dismissing the share sheet is not an error worth reporting.
    }
  }

  async function email(created: Created) {
    if (!created.email) return
    const href = inviteMailto(created.email, {
      groupName: group.name,
      inviterName: actorName(actor),
      url: created.url,
    })
    try {
      await Linking.openURL(href)
    } catch {
      setError('No email app is set up. Copy the link and send it yourself.')
    }
  }

  if (full) {
    return (
      <FormMessage kind="error">{`This group has the maximum of ${GROUP_MEMBER_MAX} members.`}</FormMessage>
    )
  }

  return (
    <View style={styles.body}>
      {error ? <FormMessage kind="error">{error}</FormMessage> : null}
      {created ? (
        <View style={styles.stack}>
          <TextField
            label={created.email ? `Invite link for ${created.email}` : 'Invite link'}
            value={created.url}
            editable={false}
            selectTextOnFocus
          />
          <View style={styles.buttons}>
            <Button
              title={copied ? 'Copied' : 'Copy link'}
              icon={copied ? Check : Copy}
              variant="outline"
              onPress={() => void copy(created.url)}
            />
            <Button
              title="Share"
              icon={Share2}
              variant="outline"
              onPress={() => void share(created.url)}
            />
            {created.email ? (
              <Button
                title="Send email"
                icon={Mail}
                variant="outline"
                onPress={() => void email(created)}
              />
            ) : null}
          </View>
          <Text variant="small" tone="muted" accessibilityLiveRegion="polite">
            {copied ? 'Link copied' : ''}
          </Text>
          <Button title="Create another invite" variant="ghost" onPress={() => setCreated(null)} />
        </View>
      ) : (
        <>
          <View style={styles.stack}>
            <Text weight="600">Share a link</Text>
            <Button
              title="Create invite link"
              icon={Link2}
              loading={isLoading}
              onPress={() => void create(null)}
              style={styles.start}
            />
          </View>
          <View style={styles.stack}>
            <FormTextField
              control={control}
              name="email"
              label="Or invite by email"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="off"
              placeholder="friend@example.com"
              hint="Only this address can use the invite. You can send it from your email app."
            />
            <Button
              title="Create email invite"
              icon={Mail}
              variant="outline"
              disabled={isLoading}
              onPress={() => void handleSubmit(({ email: address }) => create(address))()}
              style={styles.start}
            />
          </View>
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  body: { gap: 20 },
  stack: { gap: 10 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  start: { alignSelf: 'flex-start' },
})
