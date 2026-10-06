import { skipToken } from '@reduxjs/toolkit/query/react'
import { router, useLocalSearchParams } from 'expo-router'
import { CircleAlert, Users } from 'lucide-react-native'
import { useState, type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { useGetGroupQuery, useGetInviteQuery, useJoinGroupMutation } from '@/features/groups/api'
import { useActor } from '@/features/groups/hooks/useActor'
import { inviteStatus } from '@/features/groups/invites'
import { inviteProblem } from '@/features/groups/writes'
import { useToast } from '@/features/ui/hooks'
import { FormMessage } from '@m/components/form/FormMessage'
import { Screen } from '@m/components/Screen'
import { Button } from '@m/components/ui/Button'
import { Card } from '@m/components/ui/Card'
import { ErrorState, ListSkeleton } from '@m/components/ui/ListStates'
import { Text } from '@m/components/ui/Text'
import { useColors } from '@m/theme/ThemeProvider'

const toGroups = () => router.navigate('/groups')
const openGroup = (groupId: string) =>
  router.replace({ pathname: '/group/[groupId]', params: { groupId } })

export function JoinScreen() {
  const { token = '' } = useLocalSearchParams<{ token: string }>()
  const actor = useActor()
  const toast = useToast()
  const invite = useGetInviteQuery(token || skipToken)
  const groupId = invite.data?.groupId
  // Readable only by members: success means the user is already in the group.
  const existing = useGetGroupQuery(groupId ? { uid: actor.uid, groupId } : skipToken)
  const [join, { isLoading: joining }] = useJoinGroupMutation()
  const [error, setError] = useState<string | null>(null)

  async function onJoin() {
    setError(null)
    const result = await join({ actor, token })
    if ('error' in result) {
      setError(String(result.error))
      return
    }
    toast({ title: `You joined ${invite.data?.groupName ?? 'the group'}`, variant: 'success' })
    openGroup(result.data.groupId)
  }

  if (invite.isLoading || (groupId && existing.isLoading)) {
    return (
      <Screen>
        <ListSkeleton rows={2} label="Opening the invite" />
      </Screen>
    )
  }
  if (invite.error) {
    return (
      <Screen>
        <ErrorState
          title="Could not open the invite"
          message={String(invite.error)}
          onRetry={() => void invite.refetch()}
        />
      </Screen>
    )
  }
  if (!invite.data) {
    return (
      <Problem
        title="This invite link isn't valid"
        message="Check that you copied the whole link, or ask for a new one."
      />
    )
  }

  const data = invite.data
  if (existing.data) {
    const id = existing.data.id
    return (
      <Centered>
        <Cover emoji={data.groupEmoji} />
        <Text variant="heading" align="center" accessibilityRole="header">
          You’re already in {existing.data.name}
        </Text>
        <Button title="Open group" onPress={() => openGroup(id)} />
      </Centered>
    )
  }

  const status = inviteStatus(data, actor, new Date())
  if (status.kind !== 'ok') {
    return (
      <Problem
        title={inviteProblem(status.kind)}
        message={
          status.kind === 'wrong-email'
            ? `It was sent to ${status.invitedEmail}, and you're signed in as ${actor.email || 'another account'}. Sign in with that address, or ask ${data.invitedByName || 'the sender'} for a link invite.`
            : status.kind === 'unverified'
              ? `Open the verification email sent to ${status.invitedEmail}, then come back to this link.`
              : `Ask ${data.invitedByName || 'a member of the group'} to send you a new invite.`
        }
      />
    )
  }

  return (
    <Centered>
      <Cover emoji={data.groupEmoji} />
      <Text variant="heading" align="center" accessibilityRole="header">
        Join {data.groupName}
      </Text>
      <Text tone="muted" align="center">
        {data.invitedByName || 'A member'} invited you to share expenses in this group.
      </Text>
      {error ? <FormMessage kind="error">{error}</FormMessage> : null}
      <View style={styles.buttons}>
        <Button title="Not now" variant="ghost" onPress={toGroups} />
        <Button
          title={joining ? 'Joining…' : 'Join group'}
          icon={Users}
          loading={joining}
          onPress={() => void onJoin()}
        />
      </View>
      <Text variant="caption" tone="muted" align="center">
        Members see your name and email, and the group’s expenses and balances.
      </Text>
    </Centered>
  )
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <Screen>
      <Card style={styles.card}>{children}</Card>
    </Screen>
  )
}

function Cover({ emoji }: { emoji: string }) {
  const c = useColors()
  return (
    <View
      style={[styles.cover, { backgroundColor: c.muted }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Text style={styles.emoji}>{emoji}</Text>
    </View>
  )
}

function Problem({ title, message }: { title: string; message: string }) {
  const c = useColors()
  return (
    <Centered>
      <CircleAlert size={40} color={c.destructive} />
      <Text variant="heading" align="center" accessibilityRole="header">
        {title}
      </Text>
      <Text tone="muted" align="center">
        {message}
      </Text>
      <Button title="Go to your groups" variant="outline" onPress={toGroups} />
    </Centered>
  )
}

const styles = StyleSheet.create({
  card: { alignItems: 'center', gap: 14, padding: 24 },
  cover: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { fontSize: 32, lineHeight: 40 },
  buttons: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
})
