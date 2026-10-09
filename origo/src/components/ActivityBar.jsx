import { useEffect, useRef, useState } from 'react';
import Icon from './Icons.jsx';

export default function ActivityBar({ theme, fontSize, onToggleTheme, onFontSize }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!settingsOpen) return undefined;
    const onDocClick = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setSettingsOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [settingsOpen]);

  return (
    <nav className="act-bar" aria-label="Views">
      <div className="act-top">
        <button type="button" className="act on" aria-label="Explorer" title="Explorer">
          <Icon name="file" size={20} />
        </button>
        <button type="button" className="act" aria-label="Search" title="Search — not available in this build" disabled>
          <Icon name="search" size={20} />
        </button>
        <button type="button" className="act" aria-label="Debugger" title="Debugger — not available in this build" disabled>
          <Icon name="debugger" size={20} />
        </button>
      </div>

      <div className="act-bottom" ref={ref}>
        <button
          type="button"
          className={`act${settingsOpen ? ' on' : ''}`}
          aria-label="Settings"
          title="Settings"
          onClick={() => setSettingsOpen((open) => !open)}
        >
          <Icon name="settings" size={20} />
        </button>
        {settingsOpen && (
          <div className="settings-pop" role="dialog" aria-label="Settings">
            <div className="settings-row">
              <span>Theme</span>
              <button type="button" className="btn small" onClick={onToggleTheme}>
                <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={14} strokeWidth={2} />
                <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
              </button>
            </div>
            <div className="settings-row">
              <span>Font size</span>
              <div className="stepper">
                <button type="button" className="ib small" onClick={() => onFontSize(Math.max(10, fontSize - 1))} aria-label="Decrease font size">−</button>
                <span className="stepper-value">{fontSize}px</span>
                <button type="button" className="ib small" onClick={() => onFontSize(Math.min(22, fontSize + 1))} aria-label="Increase font size">+</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
