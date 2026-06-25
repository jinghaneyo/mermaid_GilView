import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from '@xyflow/react'

/** 커스텀 엣지가 라벨 변경을 App으로 올려보내기 위한 컨텍스트 */
export const EdgeLabelChangeContext = createContext<
  (id: string, label: string) => void
>(() => {})

/**
 * 더블클릭으로 라벨을 인라인 편집할 수 있는 엣지.
 * 라벨이 없으면 "+라벨" 안내를 표시해 추가를 유도한다.
 */
export default function EditableEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  label,
  markerEnd,
  style,
}: EdgeProps) {
  const onLabelChange = useContext(EdgeLabelChangeContext)
  const text = typeof label === 'string' ? label : ''

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(text)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setValue(text)
  }, [text])

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  const commit = () => {
    setEditing(false)
    const trimmed = value.trim()
    if (trimmed !== text) onLabelChange(id, trimmed)
  }

  const cancel = () => {
    setEditing(false)
    setValue(text)
  }

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan absolute"
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: 'all',
          }}
          onDoubleClick={() => setEditing(true)}
          title="더블클릭하여 라벨 편집"
        >
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
              className="w-16 rounded border border-slate-300 bg-white px-1 text-center text-xs outline-none"
            />
          ) : text ? (
            <span className="rounded border border-slate-200 bg-white/90 px-1 text-xs text-slate-700">
              {text}
            </span>
          ) : (
            <span className="rounded border border-dashed border-slate-300 bg-white/70 px-1 text-[10px] text-slate-400">
              +라벨
            </span>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  )
}
