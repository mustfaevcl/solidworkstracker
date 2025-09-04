import PartItem from './PartItem';

function PartList({ parts, onSelect }) {
  return (
    <div>
      <h2>Parça Listesi</h2>
      {parts.map((part) => (
        <PartItem key={part.id} part={part} onSelect={onSelect} />
      ))}
    </div>
  );
}

export default PartList;