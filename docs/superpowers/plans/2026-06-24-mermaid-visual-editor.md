# Mermaid 비주얼 에디터 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 왼쪽 Textarea에서 Mermaid 코드를 편집하면 오른쪽 React Flow 캔버스에 다이어그램이 실시간 렌더링되는 좌우 분할 비주얼 에디터를 만든다.

**Architecture:** `App`이 `code` 문자열을 단일 소스로 보유한다. `MermaidEditor`가 편집하고, `useMermaidToFlow(code)` 훅이 디바운스 후 `convertMermaid`(mermaid 공식 파서 → vertices/edges 추출 → dagre 자동 배치)를 호출해 `{nodes, edges, error}`를 만든다. `FlowCanvas`가 결과를 React Flow로 렌더링한다.

**Tech Stack:** Vite, React 18, TypeScript, Tailwind CSS, `@xyflow/react` (React Flow), `mermaid`(공식 파서, 버전 고정), `@dagrejs/dagre`, Vitest + jsdom.

## Global Constraints

- 빌드 도구는 Vite, 언어는 TypeScript (`.tsx`/`.ts`).
- 스타일은 Tailwind CSS 유틸리티 클래스만 사용 (별도 CSS 파일 최소화).
- React Flow 패키지는 `@xyflow/react`를 사용한다 (구 `reactflow` 아님).
- mermaid 버전은 `package.json`에서 정확히 고정(pin)한다. 준-내부 API에 의존하므로 캐럿(`^`) 금지.
- mermaid 파싱 로직은 오직 `src/lib/parseMermaid.ts` 한 파일에만 둔다. 다른 파일에서 mermaid를 직접 import 하지 않는다.
- 우선 flowchart(`graph`/`flowchart` + `TD/TB/LR/RL/BT`)만 지원. 그 외 타입은 에러 메시지로 안내.
- 순수 로직(`parseMermaid`, `layout`, `convertMermaid`)은 Vitest 단위 테스트를 동반한다.

---

### Task 1: 프로젝트 스캐폴딩 (Vite + React + TS + Tailwind + 의존성)

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `index.html`
- Create: `tailwind.config.js`, `postcss.config.js`
- Create: `src/main.tsx`, `src/App.tsx`, `src/index.css`, `src/vite-env.d.ts`

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces: 실행 가능한 빈 Vite+React 앱. `npm run dev`, `npm run build`, `npm test` 스크립트.

- [ ] **Step 1: 의존성 설치 및 스크립트 정의**

`package.json`을 생성한다 (디렉터리가 비어 있으므로 `create` 대신 직접 작성 후 install):

```json
{
  "name": "mermaid-gilview",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@dagrejs/dagre": "1.1.4",
    "@xyflow/react": "12.3.5",
    "mermaid": "11.4.1",
    "react": "18.3.1",
    "react-dom": "18.3.1"
  },
  "devDependencies": {
    "@testing-library/react": "16.0.1",
    "@types/react": "18.3.12",
    "@types/react-dom": "18.3.1",
    "@vitejs/plugin-react": "4.3.4",
    "autoprefixer": "10.4.20",
    "jsdom": "25.0.1",
    "postcss": "8.4.49",
    "tailwindcss": "3.4.15",
    "typescript": "5.6.3",
    "vite": "5.4.11",
    "vitest": "2.1.6"
  }
}
```

그런 다음 설치:

```bash
npm install
```

> 참고: 위 버전은 검증된 조합의 시작점이다. `npm install`이 특정 버전 해석에 실패하면, mermaid는 11.x 최신 패치로만 올리고(여전히 정확 핀 유지), 나머지는 npm이 제안하는 호환 버전으로 맞춘다.

- [ ] **Step 2: Vite / TypeScript 설정 파일 생성**

`vite.config.ts`:

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
  },
})
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["vitest/globals"]
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

`tsconfig.node.json`:

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
```

`src/vite-env.d.ts`:

```ts
/// <reference types="vite/client" />
```

- [ ] **Step 3: Tailwind 설정**

`tailwind.config.js`:

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
}
```

`postcss.config.js`:

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

`src/index.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

html, body, #root {
  height: 100%;
  margin: 0;
}
```

- [ ] **Step 4: HTML 진입점 및 빈 앱**

