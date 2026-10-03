import { Settings } from 'lucide-react'
import { PagePlaceholder } from '@/components/PagePlaceholder'

export function SettingsPage() {
  return (
    <PagePlaceholder
      title="Settings"
      description="Currency, theme and notification preferences will be configured here."
      icon={Settings}
    />
  )
}
