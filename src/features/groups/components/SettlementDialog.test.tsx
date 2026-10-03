import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { describe, expect, it, vi } from 'vitest'
import { createStore } from '@/app/store'
import { authStateChanged } from '@/features/auth/slice'
import type { Group } from '../types'
import { SettlementDialog } from './SettlementDialog'

const recordSettlement = vi.fn<
  (...args: unknown[]) => { settlementId: string; commit: Promise<void> }
>(() => ({ settlementId: 's1', commit: Promise.resolve() }))

vi.mock('@/lib/firebase', () => ({ getFirebase: () => ({ db: {} }) }))
vi.mock('../writes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../writes')>()),
  recordSettlement: (...args: unknown[]) => recordSettlement(...args),
}))

const stamp = '2026-10-01T00:00:00.000Z'
const group: Group = {
  id: 'g1',
  name: 'Goa trip',
  emoji: '🏖️',
  currency: 'INR',
  memberIds: ['a', 'b'],
  members: {
    a: { displayName: 'Asha', email: 'asha@example.com', role: 'owner' },
    b: { displayName: 'Bilal', email: 'bilal@example.com', role: 'member' },
  },
  ownerId: 'a',
  invitedEmails: [],
  simplifyDebts: false,
  createdAt: stamp,
  updatedAt: stamp,
  createdBy: 'a',
  pending: false,
}

function setup() {
  const store = createStore()
  store.dispatch(
    authStateChanged({
      uid: 'b',
      email: 'bilal@example.com',
      displayName: 'Bilal',
      photoURL: null,
      emailVerified: true,
      providerIds: ['google.com'],
    }),
  )
  const onOpenChange = vi.fn()
  const debt = { from: 'b', to: 'a', amount: 33333 }
  render(
    <Provider store={store}>
      <SettlementDialog group={group} initial={debt} debts={[debt]} onOpenChange={onOpenChange} />
    </Provider>,
  )
  return { onOpenChange, user: userEvent.setup() }
}

describe('SettlementDialog', () => {
  it('prefills the full amount and records a partial payment', async () => {
    const { user, onOpenChange } = setup()
    const amount = screen.getByLabelText('Amount (INR)')
    expect(amount).toHaveValue('333.33')
    expect(screen.getByText(/Owed: ₹333\.33/)).toBeInTheDocument()
    await user.clear(amount)
    await user.type(amount, '200')
    await user.click(screen.getByRole('button', { name: 'Record payment' }))
    expect(recordSettlement).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        groupId: 'g1',
        fromUid: 'b',
        toUid: 'a',
        amount: 20000,
        summary: 'Bilal paid Asha ₹200.00',
      }),
    )
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('refuses a payment to yourself', async () => {
    const { user } = setup()
    await user.selectOptions(screen.getByLabelText('Paid to'), 'b')
    recordSettlement.mockClear()
    await user.click(screen.getByRole('button', { name: 'Record payment' }))
    expect(await screen.findByText('Choose two different people')).toBeInTheDocument()
    expect(recordSettlement).not.toHaveBeenCalled()
  })
})