`index.html`:

```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Mermaid 비주얼 에디터</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/main.tsx`:

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

`src/App.tsx` (임시 placeholder, Task 7에서 교체):

```tsx
export default function App() {
  return <div className="h-full flex items-center justify-center text-slate-500">Mermaid 비주얼 에디터</div>
}
```

- [ ] **Step 5: 빌드 검증**

Run: `npm run build`
Expected: 타입 에러 없이 `dist/` 생성, 성공 종료.

Run: `npm run dev` (수동 확인용, 실행 후 Ctrl+C)
Expected: 로컬 서버 기동, 브라우저에서 "Mermaid 비주얼 에디터" 텍스트 표시.

- [ ] **Step 6: Commit**

```bash
git init
git add -A
git commit -m "chore: scaffold Vite + React + TS + Tailwind project"
```

---

### Task 2: 공유 타입 + dagre 자동 배치 (`layout.ts`)

**Files:**
- Create: `src/lib/types.ts`
- Create: `src/lib/layout.ts`
- Test: `src/lib/layout.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `types.ts`:
    ```ts
    export type Direction = 'TB' | 'BT' | 'LR' | 'RL'
    export interface GraphNode { id: string; label: string }
    export interface GraphEdge { id: string; source: string; target: string; label?: string }
    export interface ParsedGraph { nodes: GraphNode[]; edges: GraphEdge[]; direction: Direction }
    // React Flow 호환 출력
    export interface FlowNode { id: string; data: { label: string }; position: { x: number; y: number } }
    export interface FlowEdge { id: string; source: string; target: string; label?: string }
    export interface FlowGraph { nodes: FlowNode[]; edges: FlowEdge[] }
    export interface ConvertResult { nodes: FlowNode[]; edges: FlowEdge[]; error: string | null }
    ```
  - `layout.ts`: `export function layout(graph: ParsedGraph): FlowGraph`

- [ ] **Step 1: 타입 파일 작성**

`src/lib/types.ts` — 위 Interfaces의 타입 블록 전체를 그대로 작성한다.

- [ ] **Step 2: 실패하는 테스트 작성**

`src/lib/layout.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { layout } from './layout'
import type { ParsedGraph } from './types'

const base: ParsedGraph = {
  direction: 'TB',
  nodes: [
    { id: 'A', label: 'Start' },
    { id: 'B', label: 'End' },
  ],
  edges: [{ id: 'A-B', source: 'A', target: 'B' }],
}

describe('layout', () => {
  it('모든 노드에 좌표를 부여한다', () => {
    const { nodes } = layout(base)
    expect(nodes).toHaveLength(2)
    nodes.forEach((n) => {
      expect(typeof n.position.x).toBe('number')
      expect(typeof n.position.y).toBe('number')
      expect(Number.isFinite(n.position.x)).toBe(true)
      expect(Number.isFinite(n.position.y)).toBe(true)
    })
  })

  it('TB 방향에서 target 노드가 source 아래에 배치된다', () => {
    const { nodes } = layout(base)
    const a = nodes.find((n) => n.id === 'A')!
    const b = nodes.find((n) => n.id === 'B')!
    expect(b.position.y).toBeGreaterThan(a.position.y)
  })

  it('LR 방향에서 target 노드가 source 오른쪽에 배치된다', () => {
    const { nodes } = layout({ ...base, direction: 'LR' })
    const a = nodes.find((n) => n.id === 'A')!
    const b = nodes.find((n) => n.id === 'B')!
    expect(b.position.x).toBeGreaterThan(a.position.x)
  })

  it('엣지를 그대로 전달하며 라벨을 보존한다', () => {
    const { edges } = layout({
      ...base,
      edges: [{ id: 'A-B', source: 'A', target: 'B', label: 'yes' }],
    })
    expect(edges).toEqual([{ id: 'A-B', source: 'A', target: 'B', label: 'yes' }])
  })
})
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `npm test -- layout`
Expected: FAIL — `layout` 모듈/함수 없음.

- [ ] **Step 4: 최소 구현 작성**

`src/lib/layout.ts`:

```ts
import dagre from '@dagrejs/dagre'
import type { ParsedGraph, FlowGraph, FlowNode, FlowEdge } from './types'

const NODE_WIDTH = 160
const NODE_HEIGHT = 44

export function layout(graph: ParsedGraph): FlowGraph {
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: graph.direction, nodesep: 50, ranksep: 60 })
  g.setDefaultEdgeLabel(() => ({}))

  graph.nodes.forEach((n) => {
    g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT })
  })
  graph.edges.forEach((e) => {
    g.setEdge(e.source, e.target)
  })

  dagre.layout(g)

  const nodes: FlowNode[] = graph.nodes.map((n) => {
    const pos = g.node(n.id)
    return {
      id: n.id,
      data: { label: n.label },
      // dagre는 중심 좌표를 주므로 React Flow의 좌상단 좌표로 변환
      position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
    }
  })

  const edges: FlowEdge[] = graph.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    ...(e.label ? { label: e.label } : {}),
  }))

  return { nodes, edges }
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npm test -- layout`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/types.ts src/lib/layout.ts src/lib/layout.test.ts
git commit -m "feat: add shared types and dagre layout"
```

---

### Task 3: Mermaid 파싱 (`parseMermaid.ts`)

**Files:**
- Create: `src/lib/parseMermaid.ts`
- Test: `src/lib/parseMermaid.test.ts`

**Interfaces:**
- Consumes: `types.ts` (`ParsedGraph`, `Direction`)
- Produces: `export async function parseMermaid(code: string): Promise<{ graph: ParsedGraph | null; error: string | null }>`

- [ ] **Step 1: API 스파이크 (위험 완화)**

mermaid의 vertices/edges 추출은 준-내부 API다. 구현 전 실제 표면을 확인한다. 임시 스크립트 `scripts/spike-mermaid.mts`를 만들어 실행:

```ts
import mermaid from 'mermaid'

mermaid.initialize({ startOnLoad: false })
const code = 'graph TD\n  A[Start] --> B{Choice}\n  B -->|yes| C[End]'
await mermaid.parse(code)
// 후보 1: mermaidAPI.getDiagramFromText
const api: any = (mermaid as any).mermaidAPI ?? mermaid
const diagram = await api.getDiagramFromText(code)
console.log('diagram keys:', Object.keys(diagram))
console.log('db keys:', Object.keys(diagram.db))
console.log('vertices:', JSON.stringify(diagram.db.getVertices(), null, 2))
console.log('edges:', JSON.stringify(diagram.db.getEdges(), null, 2))
console.log('direction:', diagram.db.getDirection?.())
```

Run: `npx tsx scripts/spike-mermaid.mts` (필요 시 `npm i -D tsx`)
Expected: vertices(객체, id별 `{ id, text, ... }`)와 edges(배열, `{ start, end, text, ... }`), direction 문자열 출력.

이 출력에서 **실제 필드명**을 확인하고, 만약 `getDiagramFromText`가 없거나 필드명이 다르면 Step 4 구현의 추출 부분을 출력에 맞게 조정한다. 확인 후 `scripts/spike-mermaid.mts`는 삭제한다.

- [ ] **Step 2: 실패하는 테스트 작성**

`src/lib/parseMermaid.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseMermaid } from './parseMermaid'

describe('parseMermaid', () => {
  it('flowchart TD의 노드와 엣지를 추출한다', async () => {
    const { graph, error } = await parseMermaid('graph TD\n  A[Start] --> B[End]')
    expect(error).toBeNull()
    expect(graph).not.toBeNull()
    expect(graph!.direction).toBe('TB')
    expect(graph!.nodes.map((n) => n.id).sort()).toEqual(['A', 'B'])
    const a = graph!.nodes.find((n) => n.id === 'A')!
    expect(a.label).toBe('Start')
    expect(graph!.edges).toHaveLength(1)
    expect(graph!.edges[0]).toMatchObject({ source: 'A', target: 'B' })
  })

  it('LR 방향을 인식한다', async () => {
    const { graph } = await parseMermaid('graph LR\n  A --> B')
    expect(graph!.direction).toBe('LR')
  })

  it('엣지 라벨을 추출한다', async () => {
    const { graph } = await parseMermaid('graph TD\n  A -->|yes| B')
    expect(graph!.edges[0].label).toBe('yes')
  })

  it('빈 입력은 빈 그래프를 반환하고 에러가 없다', async () => {
    const { graph, error } = await parseMermaid('   ')
    expect(error).toBeNull()
    expect(graph).toEqual({ nodes: [], edges: [], direction: 'TB' })
  })

  it('잘못된 문법은 에러 메시지를 반환한다', async () => {
    const { graph, error } = await parseMermaid('graph TD\n  A --> ')
    expect(graph).toBeNull()
    expect(error).toBeTruthy()
  })

  it('지원하지 않는 다이어그램 타입은 안내 에러를 반환한다', async () => {
    const { graph, error } = await parseMermaid('sequenceDiagram\n  Alice->>Bob: Hi')
    expect(graph).toBeNull()
    expect(error).toContain('flowchart')
  })
})
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `npm test -- parseMermaid`
Expected: FAIL — `parseMermaid` 없음.

