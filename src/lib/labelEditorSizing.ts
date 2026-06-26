const MIN_ROWS = 1
const HORIZONTAL_PADDING = 24
const AVERAGE_CHAR_WIDTH = 8

export function estimateLabelEditorRows(label: string, width: number): number {
  const usableWidth = Math.max(AVERAGE_CHAR_WIDTH, width - HORIZONTAL_PADDING)
  const charsPerLine = Math.max(1, Math.floor(usableWidth / AVERAGE_CHAR_WIDTH))

  const rows = String(label || '')
    .split(/\r?\n/)
    .reduce(
      (sum, line) => sum + Math.max(1, Math.ceil(line.length / charsPerLine)),
      0,
    )

  return Math.max(MIN_ROWS, rows)
}
