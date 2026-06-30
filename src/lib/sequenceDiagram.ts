export interface SequenceParticipant {
  id: string
  label: string
  kind: 'participant' | 'actor'
  lineIndex: number | null
}

export interface SequenceMessage {
  id: string
  from: string
  to: string
  arrow: string
  label: string
  lineIndex: number
}

export interface SequenceFragment {
  kind: string
  label: string
  startLineIndex: number
  endLineIndex: number | null
  startEventIndex: number
  endEventIndex: number
  depth: number
}

export interface SequenceNote {
  placement: 'left' | 'right' | 'over'
  participants: string[]
  text: string
  lineIndex: number
}

export interface SequenceActivation {
  participant: string
  startLineIndex: number
  endLineIndex: number | null
  startEventIndex: number
  endEventIndex: number
}

export type SequenceEvent =
  | { type: 'message'; message: SequenceMessage; lineIndex: number }
  | {
      type: 'fragment-start'
      kind: string
      label: string
      lineIndex: number
      depth: number
    }
  | { type: 'fragment-end'; lineIndex: number; depth: number }
  | { type: 'fragment-else'; label: string; lineIndex: number; depth: number }
  | { type: 'note'; note: SequenceNote; lineIndex: number }
  | { type: 'activate'; participant: string; lineIndex: number }
  | { type: 'deactivate'; participant: string; lineIndex: number }

export interface SequenceEditorModel {
  participants: SequenceParticipant[]
  messages: SequenceMessage[]
  events: SequenceEvent[]
  fragments: SequenceFragment[]
  notes: SequenceNote[]
  activations: SequenceActivation[]
}

const PARTICIPANT_ID_RE = String.raw`[^\s:]+?`
const PARTICIPANT_RE =
  new RegExp(String.raw`^(\s*)(participant|actor)\s+(${PARTICIPANT_ID_RE})(?:\s+as\s+(.+))?\s*$`, 'i')
const MESSAGE_RE =
  new RegExp(String.raw`^(\s*)(${PARTICIPANT_ID_RE})\s*([-.=xo]*[-=]+(?:>>?|[)x])[+-]?)\s*(${PARTICIPANT_ID_RE})\s*:\s*(.*)$`)
const FRAGMENT_START_RE = /^\s*(loop|alt|opt|par|critical|break|rect)\b\s*(.*)$/i
const FRAGMENT_ELSE_RE = /^\s*else\b\s*(.*)$/i
const FRAGMENT_END_RE = /^\s*end\s*$/i
const NOTE_RE = /^\s*Note\s+(left of|right of|over)\s+([^:]+):\s*(.*)$/i
const ACTIVATE_RE = new RegExp(String.raw`^\s*activate\s+(${PARTICIPANT_ID_RE})\s*$`, 'i')
const DEACTIVATE_RE = new RegExp(String.raw`^\s*deactivate\s+(${PARTICIPANT_ID_RE})\s*$`, 'i')

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function splitLines(code: string): string[] {
  return code.split(/\r?\n/)
}

function findHeaderIndex(lines: string[]): number {
  const index = lines.findIndex((line) => /^\s*sequenceDiagram\b/i.test(line))
  return index >= 0 ? index : 0
}

function participantLine(participant: SequenceParticipant): string {
  return `  ${participant.kind} ${participant.id} as ${participant.label || participant.id}`
}

function addParticipant(
  participants: SequenceParticipant[],
  byId: Map<string, SequenceParticipant>,
  id: string,
  partial: Partial<SequenceParticipant> = {},
) {
  if (byId.has(id)) return
  const participant: SequenceParticipant = {
    id,
    label: partial.label ?? id,
    kind: partial.kind ?? 'participant',
    lineIndex: partial.lineIndex ?? null,
  }
  participants.push(participant)
  byId.set(id, participant)
}

function findParticipantInsertIndex(lines: string[]): number {
  const headerIndex = findHeaderIndex(lines)
  let insertIndex = headerIndex + 1
  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    if (PARTICIPANT_RE.test(lines[index])) {
      insertIndex = index + 1
      continue
    }
    if (/^\s*$/.test(lines[index]) || /^\s*%%/.test(lines[index])) {
      continue
    }
    break
  }
  return insertIndex
}

