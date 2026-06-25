import { useCallback, useEffect, useRef, useState } from 'react'
import {
  useNodesState,
  useEdgesState,
  addEdge,
  type Connection,
} from '@xyflow/react'
import MermaidEditor from './components/MermaidEditor'
import FlowCanvas from './components/FlowCanvas'
import EditableNode, { LabelChangeContext } from './components/EditableNode'
import EditableEdge, { EdgeLabelChangeContext } from './components/EditableEdge'
import { convertMermaid } from './lib/convertMermaid'
import { convertCanvasToMermaid } from './lib/convertCanvasToMermaid'
import type { AppNode, AppEdge } from './lib/types'

const INITIAL_CODE = `graph TD
  A[시작] --> B[조건]
  B -->|예| C[처리]
  B -->|아니오| D[종료]
  C --> D`

const nodeTypes = { editable: EditableNode }
const edgeTypes = { editable: EditableEdge }

export default function App() {
  const [code, setCode] = useState(INITIAL_CODE)
  const [error, setError] = useState<string | null>(null)
  const [nodes, setNodes, onNodesChange] = useNodesState<AppNode>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<AppEdge>([])

  // 최근 편집 출처: 'code'(텍스트) → 캔버스 재레이아웃, 'canvas' → 코드 문자열만 갱신
  const source = useRef<'code' | 'canvas'>('code')
  // 핸들러에서 최신 상태를 읽기 위한 ref
  const nodesRef = useRef(nodes)
  const edgesRef = useRef(edges)
  nodesRef.current = nodes
  edgesRef.current = edges

  // 캔버스 → 코드: 레이아웃을 다시 돌리지 않고 문자열만 만든다 (노드 위치 보존)
  const syncCanvasToCode = useCallback(
    (nextNodes: AppNode[], nextEdges: AppEdge[]) => {
      source.current = 'canvas'
      const flowNodes = nextNodes.map((n) => ({
        id: n.id,
        data: { label: n.data.label },
        position: n.position,
      }))
      const flowEdges = nextEdges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        ...(typeof e.label === 'string' && e.label ? { label: e.label } : {}),
      }))
      setCode(convertCanvasToMermaid(flowNodes, flowEdges))
    },
    [],
  )

  // 코드 → 캔버스: 텍스트 편집이 출처일 때만 파싱 + 레이아웃 (디바운스 250ms)
  useEffect(() => {
    if (source.current !== 'code') return // 캔버스에서 비롯된 코드 변경 → 재레이아웃 생략
    let cancelled = false
    const timer = setTimeout(async () => {
      const res = await convertMermaid(code)
      if (cancelled) return
      if (res.error) {
        setError(res.error) // 파싱 실패: 직전 그래프 유지, 에러만 갱신
        return
      }
      setError(null)
      setNodes(
        res.nodes.map((n) => ({
          id: n.id,
          type: 'editable',
          position: n.position,
          data: { label: n.data.label },
        })),
      )
      setEdges(
        res.edges.map((e) => ({
          id: e.id,
          type: 'editable',
          source: e.source,
          target: e.target,
          ...(e.label ? { label: e.label } : {}),
        })),
      )
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [code, setNodes, setEdges])

  // 텍스트 편집 → 출처를 'code'로 표시
  const onCodeChange = useCallback((value: string) => {
    source.current = 'code'
    setCode(value)
  }, [])

  // 캔버스에서 노드 연결 → 엣지 추가 후 코드 갱신
  const onConnect = useCallback(
    (conn: Connection) => {
      const newEdge: AppEdge = {
        ...conn,
        id: `${conn.source}-${conn.target}-${Date.now()}`,
        type: 'editable',
      }
      const nextEdges = addEdge(newEdge, edgesRef.current)
      setEdges(nextEdges)
      syncCanvasToCode(nodesRef.current, nextEdges)
    },
    [setEdges, syncCanvasToCode],
  )

  // 노드 라벨 인라인 편집 → 코드 갱신
  const handleLabelChange = useCallback(
    (id: string, label: string) => {
      const nextNodes = nodesRef.current.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, label } } : n,
      )
      setNodes(nextNodes)
      syncCanvasToCode(nextNodes, edgesRef.current)
    },
    [setNodes, syncCanvasToCode],
  )

  // 엣지 라벨 인라인 편집 → 코드 갱신 (빈 라벨이면 라벨 제거)
  const handleEdgeLabelChange = useCallback(
    (id: string, label: string) => {
      const nextEdges = edgesRef.current.map((e) =>
        e.id === id ? { ...e, label: label || undefined } : e,
      )
      setEdges(nextEdges)
      syncCanvasToCode(nodesRef.current, nextEdges)
    },
    [setEdges, syncCanvasToCode],
  )

  // 캔버스에서 노드/엣지 삭제(Delete/Backspace) → 코드 갱신
  const onDelete = useCallback(
    ({ nodes: delNodes, edges: delEdges }: { nodes: AppNode[]; edges: AppEdge[] }) => {
      const delNodeIds = new Set(delNodes.map((n) => n.id))
      const delEdgeIds = new Set(delEdges.map((e) => e.id))
      const remNodes = nodesRef.current.filter((n) => !delNodeIds.has(n.id))
      const remEdges = edgesRef.current.filter((e) => !delEdgeIds.has(e.id))
      syncCanvasToCode(remNodes, remEdges)
    },
    [syncCanvasToCode],
  )

  // 새 노드 추가 → 코드 갱신 (사용하지 않는 ID 자동 부여)
  const onAddNode = useCallback(() => {
    const ids = new Set(nodesRef.current.map((n) => n.id))
    let i = 1
    let id = `N${i}`
    while (ids.has(id)) {
      i += 1
      id = `N${i}`
    }
    const offset = (nodesRef.current.length % 8) * 28
    const newNode: AppNode = {
      id,
      type: 'editable',
      position: { x: 60 + offset, y: 60 + offset },
      data: { label: '새 노드' },
    }
    const nextNodes = [...nodesRef.current, newNode]
    setNodes(nextNodes)
    syncCanvasToCode(nextNodes, edgesRef.current)
  }, [setNodes, syncCanvasToCode])

  return (
    <div className="flex h-full w-full">
      <div className="w-2/5 min-w-[280px] max-w-[640px] border-r border-slate-700">
        <MermaidEditor code={code} onChange={onCodeChange} error={error} />
      </div>
      <div className="relative flex-1">
        <button
          type="button"
          onClick={onAddNode}
          className="absolute left-3 top-3 z-10 rounded-md bg-slate-800 px-3 py-1.5 text-sm font-medium text-white shadow hover:bg-slate-700"
        >
          + 노드 추가
        </button>
        <LabelChangeContext.Provider value={handleLabelChange}>
          <EdgeLabelChangeContext.Provider value={handleEdgeLabelChange}>
            <FlowCanvas
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onDelete={onDelete}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
            />
          </EdgeLabelChangeContext.Provider>
        </LabelChangeContext.Provider>
      </div>
    </div>
  )
}
