import { Tabs, router } from 'expo-router'
import { ArrowLeftRight, Bell, LayoutDashboard, Menu, Target, Users } from 'lucide-react-native'
import { StyleSheet, View } from 'react-native'
import { useUid } from '@/features/auth/hooks'
import { useGetInboxQuery } from '@m/features/notifications/api'
import { IconButton } from '@m/components/ui/Button'
import { Text } from '@m/components/ui/Text'
import { useColors } from '@m/theme/ThemeProvider'

function NotificationsButton() {
  const uid = useUid()
  const c = useColors()
  const { data } = useGetInboxQuery(uid)
  const unread = data?.filter((n) => !n.read).length ?? 0
  return (
    <View>
      <IconButton
        icon={Bell}
        label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        onPress={() => router.push('/notifications')}
      />
      {unread > 0 ? (
        <View pointerEvents="none" style={[styles.badge, { backgroundColor: c.destructive }]}>
          <Text variant="caption" style={{ color: c.destructiveForeground }}>
            {unread > 9 ? '9+' : unread}
          </Text>
        </View>
      ) : null}
    </View>
  )
}

/** Bottom tabs: the main screens, with everything else under "More". */
export default function TabsLayout() {
  const c = useColors()
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: c.card },
        headerTintColor: c.foreground,
        headerRight: () => <NotificationsButton />,
        headerRightContainerStyle: { paddingRight: 8 },
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.mutedForeground,
        tabBarStyle: { backgroundColor: c.card, borderTopColor: c.border },
        sceneStyle: { backgroundColor: c.background },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarLabel: 'Home',
          tabBarIcon: ({ color, size }) => <LayoutDashboard color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="transactions"
        options={{
          title: 'Transactions',
          tabBarIcon: ({ color, size }) => <ArrowLeftRight color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="budgets"
        options={{
          title: 'Budgets',
          tabBarIcon: ({ color, size }) => <Target color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="groups"
        options={{
          title: 'Groups',
          tabBarIcon: ({ color, size }) => <Users color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarIcon: ({ color, size }) => <Menu color={color} size={size} />,
        }}
      />
    </Tabs>
  )
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