- [ ] **Step 4: 최소 구현 작성**

`src/lib/parseMermaid.ts` (Step 1 스파이크 결과에 맞춰 필드 접근부만 조정):

```ts
import mermaid from 'mermaid'
import type { ParsedGraph, Direction, GraphNode, GraphEdge } from './types'

let initialized = false
function ensureInit() {
  if (!initialized) {
    mermaid.initialize({ startOnLoad: false, suppressErrorRendering: true })
    initialized = true
  }
}

const EMPTY: ParsedGraph = { nodes: [], edges: [], direction: 'TB' }

function normalizeDirection(raw: string | undefined): Direction {
  switch (raw) {
    case 'LR':
      return 'LR'
    case 'RL':
      return 'RL'
    case 'BT':
      return 'BT'
    default:
      return 'TB' // 'TD'와 'TB' 모두 위→아래
  }
}

export async function parseMermaid(
  code: string,
): Promise<{ graph: ParsedGraph | null; error: string | null }> {
  const trimmed = code.trim()
  if (trimmed === '') {
    return { graph: EMPTY, error: null }
  }

  ensureInit()

  try {
    // 문법 검증 + 다이어그램 타입 확인
    const parsed = await mermaid.parse(trimmed)
    const type = parsed && (parsed as { diagramType?: string }).diagramType
    if (type && type !== 'flowchart-v2' && type !== 'flowchart') {
      return { graph: null, error: `현재 flowchart(graph TD/LR)만 지원합니다. (감지된 타입: ${type})` }
    }

    const api = (mermaid as unknown as { mermaidAPI?: { getDiagramFromText: (t: string) => Promise<DiagramLike> } }).mermaidAPI
    const getDiagram = api?.getDiagramFromText
      ?? (mermaid as unknown as { getDiagramFromText: (t: string) => Promise<DiagramLike> }).getDiagramFromText
    const diagram = await getDiagram(trimmed)
    const db = diagram.db

    const vertices = db.getVertices() // { [id]: { id, text?, ... } }
    const rawEdges = db.getEdges() // [{ start, end, text?, ... }]

    const nodes: GraphNode[] = Object.values(vertices).map((v) => ({
      id: v.id,
      label: (v.text ?? v.id) || v.id,
    }))

    const edges: GraphEdge[] = rawEdges.map((e, i) => ({
      id: `${e.start}-${e.end}-${i}`,
      source: e.start,
      target: e.end,
      ...(e.text ? { label: e.text } : {}),
    }))

    const direction = normalizeDirection(db.getDirection?.())

    return { graph: { nodes, edges, direction }, error: null }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { graph: null, error: message }
  }
}

// 스파이크에서 확인한 mermaid 내부 형태 (필요 시 조정)
interface DiagramLike {
  db: {
    getVertices: () => Record<string, { id: string; text?: string }>
    getEdges: () => Array<{ start: string; end: string; text?: string }>
    getDirection?: () => string
  }
}
```

> 만약 Step 1 스파이크에서 `diagramType` 또는 `getDiagramFromText`의 실제 이름/형태가 다르면, 이 파일 내부만 그에 맞게 수정한다. mermaid import는 이 파일 밖으로 새어 나가지 않게 유지한다.

- [ ] **Step 5: 테스트 통과 확인**

