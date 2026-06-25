import type { Node, Edge } from '@xyflow/react'

export type Direction = 'TB' | 'BT' | 'LR' | 'RL'

// App/캔버스에서 사용하는 React Flow 노드/엣지 타입
export type AppNodeData = { label: string }
export type AppNode = Node<AppNodeData>
export type AppEdge = Edge

export interface GraphNode {
  id: string
  label: string
  shape?: string // 'rect' | 'diamond' | 'cylinder' | 'round' | 'stadium' | 'circle' ...
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  label?: string
}

// subgraph(그룹) 정보: 어떤 노드들이 한 그룹에 속하는지 + 제목
export interface Subgraph {
  id: string
  title: string
  nodeIds: string[]
}

export interface ParsedGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
  direction: Direction
  subgraphs?: Subgraph[]
}

// 그룹 박스(레이아웃 후 멤버 노드들을 감싸는 사각형)
export interface GroupBox {
  id: string
  label: string
  position: { x: number; y: number }
  width: number
  height: number
  nodeIds: string[]
}

// React Flow 호환 출력
export interface FlowNode {
  id: string
  type?: string
  data: { label: string; shape?: string }
  position: { x: number; y: number }
  width?: number
  height?: number
}

export interface FlowEdge {
  id: string
  source: string
  target: string
  label?: string
}

export interface FlowGraph {
  nodes: FlowNode[]
  edges: FlowEdge[]
}

export interface ConvertResult {
  nodes: FlowNode[]
  edges: FlowEdge[]
  error: string | null
  groups?: GroupBox[]
}
