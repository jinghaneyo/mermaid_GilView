import { useEffect, useRef, useState } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
// Code -> Canvas 는 "실제 mermaid 공식 파서"를 사용한다.
// convertMermaid = parseMermaid(mermaid 파서) + layout(dagre 계층 배치)
// → subgraph / 노드 모양({},()) / 점선·굵은 화살표 등 복잡한 문법도 mermaid와 동일하게 해석됨.
import { convertMermaid } from './lib/convertMermaid'

/* ------------------------------------------------------------------ *
 * convertCanvasToMermaid: { nodes, edges } -> Mermaid 텍스트
 *   - 첫 줄은 항상 graph TD
 *   - 노드: ID[라벨] (라벨 없으면 ID)
 *   - 엣지: A --> B (라벨 있으면 A -->|라벨| B)
 *   ※ 캔버스에서 표현 가능한 기본 flowchart 형태로만 출력한다
 *     (subgraph/도형 등은 캔버스에 구조가 없으므로 역출력에 포함되지 않음)
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
 * MermaidVisualEditor: 좌(코드) / 우(캔버스) 양방향 에디터
 *
 *   - Code  -> Canvas : Textarea onChange -> mermaid 파서로 파싱 + dagre 배치
 *   - Canvas -> Code  : onConnect(선 연결) / onNodeDragStop(드래그 종료) ->
 *                       현재 구조를 Mermaid 코드로 변환해 Textarea 갱신
 *
 *   두 방향이 서로 다른 사용자 이벤트로만 발생하므로 무한 루프가 없다.
 *   (code->canvas 는 onChange/마운트에서만, canvas->code 는 connect/dragStop 에서만)
 * ------------------------------------------------------------------ */

const INITIAL_CODE = 'graph TD\nA[시작] --> B[종료]'

function EditorInner() {
  const [code, setCode] = useState(INITIAL_CODE)
  const [error, setError] = useState(null)
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])

  // 좌/우 패널 너비(px) — 스플리터 드래그로 조절
  const [leftWidth, setLeftWidth] = useState(440)
  const containerRef = useRef(null)

  // 캔버스 테마 / 격자 표시
  const [theme, setTheme] = useState('light') // 'light' | 'dark'
  const [showGrid, setShowGrid] = useState(true)

  // 핸들러에서 최신 상태를 읽기 위한 ref 미러
  const nodesRef = useRef(nodes)
  const edgesRef = useRef(edges)
  nodesRef.current = nodes
  edgesRef.current = edges

  // 비동기 파싱 경합 방지(최신 요청만 반영) + 디바운스
  const seqRef = useRef(0)
  const debounceRef = useRef(null)

  // Code -> Canvas : mermaid 파서로 파싱 + dagre 배치
  const runParse = (text) => {
    const seq = ++seqRef.current
    convertMermaid(text).then((res) => {
      if (seq !== seqRef.current) return // 더 최신 입력이 있으면 폐기
      if (res.error) {
        setError(res.error) // 파싱 실패: 직전 그래프 유지, 에러만 표시
        return
      }
      setError(null)
      setNodes(res.nodes)
      setEdges(res.edges)
    })
  }

  // 초기 코드 1회 파싱
  useEffect(() => {
    runParse(INITIAL_CODE)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 텍스트 입력 감지 -> 디바운스 후 파싱
  const handleCodeChange = (e) => {
    const text = e.target.value
    setCode(text)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => runParse(text), 250)
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
  const onNodeDragStop = () => {
    syncCanvasToCode(nodesRef.current, edgesRef.current)
  }

  // 스플리터 드래그 -> 왼쪽 패널 너비 조절
  const onSplitterMouseDown = (e) => {
    e.preventDefault()
    const onMove = (ev) => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      const min = 240
      const max = rect.width - 320
      const w = Math.max(min, Math.min(max, ev.clientX - rect.left))
      setLeftWidth(w)
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const btnClass =
    'rounded-md border border-slate-300 bg-white/90 px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm hover:bg-white'

  return (
    <div ref={containerRef} className="flex h-full w-full">
      {/* 왼쪽: Mermaid 코드 에디터 */}
      <div
        style={{ width: leftWidth }}
        className="flex shrink-0 flex-col bg-slate-900 text-slate-100"
      >
        <div className="flex items-center justify-between border-b border-slate-700 px-4 py-2.5">
          <h1 className="text-sm font-semibold tracking-tight">Mermaid 코드</h1>
          <span className="text-xs text-slate-400">flowchart (mermaid 파서)</span>
        </div>
        <textarea
          value={code}
          onChange={handleCodeChange}
          spellCheck={false}
          className="flex-1 resize-none bg-slate-900 p-4 font-mono text-sm leading-relaxed text-slate-100 outline-none"
          placeholder={'graph TD\n  A[시작] --> B[종료]'}
        />
        {error && (
          <div className="border-t border-red-800 bg-red-950/80 px-4 py-2 font-mono text-xs text-red-300">
            ⚠ {error}
          </div>
        )}
      </div>

      {/* 가운데: 드래그 스플리터 */}
      <div
        onMouseDown={onSplitterMouseDown}
        title="드래그하여 패널 크기 조절"
        className="w-1.5 shrink-0 cursor-col-resize bg-slate-700 transition-colors hover:bg-blue-500"
      />

      {/* 오른쪽: React Flow 비주얼 캔버스 */}
      <div
        className={`relative flex-1 ${theme === 'dark' ? 'bg-slate-900' : 'bg-slate-50'}`}
      >
        {/* 툴바: 테마 / 격자 토글 */}
        <div className="absolute right-3 top-3 z-10 flex gap-2">
          <button
            type="button"
            onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
            className={btnClass}
          >
            {theme === 'light' ? '🌙 다크' : '☀️ 라이트'}
          </button>
          <button
            type="button"
            onClick={() => setShowGrid((g) => !g)}
            className={btnClass}
          >
            {showGrid ? '⊞ 격자 끄기' : '⊞ 격자 켜기'}
          </button>
        </div>

        <ReactFlow
          colorMode={theme}
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
          {showGrid && (
            <Background
              variant={BackgroundVariant.Lines}
              gap={20}
              color={theme === 'dark' ? '#334155' : '#e2e8f0'}
            />
          )}
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable />
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
