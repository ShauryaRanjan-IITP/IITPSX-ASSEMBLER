import { useMemo, useState } from 'react';
import Icon from './Icons.jsx';

const REGISTER_NAMES = ['A', 'B', 'PC', 'SP'];
const ADDRESS_SPACE = 10000;
const PAGE_SIZE = 32;

// The CPU starts A, B, PC and SP at zero (emu.c init_cpu), so the real
// pre-execution baseline for a fresh run/step is all zeros.
const ZERO_REGISTERS = { A: '00000000', B: '00000000', PC: '00000000', SP: '00000000' };

function toSigned(hex) {
  const value = parseInt(hex, 16) >>> 0;
  return value >= 0x80000000 ? value - 0x100000000 : value;
}

function hex8(n) {
  return n.toString(16).toUpperCase().padStart(8, '0');
}

function shortAddr(n) {
  return `0x${n.toString(16).toUpperCase().padStart(4, '0')}`;
}

function Registers({ registers, previousRegisters, running, stepping, debugActive, stepCount, halted }) {
  const live = !!registers;
  const state = running
    ? { text: 'Running', amber: true }
    : stepping
      ? { text: 'Stepping', amber: true }
      : debugActive
        ? { text: halted ? 'Halted' : `Step ${stepCount}`, amber: true }
        : { text: live ? 'Halted' : 'Idle', amber: live };
  return (
    <>
      <div className="sec-h">
        <span>Registers</span>
        <span className="chip">
          <span className={`chip-dot${state.amber ? ' amber' : ''}`} />
          {state.text}
        </span>
      </div>
      <div className="reg-grid">
        {REGISTER_NAMES.map((name) => {
          const value = live ? registers[name] : null;
          const baseline = previousRegisters || ZERO_REGISTERS;
          const changed = live && baseline[name] !== value;
          const isPc = name === 'PC';
          return (
            <div className={`reg${isPc ? ' pc' : ''}${changed ? ' chg' : ''}`} key={name}>
              <div className="reg-top">
                <span className="mono reg-name">{name}</span>
                {changed && <span className="reg-dot" title="Value changed since the previous run/step" />}
              </div>
              <div className="mono reg-val">{value ? `0x${value}` : '—'}</div>
              {value && <div className="mono reg-dec">{toSigned(value)}</div>}
            </div>
          );
        })}
      </div>
    </>
  );
}

function highlight(text, query) {
  if (!query) return text;
  const index = text.toUpperCase().indexOf(query);
  if (index === -1) return text;
  return (
    <>
      {text.slice(0, index)}
      <mark className="mem-match">{text.slice(index, index + query.length)}</mark>
      {text.slice(index + query.length)}
    </>
  );
}

