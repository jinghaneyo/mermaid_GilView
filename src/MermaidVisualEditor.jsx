import { useRef, useState } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

/* ------------------------------------------------------------------ *
 * 1) convertMermaidToCanvas: Mermaid 텍스트 -> { nodes, edges }
 *    - mermaid 라이브러리 없이 정규식/split 로 기본 플로우차트 파싱
 *    - 노드는 3열 격자로 좌표를 자동 부여해 겹치지 않게 배치
 * ------------------------------------------------------------------ */

const GRID_COLS = 3
const X_GAP = 220
const Y_GAP = 120
const HEADER_RE = /^(graph|flowchart)\b/i

// "A[라벨]" / "B{라벨}" / "C(라벨)" / "A" 토큰에서 { id, label } 추출
function parseNodeToken(token) {
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

export function convertMermaidToCanvas(mermaidText) {
  const order = [] // 노드 발견 순서
  const labels = new Map() // id -> label
  const edges = []

  const addNode = (node) => {
    if (!labels.has(node.id)) {
      labels.set(node.id, node.label)
      order.push(node.id)
    } else if (labels.get(node.id) === node.id && node.label !== node.id) {
      labels.set(node.id, node.label) // 기본 라벨(=id)이었으면 진짜 라벨로 갱신
    }
  }

  const lines = (mermaidText ?? '').split('\n')
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (line === '' || line.startsWith('%%')) continue
    if (HEADER_RE.test(line)) continue

    if (line.includes('-->')) {
      // 화살표로 분리해 좌->우 순서로 노드/엣지 생성. 라벨은 화살표 뒤 토큰의 |...|.
      const parts = line.split('-->')
      let prevId = null
      for (const part of parts) {
        let seg = part.trim()
        let edgeLabel
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
      const node = parseNodeToken(line)
      if (node) addNode(node)
    }
  }

  const nodes = order.map((id, i) => ({
    id,
    data: { label: labels.get(id) ?? id },
    position: {
      x: (i % GRID_COLS) * X_GAP,
      y: Math.floor(i / GRID_COLS) * Y_GAP,
    },
  }))

  return { nodes, edges }
}

/* ------------------------------------------------------------------ *
 * 2) convertCanvasToMermaid: { nodes, edges } -> Mermaid 텍스트
 *    - 첫 줄은 항상 graph TD
 *    - 노드: ID[라벨] (라벨 없으면 ID)
 *    - 엣지: A --> B (라벨 있으면 A -->|라벨| B)
 * ------------------------------------------------------------------ */

export function convertCanvasToMermaid(nodes, edges) {
  const lines = ['graph TD']

  for (const node of nodes ?? []) {
    const raw = node.data?.label
    const label = raw !== undefined && raw !== '' ? raw : node.id
    lines.push(`  ${node.id}[${label}]`)
  }

  for (const edge of edges ?? []) {
    const label = edge.label
    if (typeof label === 'string' && label !== '') {
      lines.push(`  ${edge.source} -->|${label}| ${edge.target}`)
    } else {
      lines.push(`  ${edge.source} --> ${edge.target}`)
    }
  }

  return lines.join('\n')
}

/* ------------------------------------------------------------------ *
 * 3) MermaidVisualEditor: 좌(코드) / 우(캔버스) 양방향 에디터
 *
 *   - Code  -> Canvas : Textarea onChange 에서 파싱하여 노드/선 실시간 갱신
 *   - Canvas -> Code  : onConnect(선 연결) / onNodeDragStop(드래그 종료) 시
 *                       현재 구조를 Mermaid 코드로 변환해 Textarea 갱신
 *
 *   두 방향이 서로 다른 사용자 이벤트로만 발생하므로 무한 루프가 없다.
 * ------------------------------------------------------------------ */

const INITIAL_CODE = 'graph TD\nA[시작] --> B[종료]'
const INITIAL = convertMermaidToCanvas(INITIAL_CODE)

function EditorInner() {
  const [code, setCode] = useState(INITIAL_CODE)
  const [nodes, setNodes, onNodesChange] = useNodesState(INITIAL.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(INITIAL.edges)

  // 핸들러에서 최신 상태를 읽기 위한 ref 미러
  const nodesRef = useRef(nodes)
  const edgesRef = useRef(edges)
  nodesRef.current = nodes
  edgesRef.current = edges

  // Code -> Canvas : 텍스트 입력을 감지해 노드/선을 다시 만든다
  const handleCodeChange = (e) => {
    const text = e.target.value
    setCode(text)
    const { nodes: nextNodes, edges: nextEdges } = convertMermaidToCanvas(text)
    setNodes(nextNodes)
    setEdges(nextEdges)
  }

  // Canvas -> Code : 현재 노드/선을 Mermaid 코드로 변환해 Textarea 갱신
  const syncCanvasToCode = (nextNodes, nextEdges) => {
    setCode(convertCanvasToMermaid(nextNodes, nextEdges))
  }

  // 새 화살표 연결 -> 엣지 추가 후 코드 갱신
  const onConnect = (params) => {
    setEdges((eds) => {
      const nextEdges = addEdge(params, eds)
      syncCanvasToCode(nodesRef.current, nextEdges)
      return nextEdges
    })
  }

  // 노드 드래그 종료 -> 코드 갱신
  // (위치 자체는 Mermaid 문법에 없으므로 구조 변화가 없으면 코드 내용은 동일)
  const onNodeDragStop = () => {
    syncCanvasToCode(nodesRef.current, edgesRef.current)
  }

  return (
    <div className="flex h-full w-full">
      {/* 왼쪽: Mermaid 코드 에디터 */}
      <div className="flex w-2/5 min-w-[280px] max-w-[640px] flex-col border-r border-slate-700 bg-slate-900 text-slate-100">
        <div className="flex items-center justify-between border-b border-slate-700 px-4 py-2.5">
          <h1 className="text-sm font-semibold tracking-tight">Mermaid 코드</h1>
          <span className="text-xs text-slate-400">flowchart (graph TD)</span>
        </div>
        <textarea
          value={code}
          onChange={handleCodeChange}
          spellCheck={false}
          className="flex-1 resize-none bg-slate-900 p-4 font-mono text-sm leading-relaxed text-slate-100 outline-none"
          placeholder={'graph TD\n  A[시작] --> B[종료]'}
        />
      </div>

      {/* 오른쪽: React Flow 비주얼 캔버스 */}
      <div className="flex-1 bg-slate-50">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeDragStop={onNodeDragStop}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#cbd5e1" gap={20} />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable className="!bg-white" />
        </ReactFlow>
      </div>
    </div>
  )
}

export default function MermaidVisualEditor() {
  return (
    <ReactFlowProvider>
      <EditorInner />
    </ReactFlowProvider>
  )
}
