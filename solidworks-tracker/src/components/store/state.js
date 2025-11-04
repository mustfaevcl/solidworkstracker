import { create } from "zustand"

function cryptoRandomId() {
  try {
    const arr = new Uint32Array(2);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(arr);
      return `id_${arr[0].toString(36)}${arr[1].toString(36)}`;
    }
  } catch {}
  return `id_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

const useStore = create((set, get) => ({
  // Selection and part status (existing)
  selectedPart: null,
  partStatuses: {},
  setSelected: (part) => set({ selectedPart: part }),
  updateStatus: (part, status) =>
    set((state) => ({
      partStatuses: { ...state.partStatuses, [part]: status }
    })),

  // Connectivity + offline queue (for future sync)
  online: true,
  setOnline: (online) => {
    set({ online });
    try {
      if (online) {
        // On reconnect, attempt to process queued actions
        const fn = get().processOfflineQueue;
        if (typeof fn === 'function') {
          // Slight defer to ensure UI settled
          setTimeout(() => { try { get().processOfflineQueue(); } catch {} }, 50);
        }
      }
    } catch {}
  },
  offlineQueue: [],
  enqueue: (action) =>
    set((state) => ({
      offlineQueue: [...state.offlineQueue, action]
    })),
  dequeue: () => {
    const { offlineQueue } = get();
    if (!offlineQueue || offlineQueue.length === 0) return null;
    const [first, ...rest] = offlineQueue;
    set({ offlineQueue: rest });
    return first;
  },

  // Drain offline queue (simulate sync; replace with real API calls when backend is ready)
  processOfflineQueue: async () => {
    try {
      let item;
      while ((item = get().dequeue())) {
        // Simulate server sync; here we just log and continue.
        // Replace this switch with real API calls and conflict resolution.
        // eslint-disable-next-line no-console
        console.log('[offline-sync] replay', item?.type, item);
        await new Promise(r => setTimeout(r, 10));
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('processOfflineQueue failed:', e);
    }
  },

  clearOfflineQueue: () => set({ offlineQueue: [] }),

  // Weld seams and WPS catalog
  // Seam: { id, partName, p0:[x,y,z], p1:[x,y,z], status:'planned'|'welding'|'done'|'qa', wpsId?, notes?, createdAt, updatedAt? }
  weldSeams: [],
  addWeldSeam: (seam) =>
    set((state) => {
      const seamObj = {
        id: seam?.id || cryptoRandomId(),
        createdAt: Date.now(),
        status: 'planned',
        ...seam
      };
      const next = [...state.weldSeams, seamObj];
      try {
        if (!get().online) {
          get().enqueue({ type: 'addWeldSeam', payload: seamObj, ts: Date.now() });
        }
      } catch {}
      return { weldSeams: next };
    }),
  updateWeldSeam: (id, patch) =>
    set((state) => {
      try {
        if (!get().online) {
          get().enqueue({ type: 'updateWeldSeam', id, patch, ts: Date.now() });
        }
      } catch {}
      return {
        weldSeams: state.weldSeams.map((s) =>
          s.id === id ? { ...s, ...patch, updatedAt: Date.now() } : s
        )
      };
    }),
  removeWeldSeam: (id) =>
    set((state) => {
      try {
        if (!get().online) {
          get().enqueue({ type: 'removeWeldSeam', id, ts: Date.now() });
        }
      } catch {}
      return {
        weldSeams: state.weldSeams.filter((s) => s.id !== id)
      };
    }),

  // Basic WPS catalog (can be replaced from backend)
  wpsCatalog: [
    {
      id: 'WPS-001',
      process: 'MIG',
      position: 'PA/1G',
      material: 'S355',
      thicknessMin: 3,
      thicknessMax: 12,
      amps: [160, 220],
      volts: [20, 26],
      travelSpeed: [250, 350],
      filler: 'ER70S-6 Ø1.0',
      shieldingGas: 'Ar/CO2 82/18',
      interpassMax: 180
    },
    {
      id: 'WPS-002',
      process: 'TIG',
      position: 'PB/2F',
      material: '304',
      thicknessMin: 1,
      thicknessMax: 6,
      amps: [80, 140],
      volts: [10, 14],
      travelSpeed: [80, 150],
      filler: 'ER308L Ø1.6',
      shieldingGas: 'Argon',
      interpassMax: 150
    }
  ],
  setWpsCatalog: (wpsCatalog) => set({ wpsCatalog }),
  applyWpsToSeam: (seamId, wpsId) =>
    set((state) => {
      try {
        if (!get().online) {
          get().enqueue({ type: 'applyWpsToSeam', seamId, wpsId, ts: Date.now() });
        }
      } catch {}
      return {
        weldSeams: state.weldSeams.map((s) =>
          s.id === seamId ? { ...s, wpsId, updatedAt: Date.now() } : s
        )
      };
    }),

  // Assembly steps (navigator to be implemented in UI)
  // Step: { id, title, description, neededParts:[], tools:[], torquePatternId?, checklist:[], status, createdAt, updatedAt? }
  assemblySteps: [],
  addAssemblyStep: (step) =>
    set((state) => {
      const stepObj = { id: step?.id || cryptoRandomId(), createdAt: Date.now(), ...step };
      const next = [...state.assemblySteps, stepObj];
      try {
        if (!get().online) {
          get().enqueue({ type: 'addAssemblyStep', payload: stepObj, ts: Date.now() });
        }
      } catch {}
      return { assemblySteps: next };
    }),
  updateAssemblyStep: (id, patch) =>
    set((state) => {
      try {
        if (!get().online) {
          get().enqueue({ type: 'updateAssemblyStep', id, patch, ts: Date.now() });
        }
      } catch {}
      return {
        assemblySteps: state.assemblySteps.map((st) =>
          st.id === id ? { ...st, ...patch, updatedAt: Date.now() } : st
        )
      };
    }),
  removeAssemblyStep: (id) =>
    set((state) => {
      try {
        if (!get().online) {
          get().enqueue({ type: 'removeAssemblyStep', id, ts: Date.now() });
        }
      } catch {}
      return {
        assemblySteps: state.assemblySteps.filter((st) => st.id !== id)
      };
    }),

  // Torque patterns
  // Pattern: { id, name, spec: [{boltId, torqueNm, stage, sequenceIndex}], notes }
  torquePatterns: [],
  addTorquePattern: (pattern) =>
    set((state) => {
      const pat = { id: pattern?.id || cryptoRandomId(), createdAt: Date.now(), ...pattern };
      const next = [...state.torquePatterns, pat];
      try {
        if (!get().online) {
          get().enqueue({ type: 'addTorquePattern', payload: pat, ts: Date.now() });
        }
      } catch {}
      return { torquePatterns: next };
    }),
  updateTorquePattern: (id, patch) =>
    set((state) => {
      try {
        if (!get().online) {
          get().enqueue({ type: 'updateTorquePattern', id, patch, ts: Date.now() });
        }
      } catch {}
      return {
        torquePatterns: state.torquePatterns.map((tp) =>
          tp.id === id ? { ...tp, ...patch, updatedAt: Date.now() } : tp
        )
      };
    }),
  removeTorquePattern: (id) =>
    set((state) => {
      try {
        if (!get().online) {
          get().enqueue({ type: 'removeTorquePattern', id, ts: Date.now() });
        }
      } catch {}
      return {
        torquePatterns: state.torquePatterns.filter((tp) => tp.id !== id)
      };
    }),

  // Defects / QA
  // Defect: { id, partName, type, severity, photoUrls:[], videoUrls:[], notes, ndtRequested?:boolean, ndtType?, ndtResult?, createdAt, updatedAt? }
  defects: [],
  addDefect: (defect) =>
    set((state) => {
      const d = { id: defect?.id || cryptoRandomId(), createdAt: Date.now(), ...defect };
      const next = [...state.defects, d];
      try {
        if (!get().online) {
          get().enqueue({ type: 'addDefect', payload: d, ts: Date.now() });
        }
      } catch {}
      return { defects: next };
    }),
  updateDefect: (id, patch) =>
    set((state) => {
      try {
        if (!get().online) {
          get().enqueue({ type: 'updateDefect', id, patch, ts: Date.now() });
        }
      } catch {}
      return {
        defects: state.defects.map((d) =>
          d.id === id ? { ...d, ...patch, updatedAt: Date.now() } : d
        )
      };
    }),
  removeDefect: (id) =>
    set((state) => {
      try {
        if (!get().online) {
          get().enqueue({ type: 'removeDefect', id, ts: Date.now() });
        }
      } catch {}
      return {
        defects: state.defects.filter((d) => d.id !== id)
      };
    })
}));

export default useStore