Run: `npm test -- parseMermaid`
Expected: PASS (6 tests).
실패 시: 스파이크(Step 1) 출력과 대조해 필드 접근부(`v.text`, `e.start`, `getDirection`)를 조정한다.

- [ ] **Step 6: Commit**

```bash
git add src/lib/parseMermaid.ts src/lib/parseMermaid.test.ts
git commit -m "feat: parse mermaid flowchart into graph model"
```

---

### Task 4: 변환 합성 + 디바운스 훅 (`convertMermaid` + `useMermaidToFlow`)

**Files:**
- Create: `src/lib/convertMermaid.ts`
- Create: `src/hooks/useMermaidToFlow.ts`
- Test: `src/lib/convertMermaid.test.ts`
- Test: `src/hooks/useMermaidToFlow.test.ts`

**Interfaces:**
- Consumes: `parseMermaid`, `layout`, `types.ts` (`ConvertResult`, `FlowNode`, `FlowEdge`)
- Produces:
  - `convertMermaid.ts`: `export async function convertMermaid(code: string): Promise<ConvertResult>`
  - `useMermaidToFlow.ts`: `export function useMermaidToFlow(code: string, delay?: number): ConvertResult`

- [ ] **Step 1: convertMermaid 실패 테스트 작성**

`src/lib/convertMermaid.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { convertMermaid } from './convertMermaid'

describe('convertMermaid', () => {
  it('유효한 flowchart를 좌표 있는 노드/엣지로 변환한다', async () => {
    const res = await convertMermaid('graph TD\n  A[Start] --> B[End]')
    expect(res.error).toBeNull()
    expect(res.nodes).toHaveLength(2)
    expect(res.edges).toHaveLength(1)
    expect(Number.isFinite(res.nodes[0].position.x)).toBe(true)
  })

  it('빈 입력은 빈 결과, 에러 없음', async () => {
    const res = await convertMermaid('')
    expect(res).toEqual({ nodes: [], edges: [], error: null })
  })

  it('잘못된 문법은 에러를 담고 노드/엣지는 비운다', async () => {
    const res = await convertMermaid('graph TD\n  A --> ')
    expect(res.error).toBeTruthy()
    expect(res.nodes).toEqual([])
    expect(res.edges).toEqual([])
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- convertMermaid`
Expected: FAIL — `convertMermaid` 없음.

- [ ] **Step 3: convertMermaid 구현**

`src/lib/convertMermaid.ts`:

```ts
import { parseMermaid } from './parseMermaid'
import { layout } from './layout'
import type { ConvertResult } from './types'

export async function convertMermaid(code: string): Promise<ConvertResult> {
  const { graph, error } = await parseMermaid(code)
  if (error || !graph) {
    return { nodes: [], edges: [], error: error ?? '알 수 없는 오류' }
  }
  const { nodes, edges } = layout(graph)
  return { nodes, edges, error: null }
}
```

- [ ] **Step 4: convertMermaid 테스트 통과 확인**

Run: `npm test -- convertMermaid`
Expected: PASS (3 tests).

- [ ] **Step 5: 훅 실패 테스트 작성 (convertMermaid 모킹으로 디바운스 검증)**

`src/hooks/useMermaidToFlow.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useMermaidToFlow } from './useMermaidToFlow'
import type { ConvertResult } from '../lib/types'

vi.mock('../lib/convertMermaid', () => ({
  convertMermaid: vi.fn(),
}))
import { convertMermaid } from '../lib/convertMermaid'
const mockConvert = vi.mocked(convertMermaid)

const ok = (label: string): ConvertResult => ({
  nodes: [{ id: 'A', data: { label }, position: { x: 0, y: 0 } }],
  edges: [],
  error: null,
})

beforeEach(() => {
  vi.useFakeTimers()
  mockConvert.mockReset()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('useMermaidToFlow', () => {
  it('디바운스 후 변환 결과를 반영한다', async () => {
    mockConvert.mockResolvedValue(ok('Start'))
    const { result } = renderHook(() => useMermaidToFlow('graph TD\n A[Start]', 250))

    expect(mockConvert).not.toHaveBeenCalled() // 디바운스 전 호출 없음
    await act(async () => {
      vi.advanceTimersByTime(250)
    })
    await waitFor(() => expect(result.current.nodes).toHaveLength(1))
    expect(result.current.nodes[0].data.label).toBe('Start')
  })

  it('파싱 에러 시 이전 정상 노드를 유지한다', async () => {
    mockConvert.mockResolvedValueOnce(ok('Start'))
    const { result, rerender } = renderHook(({ code }) => useMermaidToFlow(code, 250), {
      initialProps: { code: 'graph TD\n A[Start]' },
    })
    await act(async () => {
      vi.advanceTimersByTime(250)
    })
    await waitFor(() => expect(result.current.nodes).toHaveLength(1))

    mockConvert.mockResolvedValueOnce({ nodes: [], edges: [], error: 'Parse error' })
    rerender({ code: 'graph TD\n A --> ' })
    await act(async () => {
      vi.advanceTimersByTime(250)
    })
    await waitFor(() => expect(result.current.error).toBe('Parse error'))
    // 이전 정상 그래프 유지
    expect(result.current.nodes).toHaveLength(1)
  })
})
```

