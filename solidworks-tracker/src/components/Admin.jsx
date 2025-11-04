import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { io } from 'socket.io-client';

const Admin = ({ user, onBack }) => {
  const [adminKey, setAdminKey] = useState(() => {
    try { return localStorage.getItem('adminKey') || ''; } catch { return ''; }
  });
  useEffect(() => { try { localStorage.setItem('adminKey', adminKey); } catch {} }, [adminKey]);

  const authorized = useMemo(() => !!adminKey && user && String(user.role||'').toLowerCase()==='admin', [adminKey, user]);

  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);

  // Projects (Proje) management state
  const [projects, setProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [pId, setPId] = useState('');
  const [pName, setPName] = useState('');
  const [pTracker, setPTracker] = useState('');
  const [pModelUrl, setPModelUrl] = useState('');
  const [pDescription, setPDescription] = useState('');
  const [deleteFileToo, setDeleteFileToo] = useState(false);

  // Versioning state
  const [versProjectId, setVersProjectId] = useState('');
  const [versions, setVersions] = useState([]);
  const [loadingVersions, setLoadingVersions] = useState(false);

  // Shares (Client Portal) state
  const [shares, setShares] = useState([]);
  const [loadingShares, setLoadingShares] = useState(false);
  const [shareProjectId, setShareProjectId] = useState('');
  const [shareModelUrl, setShareModelUrl] = useState('');
  const [shareTtlHours, setShareTtlHours] = useState(24);
  const [shareSingleUse, setShareSingleUse] = useState(true);
  const [shareMaxUses, setShareMaxUses] = useState(0);
  const [shareScope, setShareScope] = useState('view'); // 'view' | 'annotate'
  const [shareNote, setShareNote] = useState('');
  const [createdShareUrl, setCreatedShareUrl] = useState('');
 
  const formatBytes = (b) => {
    try {
      const u=['B','KB','MB','GB']; let i=0; let v=Number(b)||0;
      while(v>=1024 && i<u.length-1){ v/=1024; i++; }
      return `${v.toFixed(1)} ${u[i]}`;
    } catch { return String(b||0); }
  };
  const formatDate = (ms) => { try { return new Date(Number(ms)||0).toLocaleString('tr-TR'); } catch { return ''; } };

  const refresh = useCallback(async () => {
    if(!authorized) return;
    setLoading(true); setError('');
    try{
      const resp = await fetch('/api/models',{ headers:{'x-admin-key':adminKey}});
      if(!resp.ok) throw new Error(`Listeleme başarısız: ${resp.status}`);
      const data = await resp.json();
      setModels(Array.isArray(data.items)?data.items:[]);
    }catch(e){ setError(String(e.message||e)); }
    finally{ setLoading(false); }
  },[authorized, adminKey]);

  useEffect(()=>{ refresh(); },[refresh]);

  // ---- Projects API helpers ----
  const loadProjects = useCallback(async () => {
    if (!authorized) return;
    setLoadingProjects(true);
    try {
      const resp = await fetch('/api/projects');
      if (!resp.ok) throw new Error(`Proje listeleme başarısız: ${resp.status}`);
      const data = await resp.json();
      setProjects(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoadingProjects(false);
    }
  }, [authorized]);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  // Socket.IO: projects & versions canlı güncellemeleri
  useEffect(() => {
    const s = io();
    const onProjects = () => { try { loadProjects(); } catch {} };
    const onVersions = (payload) => {
      try {
        if (payload && payload.projectId && payload.projectId === versProjectId) {
          fetchVersions();
        }
      } catch {}
    };
    s.on('projects:updated', onProjects);
    s.on('versions:updated', onVersions);
    return () => {
      try {
        s.off('projects:updated', onProjects);
        s.off('versions:updated', onVersions);
        s.close();
      } catch {}
    };
  }, [loadProjects, versProjectId]);
 
  const createProject = useCallback(async () => {
    if (!authorized) return;
    const id = (pId || '').trim();
    const name = (pName || '').trim();
    const tracker = (pTracker || '').trim();
    const modelUrl = (pModelUrl || '').trim();
    const description = (pDescription || '').trim();
    if (!id || !name || !tracker || !modelUrl) {
      setError('Lütfen id, ad, takipçi ve model alanlarını doldurun');
      return;
    }
    setError('');
    try {
      const resp = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify({ id, name, tracker, modelUrl, description })
      });
      if (!resp.ok) {
        const t = await resp.text().catch(()=> '');
        throw new Error(t || `Proje kaydetme hatası: ${resp.status}`);
      }
      await loadProjects();
      setPId(''); setPName(''); setPTracker(''); setPModelUrl(''); setPDescription('');
    } catch (e) {
      setError(String(e.message || e));
    }
  }, [authorized, adminKey, pId, pName, pTracker, pModelUrl, pDescription, loadProjects]);

  const removeProject = useCallback(async (id) => {
    if (!authorized || !id) return;
    setError('');
    try {
      const resp = await fetch(`/api/projects/${encodeURIComponent(id)}?deleteFile=${deleteFileToo ? 1 : 0}`, {
        method: 'DELETE',
        headers: { 'x-admin-key': adminKey }
      });
      if (!resp.ok) {
        const t = await resp.text().catch(()=> '');
        throw new Error(t || `Proje silme hatası: ${resp.status}`);
      }
      await loadProjects();
    } catch (e) {
      setError(String(e.message || e));
    }
  }, [authorized, adminKey, deleteFileToo, loadProjects]);
  // ---- Versions API helpers ----
  const fetchVersions = useCallback(async () => {
    if (!authorized || !versProjectId) return;
    setLoadingVersions(true);
    try {
      const resp = await fetch(`/api/projects/${encodeURIComponent(versProjectId)}/versions`);
      if (!resp.ok) throw new Error(`Sürüm listeleme hatası: ${resp.status}`);
      const data = await resp.json();
      setVersions(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoadingVersions(false);
    }
  }, [authorized, versProjectId]);

  const setActiveModelForProject = useCallback(async () => {
    if (!authorized) return;
    const id = (versProjectId || '').trim();
    const modelUrl = (pModelUrl || '').trim();
    if (!id || !modelUrl) { setError('Lütfen proje ve model seçin'); return; }
    try {
      const resp = await fetch(`/api/projects/${encodeURIComponent(id)}/set-model`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify({ modelUrl, by: user?.name || 'admin' })
      });
      if (!resp.ok) {
        const t = await resp.text().catch(()=> '');
        throw new Error(t || `Aktif model hatası: ${resp.status}`);
      }
      await loadProjects();
      await fetchVersions();
    } catch (e) {
      setError(String(e.message || e));
    }
  }, [authorized, adminKey, user, versProjectId, pModelUrl, loadProjects, fetchVersions]);

  const rollbackVersion = useCallback(async (index) => {
    if (!authorized) return;
    const id = (versProjectId || '').trim();
    if (!id) { setError('Önce proje seçin'); return; }
    try {
      const resp = await fetch(`/api/projects/${encodeURIComponent(id)}/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify({ index })
      });
      if (!resp.ok) {
        const t = await resp.text().catch(()=> '');
        throw new Error(t || `Rollback hatası: ${resp.status}`);
      }
      await loadProjects();
      await fetchVersions();
    } catch (e) {
      setError(String(e.message || e));
    }
  }, [authorized, adminKey, versProjectId, loadProjects, fetchVersions]);

  // ---- Shares API helpers ----
  const loadShares = useCallback(async () => {
    if (!authorized) return;
    setLoadingShares(true);
    try {
      const resp = await fetch('/api/shares', { headers: { 'x-admin-key': adminKey } });
      if (!resp.ok) throw new Error(`Paylaşım listeleme hatası: ${resp.status}`);
      const data = await resp.json();
      setShares(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoadingShares(false);
    }
  }, [authorized, adminKey]);

  const createShare = useCallback(async () => {
    if (!authorized) return;
    const pid = (shareProjectId || '').trim();
    if (!pid) { setError('Lütfen proje seçin'); return; }
    setError('');
    setCreatedShareUrl('');
    try {
      let modelUrl = (shareModelUrl || '').trim();
      if (modelUrl && !modelUrl.startsWith('/models/')) {
        modelUrl = `/models/${modelUrl}`;
      }
      const payload = {
        projectId: pid,
        scope: shareScope,
        ttlHours: Number(shareTtlHours) > 0 ? Number(shareTtlHours) : 24,
        singleUse: !!shareSingleUse,
        maxUses: shareSingleUse ? 1 : Math.max(0, Number(shareMaxUses) || 0),
        note: shareNote || undefined
      };
      if (modelUrl) payload.modelUrl = modelUrl;

      const resp = await fetch('/api/shares', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify(payload)
      });
      if (!resp.ok) {
        const t = await resp.text().catch(()=> '');
        throw new Error(t || `Paylaşım oluşturma hatası: ${resp.status}`);
      }
      const data = await resp.json();
      await loadShares();
      const url = data?.url || (data?.item?.token ? `/p/${data.item.token}` : '');
      if (url) {
        try { setCreatedShareUrl(`${window.location.origin}${url}`); } catch { setCreatedShareUrl(url); }
      }
    } catch (e) {
      setError(String(e.message || e));
    }
  }, [authorized, adminKey, shareProjectId, shareModelUrl, shareTtlHours, shareSingleUse, shareMaxUses, shareScope, shareNote, loadShares]);

  useEffect(() => { loadShares(); }, [loadShares]);

  // Socket.IO: shares canlı güncellemeleri
  useEffect(() => {
    const s = io();
    const onShares = () => { try { loadShares(); } catch {} };
    s.on('shares:updated', onShares);
    return () => {
      try {
        s.off('shares:updated', onShares);
        s.close();
      } catch {}
    };
  }, [loadShares]);

  const handleUploadFiles = useCallback(async (files) => {
    if(!authorized || !files || files.length===0) return;
    setUploading(true); setError('');
   try{
     for(const f of files){
       const fd = new FormData();
       fd.append('file', f);
       const resp = await fetch('/api/models/upload',{ method:'POST', headers:{'x-admin-key':adminKey}, body:fd });
       if(!resp.ok){
         const t=await resp.text().catch(()=> '');
         throw new Error(t||`Yükleme hatası: ${resp.status}`);
       }
     }
     await refresh();
   }catch(e){ setError(String(e.message||e)); }
   finally{ setUploading(false); setDragOver(false); }
  },[authorized, adminKey, refresh]);

  const deleteModel = useCallback(async (name) => {
    if(!authorized || !name) return;
    setError('');
    try{
      const resp = await fetch(`/api/models/${encodeURIComponent(name)}`,{ method:'DELETE', headers:{'x-admin-key':adminKey}});
      if(!resp.ok) throw new Error(`Silme başarısız: ${resp.status}`);
      await refresh();
    }catch(e){ setError(String(e.message||e)); }
  },[authorized, adminKey, refresh]);

  const onDrop = (e) => {
    e.preventDefault(); e.stopPropagation();
    setDragOver(false);
    if(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length){
      handleUploadFiles(e.dataTransfer.files);
    }
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', background:'#f6f7fb' }}>
      <div style={{ height:56, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 16px', background:'#111827', color:'#fff' }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <button onClick={onBack} title="Geri" style={{ background:'#374151', color:'#fff', border:'1px solid #4b5563', borderRadius:6, padding:'6px 10px', cursor:'pointer' }}>← Geri</button>
          <h2 style={{ margin:0, fontSize:18 }}>Yönetim</h2>
        </div>
        <div style={{ fontSize:13, opacity:0.85 }}>{user?.name} • {String(user?.role).toUpperCase?.()}</div>
      </div>

      <div style={{ padding:16, maxWidth:1100, margin:'0 auto', width:'100%', flex:1, display:'flex', flexDirection:'column', gap:16 }}>
        {/* Key + Actions */}
        <div style={{ background:'#ffffff', border:'1px solid #e5e7eb', borderRadius:10, padding:16, display:'flex', alignItems:'center', gap:12 }}>
          <input
            type="password"
            placeholder="Admin Anahtarı (x-admin-key)"
            value={adminKey}
            onChange={(e)=>setAdminKey(e.target.value)}
            style={{ flex:1, minWidth:240, padding:'8px 10px', border:'1px solid #d1d5db', borderRadius:8 }}
          />
          <button onClick={refresh} disabled={!authorized || loading} style={{ padding:'8px 12px', border:'1px solid #d1d5db', borderRadius:8, background:'#f3f4f6', cursor:'pointer' }}>
            {loading ? 'Yükleniyor…' : 'Yenile'}
          </button>
        </div>

        {/* Uploader */}
        <div
          onDragEnter={(e)=>{ e.preventDefault(); setDragOver(true); }}
          onDragOver={(e)=>{ e.preventDefault(); setDragOver(true); }}
          onDragLeave={(e)=>{ e.preventDefault(); setDragOver(false); }}
          onDrop={onDrop}
          style={{
            background:'#ffffff',
            border:'2px dashed ' + (dragOver ? '#2563eb' : '#d1d5db'),
            borderRadius:12,
            padding:24
          }}
        >
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:16, flexWrap:'wrap' }}>
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              <strong style={{ fontSize:16 }}>Model Yükle</strong>
              <div style={{ fontSize:12, color:'#6b7280' }}>.glb, .gltf, .zip, .draco kabul edilir. Dosyaları buraya sürükleyip bırakabilir veya butonu kullanabilirsiniz.</div>
            </div>
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              <input
                id="admin-file-input"
                type="file"
                accept=".glb,.gltf,.zip,.draco"
                multiple
                disabled={!authorized || uploading}
                onChange={(e)=>{ if(e.target.files) handleUploadFiles(e.target.files); e.target.value=''; }}
              />
              <button
                onClick={()=>document.getElementById('admin-file-input').click()}
                disabled={!authorized || uploading}
                style={{ padding:'8px 12px', border:'1px solid #d1d5db', borderRadius:8, background:'#f3f4f6', cursor:'pointer' }}
              >
                {uploading ? 'Yükleniyor…' : 'Dosya Seç'}
              </button>
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{ background:'#fee2e2', color:'#991b1b', border:'1px solid #fecaca', borderRadius:8, padding:'10px 12px' }}>
            {error}
          </div>
        )}

        {/* List */}
        <div style={{ background:'#ffffff', border:'1px solid #e5e7eb', borderRadius:10, padding:16 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
            <strong>Modeller</strong>
            <span style={{ fontSize:12, color:'#6b7280' }}>{models.length} kayıt</span>
          </div>
          <div style={{ overflow:'auto', maxHeight:'50vh' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ background:'#f9fafb' }}>
                  <th style={{ textAlign:'left', padding:'8px', borderBottom:'1px solid #e5e7eb' }}>Dosya</th>
                  <th style={{ textAlign:'left', padding:'8px', borderBottom:'1px solid #e5e7eb' }}>URL</th>
                  <th style={{ textAlign:'right', padding:'8px', borderBottom:'1px solid #e5e7eb', width:90 }}>Boyut</th>
                  <th style={{ textAlign:'right', padding:'8px', borderBottom:'1px solid #e5e7eb', width:140 }}>Tarih</th>
                  <th style={{ textAlign:'right', padding:'8px', borderBottom:'1px solid #e5e7eb', width:80 }}>İşlem</th>
                </tr>
              </thead>
              <tbody>
                {models.length===0 ? (
                  <tr><td colSpan={5} style={{ padding:'10px 8px', color:'#6b7280' }}>Kayıt yok</td></tr>
                ) : models.map((m,i)=> {
                  const url = `/models/${m.name}`;
                  return (
                    <tr key={`mdl-${i}`} style={{ borderBottom:'1px solid #f3f4f6' }}>
                      <td style={{ padding:'8px', fontFamily:'monospace' }}>{m.name}</td>
                      <td style={{ padding:'8px' }}>
                        <a href={url} target="_blank" rel="noreferrer">{url}</a>
                      </td>
                      <td style={{ padding:'8px', textAlign:'right' }}>{formatBytes(m.size)}</td>
                      <td style={{ padding:'8px', textAlign:'right' }}>{formatDate(m.mtime)}</td>
                      <td style={{ padding:'8px', textAlign:'right' }}>
                        <button
                          onClick={()=>deleteModel(m.name)}
                          disabled={!authorized}
                          style={{ padding:'6px 10px', border:'1px solid #ef4444', color:'#b91c1c', background:'#fef2f2', borderRadius:8, cursor:'pointer' }}
                        >
                          Sil
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Projects Create */}
        <div style={{ background:'#ffffff', border:'1px solid #e5e7eb', borderRadius:10, padding:16, display:'grid', gap:12 }}>
          <strong style={{ fontSize:16 }}>Proje Ekle</strong>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))', gap:10 }}>
            <div>
              <div style={{ fontSize:12, color:'#6b7280', marginBottom:6 }}>Proje ID</div>
              <input value={pId} onChange={(e)=>setPId(e.target.value)} placeholder="ör. ttu-0911" style={{ width:'100%', padding:'8px 10px', border:'1px solid #d1d5db', borderRadius:8 }} />
            </div>
            <div>
              <div style={{ fontSize:12, color:'#6b7280', marginBottom:6 }}>Proje Adı</div>
              <input value={pName} onChange={(e)=>setPName(e.target.value)} placeholder="ör. TTU-0911 Üretim Hattı" style={{ width:'100%', padding:'8px 10px', border:'1px solid #d1d5db', borderRadius:8 }} />
            </div>
            <div>
              <div style={{ fontSize:12, color:'#6b7280', marginBottom:6 }}>Takipçi</div>
              <input value={pTracker} onChange={(e)=>setPTracker(e.target.value)} placeholder="ör. Ahmet Yılmaz" style={{ width:'100%', padding:'8px 10px', border:'1px solid #d1d5db', borderRadius:8 }} />
            </div>
            <div>
              <div style={{ fontSize:12, color:'#6b7280', marginBottom:6 }}>Model (seç veya URL yaz)</div>
              <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
                <select
                  onChange={(e)=> setPModelUrl(e.target.value ? `/models/${e.target.value}` : '')}
                  value={pModelUrl.startsWith('/models/') ? pModelUrl.replace('/models/','') : ''}
                  style={{ flex:'1 1 240px', minWidth:220, padding:'8px 10px', border:'1px solid #d1d5db', borderRadius:8 }}
                >
                  <option value="">— Model seç —</option>
                  {models.map(m => (
                    <option key={m.name} value={m.name}>{m.name}</option>
                  ))}
                </select>
                <input
                  value={pModelUrl}
                  onChange={(e)=>setPModelUrl(e.target.value)}
                  placeholder="/models/ttu-0911-draco.glb"
                  style={{ flex:'1 1 240px', minWidth:220, padding:'8px 10px', border:'1px solid #d1d5db', borderRadius:8 }}
                />
              </div>
            </div>
          </div>
          <div>
            <div style={{ fontSize:12, color:'#6b7280', marginBottom:6 }}>Açıklama (opsiyonel)</div>
            <textarea value={pDescription} onChange={(e)=>setPDescription(e.target.value)} rows={3} placeholder="Proje açıklaması..." style={{ width:'100%', padding:'8px 10px', border:'1px solid #d1d5db', borderRadius:8, resize:'vertical' }} />
          </div>
          <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
            <button
              onClick={createProject}
              disabled={!authorized}
              style={{ padding:'8px 12px', border:'1px solid #d1d5db', borderRadius:8, background:'#e8f2ff', cursor:'pointer' }}
            >
              Proje Oluştur
            </button>
          </div>
        </div>

        {/* Projects List */}
        <div style={{ background:'#ffffff', border:'1px solid #e5e7eb', borderRadius:10, padding:16 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
            <strong>Projeler</strong>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'#374151' }} title="Proje silerken model dosyasını da kaldır">
                <input type="checkbox" checked={deleteFileToo} onChange={(e)=>setDeleteFileToo(e.target.checked)} />
                Model dosyasını da sil
              </label>
              <span style={{ fontSize:12, color:'#6b7280' }}>{projects.length} kayıt</span>
            </div>
          </div>
          <div style={{ overflow:'auto', maxHeight:'50vh' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ background:'#f9fafb' }}>
                  <th style={{ textAlign:'left', padding:'8px', borderBottom:'1px solid #e5e7eb' }}>ID</th>
                  <th style={{ textAlign:'left', padding:'8px', borderBottom:'1px solid #e5e7eb' }}>Ad</th>
                  <th style={{ textAlign:'left', padding:'8px', borderBottom:'1px solid #e5e7eb' }}>Takipçi</th>
                  <th style={{ textAlign:'left', padding:'8px', borderBottom:'1px solid #e5e7eb' }}>Model</th>
                  <th style={{ textAlign:'right', padding:'8px', borderBottom:'1px solid #e5e7eb', width:90 }}>İşlem</th>
                </tr>
              </thead>
              <tbody>
                {loadingProjects ? (
                  <tr><td colSpan={5} style={{ padding:'10px 8px', color:'#6b7280' }}>Yükleniyor…</td></tr>
                ) : projects.length === 0 ? (
                  <tr><td colSpan={5} style={{ padding:'10px 8px', color:'#6b7280' }}>Kayıt yok</td></tr>
                ) : projects.map((p) => (
                  <tr key={p.id} style={{ borderBottom:'1px solid #f3f4f6' }}>
                    <td style={{ padding:'8px', fontFamily:'monospace' }}>{p.id}</td>
                    <td style={{ padding:'8px' }}>{p.name}</td>
                    <td style={{ padding:'8px' }}>{p.tracker}</td>
                    <td style={{ padding:'8px' }}>
                      {p.modelUrl?.startsWith('/models/') ? <a href={p.modelUrl} target="_blank" rel="noreferrer">{p.modelUrl}</a> : p.modelUrl}
                    </td>
                    <td style={{ padding:'8px', textAlign:'right' }}>
                      <button
                        onClick={()=>removeProject(p.id)}
                        disabled={!authorized}
                        style={{ padding:'6px 10px', border:'1px solid #ef4444', color:'#b91c1c', background:'#fef2f2', borderRadius:8, cursor:'pointer' }}
                        title={deleteFileToo ? 'Projeyi ve model dosyasını sil' : 'Projeyi sil'}
                      >
                        Sil
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Versioning Panel */}
        <div style={{ background:'#ffffff', border:'1px solid #e5e7eb', borderRadius:10, padding:16, display:'grid', gap:12 }}>
          <strong style={{ fontSize:16 }}>Sürüm Yönetimi</strong>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))', gap:10 }}>
            <div>
              <div style={{ fontSize:12, color:'#6b7280', marginBottom:6 }}>Proje Seç</div>
              <select
                value={versProjectId}
                onChange={(e)=>setVersProjectId(e.target.value)}
                style={{ width:'100%', padding:'8px 10px', border:'1px solid #d1d5db', borderRadius:8 }}
              >
                <option value="">— Proje —</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.id} — {p.name}</option>
                ))}
              </select>
            </div>

            <div>
              <div style={{ fontSize:12, color:'#6b7280', marginBottom:6 }}>Model Seç (Aktif Yap)</div>
              <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
                <select
                  onChange={(e)=> setPModelUrl(e.target.value ? `/models/${e.target.value}` : '')}
                  value={pModelUrl.startsWith('/models/') ? pModelUrl.replace('/models/','') : ''}
                  style={{ flex:'1 1 240px', minWidth:220, padding:'8px 10px', border:'1px solid #d1d5db', borderRadius:8 }}
                >
                  <option value="">— Model seç —</option>
                  {models.map(m => (
                    <option key={m.name} value={m.name}>{m.name}</option>
                  ))}
                </select>
                <button
                  onClick={setActiveModelForProject}
                  disabled={!authorized || !versProjectId || !pModelUrl}
                  style={{ padding:'8px 12px', border:'1px solid #d1d5db', borderRadius:8, background:'#e8f2ff', cursor:'pointer' }}
                  title="Seçilen modeli proje için aktif yap"
                >
                  Aktif Yap
                </button>
              </div>
            </div>
          </div>

          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <button
              onClick={fetchVersions}
              disabled={!authorized || !versProjectId}
              style={{ padding:'8px 12px', border:'1px solid #d1d5db', borderRadius:8, background:'#f3f4f6', cursor:'pointer' }}
            >
              {loadingVersions ? 'Yükleniyor…' : 'Sürüm Geçmişini Yükle'}
            </button>
          </div>

          <div style={{ overflow:'auto', maxHeight:'40vh' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ background:'#f9fafb' }}>
                  <th style={{ textAlign:'left', padding:'8px', borderBottom:'1px solid #e5e7eb' }}>#</th>
                  <th style={{ textAlign:'left', padding:'8px', borderBottom:'1px solid #e5e7eb' }}>Model</th>
                  <th style={{ textAlign:'left', padding:'8px', borderBottom:'1px solid #e5e7eb' }}>Tür</th>
                  <th style={{ textAlign:'left', padding:'8px', borderBottom:'1px solid #e5e7eb' }}>Kim</th>
                  <th style={{ textAlign:'right', padding:'8px', borderBottom:'1px solid #e5e7eb', width:160 }}>Tarih</th>
                  <th style={{ textAlign:'right', padding:'8px', borderBottom:'1px solid #e5e7eb', width:120 }}>İşlem</th>
                </tr>
              </thead>
              <tbody>
                {versions.length === 0 ? (
                  <tr><td colSpan={6} style={{ padding:'10px 8px', color:'#6b7280' }}>Kayıt yok</td></tr>
                ) : versions.map((v, idx) => (
                  <tr key={`ver-${idx}`} style={{ borderBottom:'1px solid #f3f4f6' }}>
                    <td style={{ padding:'8px' }}>{idx}</td>
                    <td style={{ padding:'8px', fontFamily:'monospace' }}>
                      {typeof v.modelUrl === 'string' && v.modelUrl.startsWith('/models/') ? (
                        <a href={v.modelUrl} target="_blank" rel="noreferrer">{v.modelUrl}</a>
                      ) : (v.modelUrl || '')}
                    </td>
                    <td style={{ padding:'8px' }}>{v.type || 'set'}</td>
                    <td style={{ padding:'8px' }}>{v.by || '-'}</td>
                    <td style={{ padding:'8px', textAlign:'right' }}>{(() => { try { return new Date(Number(v.at)||0).toLocaleString('tr-TR'); } catch { return ''; } })()}</td>
                    <td style={{ padding:'8px', textAlign:'right' }}>
                      <button
                        onClick={()=>rollbackVersion(idx)}
                        disabled={!authorized}
                        style={{ padding:'6px 10px', border:'1px solid #d1d5db', background:'#fff', borderRadius:8, cursor:'pointer' }}
                        title="Bu sürüme geri al"
                      >
                        Geri Al
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Share Links (Client Portal) */}
        <div style={{ background:'#ffffff', border:'1px solid #e5e7eb', borderRadius:10, padding:16, display:'grid', gap:12 }}>
          <strong style={{ fontSize:16 }}>Paylaşım Linkleri (Client Portal)</strong>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))', gap:10 }}>
            <div>
              <div style={{ fontSize:12, color:'#6b7280', marginBottom:6 }}>Proje</div>
              <select
                value={shareProjectId}
                onChange={(e)=>setShareProjectId(e.target.value)}
                style={{ width:'100%', padding:'8px 10px', border:'1px solid #d1d5db', borderRadius:8 }}
              >
                <option value="">— Proje —</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.id} — {p.name}</option>
                ))}
              </select>
            </div>

            <div>
              <div style={{ fontSize:12, color:'#6b7280', marginBottom:6 }}>Model (opsiyonel override)</div>
              <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
                <select
                  onChange={(e)=> setShareModelUrl(e.target.value ? `/models/${e.target.value}` : '')}
                  value={shareModelUrl.startsWith('/models/') ? shareModelUrl.replace('/models/','') : ''}
                  style={{ flex:'1 1 240px', minWidth:220, padding:'8px 10px', border:'1px solid #d1d5db', borderRadius:8 }}
                >
                  <option value="">— Varsayılan (Proje modeli) —</option>
                  {models.map(m => (
                    <option key={m.name} value={m.name}>{m.name}</option>
                  ))}
                </select>
                <input
                  value={shareModelUrl}
                  onChange={(e)=>setShareModelUrl(e.target.value)}
                  placeholder="/models/ttu-0911-draco.glb"
                  style={{ flex:'1 1 240px', minWidth:220, padding:'8px 10px', border:'1px solid #d1d5db', borderRadius:8 }}
                />
              </div>
            </div>

            <div>
              <div style={{ fontSize:12, color:'#6b7280', marginBottom:6 }}>Süre (saat)</div>
              <input
                type="number"
                min={1}
                step={1}
                value={shareTtlHours}
                onChange={(e)=>setShareTtlHours(parseInt(e.target.value||'24', 10))}
                style={{ width:'100%', padding:'8px 10px', border:'1px solid #d1d5db', borderRadius:8 }}
              />
            </div>

            <div>
              <div style={{ fontSize:12, color:'#6b7280', marginBottom:6 }}>Kapsam</div>
              <select
                value={shareScope}
                onChange={(e)=>setShareScope(e.target.value)}
                style={{ width:'100%', padding:'8px 10px', border:'1px solid #d1d5db', borderRadius:8 }}
              >
                <option value="view">Sadece Görüntüleme</option>
                <option value="annotate">İnteraktif (Not Ekleme)</option>
              </select>
            </div>

            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <label style={{ fontSize:12, color:'#6b7280' }}>
                <input type="checkbox" checked={shareSingleUse} onChange={(e)=>setShareSingleUse(e.target.checked)} /> Tek Kullanımlık
              </label>
              {!shareSingleUse && (
                <>
                  <div style={{ fontSize:12, color:'#6b7280' }}>Max Kullanım</div>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={shareMaxUses}
                    onChange={(e)=>setShareMaxUses(parseInt(e.target.value||'0', 10))}
                    style={{ width:120, padding:'8px 10px', border:'1px solid #d1d5db', borderRadius:8 }}
                  />
                </>
              )}
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ fontSize:12, color:'#6b7280', marginBottom:6 }}>Not (opsiyonel)</div>
              <textarea
                value={shareNote}
                onChange={(e)=>setShareNote(e.target.value)}
                rows={2}
                placeholder="Müşteri adı, açıklama..."
                style={{ width:'100%', padding:'8px 10px', border:'1px solid #d1d5db', borderRadius:8, resize:'vertical' }}
              />
            </div>
          </div>

          <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
            <button
              onClick={createShare}
              disabled={!authorized || !shareProjectId || loadingShares}
              style={{ padding:'8px 12px', border:'1px solid #d1d5db', borderRadius:8, background:'#e8f2ff', cursor:'pointer' }}
              title="Kısa ömürlü tokenlı link oluştur"
            >
              Link Oluştur
            </button>
          </div>

          {createdShareUrl && (
            <div style={{ background:'#ecfdf5', border:'1px solid #d1fae5', color:'#065f46', borderRadius:8, padding:'8px 10px', fontSize:13 }}>
              Oluşturuldu: <a href={createdShareUrl} target="_blank" rel="noreferrer">{createdShareUrl}</a>
              <button
                onClick={() => { try { navigator.clipboard.writeText(createdShareUrl); } catch {} }}
                style={{ marginLeft:10, padding:'4px 8px', border:'1px solid #10b981', background:'#d1fae5', borderRadius:6, cursor:'pointer' }}
              >
                Kopyala
              </button>
            </div>
          )}

          <div style={{ overflow:'auto', maxHeight:'40vh' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ background:'#f9fafb' }}>
                  <th style={{ textAlign:'left', padding:'8px', borderBottom:'1px solid #e5e7eb' }}>Token</th>
                  <th style={{ textAlign:'left', padding:'8px', borderBottom:'1px solid #e5e7eb' }}>Proje</th>
                  <th style={{ textAlign:'left', padding:'8px', borderBottom:'1px solid #e5e7eb' }}>Kapsam</th>
                  <th style={{ textAlign:'left', padding:'8px', borderBottom:'1px solid #e5e7eb' }}>Bitiş</th>
                  <th style={{ textAlign:'left', padding:'8px', borderBottom:'1px solid #e5e7eb' }}>Kullanım</th>
                  <th style={{ textAlign:'left', padding:'8px', borderBottom:'1px solid #e5e7eb' }}>Durum</th>
                  <th style={{ textAlign:'right', padding:'8px', borderBottom:'1px solid #e5e7eb' }}>Link</th>
                </tr>
              </thead>
              <tbody>
                {loadingShares ? (
                  <tr><td colSpan={7} style={{ padding:'10px 8px', color:'#6b7280' }}>Yükleniyor…</td></tr>
                ) : shares.length === 0 ? (
                  <tr><td colSpan={7} style={{ padding:'10px 8px', color:'#6b7280' }}>Kayıt yok</td></tr>
                ) : shares.map((s, i) => {
                  const url = `/p/${s.token}`;
                  const full = (() => { try { return window.location.origin + url; } catch { return url; } })();
                  const expired = !!s.expired || (s.expiresAt && Date.now() > Number(s.expiresAt));
                  return (
                    <tr key={`share-${i}`} style={{ borderBottom:'1px solid #f3f4f6', opacity: expired ? 0.6 : 1 }}>
                      <td style={{ padding:'8px', fontFamily:'monospace' }}>{s.token}</td>
                      <td style={{ padding:'8px' }}>{s.projectId}</td>
                      <td style={{ padding:'8px' }}>{s.scope}</td>
                      <td style={{ padding:'8px' }}>{(() => { try { return s.expiresAt ? new Date(Number(s.expiresAt)).toLocaleString('tr-TR') : '—'; } catch { return '—'; } })()}</td>
                      <td style={{ padding:'8px' }}>{Number(s.usedCount||0)} / {Number(s.maxUses||0) <= 0 ? '∞' : Number(s.maxUses||0)} {s.singleUse ? '(tek)' : ''}</td>
                      <td style={{ padding:'8px' }}>{expired ? 'Süresi doldu' : 'Aktif'}</td>
                      <td style={{ padding:'8px', textAlign:'right' }}>
                        <a href={url} target="_blank" rel="noreferrer">Aç</a>
                        <button
                          onClick={() => { try { navigator.clipboard.writeText(full); } catch {} }}
                          style={{ marginLeft:8, padding:'4px 8px', border:'1px solid #d1d5db', background:'#fff', borderRadius:6, cursor:'pointer' }}
                        >
                          Kopyala
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ fontSize:12, color:'#6b7280' }}>
          Yüklenen dosyalar public/models klasörüne kopyalanır. Geliştirme modunda /models/ dosya yolu ile servis edilir.
        </div>
      </div>
    </div>
  );
};

export default Admin;