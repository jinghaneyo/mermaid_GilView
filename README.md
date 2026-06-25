# Mermaid GilView — Mermaid 비주얼 에디터

왼쪽에서 **Mermaid 코드**를 편집하면 오른쪽 **캔버스**에 실시간으로 그려지고,
캔버스에서 노드를 연결·이동·편집하면 다시 코드로 반영되는 **양방향 에디터**입니다.

## 🔗 사용 방법 (배포)

서버 없이 동작하는 정적 앱입니다. 작업 내용은 브라우저 localStorage에 자동 저장됩니다(서버 전송 없음).

- **가장 간편 — 단일 HTML 파일**: `npm run build:single` → `dist-single/index.html` 한 파일.
  이 파일을 받아 **더블클릭**하면 브라우저에서 바로 열립니다(설치·서버 불필요).
- **정적 호스팅 — dist 폴더**: `npm run build` → `dist/`를 정적 호스트에 업로드.
  로컬 확인은 `npm run preview`.
- **GitHub Pages**: 저장소를 **공개(public)**로 두면 포함된 GitHub Actions 워크플로우가
  push 시 자동 빌드·배포합니다 → `https://jinghaneyo.github.io/mermaid_GilView/`
  (무료 플랜은 비공개 저장소 Pages를 지원하지 않습니다.)

## ✨ 기능

- **양방향 편집**: 코드 → 캔버스(실시간), 캔버스 → 코드(노드 연결·드래그)
- **노드/엣지 편집**: 더블클릭으로 라벨 편집, 핸들 드래그로 연결, 추가/삭제
- **노드 모양**: 사각형 `[]`, 마름모 `{}`, 원통 `[()]`, 스타디움 `([])`, 원 `(())`
- **subgraph 그룹 박스**: 박스 드래그 시 내부 노드 동반 이동
- **페이지 탭**: 여러 다이어그램을 탭으로 관리(이름 변경·순서 드래그)
- **테마/격자**: 라이트·다크 테마, 격자 on/off
- **저장/복원**: 워크스페이스 자동 저장(localStorage), JSON 백업/복원
- **내보내기**: PNG · SVG · `.mmd` · 코드 복사, `.mmd` 가져오기
- **편의**: 예제 템플릿, 레이아웃 방향 토글(TD↔LR), Undo/Redo(Ctrl+Z/Y)

> 우선 **flowchart**(`graph TD` / `flowchart LR` 등) 문법을 지원합니다.

## 🖱 사용법

1. 왼쪽 텍스트 영역에 Mermaid 코드 입력 (예: `graph TD\nA[시작] --> B[종료]`)
2. 오른쪽 캔버스에서:
   - 노드 **더블클릭** → 라벨 편집
   - 노드 아래/위 **핸들 드래그** → 다른 노드와 연결
   - 노드 선택 후 **Delete/Backspace** → 삭제
   - **+ 노드 추가** 버튼으로 노드 생성
3. 상단 탭으로 여러 다이어그램 관리, 우상단 버튼으로 이미지/파일 내보내기

## 🛠 로컬 실행

```bash
npm install
npm run dev      # 개발 서버 (http://localhost:5173)
npm run build    # 프로덕션 빌드 → dist/
npm run preview  # 빌드 결과 미리보기
npm test         # 단위 테스트
```

## 기술 스택

React · Vite · TypeScript/JSX · Tailwind CSS · React Flow(`@xyflow/react`) ·
Mermaid(공식 파서) · dagre(레이아웃) · html-to-image(내보내기)
