import { beforeEach, describe, it, expect } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import MermaidVisualEditor from './MermaidVisualEditor'
import { convertCanvasToMermaid } from './MermaidVisualEditor'

beforeEach(() => {
  localStorage.clear()
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

describe('MermaidVisualEditor: convertCanvasToMermaid (canvas -> code)', () => {
  it('graph TD 헤더와 노드 라벨, 엣지를 출력한다', () => {
    const nodes = [
      { id: 'A', data: { label: '시작' }, position: { x: 0, y: 0 } },
      { id: 'B', data: { label: '종료' }, position: { x: 0, y: 0 } },
    ]
    const edges = [{ id: 'A-B', source: 'A', target: 'B' }]
    expect(convertCanvasToMermaid(nodes, edges)).toBe(
      'graph TD\n  A[시작]\n  B[종료]\n  A --> B',
    )
  })

  it('엣지 라벨이 있으면 A -->|라벨| B 로 출력한다', () => {
    const nodes = [
      { id: 'A', data: { label: '조건' }, position: { x: 0, y: 0 } },
      { id: 'B', data: { label: '처리' }, position: { x: 0, y: 0 } },
    ]
    const edges = [{ id: 'A-B', source: 'A', target: 'B', label: '예' }]
    expect(convertCanvasToMermaid(nodes, edges)).toBe(
      'graph TD\n  A[조건]\n  B[처리]\n  A -->|예| B',
    )
  })

  it('라벨이 비면 노드 ID를 라벨로 쓴다', () => {
    const nodes = [{ id: 'X', data: { label: '' }, position: { x: 0, y: 0 } }]
    expect(convertCanvasToMermaid(nodes, [])).toBe('graph TD\n  X[X]')
  })
})

describe('MermaidVisualEditor: custom node sizes', () => {
  it('preserves custom node size comments when exporting canvas nodes', () => {
    const nodes = [
      {
        id: 'main',
        data: { label: 'Main', customSize: true },
        position: { x: 0, y: 0 },
        width: 260,
        height: 120,
      },
    ]

    expect(convertCanvasToMermaid(nodes, [])).toBe(
      'graph TD\n%% gilview:node main width=260 height=120\n  main[Main]',
    )
  })
})

describe('MermaidVisualEditor: safe Mermaid labels', () => {
  it('quotes node labels that include Mermaid shape syntax characters', () => {
    const nodes = [
      {
        id: 'main',
        data: { label: 'main() (진입점/설정파싱2)' },
        position: { x: 0, y: 0 },
      },
    ]

    expect(convertCanvasToMermaid(nodes, [])).toBe(
      'graph TD\n  main["main() (진입점/설정파싱2)"]',
    )
  })
})

describe('MermaidVisualEditor: node label editing', () => {
  function loadTestDiagram(code = 'graph TD\n  A[Start] --> B[End]') {
    localStorage.setItem(
      'mermaid-gilview-workspace',
      JSON.stringify({
        tabs: [{ id: 1, name: 'Test', code }],
        activeId: 1,
        settings: {
          theme: 'light',
          showGrid: true,
          fitNodeWidthToText: false,
          leftWidth: 440,
        },
      }),
    )
  }

  it('commits edited labels on blur without treating the blur event as a label', async () => {
    loadTestDiagram()
    render(<MermaidVisualEditor />)

    const nodeLabel = await screen.findByText('Start')
    fireEvent.doubleClick(nodeLabel)

    const editor = await screen.findByDisplayValue('Start')
    fireEvent.change(editor, { target: { value: 'Blur label' } })
    fireEvent.blur(editor)

    await waitFor(() => {
      expect(screen.getByText('Blur label')).toBeTruthy()
      expect(
        screen
          .getAllByRole('textbox')
          .some(
            (textbox) =>
              textbox.value.includes('A[Blur label]') &&
              textbox.value.includes('B[End]'),
          ),
      ).toBe(true)
    })
  })

  it('keeps label editing active when clicking inside the label editor', async () => {
    loadTestDiagram()
    render(<MermaidVisualEditor />)

    const nodeLabel = await screen.findByText('Start')
    fireEvent.doubleClick(nodeLabel)

    const editor = await screen.findByDisplayValue('Start')
    fireEvent.change(editor, { target: { value: 'Inside click label' } })
    fireEvent.mouseDown(editor)
    fireEvent.click(editor)

    expect(screen.getByDisplayValue('Inside click label')).toBeTruthy()

    fireEvent.blur(editor)

    await waitFor(() => {
      expect(screen.getByText('Inside click label')).toBeTruthy()
      expect(
        screen
          .getAllByRole('textbox')
          .some(
            (textbox) =>
              textbox.value.includes('A[Inside click label]') &&
              textbox.value.includes('B[End]'),
          ),
      ).toBe(true)
    })
  })

  it('commits multiline labels with Enter', async () => {
    loadTestDiagram()
    render(<MermaidVisualEditor />)

    const nodeLabel = await screen.findByText('Start')
    fireEvent.doubleClick(nodeLabel)

    const editor = await screen.findByDisplayValue('Start')
    editor.value = 'First\nSecond'
    fireEvent.keyDown(editor, { key: 'Enter' })

    await waitFor(() => {
      expect(
        Array.from(document.querySelectorAll('.react-flow__node')).some((node) =>
          node.textContent?.includes('First') && node.textContent?.includes('Second'),
        ),
      ).toBe(true)
      expect(
        screen
          .getAllByRole('textbox')
          .some((textbox) => textbox.value.includes('A["First<br/>Second"]')),
      ).toBe(true)
    })
  })

  it('commits after IME composition is confirmed with Enter', async () => {
    loadTestDiagram()

    render(<MermaidVisualEditor />)

    const nodeLabel = await screen.findByText('Start')
    fireEvent.doubleClick(nodeLabel)

    const editor = await screen.findByDisplayValue('Start')
    fireEvent.compositionStart(editor)
    fireEvent.change(editor, { target: { value: 'New label' } })
    fireEvent.keyDown(editor, {
      key: 'Enter',
      nativeEvent: { isComposing: true },
    })
    fireEvent.compositionEnd(editor)

    await waitFor(() => {
      expect(screen.getByText('New label')).toBeTruthy()
      expect(
        screen
          .getAllByRole('textbox')
          .some(
            (textbox) =>
              textbox.value.includes('A[New label]') &&
              textbox.value.includes('B[End]'),
          ),
      ).toBe(true)
    })
  })

  it('adds a node with the selected shape from the canvas toolbar', async () => {
    loadTestDiagram('graph TD\n  A[Start]')
    render(<MermaidVisualEditor />)

    fireEvent.click(await screen.findByRole('button', { name: '마름모 노드' }))
    fireEvent.click(screen.getByRole('button', { name: '노드 추가' }))

    await waitFor(() => {
      expect(
        screen
          .getAllByRole('textbox')
          .some((textbox) => textbox.value.includes('N1{새 노드}')),
      ).toBe(true)
    })
  })

  it('selects and highlights the subgraph declaration when a subgraph is clicked', async () => {
    const code = 'graph TD\n  subgraph Cluster\n    A[Start]\n  end'
    loadTestDiagram(code)
    render(<MermaidVisualEditor />)

    fireEvent.click(await screen.findByText('Cluster'))

    await waitFor(() => {
      const editor = screen
        .getAllByRole('textbox')
        .find((textbox) => textbox.value === code)
      expect(editor.selectionStart).toBe(code.indexOf('  subgraph Cluster'))
      expect(editor.selectionEnd).toBe(
        code.indexOf('  subgraph Cluster') + '  subgraph Cluster'.length,
      )
      expect(document.querySelector('.code-line-flash')).toBeTruthy()
    })
  })

  it('selects the diagram node when its Mermaid code is clicked', async () => {
    const code = 'graph TD\n  A[Start] --> B[End]'
    loadTestDiagram(code)
    render(<MermaidVisualEditor />)

    const nodeLabel = await screen.findByText('End')
    const editor = screen
      .getAllByRole('textbox')
      .find((textbox) => textbox.value === code)
    editor.setSelectionRange(code.indexOf('End'), code.indexOf('End'))
    fireEvent.click(editor)

    await waitFor(() => {
      const node = nodeLabel.closest('.react-flow__node')
      expect(node.querySelector('.react-flow__resize-control')).toBeTruthy()
    })
  })
})
