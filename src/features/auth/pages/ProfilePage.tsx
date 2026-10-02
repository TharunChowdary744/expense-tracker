import { Button } from '@/components/ui/button'
import { useSignOutMutation } from '../api'
import { ChangePasswordForm } from '../components/ChangePasswordForm'
import { ProfileForm } from '../components/ProfileForm'
import { useAuth } from '../hooks'

export function ProfilePage() {
  const { user } = useAuth()
  const [signOut, { isLoading }] = useSignOutMutation()
  if (!user) return null

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
      <ProfileForm user={user} />
      <ChangePasswordForm user={user} />
      <section
        aria-labelledby="session-heading"
        className="space-y-3 rounded-xl border bg-card p-5"
      >
        <h2 id="session-heading" className="text-lg font-semibold">
          Sign out
        </h2>
        <p className="text-sm text-muted-foreground">
          Signing out ends your session on this browser. &ldquo;Sign out of all tabs&rdquo; also
          sends every other open Ledgerly tab straight to the sign-in screen.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={isLoading} onClick={() => signOut()}>
            Sign out
          </Button>
          <Button variant="outline" disabled={isLoading} onClick={() => signOut({ allTabs: true })}>
            Sign out of all tabs
          </Button>
        </div>
      </section>
    </div>
  )
}
