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

// Units and spec templates
const TORQUE_UNITS = ["Nm", "ftlb"];
const formatUnitLabel = (u) => (u === "ftlb" ? "ft·lb" : "Nm");
const nmToFtlb = (nm) => nm * 0.737562149;
const ftlbToNm = (ft) => ft * 1.355817948;

const TORQUE_SPEC_CATALOG = [
  { thread: "M6", cls: "8.8", targetNm: 10 },
  { thread: "M8", cls: "8.8", targetNm: 25 },
  { thread: "M10", cls: "8.8", targetNm: 49 },
  { thread: "M12", cls: "8.8", targetNm: 85 },
  { thread: "M8", cls: "10.9", targetNm: 35 },
  { thread: "M10", cls: "10.9", targetNm: 69 },
  { thread: "M12", cls: "10.9", targetNm: 120 },
];

const THREAD_OPTIONS = ["M6", "M8", "M10", "M12"];
const CLASS_OPTIONS = ["8.8", "10.9"];

const getStageFractions = (n) => {
  if (n <= 1) return [1.0];
  if (n === 2) return [0.4, 1.0];
  if (n === 3) return [0.3, 0.7, 1.0];
  const arr = [];
  for (let i = 1; i <= n; i++) arr.push(i / n);
  return arr;
};
 