- [ ] **Step 6: 훅 테스트 실패 확인**

Run: `npm test -- useMermaidToFlow`
Expected: FAIL — `useMermaidToFlow` 없음.

- [ ] **Step 7: 훅 구현**

`src/hooks/useMermaidToFlow.ts`:

```ts
import { useEffect, useState } from 'react'
import { convertMermaid } from '../lib/convertMermaid'
import type { ConvertResult, FlowNode, FlowEdge } from '../lib/types'

export function useMermaidToFlow(code: string, delay = 250): ConvertResult {
  const [nodes, setNodes] = useState<FlowNode[]>([])
  const [edges, setEdges] = useState<FlowEdge[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(async () => {
      const res = await convertMermaid(code)
      if (cancelled) return
      if (res.error) {
        // 파싱 실패: 이전 정상 그래프 유지, 에러만 갱신
        setError(res.error)
      } else {
        setNodes(res.nodes)
        setEdges(res.edges)
        setError(null)
      }
    }, delay)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [code, delay])

  return { nodes, edges, error }
}
```

- [ ] **Step 8: 훅 테스트 통과 확인**

Run: `npm test -- useMermaidToFlow`
Expected: PASS (2 tests).

- [ ] **Step 9: Commit**

```bash
git add src/lib/convertMermaid.ts src/lib/convertMermaid.test.ts src/hooks/useMermaidToFlow.ts src/hooks/useMermaidToFlow.test.ts
git commit -m "feat: add convertMermaid and debounced useMermaidToFlow hook"
```

---

### Task 5: 오른쪽 캔버스 (`FlowCanvas.tsx`)

**Files:**
- Create: `src/components/FlowCanvas.tsx`

**Interfaces:**
- Consumes: `@xyflow/react`, `types.ts` (`FlowNode`, `FlowEdge`)
- Produces: `export default function FlowCanvas(props: { nodes: FlowNode[]; edges: FlowEdge[] }): JSX.Element`

- [ ] **Step 1: 컴포넌트 구현**

`src/components/FlowCanvas.tsx`:

```tsx
import { ReactFlow, Background, Controls, MiniMap, ReactFlowProvider } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { FlowNode, FlowEdge } from '../lib/types'

interface Props {
  nodes: FlowNode[]
  edges: FlowEdge[]
}

export default function FlowCanvas({ nodes, edges }: Props) {
  return (
    <div className="h-full w-full bg-slate-50">
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          nodesDraggable={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#cbd5e1" gap={20} />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable className="!bg-white" />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  )
}
```

> 참고: React Flow는 `data: { label }` 형태의 기본 노드를 자동 렌더링하므로 커스텀 노드 타입은 이번 범위에서 불필요하다.

- [ ] **Step 2: 타입 체크**

Run: `npx tsc -b`
Expected: 에러 없음.

- [ ] **Step 3: Commit**

```bash
git add src/components/FlowCanvas.tsx
git commit -m "feat: add React Flow canvas component"
```

---

### Task 6: 왼쪽 에디터 (`MermaidEditor.tsx`)

**Files:**
- Create: `src/components/MermaidEditor.tsx`

**Interfaces:**
- Consumes: 없음 (제어 컴포넌트)
- Produces: `export default function MermaidEditor(props: { code: string; onChange: (value: string) => void; error: string | null }): JSX.Element`

