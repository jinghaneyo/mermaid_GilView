import { parseMermaid } from './parseMermaid'
import { layout } from './layout'
import type { ConvertResult } from './types'

export async function convertMermaid(code: string): Promise<ConvertResult> {
  const { graph, error } = await parseMermaid(code)
  if (error || !graph) {
    return { nodes: [], edges: [], error: error ?? '알 수 없는 오류' }
  }
  const { nodes, edges } = layout(graph)
  return { nodes, edges, error: null }
}
