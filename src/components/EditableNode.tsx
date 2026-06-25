import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'

/** 커스텀 노드가 라벨 변경을 App으로 올려보내기 위한 컨텍스트 */
export const LabelChangeContext = createContext<(id: string, label: string) => void>(
  () => {},
)

/**
 * 더블클릭으로 라벨을 인라인 편집할 수 있는 노드.
 * 위/아래 핸들로 다른 노드와 연결(엣지 생성)할 수 있다.
 */
export default function EditableNode({ id, data }: NodeProps) {
  const onLabelChange = useContext(LabelChangeContext)
  const label = (data as { label: string }).label ?? ''

  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(label)
  const inputRef = useRef<HTMLInputElement>(null)

  // 외부(코드 편집 등)에서 라벨이 바뀌면 입력값을 동기화
  useEffect(() => {
    setValue(label)
  }, [label])

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  const commit = () => {
    setEditing(false)
    const trimmed = value.trim()
    if (trimmed && trimmed !== label) {
      onLabelChange(id, trimmed)
    } else {
      setValue(label) // 빈 값/무변경이면 되돌림
    }
  }

  const cancel = () => {
    setEditing(false)
    setValue(label)
  }

  return (
    <div
      className="min-w-[120px] rounded-md border border-slate-300 bg-white px-4 py-2 text-center text-sm text-slate-800 shadow-sm"
      onDoubleClick={() => setEditing(true)}
      title="더블클릭하여 라벨 편집"
    >
      <Handle type="target" position={Position.Top} className="!bg-slate-400" />
      {editing ? (
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            else if (e.key === 'Escape') cancel()
          }}
          className="w-full bg-transparent text-center outline-none"
        />
      ) : (
        <span>{label}</span>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-slate-400" />
    </div>
  )
}
