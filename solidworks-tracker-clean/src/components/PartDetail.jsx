function PartDetail({ part }) {
  if (!part) return <p>Bir parça seçiniz.</p>;

  return (
    <div style={{ border: '2px solid blue', padding: '10px', marginTop: '20px' }}>
      <h2>Parça Detayı</h2>
      <p><strong>Ad:</strong> {part.name}</p>
      <p><strong>Malzeme:</strong> {part.material}</p>
      <p><strong>Durum:</strong> {part.status}</p>
    </div>
  );
}

export default PartDetail;
