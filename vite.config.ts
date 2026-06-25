import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages(프로젝트 페이지)는 /<repo>/ 하위에서 서빙되므로 build 시 base 경로를 맞춘다.
// 개발 서버는 루트(/)로 둔다.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/mermaid_GilView/' : '/',
  plugins: [react()],
}))