function nextParticipantId(participants: SequenceParticipant[]): string {
  const used = new Set(participants.map((participant) => participant.id))
  let index = 1
  while (used.has(`P${index}`)) index += 1
  return `P${index}`
}

export function parseSequenceEditorModel(code: string): SequenceEditorModel {
  const lines = splitLines(code)
  const participants: SequenceParticipant[] = []
  const byId = new Map<string, SequenceParticipant>()
  const messages: SequenceMessage[] = []
  const events: SequenceEvent[] = []
  const fragments: SequenceFragment[] = []
  const notes: SequenceNote[] = []
  const activations: SequenceActivation[] = []
  const fragmentStack: SequenceFragment[] = []
  const activationStack = new Map<string, SequenceActivation[]>()

  lines.forEach((line, lineIndex) => {
    const participantMatch = line.match(PARTICIPANT_RE)
    if (participantMatch) {
      const kind = participantMatch[2].toLowerCase() === 'actor' ? 'actor' : 'participant'
      const id = participantMatch[3]
      const label = participantMatch[4]?.trim() || id
      addParticipant(participants, byId, id, { label, kind, lineIndex })
      return
    }

    const activateMatch = line.match(ACTIVATE_RE)
    if (activateMatch) {
      const participant = activateMatch[1]
      addParticipant(participants, byId, participant)
      const eventIndex = events.length
      const activation: SequenceActivation = {
        participant,
        startLineIndex: lineIndex,
        endLineIndex: null,
        startEventIndex: eventIndex,
        endEventIndex: eventIndex,
      }
      activations.push(activation)
      const stack = activationStack.get(participant) ?? []
      stack.push(activation)
      activationStack.set(participant, stack)
      events.push({ type: 'activate', participant, lineIndex })
      return
    }

    const deactivateMatch = line.match(DEACTIVATE_RE)
    if (deactivateMatch) {
      const participant = deactivateMatch[1]
      addParticipant(participants, byId, participant)
      const eventIndex = events.length
      const stack = activationStack.get(participant) ?? []
      const activation = stack.pop()
      if (activation) {
        activation.endLineIndex = lineIndex
        activation.endEventIndex = eventIndex
      }
      events.push({ type: 'deactivate', participant, lineIndex })
      return
    }

    const fragmentStartMatch = line.match(FRAGMENT_START_RE)
    if (fragmentStartMatch) {
      const eventIndex = events.length
      const fragment: SequenceFragment = {
        kind: fragmentStartMatch[1].toLowerCase(),
        label: fragmentStartMatch[2].trim(),
        startLineIndex: lineIndex,
        endLineIndex: null,
        startEventIndex: eventIndex,
        endEventIndex: eventIndex,
        depth: fragmentStack.length,
      }
      fragments.push(fragment)
      fragmentStack.push(fragment)
      events.push({
        type: 'fragment-start',
        kind: fragment.kind,
        label: fragment.label,
        lineIndex,
        depth: fragment.depth,
      })
      return
    }

    const fragmentElseMatch = line.match(FRAGMENT_ELSE_RE)
    if (fragmentElseMatch) {
      events.push({
        type: 'fragment-else',
        label: fragmentElseMatch[1].trim(),
        lineIndex,
        depth: Math.max(0, fragmentStack.length - 1),
      })
      return
    }

    if (FRAGMENT_END_RE.test(line)) {
      const eventIndex = events.length
      const fragment = fragmentStack.pop()
      if (fragment) {
        fragment.endLineIndex = lineIndex
        fragment.endEventIndex = eventIndex
      }
      events.push({
        type: 'fragment-end',
        lineIndex,
        depth: fragment?.depth ?? Math.max(0, fragmentStack.length),
      })
      return
    }

    const noteMatch = line.match(NOTE_RE)
    if (noteMatch) {
      const placementText = noteMatch[1].toLowerCase()
      const placement = placementText.startsWith('left')
        ? 'left'
        : placementText.startsWith('right')
          ? 'right'
          : 'over'
      const noteParticipants = noteMatch[2]
        .split(',')
        .map((participant) => participant.trim())
        .filter(Boolean)
      noteParticipants.forEach((participant) => addParticipant(participants, byId, participant))
      const note: SequenceNote = {
        placement,
        participants: noteParticipants,
        text: noteMatch[3].trim(),
        lineIndex,
      }
      notes.push(note)
      events.push({ type: 'note', note, lineIndex })
      return
    }

    const messageMatch = line.match(MESSAGE_RE)
    if (!messageMatch) return

    const from = messageMatch[2]
    const arrow = messageMatch[3]
    const to = messageMatch[4]
    const label = messageMatch[5].trim()
    addParticipant(participants, byId, from)
    addParticipant(participants, byId, to)
    const message = {
      id: `sequence-message-${lineIndex}`,
      from,
      to,
      arrow,
      label,
      lineIndex,
    }
    messages.push(message)
    events.push({ type: 'message', message, lineIndex })
  })

  const lastEventIndex = Math.max(0, events.length - 1)
  fragmentStack.forEach((fragment) => {
    fragment.endEventIndex = lastEventIndex
  })
  activations.forEach((activation) => {
    if (activation.endLineIndex === null) activation.endEventIndex = lastEventIndex
  })

  return { participants, messages, events, fragments, notes, activations }
}

