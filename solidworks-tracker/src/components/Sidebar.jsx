import useStore from "../store/state"

export default function Sidebar() {
  const selectedPart = useStore(state => state.selectedPart)
  const updateStatus = useStore(state => state.updateStatus)
  const partStatuses = useStore(state => state.partStatuses)

  const handleChange = (e) => {
    updateStatus(selectedPart, e.target.value)
  }

  if (!selectedPart) return <p>Bir parçaya tıklayın</p>

  return (
    <div>
      <h2>Parça: {selectedPart}</h2>
      <select value={partStatuses[selectedPart] || ""} onChange={handleChange}>
        <option value="">Durum Seç</option>
        <option value="CNC">CNC</option>
        <option value="Kaplama">Kaplama</option>
        <option value="Kalite">Kalite</option>
        <option value="Fason">Fason</option>
        <option value="Tamamlandı">Tamamlandı</option>
      </select>
    </div>
  )
}