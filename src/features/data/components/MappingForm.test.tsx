import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { guessMapping } from '../csvImport'
import { mappingDefaults } from '../schemas'
import { MappingForm } from './MappingForm'

const header = ['Txn Date', 'Narration', 'Amount']
const sample = [['03/10/2026', 'Coffee', '-120.00']]
const accounts = [
  { id: 'bank', name: 'Bank', currency: 'INR' },
  { id: 'cash', name: 'Cash', currency: 'INR' },
]

function setup(defaults = mappingDefaults(guessMapping(header), 'dd/MM/yyyy', 'bank')) {
  const onSubmit = vi.fn()
  render(
    <MappingForm
      header={header}
      sample={sample}
      accounts={accounts}
      defaultValues={defaults}
      onSubmit={onSubmit}
      onBack={vi.fn()}
    />,
  )
  return { onSubmit, user: userEvent.setup() }
}

describe('MappingForm', () => {
  it('submits the guessed mapping with the chosen account and sign', async () => {
    const { onSubmit, user } = setup()
    expect(screen.getByText('"03/10/2026" reads as 2026-10-03')).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Import into account'), 'cash')
    await user.selectOptions(screen.getByLabelText('Positive amounts are'), 'income')
    await user.click(screen.getByRole('button', { name: 'Preview' }))
    expect(onSubmit).toHaveBeenCalledWith(
      {
        mapping: { date: 0, payee: 1, amount: 2 },
        dateFormat: 'dd/MM/yyyy',
        positiveIs: 'income',
        accountId: 'cash',
      },
      expect.anything(),
    )
  })

  it('says when the date format does not fit the file', async () => {
    const { user } = setup()
    await user.selectOptions(screen.getByLabelText('Date format'), 'yyyy-MM-dd')
    expect(screen.getByText(`"03/10/2026" doesn't match this format`)).toBeInTheDocument()
  })

  it('blocks a mapping without an amount column', async () => {
    const { onSubmit, user } = setup(mappingDefaults({ date: 0 }, 'dd/MM/yyyy', 'bank'))
    await user.click(screen.getByRole('button', { name: 'Preview' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/amount column/)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('needs an account to import into', async () => {
    const { onSubmit, user } = setup(mappingDefaults(guessMapping(header), 'dd/MM/yyyy', ''))
    await user.click(screen.getByRole('button', { name: 'Preview' }))
    expect(await screen.findByText('Choose the account to import into')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('rejects the same column used twice', async () => {
    const { onSubmit, user } = setup()
    await user.selectOptions(screen.getByLabelText('Note'), '1')
    await user.click(screen.getByRole('button', { name: 'Preview' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/one field only/)
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
