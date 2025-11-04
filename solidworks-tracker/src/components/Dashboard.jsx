import React, { useEffect, useMemo, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import * as THREE from 'three';

// Lightweight 3D preview used inside Director Dashboard
function Preview3D({ modelUrl, explosionFactor = 0.0, onReadyGL }) {
  const groupRef = useRef();
  const { scene } = useGLTF(modelUrl);
  const centerRef = useRef(new THREE.Vector3(0, 0, 0));
  const sizeRef = useRef(1);
  const originals = useRef(new Map()); // mesh.uuid -> THREE.Vector3

  // Attach scene once and compute center/size/original positions
  useEffect(() => {
    if (!groupRef.current || !scene) return;

    // Clear and attach fresh scene
    try {
      groupRef.current.clear();
    } catch {}
    try {
      groupRef.current.add(scene);
    } catch {}

    // Compute bounding box center and characteristic size
    try {
      const box = new THREE.Box3().setFromObject(scene);
      if (!box.isEmpty()) {
        const c = box.getCenter(new THREE.Vector3());
        centerRef.current.copy(c);
        const s = box.getSize(new THREE.Vector3());
        sizeRef.current = Math.max(0.001, Math.max(s.x, s.y, s.z));
      }
    } catch {
      centerRef.current.set(0, 0, 0);
      sizeRef.current = 1;
    }

    // Cache original positions for meshes
    try {
      originals.current.clear();
      scene.traverse((n) => {
        if (!n.isMesh) return;
        if (!originals.current.has(n.uuid)) originals.current.set(n.uuid, n.position.clone());
      });
    } catch {}
  }, [scene]);

  // Apply exploded view based on explosionFactor
  useEffect(() => {
    const root = groupRef.current;
    if (!root || !scene) return;
    const amount = Math.max(0, Math.min(1, Number(explosionFactor) || 0)) * sizeRef.current * 0.6;
    try {
      scene.traverse((n) => {
        if (!n.isMesh) return;
        const orig = originals.current.get(n.uuid);
        if (!orig) return;
        const dir = orig.clone().sub(centerRef.current);
        if (dir.lengthSq() < 1e-8) {
          n.position.copy(orig);
        } else {
          dir.normalize();
          n.position.copy(orig).addScaledVector(dir, amount);
        }
      });
    } catch {}
  }, [explosionFactor, scene]);

  return (
    <group ref={groupRef} />
  );
}

function Dashboard({ onBack }) {
  // Filters and live summary from backend
  const [filters, setFilters] = useState({
    projectNo: '',
    partCode: '',
    assemblyStatus: '',
    dateFrom: '',
    dateTo: ''
  });
  const [summary, setSummary] = useState({
    statusCounts: { tezgahta: 0, tamamlandi: 0, kalitede: 0, siparis: 0, stokta: 0, beklemede: 0, fason: 0 },
    overduePartsCount: 0,
    overdueParts: [],
    kpi: { missingPartsCount: 0, dailyAssemblyRate: 0, avgCompletionHours: null }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Projects and 3D preview selection (for Exploded view + Playbook)
  const [projects, setProjects] = useState([]);
  const [projLoading, setProjLoading] = useState(false);
  const [projError, setProjError] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [selectedModelUrl, setSelectedModelUrl] = useState('');
  const [explosionFactor, setExplosionFactor] = useState(0.0);
  const glRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setProjLoading(true);
      setProjError('');
      try {
        const resp = await fetch('/api/projects', { method: 'GET' });
        if (!resp.ok) throw new Error(`Projeler yüklenemedi (HTTP ${resp.status})`);
        const data = await resp.json();
        const items = Array.isArray(data.items) ? data.items : [];
        if (!cancelled) {
          setProjects(items);
          if (items.length > 0) {
            setSelectedProjectId(items[0].id);
            setSelectedModelUrl(items[0].modelUrl || '');
          }
        }
      } catch (e) {
        if (!cancelled) setProjError(String(e.message || e));
      } finally {
        if (!cancelled) setProjLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const selectedProject = useMemo(() => {
    if (!selectedProjectId) return null;
    return projects.find(p => String(p.id) === String(selectedProjectId)) || null;
  }, [projects, selectedProjectId]);

  const handleProjectChange = (id) => {
    setSelectedProjectId(id);
    const p = projects.find(x => String(x.id) === String(id));
    setSelectedModelUrl(p?.modelUrl || '');
  };

  const exportPlaybookPDF = () => {
    try {
      const canvas = glRef.current?.domElement || document.querySelector('canvas');
      const snapshot = (() => {
        try { return canvas ? canvas.toDataURL('image/png') : ''; } catch { return ''; }
      })();

      const title = 'Montaj Talimatı ve Önizleme';
      const now = new Date();
      const proj = selectedProject ? `${selectedProject.id} — ${selectedProject.name}` : '—';

      const html = `
        <!doctype html>
        <html lang="tr">
        <head>
          <meta charset="utf-8" />
          <title>${title}</title>
          <meta name="viewport" content="width=device-width,initial-scale=1" />
          <style>
            body { font-family: Arial, sans-serif; color:#222; margin:16px; }
            h2,h3 { margin: 8px 0; }
            .meta { font-size:12px; color:#666; margin-bottom:10px; }
            .row { display:flex; gap:12px; flex-wrap:wrap; }
            .card { border:1px solid #ddd; border-radius:8px; padding:10px; background:#fff; flex:1; min-width:260px; }
            table { width:100%; border-collapse:collapse; }
            th, td { border:1px solid #ddd; padding:6px; font-size:12px; }
            thead { background:#f7f7f7; }
            .imgwrap { border:1px solid #eee; border-radius:6px; padding:6px; display:inline-block; }
            @media print { .no-print { display:none; } }
          </style>
        </head>
        <body>
          <div class="no-print" style="text-align:right;margin-bottom:8px">
            <button onclick="window.print()">Yazdır / PDF</button>
          </div>
          <h2>${title}</h2>
          <div class="meta">${now.toLocaleString('tr-TR')}</div>

          <div class="row">
            <div class="card">
              <h3>Proje</h3>
              <div><strong>ID/Ad:</strong> ${proj}</div>
              <div><strong>Model:</strong> ${selectedModelUrl || '—'}</div>
              <div><strong>Exploded:</strong> ${(explosionFactor || 0).toFixed(3)}</div>
            </div>
            <div class="card">
              <h3>KPI</h3>
              <table>
                <thead><tr><th>Metrix</th><th>Değer</th></tr></thead>
                <tbody>
                  <tr><td>Eksik Parça</td><td>${Number(summary?.kpi?.missingPartsCount || 0)}</td></tr>
                  <tr><td>Günlük Montaj Hızı</td><td>${Number(summary?.kpi?.dailyAssemblyRate || 0)}</td></tr>
                  <tr><td>Ort. Tamamlama (saat)</td><td>${summary?.kpi?.avgCompletionHours ?? 'N/A'}</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <div style="margin-top:12px" class="card">
            <h3>3D Anlık Görünüm</h3>
            ${snapshot ? `<div class="imgwrap"><img alt="snapshot" src="${snapshot}" style="max-width:100%;"/></div>` : '<div>Görüntü alınamadı.</div>'}
          </div>

          <div style="margin-top:12px" class="card">
            <h3>Filtreler</h3>
            <table>
              <tbody>
                <tr><td>Proje No</td><td>${filters.projectNo || '—'}</td></tr>
                <tr><td>Parça Kodu</td><td>${filters.partCode || '—'}</td></tr>
                <tr><td>Montaj Durumu</td><td>${filters.assemblyStatus || '—'}</td></tr>
                <tr><td>Tarih (Başlangıç)</td><td>${filters.dateFrom || '—'}</td></tr>
                <tr><td>Tarih (Bitiş)</td><td>${filters.dateTo || '—'}</td></tr>
              </tbody>
            </table>
          </div>
        </body>
        </html>
      `;

      const w = window.open('', '_blank');
      if (w) {
        w.document.open();
        w.document.write(html);
        w.document.close();
        w.focus();
        setTimeout(() => { try { w.print(); } catch {} }, 350);
      } else {
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'playbook.html';
        document.body.appendChild(a); a.click();
        setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 0);
      }
    } catch (e) {
      alert(`PDF eksportu başarısız: ${String(e.message || e)}`);
    }
  };

  // Onaylar (direktör onayı) durumu
  const [approvals, setApprovals] = useState([]);
  const [loadingApprovals, setLoadingApprovals] = useState(false);
  const [approvalsError, setApprovalsError] = useState('');
  const [adminKey, setAdminKey] = useState(() => {
    try { return localStorage.getItem('adminKey') || ''; } catch { return ''; }
  });
  useEffect(() => {
    try { localStorage.setItem('adminKey', adminKey); } catch {}
  }, [adminKey]);

  // Audit (onay geçmişi) durumu
  const [auditItems, setAuditItems] = useState([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [auditError, setAuditError] = useState('');
  const [auditFilterPart, setAuditFilterPart] = useState('');

  const buildQuery = () => {
    const p = new URLSearchParams();
    if (filters.projectNo) p.set('projectNo', filters.projectNo);
    if (filters.partCode) p.set('partCode', filters.partCode);
    if (filters.assemblyStatus) p.set('assemblyStatus', filters.assemblyStatus);
    if (filters.dateFrom) p.set('dateFrom', filters.dateFrom);
    if (filters.dateTo) p.set('dateTo', filters.dateTo);
    return p.toString();
  };

  const fetchSummary = async () => {
    setLoading(true);
    setError('');
    try {
      const qs = buildQuery();
      const resp = await fetch(`/api/summary${qs ? `?${qs}` : ''}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      const sc = data.statusCounts || {};
      setSummary({
        statusCounts: {
          tezgahta: Number(sc.tezgahta || 0),
          tamamlandi: Number(sc.tamamlandi || 0),
          kalitede: Number(sc.kalitede || 0),
          siparis: Number(sc.siparis || 0),
          stokta: Number(sc.stokta || 0),
          beklemede: Number(sc.beklemede || 0),
          fason: Number(sc.fason || 0)
        },
        overduePartsCount: Number(data.overduePartsCount || 0),
        overdueParts: Array.isArray(data.overdueParts) ? data.overdueParts : [],
        kpi: {
          missingPartsCount: Number(data?.kpi?.missingPartsCount || 0),
          dailyAssemblyRate: Number(data?.kpi?.dailyAssemblyRate || 0),
          avgCompletionHours: data?.kpi?.avgCompletionHours ?? null
        }
      });
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  };

  // Onay taleplerini çek
  const fetchApprovals = async () => {
    setLoadingApprovals(true);
    setApprovalsError('');
    try {
      const resp = await fetch('/api/approvals?status=pending', { method: 'GET' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      const items = Array.isArray(data.items) ? data.items : [];
      setApprovals(items);
    } catch (e) {
      setApprovalsError(String(e.message || e));
    } finally {
      setLoadingApprovals(false);
    }
  };

  const fmtDate = (ms) => {
    try { return new Date(Number(ms) || 0).toLocaleString('tr-TR'); } catch { return ''; }
  };

  // Onay geçmişini çek
  const fetchAudit = async () => {
    setLoadingAudit(true);
    setAuditError('');
    try {
      const qs = auditFilterPart ? `?partName=${encodeURIComponent(auditFilterPart)}` : '';
      const resp = await fetch(`/api/audit${qs}`, { method: 'GET' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      const items = Array.isArray(data.items) ? data.items : [];
      setAuditItems(items);
    } catch (e) {
      setAuditError(String(e.message || e));
    } finally {
      setLoadingAudit(false);
    }
  };

  const approveItem = async (id) => {
    if (!adminKey) { alert('Admin anahtarı gerekli'); return; }
    try {
      const resp = await fetch(`/api/approvals/${encodeURIComponent(id)}/approve`, {
        method: 'POST',
        headers: { 'x-admin-key': adminKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ by: 'admin' })
      });
      if (!resp.ok) {
        const t = await resp.text().catch(() => '');
        alert(`Onay hatası: ${t || resp.status}`);
        return;
      }
      // Başarı -> listeden düşür
      setApprovals(prev => prev.filter(x => x.id !== id));
    } catch (e) {
      alert(`Onay hatası: ${String(e.message || e)}`);
    }
  };

  const rejectItem = async (id) => {
    if (!adminKey) { alert('Admin anahtarı gerekli'); return; }
    try {
      const resp = await fetch(`/api/approvals/${encodeURIComponent(id)}/reject`, {
        method: 'POST',
        headers: { 'x-admin-key': adminKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ by: 'admin' })
      });
      if (!resp.ok) {
        const t = await resp.text().catch(() => '');
        alert(`Red hatası: ${t || resp.status}`);
        return;
      }
      setApprovals(prev => prev.filter(x => x.id !== id));
    } catch (e) {
      alert(`Red hatası: ${String(e.message || e)}`);
    }
  };

  useEffect(() => { fetchSummary(); fetchApprovals(); fetchAudit(); }, []);

  // Realtime: Socket.IO ile canlı güncellemeler
  useEffect(() => {
    const s = io();
    const onRecords = () => { try { fetchSummary(); } catch {} };
    const onApprovals = () => { try { fetchApprovals(); } catch {} };
    const onAudit = () => { try { fetchAudit(); } catch {} };

    s.on('records:updated', onRecords);
    s.on('approvals:updated', onApprovals);
    s.on('audit:updated', onAudit);

    return () => {
      try {
        s.off('records:updated', onRecords);
        s.off('approvals:updated', onApprovals);
        s.off('audit:updated', onAudit);
        s.close();
      } catch {}
    };
  }, []);

  const statusEntries = useMemo(
    () => Object.entries(summary.statusCounts),
    [summary.statusCounts]
  );
  const totalParts = useMemo(
    () => statusEntries.reduce((acc, [, c]) => acc + Number(c || 0), 0),
    [statusEntries]
  );
  const completed = useMemo(() => Number(summary.statusCounts.tamamlandi || 0), [summary.statusCounts]);
  const completionPct = useMemo(
    () => (totalParts > 0 ? (completed / totalParts) * 100 : 0),
    [completed, totalParts]
  );

  // Animated counters
  const [animatedCounts, setAnimatedCounts] = useState(
    Object.fromEntries(statusEntries.map(([k]) => [k, 0]))
  );
  const [animatedOverdue, setAnimatedOverdue] = useState(0);
  const [animatedCompletion, setAnimatedCompletion] = useState(0);

  useEffect(() => {
    let raf;
    const duration = 800; // ms
    const start = performance.now();
    const target = Object.fromEntries(statusEntries.map(([k, v]) => [k, Number(v || 0)]));
    const targetOverdue = Number(summary.overduePartsCount || 0);
    const targetCompl = completionPct;

    const tick = (t) => {
      const p = Math.min(1, (t - start) / duration);
      const ease = 1 - Math.pow(1 - p, 3);
      const next = {};
      for (const [k, v] of Object.entries(target)) {
        next[k] = Math.round(v * ease);
      }
      setAnimatedCounts(next);
      setAnimatedOverdue(Math.round(targetOverdue * ease));
      setAnimatedCompletion(targetCompl * ease);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [statusEntries, summary.overduePartsCount, completionPct]);

  // Colors for statuses
  const colors = {
    tezgahta: '#e67e22',
    tamamlandi: '#2ecc71',
    kalitede: '#3498db',
    siparis: '#8e44ad',
    stokta: '#27ae60',
    beklemede: '#f1c40f',
    fason: '#c0392b'
  };

  return (
    <div style={{ padding: 20, backgroundColor: '#f4f6f9', height: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Top bar with Back */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button
          onClick={onBack}
          title="Geri dön"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid #d0d0d0',
            background: '#ffffff',
            cursor: 'pointer'
          }}
        >
          <span style={{ fontSize: 16 }}>⬅</span>
          <span>Geri</span>
        </button>

        <h2 style={{ color: '#2c3e50', margin: 0 }}>Genel Bakış Raporu</h2>

        <div style={{ width: 90 }} /> {/* spacer to balance layout */}
      </div>

      {/* Filters + KPI */}
      {error && (
        <div style={{ padding: 10, border: '1px solid #ffcccc', background: '#fff6f6', color: '#c0392b', borderRadius: 8 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', background: '#fff', padding: 12, border: '1px solid #eee', borderRadius: 8 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 12, color: '#555' }}>Proje No</label>
          <input
            type="text"
            value={filters.projectNo}
            onChange={(e) => setFilters(prev => ({ ...prev, projectNo: e.target.value }))}
            placeholder="Örn: TTU-0911"
            style={{ padding: '6px 8px', border: '1px solid #ccc', borderRadius: 6, minWidth: 160 }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 12, color: '#555' }}>Parça Kodu</label>
          <input
            type="text"
            value={filters.partCode}
            onChange={(e) => setFilters(prev => ({ ...prev, partCode: e.target.value }))}
            placeholder="Parça kodu/adı"
            style={{ padding: '6px 8px', border: '1px solid #ccc', borderRadius: 6, minWidth: 180 }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 12, color: '#555' }}>Montaj Durumu</label>
          <select
            value={filters.assemblyStatus}
            onChange={(e) => setFilters(prev => ({ ...prev, assemblyStatus: e.target.value }))}
            style={{ padding: '6px 8px', border: '1px solid #ccc', borderRadius: 6, minWidth: 160, background: 'white' }}
          >
            <option value="">Tümü</option>
            <option value="tightened">Sıkıldı</option>
            <option value="removed">Söküldü</option>
            <option value="missing">Eksik</option>
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 12, color: '#555' }}>Tarih (Başlangıç)</label>
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => setFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
            style={{ padding: '6px 8px', border: '1px solid #ccc', borderRadius: 6 }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 12, color: '#555' }}>Tarih (Bitiş)</label>
          <input
            type="date"
            value={filters.dateTo}
            onChange={(e) => setFilters(prev => ({ ...prev, dateTo: e.target.value }))}
            style={{ padding: '6px 8px', border: '1px solid #ccc', borderRadius: 6 }}
          />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={fetchSummary}
            title="Filtreleri uygula"
            style={{ padding: '8px 12px', border: '1px solid #d0d0d0', borderRadius: 8, background: '#f7f7f7', cursor: 'pointer' }}
          >
            {loading ? 'Yükleniyor...' : 'Uygula'}
          </button>
          <button
            onClick={() => { setFilters({ projectNo: '', partCode: '', assemblyStatus: '', dateFrom: '', dateTo: '' }); setTimeout(fetchSummary, 0); }}
            title="Filtreleri temizle"
            style={{ padding: '8px 12px', border: '1px solid #d0d0d0', borderRadius: 8, background: '#fff', cursor: 'pointer' }}
          >
            Sıfırla
          </button>
        </div>
      </div>

      {/* KPI quick cards */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ ...cardStyle, padding: 12, minWidth: 220, flex: '0 1 220px' }}>
          <div style={{ fontSize: 12, color: '#7f8c8d' }}>Eksik Parça</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#c0392b' }}>{summary?.kpi?.missingPartsCount ?? 0}</div>
        </div>
        <div style={{ ...cardStyle, padding: 12, minWidth: 220, flex: '0 1 220px' }}>
          <div style={{ fontSize: 12, color: '#7f8c8d' }}>Günlük Montaj Hızı</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#34495e' }}>{summary?.kpi?.dailyAssemblyRate ?? 0}</div>
        </div>
        <div style={{ ...cardStyle, padding: 12, minWidth: 220, flex: '0 1 220px' }}>
          <div style={{ fontSize: 12, color: '#7f8c8d' }}>Ort. Tamamlama Süresi</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#34495e' }}>
            {Number.isFinite(summary?.kpi?.avgCompletionHours) && summary?.kpi?.avgCompletionHours !== null
              ? `${Number(summary.kpi.avgCompletionHours).toFixed(1)} saat`
              : 'N/A'}
          </div>
        </div>
      </div>

      {/* 3D Preview + Playbook */}
      <div style={{ ...cardStyle, marginTop: 12 }}>
        <h3 style={cardTitleStyle}>3D Önizleme ve Playbook</h3>

        {projError && (
          <div style={{ padding: 8, border: '1px solid #ffd6d6', background: '#fff6f6', color: '#c0392b', borderRadius: 6, marginBottom: 8 }}>
            {projError}
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, color: '#555' }}>Proje</label>
            <select
              value={selectedProjectId}
              onChange={(e) => handleProjectChange(e.target.value)}
              disabled={projLoading || projects.length === 0}
              style={{ padding: '6px 8px', border: '1px solid #ccc', borderRadius: 6, minWidth: 240, background: 'white' }}
            >
              {projects.length === 0 ? <option value="">—</option> : null}
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.id} — {p.name}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, color: '#555' }}>Exploded</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="range"
                min="0"
                max="1"
                step="0.005"
                value={explosionFactor}
                onChange={(e) => setExplosionFactor(parseFloat(e.target.value) || 0)}
              />
              <span style={{ fontSize: 12, color: '#555' }}>{(explosionFactor || 0).toFixed(3)}</span>
            </div>
          </div>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button
              onClick={exportPlaybookPDF}
              disabled={!selectedModelUrl}
              style={{ padding: '8px 12px', border: '1px solid #d0d0d0', borderRadius: 8, background: '#e8f2ff', cursor: selectedModelUrl ? 'pointer' : 'not-allowed' }}
              title="3D snapshot + KPI'lar ile PDF"
            >
              Playbook PDF
            </button>
          </div>
        </div>

        <div style={{ marginTop: 10, height: 360, border: '1px solid #eee', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
          {selectedModelUrl ? (
            <Canvas
              camera={{ position: [0, 1.5, 7], fov: 50 }}
              dpr={[1, 2]}
              gl={{
                antialias: true,
                powerPreference: 'high-performance',
                alpha: false,
                preserveDrawingBuffer: true
              }}
              onCreated={({ gl }) => { try { glRef.current = gl; gl.setClearColor(0xffffff, 1); } catch {} }}
            >
              <ambientLight intensity={0.35} />
              <directionalLight position={[10, 15, 10]} intensity={0.9} />
              <OrbitControls enableDamping dampingFactor={0.1} rotateSpeed={0.7} zoomSpeed={1.2} panSpeed={0.8} />
              <React.Suspense fallback={null}>
                <Preview3D modelUrl={selectedModelUrl} explosionFactor={explosionFactor} />
              </React.Suspense>
            </Canvas>
          ) : (
            <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: '#777' }}>
              Görüntülenecek model seçin.
            </div>
          )}
        </div>
      </div>

      {/* Onaylar Paneli */}
      <div style={{ ...cardStyle, marginTop: 12 }}>
        <h3 style={cardTitleStyle}>Onaylar</h3>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
          <input
            type="password"
            placeholder="Admin Anahtarı (x-admin-key)"
            value={adminKey}
            onChange={(e) => setAdminKey(e.target.value)}
            style={{ padding: '6px 8px', border: '1px solid #ccc', borderRadius: 6, minWidth: 220 }}
            title="Onay/Red için gerekli"
          />
          <button
            onClick={fetchApprovals}
            style={{ padding: '6px 10px', border: '1px solid #d0d0d0', borderRadius: 6, background: '#f7f7f7', cursor: 'pointer' }}
            title="Onay listesi yenile"
          >
            {loadingApprovals ? 'Yükleniyor...' : 'Yenile'}
          </button>
        </div>

        {approvalsError && (
          <div style={{ color: '#c0392b', background: '#fff6f6', border: '1px solid #ffd6d6', borderRadius: 6, padding: 8, marginBottom: 8 }}>
            {approvalsError}
          </div>
        )}

        <div style={{ maxHeight: 260, overflow: 'auto', border: '1px solid #eee', borderRadius: 6 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f7f7f7' }}>
                <th style={{ textAlign: 'left', padding: 6 }}>Parça</th>
                <th style={{ textAlign: 'left', padding: 6 }}>İşlem</th>
                <th style={{ textAlign: 'left', padding: 6 }}>İsteyen</th>
                <th style={{ textAlign: 'right', padding: 6, width: 160 }}>Tarih</th>
                <th style={{ textAlign: 'right', padding: 6, width: 160 }}>Onay</th>
              </tr>
            </thead>
            <tbody>
              {(approvals || []).length === 0 ? (
                <tr><td colSpan="5" style={{ padding: 8, color: '#777' }}>Bekleyen onay bulunmuyor</td></tr>
              ) : approvals.map((a) => (
                <tr key={a.id} style={{ borderTop: '1px solid #eee' }}>
                  <td style={{ padding: 6 }}>{a.partName}</td>
                  <td style={{ padding: 6 }}>
                    {a.action === 'tightened' ? 'Sıkıldı'
                      : a.action === 'removed' ? 'Söküldü'
                      : a.action === 'missing' ? 'Eksik'
                      : a.action}
                  </td>
                  <td style={{ padding: 6 }}>{a.requestedBy || '-'}</td>
                  <td style={{ padding: 6, textAlign: 'right' }}>{fmtDate(a.createdAt)}</td>
                  <td style={{ padding: 6, textAlign: 'right' }}>
                    <button
                      onClick={() => approveItem(a.id)}
                      disabled={!adminKey}
                      title="Onayla"
                      style={{ padding: '4px 8px', marginRight: 6, border: '1px solid #cdeccd', background: '#eaf9ea', borderRadius: 6, cursor: adminKey ? 'pointer' : 'not-allowed' }}
                    >
                      Onayla
                    </button>
                    <button
                      onClick={() => rejectItem(a.id)}
                      disabled={!adminKey}
                      title="Reddet"
                      style={{ padding: '4px 8px', border: '1px solid #ffd6d6', background: '#fff0f0', borderRadius: 6, cursor: adminKey ? 'pointer' : 'not-allowed' }}
                    >
                      Reddet
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Audit (Onay Geçmişi) */}
      <div style={{ ...cardStyle, marginTop: 12 }}>
        <h3 style={cardTitleStyle}>Onay Geçmişi</h3>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Parça adı ile filtrele (opsiyonel)"
            value={auditFilterPart}
            onChange={(e) => setAuditFilterPart(e.target.value)}
            style={{ padding: '6px 8px', border: '1px solid #ccc', borderRadius: 6, minWidth: 260 }}
          />
          <button
            onClick={fetchAudit}
            style={{ padding: '6px 10px', border: '1px solid #d0d0d0', borderRadius: 6, background: '#f7f7f7', cursor: 'pointer' }}
            title="Geçmişi yenile"
          >
            {loadingAudit ? 'Yükleniyor...' : 'Yenile'}
          </button>
        </div>

        {auditError && (
          <div style={{ color: '#c0392b', background: '#fff6f6', border: '1px solid #ffd6d6', borderRadius: 6, padding: 8, marginBottom: 8 }}>
            {auditError}
          </div>
        )}

        <div style={{ maxHeight: 260, overflow: 'auto', border: '1px solid #eee', borderRadius: 6 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f7f7f7' }}>
                <th style={{ textAlign: 'left', padding: 6 }}>Parça</th>
                <th style={{ textAlign: 'left', padding: 6 }}>İşlem</th>
                <th style={{ textAlign: 'left', padding: 6 }}>İsteyen</th>
                <th style={{ textAlign: 'left', padding: 6 }}>Durum</th>
                <th style={{ textAlign: 'right', padding: 6, width: 160 }}>Talep</th>
                <th style={{ textAlign: 'right', padding: 6, width: 160 }}>Karar</th>
              </tr>
            </thead>
            <tbody>
              {(auditItems || []).length === 0 ? (
                <tr><td colSpan="6" style={{ padding: 8, color: '#777' }}>Kayıt yok</td></tr>
              ) : auditItems.map((a) => (
                <tr key={a.id} style={{ borderTop: '1px solid #eee' }}>
                  <td style={{ padding: 6 }}>{a.partName}</td>
                  <td style={{ padding: 6 }}>
                    {a.action === 'tightened' ? 'Sıkıldı'
                      : a.action === 'removed' ? 'Söküldü'
                      : a.action === 'missing' ? 'Eksik'
                      : a.action}
                  </td>
                  <td style={{ padding: 6 }}>{a.requestedBy || '-'}</td>
                  <td style={{ padding: 6 }}>{a.status || '-'}</td>
                  <td style={{ padding: 6, textAlign: 'right' }}>{fmtDate(a.createdAt)}</td>
                  <td style={{ padding: 6, textAlign: 'right' }}>{a.decidedAt ? fmtDate(a.decidedAt) : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Charts row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
        {/* Animated Bars */}
        <div style={cardStyle}>
          <h3 style={cardTitleStyle}>Parça Durumları</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {statusEntries.map(([status, count]) => {
              const max = Math.max(1, ...statusEntries.map(([, c]) => Number(c || 0)));
              const pct = max > 0 ? (animatedCounts[status] / max) * 100 : 0;
              return (
                <div key={status} style={{ display: 'grid', gridTemplateColumns: '140px 1fr 60px', gap: 10, alignItems: 'center' }}>
                  <div style={{ color: '#34495e', textTransform: 'capitalize', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </div>
                  <div style={{ background: '#ecf0f1', height: 12, borderRadius: 6, overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${pct.toFixed(2)}%`,
                        height: '100%',
                        background: colors[status] || '#95a5a6',
                        transition: 'width 400ms ease'
                      }}
                    />
                  </div>
                  <div style={{ textAlign: 'right', color: '#2c3e50', minWidth: 40 }}>{animatedCounts[status]}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Donut + Overdue list */}
        <div style={{ ...cardStyle, minWidth: 320, flex: '0 1 360px' }}>
          <h3 style={cardTitleStyle}>Tamamlanma Oranı</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <Donut value={animatedCompletion} size={140} thickness={14} color="#2ecc71" bg="#ecf0f1" />
            <div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#2c3e50' }}>{animatedCompletion.toFixed(0)}%</div>
              <div style={{ color: '#7f8c8d' }}>{completed}/{totalParts} tamamlandı</div>
            </div>
          </div>

          <div style={{ marginTop: 18 }}>
            <h4 style={{ margin: '0 0 10px 0', color: '#34495e' }}>Geciken Parçalar</h4>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: '2rem', fontWeight: 'bold', color: '#e74c3c' }}>{animatedOverdue}</span>
              <span style={{ color: '#7f8c8d' }}>adet</span>
            </div>

            {summary.overdueParts && summary.overdueParts.length > 0 && (
              <ul style={{ ...listStyle, maxHeight: 150, overflowY: 'auto', marginTop: 8 }}>
                {summary.overdueParts.map((part) => (
                  <li key={part.name} style={listItemStyle}>
                    <span>{part.name}</span>
                    <span style={{ color: '#c0392b' }}>{new Date(part.dueDate).toLocaleDateString('tr-TR')}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* Donut Chart (pure SVG) */
function Donut({ value = 0, size = 140, thickness = 12, color = '#2ecc71', bg = '#ecf0f1' }) {
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, value));
  const offset = circumference * (1 - clamped / 100);

  return (
    <svg width={size} height={size} style={{ display: 'block' }}>
      <g transform={`translate(${size / 2}, ${size / 2})`}>
        <circle
          r={radius}
          cx="0"
          cy="0"
          stroke={bg}
          strokeWidth={thickness}
          fill="none"
        />
        <circle
          r={radius}
          cx="0"
          cy="0"
          stroke={color}
          strokeWidth={thickness}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 400ms ease' }}
          transform="rotate(-90)"
        />
        <text
          x="0"
          y="6"
          textAnchor="middle"
          style={{ fontSize: 18, fontWeight: 700, fill: '#2c3e50' }}
        >
          {clamped.toFixed(0)}%
        </text>
      </g>
    </svg>
  );
}

// Styles
const cardStyle = {
  backgroundColor: 'white',
  padding: '20px',
  borderRadius: '8px',
  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  flex: 1,
  minWidth: '360px'
};

const cardTitleStyle = {
  margin: '0 0 15px 0',
  color: '#34495e',
  borderBottom: '1px solid #ecf0f1',
  paddingBottom: '10px'
};

const listStyle = {
  listStyleType: 'none',
  padding: 0,
  margin: 0
};

const listItemStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  padding: '8px 0',
  borderBottom: '1px solid #f5f5f5'
};

export default Dashboard;