- [ ] **Step 1: 컴포넌트 구현**

`src/components/MermaidEditor.tsx`:

```tsx
interface Props {
  code: string
  onChange: (value: string) => void
  error: string | null
}

export default function MermaidEditor({ code, onChange, error }: Props) {
  return (
    <div className="flex h-full flex-col bg-slate-900 text-slate-100">
      <div className="flex items-center justify-between border-b border-slate-700 px-4 py-2.5">
        <h1 className="text-sm font-semibold tracking-tight">Mermaid 코드</h1>
        <span className="text-xs text-slate-400">flowchart (graph TD / LR)</span>
      </div>
      <textarea
        value={code}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        className="flex-1 resize-none bg-slate-900 p-4 font-mono text-sm leading-relaxed text-slate-100 outline-none placeholder:text-slate-500"
        placeholder={'graph TD\n  A[시작] --> B{판단}\n  B -->|예| C[완료]\n  B -->|아니오| A'}
      />
      {error && (
        <div className="border-t border-red-800 bg-red-950/80 px-4 py-2 font-mono text-xs text-red-300">
          ⚠ {error}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 타입 체크**

Run: `npx tsc -b`
Expected: 에러 없음.

- [ ] **Step 3: Commit**

```bash
git add src/components/MermaidEditor.tsx
git commit -m "feat: add mermaid textarea editor component"
```

---

### Task 7: 레이아웃 조립 (`App.tsx`) + 수동 검증

**Files:**
- Modify: `src/App.tsx` (Task 1의 placeholder 교체)

**Interfaces:**
- Consumes: `MermaidEditor`, `FlowCanvas`, `useMermaidToFlow`
- Produces: 완성된 좌우 분할 에디터 앱

- [ ] **Step 1: App 조립**

`src/App.tsx` 전체를 교체:

```tsx
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
```

- [ ] **Step 2: 전체 테스트 + 빌드**

Run: `npm test`
Expected: 모든 단위 테스트 PASS.

Run: `npm run build`
Expected: 타입 에러 없이 빌드 성공.

- [ ] **Step 3: 수동 검증 (dev 서버)**

Run: `npm run dev` (확인 후 Ctrl+C)
Expected (브라우저에서 확인):
- 왼쪽에 초기 코드가 채워진 다크 Textarea, 오른쪽에 4개 노드(A/B/C/D)가 위→아래로 배치된 그래프.
- 노드 사이 엣지에 "예"/"아니오" 라벨 표시.
- 왼쪽 코드를 `graph LR`로 바꾸면 약 0.25초 후 좌→우 배치로 갱신.
- 코드를 `A --> ` 처럼 깨뜨리면 왼쪽 하단에 빨간 에러 배너가 뜨고, 오른쪽 그래프는 직전 상태를 유지.
- Background 점, Controls, MiniMap이 오른쪽에 표시.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: assemble split-pane mermaid visual editor"
```

---

## Self-Review 결과

- **Spec coverage:** §3 디렉터리(Task 1~7), §4 데이터 흐름(Task 4 훅 + Task 7 App), §5 파싱(Task 3), §6 dagre 배치(Task 2), §7 UI/Tailwind(Task 5,6,7), §8 에러 처리(Task 4 keep-last-good + Task 6 배너), §9 테스트(Task 2,3,4)에 모두 매핑됨. §10 범위 밖 항목은 의도적으로 미구현.
- **Placeholder scan:** 코드가 필요한 모든 스텝에 실제 코드 포함. Task 1의 `App.tsx`는 명시적으로 임시이며 Task 7에서 교체됨.
- **Type consistency:** `types.ts`의 `ParsedGraph`/`FlowNode`/`FlowEdge`/`ConvertResult`가 `layout`→`convertMermaid`→`useMermaidToFlow`→컴포넌트로 일관되게 전달됨. `parseMermaid`는 `ParsedGraph`를 생성하고 `layout`이 소비.
- **위험:** mermaid 내부 API(`getDiagramFromText`/`getVertices`/`getEdges`/`getDirection`)는 Task 3 Step 1 스파이크로 실제 형태 확인 후 단일 파일에서 조정하도록 격리됨.
