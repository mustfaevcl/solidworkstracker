import { create } from "zustand"

const useStore = create((set) => ({
  selectedPart: null,
  partStatuses: {},
  partDetails: {},

  setSelected: (part) => set({ selectedPart: part }),

  updateStatus: (part, status) =>
    set((state) => ({
      partStatuses: { ...state.partStatuses, [part]: status }
    })),

  updatePartDetail: (part, field, value) =>
    set((state) => ({
      partDetails: {
        ...state.partDetails,
        [part]: {
          ...state.partDetails[part],
          [field]: value
        }
      }
    })),

  loadFromBackend: (records) =>
    set(() => {
      const partStatuses = {};
      const partDetails = {};
      records.forEach(r => {
        if (r.parcaAdi) {
          partStatuses[r.parcaAdi] = r.durum || '';
          partDetails[r.parcaAdi] = {
            machineType: r.machineType || '',
            purchaseStatus: r.purchaseStatus || '',
            location: r.location || '',
            outsourceCompany: r.outsourceCompany || '',
            outsourceDate: r.outsourceDate || '',
            dueDate: r.dueDate || '',
            notes: r.notes || '',
            projeNo: r.projeNo || '',
            parcaKodu: r.parcaKodu || '',
          };
        }
      });
      return { partStatuses, partDetails };
    }),
}))

export default useStore
