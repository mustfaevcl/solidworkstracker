import React, { useMemo } from "react";
import * as THREE from "three";
import useStore from "./store/state";

const STATUS_OPTIONS = [
  { value: "planned", label: "Planlı", color: "#95a5a6" },
  { value: "welding", label: "Kaynak", color: "#e67e22" },
  { value: "qa", label: "Kalite", color: "#3498db" },
  { value: "done", label: "Bitti", color: "#2ecc71" },
];

function StatusBadge({ status }) {
  const opt = STATUS_OPTIONS.find((o) => o.value === (status || "planned"));
  const bg = opt?.color || "#95a5a6";
  return (
    <span
      style={{
        display: "inline-block",
        minWidth: 10,
        height: 10,
        borderRadius: 6,
        background: bg,
        marginRight: 8,
      }}
      title={opt?.label || status}
    />
  );
}

function FieldLabel({ children }) {
  return (
    <span style={{ fontSize: 12, color: "#555", marginRight: 6 }}>
      {children}
    </span>
  );
}

function formatLen(value) {
  try {
    const n = Number(value || 0);
    return `${n.toFixed(2)}`;
  } catch {
    return String(value ?? "");
  }
}

export default function WeldPanel({ selectedPart }) {
  const weldSeams = useStore((s) => s.weldSeams);
  const updateWeldSeam = useStore((s) => s.updateWeldSeam);
  const removeWeldSeam = useStore((s) => s.removeWeldSeam);
  const wpsCatalog = useStore((s) => s.wpsCatalog);
  const applyWpsToSeam = useStore((s) => s.applyWpsToSeam);

  const partSeams = useMemo(
    () => (weldSeams || []).filter((s) => (s.partName || "") === (selectedPart || "")),
    [weldSeams, selectedPart]
  );

  return (
    <div
      style={{
        border: "1px solid #e2e2e2",
        borderRadius: 8,
        padding: 12,
        background: "#fafafa",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>
          Kaynak Dikişleri {selectedPart ? `— ${selectedPart}` : ""}
        </h3>
        <Legend />
      </div>

      {!selectedPart ? (
        <div style={{ color: "#777" }}>Bir parça seçin.</div>
      ) : partSeams.length === 0 ? (
        <div style={{ color: "#777" }}>
          Bu parça için kayıtlı dikiş yok. 3B ekrandaki Ribbon {'>'} Araçlar {'>'} Weld Map {'>'} "Yeni Dikiş" ile ekleyin.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {partSeams.map((seam) => {
            const p0 = Array.isArray(seam.p0) ? seam.p0 : [0, 0, 0];
            const p1 = Array.isArray(seam.p1) ? seam.p1 : [0, 0, 0];
            let length = 0;
            try {
              const v0 = new THREE.Vector3(...p0);
              const v1 = new THREE.Vector3(...p1);
              length = v0.distanceTo(v1);
            } catch {}
            const wps = seam.wpsId ? wpsCatalog.find((w) => w.id === seam.wpsId) : null;

            return (
              <div
                key={seam.id}
                style={{
                  border: "1px solid #e5e5e5",
                  borderRadius: 8,
                  background: "#fff",
                  padding: 10,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <StatusBadge status={seam.status} />
                    <strong style={{ fontSize: 14 }}>Dikiş: {seam.id}</strong>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <FieldLabel>Durum</FieldLabel>
                    <select
                      value={seam.status || "planned"}
                      onChange={(e) => updateWeldSeam(seam.id, { status: e.target.value })}
                      style={{ padding: "6px 8px" }}
                    >
                      {STATUS_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>

                    <FieldLabel>WPS</FieldLabel>
                    <select
                      value={seam.wpsId || ""}
                      onChange={(e) => applyWpsToSeam(seam.id, e.target.value)}
                      style={{ padding: "6px 8px", minWidth: 140 }}
                    >
                      <option value="">Seçiniz</option>
                      {wpsCatalog.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.id} — {w.process}
                        </option>
                      ))}
                    </select>

                    <button
                      onClick={() => removeWeldSeam(seam.id)}
                      style={{
                        background: "#fff5f5",
                        border: "1px solid #f2b2b2",
                        color: "#b23",
                        padding: "6px 10px",
                        borderRadius: 6,
                        cursor: "pointer",
                      }}
                      title="Dikişi kaldır"
                    >
                      Sil
                    </button>
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 16,
                    marginTop: 8,
                    flexWrap: "wrap",
                    fontSize: 12,
                    color: "#444",
                  }}
                >
                  <div style={infoPillStyle}>
                    <FieldLabel>Uzunluk</FieldLabel>
                    <span>{formatLen(length)}</span>
                  </div>
                  <div style={infoPillStyle}>
                    <FieldLabel>P0</FieldLabel>
                    <span>[{p0.map((v) => formatLen(v)).join(", ")}]</span>
                  </div>
                  <div style={infoPillStyle}>
                    <FieldLabel>P1</FieldLabel>
                    <span>[{p1.map((v) => formatLen(v)).join(", ")}]</span>
                  </div>
                </div>

                {wps && (
                  <div
                    style={{
                      marginTop: 10,
                      borderTop: "1px dashed #eee",
                      paddingTop: 10,
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                      gap: 10,
                    }}
                  >
                    <WpsChip label="Proses" value={wps.process} />
                    <WpsChip label="Pozisyon" value={wps.position} />
                    <WpsChip label="Malzeme" value={wps.material} />
                    <WpsChip label="Et Kalınlığı" value={`${wps.thicknessMin}-${wps.thicknessMax}`} />
                    <WpsChip label="Akım (A)" value={`${wps.amps?.[0]}-${wps.amps?.[1]}`} />
                    <WpsChip label="Voltaj (V)" value={`${wps.volts?.[0]}-${wps.volts?.[1]}`} />
                    <WpsChip label="İlerleme (mm/dk)" value={`${wps.travelSpeed?.[0]}-${wps.travelSpeed?.[1]}`} />
                    <WpsChip label="Tel" value={wps.filler} />
                    <WpsChip label="Koruyucu Gaz" value={wps.shieldingGas} />
                    <WpsChip label="Interpass Max" value={`${wps.interpassMax}°C`} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const infoPillStyle = {
  border: "1px solid #eee",
  background: "#fcfcfc",
  padding: "6px 8px",
  borderRadius: 6,
};

function WpsChip({ label, value }) {
  if (!value) return null;
  return (
    <div style={{ ...infoPillStyle, display: "flex", alignItems: "center", gap: 6 }}>
      <FieldLabel>{label}</FieldLabel>
      <span style={{ fontWeight: 600, color: "#333" }}>{String(value)}</span>
    </div>
  );
}

function Legend() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: "#555" }}>
      {STATUS_OPTIONS.map((o) => (
        <div key={o.value} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              width: 10,
              height: 10,
              background: o.color,
              borderRadius: 6,
              display: "inline-block",
            }}
          />
          <span>{o.label}</span>
        </div>
      ))}
    </div>
  );
}