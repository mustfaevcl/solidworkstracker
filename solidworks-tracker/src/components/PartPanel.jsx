export default function PartPanel({ selectedPart, onStatusChange }) {
  return (
    <div style={{ width: '300px', padding: '20px', background: '#eee' }}>
      <h3>Seçilen Parça:</h3>
      <p>{selectedPart || 'Henüz seçilmedi'}</p>

      <button onClick={() => onStatusChange('tezgahta')}>⚙️ Tezgahta</button>
      <button onClick={() => onStatusChange('tamamlandi')}>✅ Tamamlandı</button>
      <button onClick={() => onStatusChange('kalitede')}>🔍 Kalitede</button>
      <button onClick={() => onStatusChange('montajda')}>🔧 Montajda</button>
    </div>
  );
}