function Memory({ memory, previousMemory, programMemory, loadedWords }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [base, setBase] = useState(0);
  const [jump, setJump] = useState('');

  const valueMap = useMemo(() => {
    const map = new Map();
    (memory || []).forEach((row) => map.set(row.address.toUpperCase(), row.value));
    return map;
  }, [memory]);

  const previousMap = useMemo(() => {
    const map = new Map();
    (previousMemory || []).forEach((row) => map.set(row.address, row.value));
    return map;
  }, [previousMemory]);

  const q = query.trim().toUpperCase();
  const knownCount = memory ? memory.length : 0;

  // Baseline for change detection: the previous step/run snapshot if we have
  // one, otherwise the loaded program image (real pre-execution memory). With
  // no baseline we show no change highlights.
  const hasPrevious = previousMap.size > 0;
  const baselineMap = hasPrevious ? previousMap : (programMemory || new Map());

  const displayRows = useMemo(() => {
    if (q) {
      const list = [];
      for (const [address, value] of valueMap) {
        if (address.includes(q) || value.includes(q)) {
          list.push({ address, value, index: parseInt(address, 16) });
        }
      }
      list.sort((a, b) => a.index - b.index);
      return list.slice(0, 512);
    }
    const rows = [];
    for (let i = base; i < base + PAGE_SIZE && i < ADDRESS_SPACE; i++) {
      const address = hex8(i);
      rows.push({ address, value: valueMap.get(address) ?? null, index: i });
    }
    return rows;
  }, [q, valueMap, base]);

  const page = Math.floor(base / PAGE_SIZE) + 1;
  const totalPages = Math.ceil(ADDRESS_SPACE / PAGE_SIZE);

  const applyJump = () => {
    const parsed = parseInt(jump.replace(/^0x/i, ''), 16);
    if (!Number.isNaN(parsed)) {
      const clamped = Math.max(0, Math.min(ADDRESS_SPACE - 1, parsed));
      setBase(clamped - (clamped % PAGE_SIZE));
      setQuery('');
    }
  };

  const programMax = Number.isInteger(loadedWords) && loadedWords > 0 ? loadedWords : null;

  return (
    <div className="mem-section">
      <div className="sec-h">
        <span>Memory</span>
        <span className="chip">{knownCount ? `${knownCount} words` : 'idle'}</span>
      </div>
      <div className="mem-filter-wrap">
        <label className="visually-hidden" htmlFor="memfilter">Filter memory by address or value</label>
        <div className="mem-filter">
          <Icon name="search" size={13} strokeWidth={2} />
          <input
            id="memfilter"
            className="mono"
            type="text"
            placeholder="Filter address or value (hex)"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </div>

      {!q && (
        <div className="mem-pager">
          <button type="button" className="ib small" disabled={base === 0} onClick={() => setBase(Math.max(0, base - PAGE_SIZE))} aria-label="Previous page">
            <Icon name="chevronRight" size={14} strokeWidth={2} className="flip" />
          </button>
          <span className="mem-page mono">{shortAddr(base)}–{shortAddr(Math.min(ADDRESS_SPACE - 1, base + PAGE_SIZE - 1))} · {page}/{totalPages}</span>
          <button type="button" className="ib small" disabled={base + PAGE_SIZE >= ADDRESS_SPACE} onClick={() => setBase(Math.min(ADDRESS_SPACE - PAGE_SIZE, base + PAGE_SIZE))} aria-label="Next page">
            <Icon name="chevronRight" size={14} strokeWidth={2} />
          </button>
          <input
            className="mem-jump mono"
            type="text"
            placeholder="0x…"
            value={jump}
            onChange={(event) => setJump(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') applyJump(); }}
            aria-label="Go to address"
          />
          <button type="button" className="btn small" onClick={applyJump}>Go</button>
        </div>
      )}

      <div className="mem-head"><span>Address</span><span>Word</span></div>
      <div className="scroll mono mem-body">
        {knownCount === 0 && <div className="mem-note">Run a program to load the emulator memory dump.</div>}
        {knownCount > 0 && q && displayRows.length === 0 && <div className="mem-note">No rows match the filter.</div>}
        {displayRows.map((row) => {
          const known = row.value != null;
          const before = baselineMap.get(row.address);
          // A word changed only when a real previous value differs, or when a
          // previously unloaded address now holds a non-zero value.
          const changed = known && baselineMap.size > 0
            && (before === undefined ? row.value !== '00000000' : before !== row.value);
          const isProgram = programMax != null && row.index < programMax;
          const isSelected = selected === row.index;
          return (
            <div
              className={`mrow${changed ? ' changed' : ''}${isSelected ? ' selected' : ''}${known ? '' : ' unknown'}`}
              key={row.address}
              role="button"
              tabIndex={known || isSelected ? 0 : -1}
              aria-pressed={isSelected}
              title={known ? `${isProgram ? 'Program' : 'Data'} word at ${shortAddr(row.index)}` : `${shortAddr(row.index)} — not loaded`}
              onClick={() => setSelected(isSelected ? null : row.index)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setSelected(isSelected ? null : row.index);
                }
              }}
            >
              <span className="addr">{highlight(shortAddr(row.index), q)}</span>
              <span>{known ? highlight(row.value, q) : '——'}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function DebuggerPane({
  registers,
  previousRegisters,
  memory,
  previousMemory,
  running,
  stepping,
  debugActive,
  stepCount,
  halted,
  loadedWords,
  programMemory,
}) {
  return (
    <aside className="rightpane" style={{ width: 'var(--debugger-width, 328px)' }} aria-label="Debugger">
      <Registers
        registers={registers}
        previousRegisters={previousRegisters}
        running={running}
        stepping={stepping}
        debugActive={debugActive}
        stepCount={stepCount}
        halted={halted}
      />
      <Memory memory={memory || []} previousMemory={previousMemory || []} programMemory={programMemory} loadedWords={loadedWords} />
    </aside>
  );
}
