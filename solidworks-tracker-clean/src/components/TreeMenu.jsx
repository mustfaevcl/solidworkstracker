import React, { useState } from 'react';

function TreeNode({ name, node, onSelectPart }) {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = node && Object.keys(node).length > 0;

  return (
    <div style={{ marginLeft: 12 }}>
      <div
        onClick={() => {
          if (hasChildren) setExpanded(!expanded);
          else onSelectPart(name);
        }}
        style={{ cursor: 'pointer', fontWeight: hasChildren ? 'bold' : 'normal' }}
      >
        {hasChildren ? (expanded ? '▼ ' : '▶ ') : '• '}
        {name}
      </div>
      {expanded &&
        hasChildren &&
        Object.entries(node).map(([childName, childNode]) => (
          <TreeNode key={childName} name={childName} node={childNode} onSelectPart={onSelectPart} />
        ))}
    </div>
  );
}

export default function TreeMenu({ hierarchy, onSelectPart }) {
  if (!hierarchy) return <div>Parçalar yükleniyor...</div>;

  return (
    <div>
      <h4>Montaj Ağaç Yapısı</h4>
      {Object.entries(hierarchy).map(([name, node]) => (
        <TreeNode key={name} name={name} node={node} onSelectPart={onSelectPart} />
      ))}
    </div>
  );
}
