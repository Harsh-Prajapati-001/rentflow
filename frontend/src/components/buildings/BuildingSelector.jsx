// frontend/src/components/buildings/BuildingSelector.jsx
import { useBuilding } from '../../hooks/useBuilding'

export default function BuildingSelector() {
  const { buildings, selectedBuilding, selectBuilding } = useBuilding()

  if (buildings.length === 0) return null

  return (
    <div className="building-selector">
      <label>Active Building</label>
      <select
        value={selectedBuilding?.id || ''}
        onChange={(e) => {
          const b = buildings.find((b) => b.id === e.target.value)
          selectBuilding(b)
        }}
      >
        {buildings.map((b) => (
          <option key={b.id} value={b.id}>{b.name}</option>
        ))}
      </select>
    </div>
  )
}
