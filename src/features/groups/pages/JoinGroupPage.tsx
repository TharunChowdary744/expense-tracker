import { skipToken } from '@reduxjs/toolkit/query/react'
import { CircleAlert, Users } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { FormMessage } from '@/components/form/FormMessage'
import { ErrorState } from '@/components/ListStates'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/features/ui/hooks'
import { useGetGroupQuery, useGetInviteQuery, useJoinGroupMutation } from '../api'
import { useActor } from '../hooks/useActor'
import { inviteStatus } from '../invites'
import { inviteProblem } from '../writes'

export function JoinGroupPage() {
  const { token = '' } = useParams()
  const actor = useActor()
  const toast = useToast()
  const navigate = useNavigate()
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
    void navigate(`/groups/${result.data.groupId}`, { replace: true })
  }

  if (invite.isLoading || (groupId && existing.isLoading)) {
    return (
      <Card>
        <Skeleton className="mx-auto size-16 rounded-full" />
        <Skeleton className="mx-auto h-6 w-48" />
        <Skeleton className="mx-auto h-9 w-32" />
      </Card>
    )
  }
  if (invite.error) {
    return (
      <div className="mx-auto max-w-md">
        <ErrorState
          title="Could not open the invite"
          message={String(invite.error)}
          onRetry={() => void invite.refetch()}
        />
      </div>
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
    return (
      <Card>
        <Cover emoji={data.groupEmoji} />
        <h1 className="text-xl font-semibold">You're already in {existing.data.name}</h1>
        <Button asChild>
          <Link to={`/groups/${existing.data.id}`}>Open group</Link>
        </Button>
      </Card>
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
    <Card>
      <Cover emoji={data.groupEmoji} />
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Join {data.groupName}</h1>
        <p className="text-sm text-muted-foreground">
          {data.invitedByName || 'A member'} invited you to share expenses in this group.
        </p>
      </div>
      {error && <FormMessage kind="error">{error}</FormMessage>}
      <div className="flex justify-center gap-2">
        <Button asChild variant="ghost">
          <Link to="/groups">Not now</Link>
        </Button>
        <Button disabled={joining} onClick={() => void onJoin()}>
          <Users aria-hidden />
          {joining ? 'Joining…' : 'Join group'}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Members see your name and email, and the group's expenses and balances.
      </p>
    </Card>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="mx-auto max-w-md space-y-4 rounded-lg border bg-card p-6 text-center">
      {children}
    </section>
  )
}

function Cover({ emoji }: { emoji: string }) {
  return (
    <span
      aria-hidden
      className="mx-auto flex size-16 items-center justify-center rounded-full bg-muted text-3xl"
    >
      {emoji}
    </span>
  )
}

function Problem({ title, message }: { title: string; message: string }) {
  return (
    <Card>
      <CircleAlert className="mx-auto size-10 text-destructive" aria-hidden />
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="text-sm text-muted-foreground">{message}</p>
      <Button asChild variant="outline">
        <Link to="/groups">Go to your groups</Link>
      </Button>
    </Card>
  )
}
