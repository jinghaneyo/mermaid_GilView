import {
  escapeRegExp,
  formatMermaidLabel,
  stripQuotedText,
} from './updateNodeLabelInMermaid'

export interface EdgeReference {
  source: string
  target: string
  label?: string
}

export interface MermaidSelection {
  nodes: string[]
  edges: EdgeReference[]
}

export function addEdgeToMermaid(code: string, edge: EdgeReference): string {
  return `${code}\n  ${formatEdge(edge)}`
}

// 연결선 라벨만 바꾼다. 같은 줄의 노드 선언(`A[시작]`)과 화살표 종류는 그대로 둔다.
export function updateEdgeLabelInMermaid(
  code: string,
  edge: EdgeReference,
): string {
  return code
    .split(/\r?\n/)
    .map((line) => {
      const parsed = parseEdgeLine(line)
      if (!parsed) return line

      let next = line
      // 뒤쪽 연결부터 바꿔야 앞쪽 연결의 글자 위치가 어긋나지 않는다.
      for (let k = parsed.links.length - 1; k >= 0; k -= 1) {
        if (!linkConnects(parsed, k, edge.source, edge.target)) continue
        const link = parsed.links[k]
        next = `${next.slice(0, link.start)}${formatLink(link.arrow, edge.label)}${next.slice(link.end)}`
      }
      return next
    })
    .join('\n')
}

export function removeSelectionFromMermaid(
  code: string,
  selection: MermaidSelection,
): string {
  const deletedNodes = new Set(selection.nodes)
  const keepEdge = (source: NodeToken, target: NodeToken) =>
    !deletedNodes.has(source.id) &&
    !deletedNodes.has(target.id) &&
    !selection.edges.some(
      (edge) => edge.source === source.id && edge.target === target.id,
    )

  const lines = code.split(/\r?\n/)
  const output: string[][] = []
  const orphans: Array<{ lineIndex: number; indent: string; node: NodeToken }> = []
  let blocked = false

  lines.forEach((line, lineIndex) => {
    const parsed = parseEdgeLine(line)
    if (!parsed) {
      const statements = removeDeletedNodeStatement(line, deletedNodes)
      if (statements[0] === line && isUnparsedLineUsingSelection(line, deletedNodes, selection.edges)) {
        blocked = true
      }
      output.push(statements)
      return
    }

    const rebuilt = rebuildEdgeLine(parsed, keepEdge)
    if (!rebuilt) {
      output.push([line])
      return
    }

    output.push(rebuilt.statements.map((statement) => `${parsed.indent}${statement}`))
    for (const node of parsed.groups.flat()) {
      if (!deletedNodes.has(node.id) && !rebuilt.keptIds.has(node.id)) {
        orphans.push({ lineIndex, indent: parsed.indent, node })
      }
    }
  })

  // 해석하지 못한 줄이 지울 노드·연결을 아직 쓰고 있으면 일부만 지운 코드가 되어, 다시 그릴 때
  // 노드가 라벨을 잃은 채 되살아난다. 이때는 아무것도 바꾸지 않는다(호출 쪽이 안내를 띄운다).
  if (blocked) return code

  // 지운 연결에만 걸려 있던 노드는 지운 대상이 아니므로 원래 줄 위치에 남긴다.
  // - 모양·라벨·클래스가 붙은 원문(`A[라벨]`, `A:::hot`)은 항상 남긴다(같은 블록의 다른 고아
  //   노드와 원문이 같으면 한 번만).
  // - 맨 ID만 있던 노드는 같은 subgraph 블록 안의 다른 문장에 없을 때만 남긴다.
  //   다른 블록에만 남으면 mermaid가 그 노드를 그 블록 소속으로 옮기기 때문이다.
  const blockOf = subgraphBlockOfLines(lines)
  const prefixes: string[][] = lines.map(() => [])
  const placed = new Set<string>()
  for (const orphan of orphans) {
    const { id, text } = orphan.node
    const block = blockOf[orphan.lineIndex]
    if (placed.has(`${block}:${text}`)) continue
    if (text === id) {
      const mentionedInScope = output.some(
        (statements, lineIndex) =>
          (block < 0 || blockOf[lineIndex] === block) &&
          statements.some((statement) => mentionsNode(statement, id)),
      )
      if (placed.has(`${block}:${id}`) || mentionedInScope) continue
    }
    prefixes[orphan.lineIndex].push(`${orphan.indent}${text}`)
    placed.add(`${block}:${text}`).add(`${block}:${id}`)
  }

  return output
    .flatMap((statements, lineIndex) => [...prefixes[lineIndex], ...statements])
    .join('\n')
}

