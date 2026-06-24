import { useState } from 'react'
import MermaidEditor from './components/MermaidEditor'
import FlowCanvas from './components/FlowCanvas'
import { useMermaidToFlow } from './hooks/useMermaidToFlow'

const INITIAL_CODE = `graph TD
  A[시작] --> B{조건}
  B -->|예| C[처리]
  B -->|아니오| D[종료]
  C --> D`

export default function App() {
  const [code, setCode] = useState(INITIAL_CODE)
  const { nodes, edges, error } = useMermaidToFlow(code)

  return (
    <div className="flex h-full w-full">
      <div className="w-2/5 min-w-[280px] max-w-[640px] border-r border-slate-700">
        <MermaidEditor code={code} onChange={setCode} error={error} />
      </div>
      <div className="flex-1">
        <FlowCanvas nodes={nodes} edges={edges} />
      </div>
    </div>
  )
}
