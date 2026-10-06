import { router, type Href } from 'expo-router'
import { Bell, CheckCheck } from 'lucide-react-native'
import { useMemo } from 'react'
import { FlatList, Pressable, StyleSheet, View } from 'react-native'
import { useUid } from '@/features/auth/hooks'
import type { AppNotification } from '@/features/notifications/api'
import { useUserSettings } from '@/features/settings/hooks'
import { useToast } from '@/features/ui/hooks'
import { listPadding } from '@m/components/Screen'
import { Button } from '@m/components/ui/Button'
import { EmptyState, ErrorState, ListSkeleton } from '@m/components/ui/ListStates'
import { Text } from '@m/components/ui/Text'
import { radius } from '@m/theme/colors'
import { useColors } from '@m/theme/ThemeProvider'
import { mobilePath } from '../shell/links'
import { INBOX_LIMIT, useGetInboxQuery, useSetNotificationsReadMutation } from './api'
import { relativeTime } from './time'

export function NotificationsScreen() {
  const uid = useUid()
  const c = useColors()
  const toast = useToast()
  const { locale } = useUserSettings()
  const { data, error, isLoading, isFetching, refetch } = useGetInboxQuery(uid)
  const [setRead, { isLoading: marking }] = useSetNotificationsReadMutation()
  const unread = useMemo(() => (data ?? []).filter((n) => !n.read).map((n) => n.id), [data])
  const now = new Date()

  async function mark(ids: string[], read: boolean) {
    if (ids.length === 0) return
    const result = await setRead({ uid, ids, read })
    if ('error' in result) {
      toast({
        title: 'Could not update the notifications',
        description: String(result.error),
        variant: 'error',
      })
    }
  }

  function open(n: AppNotification) {
    if (!n.read) void mark([n.id], true)
    const path = n.link ? mobilePath(n.link) : null
    if (path) router.push(path as Href)
  }

  if (isLoading) {
    return (
      <View style={[styles.flex, { backgroundColor: c.background, padding: 16 }]}>
        <ListSkeleton label="Loading notifications" />
      </View>
    )
  }
  if (error) {
    return (
      <View style={[styles.flex, { backgroundColor: c.background, padding: 16 }]}>
        <ErrorState
          title="Could not load your notifications"
          message={String(error)}
          onRetry={() => void refetch()}
        />
      </View>
    )
  }

  return (
    <FlatList
      style={[styles.flex, { backgroundColor: c.background }]}
      contentContainerStyle={[listPadding, styles.list]}
      data={data ?? []}
      keyExtractor={(n) => n.id}
      refreshing={isFetching && !isLoading}
      onRefresh={() => void refetch()}
      accessibilityLabel="Notifications"
      ListHeaderComponent={
        unread.length > 0 ? (
          <View style={styles.header}>
            <Text variant="small" tone="muted" style={styles.flex}>
              {unread.length} unread
            </Text>
            <Button
              title="Mark all read"
              icon={CheckCheck}
              size="sm"
              variant="outline"
              loading={marking}
              onPress={() => void mark(unread, true)}
            />
          </View>
        ) : null
      }
      ListEmptyComponent={
        <EmptyState
          icon={Bell}
          title="No notifications"
          description="Budget alerts, bill reminders and settle-up reminders show here."
        />
      }
      ListFooterComponent={
        (data?.length ?? 0) >= INBOX_LIMIT ? (
          <Text variant="caption" tone="muted" align="center">
            Showing the latest {INBOX_LIMIT}.
          </Text>
        ) : null
      }
      renderItem={({ item: n }) => {
        const when = relativeTime(n.createdAt, now, locale)
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${n.read ? '' : 'Unread. '}${n.title}. ${n.body}. ${when}`}
            accessibilityHint={n.link ? 'Opens what it is about' : undefined}
            accessibilityActions={[
              { name: 'toggleRead', label: n.read ? 'Mark as unread' : 'Mark as read' },
            ]}
            onAccessibilityAction={() => void mark([n.id], !n.read)}
            onPress={() => open(n)}
            onLongPress={() => void mark([n.id], !n.read)}
            style={({ pressed }) => [
              styles.item,
              {
                borderColor: c.border,
                backgroundColor: pressed ? c.accent : n.read ? c.card : c.muted,
              },
            ]}
          >
            <View style={[styles.dot, { backgroundColor: n.read ? 'transparent' : c.primary }]} />
            <View style={styles.flex}>
              <Text weight={n.read ? '500' : '700'}>{n.title}</Text>
              {n.body ? (
                <Text variant="small" tone="muted">
                  {n.body}
                </Text>
              ) : null}
              <Text variant="caption" tone="muted">
                {when}
              </Text>
            </View>
          </Pressable>
        )
      }}
      ListHeaderComponentStyle={styles.headerWrap}
    />
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  list: { gap: 8 },
  headerWrap: { marginBottom: 4 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  item: {
    flexDirection: 'row',
    gap: 10,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 12,
  },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 7 },
})
