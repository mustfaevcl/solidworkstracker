import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { io } from 'socket.io-client';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import useStore from './components/store/state';
const MachineModel = React.lazy(() => import('./components/MachineModel'));
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import Projects from './components/Projects';
import ErrorBoundary from './components/ErrorBoundary';
import Settings from './components/Settings';
import QRScanner from './components/QRScanner';
import DefectPanel from './components/DefectPanel';
import Admin from './components/Admin';

// Deadline indicator component
const DeadlineIndicator = ({ dueDate }) => {
  const today = new Date();
  const dueDateObj = new Date(dueDate);
  
  // Calculate days difference
  const diffTime = dueDateObj - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  // Determine status and styling
  let status, color, backgroundColor, animation;
  
  if (diffDays < 0) {
    // Overdue
    status = `${Math.abs(diffDays)} gün gecikmiş`;
    color = 'white';
    backgroundColor = '#e74c3c'; // Red
    animation = 'pulse 1.5s infinite';
  } else if (diffDays === 0) {
    // Due today
    status = 'Bugün son gün!';
    color = 'white';
    backgroundColor = '#e67e22'; // Orange
    animation = 'pulse 1.5s infinite';
  } else if (diffDays <= 3) {
    // Due soon
    status = `${diffDays} gün kaldı`;
    color = 'white';
    backgroundColor = '#f39c12'; // Yellow-orange
    animation = 'pulse 2s infinite';
  } else if (diffDays <= 7) {
    // Due this week
    status = `${diffDays} gün kaldı`;
    color = 'white';
    backgroundColor = '#3498db'; // Blue
    animation = 'none';
  } else {
    // Due later
    status = `${diffDays} gün kaldı`;
    color = 'white';
    backgroundColor = '#2ecc71'; // Green
    animation = 'none';
  }
  
  // CSS for pulse animation
  const keyframes = `
    @keyframes pulse {
      0% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.8; transform: scale(1.05); }
      100% { opacity: 1; transform: scale(1); }
    }
  `;
  
  return (
    <div>
      <style>{keyframes}</style>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px',
        borderRadius: '4px',
        backgroundColor,
        color,
        animation,
        transition: 'all 0.3s ease',
        fontWeight: 'bold',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}>
        <span>Termin Durumu:</span>
        <span>{status}</span>
      </div>
    </div>
  );
};

// Durum renkleri
const statusColors = {
  tezgahta: 'orange',
  tamamlandi: 'green',
  kalitede: 'blue',
  siparis: '#8e44ad', // Mor
  stokta: '#27ae60', // Koyu Yeşil
  beklemede: '#e67e22', // Turuncu
  fason: '#c0392b' // Kırmızı
};

// Tezgah türleri


// Satın alma durumları
const purchaseStatuses = [
  'Sipariş Edilmedi',
  'Sipariş Edildi',
  'Kısmi Tedarik',
  'Tedarik Edildi',
  'Stokta Mevcut'
];

// Fare merkezli yakınlaştırma için özel kontroller
function CustomControls({ modelRef, selectedPart }) {
  const { camera, gl, scene } = useThree();
  const controlsRef = useRef();
  const mousePos = useRef(new THREE.Vector2());
  const raycaster = useRef(new THREE.Raycaster());

  useEffect(() => {
    if (controlsRef.current) {
      const handleWheel = (event) => {
        event.preventDefault();
        const canvas = gl.domElement;
        const rect = canvas.getBoundingClientRect();
        mousePos.current.x = ((event.clientX - rect.left) / canvas.clientWidth) * 2 - 1;
        mousePos.current.y = -((event.clientY - rect.top) / canvas.clientHeight) * 2 + 1;

        raycaster.current.setFromCamera(mousePos.current, camera);
        const meshes = [];
        scene.traverse((object) => { if (object.isMesh) meshes.push(object); });
        const intersects = raycaster.current.intersectObjects(meshes);

        const zoomDirection = event.deltaY > 0 ? 1 : -1;
        let zoomSpeed = 0.1; // Varsayılan zoom hızı
        let newTarget = controlsRef.current.target.clone(); // Mevcut hedefi koru

        if (intersects.length > 0) {
          const intersectionPoint = intersects[0].point.clone();
          newTarget.lerp(intersectionPoint, 0.2); // Hedefi kesişim noktasına doğru yumuşakça kaydır
          zoomSpeed = 0.05; // Nesneye yakınlaşırken daha yavaş zoom
        }

        const distance = camera.position.distanceTo(newTarget);
        const newDistance = Math.max(0.1, distance * (1 + zoomDirection * zoomSpeed)); // Min mesafeyi koru
        const direction = new THREE.Vector3().subVectors(camera.position, newTarget).normalize();

        camera.position.copy(newTarget).add(direction.multiplyScalar(newDistance));
        controlsRef.current.target.copy(newTarget); // OrbitControls hedefini güncelle
        controlsRef.current.update();
      };

      const canvas = gl.domElement;
      canvas.addEventListener('wheel', handleWheel, { passive: false });
      return () => canvas.removeEventListener('wheel', handleWheel);
    }
  }, [gl, camera, scene, controlsRef]);

  useEffect(() => {
    // Ayarlardan "Seçimde kamerayı odakla" tercihini oku (varsayılan: kapalı)
    let enabled = false;
    try {
      const raw = localStorage.getItem('gmm_settings_v1');
      if (raw) {
        const settings = JSON.parse(raw);
        enabled = !!(settings?.interaction?.clickFocusCamera);
      }
    } catch {
      enabled = false;
    }
    if (!enabled) return;

    if (selectedPart && modelRef.current && controlsRef.current && camera) {
      const object = modelRef.current.getObjectByName(selectedPart);
      if (object) {
        const box = new THREE.Box3().setFromObject(object);
        const center = box.getCenter(new THREE.Vector3());

        // Sadece kontrol hedefini değiştir, kamera pozisyonunu değiştirme
        controlsRef.current.target.copy(center);
        controlsRef.current.update();

        // Parçayı vurgulamak için (opsiyonel)
        if (modelRef.current.focusOnPart) {
          try { modelRef.current.focusOnPart(selectedPart); } catch {}
        }
      }
    }
  }, [selectedPart, modelRef, camera, controlsRef]);

  return (
    <OrbitControls
      ref={controlsRef}
      enableDamping={true}
      dampingFactor={0.1}
      rotateSpeed={0.7}
      zoomSpeed={1.2}
      panSpeed={0.8}
    />
  );
}


