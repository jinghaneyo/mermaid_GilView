# Mermaid 비주얼 에디터 — 설계 문서

- **작성일**: 2026-06-24
- **상태**: 승인됨 (구현 계획 대기)

## 1. 목적

Mermaid 코드를 왼쪽에서 편집하면 오른쪽 React Flow 캔버스에 다이어그램이
실시간으로 렌더링되는 좌우 분할 비주얼 에디터를 만든다. 이번 범위는
**좌우 레이아웃 + 라이브 파싱**이며, 우선 flowchart(`graph TD/LR`) 문법을 지원한다.

## 2. 기술 스택

| 항목 | 선택 |
|------|------|
| 빌드 도구 | Vite |
| 언어 | React + TypeScript |
| 스타일 | Tailwind CSS |
| 캔버스 | React Flow (`@xyflow/react`) |
| 파싱 | mermaid 공식 파서 (버전 고정) |
| 자동 배치 | `@dagrejs/dagre` |
| 테스트 | Vitest |

## 3. 디렉터리 구조

```
mermaid_GilView/
├─ index.html
├─ package.json / vite.config.ts / tsconfig.json
├─ tailwind.config.js / postcss.config.js
└─ src/
   ├─ main.tsx
   ├─ App.tsx                      # 좌우 분할 레이아웃 셸 + code 상태 보유
   ├─ index.css                    # Tailwind directives
   ├─ components/
   │  ├─ MermaidEditor.tsx         # 왼쪽: Textarea 에디터 + 에러 배너
   │  └─ FlowCanvas.tsx            # 오른쪽: React Flow (ReactFlowProvider 포함)
   ├─ hooks/
   │  └─ useMermaidToFlow.ts       # code → {nodes, edges, error} 변환 + 디바운스
   └─ lib/
      ├─ parseMermaid.ts           # mermaid 파서로 vertices/edges 추출
      ├─ layout.ts                 # dagre 자동 배치 → React Flow 좌표 부여
      └─ types.ts                  # 공유 타입 (FlowNode, FlowEdge, ParseResult 등)
```

## 4. 데이터 흐름

1. `App`이 `code: string` 상태를 단일 소스로 보유한다.
2. `MermaidEditor`가 `code`를 편집(onChange로 상위 setState).
3. `useMermaidToFlow(code)`가 250ms 디바운스 후:
   - `parseMermaid(code)` → vertices/edges 추출
   - `layout(...)` → dagre로 좌표 계산
   - `{ nodes, edges, error }` 반환
4. `FlowCanvas`가 `nodes/edges`를 받아 렌더링.

## 5. Mermaid 공식 파서 활용 (`parseMermaid.ts`)

- mermaid v11(최신) ESM API 사용.
- `await mermaid.parse(code)`로 문법 검증 → 실패 시 에러 메시지 반환.
- 내부 diagram DB API(`getDiagramFromText` 또는 동등 API)로
  `db.getVertices()` / `db.getEdges()`를 추출해 노드/엣지로 매핑.
- **우선 flowchart만 지원**. 그 외 다이어그램 타입은 "지원 예정" 안내 메시지.

### 위험 & 완화
- diagram DB는 mermaid의 준-내부 API로 버전에 민감하다.
- **완화**: `package.json`에서 mermaid 버전을 고정(pin)하고, 파싱 로직을
  `parseMermaid.ts` 한 파일에 격리한다. 버전 업 시 이 파일만 수정.

## 6. 자동 배치 (`layout.ts`)

- `@dagrejs/dagre`로 방향 그래프 레이아웃 계산.
- 다이어그램 방향(`TD/TB` → 위→아래, `LR` → 좌→우)을 dagre `rankdir`에 매핑.
- 노드 기본 크기(150×40) 기준으로 좌표 산출 → React Flow `position`에 주입.
- 엣지는 라벨을 포함해 변환.

## 7. UI / 스타일 (Tailwind)

- 루트: `h-screen w-screen flex`.
- 왼쪽 패널: `w-2/5`, 헤더 + `flex-1` Textarea(monospace, 슬레이트/다크 톤).
- 오른쪽 패널: `flex-1`, React Flow + `<Background>` `<Controls>` `<MiniMap>`.
- 파싱 에러: 왼쪽 패널 하단 빨간 배너로 메시지 노출.
- 톤: 모던/간결, 중립 슬레이트 계열.
- 초기 분할 비율 40/60 고정(리사이저는 이번 범위 외, 추후 확장 가능).

## 8. 에러 처리

- 파싱 실패 시 **이전 정상 그래프를 유지**하고 에러 배너만 표시(캔버스 깜빡임 방지).
- 빈 입력 → 빈 캔버스, 에러 없음.
- 미지원 다이어그램 타입 → 안내 메시지.

## 9. 테스트 (Vitest)

- `parseMermaid`, `layout`을 순수 함수로 분리해 단위 테스트.
  - flowchart TD/LR 기본 케이스
  - 노드 라벨/엣지 라벨 추출
  - 잘못된 문법 → error 반환
  - 빈 입력 → 빈 결과

## 10. 범위 밖 (YAGNI)

- 패널 리사이저, 다중 다이어그램 타입(시퀀스/클래스 등), 노드 드래그→코드 역동기화,
  내보내기(PNG/SVG), 영속 저장. 모두 추후 별도 spec.
