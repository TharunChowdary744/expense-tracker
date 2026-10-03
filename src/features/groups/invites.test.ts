import { describe, expect, it } from 'vitest'
import {
  generateInviteToken,
  inviteMailto,
  inviteStatus,
  inviteUrl,
  reminderDayKey,
  reminderId,
} from './invites'

const now = new Date('2026-10-03T09:00:00Z')
const future = '2026-10-10T09:00:00.000Z'
const user = { email: 'Eve@Example.com', emailVerified: true }

describe('generateInviteToken', () => {
  it('makes 32 URL-safe characters', () => {
    const token = generateInviteToken()
    expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/)
    expect(generateInviteToken()).not.toBe(token)
  })

  it('encodes the given bytes as base64url', () => {
    expect(generateInviteToken(new Uint8Array(24).fill(255))).toBe('_'.repeat(32))
  })
})

describe('inviteStatus', () => {
  it('lets anyone use a link invite until it expires', () => {
    expect(inviteStatus({ expiresAt: future, invitedEmail: null }, user, now)).toEqual({
      kind: 'ok',
    })
    expect(
      inviteStatus({ expiresAt: future, invitedEmail: null, acceptedBy: 'x' }, user, now),
    ).toEqual({ kind: 'ok' })
    expect(
      inviteStatus({ expiresAt: '2026-10-03T09:00:00.000Z', invitedEmail: null }, user, now),
    ).toEqual({ kind: 'expired' })
  })

  it('needs the invited, verified email for an email invite, once', () => {
    const invite = { expiresAt: future, invitedEmail: 'eve@example.com' }
    expect(inviteStatus(invite, user, now)).toEqual({ kind: 'ok' })
    expect(inviteStatus({ ...invite, acceptedBy: 'eve' }, user, now)).toEqual({ kind: 'used' })
    expect(inviteStatus(invite, { email: 'frank@example.com', emailVerified: true }, now)).toEqual({
      kind: 'wrong-email',
      invitedEmail: 'eve@example.com',
    })
    expect(inviteStatus(invite, { ...user, emailVerified: false }, now)).toEqual({
      kind: 'unverified',
      invitedEmail: 'eve@example.com',
    })
  })
})

describe('links', () => {
  it('builds the join URL and a mailto link', () => {
    const url = inviteUrl('https://ledgerly.app', 'abc')
    expect(url).toBe('https://ledgerly.app/join/abc')
    const mailto = inviteMailto('eve@example.com', { groupName: 'Goa', inviterName: 'Asha', url })
    expect(mailto.startsWith('mailto:eve%40example.com?subject=')).toBe(true)
    expect(decodeURIComponent(mailto)).toContain('Asha invited you')
    expect(decodeURIComponent(mailto)).toContain(url)
  })
})

describe('reminders', () => {
  it('keys a reminder by group, sender and UTC day', () => {
    expect(reminderDayKey(new Date('2026-10-03T23:30:00Z'))).toBe('20261003')
    expect(reminderId('g1', 'alice', now)).toBe('remind_g1_alice_20261003')
  })
})
