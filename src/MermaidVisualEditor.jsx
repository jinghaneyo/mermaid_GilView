import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
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
import mermaid from 'mermaid'
import '@xyflow/react/dist/style.css'

function triggerDownload(url, filename) {
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
}
import { convertMermaid } from './lib/convertMermaid'
import { scrollTopForLine } from './lib/codeEditorScroll'
import { estimateLabelEditorRows } from './lib/labelEditorSizing'
import {
  minimapViewportRect,
  viewportFromMinimapPoint,
} from './lib/visualViewport'
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
import { addNodeToMermaidWithId } from './lib/updateNodesInMermaid'
import { placeAddedNodeNearAnchor } from './lib/placeAddedNode'
import {
  addSequenceMessage,
  addSequenceParticipant,
  moveSequenceParticipant,
  parseSequenceEditorModel,
  renameSequenceParticipant,
  updateSequenceMessageLabel,
} from './lib/sequenceDiagram'
import EditableEdge, { EdgeLabelChangeContext } from './components/EditableEdge'

/* ------------------------------------------------------------------ *
 * convertCanvasToMermaid: { nodes, edges } -> Mermaid text
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
 * MermaidVisualEditor: bidirectional Mermaid code / canvas editor
 * ------------------------------------------------------------------ */

const INITIAL_CODE = 'graph TD\nA[Start] --> B[End]'

// Templates
const TEMPLATES = {
  basic: 'graph TD\n  A[Start] --> B[Process]\n  B --> C[End]',
  decision:
    'graph TD\n  A[Start] --> B{Condition}\n  B -->|Yes| C[Process]\n  B -->|No| D[End]\n  C --> D',
  subgraph:
    'graph TD\n  subgraph Input\n    A[Collect] --> B[Validate]\n  end\n  subgraph Process\n    C[Transform] --> D[Store]\n  end\n  B --> C',
  shapes:
    'graph TD\n  A[Rectangle] --> B{Diamond}\n  B --> C[(Cylinder)]\n  B --> D([Stadium])\n  C --> E((Circle))',
  sequence:
    'sequenceDiagram\n  participant A as Alice\n  participant B as Bob\n  A->>B: Hello\n  B-->>A: Hi',
}

const GroupSizeChangeContext = createContext(() => {})

function GroupNode({ data }) {
  const onGroupSizeChange = useContext(GroupSizeChangeContext)

  return (
    <div
      className={`relative h-full w-full rounded-lg border-2 border-amber-400/80 bg-amber-200/20 ${
        data.codeFocusFlash ? 'diagram-node-flash' : ''
      }`}
    >
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

function ShapeBody({ shape, label }) {
  const stroke = '#94a3b8'
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
  return <div className={`${base} rounded-md`}>{label}</div>
}

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
      className={`relative h-full w-full ${
        data.codeFocusFlash ? 'diagram-node-flash' : ''
      }`}
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
  { key: 'rect', label: 'Rect node', icon: 'rect' },
  { key: 'diamond', label: 'Diamond node', icon: 'dia' },
  { key: 'cylinder', label: 'Cylinder node', icon: 'cyl' },
  { key: 'stadium', label: 'Stadium node', icon: 'std' },
  { key: 'round', label: 'Round node', icon: 'rnd' },
  { key: 'circle', label: 'Circle node', icon: 'cir' },
]

function isSequenceDiagram(code) {
  const firstStatement = code
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith('%%'))
  return /^sequenceDiagram\b/i.test(firstStatement ?? '')
}

function sequenceElementKey(element) {
  if (!element) return ''
  return element.type === 'participant'
    ? `participant:${element.id}`
    : `message:${element.lineIndex}`
}

function getSequenceSearchMatches(query, model) {
  const term = query.trim().toLowerCase()
  if (!term) return []

  const participantMatches = model.participants
    .filter((participant) => {
      return (
        participant.id.toLowerCase().includes(term) ||
        participant.label.toLowerCase().includes(term)
      )
    })
    .map((participant) => ({
      type: 'participant',
      id: participant.id,
      label: participant.label,
      lineIndex: participant.lineIndex,
    }))

  const messageMatches = model.messages
    .filter((message) => {
      return [message.from, message.to, message.label]
        .some((value) => String(value).toLowerCase().includes(term))
    })
    .map((message) => ({
      type: 'message',
      id: message.id,
      label: message.label,
      lineIndex: message.lineIndex,
    }))

  return [...participantMatches, ...messageMatches]
}

function lineBoundsAtIndex(code, lineIndex) {
  const lines = code.split(/\r?\n/)
  let start = 0
  for (let index = 0; index < lineIndex; index += 1) {
    start += lines[index].length + 1
  }
  return { start, end: start + (lines[lineIndex]?.length ?? 0) }
}

function lineIndexAtOffset(code, offset) {
  const safeOffset = Math.max(0, Math.min(offset, code.length))
  return code.slice(0, safeOffset).split(/\r?\n/).length - 1
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function findSequenceElementAtLine(code, lineIndex) {
  const model = parseSequenceEditorModel(code)
  const participant = model.participants.find(
    (current) => current.lineIndex === lineIndex,
  )
  if (participant) {
    return {
      type: 'participant',
      id: participant.id,
      label: participant.label,
      lineIndex: participant.lineIndex,
    }
  }

  const message = model.messages.find((current) => current.lineIndex === lineIndex)
  if (message) {
    return {
      type: 'message',
      id: message.id,
      label: message.label,
      lineIndex: message.lineIndex,
    }
  }

  return null
}

function parseSvgDimension(value) {
  if (!value) return null
  const match = String(value).trim().match(/^(\d+(?:\.\d+)?)(?:px)?$/)
  return match ? Number(match[1]) : null
}

function estimateVisualTextWidth(text) {
  const value = String(text || '')
  try {
    const isJsdom =
      typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)
    if (!isJsdom && typeof document !== 'undefined') {
      estimateVisualTextWidth.canvas ??= document.createElement('canvas')
      const context = estimateVisualTextWidth.canvas.getContext?.('2d')
      if (context) {
        context.font = '600 12px sans-serif'
        return context.measureText(value).width
      }
    }
  } catch {
    // Fall back to deterministic character estimates in non-browser test environments.
  }

  return [...value].reduce((sum, ch) => {
    const codePoint = ch.charCodeAt(0)
    const isWide =
      (codePoint >= 0x1100 && codePoint <= 0x11ff) ||
      (codePoint >= 0x3130 && codePoint <= 0x318f) ||
      (codePoint >= 0xac00 && codePoint <= 0xd7af) ||
      (codePoint >= 0x3040 && codePoint <= 0x30ff) ||
      (codePoint >= 0x4e00 && codePoint <= 0x9fff)
    return sum + (isWide ? 12 : 6.1)
  }, 0)
}

const FIT_TEXT_HORIZONTAL_PADDING = 20

function fitVisualWidth(baseWidth, label, maxWidth = 640) {
  return Math.max(
    baseWidth,
    Math.min(maxWidth, estimateVisualTextWidth(label) + FIT_TEXT_HORIZONTAL_PADDING),
  )
}

function getSvgSize(svg, fallbackWidth, fallbackHeight) {
  const svgTag = svg.match(/<svg\b[^>]*>/i)?.[0] ?? ''
  const width = parseSvgDimension(svgTag.match(/\bwidth="([^"]+)"/i)?.[1])
  const height = parseSvgDimension(svgTag.match(/\bheight="([^"]+)"/i)?.[1])
  if (width && height) return { width, height }

  const viewBox = svgTag.match(/\bviewBox="([^"]+)"/i)?.[1]
  const parts = viewBox?.split(/\s+/).map(Number) ?? []
  if (parts.length === 4 && Number.isFinite(parts[2]) && Number.isFinite(parts[3])) {
    return { width: parts[2], height: parts[3] }
  }

  return { width: fallbackWidth, height: fallbackHeight }
}

