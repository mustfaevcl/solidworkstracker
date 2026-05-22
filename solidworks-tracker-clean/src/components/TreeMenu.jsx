import React, { useState } from 'react';

const statusColorMap = {
  tezgahta: 'var(--status-tezgahta)',
  tamamlandi: 'var(--status-tamamlandi)',
  kalitede: 'var(--status-kalitede)',
  siparis: 'var(--status-siparis)',
  stokta: 'var(--status-stokta)',
  beklemede: 'var(--status-beklemede)',
  fason: 'var(--status-fason)',
  montajda: 'var(--status-montajda)',
};

function TreeNode({ name, node, onSelectPart, selectedPart, partStatuses, depth = 0 }) {
  const [expanded, setExpanded] = useState(depth === 0);
  const hasChildren =
    node &&
    typeof node === 'object' &&
    Object.keys(node).length > 0 &&
    !('count' in node && Object.keys(node).length === 1);
  const isLeaf = !hasChildren;
  const isSelected = selectedPart === name;
  const status = partStatuses?.[name];

  return (
    <div className="tree-node">
      <div
        className={`tree-node-label${isSelected ? ' selected' : ''}`}
        onClick={() => {
          if (hasChildren) setExpanded(!expanded);
          if (isLeaf) onSelectPart(name);
        }}
      >
        <span className="tree-node-icon">
          {hasChildren ? (expanded ? '▾' : '▸') : '·'}
        </span>
        <span className="tree-node-name" title={name}>{name}</span>
        {status && (
          <span
            className="tree-node-badge"
            style={{ background: statusColorMap[status] || '#ccc' }}
            title={status}
          />
        )}
      </div>
      {expanded && hasChildren && (
        <div className="tree-node-children">
          {Object.entries(node).map(([childName, childNode]) =>
            childName === 'count' ? null : (
              <TreeNode
                key={childName}
                name={childName}
                node={childNode}
                onSelectPart={onSelectPart}
                selectedPart={selectedPart}
                partStatuses={partStatuses}
                depth={depth + 1}
              />
            )
          )}
        </div>
      )}
    </div>
  );
}

export default function TreeMenu({ hierarchy, onSelectPart, selectedPart, partStatuses }) {
  if (!hierarchy || Object.keys(hierarchy).length === 0) {
    return (
      <div style={{ padding: '16px', color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center' }}>
        Model yükleniyor...
      </div>
    );
  }

  return (
    <div>
      {Object.entries(hierarchy).map(([name, node]) => (
        <TreeNode
          key={name}
          name={name}
          node={node}
          onSelectPart={onSelectPart}
          selectedPart={selectedPart}
          partStatuses={partStatuses}
          depth={0}
        />
      ))}
    </div>
  );
}