export default function TorquePanel({ selectedPart }) {
  const torquePatterns = useStore(s => s.torquePatterns);
  const addTorquePattern = useStore(s => s.addTorquePattern);
  const updateTorquePattern = useStore(s => s.updateTorquePattern);
  const removeTorquePattern = useStore(s => s.removeTorquePattern);

  const [newName, setNewName] = useState("");
  const [newNotes, setNewNotes] = useState("");

  const partPatterns = useMemo(
    () => (torquePatterns || []).filter(p => (p.partName || "") === (selectedPart || "")),
    [torquePatterns, selectedPart]
  );

  const addQuickCrossPattern = () => {
    if (!selectedPart) return;
    // Simple 4-bolt cross pattern with 2 stages
    const spec = [
      { boltId: "B1", sequenceIndex: 1, stage: 1, torqueNm: 30 },
      { boltId: "B3", sequenceIndex: 2, stage: 1, torqueNm: 30 },
      { boltId: "B2", sequenceIndex: 3, stage: 1, torqueNm: 30 },
      { boltId: "B4", sequenceIndex: 4, stage: 1, torqueNm: 30 },
      { boltId: "B1", sequenceIndex: 1, stage: 2, torqueNm: 50 },
      { boltId: "B3", sequenceIndex: 2, stage: 2, torqueNm: 50 },
      { boltId: "B2", sequenceIndex: 3, stage: 2, torqueNm: 50 },
      { boltId: "B4", sequenceIndex: 4, stage: 2, torqueNm: 50 },
    ];
    addTorquePattern({
      name: "Çapraz 4 Civata (2 Aşama)",
      notes: "Örnek çapraz sıkma düzeni",
      partName: selectedPart,
      spec
    });
  };

  const createPattern = () => {
    if (!selectedPart) return;
    addTorquePattern({
      name: newName.trim() || "Yeni Tork Deseni",
      notes: newNotes.trim(),
      partName: selectedPart,
      spec: []
    });
    setNewName("");
    setNewNotes("");
  };

  // Unit helpers (store all torques in Nm; convert for UI)
  const unitOf = (p) => (p && p.unit === "ftlb" ? "ftlb" : "Nm");
  const displayTorqueValue = (p, nmVal) => {
    const v = Number(nmVal || 0);
    return unitOf(p) === "ftlb" ? Number(nmToFtlb(v).toFixed(2)) : Number(v.toFixed(2));
  };
  const parseTorqueInput = (p, val) => {
    const num = Number(val);
    if (!Number.isFinite(num)) return 0;
    return unitOf(p) === "ftlb" ? ftlbToNm(num) : num;
  };

  // Spec helpers
  const recommendedTorqueNm = (thread, cls) => {
    const hit = TORQUE_SPEC_CATALOG.find(x => x.thread === thread && x.cls === cls);
    return hit ? hit.targetNm : null;
  };

  const fillTargetsFromSpec = (patternId) => {
    const p = (torquePatterns || []).find(x => x.id === patternId);
    if (!p) return;
    const thread = p.thread || "";
    const cls = p.propertyClass || "";
    const target = recommendedTorqueNm(thread, cls);
    if (!target) { alert("Uygun tork tablosu bulunamadı."); return; }
    const stages = [...new Set((p.spec || []).map(r => Number(r.stage) || 1))].sort((a, b) => a - b);
    const fracs = getStageFractions(stages.length || 1);
    const next = (p.spec || []).map(r => {
      const sIndex = stages.indexOf(Number(r.stage) || 1);
      const frac = fracs[Math.max(0, sIndex)];
      return { ...r, torqueNm: Number((target * frac).toFixed(3)) };
    });
    updateTorquePattern(patternId, { spec: next });
  };

  // Validation
  const validatePattern = (p) => {
    const issues = [];
    const rows = [...(p.spec || [])];

    // Duplicate sequence index per stage
    const byStage = {};
    rows.forEach(r => {
      const s = Number(r.stage) || 1;
      byStage[s] = byStage[s] || [];
      byStage[s].push(r);
    });
    Object.entries(byStage).forEach(([s, arr]) => {
      const seqs = {};
      arr.forEach(r => {
        const key = Number(r.sequenceIndex) || 0;
        seqs[key] = (seqs[key] || 0) + 1;
      });
      Object.entries(seqs).forEach(([k, cnt]) => {
        if (cnt > 1) issues.push(`Aşama ${s}: Sıra #${k} birden fazla kez kullanılmış.`);
      });
    });

    // Non-decreasing torque across stages per bolt
    const byBolt = {};
    rows.forEach(r => {
      const b = r.boltId || "";
      byBolt[b] = byBolt[b] || [];
      byBolt[b].push(r);
    });
    Object.entries(byBolt).forEach(([b, arr]) => {
      const sorted = arr.slice().sort((a, c) => (a.stage - c.stage));
      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1].torqueNm || 0;
        const cur = sorted[i].torqueNm || 0;
        if (cur + 1e-6 < prev) issues.push(`Civata ${b}: Aşama ${sorted[i].stage} torku, önceki aşamadan düşük.`);
      }
    });

    // Same bolt set across stages
    const stageKeys = Object.keys(byStage).map(Number).sort((a, b) => a - b);
    if (stageKeys.length > 1) {
      const refSet = new Set(byStage[stageKeys[0]].map(r => r.boltId));
      for (let i = 1; i < stageKeys.length; i++) {
        const s = stageKeys[i];
        const curSet = new Set(byStage[s].map(r => r.boltId));
        [...refSet].forEach(b => { if (!curSet.has(b)) issues.push(`Aşama ${s}: ${b} eksik.`); });
        [...curSet].forEach(b => { if (!refSet.has(b)) issues.push(`Aşama ${s}: fazladan ${b}.`); });
      }
    }
    return issues;
  };

  // Export / Print
  const exportPatternJSON = (p) => {
    const data = {
      id: p.id,
      name: p.name,
      notes: p.notes,
      partName: p.partName,
      unit: p.unit || "Nm",
      spec: p.spec || [],
      thread: p.thread || null,
      propertyClass: p.propertyClass || null
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(p.name || "torque-pattern").replace(/\s+/g, "_")}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const printPattern = (p) => {
    const unitLbl = formatUnitLabel(p.unit || "Nm");
    const rows = (p.spec || []).slice().sort((a, b) => (a.stage - b.stage) || (a.sequenceIndex - b.sequenceIndex));
    const win = window.open("", "_blank", "width=800,height=600");
    if (!win) return;
    const style = `
      body { font-family: Arial, sans-serif; padding: 16px; }
      h2 { margin: 0 0 6px 0; }
      table { width: 100%; border-collapse: collapse; margin-top: 10px; }
      th, td { border: 1px solid #ddd; padding: 6px 8px; font-size: 12px; }
      th { background: #f7f7f7; text-align: left; }
    `;
    win.document.write("<html><head><title>Torque Pattern</title><style>" + style + "</style></head><body>");
    win.document.write(`<h2>${p.name || "Torque Pattern"}</h2>`);
    if (p.partName) win.document.write(`<div><strong>Parça:</strong> ${p.partName}</div>`);
    if (p.thread) win.document.write(`<div><strong>Diş:</strong> ${p.thread}</div>`);
    if (p.propertyClass) win.document.write(`<div><strong>Sınıf:</strong> ${p.propertyClass}</div>`);
    if (p.notes) win.document.write(`<div><strong>Not:</strong> ${p.notes}</div>`);
    win.document.write("<table><thead><tr><th>Aşama</th><th>Sıra</th><th>Bolt ID</th><th>Tork (" + unitLbl + ")</th></tr></thead><tbody>");
    rows.forEach(r => {
      const shown = unitOf(p) === "ftlb" ? nmToFtlb(r.torqueNm || 0) : (r.torqueNm || 0);
      win.document.write(`<tr><td>${r.stage ?? ""}</td><td>${r.sequenceIndex ?? ""}</td><td>${r.boltId ?? ""}</td><td>${shown.toFixed(2)} ${unitLbl}</td></tr>`);
    });
    win.document.write("</tbody></table></body></html>");
    win.document.close();
    win.focus();
    win.print();
  };
 
  const addRow = (patternId) => {
    const p = (torquePatterns || []).find(x => x.id === patternId);
    if (!p) return;
    const next = [...(p.spec || [])];
    const nextSeq = next.length > 0 ? Math.max(...next.map(r => Number(r.sequenceIndex) || 0)) + 1 : 1;
    next.push({ boltId: `B${nextSeq}`, sequenceIndex: nextSeq, stage: 1, torqueNm: 10 });
    updateTorquePattern(patternId, { spec: next });
  };

  const updateCell = (patternId, idx, field, value) => {
    const p = (torquePatterns || []).find(x => x.id === patternId);
    if (!p) return;
    const next = [...(p.spec || [])];
    const row = { ...(next[idx] || {}) };
    if (field === "torqueNm" || field === "sequenceIndex" || field === "stage") {
      const num = Number(value);
      row[field] = Number.isFinite(num) ? num : 0;
    } else {
      row[field] = value;
    }
    next[idx] = row;
    updateTorquePattern(patternId, { spec: next });
  };

  const removeRow = (patternId, idx) => {
    const p = (torquePatterns || []).find(x => x.id === patternId);
    if (!p) return;
    const next = (p.spec || []).filter((_, i) => i !== idx);
    updateTorquePattern(patternId, { spec: next });
  };

  const renamePattern = (patternId, name) => updateTorquePattern(patternId, { name });
  const editNotes = (patternId, notes) => updateTorquePattern(patternId, { notes });

  return (
    <div style={{ border: "1px solid #e2e2e2", borderRadius: 8, padding: 12, background: "#fafafa", marginTop: 8 }}>
      <SectionTitle>Torque / Sıkma Desenleri {selectedPart ? `— ${selectedPart}` : ""}</SectionTitle>

      {!selectedPart ? (
        <div style={{ color: "#777" }}>Bir parça seçin.</div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 12 }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <FieldLabel>Ad</FieldLabel>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Örn: Kapak 8 civata"
                style={{ padding: "6px 8px", minWidth: 220, border: "1px solid #ccc", borderRadius: 6 }}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <FieldLabel>Not</FieldLabel>
              <input
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                placeholder="Notlar..."
                style={{ padding: "6px 8px", minWidth: 260, border: "1px solid #ccc", borderRadius: 6 }}
              />
            </div>
            <button
              onClick={createPattern}
              style={{ padding: "6px 10px", border: "1px solid #ccc", borderRadius: 6, background: "#fff", cursor: "pointer" }}
              disabled={!selectedPart}
              title="Yeni tork deseni oluştur"
            >
              + Desen
            </button>
            <button
              onClick={addQuickCrossPattern}
              style={{ padding: "6px 10px", border: "1px solid #ccc", borderRadius: 6, background: "#fff", cursor: "pointer" }}
              disabled={!selectedPart}
              title="4 civata iki aşamalı çapraz deseni ekle"
            >
              + Hızlı Çapraz (4)
            </button>
          </div>

          {partPatterns.length === 0 ? (
            <div style={{ color: "#777" }}>
              Bu parça için kayıtlı tork deseni yok. Yukarıdan “+ Desen” veya “+ Hızlı Çapraz (4)” ekleyin.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {partPatterns.map((p) => (
                <div key={p.id} style={{ border: "1px solid #e5e5e5", borderRadius: 8, background: "#fff", padding: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <FieldLabel>Ad</FieldLabel>
                      <input
                        value={p.name || ""}
                        onChange={(e) => renamePattern(p.id, e.target.value)}
                        style={{ padding: "6px 8px", border: "1px solid #ccc", borderRadius: 6, minWidth: 200 }}
                      />
                      <FieldLabel>Not</FieldLabel>
                      <input
                        value={p.notes || ""}
                        onChange={(e) => editNotes(p.id, e.target.value)}
                        style={{ padding: "6px 8px", border: "1px solid #ccc", borderRadius: 6, minWidth: 220 }}
                      />
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <button
                        onClick={() => addRow(p.id)}
                        style={{ padding: "6px 10px", border: "1px solid #ccc", borderRadius: 6, background: "#fff", cursor: "pointer" }}
                        title="Satır ekle"
                      >
                        + Satır
                      </button>
                      <button
                        onClick={() => removeTorquePattern(p.id)}
                        style={{ background: "#fff5f5", border: "1px solid #f2b2b2", color: "#b23", padding: "6px 10px", borderRadius: 6, cursor: "pointer" }}
                        title="Deseni kaldır"
                      >
                        Sil
                      </button>
                    </div>
                  </div>

                  <div style={{ marginTop: 8, display: "flex", alignItems: "flex-end", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <FieldLabel>Birim</FieldLabel>
                      <select
                        value={p.unit || "Nm"}
                        onChange={(e) => updateTorquePattern(p.id, { unit: e.target.value })}
                        style={{ padding: "6px 8px", border: "1px solid #ccc", borderRadius: 6, minWidth: 90 }}
                      >
                        <option value="Nm">Nm</option>
                        <option value="ftlb">ft·lb</option>
                      </select>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <FieldLabel>Diş</FieldLabel>
                      <select
                        value={p.thread || ""}
                        onChange={(e) => updateTorquePattern(p.id, { thread: e.target.value })}
                        style={{ padding: "6px 8px", border: "1px solid #ccc", borderRadius: 6, minWidth: 120 }}
                      >
                        <option value="">Seçiniz</option>
                        {THREAD_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <FieldLabel>Çelik Sınıfı</FieldLabel>
                      <select
                        value={p.propertyClass || ""}
                        onChange={(e) => updateTorquePattern(p.id, { propertyClass: e.target.value })}
                        style={{ padding: "6px 8px", border: "1px solid #ccc", borderRadius: 6, minWidth: 120 }}
                      >
                        <option value="">Seçiniz</option>
                        {CLASS_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <button
                      onClick={() => fillTargetsFromSpec(p.id)}
                      style={{ padding: "6px 10px", border: "1px solid #ccc", borderRadius: 6, background: "#fff", cursor: "pointer" }}
                      title="Seçili diş ve sınıfa göre hedef torkları aşamalara dağıt"
                    >
                      Hedefleri Doldur
                    </button>
                    <button
                      onClick={() => exportPatternJSON(p)}
                      style={{ padding: "6px 10px", border: "1px solid #ccc", borderRadius: 6, background: "#fff", cursor: "pointer" }}
                      title="JSON olarak dışa aktar"
                    >
                      Dışa Aktar (JSON)
                    </button>
                    <button
                      onClick={() => printPattern(p)}
                      style={{ padding: "6px 10px", border: "1px solid #ccc", borderRadius: 6, background: "#fff", cursor: "pointer" }}
                      title="Yazdırılabilir sayfa"
                    >
                      Yazdır
                    </button>
                  </div>

                  <div style={{ marginTop: 10, overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr>
                          <th style={th}>Sıra</th>
                          <th style={th}>Bolt ID</th>
                          <th style={th}>Aşama</th>
                          <th style={th}>Tork ({formatUnitLabel((p.unit || "Nm"))})</th>
                          <th style={th}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {(p.spec || []).sort((a, b) => (a.stage - b.stage) || (a.sequenceIndex - b.sequenceIndex)).map((r, idx) => (
                          <tr key={idx}>
                            <td style={td}>
                              <input
                                type="number"
                                min={1}
                                value={r.sequenceIndex ?? 1}
                                onChange={(e) => updateCell(p.id, p.spec.indexOf(r), "sequenceIndex", e.target.value)}
                                style={input}
                              />
                            </td>
                            <td style={td}>
                              <input
                                value={r.boltId || ""}
                                onChange={(e) => updateCell(p.id, p.spec.indexOf(r), "boltId", e.target.value)}
                                style={input}
                              />
                            </td>
                            <td style={td}>
                              <input
                                type="number"
                                min={1}
                                value={r.stage ?? 1}
                                onChange={(e) => updateCell(p.id, p.spec.indexOf(r), "stage", e.target.value)}
                                style={input}
                              />
                            </td>
                            <td style={td}>
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                value={displayTorqueValue(p, r.torqueNm ?? 0)}
                                onChange={(e) => updateCell(p.id, p.spec.indexOf(r), "torqueNm", parseTorqueInput(p, e.target.value))}
                                style={input}
                              />
                            </td>
                            <td style={tdRight}>
                              <button
                                onClick={() => removeRow(p.id, p.spec.indexOf(r))}
                                style={{ background: "#fff5f5", border: "1px solid #f2b2b2", color: "#b23", padding: "4px 8px", borderRadius: 6, cursor: "pointer" }}
                                title="Satırı kaldır"
                              >
                                Kaldır
                              </button>
                            </td>
                          </tr>
                        ))}
                        {(!p.spec || p.spec.length === 0) && (
                          <tr>
                            <td colSpan={5} style={{ ...td, color: "#777", fontStyle: "italic", textAlign: "center" }}>
                              Satır yok. “+ Satır” ile ekleyin.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {(() => {
                    const issues = validatePattern(p);
                    if (!issues.length) return null;
                    return (
                      <div style={{ marginTop: 10, padding: "8px 10px", background: "#fff9e6", border: "1px solid #ffd591", borderRadius: 6 }}>
                        <div style={{ fontWeight: 600, color: "#ad6800", marginBottom: 6 }}>Doğrulama Uyarıları</div>
                        <ul style={{ margin: 0, paddingLeft: 18, color: "#ad6800" }}>
                          {issues.map((msg, i) => <li key={i} style={{ margin: "2px 0" }}>{msg}</li>)}
                        </ul>
                      </div>
                    );
                  })()}

                  <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <div style={chipStyle}>
                      <FieldLabel>Toplam Satır</FieldLabel>
                      <strong>{(p.spec || []).length}</strong>
                    </div>
                    <div style={chipStyle}>
                      <FieldLabel>Aşama Sayısı</FieldLabel>
                      <strong>{[...new Set((p.spec || []).map(r => r.stage))].length || 0}</strong>
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

const th = { textAlign: "left", borderBottom: "1px solid #eee", padding: "6px 8px", fontSize: 12, color: "#666" };
const td = { borderBottom: "1px solid #f6f6f6", padding: "6px 8px", fontSize: 13, color: "#333" };
const tdRight = { ...td, textAlign: "right" };
const input = { padding: "6px 8px", border: "1px solid #ccc", borderRadius: 6, minWidth: 80 };