function SequenceFragmentBox({ fragment, layout, colors, isDark }) {
  const startY = layout.yForEventIndex(fragment.startEventIndex) - 32
  const endY = layout.yForEventIndex(fragment.endEventIndex) + 38
  const depthOffset = fragment.depth * 14
  const left = layout.marginX - 38 + depthOffset
  const right =
    layout.xForParticipant(layout.lastParticipantId) +
    layout.participantWidth / 2 +
    38 -
    depthOffset

  return (
    <g data-testid="sequence-fragment">
      <rect
        x={left}
        y={startY}
        width={Math.max(180, right - left)}
        height={Math.max(54, endY - startY)}
        rx="4"
        fill={isDark ? '#0f172a' : '#f8fafc'}
        stroke={isDark ? '#64748b' : '#94a3b8'}
        strokeDasharray="5 4"
      />
      <path
        d={`M${left},${startY} H${left + 86} L${left + 72},${startY + 22} H${left} Z`}
        fill={isDark ? '#1e293b' : '#e2e8f0'}
        stroke={isDark ? '#64748b' : '#94a3b8'}
      />
      <text x={left + 12} y={startY + 15} fill={colors.text} fontSize="12" fontWeight="700">
        {fragment.kind}
      </text>
      {fragment.label ? (
        <text
          x={(left + right) / 2}
          y={startY + 18}
          textAnchor="middle"
          fill={colors.text}
          fontSize="12"
        >
          [{fragment.label}]
        </text>
      ) : null}
    </g>
  )
}

function SequenceActivationBlock({ activation, layout, isDark }) {
  const x = layout.xForParticipant(activation.participant) - 5
  const top = layout.yForEventIndex(activation.startEventIndex) - 12
  const bottom = layout.yForEventIndex(activation.endEventIndex) + 30

  return (
    <rect
      data-testid="sequence-activation"
      x={x}
      y={top}
      width="10"
      height={Math.max(28, bottom - top)}
      fill={isDark ? '#334155' : '#dbeafe'}
      stroke={isDark ? '#93c5fd' : '#2563eb'}
      rx="2"
    />
  )
}

function SequenceNoteBlock({ note, layout, colors, isDark }) {
  const y = layout.yForLineIndex(note.lineIndex)
  const xs = note.participants.map((participant) => layout.xForParticipant(participant))
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const width = note.placement === 'over' ? Math.max(170, maxX - minX + 120) : 170
  const left =
    note.placement === 'left'
      ? minX - width - 24
      : note.placement === 'right'
        ? maxX + 24
        : minX - 60

  return (
    <g data-testid="sequence-note">
      <rect
        x={left}
        y={y - 24}
        width={width}
        height="42"
        rx="3"
        fill={isDark ? '#422006' : '#fef3c7'}
        stroke={isDark ? '#facc15' : '#d97706'}
      />
      <text
        x={left + width / 2}
        y={y + 2}
        textAnchor="middle"
        fill={colors.text}
        fontSize="12"
      >
        {note.text}
      </text>
    </g>
  )
}

function SequenceCallBlock({
  message,
  x,
  y,
  colors,
  isDark,
  fitNodeWidthToText,
  isFlashing,
  onSelect,
  onEdit,
}) {
  const callBlockWidth = fitNodeWidthToText
    ? fitVisualWidth(210, message.label)
    : 210
  const callBlockHeight = 40

  return (
    <g
      data-testid="sequence-call-block"
      role="button"
      tabIndex="0"
      className={isFlashing ? 'diagram-node-flash sequence-object-flash' : ''}
      style={{ cursor: 'pointer' }}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={onSelect}
      onDoubleClick={onEdit}
    >
      <rect
        x={x - callBlockWidth / 2}
        y={y - callBlockHeight / 2}
        width={callBlockWidth}
        height={callBlockHeight}
        rx="3"
        fill={isDark ? '#0f172a' : '#f8fafc'}
        stroke={isDark ? '#38bdf8' : '#0284c7'}
        strokeWidth="2"
      />
      <text
        x={x}
        y={y + 4}
        textAnchor="middle"
        fill={colors.text}
        fontSize="12"
        fontWeight="600"
      >
        {message.label}
      </text>
    </g>
  )
}

function SequenceMessageArrow({
  message,
  fromX,
  toX,
  y,
  colors,
  markerId,
  isFlashing,
  onSelect,
  onEdit,
}) {
  const isReturn = message.arrow.includes('--')
  const direction = toX >= fromX ? 1 : -1

  return (
    <g
      role="button"
      tabIndex="0"
      className={isFlashing ? 'diagram-node-flash sequence-object-flash' : ''}
      style={{ cursor: 'pointer' }}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={onSelect}
      onDoubleClick={onEdit}
    >
      <line
        x1={fromX + direction * 18}
        y1={y}
        x2={toX - direction * 18}
        y2={y}
        stroke={colors.line}
        strokeWidth="1.7"
        strokeDasharray={isReturn ? '5 4' : undefined}
        markerEnd={`url(#${markerId})`}
      />
      <text
        x={Math.min(fromX, toX) + Math.abs(toX - fromX) / 2}
        y={y - 10}
        textAnchor="middle"
        fill={colors.text}
        fontSize="12"
      >
        {message.label}
      </text>
    </g>
  )
}

