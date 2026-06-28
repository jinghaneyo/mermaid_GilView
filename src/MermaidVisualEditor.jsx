import { createContext, useContext, useEffect, useRef, useState } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Handle,
  NodeResizer,
  Position,
  useNodesState,
  useEdgesState,
  useReactFlow,
} from '@xyflow/react'
import { toPng, toSvg } from 'html-to-image'
import '@xyflow/react/dist/style.css'

// 데이터 URL/Blob URL을 파일로 다운로드
function triggerDownload(url, filename) {
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
}
// Code -> Canvas 는 "실제 mermaid 공식 파서"를 사용한다.
// convertMermaid = parseMermaid(mermaid 파서) + layout(dagre 계층 배치)
// → subgraph / 노드 모양({},()) / 점선·굵은 화살표 등 복잡한 문법도 mermaid와 동일하게 해석됨.
import { convertMermaid } from './lib/convertMermaid'
import { scrollTopForLine } from './lib/codeEditorScroll'
import { estimateLabelEditorRows } from './lib/labelEditorSizing'
import {
  findMermaidElementAtOffset,
  findNodeLocationInMermaid,
  findSubgraphLocationInMermaid,
} from './lib/findNodeLineInMermaid'
import {
  getFlowBoundsFromClientRects,
  getTightExportFrame,
} from './lib/exportImageFrame'
import {
  formatMermaidLabel,
  updateNodeLabelInMermaid,
} from './lib/updateNodeLabelInMermaid'
import {
  formatNodeSizeComment,
  updateSubgraphSizeInMermaid,
  updateNodeSizeInMermaid,
} from './lib/nodeSizeComments'
import {
  addEdgeToMermaid,
  removeSelectionFromMermaid,
  updateEdgeLabelInMermaid,
} from './lib/updateEdgesInMermaid'
import { addNodeToMermaid } from './lib/updateNodesInMermaid'
import EditableEdge, { EdgeLabelChangeContext } from './components/EditableEdge'

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
    if (node.data?.customSize && node.width && node.height) {
      lines.push(formatNodeSizeComment(node.id, {
        width: node.width,
        height: node.height,
      }))
    }
    lines.push(`  ${node.id}[${formatMermaidLabel(label)}]`)
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

// 예제/템플릿
const TEMPLATES = {
  basic: 'graph TD\n  A[시작] --> B[처리]\n  B --> C[종료]',
  decision:
    'graph TD\n  A[시작] --> B{조건}\n  B -->|예| C[처리]\n  B -->|아니오| D[종료]\n  C --> D',
  subgraph:
    'graph TD\n  subgraph 입력\n    A[수집] --> B[검증]\n  end\n  subgraph 처리\n    C[변환] --> D[저장]\n  end\n  B --> C',
  shapes:
    'graph TD\n  A[사각형] --> B{마름모}\n  B --> C[(원통)]\n  B --> D([스타디움])\n  C --> E((원))',
}

// subgraph 그룹 박스를 그리는 커스텀 노드 (멤버 노드 뒤에 깔리는 사각 박스 + 제목)
const GroupSizeChangeContext = createContext(() => {})

function GroupNode({ data }) {
  const onGroupSizeChange = useContext(GroupSizeChangeContext)

  return (
    <div className="relative h-full w-full rounded-lg border-2 border-amber-400/80 bg-amber-200/20">
      <NodeResizer
        isVisible={Boolean(data.resizeSelected)}
        minWidth={120}
        minHeight={80}
        lineClassName="!border-amber-500"
        handleClassName="!h-2.5 !w-2.5 !border-amber-600 !bg-white"
        onResizeEnd={(_event, params) => {
          onGroupSizeChange(data.groupId, {
            width: params.width,
            height: params.height,
          })
        }}
      />
      <div className="px-2 pt-1 text-xs font-semibold text-amber-600">
        {data.label}
      </div>
    </div>
  )
}

