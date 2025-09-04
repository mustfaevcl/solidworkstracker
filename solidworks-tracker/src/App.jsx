import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
const MachineModel = React.lazy(() => import('./components/MachineModel'));
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import Projects from './components/Projects';

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
const machineTypes = [
  'CNC',
  'Torna',
  'Freze',
  'Borwerk',
  'Kaynak',
  'Tesviye'
];

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
    if (selectedPart && modelRef.current && controlsRef.current && camera) {
      const object = modelRef.current.getObjectByName(selectedPart);
      if (object) {
        const box = new THREE.Box3().setFromObject(object);
        const center = box.getCenter(new THREE.Vector3());
        
        // Sadece kontrol hedefini değiştir, kamera pozisyonunu değiştirme
        // Bu şekilde kamera açısı sabit kalır, sadece bakış noktası değişir
        controlsRef.current.target.copy(center);
        controlsRef.current.update();
        
        // Parçayı vurgulamak için modelRef'i kullanabiliriz, ama kamera açısını değiştirmiyoruz
        if (modelRef.current.focusOnPart) {
          modelRef.current.focusOnPart(selectedPart);
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


export default function App() {
  // Kullanıcı giriş durumu
  const [user, setUser] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [selectedPart, setSelectedPart] = useState(null);
  const [partStatuses, setPartStatuses] = useState({});
  const [hierarchy, setHierarchy] = useState({});
  const [isIsolated, setIsIsolated] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState(null);
  const [viewMode, setViewMode] = useState('normal'); // 'normal' | 'wireframe' | 'xray' ... (MachineModel için görünüm modu)
  const [explosionFactor, setExplosionFactor] = useState(0.05); // Patlatma faktörü
  // Sayfa yönlendirme durumu: 'projects' | 'machine'
  const [page, setPage] = useState('projects');
  const [selectedMachine, setSelectedMachine] = useState(null);

  const initialPartDetails = {
    purchaseStatus: '',
    location: '',
    machineType: '',
    outsourceCompany: '',
    outsourceDate: '',
    dueDate: '',
    notes: ''
  };
  const [partDetails, setPartDetails] = useState({});
// Data API (Excel/Sheets) entegrasyonu kullanıcı isteği ile kaldırıldı
const endpoints = null;

  // Excel/Sheets kaydı kaldırıldı

  // saveRecord kaldırıldı

  // Excel'den kayıt yükleme kaldırıldı

  const modelRef = useRef();
  const cameraRef = useRef();

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
    // No camera movement should happen here
  };

  const handleMenuPartSelect = (partName) => {
    setSelectedPart(partName);
  };

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

  // Kullanıcı giriş yapmamışsa Login bileşenini göster
  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  // Projeler sayfası
  if (page === 'projects') {
    return (
      <Projects
        user={user}
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

  const renderHierarchyLevel = (levelData, indent = 0) => {
    return Object.keys(levelData).map(key => {
        const item = levelData[key];
        if (!item || !item.name) return null;

        const itemName = item.name;
        const isParentNode = item && typeof item === 'object' && !item.isMesh && item.children && Object.keys(item.children).length > 0;
        const status = partStatuses[itemName];
        const statusColor = statusColors[status] || 'gray';
        const details = partDetails[itemName] || {};

        return (
            <React.Fragment key={itemName + '-' + indent}>
                <li
                    className={`part-tree-item ${selectedPart === itemName ? 'selected' : ''}`}
                    onClick={() => item.isMesh ? handleMenuPartSelect(itemName) : console.log("Clicked on group:", itemName)}
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
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>{formatPartName(itemName, item.count)}</span>
                        {item.isMesh && details.dueDate && (
                             <span style={{ fontSize: '0.7rem', color: '#888'}}>
                                Termin: {new Date(details.dueDate).toLocaleDateString()}
                             </span>
                        )}
                    </div>
                     {item.isMesh && status && (
                        <div style={{
                          fontSize: '0.8rem',
                          color: '#666',
                          marginTop: '3px',
                          display: 'flex',
                          justifyContent: 'space-between'
                        }}>
                          <span>{status}</span>
                          {details.machineType && <span>{details.machineType}</span>}
                        </div>
                      )}
                </li>
                {isParentNode && renderHierarchyLevel(item.children, indent + 1)}
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
          <button
            onClick={() => setPage('projects')}
            style={{
              padding: '6px 10px',
              border: '1px solid #d0d0d0',
              borderRadius: 6,
              background: '#f7f7f7',
              cursor: 'pointer'
            }}
          >
            Projeler
          </button>
          {selectedMachine && (
            <div style={{ marginLeft: 8, color: '#2c3e50', display: 'flex', gap: 12, alignItems: 'baseline' }}>
              <strong>{selectedMachine.name}</strong>
              <span style={{ color: '#7f8c8d', fontSize: '0.9rem' }}>Takipçi: {selectedMachine.tracker}</span>
            </div>
          )}
        </div>
        <div style={{ color: '#7f8c8d', fontSize: '0.9rem' }}>{user?.name}</div>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div className="part-list-container" style={{ width: '350px', overflowY: 'auto', padding: '10px', borderRight: '1px solid #ccc', backgroundColor: '#f9f9f9', maxHeight: 'calc(100vh - 60px - 60px)' }}>
          <h3>Parça Ağacı</h3>
          {Object.keys(filteredHierarchy).length > 0 ? (
            <ul style={{ listStyleType: 'none', padding: 0 }}>
                {renderHierarchyLevel(filteredHierarchy)}
            </ul>
          ) : (
            <p>Filtreyle eşleşen parça bulunamadı veya model yüklenmedi.</p>
          )}
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ flex: 1, position: 'relative', backgroundColor: '#ffffff', overflow: 'hidden' }}>
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
                try { gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.0; } catch {}
                gl.localClippingEnabled = false;
              }}
              frameloop="demand"
              style={{ touchAction: 'none' }}
            >
              <ambientLight intensity={0.9} />
              <directionalLight
                position={[10, 15, 10]}
                intensity={1.2}
              />
              <CustomControls modelRef={modelRef} selectedPart={selectedPart} />
              <React.Suspense fallback={null}>
                <MachineModel
                  ref={modelRef}
                  modelUrl={selectedMachine?.modelUrl}
                  selectedPart={selectedPart}
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
                  onSettings={() => console.log('Settings clicked')}
                  searchTerm={searchTerm}
                  setSearchTerm={setSearchTerm}
                  viewMode={viewMode}
                  setViewMode={setViewMode}
                />
              </React.Suspense>
            </Canvas>
          </div>

          <div style={{ height: '200px', padding: '15px', borderTop: '1px solid #ccc', overflowY: 'auto', backgroundColor: '#ffffff', maxHeight: '200px' }}>
           <h3 style={{ margin: '0 0 10px 0' }}>Parça Detayı</h3>
            {selectedPart ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px' }}>
                  <div style={{ flex: 1, minWidth: '280px' }}>
                    <p><strong>Ad:</strong> {formatPartName(selectedPart, filteredHierarchy[Object.keys(filteredHierarchy)[0]]?.[selectedPart]?.count)}</p>
                    <div style={{ marginBottom: '10px' }}>
                      <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Durum:</label>
                      <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                        {Object.keys(statusColors).map(statusKey => (
                            <button
                                key={statusKey}
                                onClick={() => handleStatusChange(statusKey)}
                                style={{
                                    backgroundColor: statusColors[statusKey],
                                    color: 'white',
                                    border: 'none',
                                    padding: '6px 10px',
                                    borderRadius: '3px',
                                    cursor: 'pointer',
                                    opacity: (statusKey === 'kalitede' && user.role !== 'quality' && user.role !== 'admin') ? 0.5 : (partStatuses[selectedPart] === statusKey ? 1 : 0.7),
                                    pointerEvents: (statusKey === 'kalitede' && user.role !== 'quality' && user.role !== 'admin') ? 'none' : 'auto'
                                }}
                                disabled={(statusKey === 'kalitede' && user.role !== 'quality' && user.role !== 'admin')}
                            >
                                {statusKey.charAt(0).toUpperCase() + statusKey.slice(1)}
                            </button>
                        ))}
                      </div>
                    </div>

                    {/* Conditional rendering based on part status */}
                    {partStatuses[selectedPart] === 'tezgahta' && (
                      <div style={{ marginBottom: '10px' }}>
                        <label htmlFor="machineType" style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Tezgah Türü:</label>
                        <select
                          id="machineType"
                          value={selectedPartCurrentDetails.machineType}
                          onChange={(e) => updatePartDetail('machineType', e.target.value)}
                          style={{ width: '100%', padding: '8px', borderRadius: '3px', border: '1px solid #ccc', backgroundColor: 'white' }}
                        >
                          <option value="">Seçiniz</option>
                          {machineTypes.map(type => (
                            <option key={type} value={type}>{type}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {partStatuses[selectedPart] !== 'tezgahta' && partStatuses[selectedPart] !== 'fason' && (
                      <div style={{ marginBottom: '10px' }}>
                        <label htmlFor="purchaseStatus" style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Satın Alma Durumu:</label>
                        <select
                          id="purchaseStatus"
                          value={selectedPartCurrentDetails.purchaseStatus}
                          onChange={(e) => updatePartDetail('purchaseStatus', e.target.value)}
                          style={{ width: '100%', padding: '8px', borderRadius: '3px', border: '1px solid #ccc', backgroundColor: 'white' }}
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
                        <label htmlFor="location" style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Konum:</label>
                        <input
                          type="text"
                          id="location"
                          value={selectedPartCurrentDetails.location || ''}
                          onChange={(e) => updatePartDetail('location', e.target.value)}
                          style={{ width: '100%', padding: '8px', borderRadius: '3px', border: '1px solid #ccc' }}
                        />
                      </div>
                    )}
                  </div>
                  
                  <div style={{ flex: 1, minWidth: '280px' }}>
                    {partStatuses[selectedPart] === 'fason' && (
                      <>
                        <div style={{ marginBottom: '10px' }}>
                          <label htmlFor="outsourceCompany" style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Fason Firma:</label>
                          <input
                            type="text"
                            id="outsourceCompany"
                            value={selectedPartCurrentDetails.outsourceCompany || ''}
                            onChange={(e) => updatePartDetail('outsourceCompany', e.target.value)}
                            style={{ width: '100%', padding: '8px', borderRadius: '3px', border: '1px solid #ccc' }}
                          />
                        </div>

                        <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                          <div style={{ flex: 1 }}>
                            <label htmlFor="outsourceDate" style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Gönderim Tarihi:</label>
                            <input
                              type="date"
                              id="outsourceDate"
                              value={selectedPartCurrentDetails.outsourceDate || ''}
                              onChange={(e) => updatePartDetail('outsourceDate', e.target.value)}
                              style={{ width: '100%', padding: '8px', borderRadius: '3px', border: '1px solid #ccc' }}
                            />
                          </div>
                          <div style={{ flex: 1 }}>
                            <label htmlFor="dueDate" style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Termin Tarihi:</label>
                            <input
                              type="date"
                              id="dueDate"
                              value={selectedPartCurrentDetails.dueDate || ''}
                              onChange={(e) => updatePartDetail('dueDate', e.target.value)}
                              style={{ width: '100%', padding: '8px', borderRadius: '3px', border: '1px solid #ccc' }}
                            />
                          </div>
                        </div>

                        <div style={{ marginBottom: '10px' }}>
                          <label htmlFor="purchaseStatus" style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Satın Alma Durumu:</label>
                          <select
                            id="purchaseStatus"
                            value={selectedPartCurrentDetails.purchaseStatus}
                            onChange={(e) => updatePartDetail('purchaseStatus', e.target.value)}
                            style={{ width: '100%', padding: '8px', borderRadius: '3px', border: '1px solid #ccc', backgroundColor: 'white' }}
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
                        <label htmlFor="dueDate" style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Termin Tarihi:</label>
                        <input
                          type="date"
                          id="dueDate"
                          value={selectedPartCurrentDetails.dueDate || ''}
                          onChange={(e) => updatePartDetail('dueDate', e.target.value)}
                          style={{ width: '100%', padding: '8px', borderRadius: '3px', border: '1px solid #ccc' }}
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
                      <label htmlFor="notes" style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Notlar:</label>
                      <textarea
                        id="notes"
                        value={selectedPartCurrentDetails.notes || ''}
                        onChange={(e) => updatePartDetail('notes', e.target.value)}
                        style={{ width: '100%', padding: '8px', borderRadius: '3px', border: '1px solid #ccc', minHeight: '60px', resize: 'vertical' }}
                      />
                    </div>
                  </div>
                </div>
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