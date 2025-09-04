function PartItem({ part, onSelect }) {
  return (
    <div 
      style={{
        border: '1px solid gray',
        padding: '10px',
        marginBottom: '10px',
        cursor: 'pointer',
        backgroundColor: part.status === 'Eksik' ? '#ffe5e5' : '#e5ffe5',
      }}
      onClick={() => onSelect(part)}
    >
      <h3>{part.name}</h3>
      <p>Malzeme: {part.material}</p>
      <strong>Durum: {part.status}</strong>
    </div>
  );
}

export default PartItem;
