import { beforeEach, describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { toPng } from 'html-to-image'
import MermaidVisualEditor from './MermaidVisualEditor'
import { version } from '../package.json'

vi.mock('html-to-image', () => ({
  toPng: vi.fn(async () => 'data:image/png;base64,'),
  toSvg: vi.fn(async () => 'data:image/svg+xml,'),
}))

beforeEach(() => {
  localStorage.clear()
  window.history.replaceState(null, '', '/')
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  if (!SVGElement.prototype.getBBox) {
    SVGElement.prototype.getBBox = () => ({
      x: 0,
      y: 0,
      width: 80,
      height: 20,
    })
  }
  if (!SVGElement.prototype.getComputedTextLength) {
    SVGElement.prototype.getComputedTextLength = () => 80
  }
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

  it('loads Mermaid code from embed hash instead of the saved workspace', async () => {
    loadTestDiagram('graph TD\n  Old[Saved] --> Code[Ignored]')
    const code = [
      'sequenceDiagram',
      '  사용자->>서버: 요청 전송',
      '  서버-->>사용자: 응답 반환',
    ].join('\n')
    const bytes = new TextEncoder().encode(code)
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)
    const encoded = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    window.history.replaceState(null, '', `/#embed=1&theme=dark&code=${encoded}`)

    render(<MermaidVisualEditor />)

    await waitFor(() => {
      expect(screen.getAllByRole('textbox').map((textbox) => textbox.value)).toContain(code)
    })
    expect(await screen.findByTestId('mermaid-sequence-preview')).toBeTruthy()
    expect(await screen.findByTestId('sequence-diagram-surface')).toBeTruthy()
  })

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

    fireEvent.change(await screen.findByRole('combobox', { name: 'Node shape' }), {
      target: { value: 'diamond' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add node' }))

    await waitFor(() => {
      expect(
        screen
          .getAllByRole('textbox')
          .some((textbox) => textbox.value.includes('N1{New node}')),
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
      expect(node.querySelector('.diagram-node-flash')).toBeTruthy()
    })
  })

  it('selects a matching node from the canvas search box', async () => {
    const code = 'graph TD\n  A[Start] --> B[Process]\n  B --> C[Finish]'
    loadTestDiagram(code)
    render(<MermaidVisualEditor />)

    const targetLabel = await screen.findByText('Finish')
    const search = screen.getByRole('searchbox', { name: 'Search nodes' })
    fireEvent.change(search, { target: { value: 'finish' } })

    await waitFor(() => {
      const node = targetLabel.closest('.react-flow__node')
      expect(node.querySelector('.react-flow__resize-control')).toBeTruthy()
      expect(screen.getByText('1/1')).toBeTruthy()
    })
  })

  it('hides and restores the Mermaid code panel while keeping the diagram visible', async () => {
    const code = 'graph TD\n  A[Start] --> B[End]'
    const getCodeEditor = () =>
      screen.queryAllByRole('textbox').find((textbox) => textbox.value === code)
    loadTestDiagram(code)
    render(<MermaidVisualEditor />)

    expect(await screen.findByText('Start')).toBeTruthy()
    expect(getCodeEditor()).toBeTruthy()

    const hideCodeButton = screen.getByRole('button', { name: 'Hide code' })
    expect(hideCodeButton.className).toContain('bg-amber-400')
    expect(hideCodeButton.className).toContain('text-slate-950')
    expect(hideCodeButton.textContent).not.toContain('<<')
    expect(hideCodeButton.querySelector('svg')).toBeTruthy()

    fireEvent.click(hideCodeButton)

    expect(getCodeEditor()).toBeFalsy()
    expect(screen.queryByTitle('Drag to resize panels')).toBeFalsy()
    expect(screen.getByText('Start')).toBeTruthy()

    const showCodeButton = screen.getByRole('button', { name: 'Show code' })
    expect(showCodeButton.textContent).not.toContain('>>')
    expect(showCodeButton.querySelector('svg')).toBeTruthy()

    fireEvent.click(showCodeButton)

    expect(getCodeEditor()).toBeTruthy()
    expect(screen.getByTitle('Drag to resize panels')).toBeTruthy()
  })

  it('renders sequence diagrams with a visual editor canvas', async () => {
    const code = [
      'sequenceDiagram',
      '  participant A as Alice',
      '  participant B as Bob',
      '  A->>B: Hello',
    ].join('\n')
    loadTestDiagram(code)
    render(<MermaidVisualEditor />)

    const preview = await screen.findByTestId('sequence-editor-canvas')

    await waitFor(() => {
      expect(preview.textContent).toContain('Alice')
      expect(preview.textContent).toContain('Bob')
      expect(preview.textContent).toContain('Hello')
      expect(document.querySelector('.react-flow')).toBeFalsy()
    })
  })

  it('fits sequence participant width to long labels when fit width is enabled', async () => {
    const code = [
      'sequenceDiagram',
      '  participant ExternalSensor as External TCP/WebSocket Sensor Gateway',
      '  participant B as Bob',
      '  ExternalSensor->>B: Hello',
    ].join('\n')
    loadTestDiagram(code)
    render(<MermaidVisualEditor />)

    const participant = await screen.findByRole('button', {
      name: 'External TCP/WebSocket Sensor Gateway',
    })
    expect(participant.style.width).toBe('128px')

    fireEvent.change(screen.getByRole('combobox', { name: 'View options' }), {
      target: { value: 'fit' },
    })

    await waitFor(() => {
      expect(Number.parseFloat(participant.style.width)).toBeGreaterThan(240)
    })

    fireEvent.change(screen.getByRole('combobox', { name: 'View options' }), {
      target: { value: 'fit' },
    })

    await waitFor(() => {
      expect(participant.style.width).toBe('128px')
    })
  })

  it('fits sequence call block width to long labels when fit width is enabled', async () => {
    const code = [
      'sequenceDiagram',
      '  participant Tracker as Tracker',
      '  Tracker->>Tracker: processBatch() -> processBatchPredictJPDAO()',
    ].join('\n')
    loadTestDiagram(code)
    render(<MermaidVisualEditor />)

    const block = await screen.findByTestId('sequence-call-block')
    const rect = block.querySelector('rect')
    expect(Number(rect.getAttribute('width'))).toBe(210)

    fireEvent.change(screen.getByRole('combobox', { name: 'View options' }), {
      target: { value: 'fit' },
    })

    await waitFor(() => {
      expect(Number(rect.getAttribute('width'))).toBeGreaterThan(260)
      expect(Number(rect.getAttribute('width'))).toBeLessThan(310)
    })

    fireEvent.change(screen.getByRole('combobox', { name: 'View options' }), {
      target: { value: 'fit' },
    })

    await waitFor(() => {
      expect(Number(rect.getAttribute('width'))).toBe(210)
    })
  })

  it('fits the sequence message editor width to the selected call block', async () => {
    const label = 'handleMessage() / *FromJSON (검증-변환)'
    const code = [
      'sequenceDiagram',
      '  participant SensorClient as SensorClient',
      `  SensorClient->>SensorClient: ${label}`,
    ].join('\n')
    loadTestDiagram(code)
    render(<MermaidVisualEditor />)

    const block = await screen.findByTestId('sequence-call-block')
    fireEvent.change(screen.getByRole('combobox', { name: 'View options' }), {
      target: { value: 'fit' },
    })

    await waitFor(() => {
      expect(Number(block.querySelector('rect').getAttribute('width'))).toBeGreaterThan(
        240,
      )
    })

    fireEvent.doubleClick(block)

    const editor = await screen.findByLabelText('Edit message label')
    const rect = block.querySelector('rect')
    expect(Number.parseFloat(editor.style.width)).toBeCloseTo(
      Number(rect.getAttribute('width')) + 2,
    )
    expect(Number.parseFloat(editor.style.left)).toBeCloseTo(
      Number(rect.getAttribute('x')) - 1,
    )
    expect(Number.parseFloat(editor.style.top)).toBeCloseTo(
      Number(rect.getAttribute('y')) + 6,
    )
  })

  it('renders sequence-only visual editor elements instead of relying on the official SVG view', async () => {
    const code = [
      'sequenceDiagram',
      '  participant A as Alice',
      '  participant B as Bob',
      '  activate A',
      '  A->>A: Self check',
      '  loop Retry',
      '    A-->>B: Done',
      '  end',
      '  Note over A,B: shared state',
      '  deactivate A',
    ].join('\n')
    loadTestDiagram(code)
    render(<MermaidVisualEditor />)

    await screen.findByTestId('sequence-editor-canvas')

    await waitFor(() => {
      expect(screen.queryByTestId('sequence-official-render')).toBeFalsy()
      expect(screen.queryByTestId('sequence-self-message')).toBeFalsy()
      expect(screen.getByTestId('sequence-call-block').textContent).toContain(
        'Self check',
      )
      expect(screen.getByTestId('sequence-fragment').textContent).toContain('loop')
      expect(screen.getByTestId('sequence-note').textContent).toContain('shared state')
      expect(screen.getByTestId('sequence-activation')).toBeTruthy()
    })
  })

  it('fits sequence note boxes around long labels', async () => {
    const noteText = 'batchLoop() 주기 실행 (goroutine 추정)'
    const code = [
      'sequenceDiagram',
      '  participant A as Tracker',
      '  Note right of A: ' + noteText,
    ].join('\n')
    loadTestDiagram(code)
    render(<MermaidVisualEditor />)

    await screen.findByTestId('sequence-editor-canvas')

    await waitFor(() => {
      const note = screen.getByTestId('sequence-note')
      const rect = note.querySelector('rect')
      expect(note.textContent).toContain(noteText)
      expect(Number(rect.getAttribute('width'))).toBeGreaterThan(240)
    })
  })

  it('renders same-participant calls as function blocks centered on the lifeline', async () => {
    const code = [
      'sequenceDiagram',
      '  participant Cli as Client',
      '  Cli->>Cli: receiveLoop()/consumeLoop()',
    ].join('\n')
    loadTestDiagram(code)
    render(<MermaidVisualEditor />)

    await screen.findByTestId('sequence-editor-canvas')

    await waitFor(() => {
      const block = screen.getByTestId('sequence-call-block')
      expect(block.textContent).toContain('receiveLoop()/consumeLoop()')
      expect(Number(block.querySelector('rect').getAttribute('x')) + 105).toBe(136)
    })
  })

  it('centers sequence activation blocks on their participant lifelines', async () => {
    const code = [
      'sequenceDiagram',
      '  participant A as Alice',
      '  participant B as Bob',
      '  activate A',
      '  A->>B: First',
      '  deactivate A',
      '  activate B',
      '  B-->>A: Second',
      '  deactivate B',
    ].join('\n')
    loadTestDiagram(code)
    render(<MermaidVisualEditor />)

    await screen.findByTestId('sequence-editor-canvas')

    await waitFor(() => {
      const activations = screen.getAllByTestId('sequence-activation')
      expect(activations).toHaveLength(2)
      expect(Number(activations[0].getAttribute('x')) + 5).toBe(136)
      expect(Number(activations[1].getAttribute('x')) + 5).toBe(308)
    })
  })

  it('renders async sequence message labels as arrow text, not boxed shapes', async () => {
    const code = [
      'sequenceDiagram',
      '  participant Ext as External',
      '  participant Cli as Client',
      '  Ext-->>Cli: Measurement stream',
    ].join('\n')
    loadTestDiagram(code)
    render(<MermaidVisualEditor />)

    const messageButton = await screen.findByRole('button', {
      name: 'Measurement stream',
    })

    expect(messageButton.dataset.messageOverlay).toBe('true')
    expect(messageButton.className).not.toContain('bg-white')
    expect(messageButton.className).not.toContain('shadow')
    expect(messageButton.className).not.toContain('rounded')
    expect(screen.getByTestId('sequence-editor-canvas').textContent).toContain(
      'Measurement stream',
    )
  })

  it('marks sequence message from and to participants with endpoint circles', async () => {
    const code = [
      'sequenceDiagram',
      '  participant Ext as External',
      '  participant Cli as Client',
      '  Ext-->>Cli: Measurement stream',
    ].join('\n')
    loadTestDiagram(code)
    render(<MermaidVisualEditor />)

    await screen.findByTestId('sequence-editor-canvas')

    await waitFor(() => {
      const endpoints = screen.getAllByTestId('sequence-message-endpoint')
      expect(endpoints).toHaveLength(2)
      expect(endpoints[0].getAttribute('data-endpoint')).toBe('from')
      expect(endpoints[0].getAttribute('data-participant')).toBe('Ext')
      expect(Number(endpoints[0].getAttribute('cx'))).toBe(136)
      expect(Number(endpoints[0].getAttribute('r'))).toBe(5)
      expect(endpoints[0].getAttribute('fill')).toBe('#ffffff')
      expect(endpoints[1].getAttribute('data-endpoint')).toBe('to')
      expect(endpoints[1].getAttribute('data-participant')).toBe('Cli')
      expect(Number(endpoints[1].getAttribute('cx'))).toBe(308)
      expect(Number(endpoints[1].getAttribute('r'))).toBe(8)
      expect(endpoints[1].getAttribute('stroke')).toBe('#ffffff')
    })
  })

  it('keeps sequence visual editor controls and adds viewer controls', async () => {
    const code = [
      'sequenceDiagram',
      '  participant A as Alice',
      '  participant B as Bob',
      '  A->>B: Hello',
    ].join('\n')
    loadTestDiagram(code)
    render(<MermaidVisualEditor />)

    await screen.findByTestId('sequence-editor-canvas')

    expect(screen.getByRole('searchbox', { name: 'Search sequence' })).toBeTruthy()
    expect(screen.getByRole('combobox', { name: 'Zoom sequence' })).toBeTruthy()
    expect(screen.getByTestId('sequence-minimap')).toBeTruthy()
    expect(screen.getByRole('combobox', { name: 'Add sequence item' })).toBeTruthy()
    expect(screen.getByRole('combobox', { name: 'Move participant' })).toBeTruthy()
  })

  it('toggles the sequence diagram grid from the view options menu', async () => {
    const code = [
      'sequenceDiagram',
      '  participant A as Alice',
      '  participant B as Bob',
      '  A->>B: Hello',
    ].join('\n')
    loadTestDiagram(code)
    render(<MermaidVisualEditor />)

    await screen.findByTestId('sequence-editor-canvas')
    expect(screen.getByTestId('sequence-grid-background')).toBeTruthy()

    fireEvent.change(screen.getByRole('combobox', { name: 'View options' }), {
      target: { value: 'grid' },
    })

    await waitFor(() => {
      expect(screen.queryByTestId('sequence-grid-background')).toBeNull()
    })

    fireEvent.change(screen.getByRole('combobox', { name: 'View options' }), {
      target: { value: 'grid' },
    })

    await waitFor(() => {
      expect(screen.getByTestId('sequence-grid-background')).toBeTruthy()
    })
  })

  it('edits sequence participants and messages from the canvas', async () => {
    const code = [
      'sequenceDiagram',
      '  participant A as Alice',
      '  participant B as Bob',
      '  A->>B: Hello',
    ].join('\n')
    loadTestDiagram(code)
    render(<MermaidVisualEditor />)

    fireEvent.doubleClick(await screen.findByRole('button', { name: 'Alice' }))
    const participantEditor = await screen.findByLabelText('Edit participant label')
    fireEvent.change(participantEditor, { target: { value: 'Alice Prime' } })
    fireEvent.blur(participantEditor)

    fireEvent.doubleClick(await screen.findByRole('button', { name: 'Hello' }))
    const messageEditor = await screen.findByLabelText('Edit message label')
    fireEvent.change(messageEditor, { target: { value: 'Updated hello' } })
    fireEvent.blur(messageEditor)

    await waitFor(() => {
      expect(
        screen
          .getAllByRole('textbox')
          .some(
            (textbox) =>
              textbox.value.includes('participant A as Alice Prime') &&
              textbox.value.includes('A->>B: Updated hello'),
          ),
      ).toBe(true)
    })
  })

  it('fits the sequence message editor to long participant-to-participant labels', async () => {
    const longLabel = 'onTrackUpdate -> enqueuePublish (queue, async dispatch)'
    const code = [
      'sequenceDiagram',
      '  participant A as SensorClient',
      '  participant B as fusion.Coordinator',
      `  A-->>B: ${longLabel}`,
    ].join('\n')
    loadTestDiagram(code)
    render(<MermaidVisualEditor />)

    fireEvent.doubleClick(await screen.findByRole('button', { name: longLabel }))

    const messageEditor = await screen.findByLabelText('Edit message label')
    expect(Number.parseFloat(messageEditor.style.width)).toBeGreaterThan(300)
  })

  it('adds and moves sequence participants from the toolbar', async () => {
    const code = [
      'sequenceDiagram',
      '  participant A as Alice',
      '  participant B as Bob',
      '  A->>B: Hello',
    ].join('\n')
    loadTestDiagram(code)
    render(<MermaidVisualEditor />)

    fireEvent.click(await screen.findByRole('button', { name: 'Bob' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Move participant' }), {
      target: { value: 'left' },
    })
    fireEvent.change(screen.getByRole('combobox', { name: 'Add sequence item' }), {
      target: { value: 'participant' },
    })

    await waitFor(() => {
      expect(
        screen
          .getAllByRole('textbox')
          .some((textbox) =>
            textbox.value.includes(
              [
                'sequenceDiagram',
                '  participant B as Bob',
                '  participant A as Alice',
                '  participant P1 as Participant 1',
              ].join('\n'),
            ),
          ),
      ).toBe(true)
    })
  })

  it('searches sequence participants and messages', async () => {
    const code = [
      'sequenceDiagram',
      '  participant A as Alice',
      '  participant B as Bob',
      '  A->>B: Hello',
    ].join('\n')
    loadTestDiagram(code)
    render(<MermaidVisualEditor />)

    await screen.findByTestId('sequence-editor-canvas')
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search sequence' }), {
      target: { value: 'hello' },
    })

    await waitFor(() => {
      expect(screen.getByText('1/1')).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Hello' }).dataset.selected).toBe(
        'true',
      )
    })
  })

  it('syncs sequence canvas clicks to the Mermaid code line', async () => {
    const code = [
      'sequenceDiagram',
      '  participant A as Alice',
      '  participant B as Bob',
      '  A->>B: Hello',
    ].join('\n')
    loadTestDiagram(code)
    render(<MermaidVisualEditor />)

    fireEvent.click(await screen.findByRole('button', { name: 'Bob' }))

    await waitFor(() => {
      const editor = screen
        .getAllByRole('textbox')
        .find((textbox) => textbox.value === code)
      expect(editor.selectionStart).toBe(code.indexOf('  participant B as Bob'))
    })

    fireEvent.click(screen.getByRole('button', { name: 'Hello' }))

    await waitFor(() => {
      const editor = screen
        .getAllByRole('textbox')
        .find((textbox) => textbox.value === code)
      expect(editor.selectionStart).toBe(code.indexOf('  A->>B: Hello'))
    })
  })

  it('syncs visible sequence call block clicks to the Mermaid code line', async () => {
    const code = [
      'sequenceDiagram',
      '  participant A as Alice',
      '  A->>A: Self call',
    ].join('\n')
    loadTestDiagram(code)
    render(<MermaidVisualEditor />)

    await screen.findByTestId('sequence-editor-canvas')
    fireEvent.click(screen.getByTestId('sequence-call-block').querySelector('rect'))

    await waitFor(() => {
      const editor = screen
        .getAllByRole('textbox')
        .find((textbox) => textbox.value === code)
      expect(editor.selectionStart).toBe(code.indexOf('  A->>A: Self call'))
    })
  })

  it('does not recenter the sequence canvas when selecting an object from the diagram', async () => {
    const code = [
      'sequenceDiagram',
      '  participant A as Alice',
      '  participant B as Bob',
      ...Array.from({ length: 18 }, (_, index) => `  A->>B: Step ${index}`),
      '  A->>A: Self call',
    ].join('\n')
    loadTestDiagram(code)
    render(<MermaidVisualEditor />)

    const canvas = await screen.findByTestId('sequence-editor-canvas')
    Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: 320 })
    Object.defineProperty(canvas, 'clientHeight', { configurable: true, value: 220 })
    fireEvent.mouseDown(canvas, { button: 0, clientX: 200, clientY: 120 })
    fireEvent.mouseMove(canvas, { buttons: 1, clientX: 160, clientY: 90 })
    fireEvent.mouseUp(canvas)

    fireEvent.click(screen.getByTestId('sequence-call-block').querySelector('rect'))

    await waitFor(() => {
      const editor = screen
        .getAllByRole('textbox')
        .find((textbox) => textbox.value === code)
      expect(editor.selectionStart).toBe(code.indexOf('  A->>A: Self call'))
    })

    expect(Number.parseFloat(canvas.dataset.panLeft)).toBe(40)
    expect(Number.parseFloat(canvas.dataset.panTop)).toBe(30)
  })

  it('syncs Mermaid code clicks to the sequence canvas selection', async () => {
    const code = [
      'sequenceDiagram',
      '  participant A as Alice',
      '  participant B as Bob',
      '  A->>B: Hello',
    ].join('\n')
    loadTestDiagram(code)
    render(<MermaidVisualEditor />)

    await screen.findByTestId('sequence-editor-canvas')
    const editor = screen
      .getAllByRole('textbox')
      .find((textbox) => textbox.value === code)
    editor.setSelectionRange(code.indexOf('Hello'), code.indexOf('Hello'))
    fireEvent.click(editor)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Hello' }).dataset.selected).toBe(
        'true',
      )
    })
  })

  it('centers a Mermaid code line selection in the sequence canvas', async () => {
    const code = [
      'sequenceDiagram',
      '  participant A as Alice',
      '  participant B as Bob',
      '  participant C as Carol',
      '  participant D as Dave',
      '  participant E as Eve',
      '  participant F as Frank',
      '  A->>F: Wide message',
    ].join('\n')
    loadTestDiagram(code)
    render(<MermaidVisualEditor />)

    const canvas = await screen.findByTestId('sequence-editor-canvas')
    Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: 320 })
    Object.defineProperty(canvas, 'clientHeight', { configurable: true, value: 220 })

    const editor = screen
      .getAllByRole('textbox')
      .find((textbox) => textbox.value === code)
    editor.setSelectionRange(
      code.indexOf('Wide message'),
      code.indexOf('Wide message'),
    )
    fireEvent.click(editor)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Wide message' }).dataset.selected).toBe(
        'true',
      )
      expect(Number.parseFloat(canvas.dataset.panLeft)).toBeGreaterThan(300)
    })
  })

  it('flashes the sequence object selected from the Mermaid code line', async () => {
    const code = [
      'sequenceDiagram',
      '  participant A as Alice',
      '  participant B as Bob',
      '  A->>B: Hello',
    ].join('\n')
    loadTestDiagram(code)
    render(<MermaidVisualEditor />)

    await screen.findByTestId('sequence-editor-canvas')
    const editor = screen
      .getAllByRole('textbox')
      .find((textbox) => textbox.value === code)
    editor.setSelectionRange(code.indexOf('Hello'), code.indexOf('Hello'))
    fireEvent.click(editor)

    await waitFor(() => {
      const label = Array.from(document.querySelectorAll('svg text')).find(
        (text) => text.textContent === 'Hello',
      )
      expect(label.closest('g').classList.contains('diagram-node-flash')).toBe(
        true,
      )
      expect(label.closest('g').classList.contains('sequence-object-flash')).toBe(
        true,
      )
    })
  })

  it('zooms the sequence viewer and keeps a position minimap visible', async () => {
    const code = [
      'sequenceDiagram',
      '  participant A as Alice',
      '  participant B as Bob',
      '  A->>B: Hello',
    ].join('\n')
    loadTestDiagram(code)
    render(<MermaidVisualEditor />)

    await screen.findByTestId('sequence-diagram-surface')
    fireEvent.change(screen.getByRole('combobox', { name: 'Zoom sequence' }), {
      target: { value: 'in' },
    })

    await waitFor(() => {
      expect(screen.getByTestId('sequence-diagram-surface').style.transform).toBe(
        'scale(1.1)',
      )
      const minimap = screen.getByTestId('sequence-minimap')
      const minimapSvg = screen.getByTestId('sequence-minimap-svg')
      expect(minimap.className).toContain('absolute')
      expect(minimap.className).toContain('bottom-4')
      expect(minimap.className).toContain('right-4')
      expect(minimap.textContent).not.toContain('participants')
      expect(minimap.textContent).not.toContain('110%')
      expect(minimapSvg.getAttribute('width')).toBe('200')
      expect(minimapSvg.getAttribute('height')).toBe('150')
      expect(screen.getAllByTestId('sequence-minimap-participant')).toHaveLength(2)
      expect(screen.getAllByTestId('sequence-minimap-message')).toHaveLength(1)
    })

    fireEvent.change(screen.getByRole('combobox', { name: 'Zoom sequence' }), {
      target: { value: 'reset' },
    })

    await waitFor(() => {
      expect(screen.getByTestId('sequence-diagram-surface').style.transform).toBe(
        'scale(1)',
      )
    })
  })

  it('keeps wide sequence diagram controls scrollbar-free inside the right pane', async () => {
    const code = [
      'sequenceDiagram',
      '  participant A as Alice',
      '  participant B as Bob',
      '  participant C as Carol',
      '  participant D as Dave',
      '  participant E as Eve',
      '  participant F as Frank',
      '  A->>F: Wide message',
    ].join('\n')
    loadTestDiagram(code)
    render(<MermaidVisualEditor />)

    await screen.findByTestId('sequence-editor-canvas')

    expect(screen.getByTestId('diagram-pane').className).toContain('min-w-0')
    expect(screen.getByTestId('diagram-pane').className).toContain('overflow-hidden')
    expect(screen.getByTestId('mermaid-sequence-preview').className).toContain(
      'overflow-hidden',
    )
    expect(screen.getByTestId('sequence-editor-canvas').className).toContain(
      'overflow-hidden',
    )
  })

  it('keeps flowchart and sequence toolbar controls on one compact row', async () => {
    loadTestDiagram('graph TD\n  A[Start] --> B[End]')
    render(<MermaidVisualEditor />)

    await screen.findByText('Start')

    expect(screen.getByTestId('diagram-toolbar').className).toContain('flex-nowrap')
    expect(screen.getByRole('combobox', { name: 'Node shape' })).toBeTruthy()
    expect(screen.getByRole('combobox', { name: 'Export diagram' })).toBeTruthy()
    expect(screen.getByRole('combobox', { name: 'View options' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Rect node' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'PNG' })).toBeNull()

    fireEvent.change(screen.getByRole('combobox', { name: 'Insert example template' }), {
      target: { value: 'sequence' },
    })

    await screen.findByTestId('sequence-diagram-surface')
    expect(screen.getByTestId('diagram-toolbar').className).toContain('flex-nowrap')
    expect(screen.queryByRole('combobox', { name: 'Node shape' })).toBeNull()
    expect(screen.getByRole('combobox', { name: 'Add sequence item' })).toBeTruthy()
    expect(screen.getByRole('combobox', { name: 'Move participant' })).toBeTruthy()
    expect(screen.getByRole('combobox', { name: 'Zoom sequence' })).toBeTruthy()
    expect(screen.getByRole('combobox', { name: 'Export diagram' })).toBeTruthy()
    expect(screen.getByRole('combobox', { name: 'View options' })).toBeTruthy()
  })

  it('loads dropped .mmdf Mermaid files into the active diagram', async () => {
    const initialCode = 'graph TD\n  Old[Initial]'
    loadTestDiagram(initialCode)
    render(<MermaidVisualEditor />)

    const nextCode = 'graph TD\n  File[From file] --> Rendered[Diagram]'
    const editor = (await screen.findAllByRole('textbox')).find((textbox) =>
      textbox.className.includes('code-editor-textarea'),
    )
    const file = new File([nextCode], 'dropped.mmdf', { type: 'text/plain' })

    fireEvent.dragOver(editor, { dataTransfer: { files: [file], types: ['Files'] } })
    fireEvent.drop(editor, { dataTransfer: { files: [file], types: ['Files'] } })

    await waitFor(() => {
      expect(editor.value).toBe(nextCode)
      expect(screen.getByText('From file')).toBeTruthy()
      expect(screen.getByText('Diagram')).toBeTruthy()
    })
  })

  it('ignores dropped Mermaid files with unsupported extensions', async () => {
    const initialCode = 'graph TD\n  Keep[Current]'
    loadTestDiagram(initialCode)
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    render(<MermaidVisualEditor />)

    const editor = (await screen.findAllByRole('textbox')).find((textbox) =>
      textbox.className.includes('code-editor-textarea'),
    )
    const file = new File(['graph TD\n  Bad[Ignored]'], 'ignored.json', {
      type: 'application/json',
    })

    fireEvent.drop(editor, { dataTransfer: { files: [file], types: ['Files'] } })

    expect(editor.value).toBe(initialCode)
    expect(alertSpy).toHaveBeenCalledWith(
      'Only .mmd, .md, .txt, and .mmdf files are supported.',
    )

    alertSpy.mockRestore()
  })

  it('loads the diagram exported as .mmd and the mermaid block of a CRLF markdown file', async () => {
    loadTestDiagram('graph TD\n  Old[Initial]')
    render(<MermaidVisualEditor />)
    const editor = (await screen.findAllByRole('textbox')).find((textbox) =>
      textbox.className.includes('code-editor-textarea'),
    )

    const mmdCode = 'graph TD\n  Mmd[From mmd]'
    const mmd = new File([mmdCode], 'diagram.mmd', { type: 'text/plain' })
    fireEvent.drop(editor, { dataTransfer: { files: [mmd], types: ['Files'] } })
    await waitFor(() => expect(editor.value).toBe(mmdCode))

    const markdown = [
      '# Notes',
      '',
      '```mermaid',
      'graph TD',
      '  Md[From markdown] --> Done[Done]',
      '```',
      '',
      'More text',
    ].join('\r\n')
    const md = new File([markdown], 'notes.md', { type: 'text/markdown' })
    fireEvent.drop(editor, { dataTransfer: { files: [md], types: ['Files'] } })

    await waitFor(() => {
      expect(editor.value).toBe('graph TD\n  Md[From markdown] --> Done[Done]')
      expect(screen.getByText('From markdown')).toBeTruthy()
    })
  })

  it('pans and zooms the sequence diagram from the minimap', async () => {
    const code = [
      'sequenceDiagram',
      '  participant A as Alice',
      '  participant B as Bob',
      '  participant C as Carol',
      '  participant D as Dave',
      '  participant E as Eve',
      '  participant F as Frank',
      '  A->>F: Wide message',
    ].join('\n')
    loadTestDiagram(code)
    render(<MermaidVisualEditor />)

    const canvas = await screen.findByTestId('sequence-editor-canvas')
    Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: 320 })
    Object.defineProperty(canvas, 'clientHeight', { configurable: true, value: 220 })

    const minimap = screen.getByTestId('sequence-minimap-svg')
    minimap.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 200,
      bottom: 150,
      width: 200,
      height: 150,
      toJSON: () => {},
    })

    fireEvent.mouseDown(minimap, { clientX: 120, clientY: 42 })
    fireEvent.mouseMove(minimap, { clientX: 132, clientY: 46 })
    fireEvent.mouseUp(minimap)

    await waitFor(() => {
      expect(Number.parseFloat(canvas.dataset.panLeft)).toBeGreaterThan(0)
    })

    fireEvent.wheel(minimap, { deltaY: -100 })

    await waitFor(() => {
      expect(screen.getByTestId('sequence-diagram-surface').style.transform).toBe(
        'scale(1.1)',
      )
    })
  })

  it('pans the sequence diagram by dragging the canvas background', async () => {
    const code = [
      'sequenceDiagram',
      '  participant A as Alice',
      '  participant B as Bob',
      '  participant C as Carol',
      '  participant D as Dave',
      '  participant E as Eve',
      '  participant F as Frank',
      '  A->>F: Wide message',
    ].join('\n')
    loadTestDiagram(code)
    render(<MermaidVisualEditor />)

    const canvas = await screen.findByTestId('sequence-editor-canvas')
    Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: 320 })
    Object.defineProperty(canvas, 'clientHeight', { configurable: true, value: 220 })

    fireEvent.mouseDown(canvas, { button: 0, clientX: 200, clientY: 120 })
    fireEvent.mouseMove(canvas, { buttons: 1, clientX: 120, clientY: 80 })
    fireEvent.mouseUp(canvas)

    expect(Number.parseFloat(canvas.dataset.panLeft)).toBe(80)
    expect(Number.parseFloat(canvas.dataset.panTop)).toBe(40)
  })

  it('allows the sequence diagram to pan past the top-left boundary', async () => {
    const code = [
      'sequenceDiagram',
      '  participant A as Alice',
      '  participant B as Bob',
      '  A->>B: Hello',
    ].join('\n')
    loadTestDiagram(code)
    render(<MermaidVisualEditor />)

    const canvas = await screen.findByTestId('sequence-editor-canvas')
    Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: 320 })
    Object.defineProperty(canvas, 'clientHeight', { configurable: true, value: 220 })

    fireEvent.mouseDown(canvas, { button: 0, clientX: 120, clientY: 120 })
    fireEvent.mouseMove(canvas, { buttons: 1, clientX: 220, clientY: 190 })
    fireEvent.mouseUp(canvas)

    expect(Number.parseFloat(canvas.dataset.panLeft)).toBe(-100)
    expect(Number.parseFloat(canvas.dataset.panTop)).toBe(-70)
  })

  it('zooms the sequence diagram with the mouse wheel on the canvas', async () => {
    const code = [
      'sequenceDiagram',
      '  participant A as Alice',
      '  participant B as Bob',
      '  A->>B: Hello',
    ].join('\n')
    loadTestDiagram(code)
    render(<MermaidVisualEditor />)

    const canvas = await screen.findByTestId('sequence-editor-canvas')
    Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: 320 })
    Object.defineProperty(canvas, 'clientHeight', { configurable: true, value: 220 })

    fireEvent.wheel(canvas, { deltaY: -100, clientX: 160, clientY: 110 })

    await waitFor(() => {
      expect(screen.getByTestId('sequence-diagram-surface').style.transform).toBe(
        'scale(1.1)',
      )
      expect(screen.getByTestId('sequence-minimap').textContent).not.toContain(
        '110%',
      )
    })
  })

  it('keeps the sequence diagram anchored immediately when wheel zooming', async () => {
    const code = [
      'sequenceDiagram',
      '  participant A as Alice',
      '  participant B as Bob',
      '  A->>B: Hello',
    ].join('\n')
    loadTestDiagram(code)
    render(<MermaidVisualEditor />)

    const originalRequestAnimationFrame = window.requestAnimationFrame
    window.requestAnimationFrame = vi.fn()

    try {
      const canvas = await screen.findByTestId('sequence-editor-canvas')
      Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: 320 })
      Object.defineProperty(canvas, 'clientHeight', { configurable: true, value: 220 })
      fireEvent.mouseDown(canvas, { button: 0, clientX: 200, clientY: 120 })
      fireEvent.mouseMove(canvas, { buttons: 1, clientX: 160, clientY: 90 })
      fireEvent.mouseUp(canvas)

      fireEvent.wheel(canvas, { deltaY: -100, clientX: 160, clientY: 110 })

      expect(Number.parseFloat(canvas.dataset.panLeft)).toBeCloseTo(60)
      expect(Number.parseFloat(canvas.dataset.panTop)).toBeCloseTo(44)
      expect(window.requestAnimationFrame).not.toHaveBeenCalled()
    } finally {
      window.requestAnimationFrame = originalRequestAnimationFrame
    }
  })

  it('applies the sequence zoom before compensating scroll on wheel zoom', async () => {
    const code = [
      'sequenceDiagram',
      '  participant A as Alice',
      '  participant B as Bob',
      '  A->>B: Hello',
    ].join('\n')
    loadTestDiagram(code)
    render(<MermaidVisualEditor />)

    const canvas = await screen.findByTestId('sequence-editor-canvas')
    const surface = screen.getByTestId('sequence-diagram-surface')
    Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: 320 })
    Object.defineProperty(canvas, 'clientHeight', { configurable: true, value: 220 })

    fireEvent.wheel(canvas, { deltaY: -100, clientX: 160, clientY: 110 })

    expect(surface.style.transform).toBe('scale(1.1)')
    expect(Number.parseFloat(canvas.dataset.panLeft)).toBeCloseTo(16)
    expect(Number.parseFloat(canvas.dataset.panTop)).toBeCloseTo(11)
  })

  it('uses the mouse position inside the sequence diagram as the wheel zoom anchor', async () => {
    const code = [
      'sequenceDiagram',
      '  participant A as Alice',
      '  participant B as Bob',
      '  A->>B: Hello',
    ].join('\n')
    loadTestDiagram(code)
    render(<MermaidVisualEditor />)

    const canvas = await screen.findByTestId('sequence-editor-canvas')
    Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: 320 })
    Object.defineProperty(canvas, 'clientHeight', { configurable: true, value: 220 })
    canvas.style.paddingLeft = '24px'
    canvas.style.paddingTop = '24px'
    fireEvent.mouseDown(canvas, { button: 0, clientX: 200, clientY: 120 })
    fireEvent.mouseMove(canvas, { buttons: 1, clientX: 160, clientY: 90 })
    fireEvent.mouseUp(canvas)

    fireEvent.wheel(canvas, { deltaY: -100, clientX: 160, clientY: 110 })

    expect(Number.parseFloat(canvas.dataset.panLeft)).toBeCloseTo(57.6)
    expect(Number.parseFloat(canvas.dataset.panTop)).toBeCloseTo(41.6)
  })

  it('reorders a sequence participant when it is dragged and released on the canvas', async () => {
    const code = [
      'sequenceDiagram',
      '  participant A as Alice',
      '  participant B as Bob',
      '  participant C as Carol',
      '  A->>C: Hello',
    ].join('\n')
    loadTestDiagram(code)
    render(<MermaidVisualEditor />)

    const canvas = await screen.findByTestId('sequence-editor-canvas')
    const surface = screen.getByTestId('sequence-diagram-surface')
    surface.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 720,
      bottom: 280,
      width: 720,
      height: 280,
      toJSON: () => {},
    })

    fireEvent.mouseDown(screen.getByRole('button', { name: 'Alice' }), {
      button: 0,
      clientX: 136,
      clientY: 44,
    })
    fireEvent.mouseUp(canvas, { clientX: 480, clientY: 44 })

    await waitFor(() => {
      expect(
        screen
          .getAllByRole('textbox')
          .some((textbox) =>
            textbox.value.includes(
              [
                'sequenceDiagram',
                '  participant B as Bob',
                '  participant C as Carol',
                '  participant A as Alice',
              ].join('\n'),
            ),
          ),
      ).toBe(true)
    })
  })
})

