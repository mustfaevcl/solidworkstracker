import React from 'react';

function Menu({ onSelect }) {
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
    <div style={{ marginBottom: '20px' }}>
      {menuItems.map(item => (
        <button
          key={item.value}
          onClick={() => onSelect(item.value)}
          style={{
            padding: '8px 16px',
            margin: '4px',
            cursor: 'pointer',
            backgroundColor: '#3498db',
            color: 'white',
            border: 'none',
            borderRadius: '4px'
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export default Menu;