function SequenceCanvas({
  code,
  sequenceSvg,
  theme,
  selectedElement,
  focusRequestKey,
  zoom,
  fitNodeWidthToText = false,
  onSelectElement,
  onRenameParticipant,
  onUpdateMessage,
  onMoveParticipant,
  onZoomChange,
}) {
  const model = parseSequenceEditorModel(code)
  const [editingParticipantId, setEditingParticipantId] = useState(null)
  const [participantDraft, setParticipantDraft] = useState('')
  const [editingMessageLine, setEditingMessageLine] = useState(null)
  const [messageDraft, setMessageDraft] = useState('')
  const [scrollViewport, setScrollViewport] = useState({
    left: 0,
    top: 0,
    width: 320,
    height: 220,
  })
  const [isCanvasPanning, setIsCanvasPanning] = useState(false)
  const [flashingKey, setFlashingKey] = useState('')
  const scrollContainerRef = useRef(null)
  const sequenceSurfaceRef = useRef(null)
  const dragRef = useRef(null)
  const canvasPanRef = useRef(null)
  const minimapDraggingRef = useRef(false)
  const elementRefs = useRef(new Map())
  const flashTimerRef = useRef(null)
  const markerIdRef = useRef(`sequence-arrow-${Math.random().toString(36).slice(2)}`)
  const selectedKey = sequenceElementKey(selectedElement)

  const baseParticipantWidth = 128
  const participantWidth = fitNodeWidthToText
    ? Math.max(
        baseParticipantWidth,
        Math.min(
          640,
          Math.max(
            0,
            ...model.participants.map((participant) =>
              fitVisualWidth(baseParticipantWidth, participant.label),
            ),
          ),
        ),
      )
    : baseParticipantWidth
  const participantHeight = 32
  const gap = Math.max(172, participantWidth + 44)
  const marginX = 72
  const topY = 28
  const lifelineTop = topY + participantHeight
  const firstMessageY = lifelineTop + 52
  const messageGap = 58
  const bottomPadding = 76
  const eventCount = Math.max(1, model.events.length || model.messages.length)
  const diagramWidth = Math.max(
    720,
    marginX * 2 + participantWidth + Math.max(0, model.participants.length - 1) * gap,
  )
  const diagramHeight = Math.max(
    280,
    firstMessageY + eventCount * messageGap + bottomPadding,
  )
  const renderWidth = diagramWidth
  const renderHeight = diagramHeight
  const bottomY = diagramHeight - participantHeight - 24
  const minimapWidth = 144
  const minimapHeight = 78
  const minimapPadding = 8
  const minimapPlotWidth = minimapWidth - minimapPadding * 2
  const minimapPlotHeight = minimapHeight - minimapPadding * 2
  const isDark = theme === 'dark'
  const colors = {
    boxFill: isDark ? '#111827' : '#f8fafc',
    boxStroke: isDark ? '#64748b' : '#475569',
    selectedStroke: '#2563eb',
    text: isDark ? '#e2e8f0' : '#0f172a',
    line: isDark ? '#94a3b8' : '#475569',
    messageFill: isDark ? '#0f172a' : '#ffffff',
  }
  const minimapColors = {
    background: isDark ? '#0f172a' : '#f8fafc',
    participant: isDark ? '#1e293b' : '#e2e8f0',
    participantStroke: isDark ? '#94a3b8' : '#64748b',
    line: isDark ? '#94a3b8' : '#475569',
    message: '#2563eb',
    viewport: isDark ? '#38bdf8' : '#2563eb',
  }

  const xForParticipant = (participantId) => {
    const index = model.participants.findIndex(
      (participant) => participant.id === participantId,
    )
    return index < 0 ? marginX + participantWidth / 2 : marginX + participantWidth / 2 + index * gap
  }
  const eventIndexByLine = new Map(
    model.events.map((event, index) => [event.lineIndex, index]),
  )
  const yForEventIndex = (eventIndex) => firstMessageY + eventIndex * messageGap
  const yForLineIndex = (lineIndex, fallbackIndex = 0) =>
    yForEventIndex(eventIndexByLine.get(lineIndex) ?? fallbackIndex)
  const sequenceLayout = {
    participantWidth,
    marginX,
    lastParticipantId: model.participants.at(-1)?.id,
    xForParticipant,
    yForEventIndex,
    yForLineIndex,
  }

  const minimapX = (x) => minimapPadding + (x / renderWidth) * minimapPlotWidth
  const minimapY = (y) => minimapPadding + (y / renderHeight) * minimapPlotHeight
  const contentWidth = renderWidth * zoom
  const contentHeight = renderHeight * zoom
  const viewportRect = minimapViewportRect({
    scroll: scrollViewport,
    contentWidth,
    contentHeight,
    minimapWidth,
    minimapHeight,
    padding: minimapPadding,
  })

  const updateViewportSize = (element) => {
    setScrollViewport((current) => ({
      ...current,
      width: element.clientWidth || current.width,
      height: element.clientHeight || current.height,
    }))
  }

  const setViewportPosition = (element, nextPosition) => {
    setScrollViewport((current) => ({
      left: nextPosition.left,
      top: nextPosition.top,
      width: element.clientWidth || current.width,
      height: element.clientHeight || current.height,
    }))
  }

  const focusPointForElement = (element) => {
    if (!element) return null
    if (element.type === 'participant') {
      return {
        x: xForParticipant(element.id),
        y: topY + participantHeight / 2,
      }
    }

    const message = model.messages.find(
      (current) =>
        current.lineIndex === element.lineIndex ||
        (element.id && current.id === element.id),
    )
    if (!message) return null

    const fromX = xForParticipant(message.from)
    const toX = xForParticipant(message.to)
    return {
      x:
        message.from === message.to
          ? fromX
          : Math.min(fromX, toX) + Math.abs(toX - fromX) / 2,
      y: yForLineIndex(message.lineIndex),
    }
  }

  useEffect(() => {
    if (!focusRequestKey || !selectedKey) return
    const element = scrollContainerRef.current
    const focusPoint = focusPointForElement(selectedElement)
    if (!element || !focusPoint) return

    const clientWidth = element.clientWidth || scrollViewport.width
    const clientHeight = element.clientHeight || scrollViewport.height
    setScrollViewport({
      left: focusPoint.x * zoom - clientWidth / 2,
      top: focusPoint.y * zoom - clientHeight / 2,
      width: clientWidth,
      height: clientHeight,
    })

    if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
    setFlashingKey(selectedKey)
    flashTimerRef.current = setTimeout(() => {
      setFlashingKey('')
      flashTimerRef.current = null
    }, 1400)
  }, [focusRequestKey])

  useEffect(() => {
    return () => {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
    }
  }, [])

  const shouldSkipCanvasPan = (target) => {
    return Boolean(
      target?.closest?.(
        'button,input,textarea,select,[contenteditable="true"],[data-no-canvas-pan="true"]',
      ),
    )
  }

  const beginCanvasPan = (event) => {
    if (event.button !== 0 || shouldSkipCanvasPan(event.target)) return

    canvasPanRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      left: scrollViewport.left,
      top: scrollViewport.top,
    }
    setIsCanvasPanning(true)
  }

  const moveCanvasPan = (event) => {
    const drag = canvasPanRef.current
    const element = scrollContainerRef.current
    if (!drag || !element) return

    event.preventDefault()
    setViewportPosition(element, {
      left: drag.left - (event.clientX - drag.startX),
      top: drag.top - (event.clientY - drag.startY),
    })
  }

  const endCanvasPan = () => {
    if (!canvasPanRef.current) return
    canvasPanRef.current = null
    setIsCanvasPanning(false)
  }

  const finishParticipantDrag = (event, participantId = null) => {
    const drag = dragRef.current
    if (!drag || (participantId && drag.id !== participantId)) return false

    dragRef.current = null
    if (Math.abs(event.clientX - drag.startX) < 12) return false

    const diagramRect = sequenceSurfaceRef.current?.getBoundingClientRect()
    const localX = event.clientX - (diagramRect?.left ?? 0)
    const targetIndex = Math.max(
      0,
      Math.min(
        model.participants.length - 1,
        Math.round((localX / zoom - marginX - participantWidth / 2) / gap),
      ),
    )

    if (targetIndex !== drag.startIndex) {
      onMoveParticipant(drag.id, targetIndex)
      return true
    }

    return false
  }

  const panFromMinimapEvent = (event) => {
    const element = scrollContainerRef.current
    if (!element) return

    const rect = event.currentTarget.getBoundingClientRect()
    const clientWidth = element.clientWidth || scrollViewport.width
    const clientHeight = element.clientHeight || scrollViewport.height
    const nextScroll = viewportFromMinimapPoint({
      point: {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      },
      contentWidth,
      contentHeight,
      clientWidth,
      clientHeight,
      minimapWidth,
      minimapHeight,
      padding: minimapPadding,
    })

    setViewportPosition(element, nextScroll)
  }

  const handleMinimapWheel = (event) => {
    event.preventDefault()
    event.stopPropagation()
    const delta = event.deltaY < 0 ? 0.1 : -0.1
    onZoomChange((currentZoom) =>
      clampNumber(+(currentZoom + delta).toFixed(2), 0.5, 2),
    )
  }

  const handleCanvasWheel = (event) => {
    event.preventDefault()

    const element = event.currentTarget
    const nextZoom = clampNumber(
      +(zoom + (event.deltaY < 0 ? 0.1 : -0.1)).toFixed(2),
      0.5,
      2,
    )
    if (nextZoom === zoom) return

    const rect = element.getBoundingClientRect()
    const styles = window.getComputedStyle(element)
    const paddingLeft = Number.parseFloat(styles.paddingLeft) || 0
    const paddingTop = Number.parseFloat(styles.paddingTop) || 0
    const offsetX = event.clientX - rect.left
    const offsetY = event.clientY - rect.top
    const diagramX = (scrollViewport.left + offsetX - paddingLeft) / zoom
    const diagramY = (scrollViewport.top + offsetY - paddingTop) / zoom

    flushSync(() => {
      onZoomChange(nextZoom)
    })
    setViewportPosition(element, {
      left: diagramX * nextZoom + paddingLeft - offsetX,
      top: diagramY * nextZoom + paddingTop - offsetY,
    })
  }

  const commitParticipant = () => {
    if (!editingParticipantId) return
    onRenameParticipant(editingParticipantId, participantDraft)
    setEditingParticipantId(null)
  }

  const commitMessage = () => {
    if (editingMessageLine === null) return
    onUpdateMessage(editingMessageLine, messageDraft)
    setEditingMessageLine(null)
  }

  const beginParticipantEdit = (participant) => {
    setEditingParticipantId(participant.id)
    setParticipantDraft(participant.label)
  }

  const beginMessageEdit = (message) => {
    setEditingMessageLine(message.lineIndex)
    setMessageDraft(message.label)
  }

  if (model.participants.length === 0) {
    return (
      <div
        data-testid="sequence-editor-canvas"
        className={`flex h-full w-full items-center justify-center text-sm ${
          isDark ? 'text-slate-300' : 'text-slate-600'
        }`}
      >
        sequenceDiagram
      </div>
    )
  }

  return (
    <div
      ref={scrollContainerRef}
      data-testid="sequence-editor-canvas"
      data-pan-left={scrollViewport.left}
      data-pan-top={scrollViewport.top}
      className={`relative h-full w-full overflow-hidden p-6 ${
        isCanvasPanning ? 'cursor-grabbing' : 'cursor-grab'
      } ${isDark ? 'bg-slate-900' : 'bg-white'}`}
      onScroll={(event) => updateViewportSize(event.currentTarget)}
      onMouseDown={beginCanvasPan}
      onMouseMove={moveCanvasPan}
      onMouseUp={(event) => {
        finishParticipantDrag(event)
        endCanvasPan()
      }}
      onMouseLeave={endCanvasPan}
      onWheel={handleCanvasWheel}
    >
      <div
        className="relative"
        data-testid="sequence-pan-layer"
        style={{
          width: renderWidth * zoom,
          height: renderHeight * zoom,
          color: colors.text,
          transform: `translate(${-scrollViewport.left}px, ${-scrollViewport.top}px)`,
        }}
      >
        <div
          ref={sequenceSurfaceRef}
          data-testid="sequence-diagram-surface"
          className="absolute left-0 top-0"
          style={{
            width: renderWidth,
            height: renderHeight,
            transform: `scale(${zoom})`,
            transformOrigin: 'top left',
          }}
        >
          <svg
            width={diagramWidth}
            height={diagramHeight}
            className="absolute inset-0"
            aria-hidden="true"
          >
            <defs>
              <marker
                id={markerIdRef.current}
                markerWidth="8"
                markerHeight="8"
                refX="7"
                refY="4"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <path d="M0,0 L8,4 L0,8 Z" fill={colors.line} />
              </marker>
            </defs>
            {model.fragments.map((fragment) => (
              <SequenceFragmentBox
                key={`fragment-${fragment.startLineIndex}`}
                fragment={fragment}
                layout={sequenceLayout}
                colors={colors}
                isDark={isDark}
              />
            ))}
            {model.participants.map((participant) => {
              const x = xForParticipant(participant.id)
              return (
                <line
                  key={`lifeline-${participant.id}`}
                  x1={x}
                  x2={x}
                  y1={lifelineTop}
                  y2={bottomY}
                  stroke={colors.line}
                  strokeDasharray="5 4"
                  strokeWidth="1.5"
                />
              )
            })}
            {model.activations.map((activation) => (
              <SequenceActivationBlock
                key={`activation-${activation.startLineIndex}`}
                activation={activation}
                layout={sequenceLayout}
                isDark={isDark}
              />
            ))}
            {model.notes.map((note) => (
              <SequenceNoteBlock
                key={`note-${note.lineIndex}`}
                note={note}
                layout={sequenceLayout}
                colors={colors}
                isDark={isDark}
              />
            ))}
            {model.messages.map((message, index) => {
              const fromX = xForParticipant(message.from)
              const toX = xForParticipant(message.to)
              const y = yForLineIndex(message.lineIndex, index)
              const messageKey = sequenceElementKey({
                type: 'message',
                lineIndex: message.lineIndex,
              })
              if (message.from === message.to) {
                return (
                  <SequenceCallBlock
                    key={message.id}
                    message={message}
                    x={fromX}
                    y={y}
                    colors={colors}
                    isDark={isDark}
                    fitNodeWidthToText={fitNodeWidthToText}
                    isFlashing={flashingKey === messageKey}
                    onSelect={() =>
                      onSelectElement({
                        type: 'message',
                        id: message.id,
                        label: message.label,
                        lineIndex: message.lineIndex,
                      })
                    }
                    onEdit={() => beginMessageEdit(message)}
                  />
                )
              }

              return (
                <SequenceMessageArrow
                  key={message.id}
                  message={message}
                  fromX={fromX}
                  toX={toX}
                  y={y}
                  colors={colors}
                  markerId={markerIdRef.current}
                  isFlashing={flashingKey === messageKey}
                  onSelect={() =>
                    onSelectElement({
                      type: 'message',
                      id: message.id,
                      label: message.label,
                      lineIndex: message.lineIndex,
                    })
                  }
                  onEdit={() => beginMessageEdit(message)}
                />
              )
            })}
          </svg>

          {model.participants.map((participant) => {
            const x = xForParticipant(participant.id)
            const key = sequenceElementKey({
              type: 'participant',
              id: participant.id,
            })
            const selected = key === selectedKey
            const overlayVisibility = ''
            const boxStyle = {
              left: x - participantWidth / 2,
              width: participantWidth,
              height: participantHeight,
              background: colors.boxFill,
              borderColor: selected ? colors.selectedStroke : colors.boxStroke,
              color: colors.text,
            }
            const commonClass =
              'absolute flex items-center justify-center rounded border px-2 text-xs font-semibold shadow-sm'

            return (
              <div key={participant.id}>
                {editingParticipantId === participant.id ? (
                  <input
                    aria-label="Edit participant label"
                    autoFocus
                    value={participantDraft}
                    onChange={(event) => setParticipantDraft(event.target.value)}
                    onBlur={commitParticipant}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        commitParticipant()
                      } else if (event.key === 'Escape') {
                        setEditingParticipantId(null)
                      }
                    }}
                    className="absolute z-20 rounded border border-blue-500 bg-white px-2 text-center text-xs text-slate-900 outline-none ring-2 ring-blue-500"
                    style={{ ...boxStyle, top: topY }}
                  />
                ) : (
                  <button
                    type="button"
                    aria-label={participant.label}
                    title="Click to select, double-click to edit, drag to reorder"
                    data-selected={selected ? 'true' : undefined}
                    ref={(node) => {
                      if (node) elementRefs.current.set(key, node)
                      else elementRefs.current.delete(key)
                    }}
                    onClick={() =>
                      onSelectElement({
                        type: 'participant',
                        id: participant.id,
                        label: participant.label,
                        lineIndex: participant.lineIndex,
                      })
                    }
                    onDoubleClick={() => beginParticipantEdit(participant)}
                    onMouseDown={(event) => {
                      event.stopPropagation()
                      dragRef.current = {
                        id: participant.id,
                        startIndex: model.participants.findIndex(
                          (current) => current.id === participant.id,
                        ),
                        startX: event.clientX,
                      }
                    }}
                    onMouseUp={(event) => {
                      finishParticipantDrag(event, participant.id)
                    }}
                    className={`${commonClass} z-10 hover:border-blue-500 hover:ring-2 hover:ring-blue-400 ${overlayVisibility} ${
                      selected ? 'ring-2 ring-blue-500' : ''
                    } ${flashingKey === key ? 'diagram-node-flash sequence-object-flash' : ''}`}
                    style={{ ...boxStyle, top: topY }}
                  >
                    <span className="truncate">{participant.label}</span>
                  </button>
                )}
                <div
                  className={commonClass}
                  style={{ ...boxStyle, top: bottomY }}
                >
                  <span className="truncate">{participant.label}</span>
                </div>
              </div>
            )
          })}

          {model.messages.map((message, index) => {
            const fromX = xForParticipant(message.from)
            const toX = xForParticipant(message.to)
            const y = yForLineIndex(message.lineIndex, index)
            const labelX = Math.min(fromX, toX) + Math.abs(toX - fromX) / 2
            const key = sequenceElementKey({
              type: 'message',
              lineIndex: message.lineIndex,
            })
            const selected = key === selectedKey
            const isEditing = editingMessageLine === message.lineIndex
            const isSelfMessage = message.from === message.to
            const overlayWidth =
              isSelfMessage && fitNodeWidthToText
                ? fitVisualWidth(220, message.label)
                : 220
            const editorWidth =
              isSelfMessage && fitNodeWidthToText
                ? fitVisualWidth(210, message.label) + 2
                : 200
            const editorLeft = isSelfMessage
              ? fromX - editorWidth / 2
              : Math.max(12, labelX - editorWidth / 2)
            const editorTop = isSelfMessage ? y - 14 : y - 36

            return isEditing ? (
              <input
                key={message.id}
                aria-label="Edit message label"
                autoFocus
                value={messageDraft}
                onChange={(event) => setMessageDraft(event.target.value)}
                onBlur={commitMessage}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    commitMessage()
                  } else if (event.key === 'Escape') {
                    setEditingMessageLine(null)
                  }
                }}
                className="absolute z-20 h-7 rounded border border-blue-500 bg-white px-2 text-center text-xs text-slate-900 outline-none ring-2 ring-blue-500"
                style={{ left: editorLeft, top: editorTop, width: editorWidth }}
              />
            ) : (
              <button
                key={message.id}
                type="button"
                aria-label={message.label || `${message.from} to ${message.to}`}
                title="Click to select, double-click to edit message"
                data-selected={selected ? 'true' : undefined}
                data-message-overlay="true"
                ref={(node) => {
                  if (node) elementRefs.current.set(key, node)
                  else elementRefs.current.delete(key)
                }}
                onClick={() =>
                  onSelectElement({
                    type: 'message',
                    id: message.id,
                    label: message.label,
                    lineIndex: message.lineIndex,
                  })
                }
                onDoubleClick={() => beginMessageEdit(message)}
                className="absolute z-10 h-6 w-[220px] -translate-x-1/2 cursor-pointer border-0 bg-transparent p-0 text-transparent outline-none"
                style={{
                  left: labelX,
                  top: y - 34,
                  width: overlayWidth,
                }}
              />
            )
          })}
        </div>
      </div>
      <div
        data-no-canvas-pan="true"
        data-testid="sequence-minimap"
        className={`sticky bottom-4 right-4 z-20 ml-auto mr-4 w-36 rounded border p-2 text-xs shadow ${
          isDark
            ? 'border-slate-600 bg-slate-800/95 text-slate-200'
            : 'border-slate-200 bg-white/95 text-slate-700'
        }`}
      >
        <div className="mb-1 flex justify-between">
          <span>{model.participants.length} participants</span>
          <span>{Math.round(zoom * 100)}%</span>
        </div>
        <svg
          data-testid="sequence-minimap-svg"
          aria-label="Sequence diagram minimap"
          width={minimapWidth}
          height={minimapHeight}
          viewBox={`0 0 ${minimapWidth} ${minimapHeight}`}
          className="block cursor-crosshair rounded border border-slate-300"
          onMouseDown={(event) => {
            event.stopPropagation()
            minimapDraggingRef.current = true
            panFromMinimapEvent(event)
          }}
          onMouseMove={(event) => {
            if (minimapDraggingRef.current) panFromMinimapEvent(event)
          }}
          onMouseUp={() => {
            minimapDraggingRef.current = false
          }}
          onMouseLeave={() => {
            minimapDraggingRef.current = false
          }}
          onWheel={handleMinimapWheel}
        >
          <rect
            x="0"
            y="0"
            width={minimapWidth}
            height={minimapHeight}
            rx="4"
            fill={minimapColors.background}
          />
          {model.participants.map((participant) => {
            const x = minimapX(xForParticipant(participant.id))
            return (
              <g key={`minimap-participant-${participant.id}`}>
                <rect
                  data-testid="sequence-minimap-participant"
                  x={x - 8}
                  y={minimapY(topY)}
                  width="16"
                  height="7"
                  rx="1.5"
                  fill={minimapColors.participant}
                  stroke={minimapColors.participantStroke}
                  strokeWidth="0.8"
                />
                <line
                  x1={x}
                  x2={x}
                  y1={minimapY(lifelineTop)}
                  y2={minimapY(bottomY)}
                  stroke={minimapColors.line}
                  strokeWidth="0.8"
                  strokeDasharray="2 2"
                />
              </g>
            )
          })}
          {model.messages.map((message, index) => {
            const fromX = minimapX(xForParticipant(message.from))
            const toX = minimapX(xForParticipant(message.to))
            const y = minimapY(firstMessageY + index * messageGap)
            const isReturn = message.arrow.includes('--')
            return (
              <line
                key={`minimap-message-${message.id}`}
                data-testid="sequence-minimap-message"
                x1={fromX}
                y1={y}
                x2={toX}
                y2={y}
                stroke={minimapColors.message}
                strokeWidth="1.2"
                strokeDasharray={isReturn ? '2 2' : undefined}
              />
            )
          })}
          <rect
            x={viewportRect.x}
            y={viewportRect.y}
            width={viewportRect.width}
            height={viewportRect.height}
            rx="2"
            fill="none"
            stroke={minimapColors.viewport}
            strokeWidth="1.2"
            strokeDasharray="3 2"
          />
        </svg>
      </div>
    </div>
  )
}

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