describe('MermaidVisualEditor: workspace safety and sync', () => {
  const STORAGE_KEY = 'mermaid-gilview-workspace'
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  const saveWorkspace = (tabs, activeId = tabs[0]?.id) =>
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ tabs, activeId, settings: {} }))
  const savedWorkspace = () => JSON.parse(localStorage.getItem(STORAGE_KEY))
  const codeEditor = () => screen.getByLabelText('Mermaid code')

  it('shows the app version from package.json', () => {
    render(<MermaidVisualEditor />)

    expect(screen.getByTitle('Mermaid GilView version').textContent).toBe(`v${version}`)
  })

  it('does not overwrite the saved workspace when opened from an embed link', async () => {
    const tabs = [
      { id: 1, name: 'Mine', code: 'graph TD\n  Saved[Saved] --> X' },
      { id: 2, name: 'Mine 2', code: 'graph TD\n  Y --> Z' },
    ]
    saveWorkspace(tabs)
    const encoded = btoa('graph TD\n  E[Embed] --> F')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
    window.history.replaceState(null, '', `/#embed=1&code=${encoded}`)

    render(<MermaidVisualEditor />)
    expect(await screen.findByText('Embed')).toBeTruthy()
    await sleep(600)

    expect(savedWorkspace().tabs).toEqual(tabs)
  })

  it('keeps the canvas in sync when undoing right after typing', async () => {
    saveWorkspace([{ id: 1, name: 'T', code: 'graph TD\n  A[Start] --> B[End]' }])
    render(<MermaidVisualEditor />)
    await screen.findByText('Start')

    fireEvent.change(codeEditor(), {
      target: { value: 'graph TD\n  A[Start] --> B[End]\n  C[Typed]' },
    })
    fireEvent.keyDown(codeEditor(), { key: 'z', ctrlKey: true })
    await sleep(400)

    expect(codeEditor().value).toBe('graph TD\n  A[Start] --> B[End]')
    expect(screen.queryByText('Typed')).toBeNull()
  })

  it('saves edits even when the stored active tab id does not exist', async () => {
    saveWorkspace([{ id: 1, name: 'T', code: 'graph TD\n  A[Start] --> B[End]' }], 99)
    render(<MermaidVisualEditor />)
    await screen.findByText('Start')

    fireEvent.change(codeEditor(), { target: { value: 'graph TD\n  A[Edited] --> B[End]' } })
    await sleep(600)

    expect(savedWorkspace().tabs[0].code).toBe('graph TD\n  A[Edited] --> B[End]')
  })

  it('shows the restored diagram even when the backup uses the same tab id', async () => {
    saveWorkspace([{ id: 1, name: 'Current', code: 'graph TD\n  Cur[Current]' }])
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { container } = render(<MermaidVisualEditor />)
    await screen.findByText('Current', { selector: '.react-flow__node *' })

    const backup = {
      version: 1,
      tabs: [{ id: 1, name: 'Restored', code: 'graph TD\n  R[From backup]' }],
      activeId: 1,
    }
    const file = new File([JSON.stringify(backup)], 'backup.json', {
      type: 'application/json',
    })
    fireEvent.change(container.querySelector('input[accept=".json"]'), {
      target: { files: [file] },
    })

    await waitFor(() => {
      expect(codeEditor().value).toBe('graph TD\n  R[From backup]')
      expect(screen.getByText('From backup')).toBeTruthy()
    })
    confirmSpy.mockRestore()
  })

  it('rejects a backup whose tabs have no Mermaid code', async () => {
    saveWorkspace([{ id: 1, name: 'Current', code: 'graph TD\n  Cur[Current]' }])
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    const { container } = render(<MermaidVisualEditor />)
    await screen.findByText('Current', { selector: '.react-flow__node *' })

    const file = new File([JSON.stringify({ tabs: [{ id: 1, code: 42 }] })], 'bad.json', {
      type: 'application/json',
    })
    fireEvent.change(container.querySelector('input[accept=".json"]'), {
      target: { files: [file] },
    })

    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith('The backup file has no diagrams to restore.'),
    )
    expect(codeEditor().value).toBe('graph TD\n  Cur[Current]')
    alertSpy.mockRestore()
  })

  it('keeps the hidden code panel and undo history when switching tabs', async () => {
    saveWorkspace([{ id: 1, name: 'First', code: 'graph TD\n  A[Start] --> B[End]' }])
    render(<MermaidVisualEditor />)
    await screen.findByText('Start')

    fireEvent.change(codeEditor(), {
      target: { value: 'graph TD\n  A[Changed] --> B[End]' },
    })
    fireEvent.click(screen.getByTitle('Add diagram tab'))
    fireEvent.click(await screen.findByRole('button', { name: 'Hide code' }))
    fireEvent.click(screen.getByText('First'))

    expect(await screen.findByRole('button', { name: 'Show code' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Show code' }))
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))

    expect(codeEditor().value).toBe('graph TD\n  A[Start] --> B[End]')
  })

  it('reports copy results instead of failing silently', async () => {
    saveWorkspace([{ id: 1, name: 'T', code: 'graph TD\n  A[Start] --> B[End]' }])
    const writeText = vi.fn().mockResolvedValueOnce().mockRejectedValueOnce(new Error('denied'))
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<MermaidVisualEditor />)
    await screen.findByText('Start')
    const exportSelect = screen.getByRole('combobox', { name: 'Export diagram' })

    fireEvent.change(exportSelect, { target: { value: 'copy' } })
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Mermaid code copied.'))

    fireEvent.change(exportSelect, { target: { value: 'copy' } })
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('Could not copy to the clipboard.'),
    )
  })

  it('exports the whole sequence diagram surface and reports export failures', async () => {
    saveWorkspace([
      {
        id: 1,
        name: 'Seq',
        code: 'sequenceDiagram\n  participant A as Alice\n  participant B as Bob\n  A->>B: Hello',
      },
    ])
    render(<MermaidVisualEditor />)
    const surface = await screen.findByTestId('sequence-diagram-surface')
    const exportSelect = screen.getByRole('combobox', { name: 'Export diagram' })
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    toPng.mockClear()

    fireEvent.change(exportSelect, { target: { value: 'png' } })
    await waitFor(() => expect(toPng).toHaveBeenCalledTimes(1))
    const [element, options] = toPng.mock.calls[0]
    expect(element).toBe(surface)
    expect(element.contains(screen.getByTestId('sequence-minimap'))).toBe(false)
    expect(options.style.transform).toBe('none')
    expect(options.width).toBeGreaterThan(0)

    toPng.mockRejectedValueOnce(new Error('canvas tainted'))
    fireEvent.change(exportSelect, { target: { value: 'png' } })
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('Could not export the PNG image.'),
    )
    clickSpy.mockRestore()
  })

  it('tells the user when a canvas edit cannot be written back to the code', async () => {
    const code = 'graph TD\n  A --> B; B --> C'
    saveWorkspace([{ id: 1, name: 'T', code }])
    render(<MermaidVisualEditor />)

    fireEvent.click(await screen.findByText('B'))
    fireEvent.keyDown(document.body, { key: 'Delete' })

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe(
        'This Mermaid syntax cannot be changed from the canvas. Edit the code instead.',
      ),
    )
    expect(codeEditor().value).toBe(code)
    // 캔버스에서 이미 사라진 노드를 코드 기준으로 다시 그린다.
    expect(await screen.findByText('B')).toBeTruthy()
  })
})
