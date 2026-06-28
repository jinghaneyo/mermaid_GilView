import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { BaseEdge, getBezierPath, type EdgeProps } from '@xyflow/react'

export const EdgeLabelChangeContext = createContext<
  (id: string, label: string) => void
>(() => {})

export default function EditableEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  label,
  data,
  markerEnd,
  style,
}: EdgeProps) {
  const onLabelChange = useContext(EdgeLabelChangeContext)
  const text =
    typeof label === 'string'
      ? label
      : typeof data?.label === 'string'
        ? data.label
        : ''

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
      {editing ? (
        <foreignObject
          x={labelX - 48}
          y={labelY - 16}
          width={96}
          height={32}
          requiredExtensions="http://www.w3.org/1999/xhtml"
        >
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit()
              else if (e.key === 'Escape') cancel()
            }}
            className="nodrag nopan w-20 rounded border border-slate-300 bg-white px-1 text-center text-xs text-slate-900 outline-none dark:border-slate-500 dark:bg-slate-800 dark:text-slate-100"
          />
        </foreignObject>
      ) : (
        <g
          className="nodrag nopan"
          onDoubleClick={() => setEditing(true)}
          style={{ pointerEvents: 'all' }}
        >
          <rect
            x={labelX - 28}
            y={labelY - 10}
            width={56}
            height={20}
            rx={4}
            className="edge-label-hitbox"
          />
          <text
            x={labelX}
            y={labelY}
            textAnchor="middle"
            dominantBaseline="central"
            className={
              text
                ? 'edge-label-text text-xs'
                : 'edge-label-text edge-label-placeholder text-[10px]'
            }
          >
            {text || '+label'}
          </text>
        </g>
      )}
    </>
  )
}