// Client Presentation Portal — public viewer for /p/:token
function PublicPortal({ token }) {
  const [state, setState] = React.useState({ loading: true, error: '', share: null });
  const [selectedPart, setSelectedPart] = React.useState(null);
  const [explosionFactor, setExplosionFactor] = React.useState(0.03);
  const modelRef = React.useRef();

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch(`/api/shares/${encodeURIComponent(token)}`, { method: 'GET' });
        if (!resp.ok) throw new Error('Token geçersiz veya süresi dolmuş');
        const share = await resp.json();
        try { await fetch(`/api/shares/${encodeURIComponent(token)}/consume`, { method: 'POST' }); } catch {}
        if (!cancelled) setState({ loading: false, error: '', share });
      } catch (e) {
        if (!cancelled) setState({ loading: false, error: (e && e.message) ? e.message : 'Bilinmeyen hata', share: null });
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  if (state.loading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100vh', fontSize: 14, color: '#444' }}>
        Yükleniyor...
      </div>
    );
  }
  if (state.error) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100vh', color: '#c0392b' }}>
        <div style={{ padding: 16, border: '1px solid #f2b2b2', background: '#fff5f5', borderRadius: 8 }}>
          <strong>Hata:</strong> {state.error}
        </div>
      </div>
    );
  }

  const share = state.share || {};
  const modelUrl = share.modelUrl || '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: 700 }}>Client Presentation Portal</div>
        <div style={{ fontSize: 12, color: '#666' }}>
          Token: {token} • Kapsam: {share.scope} • Bitiş: {share.expiresAt ? new Date(share.expiresAt).toLocaleString() : '—'}
        </div>
      </div>
      <div style={{ flex: 1, position: 'relative', background: '#fff' }}>
        <ErrorBoundary>
          <Canvas
            camera={{ position: [0, 1.5, 7], fov: 50 }}
            dpr={[1, 2]}
            gl={{
              antialias: true,
              powerPreference: 'high-performance',
              stencil: false,
              depth: true,
              alpha: false,
              preserveDrawingBuffer: false,
              failIfMajorPerformanceCaveat: true
            }}
            onCreated={({ gl }) => {
              try { gl.setClearColor(0xffffff, 1); } catch {}
              try { gl.outputColorSpace = THREE.SRGBColorSpace; } catch {}
              try {
                gl.toneMapping = THREE.ACESFilmicToneMapping;
                gl.toneMappingExposure = 0.9;
                gl.physicallyCorrectLights = true;
              } catch {}
              gl.localClippingEnabled = false;
            }}
            frameloop="demand"
            style={{ touchAction: 'none' }}
          >
            <ambientLight intensity={0.35} />
            <directionalLight position={[10, 15, 10]} intensity={0.9} />
            <CustomControls modelRef={modelRef} selectedPart={selectedPart} />
            <React.Suspense fallback={null}>
              <MachineModel
                ref={modelRef}
                modelUrl={modelUrl}
                selectedPart={selectedPart}
                selectedAssemblyKey={null}
                onPartClick={(name) => setSelectedPart(name)}
                partStatuses={{}}
                onHierarchyReady={() => {}}
                isIsolated={false}
                toggleIsolation={() => {}}
                filterStatus={null}
                setFilterStatus={() => {}}
                explosionFactor={explosionFactor}
                setExplosionFactor={setExplosionFactor}
                onLogout={() => {}}
                onSettings={() => {}}
                searchTerm={''}
                setSearchTerm={() => {}}
                viewMode={'normal'}
                setViewMode={() => {}}
                darkMode={false}
                setDarkMode={() => {}}
                bigButtons={false}
                setBigButtons={() => {}}
                user={{ role: 'guest' }}
                selectedMachine={{ id: share.projectId || 'share', modelUrl }}
                onGoToProjects={() => {}}
              />
            </React.Suspense>
          </Canvas>
        </ErrorBoundary>

        <div style={{ position: 'absolute', right: 12, bottom: 12, background: '#ffffff', border: '1px solid #ddd', borderRadius: 8, padding: 8, display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 2px 6px rgba(0,0,0,0.08)' }}>
          <label style={{ fontSize: 12, color: '#555' }}>Explode</label>
          <input
            type="range"
            min="0"
            max="0.2"
            step="0.005"
            value={explosionFactor}
            onChange={(e) => setExplosionFactor(parseFloat(e.target.value) || 0)}
          />
        </div>
      </div>
    </div>
  );
}

