import type { ReactNode } from 'react'
import { cn } from '@/utils/cn'

export interface Column<Row> {
  header: string
  cell: (row: Row) => ReactNode
  /** Right-aligned numeric column. */
  numeric?: boolean
}

interface Props<Row> {
  caption: string
  columns: readonly Column<Row>[]
  rows: readonly Row[]
  rowKey: (row: Row) => string
  footer?: ReactNode
}

/** A plain, accessible table used as the alternative view for charts. */
export function DataTable<Row>({ caption, columns, rows, rowKey, footer }: Props<Row>) {
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">{caption}</caption>
      <thead className="sticky top-0 bg-card">
        <tr className="border-b text-left text-muted-foreground">
          {columns.map((c) => (
            <th
              key={c.header}
              scope="col"
              className={cn('px-2 py-1.5 font-medium', c.numeric && 'text-right')}
            >
              {c.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={rowKey(row)} className="border-b last:border-0">
            {columns.map((c, i) =>
              i === 0 ? (
                <th key={c.header} scope="row" className="px-2 py-1.5 text-left font-normal">
                  {c.cell(row)}
                </th>
              ) : (
                <td
                  key={c.header}
                  className={cn('px-2 py-1.5', c.numeric && 'text-right tabular-nums')}
                >
                  {c.cell(row)}
                </td>
              ),
            )}
          </tr>
        ))}
      </tbody>
      {footer && <tfoot className="border-t font-medium">{footer}</tfoot>}
    </table>
  )
}
