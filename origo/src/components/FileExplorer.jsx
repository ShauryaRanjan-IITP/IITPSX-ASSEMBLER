import { useCallback, useEffect, useState } from 'react';
import Icon from './Icons.jsx';

const bridge = typeof window !== 'undefined' ? window.origo : undefined;

function TreeNode({ entry, depth, expanded, childrenMap, loading, onToggle, onOpenFile, selectedPath }) {
  const isDir = entry.isDirectory;
  const isOpen = expanded.has(entry.path);
  const kids = childrenMap[entry.path];

  return (
    <li>
      <button
        type="button"
        className={`tree-row${selectedPath === entry.path ? ' selected' : ''}`}
        style={{ paddingLeft: `${8 + depth * 12}px` }}
        onClick={() => (isDir ? onToggle(entry) : onOpenFile(entry))}
        title={entry.path}
      >
        <span className="twisty">{isDir ? (isOpen ? '▾' : '▸') : ''}</span>
        <Icon name={isDir ? 'folder' : 'file'} size={14} />
        <span className="label-text">{entry.name}</span>
      </button>
      {isDir && isOpen && (
        <ul className="tree-children">
          {loading[entry.path] && <li className="tree-note" style={{ paddingLeft: '20px' }}>Loading…</li>}
          {kids && kids.map((child) => (
            <TreeNode
              key={child.path}
              entry={child}
              depth={depth + 1}
              expanded={expanded}
              childrenMap={childrenMap}
              loading={loading}
              onToggle={onToggle}
              onOpenFile={onOpenFile}
              selectedPath={selectedPath}
            />
          ))}
          {kids && kids.length === 0 && !loading[entry.path] && (
            <li className="tree-note" style={{ paddingLeft: '20px' }}>empty</li>
          )}
        </ul>
      )}
    </li>
  );
}

export default function FileExplorer({ root, selectedPath, fileName, onChooseFolder, onOpenFile }) {
  const [expanded, setExpanded] = useState(() => new Set());
  const [childrenMap, setChildrenMap] = useState({});
  const [loading, setLoading] = useState({});
  const [error, setError] = useState(null);

  const loadDir = useCallback(async (dir) => {
    if (!bridge?.listWorkspace) return;
    setLoading((prev) => ({ ...prev, [dir]: true }));
    const result = await bridge.listWorkspace({ dir });
    setLoading((prev) => ({ ...prev, [dir]: false }));
    if (result?.error) { setError(result.error); return; }
    setChildrenMap((prev) => ({ ...prev, [dir]: result.entries || [] }));
  }, []);

  useEffect(() => {
    setExpanded(new Set());
    setChildrenMap({});
    setLoading({});
    setError(null);
    if (root?.path) loadDir(root.path);
  }, [root, loadDir]);

  const onToggle = useCallback((entry) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(entry.path)) {
        next.delete(entry.path);
      } else {
        next.add(entry.path);
        if (!childrenMap[entry.path]) loadDir(entry.path);
      }
      return next;
    });
  }, [childrenMap, loadDir]);

  return (
    <aside className="explorer" style={{ width: 'var(--sidebar-width, 240px)' }} aria-label="File explorer">
      <div className="sec-h">
        <span>Explorer</span>
        <button type="button" className="ib small" onClick={onChooseFolder} title="Open folder" aria-label="Open folder">
          <Icon name="folder" size={16} strokeWidth={1.8} />
        </button>
      </div>

      <div className="sec-sub">Open editors</div>
      <div className="open-editor">
        <Icon name="file" size={15} className="open-editor-icon" strokeWidth={1.8} />
        <span className="mono">{fileName}</span>
      </div>

      {!root && (
        <div className="empty-card">
          <Icon name="folder" size={22} className="empty-card-icon" strokeWidth={1.6} />
          <div className="empty-card-title">No folder open</div>
          <div className="empty-card-text">Open a workspace folder to browse and assemble several files.</div>
          <button type="button" className="btn" onClick={onChooseFolder}>Open Folder</button>
        </div>
      )}

      {root && (
        <div className="explorer-body scroll">
          <div className="explorer-root" title={root.path}>
            <Icon name="folder" size={13} />
            <span>{root.name}</span>
          </div>
          {error && <div className="tree-note" style={{ padding: '8px 14px' }}>{error}</div>}
          <ul className="tree">
            {(childrenMap[root.path] || []).map((entry) => (
              <TreeNode
                key={entry.path}
                entry={entry}
                depth={0}
                expanded={expanded}
                childrenMap={childrenMap}
                loading={loading}
                onToggle={onToggle}
                onOpenFile={onOpenFile}
                selectedPath={selectedPath}
              />
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}
