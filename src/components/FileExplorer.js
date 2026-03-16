// src/components/FileExplorer.js
import { useState, useRef, useMemo } from 'react';
import './FileExplorer.css';

export default function FileExplorer({
  files,
  activeFileId,
  onFileSelect,
  onFileCreate,
  onFileDelete,
  onFileRename,
  peers,
}) {
  const [newFileName, setNewFileName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [renamingFileId, setRenamingFileId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [expandedFolders, setExpandedFolders] = useState(new Set(['root']));
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const inputRef = useRef(null);

  // Build recursive tree
  const recursiveTree = useMemo(() => {
    const tree = { name: 'root', files: [], folders: {} };
    
    Object.entries(files).forEach(([id, file]) => {
      const parts = file.name.split('/');
      let current = tree;
      
      for (let i = 0; i < parts.length - 1; i++) {
        const folderName = parts[i];
        if (!current.folders[folderName]) {
          current.folders[folderName] = { name: folderName, files: [], folders: {} };
        }
        current = current.folders[folderName];
      }
      
      current.files.push({ id, ...file, fileName: parts[parts.length - 1] });
    });
    
    return tree;
  }, [files]);

  const handleCreate = (e) => {
    e.preventDefault();
    if (!newFileName.trim()) return;
    onFileCreate(newFileName.trim());
    setNewFileName('');
    setIsCreating(false);
    setIsCreatingFolder(false);
  };

  const toggleFolder = (path) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(path)) newExpanded.delete(path);
    else newExpanded.add(path);
    setExpandedFolders(newExpanded);
  };

  const getFileIcon = (fileName) => {
    const ext = fileName.split('.').pop().toLowerCase();
    const iconMap = {
      js: '⚡', jsx: '⚛️', ts: '📘', tsx: '⚛️', py: '🐍', php: '🐘',
      html: '🌐', css: '🎨', json: '{}', md: '📝', txt: '📄',
    };
    return iconMap[ext] || '📄';
  };

  const getActivePeers = (fileId) => Object.values(peers || {}).filter(p => p.activeFileId === fileId);

  const renderTree = (node, path = 'root') => {
    return (
      <div className="tree-node" key={path}>
        {node.name !== 'root' && !sidebarCollapsed && (
          <div 
            className={`folder-row ${expandedFolders.has(path) ? 'expanded' : ''}`}
            onClick={() => toggleFolder(path)}
          >
            <span className="folder-toggle-icon">{expandedFolders.has(path) ? '▼' : '▶'}</span>
            <span className="folder-icon">📂</span>
            <span className="folder-name">{node.name}</span>
          </div>
        )}

        {(node.name === 'root' || expandedFolders.has(path)) && (
          <div className={`node-children ${node.name === 'root' ? 'root-node' : ''}`}>
            {/* Render subfolders */}
            {Object.values(node.folders).sort((a,b) => a.name.localeCompare(b.name)).map(sub => 
              renderTree(sub, `${path}/${sub.name}`)
            )}
            
            {/* Render files */}
            {node.files.sort((a,b) => a.fileName.localeCompare(b.fileName)).map(file => (
              <FileItem
                key={file.id}
                file={file}
                isActive={activeFileId === file.id}
                isRenaming={renamingFileId === file.id}
                renameValue={renameValue}
                activePeers={getActivePeers(file.id)}
                getFileIcon={getFileIcon}
                sidebarCollapsed={sidebarCollapsed}
                onSelect={() => onFileSelect(file.id)}
                onRename={() => { setRenamingFileId(file.id); setRenameValue(file.name); }}
                onRenameChange={setRenameValue}
                onRenameSubmit={(e) => {
                  e.preventDefault();
                  if (renameValue.trim() && renameValue !== file.name) onFileRename(file.id, renameValue.trim());
                  setRenamingFileId(null);
                }}
                onDelete={() => onFileDelete(file.id)}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`file-explorer ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <div className="explorer-header">
        <div className="explorer-header-info">
          <h2 className="explorer-title">📁 Files</h2>
          <span className="explorer-stats">{Object.keys(files).length} items</span>
        </div>
        <div className="explorer-header-actions">
          {!sidebarCollapsed && (
            <>
              <button className="add-file-btn" onClick={() => { setIsCreating(true); setIsCreatingFolder(false); }} title="New File">+</button>
              <button className="add-file-btn folder" onClick={() => { setIsCreating(true); setIsCreatingFolder(true); }} title="New Folder">📂+</button>
            </>
          )}
          <button className="collapse-sidebar-btn" onClick={() => setSidebarCollapsed(!sidebarCollapsed)}>
            {sidebarCollapsed ? '›' : '‹'}
          </button>
        </div>
      </div>

      {!sidebarCollapsed && isCreating && (
        <form className="new-file-form" onSubmit={handleCreate}>
          <input
            ref={inputRef}
            className="new-file-input"
            placeholder={isCreatingFolder ? "folder/name" : "filename.ext"}
            value={newFileName}
            onChange={(e) => setNewFileName(e.target.value)}
            autoFocus
            onBlur={() => !newFileName && setIsCreating(false)}
          />
          <span className="form-hint">Enter to {isCreatingFolder ? 'create folder path' : 'create'}</span>
        </form>
      )}

      <div className="file-list">
        {renderTree(recursiveTree)}
      </div>
    </div>
  );
}

function FileItem({
  file, isActive, isRenaming, renameValue, activePeers,
  getFileIcon, sidebarCollapsed, onSelect, onRename,
  onRenameChange, onRenameSubmit, onDelete
}) {
  const [isHovered, setIsHovered] = useState(false);
  const ext = file.name.split('.').pop().toLowerCase();

  return (
    <div
      className={`file-item ${isActive ? 'active' : ''}`}
      onClick={onSelect}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="file-item-main">
        <span className={`file-icon icon-${ext}`}>{getFileIcon(file.name)}</span>
        {!sidebarCollapsed && (
          isRenaming ? (
            <form className="file-rename-form" onSubmit={onRenameSubmit}>
              <input
                className="file-rename-input"
                value={renameValue}
                onChange={(e) => onRenameChange(e.target.value)}
                autoFocus
                onBlur={onRenameSubmit}
              />
            </form>
          ) : (
            <span className="file-name" title={file.name}>{file.fileName}</span>
          )
        )}
        
        {activePeers.length > 0 && !sidebarCollapsed && (
          <div className="file-peers">
            {activePeers.slice(0, 2).map((p, i) => (
              <div key={i} className="peer-indicator" style={{ backgroundColor: p.color }} title={p.name}>
                {p.name[0].toUpperCase()}
              </div>
            ))}
          </div>
        )}
      </div>

      {isHovered && !isRenaming && !sidebarCollapsed && (
        <div className="file-actions">
          <button className="action-btn" onClick={(e) => { e.stopPropagation(); onRename(); }}>✎</button>
          <button className="action-btn delete" onClick={(e) => { e.stopPropagation(); onDelete(); }}>×</button>
        </div>
      )}
    </div>
  );
}
