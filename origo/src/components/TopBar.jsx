import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from './Icons.jsx';
import logoUrl from '../assets/origo-logo.png';

const MENUS = [
  {
    label: 'File',
    items: [
      { label: 'New File', hint: 'Ctrl+N', action: 'new' },
      { label: 'Open File…', hint: 'Ctrl+O', action: 'open' },
      { label: 'Open Folder…', hint: 'Ctrl+K', action: 'openFolder' },
      { sep: true },
      { label: 'Save', hint: 'Ctrl+S', action: 'save' },
      { label: 'Save As…', hint: 'Ctrl+Shift+S', action: 'saveAs' },
    ],
  },
  {
    label: 'Edit',
    items: [
      { label: 'Undo', hint: 'Ctrl+Z', action: 'undo' },
      { label: 'Redo', hint: 'Ctrl+Y', action: 'redo' },
    ],
  },
  {
    label: 'View',
    items: [
      { label: 'Toggle Theme', hint: 'Ctrl+Alt+T', action: 'toggleTheme' },
    ],
  },
  {
    label: 'Run',
    items: [
      { label: 'Assemble', hint: 'Ctrl+B', action: 'assemble' },
      { label: 'Run', hint: 'F5', action: 'run' },
    ],
  },
  {
    label: 'Help',
    items: [{ label: 'About Origo', action: 'about' }],
  },
];