// 각 줄이 속한 가장 안쪽 subgraph 블록(그 subgraph 줄 번호). 블록 밖이면 -1.
function subgraphBlockOfLines(lines: string[]): number[] {
  const stack: number[] = []
  return lines.map((line, lineIndex) => {
    const block = stack[stack.length - 1] ?? -1
    if (/^\s*subgraph\b/.test(line)) stack.push(lineIndex)
    else if (/^\s*end\s*;?\s*$/.test(line)) stack.pop()
    return block
  })
}

function formatEdge(edge: EdgeReference): string {
  return `${edge.source} ${formatLink('-->', edge.label)} ${edge.target}`
}

function formatLink(arrow: string, label?: string): string {
  const text = label?.trim()
  return text ? `${arrow}|${formatMermaidLabel(text)}|` : arrow
}

/* ------------------------------------------------------------------ *
 * 연결선 한 줄 해석
 * `A[시작] --> B & C -.->|라벨| D` 는 노드 묶음 3개([A], [B, C], [D])와
 * 연결 2개로 나뉜다. 지원하지 않는 문법이면 null을 돌려주고, 호출하는 쪽은
 * 그 줄을 건드리지 않는다.
 * ------------------------------------------------------------------ */

interface NodeToken {
  id: string
  text: string // 모양·라벨·클래스까지 포함한 원문 (예: `A[시작]`, `A:::hot`)
}

interface LinkToken {
  text: string // 화살표와 라벨 원문 (예: `-->|예|`, `-- 예 -->`)
  arrow: string // 라벨을 뺀 화살표 (예: `-->`, `-.->`)
  start: number
  end: number
}

interface EdgeLine {
  indent: string
  groups: NodeToken[][]
  links: LinkToken[]
}

const NODE_ID_RE = /^[A-Za-z0-9_]+/
const CLASS_SUFFIX_RE = /^:::[A-Za-z0-9_-]+/
const PLAIN_LINK_RE = /^(?:[xo<]?--+[-xo>]|[xo<]?==+[=xo>]|[xo<]?-?\.+-[xo>]?|~~~+)/
const PIPE_LABEL_RE = /^\s*\|(?:"(?:[^"\\]|\\.)*"|[^|"])*\|/
// `-- 라벨 -->`, `== 라벨 ==>`, `-. 라벨 .->`. 닫는 화살표는 여는 종류와 같아야 한다
// (mermaid는 `-- v1.-beta -->` 안의 `.-`를 글자로 본다).
const TEXT_LINK_RES = [
  /^([xo<]?)(--)\s*([^|]+?)\s*(--+[-xo>])/,
  /^([xo<]?)(==)\s*([^|]+?)\s*(==+[=xo>])/,
  /^([xo<]?)(-\.)\s*([^|]+?)\s*(\.+-[xo>]?)/,
]
// 연결 기호와 문장 구분 기호. 해석하지 못한 줄에 있으면 여러 노드·연결이 섞여 있을 수 있다.
const LINK_SYMBOL_RE = /--|==|-\.|~~~|;|&/

function parseEdgeLine(line: string): EdgeLine | null {
  const parsed = parseStatement(line)
  return parsed && parsed.links.length > 0 ? parsed : null
}

