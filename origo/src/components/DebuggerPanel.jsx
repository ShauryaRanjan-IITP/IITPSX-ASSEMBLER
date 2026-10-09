import Icon from './Icons.jsx';

const REGISTER_NAMES = ['A', 'B', 'PC', 'SP'];
const ZERO_REGISTERS = { A: '00000000', B: '00000000', PC: '00000000', SP: '00000000' };

function shortAddr(hex) {
  return hex ? `0x${hex}` : '—';
}

// Address of the instruction recorded at this entry (the PC before it ran).
function entryLine(entry, listingMap, lineMap) {
  if (entry.pc == null) return entry.kind === 'run' ? 'run to completion' : '';
  const item = listingMap ? listingMap.get(entry.pc) : null;
  if (item && item.text) return item.text;
  const line = lineMap ? lineMap.get(entry.pc) : null;
  return line != null ? `line ${line}` : '';
}

export default function DebuggerPanel({
  entries,
  index,
  onSelect,
  onPrev,
  onNext,
  onStep,
  onRun,
  onReset,
  canStep,
  canRun,
  busy,
  debugActive,
  listingMap,
  lineMap,
  programMemory,
}) {
  const atFirst = index <= 0;
  const atLast = index < 0 || index >= entries.length - 1;
  const selected = index >= 0 && index < entries.length ? entries[index] : null;
  const previous = index > 0 ? entries[index - 1] : null;

  const regRows = selected && selected.registers
    ? REGISTER_NAMES.map((name) => {
        const before = previous && previous.registers ? previous.registers[name] : ZERO_REGISTERS[name];
        const value = selected.registers[name];
        return { name, value, changed: before !== value };
      })
    : [];

  const memBaseline = previous ? previous.memory : (programMemory ? [...programMemory].map(([address, value]) => ({ address, value })) : []);
  const baseMap = new Map((memBaseline || []).map((row) => [row.address, row.value]));
  const memChanges = selected && selected.memory
    ? selected.memory.filter((row) => {
        const before = baseMap.get(row.address);
        return before === undefined ? row.value !== '00000000' : before !== row.value;
      }).slice(0, 24)
    : [];

  const statusText = busy
    ? 'Running…'
    : !debugActive
      ? 'Idle'
      : selected
        ? (selected.status === 'HALTED' ? 'Halted' : `Paused at step ${selected.instr ?? index + 1}`)
        : 'Idle';

  return (
    <div className="debugger-panel">
      <div className="dbg-controls">
        <button type="button" className="btn small" onClick={onPrev} disabled={atFirst} title="Previous recorded state">
          <Icon name="chevronRight" size={13} strokeWidth={2} className="flip" />
          <span>Previous</span>
        </button>
        <button type="button" className="btn small" onClick={onNext} disabled={atLast} title="Next recorded state">
          <span>Next</span>
          <Icon name="chevronRight" size={13} strokeWidth={2} />
        </button>
        <span className="dbg-sep" />
        <button type="button" className="btn small" onClick={onStep} disabled={!canStep || busy} title="Execute one instruction (records a new state)">
          <Icon name="step" size={13} strokeWidth={2} />
          <span>Step</span>
        </button>
        <button type="button" className="btn small primary" onClick={onRun} disabled={!canRun || busy} title="Run to completion (F5)">
          <Icon name="run" size={12} />
          <span>Run</span>
        </button>
        <button type="button" className="btn small" onClick={onReset} disabled={!debugActive} title="Reset the debugger and clear history">
          <Icon name="refresh" size={13} strokeWidth={2} />
          <span>Reset</span>
        </button>
        <span className="dbg-status">{statusText}</span>
      </div>

      <div className="dbg-cols">
        <div className="dbg-history scroll">
          {entries.length === 0 && (
            <div className="dbg-empty">No execution history yet. Assemble, then Step to record real emulator states.</div>
          )}
          {entries.map((entry, i) => (
            <button
              type="button"
              key={`${entry.kind}-${i}`}
              className={`dbg-entry${i === index ? ' active' : ''}`}
              onClick={() => onSelect(i)}
            >
              <span className="dbg-idx mono">#{entry.kind === 'run' ? 'HALT' : (entry.instr ?? i + 1)}</span>
              <span className="dbg-pc mono">{shortAddr(entry.pc)}</span>
              <span className="dbg-line">{entryLine(entry, listingMap, lineMap)}</span>
              <span className={`dbg-tag${entry.status === 'HALTED' ? ' halt' : ''}`}>{entry.kind === 'run' ? 'RUN' : entry.status}</span>
            </button>
          ))}
        </div>

        <div className="dbg-detail scroll">
          {!selected && <div className="dbg-empty">Select a history entry to inspect its registers and memory.</div>}
          {selected && (
            <>
              <div className="dbg-detail-head">
                <span className="mono">{shortAddr(selected.pc)}</span>
                <span>{entryLine(selected, listingMap, lineMap)}</span>
                <span className={`dbg-tag${selected.status === 'HALTED' ? ' halt' : ''}`}>{selected.status || '—'}</span>
              </div>

              <div className="reg-grid dbg-reg-grid">
                {regRows.map((row) => (
                  <div className={`reg${row.name === 'PC' ? ' pc' : ''}${row.changed ? ' chg' : ''}`} key={row.name}>
                    <div className="reg-top"><span className="mono reg-name">{row.name}</span>{row.changed && <span className="reg-dot" />}</div>
                    <div className="mono reg-val">{row.value ? `0x${row.value}` : '—'}</div>
                  </div>
                ))}
              </div>

              <div className="dbg-mem-title">Memory changes ({memChanges.length})</div>
              {memChanges.length === 0 && <div className="dbg-empty">No memory changes at this state.</div>}
              {memChanges.map((row) => (
                <div className="dbg-mem-row mono" key={row.address}>
                  <span className="addr">0x{row.address.slice(-4)}</span>
                  <span>{baseMap.get(row.address) ?? '——'}</span>
                  <span className="dbg-arrow">→</span>
                  <span className="dbg-to">{row.value}</span>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
