import { describe, expect, it } from 'vitest'
import {
  addSequenceMessage,
  addSequenceParticipant,
  moveSequenceParticipant,
  parseSequenceEditorModel,
  renameSequenceParticipant,
  updateSequenceMessageLabel,
} from './sequenceDiagram'

describe('sequenceDiagram editor helpers', () => {
  const code = [
    'sequenceDiagram',
    '  participant A as Alice',
    '  participant B as Bob',
    '  A->>B: Hello',
    '  B-->>A: Hi',
  ].join('\n')

  it('parses participants and actor-to-actor messages for editing', () => {
    const model = parseSequenceEditorModel(code)

    expect(model.participants.map((participant) => participant.label)).toEqual([
      'Alice',
      'Bob',
    ])
    expect(model.messages.map((message) => message.label)).toEqual(['Hello', 'Hi'])
    expect(model.messages[0]).toMatchObject({
      from: 'A',
      to: 'B',
      arrow: '->>',
      lineIndex: 3,
    })
  })

  it('renames a participant by updating its declaration label', () => {
    expect(renameSequenceParticipant(code, 'A', 'Alice Prime')).toContain(
      '  participant A as Alice Prime',
    )
  })

  it('updates a sequence message label on its original line', () => {
    const nextCode = updateSequenceMessageLabel(code, 3, 'Updated hello')

    expect(nextCode).toContain('  A->>B: Updated hello')
    expect(nextCode).not.toContain('  A->>B: Hello')
  })

  it('adds a new unique participant after existing participant declarations', () => {
    const nextCode = addSequenceParticipant(code)

    expect(nextCode.split('\n').slice(0, 4)).toEqual([
      'sequenceDiagram',
      '  participant A as Alice',
      '  participant B as Bob',
      '  participant P1 as Participant 1',
    ])
  })

  it('adds a new message between selected participants', () => {
    const nextCode = addSequenceMessage(code, 'A', 'B')

    expect(nextCode.endsWith('  A->>B: New message')).toBe(true)
  })

  it('moves participants by rewriting declarations while preserving messages', () => {
    const nextCode = moveSequenceParticipant(
      ['sequenceDiagram', '  A->>B: Hello'].join('\n'),
      'B',
      0,
    )

    expect(nextCode.split('\n')).toEqual([
      'sequenceDiagram',
      '  participant B as B',
      '  participant A as A',
      '  A->>B: Hello',
    ])
  })

  it('parses sequence-only visual events for the editor renderer', () => {
    const model = parseSequenceEditorModel(
      [
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
      ].join('\n'),
    )

    expect(model.events.map((event) => event.type)).toEqual([
      'activate',
      'message',
      'fragment-start',
      'message',
      'fragment-end',
      'note',
      'deactivate',
    ])
    expect(model.messages[0]).toMatchObject({ from: 'A', to: 'A', label: 'Self check' })
    expect(model.fragments[0]).toMatchObject({
      kind: 'loop',
      label: 'Retry',
      startLineIndex: 5,
      endLineIndex: 7,
    })
    expect(model.notes[0]).toMatchObject({
      placement: 'over',
      participants: ['A', 'B'],
      text: 'shared state',
    })
    expect(model.activations[0]).toMatchObject({
      participant: 'A',
      startLineIndex: 3,
      endLineIndex: 9,
    })
  })
})
