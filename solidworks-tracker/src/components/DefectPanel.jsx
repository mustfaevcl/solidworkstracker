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

const DEFECT_TYPES = [
  { value: "porosity", label: "Gözenek" },
  { value: "undercut", label: "Alt Kesme" },
  { value: "crack", label: "Çatlak" },
  { value: "lack_of_fusion", label: "Kaynaşma Eksikliği" },
  { value: "spatter", label: "Sıçrama" },
  { value: "other", label: "Diğer" },
];

const SEVERITIES = [
  { value: "minor", label: "Hafif" },
  { value: "major", label: "Önemli" },
  { value: "critical", label: "Kritik" },
];

const NDT_TYPES = [
  { value: "VT", label: "VT (Görsel)" },
  { value: "PT", label: "PT (Sıvı Penetrant)" },
  { value: "MT", label: "MT (Manyetik)" },
  { value: "UT", label: "UT (Ultrasonik)" },
  { value: "RT", label: "RT (Radyografi)" },
];

export default function DefectPanel({ selectedPart }) {
  const defects = useStore(s => s.defects);
  const addDefect = useStore(s => s.addDefect);
  const updateDefect = useStore(s => s.updateDefect);
  const removeDefect = useStore(s => s.removeDefect);

  const [type, setType] = useState("porosity");
  const [severity, setSeverity] = useState("minor");
  const [ndtRequested, setNdtRequested] = useState(false);
  const [ndtType, setNdtType] = useState("");
  const [ndtResult, setNdtResult] = useState("");
  const [notes, setNotes] = useState("");
  const [photoFiles, setPhotoFiles] = useState([]);
  const [videoFiles, setVideoFiles] = useState([]);

  const partDefects = useMemo(
    () => (defects || []).filter(d => (d.partName || "") === (selectedPart || "")),
    [defects, selectedPart]
  );

  const onPickPhotos = (e) => {
    try {
      const files = Array.from(e.target.files || []);
      setPhotoFiles(files);
    } catch {}
  };
  const onPickVideos = (e) => {
    try {
      const files = Array.from(e.target.files || []);
      setVideoFiles(files);
    } catch {}
  };

  const createObjectUrls = (files) => {
    const urls = [];
    for (const f of files) {
      try {
        const url = URL.createObjectURL(f);
        urls.push(url);
      } catch {}
    }
    return urls;
  };

  const addNewDefect = () => {
    if (!selectedPart) return;
    const photoUrls = createObjectUrls(photoFiles);
    const videoUrls = createObjectUrls(videoFiles);
    addDefect({
      partName: selectedPart,
      type,
      severity,
      ndtRequested,
      ndtType: ndtRequested ? (ndtType || undefined) : undefined,
      ndtResult: ndtRequested ? (ndtResult || undefined) : undefined,
      photoUrls,
      videoUrls,
      notes: notes.trim()
    });
    // reset local form
    setType("porosity");
    setSeverity("minor");
    setNdtRequested(false);
    setNdtType("");
    setNdtResult("");
    setNotes("");
    setPhotoFiles([]);
    setVideoFiles([]);
    // clear file inputs visually
    try {
      const pf = document.getElementById("defect-photos");
      if (pf) pf.value = "";
      const vf = document.getElementById("defect-videos");
      if (vf) vf.value = "";
    } catch {}
  };

  const updateField = (id, patch) => {
    updateDefect(id, patch);
  };

  const renderThumbs = (urls, isVideo = false) => {
    if (!urls || urls.length === 0) {
      return <span style={{ color: "#777", fontSize: 12 }}>Ek yok</span>;
    }
    return (
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {urls.map((u, i) =>
          isVideo ? (
            <video key={i} src={u} controls style={{ width: 140, borderRadius: 6, border: "1px solid #ddd" }} />
          ) : (
            <img key={i} src={u} alt="defect" style={{ width: 120, height: 90, objectFit: "cover", borderRadius: 6, border: "1px solid #ddd" }} />
          )
        )}
      </div>
    );
  };

  return (
    <div style={{ border: "1px solid #e2e2e2", borderRadius: 8, padding: 12, background: "#fafafa", marginTop: 8 }}>
      <SectionTitle>Hata / Kusur Kayıtları {selectedPart ? `— ${selectedPart}` : ""}</SectionTitle>

      {!selectedPart ? (
        <div style={{ color: "#777" }}>Bir parça seçin.</div>
      ) : (
        <>
          {/* Create new defect */}
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 12 }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <FieldLabel>Tip</FieldLabel>
              <select value={type} onChange={(e) => setType(e.target.value)} style={select}>
                {DEFECT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <FieldLabel>Şiddet</FieldLabel>
              <select value={severity} onChange={(e) => setSeverity(e.target.value)} style={select}>
                {SEVERITIES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <FieldLabel>Notlar</FieldLabel>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Kısa açıklama..."
                style={input}
              />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <input type="checkbox" checked={ndtRequested} onChange={(e) => setNdtRequested(e.target.checked)} />
                NDT Talebi
              </label>
            </div>
            <button
              onClick={addNewDefect}
              style={{ padding: "6px 10px", border: "1px solid #ccc", borderRadius: 6, background: "#fff", cursor: "pointer" }}
              disabled={!selectedPart}
              title="Kusur ekle"
            >
              + Ekle
            </button>
          </div>

          {ndtRequested && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12, alignItems: "flex-end" }}>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <FieldLabel>NDT Tipi</FieldLabel>
                <select value={ndtType} onChange={(e) => setNdtType(e.target.value)} style={select}>
                  <option value="">Seçiniz</option>
                  {NDT_TYPES.map((n) => (
                    <option key={n.value} value={n.value}>{n.label}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <FieldLabel>NDT Sonucu</FieldLabel>
                <input
                  value={ndtResult}
                  onChange={(e) => setNdtResult(e.target.value)}
                  placeholder="Örn: Geçti / Kaldı; değerler..."
                  style={input}
                />
              </div>
            </div>
          )}

          {/* Attachments */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginBottom: 12 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <FieldLabel>Fotoğraf(lar)</FieldLabel>
              <input id="defect-photos" type="file" multiple accept="image/*" onChange={onPickPhotos} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <FieldLabel>Video(lar)</FieldLabel>
              <input id="defect-videos" type="file" multiple accept="video/*" onChange={onPickVideos} />
            </div>
          </div>

          {/* List defects */}
          {partDefects.length === 0 ? (
            <div style={{ color: "#777" }}>Kayıt yok.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {partDefects.map((d) => (
                <div key={d.id} style={{ border: "1px solid #e5e5e5", borderRadius: 8, background: "#fff", padding: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <div style={chipStyle}><FieldLabel>Tip</FieldLabel><strong>{labelOf(DEFECT_TYPES, d.type)}</strong></div>
                      <div style={chipStyle}><FieldLabel>Şiddet</FieldLabel><strong>{labelOf(SEVERITIES, d.severity)}</strong></div>
                      {d.ndtRequested && (
                        <>
                          <div style={chipStyle}><FieldLabel>NDT</FieldLabel><strong>{d.ndtType || "-"}</strong></div>
                          <div style={chipStyle}><FieldLabel>Sonuç</FieldLabel><strong>{d.ndtResult || "-"}</strong></div>
                        </>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <button
                        onClick={() => removeDefect(d.id)}
                        style={{ background: "#fff5f5", border: "1px solid #f2b2b2", color: "#b23", padding: "6px 10px", borderRadius: 6, cursor: "pointer" }}
                        title="Kaydı sil"
                      >
                        Sil
                      </button>
                    </div>
                  </div>

                  {d.notes && (
                    <div style={{ marginTop: 8 }}>
                      <FieldLabel>Notlar</FieldLabel>
                      <input
                        value={d.notes}
                        onChange={(e) => updateField(d.id, { notes: e.target.value })}
                        style={{ padding: "6px 8px", width: "100%", border: "1px solid #ccc", borderRadius: 6 }}
                      />
                    </div>
                  )}

                  <div style={{ marginTop: 8, display: "flex", gap: 16, flexWrap: "wrap" }}>
                    <div style={{ flex: "1 1 280px" }}>
                      <strong style={{ fontSize: 13 }}>Fotoğraflar</strong>
                      <div style={{ marginTop: 6 }}>
                        {renderThumbs(d.photoUrls, false)}
                      </div>
                    </div>
                    <div style={{ flex: "1 1 320px" }}>
                      <strong style={{ fontSize: 13 }}>Videolar</strong>
                      <div style={{ marginTop: 6 }}>
                        {renderThumbs(d.videoUrls, true)}
                      </div>
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

function labelOf(options, value) {
  const f = options.find(o => o.value === value);
  return f ? f.label : (value || "-");
}

const input = { padding: "6px 8px", border: "1px solid #ccc", borderRadius: 6, minWidth: 220 };
const select = { padding: "6px 8px", border: "1px solid #ccc", borderRadius: 6, minWidth: 180 };