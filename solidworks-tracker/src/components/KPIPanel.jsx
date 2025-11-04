import React, { useMemo } from "react";
import useStore from "./store/state";

function Pill({ label, value, color = "#333" }) {
  return (
    <div
      style={{
        border: "1px solid #eee",
        background: "#fcfcfc",
        padding: "6px 10px",
        borderRadius: 8,
        display: "flex",
        alignItems: "center",
        gap: 8,
        minWidth: 160
      }}
    >
      <span style={{ fontSize: 12, color: "#666" }}>{label}</span>
      <strong style={{ color }}>{value}</strong>
    </div>
  );
}

export default function KPIPanel() {
  const weldSeams = useStore((s) => s.weldSeams);
  const assemblySteps = useStore((s) => s.assemblySteps);
  const defects = useStore((s) => s.defects);

  const stats = useMemo(() => {
    // Weld seams
    const seamTotal = (weldSeams || []).length;
    const seamDone = (weldSeams || []).filter((s) => (s.status || "planned") === "done").length;
    const seamQA = (weldSeams || []).filter((s) => (s.status || "planned") === "qa").length;
    const seamWelding = (weldSeams || []).filter((s) => (s.status || "planned") === "welding").length;
    const seamPct = seamTotal > 0 ? Math.round((seamDone / seamTotal) * 100) : 0;

    // Assembly steps
    const steps = assemblySteps || [];
    const stepTotal = steps.length;
    const stepDone = steps.filter((st) => (st.status || "pending") === "done").length;
    const stepInProgress = steps.filter((st) => (st.status || "pending") === "in_progress").length;
    const stepPct = stepTotal > 0 ? Math.round((stepDone / stepTotal) * 100) : 0;

    // Durations (actuals)
    const finished = steps.filter(
      (st) => Number.isFinite(st.startedAt) && Number.isFinite(st.finishedAt) && st.finishedAt > st.startedAt
    );
    const durationsSec = finished.map((st) => (st.finishedAt - st.startedAt) / 1000);
    const avgStepSec = durationsSec.length ? durationsSec.reduce((a, b) => a + b, 0) / durationsSec.length : 0;

    // WIP ages
    const now = Date.now();
    const wip = steps.filter((st) => (st.status || "pending") === "in_progress" && Number.isFinite(st.startedAt));
    const wipAgesMin = wip.map((st) => (now - st.startedAt) / 60000);
    const maxWipMin = wipAgesMin.length ? Math.max(...wipAgesMin) : 0;

    // Bottleneck (simple heuristic): part with max total finished duration
    const sumByPart = {};
    finished.forEach((st) => {
      const key = st.partName || "part";
      const sec = (st.finishedAt - st.startedAt) / 1000;
      sumByPart[key] = (sumByPart[key] || 0) + sec;
    });
    const bottleneckPart =
      Object.keys(sumByPart).length > 0
        ? Object.entries(sumByPart)
            .sort((a, b) => b[1] - a[1])
            .map(([k, v]) => `${k} (${(v / 60).toFixed(1)} dk)`)[0]
        : "-";

    // Defects
    const defectTotal = (defects || []).length;
    const defectCritical = (defects || []).filter((d) => (d.severity || "minor") === "critical").length;

    return {
      seamTotal,
      seamDone,
      seamQA,
      seamWelding,
      seamPct,
      stepTotal,
      stepDone,
      stepInProgress,
      stepPct,
      avgStepMin: (avgStepSec / 60) || 0,
      maxWipMin: maxWipMin || 0,
      bottleneckPart,
      defectTotal,
      defectCritical
    };
  }, [weldSeams, assemblySteps, defects]);

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 10,
        padding: "8px 10px",
        background: "#fff",
        border: "1px solid #eee",
        borderRadius: 8,
        marginBottom: 10
      }}
    >
      <Pill
        label="Dikiş Tamamlanma"
        value={`${stats.seamPct}% (${stats.seamDone}/${stats.seamTotal})`}
        color="#2ecc71"
      />
      <Pill label="Kaynakta / Kalitede" value={`${stats.seamWelding} / ${stats.seamQA}`} color="#e67e22" />
      <Pill
        label="Montaj Tamamlanma"
        value={`${stats.stepPct}% (${stats.stepDone}/${stats.stepTotal})`}
        color="#3498db"
      />
      <Pill label="Devam Eden Adım" value={`${stats.stepInProgress}`} color="#9b59b6" />
      <Pill
        label="Ort. Adım Süresi"
        value={`${stats.avgStepMin.toFixed(1)} dk`}
        color="#34495e"
      />
      <Pill
        label="En Uzun Devam Eden"
        value={`${stats.maxWipMin.toFixed(1)} dk`}
        color="#8e44ad"
      />
      <Pill label="Darboğaz (parça)" value={stats.bottleneckPart} color="#d35400" />
      <Pill label="Kusur (kritik)" value={`${stats.defectTotal} (${stats.defectCritical})`} color="#c0392b" />
    </div>
  );
}