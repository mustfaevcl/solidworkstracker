import { create } from 'zustand'

export const useStore = create((set) => ({
  selected: null,
  status: {},
  setSelected: (name) => set({ selected: name }),
  updateStatus: (name, durum) => set((state) => ({
    status: { ...state.status, [name]: durum },
  })),
}))