// 노드 문장 한 줄 전체를 해석한다. 연결이 없는 `A[라벨]`, `A & B` 도 받는다.
// subgraph·end·style 같은 키워드 줄과 해석할 수 없는 줄은 null.
function parseStatement(line: string): EdgeLine | null {
  if (NON_NODE_LINE_RE.test(line)) return null
  const indent = line.match(/^\s*/)?.[0] ?? ''
  const groups: NodeToken[][] = []
  const links: LinkToken[] = []
  let pos = indent.length

  for (;;) {
    const group: NodeToken[] = []
    for (;;) {
      const node = readNode(line, skipSpaces(line, pos))
      if (!node) return null
      group.push(node.token)
      pos = skipSpaces(line, node.end)
      if (line[pos] !== '&') break
      pos += 1
    }
    groups.push(group)

    const link = readLink(line, pos)
    if (!link) break
    links.push(link)
    pos = link.end
  }

  const rest = line.slice(pos).trim()
  if (rest !== '' && rest !== ';') return null
  return { indent, groups, links }
}

function readNode(line: string, pos: number): { token: NodeToken; end: number } | null {
  const id = line.slice(pos).match(NODE_ID_RE)?.[0]
  if (!id) return null

  let end = pos + id.length
  const shapeEnd = findShapeEnd(line, end)
  if (shapeEnd !== null) end = shapeEnd
  end += line.slice(end).match(CLASS_SUFFIX_RE)?.[0].length ?? 0

  return { token: { id, text: line.slice(pos, end) }, end }
}

// `[...]`, `(...)`, `{...}`, `>...]` 모양 선언의 끝 위치. 따옴표 안의 괄호는 무시한다.
function findShapeEnd(line: string, pos: number): number | null {
  if (!'[({>'.includes(line[pos] ?? '\n')) return null

  let depth = 0
  for (let i = pos; i < line.length; i += 1) {
    const ch = line[i]
    if (ch === '"') {
      i = findClosingQuote(line, i)
      if (i < 0) return null
    } else if ('[({'.includes(ch) || (i === pos && ch === '>')) {
      depth += 1
    } else if (')]}'.includes(ch)) {
      depth -= 1
      if (depth === 0) return i + 1
    }
  }
  return null
}

function findClosingQuote(line: string, start: number): number {
  for (let i = start + 1; i < line.length; i += 1) {
    if (line[i] === '\\') i += 1
    else if (line[i] === '"') return i
  }
  return -1
}

function readLink(line: string, pos: number): LinkToken | null {
  const rest = line.slice(pos)
  let arrow: string
  let length: number

  const plain = rest.match(PLAIN_LINK_RE)
  if (plain) {
    arrow = plain[0]
    length = arrow.length + (rest.slice(arrow.length).match(PIPE_LABEL_RE)?.[0].length ?? 0)
  } else {
    const text = TEXT_LINK_RES.map((pattern) => rest.match(pattern)).find(Boolean)
    if (!text) return null
    const [whole, prefix, open, , close] = text
    arrow = prefix + (open === '-.' ? `-${close}` : close)
    length = whole.length
  }

  return { text: rest.slice(0, length), arrow, start: pos, end: pos + length }
}

function skipSpaces(line: string, pos: number): number {
  let next = pos
  while (next < line.length && /\s/.test(line[next])) next += 1
  return next
}

function linkConnects(parsed: EdgeLine, k: number, source: string, target: string): boolean {
  return (
    parsed.groups[k].some((node) => node.id === source) &&
    parsed.groups[k + 1].some((node) => node.id === target)
  )
}

// 남길 연결만으로 줄을 다시 쓴다. 바뀔 것이 없으면 null.
function rebuildEdgeLine(
  parsed: EdgeLine,
  keepEdge: (source: NodeToken, target: NodeToken) => boolean,
): { statements: string[]; keptIds: Set<string> } | null {
  const pairsByLink = parsed.links.map((_, k) =>
    parsed.groups[k].flatMap((source) =>
      parsed.groups[k + 1].map((target) => [source, target] as const),
    ),
  )
  if (pairsByLink.every((pairs) => pairs.every(([s, t]) => keepEdge(s, t)))) return null

  const statements: string[] = []
  const keptIds = new Set<string>()
  parsed.links.forEach((link, k) => {
    const pairs = pairsByLink[k]
    const kept = pairs.filter(([s, t]) => keepEdge(s, t))
    for (const [s, t] of kept) keptIds.add(s.id).add(t.id)

    if (kept.length === 0) return
    if (kept.length === pairs.length) {
      statements.push(`${groupText(parsed.groups[k])} ${link.text} ${groupText(parsed.groups[k + 1])}`)
    } else {
      for (const [s, t] of kept) statements.push(`${s.text} ${link.text} ${t.text}`)
    }
  })

  return { statements, keptIds }
}

