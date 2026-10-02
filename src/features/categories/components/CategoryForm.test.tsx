import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Category } from '../types'
import { CategoryForm } from './CategoryForm'

const cat = (id: string, over: Partial<Category> = {}): Category => ({
  id,
  name: id,
  kind: 'expense',
  icon: 'utensils',
  color: '#ea580c',
  parentId: null,
  order: 0,
  archived: false,
  createdAt: '2026-10-02T00:00:00.000Z',
  updatedAt: '2026-10-02T00:00:00.000Z',
  createdBy: 'u1',
  pending: false,
  ...over,
})

const parents = [cat('Food'), cat('Rent', { icon: 'house', color: '#7c3aed' })]

function setup(props: Partial<Parameters<typeof CategoryForm>[0]> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(null)
  render(<CategoryForm parents={parents} onSubmit={onSubmit} onCancel={vi.fn()} {...props} />)
  return { onSubmit, user: userEvent.setup() }
}

describe('CategoryForm', () => {
  it('creates a top-level category', async () => {
    const { onSubmit, user } = setup()
    await user.type(screen.getByLabelText('Name'), 'Pets')
    await user.click(screen.getByRole('radio', { name: 'Paw print' }))
    await user.click(screen.getByRole('radio', { name: 'Teal' }))
    await user.click(screen.getByRole('button', { name: 'Create category' }))
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Pets',
      parentId: '',
      icon: 'paw-print',
      color: '#0d9488',
    })
  })

  it('creates a subcategory, defaulting to the parent look', async () => {
    const { onSubmit, user } = setup({ defaultParentId: 'Rent' })
    expect(screen.getByLabelText('Parent category')).toHaveValue('Rent')
    await user.type(screen.getByLabelText('Name'), 'Maintenance')
    await user.click(screen.getByRole('button', { name: 'Create category' }))
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Maintenance',
      parentId: 'Rent',
      icon: 'house',
      color: '#7c3aed',
    })
  })

  it('can move a category under a parent when editing', async () => {
    const { onSubmit, user } = setup({ category: cat('Groceries') })
    await user.selectOptions(screen.getByLabelText('Parent category'), 'Food')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Groceries', parentId: 'Food' }),
    )
  })

  it('keeps a category with subcategories top-level', async () => {
    const { onSubmit, user } = setup({ category: cat('Food'), hasChildren: true })
    expect(screen.queryByLabelText('Parent category')).not.toBeInTheDocument()
    expect(screen.getByText(/stays top-level/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ parentId: '' }))
  })

  it('requires a name', async () => {
    const { onSubmit, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Create category' }))
    expect(await screen.findByText('Enter a name')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
