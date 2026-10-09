export default function StatusBar({
  fileName,
  dirty,
  cursor,
  canRun,
  memoryCount,
  assembling,
  running,
  registers,
}) {
  const state = running
    ? { text: 'Running', cls: 'amber' }
    : registers
      ? { text: 'Halted', cls: 'amber' }
      : canRun
        ? { text: 'Ready', cls: 'green' }
        : { text: 'Idle', cls: '' };

  return (
    <footer className="statusbar">
      <div className="sb-left">
        <span className="sb-item">
          <span className={`sb-dot ${state.cls}`} />
          {state.text}
        </span>
        <span className="sb-item mono">{fileName}{dirty ? ' •' : ''}</span>
      </div>
      <div className="sb-right">
        <span className="sb-item">{memoryCount > 0 ? `${memoryCount} words` : 'No memory image'}</span>
        <span className="sb-item mono">Ln {cursor.line}, Col {cursor.column}</span>
        <span className="sb-brand">IITPSx</span>
      </div>
    </footer>
  );
}
