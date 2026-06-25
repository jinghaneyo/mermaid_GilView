import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// 빌드 모드:
//  - 기본: GitHub Pages(프로젝트 페이지)용. /<repo>/ 하위 서빙이라 base 지정.
//  - --mode single: 모든 JS/CSS를 한 HTML에 인라인 → 더블클릭(file://)으로 열리는 단일 파일.
// 개발 서버(serve)는 항상 루트(/).
export default defineConfig(({ command, mode }) => {
  const single = mode === 'single'
  return {
    base: single ? './' : command === 'build' ? '/mermaid_GilView/' : '/',
    plugins: [react(), ...(single ? [viteSingleFile()] : [])],
    build: single ? { outDir: 'dist-single' } : {},
  }
})
