import mermaid from 'mermaid'
import type { ParsedGraph, Direction, GraphNode, GraphEdge } from './types'

let initialized = false
function ensureInit() {
  if (!initialized) {
    mermaid.initialize({ startOnLoad: false, suppressErrorRendering: true })
    initialized = true
  }
}

// mermaid vertex.type -> 우리 shape 키
function mapShape(type: string | undefined): string {
  switch (type) {
    case 'diamond': // {텍스트}
      return 'diamond'
    case 'cylinder': // [(텍스트)]
      return 'cylinder'
    case 'circle':
    case 'doublecircle': // ((텍스트))
      return type
    case 'stadium': // ([텍스트])
      return 'stadium'
    case 'round': // (텍스트)
      return 'round'
    default: // square/rect/그 외 -> 사각형
      return 'rect'
  }
}

function normalizeDirection(raw: string | undefined): Direction {
  switch (raw) {
    case 'LR':
      return 'LR'
    case 'RL':
      return 'RL'
    case 'BT':
      return 'BT'
    default:
      // 'TD' and 'TB' both mean top-to-bottom
      return 'TB'
  }
}

function normalizeLabelText(text: string): string {
  return text.replace(/<br\s*\/?>/gi, '\n')
}

// Mermaid 11.4.1 internal types (confirmed via spike)
interface DiagramVertex {
  id: string
  text?: string
  labelType?: string
  type?: string
}

interface DiagramEdge {
  start: string
  end: string
  text?: string
  labelType?: string
}

interface DiagramSubGraph {
  id?: string
  title?: string
  nodes: string[]
}

interface DiagramDb {
  getVertices: () => Map<string, DiagramVertex>
  getEdges: () => DiagramEdge[]
  getDirection?: () => string
  getSubGraphs?: () => DiagramSubGraph[]
  getActorKeys?: () => string[]
  getActors?: () => Map<string, SequenceActor>
  getMessages?: () => SequenceMessage[]
}

interface DiagramLike {
  type: string
  db: DiagramDb
}

interface SequenceActor {
  name: string
  description?: string
}

interface SequenceMessage {
  from?: unknown
  to?: unknown
  message?: unknown
}

function parseSequenceDiagram(db: DiagramDb): ParsedGraph {
  const actors = db.getActors?.() ?? new Map<string, SequenceActor>()
  const actorKeys = db.getActorKeys?.() ?? Array.from(actors.keys())
  const messages = db.getMessages?.() ?? []
  const actorMessages = messages.filter(
    (message): message is SequenceMessage & { from: string; to: string } =>
      typeof message.from === 'string' && typeof message.to === 'string',
  )
  const nodeIds = new Set(actorKeys)

  for (const message of actorMessages) {
    nodeIds.add(message.from)
    nodeIds.add(message.to)
  }

  const nodes: GraphNode[] = Array.from(nodeIds).map((id) => {
    const actor = actors.get(id)
    return {
      id,
      label: actor?.description || actor?.name || id,
      shape: 'rect',
    }
  })

  const edges: GraphEdge[] = actorMessages.map((message, index) => {
    const label =
      typeof message.message === 'string' && message.message !== ''
        ? normalizeLabelText(message.message)
        : undefined

    return {
      id: `${message.from}-${message.to}-${index}`,
      source: message.from,
      target: message.to,
      ...(label ? { label } : {}),
    }
  })

  return { nodes, edges, direction: 'LR' }
}

export async function parseMermaid(
  code: string,
): Promise<{ graph: ParsedGraph | null; error: string | null }> {
  const trimmed = code.trim()
  if (trimmed === '') {
    // return a fresh object so callers can't mutate a shared constant
    return { graph: { nodes: [], edges: [], direction: 'TB' }, error: null }
  }

  ensureInit()

  try {
    // Validate syntax and detect diagram type
    const parsed = await mermaid.parse(trimmed)
    const diagramType = (parsed as { diagramType?: string }).diagramType

    // Only flowchart and sequence diagram types are supported
    if (
      diagramType &&
      diagramType !== 'flowchart-v2' &&
      diagramType !== 'flowchart' &&
      diagramType !== 'sequence'
    ) {
      return {
        graph: null,
        error: `현재 flowchart(graph TD/LR)와 sequenceDiagram만 지원합니다. (감지된 타입: ${diagramType})`,
      }
    }

    // Get internal diagram object via mermaidAPI (confirmed present in 11.4.1)
    const api = (mermaid as unknown as { mermaidAPI: { getDiagramFromText: (t: string) => Promise<DiagramLike> } }).mermaidAPI
    const diagram = await api.getDiagramFromText(trimmed)
    const db = diagram.db

    if (diagramType === 'sequence' || diagram.type === 'sequence') {
      return { graph: parseSequenceDiagram(db), error: null }
    }

    // getVertices() returns a Map<id, vertex> in mermaid 11.4.1
    const verticesMap = db.getVertices()
    const nodes: GraphNode[] = Array.from(verticesMap.values()).map((v) => ({
      id: v.id,
      label: v.text !== undefined && v.text !== '' ? normalizeLabelText(v.text) : v.id,
      shape: mapShape(v.type),
    }))

    // getEdges() returns an array with start/end/text fields
    const rawEdges = db.getEdges()
    const edges: GraphEdge[] = rawEdges.map((e, i) => ({
      id: `${e.start}-${e.end}-${i}`,
      source: e.start,
      target: e.end,
      ...(e.text !== undefined && e.text !== ''
        ? { label: normalizeLabelText(e.text) }
        : {}),
    }))

    // getDirection() returns 'TD', 'LR', 'RL', 'BT' — normalizeDirection maps TD→TB
    const direction = normalizeDirection(db.getDirection?.())

    // subgraph(그룹) 추출: 멤버 노드 id 목록 + 제목
    const rawSubgraphs = db.getSubGraphs?.() ?? []
    const subgraphs = rawSubgraphs.map((s, i) => ({
      id: s.id ?? `subgraph-${i}`,
      title: s.title ?? s.id ?? '',
      nodeIds: Array.isArray(s.nodes) ? s.nodes : [],
    }))

    return { graph: { nodes, edges, direction, subgraphs }, error: null }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { graph: null, error: message }
  }
}