export default function TopBar({
  fileName,
  dirty,
  assembling,
  running,
  canRun,
  theme,
  onNew,
  onOpen,
  onOpenFolder,
  onSave,
  onSaveAs,
  onAssemble,
  onRun,
  onStep,
  onReset,
  stepping,
  debugActive,
  halted,
  onToggleTheme,
  onUndo,
  onRedo,
}) {
  const [openMenu, setOpenMenu] = useState(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  const busy = assembling || running;

  const commands = useMemo(() => ([
    { label: 'File: New File', action: onNew },
    { label: 'File: Open File', action: onOpen },
    { label: 'File: Open Folder', action: onOpenFolder },
    { label: 'File: Save', action: onSave },
    { label: 'File: Save As', action: onSaveAs },
    { label: 'Edit: Undo', action: onUndo },
    { label: 'Edit: Redo', action: onRedo },
    { label: 'Run: Assemble', action: onAssemble },
    { label: 'Run: Run Program', action: onRun },
    { label: 'View: Toggle Theme', action: onToggleTheme },
  ]), [onNew, onOpen, onOpenFolder, onSave, onSaveAs, onUndo, onRedo, onAssemble, onRun, onToggleTheme]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? commands.filter((c) => c.label.toLowerCase().includes(q)) : commands;
  }, [commands, query]);

  useEffect(() => {
    if (!openMenu && !aboutOpen) return undefined;
    const onDocClick = (event) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) {
        setOpenMenu(null);
        setAboutOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [openMenu, aboutOpen]);

  useEffect(() => {
    if (paletteOpen) {
      setQuery('');
      setActive(0);
      const id = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [paletteOpen]);

  const runAction = (action) => {
    setOpenMenu(null);
    setAboutOpen(false);
    if (action === 'new') onNew();
    else if (action === 'open') onOpen();
    else if (action === 'openFolder') onOpenFolder();
    else if (action === 'save') onSave();
    else if (action === 'saveAs') onSaveAs();
    else if (action === 'undo') onUndo();
    else if (action === 'redo') onRedo();
    else if (action === 'assemble') onAssemble();
    else if (action === 'run') onRun();
    else if (action === 'toggleTheme') onToggleTheme();
    else if (action === 'about') setAboutOpen(true);
  };

  const runCommand = (index) => {
    const cmd = results[index];
    if (!cmd) return;
    setPaletteOpen(false);
    cmd.action();
  };

  const onPaletteKey = (event) => {
    if (event.key === 'Escape') setPaletteOpen(false);
    else if (event.key === 'ArrowDown') { event.preventDefault(); setActive((i) => Math.min(i + 1, results.length - 1)); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (event.key === 'Enter') { event.preventDefault(); runCommand(active); }
  };

  return (
    <header className="topbar">
      <div className="topbar-left" ref={wrapRef}>
        <div className="brand">
          <img className="brand-logo" src={logoUrl} alt="" width="24" height="24" />
          <span className="brand-name">Origo</span>
        </div>
        <nav className="menubar" aria-label="Main menu">
          {MENUS.map((menu) => (
            <div className="menu-wrap" key={menu.label}>
              <button
                type="button"
                className={`menu${openMenu === menu.label ? ' open' : ''}`}
                onClick={() => setOpenMenu((m) => (m === menu.label ? null : menu.label))}
                aria-haspopup="true"
                aria-expanded={openMenu === menu.label}
              >
                {menu.label}
              </button>
              {openMenu === menu.label && (
                <div className="menu-pop" role="menu">
                  {menu.items.map((item, index) => (
                    item.sep
                      ? <div className="menu-sep" key={`sep-${index}`} />
                      : (
                        <button
                          type="button"
                          role="menuitem"
                          className="menu-item"
                          key={item.label}
                          onClick={() => runAction(item.action)}
                        >
                          <span>{item.label}</span>
                          {item.hint && <span className="menu-hint">{item.hint}</span>}
                        </button>
                      )
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>
      </div>

      <button type="button" className="palette" onClick={() => setPaletteOpen(true)}>
        <Icon name="search" size={15} strokeWidth={2} />
        <span className="palette-label">Search commands</span>
        <kbd>Ctrl</kbd><kbd>K</kbd>
      </button>

      <div className="topbar-right">
        <button
          type="button"
          className="btn"
          onClick={onAssemble}
          disabled={busy}
          title={assembling ? 'Assembling…' : 'Assemble the current editor contents (Ctrl+B)'}
        >
          <Icon name="assemble" size={15} strokeWidth={2} />
          <span>Assemble</span>
        </button>
        <button
          type="button"
          className="btn primary"
          onClick={onRun}
          disabled={running || assembling || !canRun}
          title={running ? 'Running…' : (canRun ? 'Run the assembled program (F5)' : 'Assemble the current source before running')}
        >
          <Icon name="run" size={14} />
          <span>{running ? 'Running…' : 'Run'}</span>
        </button>
        <button
          type="button"
          className="btn"
          onClick={onStep}
          disabled={running || assembling || stepping || !canRun || halted}
          title={halted ? 'Program halted' : (canRun ? 'Execute the next instruction' : 'Assemble the current source before stepping')}
        >
          <Icon name="step" size={15} strokeWidth={2} />
          <span>{stepping ? 'Stepping…' : 'Step'}</span>
        </button>
        <button
          type="button"
          className="ib"
          onClick={onReset}
          disabled={!debugActive}
          title="Reset the debugger"
          aria-label="Reset the debugger"
        >
          <Icon name="refresh" size={16} strokeWidth={2} />
        </button>
        <span className="tb-divider" />
        <button type="button" className="ib" onClick={onToggleTheme} title="Toggle theme" aria-label="Toggle theme">
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} strokeWidth={2} />
        </button>
      </div>

      {aboutOpen && (
        <div className="about-pop" role="dialog" aria-label="About Origo">
          <div className="about-title">Origo</div>
          <div className="about-sub">IITPSx assembly workspace</div>
          <p className="about-body">
            Edit, assemble, and run IITPSx programs. Assemble with <kbd>Ctrl</kbd><kbd>B</kbd>, run with <kbd>F5</kbd>.
          </p>
          <button type="button" className="btn" onClick={() => setAboutOpen(false)}>Close</button>
        </div>
      )}

      {paletteOpen && (
        <div className="palette-overlay" onMouseDown={() => setPaletteOpen(false)}>
          <div className="palette-dialog" onMouseDown={(event) => event.stopPropagation()}>
            <div className="palette-input">
              <Icon name="search" size={16} strokeWidth={2} />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => { setQuery(event.target.value); setActive(0); }}
                onKeyDown={onPaletteKey}
                placeholder="Search commands…"
              />
            </div>
            <div className="palette-list">
              {results.length === 0 && <div className="palette-empty">No matching commands</div>}
              {results.map((cmd, index) => (
                <button
                  type="button"
                  key={cmd.label}
                  className={`palette-item${index === active ? ' active' : ''}`}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => runCommand(index)}
                >
                  {cmd.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
