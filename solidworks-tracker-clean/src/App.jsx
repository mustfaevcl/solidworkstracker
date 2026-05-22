import React, { useState, useRef, useEffect } from 'react';
import { fetchRecords, addRecord, updateRecord } from './api';
import useStore from './components/store/state';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import MachineModel from './components/MachineModel';
import Login from './components/Login';
import TreeMenu from './components/TreeMenu';
import PartPanel from './components/PartPanel';
import Dashboard from './components/Dashboard';
import UserManagement from './components/UserManagement';

const STATUS_LIST = [
  { key: 'tezgahta', label: 'Tezgahta', color: '#e67e22' },
  { key: 'tamamlandi', label: 'Tamamlandı', color: '#27ae60' },
  { key: 'kalitede', label: 'Kalitede', color: '#3498db' },
  { key: 'siparis', label: 'Sipariş', color: '#8e44ad' },
  { key: 'stokta', label: 'Stokta', color: '#16a085' },
  { key: 'beklemede', label: 'Beklemede', color: '#f39c12' },
  { key: 'fason', label: 'Fason', color: '#c0392b' },
  { key: 'montajda', label: 'Montajda', color: '#2980b9' },
];

// Fare merkezli yakınlaştırma için özel kontroller
function CustomControls({ modelRef, selectedPart }) {
  const { camera, gl, scene } = useThree();
  const controlsRef = useRef();
  const mousePos = useRef(new THREE.Vector2());
  const raycaster = useRef(new THREE.Raycaster());
  const isZooming = useRef(false);
  const zoomStartTime = useRef(0);
  const zoomDuration = useRef(0);
  const startPosition = useRef(new THREE.Vector3());
  const endPosition = useRef(new THREE.Vector3());

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
        scene.traverse((object) => {
          if (object.isMesh) meshes.push(object);
        });

        const intersects = raycaster.current.intersectObjects(meshes);

        if (intersects.length > 0) {
          const zoomDirection = event.deltaY > 0 ? 1 : -1;
          const zoomSpeed = 0.05;
          const intersectionPoint = intersects[0].point.clone();
          const cameraToPoint = new THREE.Vector3().subVectors(camera.position, intersectionPoint);
          const distance = cameraToPoint.length();
          const newDistance = distance * (1 + zoomDirection * zoomSpeed);
          const direction = cameraToPoint.normalize();

          startPosition.current.copy(camera.position);
          endPosition.current.copy(intersectionPoint).add(direction.multiplyScalar(newDistance));

          isZooming.current = true;
          zoomStartTime.current = Date.now();
          zoomDuration.current = 200;

          controlsRef.current.target.lerp(intersectionPoint, 0.1);
          controlsRef.current.update();
        } else {
          const zoomDirection = event.deltaY > 0 ? 1 : -1;
          const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize();

          startPosition.current.copy(camera.position);
          endPosition.current
            .copy(camera.position)
            .add(forward.multiplyScalar(-zoomDirection * 0.1 * 5));

          isZooming.current = true;
          zoomStartTime.current = Date.now();
          zoomDuration.current = 200;
        }
      };

      const canvas = gl.domElement;
      canvas.addEventListener('wheel', handleWheel, { passive: false });
      return () => canvas.removeEventListener('wheel', handleWheel);
    }
  }, [gl, camera, scene]);

  useEffect(() => {
    if (selectedPart && modelRef.current && controlsRef.current) {
      const object = modelRef.current.getObjectByName(selectedPart);
      if (object) {
        const box = new THREE.Box3().setFromObject(object);
        const center = new THREE.Vector3();
        box.getCenter(center);

        startPosition.current.copy(camera.position);
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const offset = new THREE.Vector3(1, 0.5, 1).normalize().multiplyScalar(maxDim * 2);
        endPosition.current.copy(center).add(offset);

        isZooming.current = true;
        zoomStartTime.current = Date.now();
        zoomDuration.current = 500;

        controlsRef.current.target.lerp(center, 0.1);
        controlsRef.current.update();
      }
    }
  }, [selectedPart, modelRef, camera]);

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
  const [user, setUser] = useState(null);
  const [selectedPart, setSelectedPart] = useState(null);
  const [partStatuses, setPartStatuses] = useState({});
  const [hierarchy, setHierarchy] = useState({});
  const [isIsolated, setIsIsolated] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState(null);

  // Mobile state
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [showUserMgmt, setShowUserMgmt] = useState(false);

  const { partDetails, loadFromBackend } = useStore();
  const modelRef = useRef();
  const cameraRef = useRef();

  // Resize listener
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Compute stats whenever partStatuses changes
  // Auth
  const handleLogin = (loggedInUser) => {
    setUser(loggedInUser);
    localStorage.setItem('user', JSON.stringify(loggedInUser));
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('user');
  };

  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch {
        localStorage.removeItem('user');
      }
    }
  }, []);

  const handleHierarchyReady = (hierarchyData) => {
    setHierarchy(hierarchyData);
  };

  const handlePartClick = (partName) => {
    setSelectedPart(partName);
    if (isMobile) setPanelOpen(true);
  };

  const handleMenuPartSelect = (partName) => {
    setSelectedPart(partName);
    if (isMobile) {
      setSidebarOpen(false);
      setPanelOpen(true);
    }
  };

  useEffect(() => {
    fetchRecords().then(loadFromBackend).catch(console.error);
  }, []);

  const handleStatusChange = (status) => {
    if (!selectedPart) return;
    setPartStatuses((prev) => ({ ...prev, [selectedPart]: status }));
    try {
      const details = partDetails[selectedPart] || {};
      const record = {
        projeNo: details.projeNo || '',
        parcaKodu: details.parcaKodu || '',
        parcaAdi: selectedPart,
        durum: status,
        machineType: details.machineType || '',
        purchaseStatus: details.purchaseStatus || '',
        location: details.location || '',
        outsourceCompany: details.outsourceCompany || '',
        outsourceDate: details.outsourceDate || '',
        dueDate: details.dueDate || '',
        notes: details.notes || '',
      };
      updateRecord(selectedPart, record).catch(() => addRecord(record).catch(console.error));
    } catch (e) {
      console.error(e);
    }
  };

  const toggleIsolation = () => setIsIsolated(!isIsolated);

  // Filtered hierarchy
  const filteredHierarchy = (() => {
    if (!searchTerm && !filterStatus) return hierarchy;
    const result = {};
    for (const parentName in hierarchy) {
      const filteredParts = {};
      let hasMatch = false;
      for (const partName in hierarchy[parentName]) {
        const status = partStatuses[partName];
        const nameMatch = partName.toLowerCase().includes(searchTerm.toLowerCase());
        const statusMatch = !filterStatus || status === filterStatus;
        if (nameMatch && statusMatch) {
          filteredParts[partName] = hierarchy[parentName][partName];
          hasMatch = true;
        }
      }
      if (hasMatch) result[parentName] = filteredParts;
    }
    return result;
  })();

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  // Sidebar content (shared between desktop sidebar and mobile drawer)
  const sidebarContent = (
    <>
      <div className="sidebar-header">
        <div className="sidebar-title">Parça Listesi</div>
        <input
          className="sidebar-search"
          type="text"
          placeholder="Parça ara..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>
      <div className="status-filters">
        {STATUS_LIST.map(({ key, label, color }) => (
          <span
            key={key}
            className={`status-chip${filterStatus === key ? ' active' : ''}`}
            style={{ background: color, color: 'white' }}
            onClick={() => setFilterStatus(filterStatus === key ? null : key)}
          >
            <span className="status-chip-dot" />
            {label}
          </span>
        ))}
        {filterStatus && (
          <span
            className="status-chip"
            style={{ background: 'var(--text-muted)', color: 'white' }}
            onClick={() => setFilterStatus(null)}
          >
            Tümü
          </span>
        )}
      </div>
      <div className="sidebar-body">
        <TreeMenu
          hierarchy={filteredHierarchy}
          onSelectPart={handleMenuPartSelect}
          selectedPart={selectedPart}
          partStatuses={partStatuses}
        />
      </div>
    </>
  );

  // Panel content (shared between desktop panel and mobile drawer)
  const panelContent = (
    <PartPanel
      selectedPart={selectedPart}
      onStatusChange={handleStatusChange}
    />
  );

  return (
    <div className="app-layout">
      {/* Header */}
      <header className="app-header">
        <span className="app-header-logo">OTC Üretim Takip</span>
        <span className="app-header-badge">
          {user.role === 'admin' ? 'Yönetici' : user.role === 'production' ? 'Üretim' : 'Kalite'}
        </span>
        <span className="app-header-spacer" />
        <div className="app-header-actions">
          <button
            className="viewer-btn"
            onClick={toggleIsolation}
            style={{ background: isIsolated ? 'var(--primary)' : undefined }}
          >
            {isIsolated ? 'Tümünü Göster' : 'İzole Et'}
          </button>
          {user.role === 'admin' && (
            <button
              onClick={() => setShowUserMgmt(true)}
              style={{ background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.3)', padding: '5px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}
            >
              👥 Kullanıcılar
            </button>
          )}
          <div className="avatar" title={user.name}>{user.name.charAt(0)}</div>
          <button className="btn btn-ghost btn-sm" onClick={handleLogout} style={{ color: 'white', borderColor: 'rgba(255,255,255,0.3)' }}>
            Çıkış
          </button>
        </div>
      </header>

      {/* Dashboard - İstatistik Bar */}
      <Dashboard
        partStatuses={partStatuses}
        onFilterStatus={setFilterStatus}
        activeFilter={filterStatus}
      />

      {/* App Body */}
      <div className="app-body">
        {/* Desktop Sidebar */}
        <aside className="app-sidebar">
          {sidebarContent}
        </aside>

        {/* 3D Viewer */}
        <div className="viewer-area">
          <Canvas
            camera={{ position: [0, 5, 10], fov: 50 }}
            onCreated={({ camera }) => { cameraRef.current = camera; }}
            style={{ touchAction: 'none' }}
          >
            <ambientLight intensity={0.5} />
            <directionalLight position={[10, 10, 10]} intensity={1} />
            <CustomControls modelRef={modelRef} selectedPart={selectedPart} />
            <MachineModel
              ref={modelRef}
              selectedPart={selectedPart}
              onPartClick={handlePartClick}
              partStatuses={partStatuses}
              onHierarchyReady={handleHierarchyReady}
              isIsolated={isIsolated}
            />
          </Canvas>

          {/* Viewer overlays */}
          <div className="viewer-overlay-bottomleft">
            <div className="viewer-info-badge">
              {selectedPart ? `Seçili: ${selectedPart}` : '3D Model — bir parçaya tıklayın'}
            </div>
          </div>
        </div>

        {/* Desktop Part Panel */}
        <aside className="part-panel">
          {panelContent}
        </aside>
      </div>

      {/* Mobile FABs */}
      <button className="mobile-fab mobile-fab-left" onClick={() => setSidebarOpen(true)}>☰</button>
      {selectedPart && (
        <button className="mobile-fab mobile-fab-right" onClick={() => setPanelOpen(true)}>⚙</button>
      )}

      {/* Mobile Drawers */}
      {isMobile && (
        <>
          <div
            className={`mobile-drawer-overlay${sidebarOpen ? ' open' : ''}`}
            onClick={() => setSidebarOpen(false)}
          />
          <div className={`mobile-drawer mobile-drawer-left${sidebarOpen ? ' open' : ''}`}>
            {sidebarContent}
          </div>

          <div
            className={`mobile-drawer-overlay${panelOpen ? ' open' : ''}`}
            onClick={() => setPanelOpen(false)}
          />
          <div className={`mobile-drawer mobile-drawer-right${panelOpen ? ' open' : ''}`}>
            <div className="part-panel" style={{ width: '100%', height: '100%' }}>
              {panelContent}
            </div>
          </div>
        </>
      )}

      {/* UserManagement Modal */}
      {showUserMgmt && (
        <UserManagement
          currentUser={user}
          onClose={() => setShowUserMgmt(false)}
        />
      )}
    </div>
  );
}