export default function App() {
  // Public portal token from path (/p/:token); bypass login when present
  const shareToken = useMemo(() => {
    try {
      const m = (typeof window !== 'undefined' ? window.location.pathname : '').match(/^\/p\/([A-Za-z0-9_-]+)/);
      return m ? m[1] : null;
    } catch {
      return null;
    }
  }, []);
  // Kullanıcı giriş durumu
  const [user, setUser] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [selectedPart, setSelectedPart] = useState(null);
  const [selectedAssemblyKey, setSelectedAssemblyKey] = useState(null); // Montaj seçimi için
  const [partStatuses, setPartStatuses] = useState({});
  const [hierarchy, setHierarchy] = useState({});
  const [isIsolated, setIsIsolated] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState(null);
  const [viewMode, setViewMode] = useState('normal'); // 'normal' | 'wireframe' | 'xray' ... (MachineModel için görünüm modu)
  const [explosionFactor, setExplosionFactor] = useState(0.05); // Patlatma faktörü

  // Sol parça ağacı (sidebar) genişliği ve görünürlük
  // Global UI preferences
  const [darkMode, setDarkMode] = useState(false);
  const [bigButtons, setBigButtons] = useState(false);
  const [bottomHeight, setBottomHeight] = useState(260);
  const [bottomCollapsed, setBottomCollapsed] = useState(false);
  const [isBottomDragging, setIsBottomDragging] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(350);
  const [isSidebarDragging, setIsSidebarDragging] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

// Açılır/kapanır ağaç için genişletme durumu
const [expandedNodes, setExpandedNodes] = useState(() => new Set());
  // Sayfa yönlendirme durumu: 'projects' | 'machine'
  const [page, setPage] = useState('projects');
  const [selectedMachine, setSelectedMachine] = useState(null);

  // Backend'den dinamik proje listesi (Admin ile eklenenler)
  const [projectsItems, setProjectsItems] = useState(null);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const resp = await fetch('/api/projects', { method: 'GET' });
        if (!resp.ok) return;
        const data = await resp.json();
        const items = Array.isArray(data.items) ? data.items : [];
        const mapped = items.map(p => ({
          id: p.id,
          name: p.name,
          modelUrl: p.modelUrl,
          tracker: p.tracker,
          description: p.description || ''
        }));
        if (!cancelled) setProjectsItems(mapped);
      } catch {
        // ignore
      }
    };
    // Projeler sayfasına gelindiğinde veya oturum değiştiğinde yenile
    if (page === 'projects') load();
    return () => { cancelled = true; };
  }, [user, page]);

  // Store bindings (for QR/seam handling)
  const weldSeams = useStore(s => s.weldSeams);
  const online = useStore(s => s.online);
  const setOnline = useStore(s => s.setOnline);
  const offlineQueueLen = useStore(s => (s.offlineQueue || []).length);
  const assemblySteps = useStore(s => s.assemblySteps);
  const updateAssemblyStep = useStore(s => s.updateAssemblyStep);
  const updateWeldSeam = useStore(s => s.updateWeldSeam);

  // Preflight check for local GLB validity to avoid throwing inside Canvas when file is invalid
  // Try same candidate order used by MachineModel: -draco.glb → -compressed.glb → -geo.glb → original
  const [modelCheck, setModelCheck] = useState({ status: 'idle', message: '' });

  useEffect(() => {
    const url = selectedMachine?.modelUrl || '';
    if (!url) { setModelCheck({ status: 'idle', message: '' }); return; }
    // Only preflight local files; remote/CDN assumed OK
    if (!url.startsWith('/models/')) { setModelCheck({ status: 'ok', message: '' }); return; }
    let aborted = false;
    setModelCheck({ status: 'checking', message: '' });
    (async () => {
      try {
        const u = String(url);
        const base = u.replace(/\.glb$/i, '');
        const hasSuffix = /-(draco|compressed|geo)$/i.test(base);
        let candidates;
        if (hasSuffix) {
          const original = base.replace(/-(draco|compressed|geo)$/i, '') + '.glb';
          candidates = [u, original];
        } else {
          candidates = [
            `${base}-draco.glb`,
            `${base}-compressed.glb`,
            `${base}-geo.glb`,
            u
          ];
        }
        let ok = false;
        let lastErr = '';
        for (const c of candidates) {
          try {
            const resp = await fetch(c, { cache: 'no-cache' });
            if (!resp.ok) { lastErr = `HTTP ${resp.status}`; continue; }
            const buf = await resp.arrayBuffer();
            if (buf.byteLength < 20) { lastErr = 'buffer too short'; continue; }
            const magic = String.fromCharCode(...new Uint8Array(buf.slice(0, 4)));
            if (magic !== 'glTF') { lastErr = 'invalid GLB header'; continue; }
            ok = true;
            break;
          } catch (e) {
            lastErr = (e && e.message) ? e.message : 'fetch failed';
          }
        }
        if (!aborted) {
          if (ok) setModelCheck({ status: 'ok', message: '' });
          else setModelCheck({ status: 'invalid', message: lastErr || 'invalid glb' });
        }
      } catch (e) {
        if (!aborted) setModelCheck({ status: 'invalid', message: (e && e.message) ? e.message : 'invalid glb' });
      }
    })();
    return () => { aborted = true; };
  }, [selectedMachine?.modelUrl]);

  const initialPartDetails = {
    purchaseStatus: '',
    location: '',
    machineType: '',
    outsourceCompany: '',
    outsourceDate: '',
    dueDate: '',
    notes: '',
    // Rota planlama
    routeStages: [],           // ['Kesim', 'Büküm', 'Kaynak', ...]
    routeCurrentIndex: -1      // -1 = seçilmemiş; 0..N-1 = aktif aşama
  };
  const [partDetails, setPartDetails] = useState({});
  // Rota düzenleme için yerel input
  const [newRouteStageName, setNewRouteStageName] = useState('');
