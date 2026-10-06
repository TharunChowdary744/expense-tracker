import { router } from 'expo-router'
import { ChevronRight, Link2, Plus, Users } from 'lucide-react-native'
import { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { useUid } from '@/features/auth/hooks'
import { useGetGroupsQuery } from '@/features/groups/api'
import { useGroupBalances } from '@/features/groups/hooks/useGroupBalances'
import { balancePhrase } from '@/features/groups/utils'
import { useUserSettings } from '@/features/settings/hooks'
import { Screen } from '@m/components/Screen'
import { Button } from '@m/components/ui/Button'
import { Dialog } from '@m/components/ui/Dialog'
import { TextField } from '@m/components/ui/Field'
import { EmptyState, ErrorState, ListSkeleton } from '@m/components/ui/ListStates'
import { Text } from '@m/components/ui/Text'
import { radius } from '@m/theme/colors'
import { useColors } from '@m/theme/ThemeProvider'
import { GroupSheet } from './GroupForm'
import { inviteTokenFrom } from './invites'

export function GroupsScreen() {
  const uid = useUid()
  const c = useColors()
  const { locale } = useUserSettings()
  const { data: groups, error, isLoading, isFetching, refetch } = useGetGroupsQuery(uid)
  const balances = useGroupBalances(uid, groups)
  const [creating, setCreating] = useState(false)
  const [joining, setJoining] = useState(false)

  const addButton = <Button title="New group" icon={Plus} onPress={() => setCreating(true)} />

  return (
    <Screen refreshing={isFetching && !isLoading} onRefresh={() => void refetch()}>
      <View style={styles.top}>
        <Button
          title="Join with a link"
          icon={Link2}
          variant="outline"
          onPress={() => setJoining(true)}
        />
        {addButton}
      </View>
      {isLoading ? (
        <ListSkeleton label="Loading groups" />
      ) : error ? (
        <ErrorState
          title="Could not load your groups"
          message={String(error)}
          onRetry={() => void refetch()}
        />
      ) : !groups || groups.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No groups yet"
          description="Create a group for a trip, your flat or a dinner, then invite people with a link."
          action={addButton}
        />
      ) : (
        <View accessibilityLabel="Groups" style={styles.list}>
          {groups.map((group) => {
            const balance = balances.get(group.id)
            const net = balance?.net.get(uid) ?? 0
            const phrase = balance?.loading
              ? 'Loading balance…'
              : balance?.error
                ? 'Balance unavailable'
                : balancePhrase(net, group.currency, locale)
            return (
              <Pressable
                key={group.id}
                accessibilityRole="button"
                accessibilityLabel={`${group.name}, ${group.memberIds.length} members, ${phrase}`}
                onPress={() =>
                  router.push({ pathname: '/group/[groupId]', params: { groupId: group.id } })
                }
                style={({ pressed }) => [
                  styles.row,
                  { borderColor: c.border, backgroundColor: pressed ? c.accent : c.card },
                ]}
              >
                <View style={[styles.cover, { backgroundColor: c.muted }]}>
                  <Text style={styles.emoji}>{group.emoji}</Text>
                </View>
                <View style={styles.text}>
                  <Text weight="600" numberOfLines={1}>
                    {group.name}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {group.memberIds.length} member{group.memberIds.length === 1 ? '' : 's'} ·{' '}
                    {group.currency}
                  </Text>
                </View>
                <Text
                  variant="small"
                  align="right"
                  tone={
                    balance?.loading || balance?.error || net === 0
                      ? 'muted'
                      : net < 0
                        ? 'destructive'
                        : 'success'
                  }
                  style={styles.balance}
                >
                  {phrase}
                </Text>
                <ChevronRight size={16} color={c.mutedForeground} />
              </Pressable>
            )
          })}
        </View>
      )}
      <GroupSheet open={creating} onClose={() => setCreating(false)} />
      <JoinWithLinkDialog open={joining} onClose={() => setJoining(false)} />
    </Screen>
  )
}

/** Paste an invite link (from the web app, an email or a chat) to open it here. */
function JoinWithLinkDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  function go() {
    const token = inviteTokenFrom(text)
    if (!token) {
      setError('That doesn’t look like a Ledgerly invite link.')
      return
    }
    setText('')
    setError(null)
    onClose()
    router.push({ pathname: '/join/[token]', params: { token } })
  }
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Join a group"
      description="Paste the invite link someone sent you."
      actions={
        <>
          <Button title="Cancel" variant="secondary" onPress={onClose} />
          <Button title="Open invite" onPress={go} />
        </>
      }
    >
      <TextField
        label="Invite link"
        value={text}
        onChangeText={(v) => {
          setText(v)
          setError(null)
        }}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="https://…/join/…"
        error={error ?? undefined}
        onSubmitEditing={go}
      />
    </Dialog>
  )
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' },
  list: { gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 12,
  },
  cover: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { fontSize: 22, lineHeight: 28 },
  text: { flex: 1, minWidth: 0 },
  balance: { maxWidth: 130 },
})
