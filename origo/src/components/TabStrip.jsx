import Icon from './Icons.jsx';

// The app edits a single document, so the strip shows one active tab.
export default function TabStrip({ fileName, dirty, onClose }) {
  return (
    <div className="tabstrip" role="tablist" aria-label="Open files">
      <div className={`tab on${dirty ? ' dirty' : ''}`} role="tab" aria-selected="true">
        <Icon name="file" size={13} strokeWidth={1.8} />
        <span className="mono">{fileName}</span>
        <button type="button" className="tab-close" onClick={onClose} title="Close file" aria-label="Close file">
          <Icon name="close" size={12} strokeWidth={2.2} />
        </button>
      </div>
      <div className="spacer" />
      <div className={`tab-saved${dirty ? ' dirty' : ''}`}>
        <span className="saved-dot" />
        {dirty ? 'Unsaved' : 'Saved'}
      </div>
    </div>
  );
}
