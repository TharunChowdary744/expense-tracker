/**
 * CSV helpers (RFC 4180): comma-separated, fields quoted with double quotes when needed, a
 * doubled quote inside a quoted field is a literal quote, and both CRLF and LF end a row.
 */

/** Cells starting with these could run as a formula when opened in a spreadsheet. */
const FORMULA_START = /^[=+\-@\t\r]/

/**
 * Quotes a value when it contains a delimiter, quote or line break. Text that a spreadsheet
 * would treat as a formula gets a leading apostrophe, which `parseCsv` users strip again with
 * `unescapeFormula`. Numbers are written by the caller as plain strings and are not escaped.
 */
export function csvCell(value: string, { text = true }: { text?: boolean } = {}): string {
  const safe = text && FORMULA_START.test(value) ? `'${value}` : value
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

/** Builds a CSV document. `numeric` marks columns whose cells are numbers (never escaped). */
export function toCsv(
  header: readonly string[],
  rows: readonly (readonly string[])[],
  numeric: ReadonlySet<number> = new Set(),
): string {
  const line = (cells: readonly string[]) =>
    cells.map((c, i) => csvCell(c, { text: !numeric.has(i) })).join(',')
  return [line(header), ...rows.map(line)].join('\r\n') + '\r\n'
}

/** Removes the apostrophe `csvCell` adds in front of formula-like text. */
export function unescapeFormula(value: string): string {
  return value.length > 1 && value.startsWith("'") && FORMULA_START.test(value.slice(1))
    ? value.slice(1)
    : value
}

/**
 * Parses CSV text into rows of cells. A leading byte-order mark is ignored and blank lines
 * are skipped. The delimiter is detected from the first line (comma, semicolon or tab).
 */
export function parseCsv(text: string, delimiter = detectDelimiter(text)): string[][] {
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  let i = 0
  const endCell = () => {
    row.push(cell)
    cell = ''
  }
  const endRow = () => {
    endCell()
    if (row.length > 1 || row[0] !== '') rows.push(row)
    row = []
  }
  while (i < input.length) {
    const ch = input[i] as string
    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          cell += '"'
          i += 2
          continue
        }
        quoted = false
      } else {
        cell += ch
      }
      i += 1
      continue
    }
    if (ch === '"' && cell === '') quoted = true
    else if (ch === delimiter) endCell()
    else if (ch === '\n') endRow()
    else if (ch === '\r') {
      endRow()
      if (input[i + 1] === '\n') i += 1
    } else cell += ch
    i += 1
  }
  if (cell !== '' || row.length > 0) endRow()
  return rows
}

/** The most common of comma, semicolon and tab outside quotes on the first line. */
export function detectDelimiter(text: string): string {
  const firstLine =
    (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text).split(/\r?\n/, 1)[0] ?? ''
  const unquoted = firstLine.replace(/"[^"]*"/g, '')
  const counts = [',', ';', '\t'].map((d) => ({ d, n: unquoted.split(d).length - 1 }))
  counts.sort((a, b) => b.n - a.n)
  return counts[0] && counts[0].n > 0 ? counts[0].d : ','
}
