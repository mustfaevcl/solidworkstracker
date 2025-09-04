import { create } from "zustand"

const useStore = create((set) => ({
  selectedPart: null,
  partStatuses: {},
  setSelected: (part) => set({ selectedPart: part }),
  updateStatus: (part, status) =>
    set((state) => ({
      partStatuses: { ...state.partStatuses, [part]: status }
    })),
}))

export default useStore
