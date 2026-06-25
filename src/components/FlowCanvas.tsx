import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  type OnDelete,
  type NodeTypes,
  type EdgeTypes,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { AppNode, AppEdge } from '../lib/types'

interface Props {
  nodes: AppNode[]
  edges: AppEdge[]
  onNodesChange: OnNodesChange<AppNode>
  onEdgesChange: OnEdgesChange<AppEdge>
  onConnect: OnConnect
  onDelete: OnDelete<AppNode, AppEdge>
  nodeTypes: NodeTypes
  edgeTypes: EdgeTypes
}

export default function FlowCanvas({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onDelete,
  nodeTypes,
  edgeTypes,
}: Props) {
  return (
    <div className="h-full w-full bg-slate-50">
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onDelete={onDelete}
          deleteKeyCode={['Backspace', 'Delete']}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#cbd5e1" gap={20} />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable className="!bg-white" />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  )
}