// Data API (Excel/Sheets) entegrasyonu kullanıcı isteği ile kaldırıldı
const endpoints = null;

  // Excel/Sheets kaydı kaldırıldı

  // saveRecord kaldırıldı

  // Excel'den kayıt yükleme kaldırıldı

  const modelRef = useRef();

  // Connectivity detection + offline banner toggle
  useEffect(() => {
    try {
      const update = () => { try { setOnline(navigator.onLine); } catch {} };
      update();
      window.addEventListener('online', update);
      window.addEventListener('offline', update);
      return () => {
        window.removeEventListener('online', update);
        window.removeEventListener('offline', update);
      };
    } catch {}
  }, [setOnline]);

  // Inject quick CSS for dark mode / big buttons
  useEffect(() => {
    const id = 'app-theme-overrides';
    let style = document.getElementById(id);
    if (!style) {
      style = document.createElement('style');
      style.id = id;
      document.head.appendChild(style);
    }
    const darkCss = darkMode ? `
      body { background:#111 !important; color:#ddd !important; }
      .ribbon-container, .ribbon-menu, .ribbon-group, .ribbon-tabs, .ribbon-button { background: #1a1a1a !important; color: #ddd !important; }
      .ribbon-button.active { background:#2b2b2b !important; }
      input, select, textarea { background:#1e1e1e !important; color:#eee !important; border-color:#444 !important; }
      table { background:#1a1a1a !important; color:#ddd !important; }
      .part-list-container { background:#151515 !important; }
    ` : '';
    const bigCss = bigButtons ? `
      button, .ribbon-button {
        padding: 10px 14px !important;
        font-size: 16px !important;
        min-height: 38px !important;
        border-radius: 8px !important;
      }
      .ribbon-small-button { padding: 8px 12px !important; font-size: 15px !important; }
      select, input { padding: 10px 12px !important; font-size: 15px !important; }
    ` : '';
    style.textContent = darkCss + bigCss;
    return () => { /* keep style for session */ };
  }, [darkMode, bigButtons]);
  const cameraRef = useRef();
  const layoutRef = useRef(null);

  // Sidebar sürükle-bırak ile genişlik ayarı
  useEffect(() => {
    if (!isSidebarDragging) return;
    const onMove = (e) => {
      try {
        const host = layoutRef.current;
        if (!host) return;
        const rect = host.getBoundingClientRect();
        let w = e.clientX - rect.left;
        // Minimum/Maksimum genişlik sınırları
        const minW = 220;
        const maxW = Math.min(700, Math.max(minW, (window.innerWidth || 1200) - 300));
        w = Math.max(minW, Math.min(maxW, w));
        setSidebarWidth(w);
        // Sürüklerken otomatik olarak göster
        if (sidebarCollapsed) setSidebarCollapsed(false);
      } catch {}
    };
    const onUp = () => setIsSidebarDragging(false);

    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp, { passive: true, once: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [isSidebarDragging, sidebarCollapsed]);

  // Bottom resizer drag
  useEffect(() => {
    if (!isBottomDragging) return;
    const onMove = (e) => {
      try {
        const host = layoutRef.current;
        const rect = host ? host.getBoundingClientRect() : null;
        const containerBottom = rect ? rect.bottom : (window.innerHeight || 800);
        let h = containerBottom - e.clientY;
        h = Math.max(140, Math.min(500, h));
        setBottomHeight(h);
        setBottomCollapsed(false);
      } catch {}
    };
    const onUp = () => setIsBottomDragging(false);
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp, { passive: true, once: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [isBottomDragging]);

  const handleLogout = () => {
    // Kullanıcı oturumunu kapat
    setUser(null);
    setIsLoggedIn(false);
  };

  const handleLogin = (userData) => {
    // Kullanıcı giriş yaptığında çağrılacak
    setUser(userData);
    setIsLoggedIn(true);
    // Girişten sonra Projeler sayfasına yönlendir
    setSelectedMachine(null);
    setPage('projects');
  };

  const handleHierarchyReady = useCallback((hierarchyData) => {
    setHierarchy(hierarchyData);
  }, []);

  const handlePartClick = (partName) => {
    // Just set the selected part without changing camera position
    setSelectedPart(partName);
    setSelectedAssemblyKey(null); // 3B sahneden tekil parça klikte montaj seçimi temizle
    // Menüde ilgili parçaya gitmek için yolu aç
    try {
      expandPathForName(partName);
    } catch {}
    // No camera movement should happen here
  };

  const handleMenuPartSelect = (partName, isAssembly = false) => {
    setSelectedPart(partName);
    setSelectedAssemblyKey(isAssembly ? partName : null);
    // Menüden seçimde de yolu açık tut
    try {
      if (!isAssembly) expandPathForName(partName);
    } catch {}
  };

  // Hiyerarşi içinde bir adı bulup, kökten hedefe kadar yolu döndür
  const findPathToName = useCallback((levelData, targetName) => {
    if (!levelData || !targetName) return null;
    const keys = Object.keys(levelData);
    for (const key of keys) {
      const item = levelData[key];
      if (!item || !item.name) continue;
      if (item.name === targetName) {
        return [item.name];
      }
      if (item.children && Object.keys(item.children).length > 0) {
        const childPath = findPathToName(item.children, targetName);
        if (childPath && childPath.length) {
          return [item.name, ...childPath];
        }
      }
    }
    return null;
  }, []);

  // Bulunan yol için expandedNodes set'ine gerekli düğümleri ekle
  const expandPathForName = useCallback((name) => {
    if (!name || !hierarchy || Object.keys(hierarchy).length === 0) return;
    const rootKeys = Object.keys(hierarchy);
    if (rootKeys.length === 0) return;
    // Her kökten dene (genelde tek kök: ana montaj)
    let path = null;
    for (const rk of rootKeys) {
      const node = hierarchy[rk];
      path = findPathToName({ [rk]: node }, name);
      if (path && path.length) {
        // findPathToName döndüğü ilk öğe kök adı olacak şekilde gelir
        break;
      }
    }
    if (!path || path.length < 2) return; // en az bir ebeveyn olmalı ki açmanın anlamı olsun

    setExpandedNodes(prev => {
      const next = new Set(prev);
      // NodeKey kurgusu: parentKey>childName … renderHierarchyLevel ile aynı
      // path: [root, L2, L3, ..., target]
      let acc = path[0];
      for (let i = 1; i < path.length; i++) {
        const nodeKey = `${acc}>${path[i]}`;
        next.add(nodeKey);
        acc = nodeKey.split('>').slice(-1)[0] === path[i] ? `${acc}>${path[i]}` : `${acc}>${path[i]}`;
      }
      return next;
    });

    // Scroll zaten MachineModel.highlightPart ile tetikleniyor
  }, [hierarchy, findPathToName]);

  // QR/Barcode: detect part or seam id and select related part
  const handleQRDetect = useCallback((text) => {
    try {
      const code = String(text || '').trim();
      if (!code) return;

      // Optional prefixes: seam:<id>, step:<id> or step:<part>:<index>
      const seamPref = code.match(/^seam:(.+)$/i);
      const stepPref = code.match(/^step:(.+)$/i);

      // 1) Try seam match first (with or without prefix)
      const seamId = seamPref ? seamPref[1] : code;
      const seams = weldSeams || [];
      let seam = seams.find(s => s.id === seamId);
      if (!seam && !seamPref) {
        // If not prefixed and not found, still try raw code as seam after step attempt
      } else if (seam && seam.partName) {
        setSelectedPart(seam.partName);
        try { updateWeldSeam(seam.id, { status: 'qa', updatedAt: Date.now() }); } catch {}
        console.log('QR matched seam:', seamId, '-> part:', seam.partName);
        return;
      }

      // 2) Try assembly step mapping
      const steps = assemblySteps || [];
      let st = null;
      let stepId = null, partFromQR = null, stepIndex1 = null;
      if (stepPref) {
        const payload = stepPref[1];
        const mIdx = payload.match(/^([^:]+):(\d+)$/);
        if (mIdx) { partFromQR = mIdx[1]; stepIndex1 = parseInt(mIdx[2], 10); }
        else { stepId = payload; }
      }

      if (!st && stepId) st = steps.find(x => x.id === stepId);
      if (!st && partFromQR) {
        const arr = steps.filter(x => (x.partName || '') === partFromQR);
        if (arr.length > 0) {
          const idx0 = Math.max(0, Math.min((stepIndex1 ? stepIndex1 - 1 : 0), arr.length - 1));
          st = arr[idx0];
        }
      }
      if (!st && !stepPref) {
        // Try raw code as a step id
        st = steps.find(x => x.id === code);
      }

      if (st) {
        setSelectedPart(st.partName);
        try {
          const arr = steps.filter(x => (x.partName || '') === (st.partName || ''));
          const idx = arr.findIndex(x => x.id === st.id);
          if (idx >= 0 && modelRef.current?.setStepIndex) modelRef.current.setStepIndex(idx);
        } catch {}
        try {
          if (!st.status || st.status === 'pending') {
            updateAssemblyStep(st.id, { status: 'in_progress', startedAt: Date.now() });
          } else if (st.status === 'in_progress') {
            updateAssemblyStep(st.id, { status: 'done', finishedAt: Date.now() });
            if (modelRef.current?.nextStep) modelRef.current.nextStep();
          }
        } catch {}
        console.log('QR matched assembly step:', st.id, '-> part:', st.partName);
        return;
      }

      // 3) If not matched as step, re-try seam without prefix
      if (!seamPref && !seam) {
        seam = seams.find(s => s.id === code);
        if (seam && seam.partName) {
          setSelectedPart(seam.partName);
          try { updateWeldSeam(seam.id, { status: 'qa', updatedAt: Date.now() }); } catch {}
          console.log('QR matched seam (fallback):', code, '-> part:', seam.partName);
          return;
        }
      }

      // 4) Fallback: treat as part name
      setSelectedPart(code);
      console.log('QR fallback to part name:', code);
    } catch (e) {
      console.warn('QR detect error:', e);
    }
  }, [weldSeams, assemblySteps, updateWeldSeam, updateAssemblyStep, modelRef]);

  const handleStatusChange = (status) => {
    if (!selectedPart) return;

    setPartStatuses(prev => ({
      ...prev,
      [selectedPart]: status
    }));

   // Excel kaydı kaldırıldı

    console.log(`Status updated for ${selectedPart} to ${status}`);
  };

  const updatePartDetail = (field, value) => {
    if (!selectedPart) return;
    let nextDetailsForPart;
    setPartDetails(prev => {
      nextDetailsForPart = {
        ...(prev[selectedPart] || initialPartDetails),
        [field]: value
      };
      return {
        ...prev,
        [selectedPart]: nextDetailsForPart
      };
    });

   // Excel kaydı kaldırıldı

    console.log(`Detail ${field} updated for ${selectedPart} to ${value}`);
  };

  // -------- Rota (Route) yardımcıları --------
  const ensurePartDetails = useCallback(() => {
    setPartDetails(prev => {
      if (prev[selectedPart]) return prev;
      return { ...prev, [selectedPart]: { ...initialPartDetails } };
    });
  }, [selectedPart]);

  const addRouteStage = () => {
    if (!selectedPart) return;
    const name = (newRouteStageName || '').trim();
    if (!name) return;
    setPartDetails(prev => {
      const cur = prev[selectedPart] || { ...initialPartDetails };
      const stages = Array.isArray(cur.routeStages) ? [...cur.routeStages] : [];
      stages.push(name);
      // Eğer ilk kez ekleniyorsa current -1 kalsın; kullanıcı belirlesin
      const next = {
        ...cur,
        routeStages: stages
      };
      return { ...prev, [selectedPart]: next };
    });
    setNewRouteStageName('');
  };

  const removeRouteStage = (idx) => {
    if (!selectedPart) return;
    setPartDetails(prev => {
      const cur = prev[selectedPart] || { ...initialPartDetails };
      const stages = Array.isArray(cur.routeStages) ? [...cur.routeStages] : [];
      if (idx < 0 || idx >= stages.length) return prev;
      stages.splice(idx, 1);
      let curIdx = cur.routeCurrentIndex ?? -1;
      if (curIdx === idx) {
        // Silinen aktif aşamaydı -> seçimi temizle
        curIdx = -1;
      } else if (curIdx > idx) {
        // Aktif aşama silinenin arkasındaysa bir basamak geri kaydır
        curIdx = curIdx - 1;
      }
      const next = {
        ...cur,
        routeStages: stages,
        routeCurrentIndex: stages.length === 0 ? -1 : Math.max(-1, Math.min(curIdx, stages.length - 1))
      };
      return { ...prev, [selectedPart]: next };
    });
  };

  const setRouteCurrentIndex = (idx) => {
    if (!selectedPart) return;
    setPartDetails(prev => {
      const cur = prev[selectedPart] || { ...initialPartDetails };
      const stages = Array.isArray(cur.routeStages) ? cur.routeStages : [];
      const clamped = (typeof idx === 'number') ? Math.max(-1, Math.min(idx, stages.length - 1)) : -1;
      const next = { ...cur, routeCurrentIndex: clamped };
      return { ...prev, [selectedPart]: next };
    });
  };
  // -------------------------------------------

  const toggleIsolation = () => {
    setIsIsolated(!isIsolated);
  };

  const getFilteredHierarchy = () => {
    if (!hierarchy || Object.keys(hierarchy).length === 0) return {};
    if (!searchTerm && !filterStatus) return hierarchy;

    const result = {};
    function filterLevel(levelData, currentResultLevel) {
        for (const itemName in levelData) {
            const item = levelData[itemName];
            let match = false;
            let filteredChildren = {};

            if (item.isMesh) {
                const status = partStatuses[item.name];
                const nameMatch = item.name.toLowerCase().includes(searchTerm.toLowerCase());
                const statusMatch = !filterStatus || status === filterStatus;
                match = nameMatch && statusMatch;
            } else if (item.children && Object.keys(item.children).length > 0) {
                const nameMatch = item.name.toLowerCase().includes(searchTerm.toLowerCase());
                const childrenResult = {};
                filterLevel(item.children, childrenResult);
                if (Object.keys(childrenResult).length > 0) {
                    match = true;
                    filteredChildren = childrenResult;
                }
                if (nameMatch && !filterStatus) {
                    match = true;
                    if (Object.keys(filteredChildren).length === 0) filteredChildren = item.children;
                }
            }

            if (match) {
                currentResultLevel[itemName] = {
                    ...item,
                    children: Object.keys(filteredChildren).length > 0 ? filteredChildren : (item.isMesh ? {} : item.children)
                };
            }
        }
    }

    filterLevel(hierarchy, result);
    return result;
  };

  const filteredHierarchy = getFilteredHierarchy();

  const formatPartName = (partName, count) => {
    return count > 1 ? `${partName} (x${count})` : partName;
  };

  const selectedPartCurrentDetails = selectedPart ? (partDetails[selectedPart] || initialPartDetails) : initialPartDetails;
  const isAdmin = user && user.role === 'admin';

  // Public portal route: render without login
  if (shareToken) {
    return <PublicPortal token={shareToken} />;
  }
  // Kullanıcı giriş yapmamışsa Login bileşenini göster
  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  // Projeler sayfası
  if (page === 'projects') {
    return (
      <Projects
        user={user}
        items={projectsItems || undefined}
        onSelect={(machine) => {
          setSelectedMachine(machine);
          setPage('machine');
        }}
      />
    );
  }

  // Rapor/Dashboard sayfası (MachineModel içinden tetiklenebilir)
  if (viewMode === 'dashboard') {
    return <Dashboard onBack={() => { setViewMode('normal'); setPage('machine'); }} />;
  }
  if (viewMode === 'settings') {
    return (
      <Settings
        onBack={() => { setViewMode('normal'); setPage('machine'); }}
        applyDarkMode={(v) => setDarkMode(!!v)}
        applyBigButtons={(v) => setBigButtons(!!v)}
      />
    );
  }
  if (viewMode === 'admin') {
    return (
      <Admin
        user={user}
        onBack={() => { setViewMode('normal'); setPage('machine'); }}
      />
    );
  }

  const renderHierarchyLevel = (levelData, indent = 0, parentKey = '') => {
    return Object.keys(levelData).map(key => {
      const item = levelData[key];
      if (!item || !item.name) return null;

      const itemName = item.name;
      const nodeKey = parentKey ? `${parentKey}>${itemName}` : itemName;
      const isParentNode = item && typeof item === 'object' && !item.isMesh && item.children && Object.keys(item.children).length > 0;
      const expanded = expandedNodes.has(nodeKey);
      const status = partStatuses[itemName];
      const statusColor = statusColors[status] || 'gray';
      const details = partDetails[itemName] || {};

      const toggleNode = (e) => {
        e.stopPropagation();
        setExpandedNodes(prev => {
          const next = new Set(prev);
          if (expanded) next.delete(nodeKey);
          else next.add(nodeKey);
          return next;
        });
      };

      return (
        <React.Fragment key={nodeKey + '-' + indent}>
          <li
            className={`part-tree-item ${selectedPart === itemName ? 'selected' : ''}`}
            onClick={() => handleMenuPartSelect(itemName, !item.isMesh)}
            style={{
              padding: `8px 8px 8px ${10 + indent * 20}px`,
              cursor: 'pointer',
              backgroundColor: selectedPart === itemName ? '#e0e0ff' : 'transparent',
              borderLeft: status && item.isMesh ? `4px solid ${statusColor}` : '4px solid transparent',
              marginBottom: '4px',
              borderRadius: '4px',
              transition: 'all 0.3s ease',
              fontWeight: !item.isMesh ? 'bold' : 'normal'
            }}
            data-part-name={itemName}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                {isParentNode ? (
                  <span
                    onClick={toggleNode}
                    title={expanded ? 'Daralt' : 'Genişlet'}
                    style={{ cursor: 'pointer', userSelect: 'none', width: 16, display: 'inline-block' }}
                  >
                    {expanded ? '▼' : '▶'}
                  </span>
                ) : (
                  <span style={{ width: 16, display: 'inline-block' }}>•</span>
                )}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {formatPartName(itemName, item.count)}
                </span>
              </div>
              {item.isMesh && details.dueDate && (
                <span style={{ fontSize: '0.7rem', color: '#888' }}>
                  Termin: {new Date(details.dueDate).toLocaleDateString()}
                </span>
              )}
            </div>
            {item.isMesh && status && (
              <div
                style={{
                  fontSize: '0.8rem',
                  color: '#666',
                  marginTop: '3px',
                  display: 'flex',
                  justifyContent: 'space-between'
                }}
              >
                <span>{status}</span>
                {details.machineType && <span>{details.machineType}</span>}
              </div>
            )}
          </li>
          {isParentNode && expanded && renderHierarchyLevel(item.children, indent + 1, nodeKey)}
        </React.Fragment>
      );
    });
  };

  return (
    <div className="app-container" style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* Üst bar: Projeler ve seçili makine bilgisi */}
      <div
        style={{
          height: '50px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 12px',
          borderBottom: '1px solid #e6e6e6',
          backgroundColor: '#ffffff',
          flexShrink: 0
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Projeler butonu ve seçili makine bilgisi Ribbon > Hesap sekmesinin sağ tarafına taşındı */}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {!online && (
            <div title={`Offline mod — kuyrukta ${(offlineQueueLen || 0)} işlem`} style={{ background: '#e74c3c', color: '#fff', padding: '4px 8px', borderRadius: 6, fontSize: 12 }}>
              Offline{offlineQueueLen > 0 ? ` • ${offlineQueueLen}` : ''}
            </div>
          )}
          {/* Tema/Buton büyüklüğü ve kullanıcı bilgisi Ribbon > Hesap sekmesine taşındı */}
        </div>
      </div>

      <div ref={layoutRef} style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
        {/* Sol Parça Ağacı (Sidebar) */}
        <div
          className="part-list-container"
          style={{
            width: sidebarCollapsed ? 0 : `${Math.round(sidebarWidth)}px`,
            transition: 'width 0.15s ease',
            overflowX: 'hidden',
            overflowY: 'auto',
            padding: sidebarCollapsed ? '0' : '10px',
            borderRight: '1px solid #ccc',
            backgroundColor: '#f9f9f9',
            maxHeight: 'calc(100vh - 60px - 60px)',
            position: 'relative',
            flexShrink: 0
          }}
        >
          {!sidebarCollapsed && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <h3 style={{ margin: 0 }}>Parça Ağacı</h3>
                <button
                  onClick={() => setSidebarCollapsed(true)}
                  title="Yan paneli gizle"
                  style={{
                    border: '1px solid #ccc',
                    background: '#fff',
                    borderRadius: 4,
                    padding: '2px 6px',
                    cursor: 'pointer'
                  }}
                >
                  ⟨
                </button>
              </div>
              {Object.keys(filteredHierarchy).length > 0 ? (
                <ul style={{ listStyleType: 'none', padding: 0, margin: 0 }}>
                  {renderHierarchyLevel(filteredHierarchy)}
                </ul>
              ) : (
                <p>Filtreyle eşleşen parça bulunamadı veya model yüklenmedi.</p>
              )}
            </>
          )}
        </div>

        {/* Sürüklenebilir dikey ayraç + Gizle/Göster butonu */}
        <div
          onPointerDown={(e) => {
            e.preventDefault();
            setIsSidebarDragging(true);
          }}
          style={{
            width: 6,
            cursor: 'col-resize',
            background: '#e0e0e0',
            borderRight: '1px solid #ccc',
            flexShrink: 0,
            position: 'relative',
            zIndex: 2
          }}
          title="Sürükleyerek genişliği ayarla"
        >
          <button
            onClick={() => setSidebarCollapsed(c => !c)}
            title={sidebarCollapsed ? 'Yan paneli göster' : 'Yan paneli gizle'}
            style={{
              position: 'absolute',
              top: 6,
              left: '50%',
              transform: 'translateX(-50%)',
              width: 22,
              height: 22,
              display: 'grid',
              placeItems: 'center',
              borderRadius: 4,
              border: '1px solid #bbb',
              background: '#fff',
              cursor: 'pointer',
              fontSize: 12,
              padding: 0
            }}
          >
            {sidebarCollapsed ? '⟩' : '⟨'}
          </button>
        </div>

        {/* Sağ ana içerik */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ height: bottomCollapsed ? '100%' : `calc(100% - ${bottomHeight}px)`, position: 'relative', backgroundColor: '#ffffff', overflow: 'hidden' }}>
            {modelCheck.status === 'invalid' ? (
              <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 16 }}>
                <div style={{ background: '#ffffff', border: '1px solid #ddd', borderRadius: 6, padding: 16, color: '#333', maxWidth: 520, textAlign: 'center' }}>
                  <strong>Model yüklenemedi</strong>
                  <div style={{ marginTop: 6, fontSize: 13, color: '#666' }}>{modelCheck.message || 'Geçersiz GLB dosyası.'}</div>
                  <div style={{ marginTop: 8, fontSize: 12, color: '#777' }}>
                    Lütfen valid GLB dosyasını public/models altına koyun (hiyerarşi/isimler değişmeden).
                  </div>
                </div>
              </div>
            ) : (
            <ErrorBoundary>
              <Canvas
                camera={{ position: [0, 1.5, 7], fov: 50 }}
                dpr={[1, 2]}
                gl={{
                  antialias: true,
                  powerPreference: 'high-performance',
                  stencil: false,
                  depth: true,
                  alpha: false,
                  preserveDrawingBuffer: false,
                  failIfMajorPerformanceCaveat: true
                }}
                onCreated={({ gl, scene }) => {
                  // Keep clipping disabled by default; MachineModel toggles it only when needed
                  try { gl.setClearColor(0xffffff, 1); } catch {}
                  try { gl.outputColorSpace = THREE.SRGBColorSpace; } catch {}
                  try {
                    gl.toneMapping = THREE.ACESFilmicToneMapping;
                    gl.toneMappingExposure = 0.9;
                    gl.physicallyCorrectLights = true;
                  } catch {}
                  gl.localClippingEnabled = false;
                }}
                frameloop="demand"
                style={{ touchAction: 'none' }}
              >
                <ambientLight intensity={0.35} />
                <directionalLight
                  position={[10, 15, 10]}
                  intensity={0.9}
                />
                <CustomControls modelRef={modelRef} selectedPart={selectedPart} />
                <React.Suspense fallback={null}>
                  <MachineModel
                    ref={modelRef}
                    modelUrl={selectedMachine?.modelUrl}
                    selectedPart={selectedPart}
                    selectedAssemblyKey={selectedAssemblyKey}
                    onPartClick={handlePartClick}
                    partStatuses={partStatuses}
                    onHierarchyReady={handleHierarchyReady}
                    isIsolated={isIsolated}
                    toggleIsolation={toggleIsolation}
                    filterStatus={filterStatus}
                    setFilterStatus={setFilterStatus}
                    explosionFactor={explosionFactor}
                    setExplosionFactor={setExplosionFactor}
                    onLogout={handleLogout}
                    onSettings={() => setViewMode('settings')}
                    searchTerm={searchTerm}
                    setSearchTerm={setSearchTerm}
                    viewMode={viewMode}
                    setViewMode={setViewMode}
                    darkMode={darkMode}
                    setDarkMode={setDarkMode}
                    bigButtons={bigButtons}
                    setBigButtons={setBigButtons}
                    user={user}
                    selectedMachine={selectedMachine}
                    onGoToProjects={() => setPage('projects')}
                  />
                </React.Suspense>
              </Canvas>
            </ErrorBoundary>
            )}
          </div>

          {/* Yatay sürüklenebilir ayraç + kapat/aç butonu */}
          <div
            onPointerDown={(e) => { e.preventDefault(); setIsBottomDragging(true); }}
            style={{
              height: 6,
              cursor: 'row-resize',
              background: '#e0e0e0',
              borderTop: '1px solid #ccc',
              borderBottom: '1px solid #ccc',
              position: 'relative',
              flexShrink: 0,
              zIndex: 2
            }}
            title="Sürükleyerek alt bölge yüksekliğini ayarla"
          >
            <button
              onClick={() => setBottomCollapsed(c => !c)}
              title={bottomCollapsed ? 'Alt alanı göster' : 'Alt alanı gizle'}
              style={{
                position: 'absolute',
                right: 8,
                top: -10,
                border: '1px solid #bbb',
                background: '#fff',
                borderRadius: 4,
                padding: '0 6px',
                height: 22,
                display: 'grid',
                placeItems: 'center',
                cursor: 'pointer',
                fontSize: 12
              }}
            >
              {bottomCollapsed ? '▲' : '▼'}
            </button>
          </div>

          <div
            style={{
              height: bottomCollapsed ? '0px' : `${bottomHeight}px`,
              padding: '15px',
              borderTop: '1px solid #ccc',
              overflowY: 'auto',
              backgroundColor: '#ffffff',
              maxHeight: bottomCollapsed ? '0px' : `${bottomHeight}px`,
              transition: 'height 0.2s ease'
            }}
          >
            <h3 style={{ margin: '0 0 10px 0' }}>Parça Detayı</h3>
            {selectedPart ? (
              <div style={{ border: '1px solid #e2e2e2', borderRadius: 8, padding: 12, background: '#fafafa', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px' }}>
                  <div style={{ flex: 1, minWidth: '280px' }}>
                    <p><strong>Ad:</strong> {formatPartName(selectedPart, filteredHierarchy[Object.keys(filteredHierarchy)[0]]?.[selectedPart]?.count)}</p>
                    <div style={{ marginBottom: '10px' }}>
                      <label style={{ display: 'block', marginBottom: '6px', fontSize: 12, color: '#555', fontWeight: 'normal' }}>Durum</label>
                      <select
                        value={partStatuses[selectedPart] || ''}
                        onChange={(e) => handleStatusChange(e.target.value)}
                        style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #ccc', backgroundColor: 'white' }}
                      >
                        <option value="">Seçiniz</option>
                        {Object.keys(statusColors).map(statusKey => (
                          <option
                            key={statusKey}
                            value={statusKey}
                            disabled={(statusKey === 'kalitede' && user.role !== 'quality' && user.role !== 'admin')}
                          >
                            {statusKey.charAt(0).toUpperCase() + statusKey.slice(1)}
                          </option>
                        ))}
                      </select>
                    </div>


                    {partStatuses[selectedPart] !== 'tezgahta' && partStatuses[selectedPart] !== 'fason' && (
                      <div style={{ marginBottom: '10px' }}>
                        <label htmlFor="purchaseStatus" style={{ display: 'block', marginBottom: '6px', fontSize: 12, color: '#555', fontWeight: 'normal' }}>Satın Alma Durumu</label>
                        <select
                          id="purchaseStatus"
                          value={selectedPartCurrentDetails.purchaseStatus}
                          onChange={(e) => updatePartDetail('purchaseStatus', e.target.value)}
                          style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #ccc', backgroundColor: 'white' }}
                        >
                          <option value="">Seçiniz</option>
                          {purchaseStatuses.map(status => (
                            <option key={status} value={status}>{status}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Location field for non-fason statuses */}
                    {partStatuses[selectedPart] !== 'fason' && (
                      <div style={{ marginBottom: '10px' }}>
                        <label htmlFor="location" style={{ display: 'block', marginBottom: '6px', fontSize: 12, color: '#555', fontWeight: 'normal' }}>Konum</label>
                        <input
                          type="text"
                          id="location"
                          value={selectedPartCurrentDetails.location || ''}
                          onChange={(e) => updatePartDetail('location', e.target.value)}
                          style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #ccc' }}
                        />
                      </div>
                    )}
                  </div>
                  
                  <div style={{ flex: 1, minWidth: '280px' }}>
                    {partStatuses[selectedPart] === 'fason' && (
                      <>
                        <div style={{ marginBottom: '10px' }}>
                          <label htmlFor="outsourceCompany" style={{ display: 'block', marginBottom: '6px', fontSize: 12, color: '#555', fontWeight: 'normal' }}>Fason Firma</label>
                          <input
                            type="text"
                            id="outsourceCompany"
                            value={selectedPartCurrentDetails.outsourceCompany || ''}
                            onChange={(e) => updatePartDetail('outsourceCompany', e.target.value)}
                            style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #ccc' }}
                          />
                        </div>

                        <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                          <div style={{ flex: 1 }}>
                            <label htmlFor="outsourceDate" style={{ display: 'block', marginBottom: '6px', fontSize: 12, color: '#555', fontWeight: 'normal' }}>Gönderim Tarihi</label>
                            <input
                              type="date"
                              id="outsourceDate"
                              value={selectedPartCurrentDetails.outsourceDate || ''}
                              onChange={(e) => updatePartDetail('outsourceDate', e.target.value)}
                              style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #ccc' }}
                            />
                          </div>
                          <div style={{ flex: 1 }}>
                            <label htmlFor="dueDate" style={{ display: 'block', marginBottom: '6px', fontSize: 12, color: '#555', fontWeight: 'normal' }}>Termin Tarihi</label>
                            <input
                              type="date"
                              id="dueDate"
                              value={selectedPartCurrentDetails.dueDate || ''}
                              onChange={(e) => updatePartDetail('dueDate', e.target.value)}
                              style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #ccc' }}
                            />
                          </div>
                        </div>

                        <div style={{ marginBottom: '10px' }}>
                          <label htmlFor="purchaseStatus" style={{ display: 'block', marginBottom: '6px', fontSize: 12, color: '#555', fontWeight: 'normal' }}>Satın Alma Durumu</label>
                          <select
                            id="purchaseStatus"
                            value={selectedPartCurrentDetails.purchaseStatus}
                            onChange={(e) => updatePartDetail('purchaseStatus', e.target.value)}
                            style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #ccc', backgroundColor: 'white' }}
                          >
                            <option value="">Seçiniz</option>
                            {purchaseStatuses.map(status => (
                              <option key={status} value={status}>{status}</option>
                            ))}
                          </select>
                        </div>
                      </>
                    )}

                    {/* Deadline date for non-fason statuses */}
                    {partStatuses[selectedPart] !== 'fason' && (
                      <div style={{ marginBottom: '10px' }}>
                        <label htmlFor="dueDate" style={{ display: 'block', marginBottom: '6px', fontSize: 12, color: '#555', fontWeight: 'normal' }}>Termin Tarihi</label>
                        <input
                          type="date"
                          id="dueDate"
                          value={selectedPartCurrentDetails.dueDate || ''}
                          onChange={(e) => updatePartDetail('dueDate', e.target.value)}
                          style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #ccc' }}
                        />
                      </div>
                    )}

                    {/* Deadline animation */}
                    {selectedPartCurrentDetails.dueDate && (
                      <div style={{ marginBottom: '10px' }}>
                        <DeadlineIndicator dueDate={selectedPartCurrentDetails.dueDate} />
                      </div>
                    )}

                    <div style={{ marginBottom: '10px' }}>
                      <label htmlFor="notes" style={{ display: 'block', marginBottom: '6px', fontSize: 12, color: '#555', fontWeight: 'normal' }}>Notlar</label>
                      <textarea
                        id="notes"
                        value={selectedPartCurrentDetails.notes || ''}
                        onChange={(e) => updatePartDetail('notes', e.target.value)}
                        style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #ccc', minHeight: '60px', resize: 'vertical' }}
                      />
                    </div>

                    {/* Rota Planlama */}
                    <div style={{ border: '1px solid #e2e2e2', borderRadius: 8, padding: 10, background: '#fff', marginBottom: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <strong>Rota</strong>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <input
                            type="text"
                            placeholder="Yeni aşama adı..."
                            value={newRouteStageName}
                            onChange={(e) => setNewRouteStageName(e.target.value)}
                            onFocus={ensurePartDetails}
                            style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #ccc' }}
                          />
                          <button
                            onClick={addRouteStage}
                            style={{ padding: '6px 10px', border: '1px solid #d0d0d0', borderRadius: 6, background: '#f7f7f7', cursor: 'pointer' }}
                            title="Aşama ekle"
                          >
                            Ekle
                          </button>
                        </div>
                      </div>

                      {/* Aşamalar listesi */}
                      <div style={{ marginTop: 8 }}>
                        {(selectedPartCurrentDetails.routeStages || []).length === 0 ? (
                          <div style={{ fontSize: 12, color: '#777' }}>Henüz rota aşaması eklenmemiş.</div>
                        ) : (
                          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                              <tr style={{ background: '#fafafa' }}>
                                <th style={{ textAlign: 'left', borderBottom: '1px solid #eee', padding: '6px' }}>#</th>
                                <th style={{ textAlign: 'left', borderBottom: '1px solid #eee', padding: '6px' }}>Aşama</th>
                                <th style={{ textAlign: 'right', borderBottom: '1px solid #eee', padding: '6px' }}>İşlem</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(selectedPartCurrentDetails.routeStages || []).map((stg, idx) => {
                                const isActive = (selectedPartCurrentDetails.routeCurrentIndex ?? -1) === idx;
                                return (
                                  <tr key={`route-${idx}`} style={{ borderBottom: '1px solid #f0f0f0' }}>
                                    <td style={{ padding: '6px' }}>{idx + 1}</td>
                                    <td style={{ padding: '6px' }}>
                                      <span style={{ fontWeight: isActive ? 700 : 400 }}>
                                        {stg}{isActive ? ' (AKTİF)' : ''}
                                      </span>
                                    </td>
                                    <td style={{ padding: '6px', textAlign: 'right', display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                                      <button
                                        onClick={() => setRouteCurrentIndex(idx)}
                                        style={{ padding: '4px 8px', border: '1px solid #d0d0d0', borderRadius: 6, background: '#eef7ff', cursor: 'pointer' }}
                                        title="Bu aşamayı aktif yap"
                                      >
                                        Seç
                                      </button>
                                      <button
                                        onClick={() => removeRouteStage(idx)}
                                        style={{ padding: '4px 8px', border: '1px solid #d0d0d0', borderRadius: 6, background: '#fff5f5', cursor: 'pointer' }}
                                        title="Aşamayı sil"
                                      >
                                        🗑️
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        )}
                      </div>

                      {/* Aktif aşama seçimi */}
                      <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <label style={{ fontSize: 12, color: '#555' }}>Aktif Aşama:</label>
                        <select
                          value={(selectedPartCurrentDetails.routeCurrentIndex ?? -1)}
                          onChange={(e) => setRouteCurrentIndex(parseInt(e.target.value, 10))}
                          style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #ccc' }}
                        >
                          <option value={-1}>Seçilmemiş</option>
                          {(selectedPartCurrentDetails.routeStages || []).map((stg, idx) => (
                            <option key={`route-opt-${idx}`} value={idx}>
                              {idx + 1}. {stg}
                            </option>
                          ))}
                        </select>

                        {((selectedPartCurrentDetails.routeStages || []).length > 0) && (selectedPartCurrentDetails.routeCurrentIndex ?? -1) >= 0 && (
                          <span style={{ fontSize: 12, color: '#333' }}>
                            ({(selectedPartCurrentDetails.routeCurrentIndex ?? 0) + 1}/{(selectedPartCurrentDetails.routeStages || []).length})
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              <DefectPanel selectedPart={selectedPart} />
              <QRScanner onDetect={handleQRDetect} />
              </div>
            ) : (
              <p>Lütfen detaylarını görmek için bir parça seçin.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}