// 노드 모양별 본체 렌더 (마름모/원통/원/스타디움/사각형)
// 색은 테마 대응: 라이트=흰 채움/짙은 글자, 다크=짙은 채움(slate-700)/밝은 글자.
// SVG 도형의 채움은 currentColor 로 두고 text-* 클래스로 테마별 색을 준다.
function ShapeBody({ shape, label }) {
  const stroke = '#94a3b8' // slate-400 (양쪽 테마에서 모두 보임)
  // SVG 채움색: 라이트=흰색, 다크=slate-700
  const svgFill = 'text-white dark:text-slate-700'
  const labelText = 'whitespace-pre-line text-slate-800 dark:text-slate-100'

  if (shape === 'diamond') {
    return (
      <div className="relative h-full w-full">
        <svg
          className={`absolute inset-0 h-full w-full ${svgFill}`}
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <polygon
            points="50,3 97,50 50,97 3,50"
            fill="currentColor"
            stroke={stroke}
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <div
          className={`absolute inset-0 flex items-center justify-center px-3 text-center text-xs ${labelText}`}
        >
          {label}
        </div>
      </div>
    )
  }

  if (shape === 'cylinder') {
    return (
      <div className="relative h-full w-full">
        <svg
          className={`absolute inset-0 h-full w-full ${svgFill}`}
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <path
            d="M2,10 V90 A48,9 0 0 0 98,90 V10"
            fill="currentColor"
            stroke={stroke}
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />
          <ellipse
            cx="50"
            cy="10"
            rx="48"
            ry="9"
            fill="currentColor"
            stroke={stroke}
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <div
          className={`absolute inset-0 flex items-center justify-center px-2 pt-3 text-center text-sm ${labelText}`}
        >
          {label}
        </div>
      </div>
    )
  }

  const base =
    'flex h-full w-full items-center justify-center whitespace-pre-line border border-slate-400 bg-white px-3 text-center text-sm text-slate-800 shadow-sm dark:border-slate-400 dark:bg-slate-700 dark:text-slate-100'
  if (shape === 'circle' || shape === 'doublecircle') {
    return (
      <div
        className={`${base} rounded-full ${shape === 'doublecircle' ? 'ring-2 ring-slate-400 ring-offset-1 dark:ring-offset-slate-900' : ''}`}
      >
        {label}
      </div>
    )
  }
  if (shape === 'stadium') {
    return <div className={`${base} rounded-full`}>{label}</div>
  }
  if (shape === 'round') {
    return <div className={`${base} rounded-2xl`}>{label}</div>
  }
  // rect (기본)
  return <div className={`${base} rounded-md`}>{label}</div>
}

// 커스텀 노드: 모양 본체 + 위/아래 연결 핸들
const NodeLabelChangeContext = createContext(() => {})
const NodeSizeChangeContext = createContext(() => {})

function ShapeNode({ id, data, width }) {
  const onLabelChange = useContext(NodeLabelChangeContext)
  const onSizeChange = useContext(NodeSizeChangeContext)
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(data.label ?? id)
  const textareaRef = useRef(null)
  const isComposingRef = useRef(false)
  const commitAfterCompositionRef = useRef(false)

  useEffect(() => {
    if (!editing) setValue(data.label ?? id)
  }, [data.label, editing, id])

  useEffect(() => {
    if (!editing || !textareaRef.current) return
    const editor = textareaRef.current
    editor.focus()
    editor.select()
  }, [editing])

  useEffect(() => {
    if (!editing || !textareaRef.current) return
    const editor = textareaRef.current
    editor.style.height = 'auto'
    editor.style.height = `${editor.scrollHeight}px`
  }, [editing, value])

  const commit = (nextValue = value) => {
    const next = nextValue.trim() || id
    setEditing(false)
    if (next !== data.label) onLabelChange(id, next)
  }

  return (
    <div
      className="relative h-full w-full"
      onDoubleClick={(e) => {
        e.stopPropagation()
        setValue(data.label ?? id)
        setEditing(true)
      }}
    >
      <NodeResizer
        isVisible={Boolean(data.resizeSelected) && !editing}
        minWidth={60}
        minHeight={36}
        lineClassName="!border-blue-500"
        handleClassName="!h-2.5 !w-2.5 !border-blue-600 !bg-white"
        onResizeEnd={(_event, params) => {
          onSizeChange(id, { width: params.width, height: params.height })
        }}
      />
      <Handle type="target" position={Position.Top} className="!bg-slate-400" />
      <ShapeBody shape={data.shape || 'rect'} label={data.label} />
      {editing && (
        <div
          className="absolute inset-x-0 top-1/2 z-10 flex -translate-y-1/2 items-center justify-center"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={(e) => commit(e.currentTarget.value)}
            onCompositionStart={() => {
              isComposingRef.current = true
            }}
            onCompositionEnd={(e) => {
              isComposingRef.current = false
              if (commitAfterCompositionRef.current) {
                commitAfterCompositionRef.current = false
                commit(e.currentTarget.value)
              }
            }}
            onDoubleClick={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                if (isComposingRef.current || e.nativeEvent.isComposing) {
                  commitAfterCompositionRef.current = true
                  return
                }
                e.preventDefault()
                commit(e.currentTarget.value)
              } else if (e.key === 'Escape') {
                setValue(data.label ?? id)
                setEditing(false)
              }
            }}
            rows={estimateLabelEditorRows(value, width ?? 160)}
            className="nodrag nowheel w-full resize-none overflow-hidden rounded border border-blue-400 bg-white px-2 py-1 text-center text-sm leading-relaxed text-slate-900 shadow outline-none ring-2 ring-blue-500"
          />
        </div>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-slate-400" />
    </div>
  )
}

const nodeTypes = { group: GroupNode, shape: ShapeNode }
const edgeTypes = { editable: EditableEdge }
const ADD_NODE_SHAPES = [
  { key: 'rect', label: '사각형 노드', icon: '□' },
  { key: 'diamond', label: '마름모 노드', icon: '◇' },
  { key: 'cylinder', label: '원통 노드', icon: '▭' },
  { key: 'stadium', label: '스타디움 노드', icon: '⬭' },
  { key: 'round', label: '둥근 노드', icon: '▢' },
  { key: 'circle', label: '원 노드', icon: '○' },
]