function groupText(group: NodeToken[]): string {
  return group.map((node) => node.text).join(' & ')
}

// 노드 문장이 아닌 줄: 주석, frontmatter 제목, 접근성 제목·설명, 키워드 줄.
// mermaid 키워드는 대소문자를 구분한다(`End`는 노드 ID).
const NON_NODE_LINE_RE =
  /^\s*(?:%%|(?:title|accTitle)\s*:|(?:style|classDef|class|click|linkStyle|subgraph|end|direction|graph|flowchart|accDescr)\b)/

// 그 줄이 id를 노드로 쓰는지. 라벨 글자(`C[Step A]`의 A)는 세지 않는다.
// 해석할 수 없는 줄은 세지 않으므로, 애매하면 노드를 단독 선언으로 남기는 쪽이 된다.
function mentionsNode(line: string, id: string): boolean {
  return parseStatement(line)?.groups.some((group) => group.some((node) => node.id === id)) ?? false
}

// 연결이 없는 줄에서 지운 노드를 뺀다. 키워드 줄(subgraph·style 등)은 그대로 둔다.
function removeDeletedNodeStatement(line: string, deletedNodes: Set<string>): string[] {
  if (NON_NODE_LINE_RE.test(line)) return [line]

  const statement = parseStatement(line)
  if (!statement) {
    // 해석할 수 없는 줄은 예전처럼 `ID[` 형태의 선언만 찾아 지운다.
    const declaresDeleted = [...deletedNodes].some((id) => isNodeDeclarationLine(line, id))
    return declaresDeleted ? [] : [line]
  }

  const nodes = statement.groups.flat()
  if (!nodes.some((node) => deletedNodes.has(node.id))) return [line]
  const kept = nodes.filter((node) => !deletedNodes.has(node.id))
  return kept.length > 0 ? [`${statement.indent}${groupText(kept)}`] : []
}

// 라벨 글자(`"A"`, `[A 처리]`, `(A)`, `{A}`, `|A|`)를 비운 줄. 노드 ID와 연결 기호만 남긴다.
function withoutLabels(line: string): string {
  return stripQuotedText(line).replace(/\[[^\]]*\]|\([^)]*\)|\{[^}]*\}|\|[^|]*\|/g, '')
}

// 연결·문장 구분 기호가 있는 해석하지 못한 줄이, 지울 노드나 지울 연결의 두 끝을 노드 ID로 쓰는지.
// `-- A -->`처럼 화살표 안 라벨은 비우지 못해 걸릴 수 있지만, 그때는 지우지 않는 쪽이라 안전하다.
function isUnparsedLineUsingSelection(
  line: string,
  deletedNodes: Set<string>,
  edges: EdgeReference[],
): boolean {
  if (NON_NODE_LINE_RE.test(line) || parseStatement(line)) return false
  const text = withoutLabels(line)
  if (!LINK_SYMBOL_RE.test(text)) return false
  const uses = (id: string) =>
    new RegExp(`(^|[^A-Za-z0-9_])${escapeRegExp(id)}([^A-Za-z0-9_]|$)`).test(text)
  return [...deletedNodes].some(uses) || edges.some((edge) => uses(edge.source) && uses(edge.target))
}

// 해석하지 못한 줄용. 연결·문장 구분 기호가 있는 줄은 다른 노드·연결까지 지울 수 있으므로 건드리지 않는다.
function isNodeDeclarationLine(line: string, id: string): boolean {
  if (LINK_SYMBOL_RE.test(withoutLabels(line))) return false
  const pattern = new RegExp(
    `(^|[^A-Za-z0-9_])${escapeRegExp(id)}\\s*(\\(\\[|\\[\\(|\\(\\(|\\[|\\{|\\()`,
  )
  return pattern.test(stripQuotedText(line))
}
