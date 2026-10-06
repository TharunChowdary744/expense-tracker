import { Wallet } from 'lucide-react-native'
import type { ReactNode } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useColors } from '@m/theme/ThemeProvider'
import { Text } from '@m/components/ui/Text'

export function AuthLayout({
  title,
  description,
  children,
  footer,
}: {
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
}) {
  const c = useColors()
  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: c.background }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.brand}>
            <View style={[styles.logo, { backgroundColor: c.primary }]}>
              <Wallet size={22} color={c.primaryForeground} />
            </View>
            <Text variant="heading">Ledgerly</Text>
          </View>
          <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text variant="title" accessibilityRole="header">
              {title}
            </Text>
            {description ? <Text tone="muted">{description}</Text> : null}
            <View style={{ gap: 14, marginTop: 8 }}>{children}</View>
          </View>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

export function Divider({ label }: { label: string }) {
  const c = useColors()
  return (
    <View style={styles.divider} accessibilityElementsHidden>
      <View style={[styles.line, { backgroundColor: c.border }]} />
      <Text variant="small" tone="muted">
        {label}
      </Text>
      <View style={[styles.line, { backgroundColor: c.border }]} />
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', padding: 20, gap: 20 },
  brand: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  logo: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  card: { borderWidth: 1, borderRadius: 16, padding: 20, gap: 6 },
  footer: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 4 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  line: { flex: 1, height: StyleSheet.hairlineWidth },
})
