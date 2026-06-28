import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Position } from '@xyflow/react'
import EditableEdge, { EdgeLabelChangeContext } from './EditableEdge'

const baseProps = {
  id: 'A-B-0',
  sourceX: 0,
  sourceY: 0,
  targetX: 100,
  targetY: 100,
  sourcePosition: Position.Bottom,
  targetPosition: Position.Top,
  source: 'A',
  target: 'B',
  selected: false,
  animated: false,
  deletable: true,
  selectable: true,
  draggable: false,
  zIndex: 0,
  isFocusable: false,
} as const

describe('EditableEdge', () => {
  it('renders edge labels as theme-aware text without a visible background box', () => {
    const { container } = render(
      <svg>
        <EditableEdge {...baseProps} label="edge label" />
      </svg>,
    )

    expect(screen.getByText('edge label').classList.contains('edge-label-text')).toBe(
      true,
    )
    expect(container.querySelector('.edge-label-background')).toBeNull()
  })

  it('commits edited edge labels', () => {
    let committed: { id: string; label: string } | null = null

    render(
      <svg>
        <EdgeLabelChangeContext.Provider
          value={(id, label) => {
            committed = { id, label }
          }}
        >
          <EditableEdge {...baseProps} label="old" />
        </EdgeLabelChangeContext.Provider>
      </svg>,
    )

    fireEvent.doubleClick(screen.getByText('old'))
    const editor = screen.getByDisplayValue('old')
    fireEvent.change(editor, { target: { value: 'new' } })
    fireEvent.blur(editor)

    expect(committed).toEqual({ id: 'A-B-0', label: 'new' })
  })
})
