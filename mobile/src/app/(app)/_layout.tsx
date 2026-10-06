import { Stack } from 'expo-router'
import { useSettleReminders } from '@/features/groups/hooks/useSettleReminders'
import { useReceiptQueue } from '@/features/receipts/hooks/useReceiptQueue'
import { useDeviceNotifications } from '@m/features/notifications/useDeviceNotifications'
import { useRecurringRunner } from '@m/features/recurring/useRecurringRunner'
import { GlobalDialogHost } from '@m/features/shell/GlobalDialogHost'
import { QuickAddButton } from '@m/features/shell/QuickAddButton'
import { useColors } from '@m/theme/ThemeProvider'

/** The signed-in app: background work, the screens, the "+" button and global dialogs. */
export default function AppLayout() {
  useRecurringRunner()
  useReceiptQueue()
  useSettleReminders()
  useDeviceNotifications()
  const c = useColors()

  return (
    <>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: c.card },
          headerTintColor: c.foreground,
          headerTitleStyle: { color: c.foreground },
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: c.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="accounts" options={{ title: 'Accounts' }} />
        <Stack.Screen name="categories" options={{ title: 'Categories' }} />
        <Stack.Screen name="recurring" options={{ title: 'Recurring' }} />
        <Stack.Screen name="budget/[budgetId]" options={{ title: 'Budget' }} />
        <Stack.Screen name="group/[groupId]" options={{ title: 'Group' }} />
        <Stack.Screen name="join/[token]" options={{ title: 'Join group' }} />
        <Stack.Screen name="reports" options={{ title: 'Reports' }} />
        <Stack.Screen name="data/index" options={{ title: 'Import & export' }} />
        <Stack.Screen name="data/import" options={{ title: 'Import CSV' }} />
        <Stack.Screen name="profile" options={{ title: 'Profile' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
      </Stack>
      <QuickAddButton />
      <GlobalDialogHost />
    </>
  )
}