function getAbsoluteNodePosition(node, allNodes) {
  const byId = new Map(allNodes.map((currentNode) => [currentNode.id, currentNode]))
  let x = node.position?.x ?? 0
  let y = node.position?.y ?? 0
  let parent = node.parentId ? byId.get(node.parentId) : null

  while (parent) {
    x += parent.position?.x ?? 0
    y += parent.position?.y ?? 0
    parent = parent.parentId ? byId.get(parent.parentId) : null
  }

  return { x, y }
}

function getViewportZoom(viewport) {
  const transform = window.getComputedStyle(viewport).transform
  if (!transform || transform === 'none') return 1
  const match = transform.match(/^matrix\(([^,]+)/)
  const parsed = match ? Number.parseFloat(match[1]) : 1
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

function getRenderedDiagramBounds(viewport) {
  const elements = Array.from(
    viewport.querySelectorAll(
      [
        '.react-flow__node',
        '.react-flow__edge-path',
        '.react-flow__connection-path',
        '.edge-label-text',
        '.edge-label-hitbox',
      ].join(','),
    ),
  )

  return getFlowBoundsFromClientRects(
    viewport.getBoundingClientRect(),
    getViewportZoom(viewport),
    elements.map((element) => element.getBoundingClientRect()),
  )
}

function EditorInner({
  initialCode,
  onCodeChange,
  theme,
  setTheme,
  showGrid,
  setShowGrid,
  fitNodeWidthToText,
  setFitNodeWidthToText,
  leftWidth,
  setLeftWidth,
}) {
  const [code, setCode] = useState(initialCode ?? INITIAL_CODE)
  const [error, setError] = useState(null)
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [highlightedCodeLine, setHighlightedCodeLine] = useState(null)
  const [codeScrollTop, setCodeScrollTop] = useState(0)
  const [addNodeShape, setAddNodeShape] = useState('rect')
  const [codeLineMetrics, setCodeLineMetrics] = useState({
    lineHeight: 22,
    paddingTop: 16,
  })

  // 스플리터 드래그 시 컨테이너 기준 좌표 계산용
  const containerRef = useRef(null)
  const codeTextareaRef = useRef(null)
  const codeHighlightTimerRef = useRef(null)
  const reactFlow = useReactFlow()

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
    convertMermaid(text, { fitNodeWidthToText }).then((res) => {
      if (seq !== seqRef.current) return // 더 최신 입력이 있으면 폐기
      if (res.error) {
        setError(res.error) // 파싱 실패: 직전 그래프 유지, 에러만 표시
        return
      }
      setError(null)
      const groups = res.groups ?? []

      // 노드 -> 소속 그룹 매핑 (한 노드는 첫 그룹에만 소속)
      const nodeToGroup = new Map()
      for (const g of groups) {
        for (const id of g.nodeIds) {
          if (!nodeToGroup.has(id)) nodeToGroup.set(id, g)
        }
      }

      // 그룹 박스 노드: 드래그 가능(자식 동반 이동), 멤버 노드 뒤(zIndex 0)
      const groupNodes = groups.map((g) => ({
        id: `__group_${g.id}`,
        type: 'group',
        position: g.position,
        data: { label: g.label, groupId: g.id, customSize: Boolean(g.customSize) },
        style: { width: g.width, height: g.height },
        zIndex: 0,
      }))

      // 멤버 노드는 그룹의 자식(parentId)으로 두고 좌표를 그룹 기준 상대좌표로 변환
      // -> 그룹을 드래그하면 자식도 함께 이동, extent:'parent'로 박스 안에 유지
      const flowNodes = res.nodes.map((n) => {
        // 모양별 크기를 style로 강제(커스텀 노드는 자동 크기라 명시 필요)
        const styled = {
          ...n,
          style: { width: n.width, height: n.height },
          zIndex: 1,
        }
        const g = nodeToGroup.get(n.id)
        if (g) {
          return {
            ...styled,
            parentId: `__group_${g.id}`,
            extent: 'parent',
            position: {
              x: n.position.x - g.position.x,
              y: n.position.y - g.position.y,
            },
          }
        }
        return styled
      })

      setNodes([...groupNodes, ...flowNodes])
      setEdges(
        res.edges.map((edge) => ({
          ...edge,
          type: 'editable',
          data: { label: edge.label ?? '' },
        })),
      )
    })
  }

  // 초기 코드 1회 파싱
  useEffect(() => {
    runParse(code)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    return () => {
      if (codeHighlightTimerRef.current) clearTimeout(codeHighlightTimerRef.current)
    }
  }, [])

  useEffect(() => {
    runParse(code)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitNodeWidthToText])

  // 코드 변경(타이핑/캔버스 동기화)을 상위 탭 상태로 올려 보존
  useEffect(() => {
    if (onCodeChange) onCodeChange(code)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])

  // 텍스트 입력 감지 -> 디바운스 후 파싱
  const handleCodeChange = (e) => {
    const text = e.target.value
    setCode(text)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => runParse(text), 250)
  }

  // Canvas -> Code : 현재 노드/선을 Mermaid 코드로 변환해 Textarea 갱신
  // (그룹 박스 노드는 실제 노드가 아니므로 코드 변환에서 제외)
  const handleNodeLabelChange = (id, label) => {
    const nextCode = updateNodeLabelInMermaid(code, id, label)
    setCode(nextCode)
    runParse(nextCode)
  }

  const handleEdgeLabelChange = (id, label) => {
    const edge = edgesRef.current.find((currentEdge) => currentEdge.id === id)
    if (!edge) return

    const nextCode = updateEdgeLabelInMermaid(code, {
      source: edge.source,
      target: edge.target,
      label,
    })
    setCode(nextCode)
    runParse(nextCode)
  }

  const handleNodeSizeChange = (id, size) => {
    const nextCode = updateNodeSizeInMermaid(code, id, size)
    const width = Math.round(size.width)
    const height = Math.round(size.height)

    setNodes((currentNodes) =>
      currentNodes.map((node) =>
        node.id === id
          ? {
              ...node,
              width,
              height,
              data: { ...node.data, customSize: true },
            }
          : node,
      ),
    )
    setCode(nextCode)
  }

  const handleGroupSizeChange = (groupId, size) => {
    const nextCode = updateSubgraphSizeInMermaid(code, groupId, size)
    const width = Math.round(size.width)
    const height = Math.round(size.height)
    const reactFlowId = `__group_${groupId}`

    setNodes((currentNodes) =>
      currentNodes.map((node) =>
        node.id === reactFlowId
          ? {
              ...node,
              width,
              height,
              style: { ...node.style, width, height },
              data: { ...node.data, customSize: true },
            }
          : node,
      ),
    )
    setCode(nextCode)
  }

  const handleCodeScroll = (e) => {
    setCodeScrollTop(e.currentTarget.scrollTop)
  }

  const focusDiagramNode = (id) => {
    const targetNode = nodesRef.current.find((node) => node.id === id)
    if (!targetNode) return

    setNodes((currentNodes) =>
      currentNodes.map((currentNode) => ({
        ...currentNode,
        data: {
          ...currentNode.data,
          resizeSelected: currentNode.id === id,
        },
      })),
    )

    const position = getAbsoluteNodePosition(targetNode, nodesRef.current)
    const width = Number(targetNode.width ?? targetNode.style?.width ?? 0)
    const height = Number(targetNode.height ?? targetNode.style?.height ?? 0)
    reactFlow.setCenter(position.x + width / 2, position.y + height / 2, {
      zoom: 1.2,
      duration: 350,
    })
  }

  const handleCodeClick = (e) => {
    const target = findMermaidElementAtOffset(
      code,
      e.currentTarget.selectionStart,
      nodesRef.current.map((node) => ({
        id: node.id,
        type: node.type === 'group' ? 'group' : 'node',
        groupId: node.data?.groupId,
        label: node.data?.label,
      })),
    )
    if (target) focusDiagramNode(target.id)
  }

  const handleCanvasNodeClick = (_event, node) => {
    setNodes((currentNodes) =>
      currentNodes.map((currentNode) => ({
        ...currentNode,
        data: {
          ...currentNode.data,
          resizeSelected: currentNode.id === node.id,
        },
      })),
    )

    const location =
      node.type === 'group'
        ? findSubgraphLocationInMermaid(
            code,
            node.data?.groupId ?? node.id.replace(/^__group_/, ''),
            node.data?.label,
          )
        : findNodeLocationInMermaid(code, node.id, node.data?.label)
    const textarea = codeTextareaRef.current
    if (!location || !textarea) return

    const styles = window.getComputedStyle(textarea)
    const fontSize = Number.parseFloat(styles.fontSize) || 14
    const lineHeight = Number.parseFloat(styles.lineHeight) || fontSize * 1.625
    const paddingTop = Number.parseFloat(styles.paddingTop) || 0
    const nextScrollTop = scrollTopForLine({
      line: location.line,
      lineHeight,
      paddingTop,
      clientHeight: textarea.clientHeight,
      scrollHeight: textarea.scrollHeight,
    })

    textarea.focus()
    textarea.setSelectionRange(location.start, location.end)
    textarea.scrollTop = nextScrollTop
    setCodeLineMetrics({ lineHeight, paddingTop })
    setCodeScrollTop(nextScrollTop)

    requestAnimationFrame(() => {
      setHighlightedCodeLine({ line: location.line, key: Date.now() })
    })

    if (codeHighlightTimerRef.current) clearTimeout(codeHighlightTimerRef.current)
    codeHighlightTimerRef.current = setTimeout(() => {
      setHighlightedCodeLine(null)
      codeHighlightTimerRef.current = null
    }, 1800)
  }

  const handlePaneClick = () => {
    setNodes((currentNodes) =>
      currentNodes.map((node) => ({
        ...node,
        data: { ...node.data, resizeSelected: false },
      })),
    )
  }

  // 새 화살표 연결 -> 엣지 추가 후 코드 갱신
  const onConnect = (params) => {
    const nextCode = addEdgeToMermaid(code, {
      source: params.source,
      target: params.target,
    })
    setCode(nextCode)
    runParse(nextCode)
  }

  const handleAddNode = () => {
    const nextCode = addNodeToMermaid(code, {
      shape: addNodeShape,
      label: '새 노드',
    })
    setCode(nextCode)
    runParse(nextCode)
  }

  const onDelete = ({ nodes: deletedNodes, edges: deletedEdges }) => {
    const nextCode = removeSelectionFromMermaid(code, {
      nodes: deletedNodes
        .filter((node) => node.type !== 'group')
        .map((node) => node.id),
      edges: deletedEdges.map((edge) => ({
        source: edge.source,
        target: edge.target,
      })),
    })

    if (nextCode === code) return
    setCode(nextCode)
    runParse(nextCode)
  }

  // 노드 드래그 종료 -> 코드 갱신
  // 단, subgraph(그룹)가 있으면 코드 역생성이 subgraph를 평탄화하므로 생략
  // (노드 위치는 Mermaid 문법에 없어 드래그만으로 코드가 바뀔 이유도 없음)
  const onNodeDragStop = () => {
    // Mermaid flowchart syntax does not persist freeform canvas positions.
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

  // 현재 캔버스를 PNG/SVG 이미지로 내보내기 (노드 영역에 맞춰 캡처)
  const exportImage = async (type) => {
    const viewport = document.querySelector('.react-flow__viewport')
    const all = nodesRef.current
    if (!viewport || all.length === 0) return
    const bounds = getRenderedDiagramBounds(viewport) ?? reactFlow.getNodesBounds(all)
    const frame = getTightExportFrame(bounds)
    const opts = {
      backgroundColor: theme === 'dark' ? '#0f172a' : '#ffffff',
      width: frame.width,
      height: frame.height,
      style: {
        width: `${frame.width}px`,
        height: `${frame.height}px`,
        transform: frame.transform,
      },
    }
    const dataUrl = await (type === 'svg' ? toSvg : toPng)(viewport, opts)
    triggerDownload(dataUrl, `diagram.${type}`)
  }

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code)
    } catch {
      /* 클립보드 권한 없음 등 무시 */
    }
  }

  const exportMmd = () => {
    const url = URL.createObjectURL(new Blob([code], { type: 'text/plain' }))
    triggerDownload(url, 'diagram.mmd')
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  // ---- Undo/Redo (코드 편집 히스토리) ----
  const historyRef = useRef([code])
  const indexRef = useRef(0)
  const isUndoRedoRef = useRef(false)
  const lastEditTimeRef = useRef(0)

  useEffect(() => {
    if (isUndoRedoRef.current) {
      isUndoRedoRef.current = false
      return
    }
    const hist = historyRef.current
    if (hist[indexRef.current] === code) return
    const now = Date.now()
    const coalesce = now - lastEditTimeRef.current < 600 // 빠른 타이핑은 한 단계로 합침
    lastEditTimeRef.current = now
    const next = hist.slice(0, indexRef.current + 1)
    if (coalesce && next.length > 1) {
      next[next.length - 1] = code
    } else {
      next.push(code)
      if (next.length > 100) next.shift()
    }
    historyRef.current = next
    indexRef.current = next.length - 1
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])

  // 코드를 프로그램적으로 적용(템플릿/방향/undo) → 즉시 재파싱
  const applyCodeAndParse = (text) => {
    setCode(text)
    runParse(text)
  }

  const undo = () => {
    if (indexRef.current > 0) {
      indexRef.current -= 1
      isUndoRedoRef.current = true
      applyCodeAndParse(historyRef.current[indexRef.current])
    }
  }
  const redo = () => {
    if (indexRef.current < historyRef.current.length - 1) {
      indexRef.current += 1
      isUndoRedoRef.current = true
      applyCodeAndParse(historyRef.current[indexRef.current])
    }
  }

  // 텍스트영역 단축키: Ctrl+Z / Ctrl+Y(또는 Ctrl+Shift+Z)
  const onCodeKeyDown = (e) => {
    const mod = e.ctrlKey || e.metaKey
    const k = e.key.toLowerCase()
    if (mod && k === 'z' && !e.shiftKey) {
      e.preventDefault()
      undo()
    } else if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) {
      e.preventDefault()
      redo()
    }
  }

  // 레이아웃 방향 TD <-> LR 토글 (코드 헤더 변경)
  const toggleDirection = () => {
    const re = /^(\s*(?:graph|flowchart)\s+)(TB|TD|LR|RL|BT)\b/i
    const m = code.match(re)
    if (!m) return
    const isVertical = /^(TB|TD|BT)$/i.test(m[2])
    applyCodeAndParse(code.replace(re, `$1${isVertical ? 'LR' : 'TD'}`))
  }

  const insertTemplate = (key) => {
    if (TEMPLATES[key]) applyCodeAndParse(TEMPLATES[key])
  }

  const btnClass =
    'rounded-md border border-slate-300 bg-white/90 px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm hover:bg-white'
  const shapeBtnClass = (shape) =>
    shape === addNodeShape
      ? 'flex h-8 w-8 items-center justify-center rounded-md border border-blue-500 bg-blue-50 text-sm font-semibold text-blue-700 shadow-sm ring-2 ring-blue-500'
      : 'flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white/90 text-sm font-semibold text-slate-700 shadow-sm hover:bg-white'

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
        {/* 코드 편의 툴바: 예제 / 방향 / undo-redo */}
        <div className="flex items-center gap-1 border-b border-slate-700 bg-slate-800/60 px-2 py-1">
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) insertTemplate(e.target.value)
            }}
            className="rounded bg-slate-700 px-1.5 py-1 text-xs text-slate-200 outline-none"
            title="예제 템플릿 삽입"
          >
            <option value="">예제 삽입…</option>
            <option value="basic">기본 플로우차트</option>
            <option value="decision">조건 분기</option>
            <option value="subgraph">서브그래프</option>
            <option value="shapes">도형 모음</option>
          </select>
          <button
            type="button"
            onClick={toggleDirection}
            className="rounded px-2 py-1 text-xs text-slate-300 hover:bg-slate-700 hover:text-white"
            title="레이아웃 방향 TD↔LR"
          >
            ⇄ 방향
          </button>
          <button
            type="button"
            onClick={undo}
            className="rounded px-2 py-1 text-xs text-slate-300 hover:bg-slate-700 hover:text-white"
            title="실행 취소 (Ctrl+Z)"
          >
            ↩ Undo
          </button>
          <button
            type="button"
            onClick={redo}
            className="rounded px-2 py-1 text-xs text-slate-300 hover:bg-slate-700 hover:text-white"
            title="다시 실행 (Ctrl+Y)"
          >
            ↪ Redo
          </button>
        </div>
        <div className="relative min-h-0 flex-1">
        <textarea
          ref={codeTextareaRef}
          value={code}
          onChange={handleCodeChange}
          onClick={handleCodeClick}
          onKeyDown={onCodeKeyDown}
          onScroll={handleCodeScroll}
          spellCheck={false}
          wrap="off"
          className="code-editor-textarea h-full w-full resize-none bg-slate-900 p-4 font-mono text-sm leading-relaxed text-slate-100 outline-none"
          placeholder={'graph TD\n  A[시작] --> B[종료]'}
        />
          {highlightedCodeLine && (
            <div
              key={highlightedCodeLine.key}
              className="code-line-flash pointer-events-none absolute left-0 right-0"
              style={{
                top:
                  codeLineMetrics.paddingTop +
                  highlightedCodeLine.line * codeLineMetrics.lineHeight -
                  codeScrollTop,
                height: codeLineMetrics.lineHeight,
              }}
            />
          )}
        </div>
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
        className="group flex w-2.5 shrink-0 cursor-col-resize items-center justify-center bg-slate-600 transition-colors hover:bg-blue-500"
      >
        <div className="h-10 w-1 rounded-full bg-slate-300 group-hover:bg-white" />
      </div>

      {/* 오른쪽: React Flow 비주얼 캔버스 */}
      <div
        className={`relative flex-1 ${theme === 'dark' ? 'bg-slate-900' : 'bg-slate-50'}`}
      >
        <div className="absolute left-3 top-3 z-10 flex flex-wrap items-center gap-1 rounded-md border border-slate-300 bg-white/90 p-1 shadow-sm">
          {ADD_NODE_SHAPES.map((shape) => (
            <button
              key={shape.key}
              type="button"
              aria-label={shape.label}
              title={shape.label}
              aria-pressed={addNodeShape === shape.key}
              onClick={() => setAddNodeShape(shape.key)}
              className={shapeBtnClass(shape.key)}
            >
              {shape.icon}
            </button>
          ))}
          <button
            type="button"
            aria-label="노드 추가"
            onClick={handleAddNode}
            className={btnClass}
          >
            + 노드 추가
          </button>
        </div>

        {/* 툴바: 내보내기 / 테마 / 격자 토글 */}
        <div className="absolute right-3 top-3 z-10 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={() => exportImage('png')} className={btnClass}>
            🖼 PNG
          </button>
          <button type="button" onClick={() => exportImage('svg')} className={btnClass}>
            🖼 SVG
          </button>
          <button type="button" onClick={exportMmd} className={btnClass}>
            💾 .mmd
          </button>
          <button type="button" onClick={copyCode} className={btnClass}>
            📋 복사
          </button>
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
          <button
            type="button"
            onClick={() => setFitNodeWidthToText((v) => !v)}
            aria-pressed={fitNodeWidthToText}
            className={
              fitNodeWidthToText
                ? 'rounded-md border border-blue-500 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 shadow-sm ring-2 ring-blue-500 hover:bg-blue-50'
                : btnClass
            }
            title="도형 가로 길이를 텍스트에 맞춥니다"
          >
            {fitNodeWidthToText ? '너비 맞춤 ON' : '너비 맞춤 OFF'}
          </button>
        </div>

        <NodeLabelChangeContext.Provider value={handleNodeLabelChange}>
          <NodeSizeChangeContext.Provider value={handleNodeSizeChange}>
            <GroupSizeChangeContext.Provider value={handleGroupSizeChange}>
              <EdgeLabelChangeContext.Provider value={handleEdgeLabelChange}>
              <ReactFlow
                colorMode={theme}
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onDelete={onDelete}
                onNodeClick={handleCanvasNodeClick}
                onPaneClick={handlePaneClick}
                onNodeDragStop={onNodeDragStop}
                deleteKeyCode={['Backspace', 'Delete']}
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
              </EdgeLabelChangeContext.Provider>
            </GroupSizeChangeContext.Provider>
          </NodeSizeChangeContext.Provider>
        </NodeLabelChangeContext.Provider>
      </div>
    </div>
  )
}