function directionFromMermaid(code) {
  const match = code.match(/^\s*(?:graph|flowchart)\s+(TB|TD|BT|LR|RL)\b/im)
  if (!match) return 'TB'
  return match[1].toUpperCase() === 'TD' ? 'TB' : match[1].toUpperCase()
}

function nodeRectForPlacement(node, allNodes) {
  const position = getAbsoluteNodePosition(node, allNodes)
  const width = Number(node.width ?? node.style?.width ?? 160)
  const height = Number(node.height ?? node.style?.height ?? 44)
  return { x: position.x, y: position.y, width, height }
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
  const [searchQuery, setSearchQuery] = useState('')
  const [searchActiveIndex, setSearchActiveIndex] = useState(-1)
  const [diagramMode, setDiagramMode] = useState('flowchart')
  const [sequenceSvg, setSequenceSvg] = useState('')
  const [selectedSequenceElement, setSelectedSequenceElement] = useState(null)
  const [sequenceFocusRequestKey, setSequenceFocusRequestKey] = useState(0)
  const [sequenceZoom, setSequenceZoom] = useState(1)
  const [codeLineMetrics, setCodeLineMetrics] = useState({
    lineHeight: 22,
    paddingTop: 16,
  })
  const containerRef = useRef(null)
  const codeTextareaRef = useRef(null)
  const codeHighlightTimerRef = useRef(null)
  const nodeFlashTimerRef = useRef(null)
  const sequencePreviewRef = useRef(null)
  const reactFlow = useReactFlow()
  const lastFocusedNodeIdRef = useRef(null)
  const pendingAddedNodePlacementRef = useRef(null)

  const nodesRef = useRef(nodes)
  const edgesRef = useRef(edges)
  nodesRef.current = nodes
  edgesRef.current = edges

  const seqRef = useRef(0)
  const debounceRef = useRef(null)

  useEffect(() => {
    return () => {
      if (nodeFlashTimerRef.current) clearTimeout(nodeFlashTimerRef.current)
    }
  }, [])

  const runParse = (text) => {
    const seq = ++seqRef.current
    if (isSequenceDiagram(text)) {
      setDiagramMode('sequence')
      setSearchQuery('')
      setSearchActiveIndex(-1)
      setNodes([])
      setEdges([])
      mermaid.initialize({
        startOnLoad: false,
        suppressErrorRendering: true,
        theme: theme === 'dark' ? 'dark' : 'default',
      })
      mermaid
        .render(`mermaid-sequence-${seq}`, text)
        .then(({ svg }) => {
          if (seq !== seqRef.current) return
          setError(null)
          setSequenceSvg(svg)
        })
        .catch((err) => {
          if (seq !== seqRef.current) return
          const message = err instanceof Error ? err.message : String(err)
          setError(message)
          setSequenceSvg('')
        })
      return
    }

    setDiagramMode('flowchart')
    setSequenceSvg('')
    setSelectedSequenceElement(null)
    convertMermaid(text, { fitNodeWidthToText }).then((res) => {
      if (seq !== seqRef.current) return
      if (res.error) {
        setError(res.error)
        return
      }
      setError(null)
      const groups = res.groups ?? []

      const nodeToGroup = new Map()
      for (const g of groups) {
        for (const id of g.nodeIds) {
          if (!nodeToGroup.has(id)) nodeToGroup.set(id, g)
        }
      }

      const groupNodes = groups.map((g) => ({
        id: `__group_${g.id}`,
        type: 'group',
        position: g.position,
        data: { label: g.label, groupId: g.id, customSize: Boolean(g.customSize) },
        style: { width: g.width, height: g.height },
        zIndex: 0,
      }))

      const flowNodes = res.nodes.map((n) => {
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

      const nextNodes = [...groupNodes, ...flowNodes]
      const pendingPlacement = pendingAddedNodePlacementRef.current
      if (pendingPlacement) {
        const addedNode = nextNodes.find((node) => node.id === pendingPlacement.id)
        if (addedNode) {
          const width = Number(addedNode.width ?? addedNode.style?.width ?? 160)
          const height = Number(addedNode.height ?? addedNode.style?.height ?? 44)
          const position = placeAddedNodeNearAnchor({
            direction: pendingPlacement.direction,
            anchor: pendingPlacement.anchor,
            added: { width, height },
          })
          addedNode.position = position
          addedNode.data = { ...addedNode.data, resizeSelected: true }
          lastFocusedNodeIdRef.current = addedNode.id
        }
        pendingAddedNodePlacementRef.current = null
      }

      setNodes(
        nextNodes.map((node) =>
          pendingPlacement && node.id !== pendingPlacement.id
            ? { ...node, data: { ...node.data, resizeSelected: false } }
            : node,
        ),
      )
      setEdges(
        res.edges.map((edge) => ({
          ...edge,
          type: 'editable',
          data: { label: edge.label ?? '' },
        })),
      )
    })
  }

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

  useEffect(() => {
    if (isSequenceDiagram(code)) runParse(code)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme])

  useEffect(() => {
    if (onCodeChange) onCodeChange(code)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])

  const handleCodeChange = (e) => {
    const text = e.target.value
    setCode(text)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => runParse(text), 250)
  }

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

  const focusDiagramNode = (id, { flash = false } = {}) => {
    const targetNode = nodesRef.current.find((node) => node.id === id)
    if (!targetNode) return
    lastFocusedNodeIdRef.current = id

    if (nodeFlashTimerRef.current) {
      clearTimeout(nodeFlashTimerRef.current)
      nodeFlashTimerRef.current = null
    }

    setNodes((currentNodes) =>
      currentNodes.map((currentNode) => ({
        ...currentNode,
        data: {
          ...currentNode.data,
          resizeSelected: currentNode.id === id,
          codeFocusFlash: flash && currentNode.id === id,
        },
      })),
    )

    if (flash) {
      nodeFlashTimerRef.current = setTimeout(() => {
        setNodes((currentNodes) =>
          currentNodes.map((currentNode) =>
            currentNode.data?.codeFocusFlash
              ? {
                  ...currentNode,
                  data: { ...currentNode.data, codeFocusFlash: false },
                }
              : currentNode,
          ),
        )
        nodeFlashTimerRef.current = null
      }, 1600)
    }

    const position = getAbsoluteNodePosition(targetNode, nodesRef.current)
    const width = Number(targetNode.width ?? targetNode.style?.width ?? 0)
    const height = Number(targetNode.height ?? targetNode.style?.height ?? 0)
    const canvas = containerRef.current?.querySelector('.react-flow')
    const canvasRect = canvas?.getBoundingClientRect()
    if (!canvasRect || canvasRect.width === 0 || canvasRect.height === 0) return

    reactFlow.setCenter(position.x + width / 2, position.y + height / 2, {
      zoom: 1.2,
      duration: 350,
    })
  }

  const clearSearchSelection = () => {
    setSelectedSequenceElement(null)
    setNodes((currentNodes) =>
      currentNodes.map((node) => ({
        ...node,
        data: { ...node.data, resizeSelected: false },
      })),
    )
  }

  const getSearchMatches = (query, sourceNodes = nodesRef.current) => {
    const term = query.trim().toLowerCase()
    if (!term) return []

    return sourceNodes.filter((node) => {
      const id = String(node.data?.groupId ?? node.id).toLowerCase()
      const label = String(node.data?.label ?? '').toLowerCase()
      return id.includes(term) || label.includes(term)
    })
  }

  const selectSearchMatch = (matches, index) => {
    if (matches.length === 0) {
      setSearchActiveIndex(-1)
      clearSearchSelection()
      return
    }

    const nextIndex = (index + matches.length) % matches.length
    setSearchActiveIndex(nextIndex)
    if (diagramMode === 'sequence') {
      setSelectedSequenceElement(matches[nextIndex])
      setSequenceFocusRequestKey((key) => key + 1)
    } else {
      focusDiagramNode(matches[nextIndex].id)
    }
  }

  const handleSearchChange = (e) => {
    const query = e.target.value
    setSearchQuery(query)
    const matches =
      diagramMode === 'sequence'
        ? getSequenceSearchMatches(query, parseSequenceEditorModel(code))
        : getSearchMatches(query)
    selectSearchMatch(matches, 0)
  }

  const goToSearchMatch = (offset) => {
    const matches =
      diagramMode === 'sequence'
        ? getSequenceSearchMatches(searchQuery, parseSequenceEditorModel(code))
        : getSearchMatches(searchQuery)
    selectSearchMatch(
      matches,
      searchActiveIndex < 0 ? 0 : searchActiveIndex + offset,
    )
  }

  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      goToSearchMatch(e.shiftKey ? -1 : 1)
    } else if (e.key === 'Escape') {
      setSearchQuery('')
      setSearchActiveIndex(-1)
      clearSearchSelection()
    }
  }

  const selectSequenceElement = (
    element,
    { syncCode = true, focusDiagram = false } = {},
  ) => {
    if (!element) return
    setSelectedSequenceElement(element)
    if (focusDiagram) setSequenceFocusRequestKey((key) => key + 1)
    if (!syncCode || element.lineIndex === null || element.lineIndex === undefined) return

    const textarea = codeTextareaRef.current
    if (!textarea) return

    const location = lineBoundsAtIndex(code, element.lineIndex)
    const styles = window.getComputedStyle(textarea)
    const fontSize = Number.parseFloat(styles.fontSize) || 14
    const lineHeight = Number.parseFloat(styles.lineHeight) || fontSize * 1.625
    const paddingTop = Number.parseFloat(styles.paddingTop) || 0
    const nextScrollTop = scrollTopForLine({
      line: element.lineIndex,
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
      setHighlightedCodeLine({ line: element.lineIndex, key: Date.now() })
    })

    if (codeHighlightTimerRef.current) clearTimeout(codeHighlightTimerRef.current)
    codeHighlightTimerRef.current = setTimeout(() => {
      setHighlightedCodeLine(null)
      codeHighlightTimerRef.current = null
    }, 1800)
  }

  const handleCodeClick = (e) => {
    if (diagramMode === 'sequence') {
      const lineIndex = lineIndexAtOffset(code, e.currentTarget.selectionStart)
      const element = findSequenceElementAtLine(code, lineIndex)
      if (element) selectSequenceElement(element, { syncCode: false, focusDiagram: true })
      return
    }

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
    if (target) focusDiagramNode(target.id, { flash: true })
  }

  const handleCanvasNodeClick = (_event, node) => {
    lastFocusedNodeIdRef.current = node.id
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

  const onConnect = (params) => {
    const nextCode = addEdgeToMermaid(code, {
      source: params.source,
      target: params.target,
    })
    setCode(nextCode)
    runParse(nextCode)
  }

  const handleAddNode = () => {
    const anchorNode = nodesRef.current.find(
      (node) => node.id === lastFocusedNodeIdRef.current,
    )
    const result = addNodeToMermaidWithId(code, {
      shape: addNodeShape,
      label: 'New node',
      ...(anchorNode?.type !== 'group' ? { anchorNodeId: anchorNode?.id } : {}),
    })
    if (anchorNode) {
      pendingAddedNodePlacementRef.current = {
        id: result.id,
        direction: directionFromMermaid(code),
        anchor: nodeRectForPlacement(anchorNode, nodesRef.current),
      }
    }
    setCode(result.code)
    runParse(result.code)
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

  const onNodeDragStop = () => {
    // Mermaid flowchart syntax does not persist freeform canvas positions.
  }

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

  const exportImage = async (type) => {
    if (diagramMode === 'sequence') {
      if (type === 'svg' && sequenceSvg) {
        const url = URL.createObjectURL(
          new Blob([sequenceSvg], { type: 'image/svg+xml' }),
        )
        triggerDownload(url, 'diagram.svg')
        setTimeout(() => URL.revokeObjectURL(url), 1000)
        return
      }

      if (sequencePreviewRef.current) {
        const dataUrl = await toPng(sequencePreviewRef.current, {
          backgroundColor: theme === 'dark' ? '#0f172a' : '#ffffff',
        })
        triggerDownload(dataUrl, 'diagram.png')
      }
      return
    }

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

    }
  }

  const exportMmd = () => {
    const url = URL.createObjectURL(new Blob([code], { type: 'text/plain' }))
    triggerDownload(url, 'diagram.mmd')
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

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
    const coalesce = now - lastEditTimeRef.current < 600
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

  const handleAddSequenceParticipant = () => {
    const nextCode = addSequenceParticipant(code)
    const beforeIds = new Set(
      parseSequenceEditorModel(code).participants.map((participant) => participant.id),
    )
    const added = parseSequenceEditorModel(nextCode).participants.find(
      (participant) => !beforeIds.has(participant.id),
    )
    if (added) {
      setSelectedSequenceElement({
        type: 'participant',
        id: added.id,
        label: added.label,
        lineIndex: added.lineIndex,
      })
    }
    applyCodeAndParse(nextCode)
  }

  const handleAddSequenceMessage = () => {
    const model = parseSequenceEditorModel(code)
    if (model.participants.length < 2) return

    const selected =
      selectedSequenceElement?.type === 'participant'
        ? model.participants.find(
            (participant) => participant.id === selectedSequenceElement.id,
          )
        : null
    const source = selected ?? model.participants[0]
    const selectedIndex = model.participants.findIndex(
      (participant) => participant.id === source.id,
    )
    const target =
      model.participants[selectedIndex + 1] ??
      model.participants.find((participant) => participant.id !== source.id)
    if (!target) return

    applyCodeAndParse(addSequenceMessage(code, source.id, target.id))
  }

  const moveSelectedSequenceParticipant = (offset) => {
    const model = parseSequenceEditorModel(code)
    if (selectedSequenceElement?.type !== 'participant') return
    const selectedIndex = model.participants.findIndex(
      (participant) => participant.id === selectedSequenceElement.id,
    )
    if (selectedIndex < 0) return

    const targetIndex = Math.max(
      0,
      Math.min(model.participants.length - 1, selectedIndex + offset),
    )
    if (targetIndex === selectedIndex) return

    const selectedId = model.participants[selectedIndex].id
    setSelectedSequenceElement({
      type: 'participant',
      id: selectedId,
      label: model.participants[selectedIndex].label,
      lineIndex: model.participants[selectedIndex].lineIndex,
    })
    applyCodeAndParse(moveSequenceParticipant(code, selectedId, targetIndex))
  }

  const btnClass =
    'rounded-md border border-slate-300 bg-white/90 px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm hover:bg-white'
  const shapeBtnClass = (shape) =>
    shape === addNodeShape
      ? 'flex h-8 w-8 items-center justify-center rounded-md border border-blue-500 bg-blue-50 text-sm font-semibold text-blue-700 shadow-sm ring-2 ring-blue-500'
      : 'flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white/90 text-sm font-semibold text-slate-700 shadow-sm hover:bg-white'
  const sequenceModel =
    diagramMode === 'sequence'
      ? parseSequenceEditorModel(code)
      : { participants: [], messages: [] }
  const searchMatches =
    diagramMode === 'sequence'
      ? getSequenceSearchMatches(searchQuery, sequenceModel)
      : getSearchMatches(searchQuery, nodes)
  const searchStatus = searchQuery.trim()
    ? searchMatches.length > 0 && searchActiveIndex >= 0
      ? `${Math.min(searchActiveIndex + 1, searchMatches.length)}/${searchMatches.length}`
      : `0/${searchMatches.length}`
    : ''
  const selectedSequenceIndex = sequenceModel.participants.findIndex(
    (participant) =>
      selectedSequenceElement?.type === 'participant' &&
      participant.id === selectedSequenceElement.id,
  )

  return (
    <div ref={containerRef} className="flex h-full w-full overflow-hidden">
      <div
        style={{ width: leftWidth }}
        className="flex shrink-0 flex-col bg-slate-900 text-slate-100"
      >
        <div className="flex items-center justify-between border-b border-slate-700 px-4 py-2.5">
          <h1 className="text-sm font-semibold tracking-tight">Mermaid code</h1>
          <span className="text-xs text-slate-400">flowchart / sequence</span>
        </div>
        <div className="flex items-center gap-1 border-b border-slate-700 bg-slate-800/60 px-2 py-1">
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) insertTemplate(e.target.value)
            }}
            className="rounded bg-slate-700 px-1.5 py-1 text-xs text-slate-200 outline-none"
            title="Insert example template"
          >
            <option value="">Insert example...</option>
            <option value="basic">Basic flowchart</option>
            <option value="decision">Decision branch</option>
            <option value="subgraph">Subgraph</option>
            <option value="shapes">Shapes</option>
            <option value="sequence">Sequence diagram</option>
          </select>
          <button
            type="button"
            onClick={toggleDirection}
            className="rounded px-2 py-1 text-xs text-slate-300 hover:bg-slate-700 hover:text-white"
            title="Toggle flowchart direction"
          >
            Direction
          </button>
          <button
            type="button"
            onClick={undo}
            className="rounded px-2 py-1 text-xs text-slate-300 hover:bg-slate-700 hover:text-white"
            title="Undo (Ctrl+Z)"
          >
            Undo
          </button>
          <button
            type="button"
            onClick={redo}
            className="rounded px-2 py-1 text-xs text-slate-300 hover:bg-slate-700 hover:text-white"
            title="Redo (Ctrl+Y)"
          >
            Redo
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
          placeholder={'graph TD\\n  A[Start] --> B[End]'}
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
            {error}
          </div>
        )}
      </div>

      <div
        onMouseDown={onSplitterMouseDown}
        title="Drag to resize panels"
        className="group flex w-2.5 shrink-0 cursor-col-resize items-center justify-center bg-slate-600 transition-colors hover:bg-blue-500"
      >
        <div className="h-10 w-1 rounded-full bg-slate-300 group-hover:bg-white" />
      </div>

      <div
        data-testid="diagram-pane"
        className={`relative flex min-w-0 flex-1 flex-col overflow-hidden ${
          theme === 'dark' ? 'bg-slate-900' : 'bg-slate-50'
        }`}
      >
        <div
          className={`flex flex-wrap items-center gap-2 border-b p-2 ${
            theme === 'dark'
              ? 'border-slate-700 bg-slate-800/80'
              : 'border-slate-200 bg-white/90'
          }`}
        >
          {diagramMode !== 'sequence' && (
          <>
          <div className="flex flex-wrap items-center gap-1 rounded-md border border-slate-300 bg-white/90 p-1 shadow-sm">
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
              aria-label="Add node"
              onClick={handleAddNode}
              className={btnClass}
            >
              + Add node
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1 rounded-md border border-slate-300 bg-white/90 p-1 shadow-sm">
            <input
              type="search"
              aria-label="Search nodes"
              value={searchQuery}
              onChange={handleSearchChange}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search nodes"
              className="h-8 w-44 rounded border border-slate-300 bg-white px-2 text-xs text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
            />
            <span className="min-w-8 text-center text-xs tabular-nums text-slate-600">
              {searchStatus}
            </span>
            <button
              type="button"
              onClick={() => goToSearchMatch(-1)}
              disabled={searchMatches.length === 0}
              className="h-8 rounded border border-slate-300 px-2 text-xs font-medium text-slate-700 disabled:opacity-40"
              title="Previous match"
            >
              Prev
            </button>
            <button
              type="button"
              onClick={() => goToSearchMatch(1)}
              disabled={searchMatches.length === 0}
              className="h-8 rounded border border-slate-300 px-2 text-xs font-medium text-slate-700 disabled:opacity-40"
              title="Next match"
            >
              Next
            </button>
          </div>

          </>
          )}

          {diagramMode === 'sequence' && (
            <div className="flex flex-wrap items-center gap-1 rounded-md border border-slate-300 bg-white/90 p-1 shadow-sm">
              <input
                type="search"
                aria-label="Search sequence"
                value={searchQuery}
                onChange={handleSearchChange}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search sequence"
                className="h-8 w-44 rounded border border-slate-300 bg-white px-2 text-xs text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
              />
              <span className="min-w-8 text-center text-xs tabular-nums text-slate-600">
                {searchStatus}
              </span>
              <button
                type="button"
                onClick={() => goToSearchMatch(-1)}
                disabled={searchMatches.length === 0}
                className="h-8 rounded border border-slate-300 px-2 text-xs font-medium text-slate-700 disabled:opacity-40"
                title="Previous match"
              >
                Prev
              </button>
              <button
                type="button"
                onClick={() => goToSearchMatch(1)}
                disabled={searchMatches.length === 0}
                className="h-8 rounded border border-slate-300 px-2 text-xs font-medium text-slate-700 disabled:opacity-40"
                title="Next match"
              >
                Next
              </button>
              <button
                type="button"
                aria-label="Add participant"
                onClick={handleAddSequenceParticipant}
                className={btnClass}
              >
                + Participant
              </button>
              <button
                type="button"
                aria-label="Add message"
                onClick={handleAddSequenceMessage}
                disabled={sequenceModel.participants.length < 2}
                className={`${btnClass} disabled:opacity-40`}
              >
                + Message
              </button>
              <button
                type="button"
                aria-label="Move participant left"
                onClick={() => moveSelectedSequenceParticipant(-1)}
                disabled={selectedSequenceIndex <= 0}
                className="h-8 rounded border border-slate-300 px-2 text-xs font-medium text-slate-700 disabled:opacity-40"
                title="Move participant left"
              >
                &lt;
              </button>
              <button
                type="button"
                aria-label="Move participant right"
                onClick={() => moveSelectedSequenceParticipant(1)}
                disabled={
                  selectedSequenceIndex < 0 ||
                  selectedSequenceIndex >= sequenceModel.participants.length - 1
                }
                className="h-8 rounded border border-slate-300 px-2 text-xs font-medium text-slate-700 disabled:opacity-40"
                title="Move participant right"
              >
                &gt;
              </button>
              <button
                type="button"
                aria-label="Zoom out sequence"
                onClick={() =>
                  setSequenceZoom((zoom) => Math.max(0.5, +(zoom - 0.1).toFixed(2)))
                }
                className="h-8 rounded border border-slate-300 px-2 text-xs font-medium text-slate-700"
                title="Zoom out sequence"
              >
                -
              </button>
              <button
                type="button"
                aria-label="Reset sequence zoom"
                onClick={() => setSequenceZoom(1)}
                className="h-8 rounded border border-slate-300 px-2 text-xs font-medium text-slate-700"
                title="Reset sequence zoom"
              >
                {Math.round(sequenceZoom * 100)}%
              </button>
              <button
                type="button"
                aria-label="Zoom in sequence"
                onClick={() =>
                  setSequenceZoom((zoom) => Math.min(2, +(zoom + 0.1).toFixed(2)))
                }
                className="h-8 rounded border border-slate-300 px-2 text-xs font-medium text-slate-700"
                title="Zoom in sequence"
              >
                +
              </button>
            </div>
          )}

          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            <button type="button" onClick={() => exportImage('png')} className={btnClass}>
              PNG
            </button>
            <button type="button" onClick={() => exportImage('svg')} className={btnClass}>
              SVG
            </button>
            <button type="button" onClick={exportMmd} className={btnClass}>
              .mmd
            </button>
            <button type="button" onClick={copyCode} className={btnClass}>
              Copy
            </button>
            <button
              type="button"
              onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
              className={btnClass}
            >
              {theme === 'light' ? 'Dark' : 'Light'}
            </button>
            <button
              type="button"
              onClick={() => setShowGrid((g) => !g)}
              className={btnClass}
            >
              {showGrid ? 'Grid off' : 'Grid on'}
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
              title="Fit node width to text"
            >
              {fitNodeWidthToText ? 'Fit width ON' : 'Fit width OFF'}
            </button>
          </div>
        </div>

        <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
        {diagramMode === 'sequence' ? (
          <div
            ref={sequencePreviewRef}
            data-testid="mermaid-sequence-preview"
            className="h-full w-full overflow-hidden"
          >
            <SequenceCanvas
              code={code}
              sequenceSvg={sequenceSvg}
              theme={theme}
              selectedElement={selectedSequenceElement}
              focusRequestKey={sequenceFocusRequestKey}
              zoom={sequenceZoom}
              fitNodeWidthToText={fitNodeWidthToText}
              onSelectElement={selectSequenceElement}
              onRenameParticipant={(participantId, label) => {
                applyCodeAndParse(renameSequenceParticipant(code, participantId, label))
              }}
              onUpdateMessage={(lineIndex, label) => {
                applyCodeAndParse(updateSequenceMessageLabel(code, lineIndex, label))
              }}
              onMoveParticipant={(participantId, targetIndex) => {
                const participant = parseSequenceEditorModel(code).participants.find(
                  (current) => current.id === participantId,
                )
                if (participant) {
                  setSelectedSequenceElement({
                    type: 'participant',
                    id: participant.id,
                    label: participant.label,
                    lineIndex: participant.lineIndex,
                  })
                }
                applyCodeAndParse(
                  moveSequenceParticipant(code, participantId, targetIndex),
                )
              }}
              onZoomChange={setSequenceZoom}
            />
          </div>
        ) : (
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
        )}
        </div>
      </div>
    </div>
  )
}

