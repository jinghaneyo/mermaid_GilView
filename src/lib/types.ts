import type { Node, Edge } from '@xyflow/react'

export type Direction = 'TB' | 'BT' | 'LR' | 'RL'

// App/캔버스에서 사용하는 React Flow 노드/엣지 타입
export type AppNodeData = { label: string }
export type AppNode = Node<AppNodeData>
export type AppEdge = Edge

export interface GraphNode {
  id: string
  label: string
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  label?: string
}

export interface ParsedGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
  direction: Direction
}

// React Flow 호환 출력
export interface FlowNode {
  id: string
  data: { label: string }
  position: { x: number; y: number }
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
}
