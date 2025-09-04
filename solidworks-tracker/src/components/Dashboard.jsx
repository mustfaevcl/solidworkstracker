import React from 'react';

import Menu from './Menu';

function Dashboard({ onBack }) {
  const handleMenuSelect = (value) => {
    console.log('Menu item selected:', value);
    // Handle menu selection logic here
  };
  // Mock data for the dashboard
  const summary = {
    statusCounts: {
      tezgahta: 5,
      tamamlandi: 12,
      kalitede: 3,
      siparis: 8,
      stokta: 15,
      beklemede: 4,
      fason: 2
    },
    overduePartsCount: 3,
    overdueParts: [
      { name: "Parça-001", dueDate: "2025-06-10" },
      { name: "Parça-002", dueDate: "2025-06-12" },
      { name: "Parça-003", dueDate: "2025-06-15" }
    ]
  };

  return (
    <div style={{ padding: '20px', backgroundColor: '#f4f6f9', height: '100%' }}>
      <Menu onSelect={handleMenuSelect} />
      <h2 style={{ color: '#2c3e50' }}>Genel Bakış Raporu</h2>
      
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px' }}>
        {/* Durum Sayıları Kartı */}
        <div style={cardStyle}>
          <h3 style={cardTitleStyle}>Parça Durumları</h3>
          {Object.keys(summary.statusCounts).length > 0 ? (
            <ul style={listStyle}>
              {Object.entries(summary.statusCounts).map(([status, count]) => (
                <li key={status} style={listItemStyle}>
                  <span>{status.charAt(0).toUpperCase() + status.slice(1)}:</span>
                  <strong>{count} adet</strong>
                </li>
              ))}
            </ul>
          ) : (
            <p>Durum bilgisi bulunamadı.</p>
          )}
        </div>

        {/* Geciken Parçalar Kartı */}
        <div style={cardStyle}>
          <h3 style={cardTitleStyle}>Geciken Parçalar</h3>
          <p style={{ fontSize: '2rem', fontWeight: 'bold', color: '#e74c3c', margin: '10px 0' }}>
            {summary.overduePartsCount}
          </p>
          {summary.overdueParts && summary.overdueParts.length > 0 && (
             <ul style={{...listStyle, maxHeight: '150px', overflowY: 'auto'}}>
              {summary.overdueParts.map(part => (
                <li key={part.name} style={listItemStyle}>
                    <span>{part.name}</span>
                    <span style={{color: '#c0392b'}}>{new Date(part.dueDate).toLocaleDateString('tr-TR')}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// Stil tanımlamaları
const cardStyle = {
  backgroundColor: 'white',
  padding: '20px',
  borderRadius: '8px',
  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  flex: 1,
  minWidth: '300px'
};

const cardTitleStyle = {
  margin: '0 0 15px 0',
  color: '#34495e',
  borderBottom: '1px solid #ecf0f1',
  paddingBottom: '10px'
};

const listStyle = {
    listStyleType: 'none',
    padding: 0,
    margin: 0
};

const listItemStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '8px 0',
    borderBottom: '1px solid #f5f5f5'
};

export default Dashboard;