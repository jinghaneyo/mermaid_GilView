import { useEffect, useRef, useState } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Handle,
  Position,
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

// subgraph 그룹 박스를 그리는 커스텀 노드 (멤버 노드 뒤에 깔리는 사각 박스 + 제목)
function GroupNode({ data }) {
  return (
    <div className="h-full w-full rounded-lg border-2 border-amber-400/80 bg-amber-200/20">
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
  const labelText = 'text-slate-800 dark:text-slate-100'

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
    'flex h-full w-full items-center justify-center border border-slate-400 bg-white px-3 text-center text-sm text-slate-800 shadow-sm dark:border-slate-400 dark:bg-slate-700 dark:text-slate-100'
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
function ShapeNode({ data }) {
  return (
    <div className="relative h-full w-full">
      <Handle type="target" position={Position.Top} className="!bg-slate-400" />
      <ShapeBody shape={data.shape || 'rect'} label={data.label} />
      <Handle type="source" position={Position.Bottom} className="!bg-slate-400" />
    </div>
  )
}

const nodeTypes = { group: GroupNode, shape: ShapeNode }

function EditorInner({
  initialCode,
  onCodeChange,
  theme,
  setTheme,
  showGrid,
  setShowGrid,
  leftWidth,
  setLeftWidth,
}) {
  const [code, setCode] = useState(initialCode ?? INITIAL_CODE)
  const [error, setError] = useState(null)
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])

  // 스플리터 드래그 시 컨테이너 기준 좌표 계산용
  const containerRef = useRef(null)

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
        data: { label: g.label },
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
      setEdges(res.edges)
    })
  }

  // 초기 코드 1회 파싱
  useEffect(() => {
    runParse(code)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
  const syncCanvasToCode = (nextNodes, nextEdges) => {
    const realNodes = nextNodes.filter((n) => n.type !== 'group')
    setCode(convertCanvasToMermaid(realNodes, nextEdges))
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
  // 단, subgraph(그룹)가 있으면 코드 역생성이 subgraph를 평탄화하므로 생략
  // (노드 위치는 Mermaid 문법에 없어 드래그만으로 코드가 바뀔 이유도 없음)
  const onNodeDragStop = () => {
    const hasGroups = nodesRef.current.some((n) => n.type === 'group')
    if (hasGroups) return
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
        className="group flex w-2.5 shrink-0 cursor-col-resize items-center justify-center bg-slate-600 transition-colors hover:bg-blue-500"
      >
        <div className="h-10 w-1 rounded-full bg-slate-300 group-hover:bg-white" />
      </div>

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
          nodeTypes={nodeTypes}
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

// 상단 탭 바: 여러 Mermaid 다이어그램을 탭으로 전환 (더블클릭으로 이름 변경)
function TabBar({ tabs, activeId, onSelect, onAdd, onClose, onRename }) {
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
            title="더블클릭하여 이름 변경"
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
    </div>
  )
}

const NEW_TAB_CODE = 'graph TD\n  A[시작] --> B[종료]'

// ---- 워크스페이스 영속성(localStorage) ----
const STORAGE_KEY = 'mermaid-gilview-workspace'
const DEFAULT_WORKSPACE = {
  tabs: [{ id: 1, name: '다이어그램 1', code: INITIAL_CODE }],
  activeId: 1,
  settings: { theme: 'light', showGrid: true, leftWidth: 440 },
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
            settings: { theme, showGrid, leftWidth },
          }),
        )
      } catch {
        /* 용량 초과 등은 무시 */
      }
    }, 400)
    return () => saveTimer.current && clearTimeout(saveTimer.current)
  }, [tabs, activeId, theme, showGrid, leftWidth])

  const active = tabs.find((t) => t.id === activeId) ?? tabs[0]

  const updateActiveCode = (code) => {
    setTabs((ts) => ts.map((t) => (t.id === activeId ? { ...t, code } : t)))
  }

  const renameTab = (id, name) => {
    setTabs((ts) => ts.map((t) => (t.id === id ? { ...t, name } : t)))
  }

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
            leftWidth={leftWidth}
            setLeftWidth={setLeftWidth}
          />
        </ReactFlowProvider>
      </div>
    </div>
  )
}
