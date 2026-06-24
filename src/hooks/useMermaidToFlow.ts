import { useEffect, useState } from 'react'
import { convertMermaid } from '../lib/convertMermaid'
import type { ConvertResult, FlowNode, FlowEdge } from '../lib/types'

export function useMermaidToFlow(code: string, delay = 250): ConvertResult {
  const [nodes, setNodes] = useState<FlowNode[]>([])
  const [edges, setEdges] = useState<FlowEdge[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(async () => {
      const res = await convertMermaid(code)
      if (cancelled) return
      if (res.error) {
        // 파싱 실패: 이전 정상 그래프 유지, 에러만 갱신
        setError(res.error)
      } else {
        setNodes(res.nodes)
        setEdges(res.edges)
        setError(null)
      }
    }, delay)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [code, delay])

  return { nodes, edges, error }
}