export function renameSequenceParticipant(
  code: string,
  id: string,
  label: string,
): string {
  const lines = splitLines(code)
  const model = parseSequenceEditorModel(code)
  const participant = model.participants.find((current) => current.id === id)
  if (!participant) return code

  const nextParticipant = { ...participant, label: label.trim() || id }
  if (participant.lineIndex !== null) {
    const indent = lines[participant.lineIndex].match(/^(\s*)/)?.[1] ?? '  '
    lines[participant.lineIndex] =
      `${indent}${participant.kind} ${participant.id} as ${nextParticipant.label}`
    return lines.join('\n')
  }

  lines.splice(findParticipantInsertIndex(lines), 0, participantLine(nextParticipant))
  return lines.join('\n')
}

export function updateSequenceMessageLabel(
  code: string,
  lineIndex: number,
  label: string,
): string {
  const lines = splitLines(code)
  const match = lines[lineIndex]?.match(MESSAGE_RE)
  if (!match) return code

  lines[lineIndex] = `${match[1]}${match[2]}${match[3]}${match[4]}: ${label.trim()}`
  return lines.join('\n')
}

export function addSequenceParticipant(code: string): string {
  const lines = splitLines(code)
  const model = parseSequenceEditorModel(code)
  const id = nextParticipantId(model.participants)
  const label = `Participant ${id.replace(/^P/, '')}`

  lines.splice(findParticipantInsertIndex(lines), 0, `  participant ${id} as ${label}`)
  return lines.join('\n')
}

export function addSequenceMessage(
  code: string,
  fromId?: string,
  toId?: string,
): string {
  const lines = splitLines(code)
  const model = parseSequenceEditorModel(code)
  if (model.participants.length < 2) return code

  const from = fromId ?? model.participants[0].id
  const to =
    toId && toId !== from
      ? toId
      : (model.participants.find((participant) => participant.id !== from)?.id ?? from)

  lines.push(`  ${from}->>${to}: New message`)
  return lines.join('\n')
}

export function moveSequenceParticipant(
  code: string,
  id: string,
  targetIndex: number,
): string {
  const lines = splitLines(code)
  const model = parseSequenceEditorModel(code)
  const currentIndex = model.participants.findIndex((participant) => participant.id === id)
  if (currentIndex < 0) return code

  const participants = [...model.participants]
  const [participant] = participants.splice(currentIndex, 1)
  participants.splice(clamp(targetIndex, 0, participants.length), 0, participant)

  const withoutDeclarations = lines.filter((line) => !PARTICIPANT_RE.test(line))
  const insertIndex = findHeaderIndex(withoutDeclarations) + 1
  withoutDeclarations.splice(
    insertIndex,
    0,
    ...participants.map((current) => participantLine(current)),
  )

  return withoutDeclarations.join('\n')
}
