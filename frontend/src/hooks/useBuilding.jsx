// frontend/src/hooks/useBuilding.jsx
import { createContext, useContext, useEffect, useState } from 'react'
import { getBuildings } from '../lib/supabase'
import { useAuth } from './useAuth'

const BuildingContext = createContext(null)

export function BuildingProvider({ children }) {
  const { user, isOwner } = useAuth()
  const [buildings, setBuildings] = useState([])
  const [selectedBuilding, setSelectedBuilding] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (user && isOwner) loadBuildings()
  }, [user, isOwner])

  const loadBuildings = async () => {
    setLoading(true)
    const { data } = await getBuildings(user.id)
    setBuildings(data || [])
    // Auto-select first building
    if (data?.length && !selectedBuilding) {
      setSelectedBuilding(data[0])
    }
    setLoading(false)
  }

  const selectBuilding = (building) => setSelectedBuilding(building)

  const refreshBuildings = () => loadBuildings()

  return (
    <BuildingContext.Provider value={{
      buildings,
      selectedBuilding,
      selectBuilding,
      refreshBuildings,
      loading,
    }}>
      {children}
    </BuildingContext.Provider>
  )
}

export const useBuilding = () => {
  const ctx = useContext(BuildingContext)
  if (!ctx) throw new Error('useBuilding must be used within BuildingProvider')
  return ctx
}
