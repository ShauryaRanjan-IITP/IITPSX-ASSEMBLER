import { useEffect, useRef } from 'react';
import Icon from './Icons.jsx';
import DebuggerPanel from './DebuggerPanel.jsx';

const TONES = {
  muted: 'dim',
  success: 'ok',
  error: 'err',
  warning: 'warn',
  accent: 'info',
  info: 'info',
};

const LEVELS = {
  muted: 'INFO',
  success: 'OK',
  error: 'ERR',
  warning: 'WARN',
  accent: 'INFO',
  info: 'INFO',
};

function Lines({ items }) {
  if (!items || items.length === 0) return <div className="output-empty">No output yet.</div>;
  return items.map((item) => {
    const tone = TONES[item.tone] || '';
    return (
      <div key={item.id} className="log">
        <span className="log-time">{item.time || ''}</span>
        <span className={`lv ${tone}`}>{LEVELS[item.tone] || 'INFO'}</span>
        <span className={`output-line ${tone}`}>{item.text}</span>
      </div>
    );
  });
}

function Text({ value }) {
  const lines = (value || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n$/, '').split('\n');
  if (!value || (lines.length === 1 && lines[0] === '')) {
    return <div className="output-empty">No output yet.</div>;
  }
  return lines.map((line, index) => (
    <div key={index} className="output-line">{line.length ? line : ' '}</div>
  ));
}

export default function OutputPanel({
  activeTab,
  onTabChange,
  consoleLines,
  assemblyText,
  machineText,
  errorLines,
  onClear,
  height,
  debuggerPanel,
}) {
  const logRef = useRef(null);

  useEffect(() => {
    const element = logRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [activeTab, consoleLines, assemblyText, machineText, errorLines]);

  const tabs = [
    { id: 'console', label: 'Console', count: 0 },
    { id: 'assembly', label: 'Assembly output', count: 0 },
    { id: 'machine', label: 'Machine code', count: 0 },
    { id: 'errors', label: 'Problems', count: errorLines.length },
    { id: 'debugger', label: 'Debugger', count: 0 },
  ];

  return (
    <section className="output" style={{ height: `${height}px` }} aria-label="Output">
      <div className="output-head">
        <div className="output-tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`output-tab${activeTab === tab.id ? ' on' : ''}`}
              onClick={() => onTabChange(tab.id)}
              aria-selected={activeTab === tab.id}
              role="tab"
            >
              {tab.label}
              {tab.count > 0 && <span className="chip">{tab.count}</span>}
            </button>
          ))}
        </div>
        {activeTab !== 'debugger' && (
          <button type="button" className="ib small" onClick={onClear} title="Clear output" aria-label="Clear output">
            <Icon name="trash" size={15} strokeWidth={1.8} />
          </button>
        )}
      </div>
      {activeTab === 'debugger' ? (
        <DebuggerPanel {...debuggerPanel} />
      ) : (
        <div className="output-log scroll" ref={logRef} role="tabpanel" aria-live="polite">
          {activeTab === 'console' && <Lines items={consoleLines} />}
          {activeTab === 'assembly' && <Text value={assemblyText} />}
          {activeTab === 'machine' && <Text value={machineText} />}
          {activeTab === 'errors' && <Lines items={errorLines} />}
        </div>
      )}
    </section>
  );
}
