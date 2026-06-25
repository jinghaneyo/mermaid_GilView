import type { FlowNode, FlowEdge } from './types'

/**
 * Mermaid 플로우차트 텍스트를 React Flow의 nodes/edges로 변환하는 경량 파서.
 *
 * mermaid 라이브러리를 쓰지 않고 정규식/문자열 분리만으로 기본 문법을 처리한다:
 * - `graph TD` / `flowchart LR` 등 헤더 줄
 * - 노드 선언: `A[텍스트]`, `B{텍스트}`, `C(텍스트)`, 또는 라벨 없는 `A`
 * - 엣지: `A --> B`, 라벨 포함 `A -->|예| B`, 체인 `A --> B --> C`
 * - `%%` 주석과 빈 줄은 무시
 *
 * 노드는 발견 순서대로 격자(grid)에 배치해 좌표가 겹치지 않게 한다.
 */

const GRID_COLS = 3
const X_GAP = 220
const Y_GAP = 120

const HEADER_RE = /^(graph|flowchart)\b/i

/** `A[라벨]` 같은 토큰에서 { id, label } 추출 (라벨 없으면 id 사용) */
function parseNodeToken(token: string): { id: string; label: string } | null {
  const t = token.trim()
  if (t === '') return null
  const m = t.match(
    /^([A-Za-z0-9_]+)\s*(?:\[\[([^\]]*)\]\]|\[([^\]]*)\]|\(\(([^)]*)\)\)|\(([^)]*)\)|\{([^}]*)\})?/,
  )
  if (!m) return null
  const id = m[1]
  const raw = m[2] ?? m[3] ?? m[4] ?? m[5] ?? m[6]
  const label = raw !== undefined && raw.trim() !== '' ? raw.trim() : id
  return { id, label }
}

export function convertMermaidToCanvas(mermaidText: string): {
  nodes: FlowNode[]
  edges: FlowEdge[]
} {
  const order: string[] = [] // 노드 발견 순서
  const labels = new Map<string, string>() // id -> label
  const edges: FlowEdge[] = []

  const addNode = (node: { id: string; label: string }) => {
    if (!labels.has(node.id)) {
      labels.set(node.id, node.label)
      order.push(node.id)
    } else if (labels.get(node.id) === node.id && node.label !== node.id) {
      // 기존이 기본 라벨(=id)이고 새로 진짜 라벨이 들어오면 갱신
      labels.set(node.id, node.label)
    }
  }

  const lines = (mermaidText ?? '').split('\n')
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (line === '' || line.startsWith('%%')) continue
    if (HEADER_RE.test(line)) continue

    if (line.includes('-->')) {
      // 화살표로 분리해 좌→우 순서로 노드/엣지 생성. 라벨은 화살표 뒤 토큰의 |...| 에 위치.
      const parts = line.split('-->')
      let prevId: string | null = null
      for (const part of parts) {
        let seg = part.trim()
        let edgeLabel: string | undefined
        const lm = seg.match(/^\|([^|]*)\|\s*/)
        if (lm) {
          edgeLabel = lm[1].trim()
          seg = seg.slice(lm[0].length).trim()
        }
        const node = parseNodeToken(seg)
        if (!node) continue
        addNode(node)
        if (prevId !== null) {
          edges.push({
            id: `${prevId}-${node.id}-${edges.length}`,
            source: prevId,
            target: node.id,
            ...(edgeLabel ? { label: edgeLabel } : {}),
          })
        }
        prevId = node.id
      }
    } else {
      // 화살표 없는 줄 → 단독 노드 선언
      const node = parseNodeToken(line)
      if (node) addNode(node)
    }
  }

  const nodes: FlowNode[] = order.map((id, i) => ({
    id,
    data: { label: labels.get(id) ?? id },
    position: {
      x: (i % GRID_COLS) * X_GAP,
      y: Math.floor(i / GRID_COLS) * Y_GAP,
    },
  }))

  return { nodes, edges }
}
