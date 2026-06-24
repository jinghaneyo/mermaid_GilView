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
