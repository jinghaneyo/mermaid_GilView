export function scrollTopForLine({
  line,
  lineHeight,
  paddingTop,
  clientHeight,
  scrollHeight,
}: {
  line: number
  lineHeight: number
  paddingTop: number
  clientHeight: number
  scrollHeight: number
}): number {
  const lineTop = paddingTop + line * lineHeight
  const centered = lineTop - clientHeight / 2 + lineHeight / 2
  const maxScrollTop = Math.max(0, scrollHeight - clientHeight)
  return Math.max(0, Math.min(maxScrollTop, Math.round(centered)))
}
