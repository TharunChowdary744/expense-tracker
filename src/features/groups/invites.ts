import type { InviteDoc } from './schemas'

/** 24 random bytes as base64url: 32 characters, unguessable, URL-safe. */
export function generateInviteToken(
  bytes: Uint8Array = crypto.getRandomValues(new Uint8Array(24)),
): string {
  let text = ''
  for (const b of bytes) text += String.fromCharCode(b)
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function inviteUrl(origin: string, token: string): string {
  return `${origin}/join/${token}`
}

export function inviteMailto(
  email: string,
  { groupName, inviterName, url }: { groupName: string; inviterName: string; url: string },
): string {
  const subject = `Join "${groupName}" on Ledgerly`
  const body = `${inviterName} invited you to share expenses in "${groupName}" on Ledgerly.\n\nOpen this link to join:\n${url}\n`
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

export type InviteStatus =
  | { kind: 'ok' }
  | { kind: 'expired' }
  | { kind: 'used' }
  | { kind: 'wrong-email'; invitedEmail: string }
  | { kind: 'unverified'; invitedEmail: string }

/**
 * Whether the signed-in user can use an invite. Link invites (no email) work for anyone until
 * they expire; email invites work once, for that verified email address.
 */
export function inviteStatus(
  invite: Pick<InviteDoc, 'expiresAt' | 'invitedEmail' | 'acceptedBy'>,
  user: { email: string | null; emailVerified: boolean },
  now: Date,
): InviteStatus {
  if (new Date(invite.expiresAt).getTime() <= now.getTime()) return { kind: 'expired' }
  if (invite.invitedEmail === null) return { kind: 'ok' }
  if (invite.acceptedBy) return { kind: 'used' }
  if ((user.email ?? '').toLowerCase() !== invite.invitedEmail) {
    return { kind: 'wrong-email', invitedEmail: invite.invitedEmail }
  }
  if (!user.emailVerified) return { kind: 'unverified', invitedEmail: invite.invitedEmail }
  return { kind: 'ok' }
}

/** Today's UTC date as yyyymmdd: the per-day key that limits reminders to one a day. */
export function reminderDayKey(now: Date): string {
  return now.toISOString().slice(0, 10).replace(/-/g, '')
}

/** users/{debtor}/notifications id for a settle-up reminder (create-once per sender per day). */
export function reminderId(groupId: string, fromUid: string, now: Date): string {
  return `remind_${groupId}_${fromUid}_${reminderDayKey(now)}`
}
