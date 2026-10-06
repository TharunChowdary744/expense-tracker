// jsPDF renders the web app's PDF statement and is loaded on demand inside
// `renderStatementPdf`. This app builds the statement with expo-print instead and never calls
// that function, so Metro resolves these packages to an empty module (metro.config.js). These
// declarations cover only what that function uses, for the type checker.
declare module 'jspdf' {
  export class jsPDF {
    constructor(options?: { unit?: string; format?: string })
    setFont(name: string, style?: string): void
    setFontSize(size: number): void
    setTextColor(gray: number): void
    text(text: string, x: number, y: number, options?: { align?: string }): void
    getNumberOfPages(): number
    setPage(page: number): void
    internal: { pageSize: { getWidth(): number; getHeight(): number } }
    output(type: 'blob'): Blob
  }
}

declare module 'jspdf-autotable' {
  export interface CellHookData {
    section: 'head' | 'body' | 'foot'
    row: { index: number }
    cell: { styles: { fontStyle: string } }
  }
  export function autoTable(
    doc: unknown,
    options: { didParseCell?: (data: CellHookData) => void } & Record<string, unknown>,
  ): void
}