// 상단 탭 바: 여러 Mermaid 다이어그램을 탭으로 전환 (더블클릭으로 이름 변경)
function TabBar({ tabs, activeId, onSelect, onAdd, onClose, onRename, onReorder, right }) {
  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    if (editingId !== null) inputRef.current?.select()
  }, [editingId])

  const startEdit = (t) => {
    setEditingId(t.id)
    setDraft(t.name)
  }
  const commit = () => {
    if (editingId !== null) onRename(editingId, draft.trim() || '제목 없음')
    setEditingId(null)
  }

  return (
    <div className="flex items-stretch gap-1 border-b border-slate-700 bg-slate-800 px-2 pt-1.5">
      {tabs.map((t) => {
        const active = t.id === activeId
        const editing = editingId === t.id
        return (
          <div
            key={t.id}
            onClick={() => onSelect(t.id)}
            onDoubleClick={() => startEdit(t)}
            draggable={!editing}
            onDragStart={(e) => e.dataTransfer.setData('text/plain', String(t.id))}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              const from = Number(e.dataTransfer.getData('text/plain'))
              if (!Number.isNaN(from)) onReorder(from, t.id)
            }}
            title="더블클릭하여 이름 변경 · 드래그하여 순서 변경"
            className={`group flex cursor-pointer items-center gap-2 rounded-t-md px-3 py-1.5 text-sm ${
              active
                ? 'bg-slate-900 text-slate-100'
                : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {editing ? (
              <input
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onBlur={commit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commit()
                  else if (e.key === 'Escape') setEditingId(null)
                }}
                className="w-28 rounded bg-slate-700 px-1 text-sm text-slate-100 outline-none ring-1 ring-blue-500"
              />
            ) : (
              <span className="max-w-[160px] truncate">{t.name}</span>
            )}
            {tabs.length > 1 && !editing && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onClose(t.id)
                }}
                className="rounded text-slate-400 hover:bg-slate-600 hover:text-white"
                title="탭 닫기"
              >
                <span className="px-1">×</span>
              </button>
            )}
          </div>
        )
      })}
      <button
        type="button"
        onClick={onAdd}
        title="새 다이어그램 탭"
        className="ml-1 self-center rounded px-2 py-1 text-lg leading-none text-slate-300 hover:bg-slate-700 hover:text-white"
      >
        +
      </button>
      {right && (
        <div className="ml-auto flex items-center gap-1 self-center pb-1">{right}</div>
      )}
    </div>
  )
}

const NEW_TAB_CODE = 'graph TD\n  A[시작] --> B[종료]'

// ---- 워크스페이스 영속성(localStorage) ----
const STORAGE_KEY = 'mermaid-gilview-workspace'
const DEFAULT_WORKSPACE = {
  tabs: [{ id: 1, name: '다이어그램 1', code: INITIAL_CODE }],
  activeId: 1,
  settings: { theme: 'light', showGrid: true, fitNodeWidthToText: false, leftWidth: 440 },
}

function loadWorkspace() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_WORKSPACE
    const data = JSON.parse(raw)
    if (!data || !Array.isArray(data.tabs) || data.tabs.length === 0) {
      return DEFAULT_WORKSPACE
    }
    return {
      tabs: data.tabs,
      activeId: data.activeId ?? data.tabs[0].id,
      settings: { ...DEFAULT_WORKSPACE.settings, ...(data.settings ?? {}) },
    }
  } catch {
    return DEFAULT_WORKSPACE
  }
}

export default function MermaidVisualEditor() {
  // 최초 1회만 localStorage 로드
  const initialRef = useRef(null)
  if (initialRef.current === null) initialRef.current = loadWorkspace()
  const init = initialRef.current

  const idRef = useRef(Math.max(0, ...init.tabs.map((t) => t.id)) + 1)
  const [tabs, setTabs] = useState(init.tabs)
  const [activeId, setActiveId] = useState(init.activeId)

  // 설정(테마/격자/패널폭)은 앱 레벨 — 탭 전환에도 유지 + 저장
  const [theme, setTheme] = useState(init.settings.theme)
  const [showGrid, setShowGrid] = useState(init.settings.showGrid)
  const [fitNodeWidthToText, setFitNodeWidthToText] = useState(
    init.settings.fitNodeWidthToText,
  )
  const [leftWidth, setLeftWidth] = useState(init.settings.leftWidth)

  // 변경 시 디바운스 자동 저장
  const saveTimer = useRef(null)
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            version: 1,
            tabs,
            activeId,
            settings: { theme, showGrid, fitNodeWidthToText, leftWidth },
          }),
        )
      } catch {
        /* 용량 초과 등은 무시 */
      }
    }, 400)
    return () => saveTimer.current && clearTimeout(saveTimer.current)
  }, [tabs, activeId, theme, showGrid, fitNodeWidthToText, leftWidth])

  const active = tabs.find((t) => t.id === activeId) ?? tabs[0]

  const updateActiveCode = (code) => {
    setTabs((ts) => ts.map((t) => (t.id === activeId ? { ...t, code } : t)))
  }

  const renameTab = (id, name) => {
    setTabs((ts) => ts.map((t) => (t.id === id ? { ...t, name } : t)))
  }

  const reorderTabs = (fromId, toId) => {
    setTabs((ts) => {
      const from = ts.findIndex((t) => t.id === fromId)
      const to = ts.findIndex((t) => t.id === toId)
      if (from < 0 || to < 0 || from === to) return ts
      const next = [...ts]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }

  // .mmd/.txt 파일을 새 탭으로 가져오기
  const mmdInputRef = useRef(null)
  const jsonInputRef = useRef(null)

  const importMmd = (file) => {
    const reader = new FileReader()
    reader.onload = () => {
      const id = idRef.current++
      const name = file.name.replace(/\.(mmd|md|txt)$/i, '') || `다이어그램 ${tabs.length + 1}`
      setTabs((ts) => [...ts, { id, name, code: String(reader.result) }])
      setActiveId(id)
    }
    reader.readAsText(file)
  }

  // 전체 워크스페이스(모든 탭 + 설정) JSON 백업/복원
  const backupWorkspace = () => {
    const data = {
      version: 1,
      tabs,
      activeId,
      settings: { theme, showGrid, fitNodeWidthToText, leftWidth },
    }
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
    )
    triggerDownload(url, 'mermaid-workspace.json')
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const restoreWorkspace = (file) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result))
        if (!Array.isArray(data.tabs) || data.tabs.length === 0) return
        if (!window.confirm('현재 워크스페이스를 백업 파일로 교체할까요?')) return
        setTabs(data.tabs)
        setActiveId(data.activeId ?? data.tabs[0].id)
        if (data.settings) {
          setTheme(data.settings.theme ?? theme)
          setShowGrid(data.settings.showGrid ?? showGrid)
          setFitNodeWidthToText(
            data.settings.fitNodeWidthToText ?? fitNodeWidthToText,
          )
          setLeftWidth(data.settings.leftWidth ?? leftWidth)
        }
        idRef.current = Math.max(0, ...data.tabs.map((t) => t.id)) + 1
      } catch {
        window.alert('백업 파일을 읽을 수 없습니다.')
      }
    }
    reader.readAsText(file)
  }

  const tabActionBtn =
    'rounded px-2 py-1 text-xs text-slate-300 hover:bg-slate-700 hover:text-white'

  const addTab = () => {
    const id = idRef.current++
    setTabs((ts) => [
      ...ts,
      { id, name: `다이어그램 ${ts.length + 1}`, code: NEW_TAB_CODE },
    ])
    setActiveId(id)
  }

  const closeTab = (id) => {
    const tab = tabs.find((t) => t.id === id)
    // 내용이 있는 탭은 닫기 전에 확인
    if (tab && tab.code.trim() && tab.code.trim() !== NEW_TAB_CODE.trim()) {
      if (!window.confirm(`'${tab.name}' 탭을 닫을까요? 저장되지 않은 내용은 사라집니다.`)) {
        return
      }
    }
    setTabs((ts) => {
      if (ts.length <= 1) return ts
      const idx = ts.findIndex((t) => t.id === id)
      const next = ts.filter((t) => t.id !== id)
      if (id === activeId) {
        const fallback = next[Math.max(0, idx - 1)]
        setActiveId(fallback.id)
      }
      return next
    })
  }

  return (
    <div className="flex h-full w-full flex-col">
      <TabBar
        tabs={tabs}
        activeId={activeId}
        onSelect={setActiveId}
        onAdd={addTab}
        onClose={closeTab}
        onRename={renameTab}
        onReorder={reorderTabs}
        right={
          <>
            <button
              type="button"
              className={tabActionBtn}
              onClick={() => mmdInputRef.current?.click()}
              title=".mmd/.txt 파일을 새 탭으로 가져오기"
            >
              📥 가져오기
            </button>
            <button
              type="button"
              className={tabActionBtn}
              onClick={backupWorkspace}
              title="모든 탭 + 설정을 JSON으로 백업"
            >
              ⬇ 백업
            </button>
            <button
              type="button"
              className={tabActionBtn}
              onClick={() => jsonInputRef.current?.click()}
              title="백업 JSON에서 복원"
            >
              ⬆ 복원
            </button>
            <input
              ref={mmdInputRef}
              type="file"
              accept=".mmd,.md,.txt"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) importMmd(f)
                e.target.value = ''
              }}
            />
            <input
              ref={jsonInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) restoreWorkspace(f)
                e.target.value = ''
              }}
            />
          </>
        }
      />
      <div className="min-h-0 flex-1">
        {/* key=activeId: 탭 전환 시 해당 탭의 코드로 새로 마운트되어 캔버스 재구성 */}
        <ReactFlowProvider key={activeId}>
          <EditorInner
            key={activeId}
            initialCode={active.code}
            onCodeChange={updateActiveCode}
            theme={theme}
            setTheme={setTheme}
            showGrid={showGrid}
            setShowGrid={setShowGrid}
            fitNodeWidthToText={fitNodeWidthToText}
            setFitNodeWidthToText={setFitNodeWidthToText}
            leftWidth={leftWidth}
            setLeftWidth={setLeftWidth}
          />
        </ReactFlowProvider>
      </div>
    </div>
  )
}
