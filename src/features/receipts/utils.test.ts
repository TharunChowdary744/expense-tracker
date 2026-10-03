import { describe, expect, it } from 'vitest'
import { attachmentsField } from './schemas'
import {
  attachmentsUnder,
  effectiveType,
  fileProblem,
  formatBytes,
  isAllowedType,
  mergeAttachments,
  parentDocPath,
  receiptPrefix,
  screenFiles,
  storedName,
} from './utils'

const MB = 1024 * 1024
const file = (name: string, type: string, size = 1000) => ({ name, type, size })
const att = (path: string) => ({ path, name: 'r.jpg', contentType: 'image/jpeg', size: 10 })

describe('paths', () => {
  it('puts personal and group receipts in their own folders', () => {
    expect(receiptPrefix({ kind: 'tx', uid: 'u1', id: 't1' })).toBe('users/u1/receipts/t1/')
    expect(receiptPrefix({ kind: 'group', uid: 'u1', groupId: 'g1', id: 'e1' })).toBe(
      'groups/g1/receipts/e1/',
    )
    expect(parentDocPath({ kind: 'tx', uid: 'u1', id: 't1' })).toBe('users/u1/transactions/t1')
    expect(parentDocPath({ kind: 'group', uid: 'u1', groupId: 'g1', id: 'e1' })).toBe(
      'groups/g1/expenses/e1',
    )
  })
})

describe('file checks', () => {
  it('allows images and PDFs, but not SVG or anything else', () => {
    for (const t of ['image/jpeg', 'image/png', 'image/heic', 'image/webp', 'application/pdf']) {
      expect(isAllowedType(t)).toBe(true)
    }
    for (const t of ['image/svg+xml', 'application/x-msdownload', 'text/html', '', 'image/']) {
      expect(isAllowedType(t)).toBe(false)
    }
  })

  it('recognises HEIC and PDF files without a type by their extension', () => {
    expect(effectiveType(file('IMG_1.HEIC', ''))).toBe('image/heic')
    expect(effectiveType(file('bill.pdf', ''))).toBe('application/pdf')
    expect(effectiveType(file('setup.exe', 'application/x-msdownload'))).toBeNull()
    expect(effectiveType(file('notes', ''))).toBeNull()
  })

  it('explains why a file is refused', () => {
    expect(fileProblem(file('setup.exe', 'application/x-msdownload'))).toBe(
      '“setup.exe” isn’t a photo or PDF. Attach images or PDF files only.',
    )
    expect(fileProblem(file('scan.pdf', 'application/pdf', 15 * MB))).toBe(
      '“scan.pdf” is 15.0 MB. Files must be 10 MB or smaller.',
    )
    expect(fileProblem(file('big.jpg', 'image/jpeg', 10 * MB + 1))).toMatch(/10 MB or smaller/)
    expect(fileProblem(file('ok.jpg', 'image/jpeg', 10 * MB))).toBeNull()
    expect(fileProblem(file('empty.jpg', 'image/jpeg', 0))).toBe('“empty.jpg” is empty.')
  })

  it('accepts files up to five in all', () => {
    const picked = [
      file('a.jpg', 'image/jpeg'),
      file('b.exe', 'application/x-msdownload'),
      file('c.jpg', 'image/jpeg'),
      file('d.jpg', 'image/jpeg'),
      file('e.jpg', 'image/jpeg'),
    ]
    const { accepted, problems } = screenFiles(picked, 2)
    expect(accepted.map((f) => f.name)).toEqual(['a.jpg', 'c.jpg', 'd.jpg'])
    expect(problems).toEqual([
      '“b.exe” isn’t a photo or PDF. Attach images or PDF files only.',
      'You can attach up to 5 files. 1 file was not added.',
    ])
    expect(screenFiles(picked.slice(0, 1), 5).problems).toEqual([
      'You can attach up to 5 files. 1 file was not added.',
    ])
  })

  it('formats sizes', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(300 * 1024)).toBe('300 KB')
    expect(formatBytes(15 * MB)).toBe('15.0 MB')
  })
})

describe('storedName', () => {
  it('swaps the extension and keeps names short', () => {
    expect(storedName('IMG_0001.HEIC', 'jpg')).toBe('IMG_0001.jpg')
    expect(storedName('photo', 'jpg')).toBe('photo.jpg')
    expect(storedName('  ')).toBe('receipt')
    const long = storedName(`${'x'.repeat(300)}.pdf`)
    expect(long).toHaveLength(200)
    expect(long.endsWith('.pdf')).toBe(true)
  })
})

describe('attachment lists', () => {
  it('drops malformed entries when reading a document', () => {
    expect(
      attachmentsField.parse([att('users/u/receipts/t/a'), 'oops', { path: 'x' }, null]),
    ).toEqual([att('users/u/receipts/t/a')])
    expect(attachmentsField.parse(undefined)).toEqual([])
  })

  it('merges saved files with uploads, once per path', () => {
    expect(mergeAttachments([att('a'), att('b')], [att('b'), att('c')]).map((a) => a.path)).toEqual(
      ['a', 'b', 'c'],
    )
  })

  it('keeps only files directly under a prefix', () => {
    const prefix = 'users/u1/receipts/t1/'
    expect(
      attachmentsUnder(
        [
          att('users/u1/receipts/t1/a'),
          att('users/u2/receipts/t1/b'),
          att('users/u1/receipts/t2/c'),
          att('users/u1/receipts/t1/d/e'),
          'junk',
        ],
        prefix,
      ).map((a) => a.path),
    ).toEqual(['users/u1/receipts/t1/a'])
  })
})
