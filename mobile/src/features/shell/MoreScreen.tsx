import { router, type Href } from 'expo-router'
import {
  ArrowLeftRight,
  Bell,
  ChartPie,
  ChevronRight,
  FolderTree,
  Repeat,
  Settings,
  UserRound,
  Wallet,
  type LucideIcon,
} from 'lucide-react-native'
import { Pressable, StyleSheet, View } from 'react-native'
import { useSignOutMutation } from '@/features/auth/api'
import { useAuth } from '@/features/auth/hooks'
import { Screen } from '@m/components/Screen'
import { Button } from '@m/components/ui/Button'
import { ListBox, SectionTitle } from '@m/components/ui/ListBox'
import { Text } from '@m/components/ui/Text'
import { useColors } from '@m/theme/ThemeProvider'
import { UserAvatar } from '../profile/ProfileScreen'

interface Item {
  href: Href
  label: string
  description: string
  icon: LucideIcon
}

const MONEY: Item[] = [
  { href: '/accounts', label: 'Accounts', description: 'Balances and net worth', icon: Wallet },
  {
    href: '/categories',
    label: 'Categories',
    description: 'Spending and income categories',
    icon: FolderTree,
  },
  {
    href: '/recurring',
    label: 'Recurring',
    description: 'Bills, subscriptions and income',
    icon: Repeat,
  },
  {
    href: '/reports',
    label: 'Reports',
    description: 'Charts, trends and comparisons',
    icon: ChartPie,
  },
  {
    href: '/data',
    label: 'Import and export',
    description: 'CSV, PDF statements and backups',
    icon: ArrowLeftRight,
  },
]

const YOU: Item[] = [
  {
    href: '/notifications',
    label: 'Notifications',
    description: 'Alerts and reminders',
    icon: Bell,
  },
  { href: '/profile', label: 'Profile', description: 'Name, photo and password', icon: UserRound },
  {
    href: '/settings',
    label: 'Settings',
    description: 'Theme, week start and notifications',
    icon: Settings,
  },
]

function Row({ item }: { item: Item }) {
  const c = useColors()
  const Icon = item.icon
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.label}
      accessibilityHint={item.description}
      onPress={() => router.push(item.href)}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: c.accent }]}
    >
      <Icon size={20} color={c.foreground} />
      <View style={styles.flex}>
        <Text weight="600">{item.label}</Text>
        <Text variant="caption" tone="muted">
          {item.description}
        </Text>
      </View>
      <ChevronRight size={16} color={c.mutedForeground} />
    </Pressable>
  )
}

/** The "More" tab: every screen that isn't a tab, plus sign out. */
export function MoreScreen() {
  const { user } = useAuth()
  const [signOut, { isLoading }] = useSignOutMutation()
  return (
    <Screen>
      {user ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Profile: ${user.displayName || user.email || ''}`}
          onPress={() => router.push('/profile')}
          style={styles.user}
        >
          <UserAvatar user={user} size={48} />
          <View style={styles.flex}>
            <Text weight="600" numberOfLines={1}>
              {user.displayName || 'Your profile'}
            </Text>
            <Text variant="small" tone="muted" numberOfLines={1}>
              {user.email}
            </Text>
          </View>
        </Pressable>
      ) : null}
      <SectionTitle>Money</SectionTitle>
      <ListBox label="Money">
        {MONEY.map((item) => (
          <Row key={item.label} item={item} />
        ))}
      </ListBox>
      <SectionTitle>You</SectionTitle>
      <ListBox label="You">
        {YOU.map((item) => (
          <Row key={item.label} item={item} />
        ))}
      </ListBox>
      <Button
        title="Sign out"
        variant="outline"
        loading={isLoading}
        onPress={() => void signOut()}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  user: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  flex: { flex: 1, minWidth: 0 },
})
