import React, { useMemo, useState } from "react";
import useStore from "./store/state";

function FieldLabel({ children }) {
  return (
    <span style={{ fontSize: 12, color: "#555", marginRight: 6 }}>
      {children}
    </span>
  );
}

const chipStyle = {
  border: "1px solid #eee",
  background: "#fcfcfc",
  padding: "6px 8px",
  borderRadius: 6,
};

function SectionTitle({ children }) {
  return (
    <h3 style={{ margin: "10px 0 8px 0", fontSize: 16, borderBottom: "1px solid #eee", paddingBottom: 6 }}>
      {children}
    </h3>
  );
}

function ChecklistItem({ label, checked, onChange }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export default function AssemblyPanel({ selectedPart }) {
  const assemblySteps = useStore(s => s.assemblySteps);
  const addAssemblyStep = useStore(s => s.addAssemblyStep);
  const updateAssemblyStep = useStore(s => s.updateAssemblyStep);
  const removeAssemblyStep = useStore(s => s.removeAssemblyStep);
  const torquePatterns = useStore(s => s.torquePatterns);

  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const partSteps = useMemo(
    () => (assemblySteps || []).filter(st => (st.partName || "") === (selectedPart || "")),
    [assemblySteps, selectedPart]
  );

  // Only torque patterns for the same part
  const partTorquePatterns = useMemo(
    () => (torquePatterns || []).filter(tp => (tp.partName || "") === (selectedPart || "")),
    [torquePatterns, selectedPart]
  );

  const createStep = () => {
    if (!selectedPart) return;
    addAssemblyStep({
      title: newTitle.trim() || "Yeni Adım",
      description: newDesc.trim(),
      partName: selectedPart,
      neededParts: [],
      tools: [],
      torquePatternId: null,
      checklist: [],
      status: "pending"
    });
    setNewTitle("");
    setNewDesc("");
  };

  const addChecklistItem = (stepId) => {
    const st = (assemblySteps || []).find(x => x.id === stepId);
    if (!st) return;
    const next = [...(st.checklist || []), { label: `Kontrol ${((st.checklist || []).length + 1)}`, done: false }];
    updateAssemblyStep(stepId, { checklist: next });
  };

  const updateChecklist = (stepId, idx, patch) => {
    const st = (assemblySteps || []).find(x => x.id === stepId);
    if (!st) return;
    const next = [...(st.checklist || [])];
    next[idx] = { ...(next[idx] || {}), ...patch };
    updateAssemblyStep(stepId, { checklist: next });
  };

  const removeChecklistItem = (stepId, idx) => {
    const st = (assemblySteps || []).find(x => x.id === stepId);
    if (!st) return;
    const next = (st.checklist || []).filter((_, i) => i !== idx);
    updateAssemblyStep(stepId, { checklist: next });
  };

  const changeStatus = (stepId, status) => updateAssemblyStep(stepId, { status });
  const rename = (stepId, title) => updateAssemblyStep(stepId, { title });
  const editDesc = (stepId, description) => updateAssemblyStep(stepId, { description });

  return (
    <div style={{ border: "1px solid #e2e2e2", borderRadius: 8, padding: 12, background: "#fafafa", marginTop: 8 }}>
      <SectionTitle>Montaj Adımları {selectedPart ? `— ${selectedPart}` : ""}</SectionTitle>

      {!selectedPart ? (
        <div style={{ color: "#777" }}>Bir parça seçin.</div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 12 }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <FieldLabel>Başlık</FieldLabel>
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Örn: Kapak montajı"
                style={{ padding: "6px 8px", minWidth: 220, border: "1px solid #ccc", borderRadius: 6 }}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <FieldLabel>Açıklama</FieldLabel>
              <input
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Adım açıklaması..."
                style={{ padding: "6px 8px", minWidth: 260, border: "1px solid #ccc", borderRadius: 6 }}
              />
            </div>
            <button
              onClick={createStep}
              style={{ padding: "6px 10px", border: "1px solid #ccc", borderRadius: 6, background: "#fff", cursor: "pointer" }}
              disabled={!selectedPart}
              title="Yeni montaj adımı oluştur"
            >
              + Adım
            </button>
          </div>

          {partSteps.length === 0 ? (
            <div style={{ color: "#777" }}>Bu parça için kayıtlı montaj adımı yok. “+ Adım” ile ekleyin.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {partSteps.map((st, sIdx) => (
                <div key={st.id} style={{ border: "1px solid #e5e5e5", borderRadius: 8, background: "#fff", padding: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <FieldLabel>Başlık</FieldLabel>
                      <input
                        value={st.title || ""}
                        onChange={(e) => rename(st.id, e.target.value)}
                        style={{ padding: "6px 8px", border: "1px solid #ccc", borderRadius: 6, minWidth: 200 }}
                      />
                      <FieldLabel>Durum</FieldLabel>
                      <select
                        value={st.status || "pending"}
                        onChange={(e) => changeStatus(st.id, e.target.value)}
                        style={{ padding: "6px 8px", border: "1px solid #ccc", borderRadius: 6 }}
                      >
                        <option value="pending">Beklemede</option>
                        <option value="in_progress">Devam ediyor</option>
                        <option value="done">Tamamlandı</option>
                      </select>
                      <FieldLabel>Tork Deseni</FieldLabel>
                      <select
                        value={st.torquePatternId || ""}
                        onChange={(e) => updateAssemblyStep(st.id, { torquePatternId: e.target.value || null })}
                        style={{ padding: "6px 8px", border: "1px solid #ccc", borderRadius: 6, minWidth: 200 }}
                        title="Bu adım için tork desenini bağla"
                      >
                        <option value="">Seçiniz</option>
                        {partTorquePatterns.map(tp => (
                          <option key={tp.id} value={tp.id}>
                            {(tp.name || tp.id)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {(st.status !== "in_progress" && st.status !== "done") && (
                        <button
                          onClick={() => updateAssemblyStep(st.id, { status: "in_progress", startedAt: Date.now() })}
                          style={{ padding: "6px 10px", border: "1px solid #ccc", borderRadius: 6, background: "#fff", cursor: "pointer" }}
                          title="Adımı başlat"
                        >
                          Başlat
                        </button>
                      )}
                      {st.status !== "done" && (
                        <button
                          onClick={() => updateAssemblyStep(st.id, { status: "done", finishedAt: Date.now() })}
                          style={{ padding: "6px 10px", border: "1px solid #ccc", borderRadius: 6, background: "#fff", cursor: "pointer" }}
                          title="Adımı tamamla"
                        >
                          Tamamla
                        </button>
                      )}
                      <button
                        onClick={() => addChecklistItem(st.id)}
                        style={{ padding: "6px 10px", border: "1px solid #ccc", borderRadius: 6, background: "#fff", cursor: "pointer" }}
                        title="Checklist maddesi ekle"
                      >
                        + Checklist
                      </button>
                      <button
                        onClick={() => removeAssemblyStep(st.id)}
                        style={{ background: "#fff5f5", border: "1px solid #f2b2b", color: "#b23", padding: "6px 10px", borderRadius: 6, cursor: "pointer" }}
                        title="Adımı kaldır"
                      >
                        Sil
                      </button>
                    </div>
                  </div>

                  <div style={{ marginTop: 10 }}>
                    <FieldLabel>Açıklama</FieldLabel>
                    <input
                      value={st.description || ""}
                      onChange={(e) => editDesc(st.id, e.target.value)}
                      placeholder="Açıklama..."
                      style={{ padding: "6px 8px", width: "100%", border: "1px solid #ccc", borderRadius: 6 }}
                    />
                  </div>

                  <div style={{ marginTop: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <strong style={{ fontSize: 14 }}>Checklist</strong>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
                      {(st.checklist || []).map((c, idx) => (
                        <div key={idx} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, borderBottom: "1px dashed #eee", padding: "4px 0" }}>
                          <ChecklistItem
                            label={
                              <input
                                value={c.label || ""}
                                onChange={(e) => updateChecklist(st.id, idx, { label: e.target.value })}
                                style={{ padding: "4px 6px", border: "1px solid #ccc", borderRadius: 6, minWidth: 220 }}
                              />
                            }
                            checked={c.done}
                            onChange={(v) => updateChecklist(st.id, idx, { done: v })}
                          />
                          <button
                            onClick={() => removeChecklistItem(st.id, idx)}
                            style={{ background: "#fff5f5", border: "1px solid #f2b2b2", color: "#b23", padding: "4px 8px", borderRadius: 6, cursor: "pointer" }}
                            title="Maddayı kaldır"
                          >
                            Kaldır
                          </button>
                        </div>
                      ))}
                      {(st.checklist || []).length === 0 && (
                        <div style={{ color: "#777", fontStyle: "italic" }}>Madaleler yok. “+ Checklist” ile ekleyin.</div>
                      )}
                    </div>
                  </div>

                  <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <div style={chipStyle}>
                      <FieldLabel>Madde Sayısı</FieldLabel>
                      <strong>{(st.checklist || []).length}</strong>
                    </div>
                    <div style={chipStyle}>
                      <FieldLabel>Tamamlanan</FieldLabel>
                      <strong>{(st.checklist || []).filter(c => c.done).length}</strong>
                    </div>
                    <div style={chipStyle}>
                      <FieldLabel>Durum</FieldLabel>
                      <strong>{st.status || "pending"}</strong>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}