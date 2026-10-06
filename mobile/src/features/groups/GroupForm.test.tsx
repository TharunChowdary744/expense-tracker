import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { GroupForm } from './GroupForm'

// The form only needs its props; keep Firebase-backed modules out of the test.
jest.mock('@/features/groups/api', () => ({}))
jest.mock('@/features/groups/hooks/useActor', () => ({}))
jest.mock('@/features/groups/writes', () => ({}))
jest.mock('@/features/settings/hooks', () => ({}))
jest.mock('@/features/ui/hooks', () => ({}))
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }))

function setup(onSubmit = jest.fn().mockResolvedValue(null)) {
  const onCancel = jest.fn()
  render(<GroupForm baseCurrency="INR" locale="en-IN" onSubmit={onSubmit} onCancel={onCancel} />)
  return { onSubmit, onCancel }
}

describe('GroupForm', () => {
  it('requires a name', async () => {
    const { onSubmit } = setup()
    fireEvent.press(screen.getByRole('button', { name: 'Create group' }))
    expect(await screen.findByText('Enter a name')).toBeTruthy()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits the trimmed name, base currency and chosen emoji', async () => {
    const { onSubmit } = setup()
    fireEvent.changeText(screen.getByLabelText('Name'), '  Goa trip  ')
    const emoji = screen.getAllByRole('radio')[1]
    if (!emoji) throw new Error('no emoji options')
    fireEvent.press(emoji)
    fireEvent.press(screen.getByRole('button', { name: 'Create group' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({ name: 'Goa trip', currency: 'INR' })
    expect(onSubmit.mock.calls[0]?.[0].emoji).toBe(emoji.props.accessibilityLabel)
  })

  it('shows the error the save returns', async () => {
    setup(jest.fn().mockResolvedValue('You are offline'))
    fireEvent.changeText(screen.getByLabelText('Name'), 'Flat')
    fireEvent.press(screen.getByRole('button', { name: 'Create group' }))
    expect(await screen.findByText('You are offline')).toBeTruthy()
  })

  it('cancels', () => {
    const { onCancel } = setup()
    fireEvent.press(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalled()
  })
})
