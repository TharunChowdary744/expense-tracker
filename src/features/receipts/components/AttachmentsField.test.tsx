import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { describe, expect, it, vi } from 'vitest'
import { createStore } from '@/app/store'
import { jobUpserted } from '../slice'
import type { ReceiptParent } from '../types'
import { AttachmentsField } from './AttachmentsField'

const enqueueUpload = vi.fn()
const cancelUpload = vi.fn()
const discardDrafts = vi.fn()

vi.mock('@/lib/firebase', () => ({ getFirebase: () => ({ db: {}, storage: {} }) }))
vi.mock('../compress', () => ({
  PrepareError: class extends Error {},
  // Pretend compression shrinks photos to 200 KB.
  prepareFile: (file: File) =>
    Promise.resolve(
      file.type.startsWith('image/')
        ? new File([new Uint8Array(200 * 1024)], file.name, { type: 'image/jpeg' })
        : file,
    ),
}))
vi.mock('../queue', () => ({
  enqueueUpload: (...args: unknown[]) => enqueueUpload(...args),
  cancelUpload: (...args: unknown[]) => cancelUpload(...args),
  discardDrafts: (...args: unknown[]) => discardDrafts(...args),
  retryUpload: vi.fn(),
  enqueueDeletes: vi.fn(),
  localPreviewUrl: () => 'blob:preview',
}))

const parent: ReceiptParent = { kind: 'tx', uid: 'u1', id: 't1' }
const MB = 1024 * 1024

function sized(name: string, type: string, bytes: number) {
  const file = new File(['x'], name, { type })
  Object.defineProperty(file, 'size', { value: bytes })
  return file
}

function setup({ mobile = false } = {}) {
  if (mobile) {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
  }
  const store = createStore()
  const view = render(
    <Provider store={store}>
      <AttachmentsField parent={parent} mode="draft" />
    </Provider>,
  )
  const input = document.querySelector<HTMLInputElement>('input[type=file][multiple]')!
  return { store, view, input, user: userEvent.setup({ applyAccept: false }) }
}

describe('AttachmentsField', () => {
  it('rejects a 15 MB file and an .exe with clear messages', async () => {
    const { input, user } = setup()
    await user.upload(input, [
      sized('scan.pdf', 'application/pdf', 15 * MB),
      sized('setup.exe', 'application/x-msdownload', 1000),
    ])
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('“scan.pdf” is 15.0 MB. Files must be 10 MB or smaller.')
    expect(alert).toHaveTextContent('“setup.exe” isn’t a photo or PDF.')
    expect(enqueueUpload).not.toHaveBeenCalled()
  })

  it('compresses a photo and queues it as a draft under the transaction', async () => {
    enqueueUpload.mockClear()
    const { input, user } = setup()
    await user.upload(input, sized('IMG_0042.jpg', 'image/jpeg', 4 * MB))
    await waitFor(() => expect(enqueueUpload).toHaveBeenCalledTimes(1))
    const [to, attachment, blob, options] = enqueueUpload.mock.calls[0] as [
      ReceiptParent,
      { path: string; name: string; contentType: string; size: number },
      Blob,
      { draft: boolean },
    ]
    expect(to).toEqual(parent)
    expect(attachment.path).toMatch(/^users\/u1\/receipts\/t1\/[\w-]+$/)
    expect(attachment).toMatchObject({ name: 'IMG_0042.jpg', contentType: 'image/jpeg' })
    expect(attachment.size).toBe(200 * 1024)
    expect(blob.size).toBe(200 * 1024)
    expect(options).toEqual({ draft: true })
  })

  it('shows uploads with progress and cancels them', async () => {
    cancelUpload.mockClear()
    const { store, user } = setup()
    store.dispatch(
      jobUpserted({
        id: 'upload:users/u1/receipts/t1/f1',
        op: 'upload',
        prefix: 'users/u1/receipts/t1/',
        attachment: {
          path: 'users/u1/receipts/t1/f1',
          name: 'lunch.jpg',
          contentType: 'image/jpeg',
          size: 250_000,
        },
        draft: true,
        status: 'uploading',
        progress: 0.4,
        error: null,
        createdAt: 1,
      }),
    )
    expect(await screen.findByRole('progressbar', { name: 'Uploading lunch.jpg' })).toHaveAttribute(
      'aria-valuenow',
      '40',
    )
    expect(screen.getByText('Uploading 40%')).toBeInTheDocument()
    expect(screen.getByText('1 of 5')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel upload of lunch.jpg' }))
    expect(cancelUpload).toHaveBeenCalledWith('users/u1/receipts/t1/f1')
  })

  it('offers the camera on phones', () => {
    setup({ mobile: true })
    expect(screen.getByRole('button', { name: 'Take photo' })).toBeInTheDocument()
    expect(document.querySelector('input[capture="environment"]')).toHaveAttribute(
      'accept',
      'image/*',
    )
  })

  it('removes an abandoned draft’s files when the form closes', () => {
    discardDrafts.mockClear()
    const { view } = setup()
    view.unmount()
    expect(discardDrafts).toHaveBeenCalledWith('users/u1/receipts/t1/')
  })
})
