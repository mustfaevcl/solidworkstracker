import React, { useMemo, useState, useCallback } from 'react';
import { machines as defaultMachines } from '../data/machines';

function ProjectCard({ machine, onSelect }) {
  return (
    <button
      onClick={() => onSelect(machine)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        textAlign: 'left',
        padding: 14,
        borderRadius: 10,
        border: '1px solid #e6e6e6',
        background: '#fff',
        cursor: 'pointer',
        gap: 10,
        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
        transition: 'transform 120ms ease, box-shadow 120ms ease',
        willChange: 'transform',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = '0 4px 10px rgba(0,0,0,0.08)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.04)';
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div
          aria-hidden
          style={{
            width: 40,
            height: 40,
            borderRadius: 8,
            background: '#eef5ff',
            color: '#2c6bed',
            display: 'grid',
            placeItems: 'center',
            fontWeight: 700,
          }}
        >
          {machine.name?.slice(0, 2)?.toUpperCase() || 'PR'}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <div style={{ fontWeight: 700, color: '#1f2937', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
            {machine.name}
          </div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>{machine.id}</div>
        </div>
      </div>

      {machine.description && (
        <div
          style={{
            fontSize: 13,
            color: '#4b5563',
            lineHeight: 1.35,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {machine.description}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginTop: 'auto',
          paddingTop: 8,
          borderTop: '1px dashed #eee',
        }}
      >
        <div
          aria-hidden
          style={{
            width: 26,
            height: 26,
            borderRadius: '50%',
            background: '#f0fdf4',
            color: '#10b981',
            display: 'grid',
            placeItems: 'center',
            fontSize: 12,
            fontWeight: 700,
            flexShrink: 0,
          }}
          title="Proje Takipçisi"
        >
          {machine.tracker?.split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase() || 'PT'}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <span style={{ fontSize: 11, color: '#6b7280' }}>Takipçi</span>
          <strong
            style={{
              fontSize: 13,
              color: '#111827',
              whiteSpace: 'nowrap',
              textOverflow: 'ellipsis',
              overflow: 'hidden',
              maxWidth: '100%',
            }}
          >
            {machine.tracker}
          </strong>
        </div>
      </div>
    </button>
  );
}

const Projects = React.memo(function Projects({ user, onSelect, items }) {
  const [q, setQ] = useState('');
  const [tracker, setTracker] = useState('all');

  const machines = items && Array.isArray(items) ? items : defaultMachines;

  const trackers = useMemo(() => {
    const names = new Set();
    machines.forEach(m => { if (m.tracker) names.add(m.tracker); });
    return ['all', ...Array.from(names)];
  }, [machines]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return machines.filter(m => {
      const okTracker = tracker === 'all' || (m.tracker === tracker);
      if (!qq) return okTracker;
      const hay = `${m.name || ''} ${m.id || ''} ${m.description || ''} ${m.tracker || ''}`.toLowerCase();
      return okTracker && hay.includes(qq);
    });
  }, [machines, q, tracker]);

  const handleSelect = useCallback((m) => onSelect && onSelect(m), [onSelect]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#f8fafc' }}>
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid #e5e7eb',
          background: '#ffffff',
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ fontWeight: 800, color: '#111827', marginRight: 'auto' }}>Projeler</div>
        <input
          placeholder="Makina ara (ad, id, takipçi)..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{
            minWidth: 220,
            flex: '1 1 260px',
            padding: '10px 12px',
            borderRadius: 8,
            border: '1px solid #e5e7eb',
            outline: 'none',
            background: '#fff',
          }}
        />
        <select
          value={tracker}
          onChange={(e) => setTracker(e.target.value)}
          style={{
            padding: '10px 12px',
            borderRadius: 8,
            border: '1px solid #e5e7eb',
            background: '#fff',
            color: '#111827',
          }}
          title="Takipçiye göre filtrele"
        >
          {trackers.map(t => (
            <option key={t} value={t}>
              {t === 'all' ? 'Tümü' : t}
            </option>
          ))}
        </select>
        {user?.name && (
          <div style={{ color: '#6b7280', fontSize: 13 }}>
            Oturum: <strong style={{ color: '#111827' }}>{user.name}</strong>
          </div>
        )}
      </div>

      <div
        style={{
          padding: 16,
          overflow: 'auto',
          flex: 1,
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: 12,
          }}
        >
          {filtered.map((m) => (
            <ProjectCard key={m.id} machine={m} onSelect={handleSelect} />
          ))}
        </div>
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', color: '#6b7280', padding: 40 }}>Eşleşen proje bulunamadı.</div>
        )}
      </div>
    </div>
  );
});

export default Projects;