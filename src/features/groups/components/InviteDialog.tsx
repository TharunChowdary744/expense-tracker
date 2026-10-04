import { zodResolver } from '@hookform/resolvers/zod'
import { Check, Copy, Link2, Mail, Share2 } from 'lucide-react'
import { useId, useState } from 'react'
import { useForm } from 'react-hook-form'
import { appPath } from '@/app/basePath'
import { FormMessage } from '@/components/form/FormMessage'
import { TextField } from '@/components/form/TextField'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useCreateInviteMutation } from '../api'
import { useActor } from '../hooks/useActor'
import { generateInviteToken, inviteMailto, inviteUrl } from '../invites'
import { INVITE_DAYS, inviteEmailSchema } from '../schemas'
import type { Group } from '../types'
import { actorName } from '../writes'

interface Props {
  group: Group
  open: boolean
  onOpenChange: (open: boolean) => void
}

type Created = { url: string; email: string | null }

export function InviteDialog({ group, open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogTitle className="text-lg font-semibold">Invite people</DialogTitle>
        <DialogDescription className="text-sm text-muted-foreground">
          Invites work for {INVITE_DAYS} days. Anyone with a link invite can join; an email invite
          works once, for that address.
        </DialogDescription>
        {open && <InviteBody group={group} />}
      </DialogContent>
    </Dialog>
  )
}

function InviteBody({ group }: { group: Group }) {
  const actor = useActor()
  const ids = useId()
  const [createInvite, { isLoading }] = useCreateInviteMutation()
  const [created, setCreated] = useState<Created | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const full = group.memberIds.length >= 20
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<{ email: string }>({
    resolver: zodResolver(inviteEmailSchema),
    defaultValues: { email: '' },
  })

  async function create(email: string | null) {
    setError(null)
    setCopied(false)
    const token = generateInviteToken()
    const result = await createInvite({
      actor,
      group: { id: group.id, name: group.name, emoji: group.emoji },
      token,
      ...(email ? { email } : {}),
    })
    if ('error' in result) {
      setError(String(result.error))
      return
    }
    setCreated({ url: inviteUrl(`${window.location.origin}${appPath('')}`, token), email })
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      setError('Copying is blocked here. Select the link and copy it yourself.')
    }
  }

  async function share(url: string) {
    try {
      await navigator.share({
        title: `Join ${group.name} on Ledgerly`,
        text: `${actorName(actor)} invited you to share expenses in "${group.name}".`,
        url,
      })
    } catch {
      // Closing the share sheet rejects; nothing to report.
    }
  }

  if (full) {
    return <FormMessage kind="error">This group has the maximum of 20 members.</FormMessage>
  }

  return (
    <div className="space-y-5">
      {error && <FormMessage kind="error">{error}</FormMessage>}

      {created ? (
        <div className="space-y-3">
          <label htmlFor={`${ids}-url`} className="text-sm font-medium">
            {created.email ? `Invite link for ${created.email}` : 'Invite link'}
          </label>
          <Input
            id={`${ids}-url`}
            readOnly
            value={created.url}
            onFocus={(e) => e.currentTarget.select()}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => void copy(created.url)}>
              {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
              {copied ? 'Copied' : 'Copy link'}
            </Button>
            {typeof navigator !== 'undefined' && 'share' in navigator && (
              <Button type="button" variant="outline" onClick={() => void share(created.url)}>
                <Share2 aria-hidden />
                Share
              </Button>
            )}
            {created.email && (
              <Button asChild variant="outline">
                <a
                  href={inviteMailto(created.email, {
                    groupName: group.name,
                    inviterName: actorName(actor),
                    url: created.url,
                  })}
                >
                  <Mail aria-hidden />
                  Send email
                </a>
              </Button>
            )}
          </div>
          <span role="status" className="sr-only">
            {copied ? 'Link copied' : ''}
          </span>
          <Button type="button" variant="ghost" onClick={() => setCreated(null)}>
            Create another invite
          </Button>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <p className="text-sm font-medium">Share a link</p>
            <Button type="button" disabled={isLoading} onClick={() => void create(null)}>
              <Link2 aria-hidden />
              Create invite link
            </Button>
          </div>
          <form
            noValidate
            className="space-y-2"
            onSubmit={handleSubmit(({ email }) => create(email))}
          >
            <TextField
              label="Or invite by email"
              type="email"
              autoComplete="off"
              placeholder="friend@example.com"
              hint="Only this address can use the invite. You can send it from your email app."
              error={errors.email?.message}
              {...register('email')}
            />
            <Button type="submit" variant="outline" disabled={isLoading}>
              <Mail aria-hidden />
              Create email invite
            </Button>
          </form>
        </>
      )}
    </div>
  )
}
