import React from 'react';

function Menu({ onSelect, darkMode, setDarkMode, bigButtons, setBigButtons, user, setPage, online, offlineQueueLen }) {
  const menuItems = [
    { label: 'Tezgahta', value: 'tezgahta' },
    { label: 'Tamamlandı', value: 'tamamlandi' },
    { label: 'Kalitede', value: 'kalitede' },
    { label: 'Siparis', value: 'siparis' },
    { label: 'Stokta', value: 'stokta' },
    { label: 'Beklemede', value: 'beklemede' },
    { label: 'Fason', value: 'fason' },
    { label: 'Tümü', value: 'tumu' },
    { label: 'Grubu İzole Et', value: 'grubuIzoleEt' },
    { label: 'Raporlar', value: 'raporlar' }
  ];

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 12px',
      borderBottom: '1px solid #e6e6e6',
      backgroundColor: '#ffffff',
      flexShrink: 0,
      height: '50px'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          onClick={() => setPage('projects')}
          style={{
            padding: '6px 10px',
            border: '1px solid #d0d0d0',
            borderRadius: 6,
            background: '#f7f7f7',
            cursor: 'pointer'
          }}
        >
          Projeler
        </button>
        {/* Machine info would go here if needed */}
      </div>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* Status filter buttons */}
        <div style={{ display: 'flex', flexWrap: 'wrap' }}>
          {menuItems.map(item => (
            <button
              key={item.value}
              onClick={() => onSelect(item.value)}
              style={{
                padding: '6px 10px',
                margin: '0 2px',
                cursor: 'pointer',
                backgroundColor: '#3498db',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                fontSize: '12px'
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        
        {/* Offline status indicator */}
        {!online && (
          <div title={`Offline mod — kuyrukta ${(offlineQueueLen || 0)} işlem`} style={{ background: '#e74c3c', color: '#fff', padding: '4px 8px', borderRadius: 6, fontSize: 12 }}>
            Offline{offlineQueueLen > 0 ? ` • ${offlineQueueLen}` : ''}
          </div>
        )}
        
        {/* Dark mode toggle */}
        <button
          onClick={() => setDarkMode(v => !v)}
          title="Koyu Tema"
          style={{ padding: '6px 10px', border: '1px solid #d0d0d0', borderRadius: 6, background: '#f7f7f7', cursor: 'pointer' }}
        >
          {darkMode ? '☀️ Açık' : '🌙 Koyu'}
        </button>
        
        {/* Big buttons toggle */}
        <button
          onClick={() => setBigButtons(v => !v)}
          title="Büyük Butonlar"
          style={{ padding: '6px 10px', border: '1px solid #d0d0d0', borderRadius: 6, background: '#f7f7f7', cursor: 'pointer' }}
        >
          {bigButtons ? '↙️ Normal' : '↗️ Büyük'}
        </button>
        
        {/* User info */}
        <div style={{ color: '#7f8c8d', fontSize: '0.9rem' }}>{user?.name}</div>
      </div>
    </div>
  );
}

export default Menu;