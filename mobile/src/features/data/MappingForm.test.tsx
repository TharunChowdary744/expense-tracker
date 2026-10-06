import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { guessMapping } from '@/features/data/csvImport'
import { mappingDefaults } from '@/features/data/schemas'
import { MappingForm } from './MappingForm'

const header = ['Txn Date', 'Narration', 'Amount']
const sample = [['03/10/2026', 'Coffee', '-120.00']]
const accounts = [
  { id: 'bank', name: 'Bank', currency: 'INR' },
  { id: 'cash', name: 'Cash', currency: 'INR' },
]

function setup(defaults = mappingDefaults(guessMapping(header), 'dd/MM/yyyy', 'bank')) {
  const onSubmit = jest.fn()
  render(
    <MappingForm
      header={header}
      sample={sample}
      accounts={accounts}
      defaultValues={defaults}
      onSubmit={onSubmit}
      onBack={jest.fn()}
    />,
  )
  return { onSubmit }
}

describe('MappingForm', () => {
  it('shows how the first date reads and submits the guessed mapping', async () => {
    const { onSubmit } = setup()
    expect(screen.getByText('"03/10/2026" reads as 2026-10-03')).toBeTruthy()
    fireEvent.press(screen.getByRole('button', { name: 'Preview' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({
      mapping: { date: 0, payee: 1, amount: 2 },
      dateFormat: 'dd/MM/yyyy',
      positiveIs: 'expense',
      accountId: 'bank',
    })
  })

  it('says when the date format does not fit the file', () => {
    setup(mappingDefaults(guessMapping(header), 'yyyy-MM-dd', 'bank'))
    expect(screen.getByText(`"03/10/2026" doesn't match this format`)).toBeTruthy()
  })

  it('blocks a mapping without an amount column', async () => {
    const { onSubmit } = setup(mappingDefaults({ date: 0 }, 'dd/MM/yyyy', 'bank'))
    fireEvent.press(screen.getByRole('button', { name: 'Preview' }))
    expect(await screen.findByText(/amount column/)).toBeTruthy()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('needs an account to import into', async () => {
    const { onSubmit } = setup(mappingDefaults(guessMapping(header), 'dd/MM/yyyy', ''))
    fireEvent.press(screen.getByRole('button', { name: 'Preview' }))
    expect(await screen.findByText('Choose the account to import into')).toBeTruthy()
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
