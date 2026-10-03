import { describe, expect, it } from 'vitest'
import { buildBootstrapDocs } from './bootstrap'

const profile = { uid: 'u1', email: 'a@example.com', displayName: 'Ada', photoURL: null }

describe('buildBootstrapDocs', () => {
  const docs = buildBootstrapDocs(profile, 'en-IN')
  const byPath = (p: string) => docs.find((d) => d.path.join('/') === p)

  it('creates the user doc, 12 categories and one Cash account', () => {
    expect(docs).toHaveLength(1 + 12 + 1)
    expect(docs.filter((d) => d.path[2] === 'categories')).toHaveLength(12)
    expect(docs.filter((d) => d.path[2] === 'accounts')).toHaveLength(1)
  })

  it('only writes inside users/{uid}', () => {
    expect(docs.every((d) => d.path[0] === 'users' && d.path[1] === 'u1')).toBe(true)
  })

  it('stores defaults on the user doc', () => {
    expect(byPath('users/u1')?.data).toMatchObject({
      displayName: 'Ada',
      email: 'a@example.com',
      photoURL: '',
      fcmTokens: [],
      createdBy: 'u1',
      settings: { baseCurrency: 'INR', theme: 'system' },
    })
  })

  it('creates a Cash account in the base currency with integer opening balance', () => {
    expect(byPath('users/u1/accounts/cash')?.data).toMatchObject({
      name: 'Cash',
      type: 'cash',
      currency: 'INR',
      openingBalance: 0,
      archived: false,
      createdBy: 'u1',
    })
    expect(
      buildBootstrapDocs(profile, 'en-US').find((d) => d.path[2] === 'accounts')?.data.currency,
    ).toBe('USD')
  })

  it('gives every category order, kind, archived=false and audit fields', () => {
    const cats = docs.filter((d) => d.path[2] === 'categories')
    expect(cats.map((c) => c.data.order)).toEqual([...Array(12).keys()])
    for (const c of cats) {
      expect(c.data).toMatchObject({ archived: false, createdBy: 'u1' })
      expect(c.data).toHaveProperty('createdAt')
      expect(c.data).toHaveProperty('updatedAt')
      expect(Object.values(c.data)).not.toContain(undefined)
    }
  })

  it('never emits undefined values (Firestore rejects them)', () => {
    for (const d of docs) expect(Object.values(d.data)).not.toContain(undefined)
  })

  it('is deterministic so re-running targets the same documents', () => {
    expect(buildBootstrapDocs(profile, 'en-IN').map((d) => d.path.join('/'))).toEqual(
      docs.map((d) => d.path.join('/')),
    )
  })
})