function TabBar({ tabs, activeId, onSelect, onAdd, onClose, onRename, onReorder, right }) {
  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    if (editingId !== null) inputRef.current?.select()
  }, [editingId])

  const startEdit = (tab) => {
    setEditingId(tab.id)
    setDraft(tab.name)
  }

  const commit = () => {
    if (editingId !== null) onRename(editingId, draft.trim() || 'Diagram')
    setEditingId(null)
  }

  return (
    <div className="flex items-stretch gap-1 border-b border-slate-700 bg-slate-800 px-2 pt-1.5">
      {tabs.map((tab) => {
        const active = tab.id === activeId
        const editing = editingId === tab.id
        return (
          <div
            key={tab.id}
            onClick={() => onSelect(tab.id)}
            onDoubleClick={() => startEdit(tab)}
            draggable={!editing}
            onDragStart={(event) => event.dataTransfer.setData('text/plain', String(tab.id))}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault()
              const from = Number(event.dataTransfer.getData('text/plain'))
              if (!Number.isNaN(from)) onReorder(from, tab.id)
            }}
            title="Double-click to rename"
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
                onChange={(event) => setDraft(event.target.value)}
                onClick={(event) => event.stopPropagation()}
                onBlur={commit}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') commit()
                  else if (event.key === 'Escape') setEditingId(null)
                }}
                className="w-28 rounded bg-slate-700 px-1 text-sm text-slate-100 outline-none ring-1 ring-blue-500"
              />
            ) : (
              <span className="max-w-[160px] truncate">{tab.name}</span>
            )}
            {tabs.length > 1 && !editing && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  onClose(tab.id)
                }}
                className="rounded text-slate-400 hover:bg-slate-600 hover:text-white"
                title="Close tab"
              >
                <span className="px-1">x</span>
              </button>
            )}
          </div>
        )
      })}
      <button
        type="button"
        onClick={onAdd}
        title="Add diagram tab"
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

const NEW_TAB_CODE = 'graph TD\n  A[Start] --> B[End]'
const STORAGE_KEY = 'mermaid-gilview-workspace'
const DEFAULT_WORKSPACE = {
  tabs: [{ id: 1, name: 'Diagram 1', code: INITIAL_CODE }],
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
  const initialRef = useRef(null)
  if (initialRef.current === null) initialRef.current = loadWorkspace()
  const init = initialRef.current

  const idRef = useRef(Math.max(0, ...init.tabs.map((tab) => tab.id)) + 1)
  const [tabs, setTabs] = useState(init.tabs)
  const [activeId, setActiveId] = useState(init.activeId)
  const [theme, setTheme] = useState(init.settings.theme)
  const [showGrid, setShowGrid] = useState(init.settings.showGrid)
  const [fitNodeWidthToText, setFitNodeWidthToText] = useState(
    init.settings.fitNodeWidthToText,
  )
  const [leftWidth, setLeftWidth] = useState(init.settings.leftWidth)

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
        // Ignore localStorage quota or browser privacy errors.
      }
    }, 400)
    return () => saveTimer.current && clearTimeout(saveTimer.current)
  }, [tabs, activeId, theme, showGrid, fitNodeWidthToText, leftWidth])

  const active = tabs.find((tab) => tab.id === activeId) ?? tabs[0]

  const updateActiveCode = (code) => {
    setTabs((currentTabs) =>
      currentTabs.map((tab) => (tab.id === activeId ? { ...tab, code } : tab)),
    )
  }

  const renameTab = (id, name) => {
    setTabs((currentTabs) =>
      currentTabs.map((tab) => (tab.id === id ? { ...tab, name } : tab)),
    )
  }

  const reorderTabs = (fromId, toId) => {
    setTabs((currentTabs) => {
      const from = currentTabs.findIndex((tab) => tab.id === fromId)
      const to = currentTabs.findIndex((tab) => tab.id === toId)
      if (from < 0 || to < 0 || from === to) return currentTabs
      const next = [...currentTabs]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }

  const mmdInputRef = useRef(null)
  const jsonInputRef = useRef(null)

  const importMmd = (file) => {
    const reader = new FileReader()
    reader.onload = () => {
      const id = idRef.current++
      const name = file.name.replace(/\.(mmd|md|txt)$/i, '') || `Diagram ${tabs.length + 1}`
      setTabs((currentTabs) => [...currentTabs, { id, name, code: String(reader.result) }])
      setActiveId(id)
    }
    reader.readAsText(file)
  }

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
        if (!window.confirm('Replace the current workspace with the backup file?')) return
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
        idRef.current = Math.max(0, ...data.tabs.map((tab) => tab.id)) + 1
      } catch {
        window.alert('Could not read the backup file.')
      }
    }
    reader.readAsText(file)
  }

  const tabActionBtn =
    'rounded px-2 py-1 text-xs text-slate-300 hover:bg-slate-700 hover:text-white'

  const addTab = () => {
    const id = idRef.current++
    setTabs((currentTabs) => [
      ...currentTabs,
      { id, name: `Diagram ${currentTabs.length + 1}`, code: NEW_TAB_CODE },
    ])
    setActiveId(id)
  }

  const closeTab = (id) => {
    const tab = tabs.find((currentTab) => currentTab.id === id)
    if (tab && tab.code.trim() && tab.code.trim() !== NEW_TAB_CODE.trim()) {
      if (!window.confirm(`Close '${tab.name}'? Unsaved content will be lost.`)) {
        return
      }
    }
    setTabs((currentTabs) => {
      if (currentTabs.length <= 1) return currentTabs
      const index = currentTabs.findIndex((currentTab) => currentTab.id === id)
      const next = currentTabs.filter((currentTab) => currentTab.id !== id)
      if (id === activeId) {
        const fallback = next[Math.max(0, index - 1)]
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
              title="Import .mmd/.txt as a new tab"
            >
              Import
            </button>
            <button
              type="button"
              className={tabActionBtn}
              onClick={backupWorkspace}
              title="Back up all tabs and settings as JSON"
            >
              Backup
            </button>
            <button
              type="button"
              className={tabActionBtn}
              onClick={() => jsonInputRef.current?.click()}
              title="Restore from backup JSON"
            >
              Restore
            </button>
            <input
              ref={mmdInputRef}
              type="file"
              accept=".mmd,.md,.txt"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) importMmd(file)
                event.target.value = ''
              }}
            />
            <input
              ref={jsonInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) restoreWorkspace(file)
                event.target.value = ''
              }}
            />
          </>
        }
      />
      <div className="min-h-0 flex-1">
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
