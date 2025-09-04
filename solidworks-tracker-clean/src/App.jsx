import React, { useState, useRef, useEffect } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import MachineModel from './components/MachineModel';
import Login from './components/Login';

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
  const targetPosition = useRef(new THREE.Vector3());
  const isZooming = useRef(false);
  const zoomStartTime = useRef(0);
  const zoomDuration = useRef(0);
  const startPosition = useRef(new THREE.Vector3());
  const endPosition = useRef(new THREE.Vector3());
  
  // Kontroller referansını dışarı aktar
  useEffect(() => {
    if (controlsRef.current) {
      // Fare tekerleği olayını özelleştir
      const handleWheel = (event) => {
        event.preventDefault();
        
        // Fare pozisyonunu normalize et
        const canvas = gl.domElement;
        const rect = canvas.getBoundingClientRect();
        mousePos.current.x = ((event.clientX - rect.left) / canvas.clientWidth) * 2 - 1;
        mousePos.current.y = -((event.clientY - rect.top) / canvas.clientHeight) * 2 + 1;
        
        // Işın gönder
        raycaster.current.setFromCamera(mousePos.current, camera);
        
        // Tüm nesneleri topla
        const meshes = [];
        scene.traverse((object) => {
          if (object.isMesh) {
            meshes.push(object);
          }
        });
        
        // Kesişimleri bul
        const intersects = raycaster.current.intersectObjects(meshes);
        
        if (intersects.length > 0) {
          // Yakınlaştırma yönü
          const zoomDirection = event.deltaY > 0 ? 1 : -1;
          
          // Yakınlaştırma hızı (daha düşük değer daha yumuşak hareket)
          const zoomSpeed = 0.05;
          
          // Kesişim noktası
          const intersectionPoint = intersects[0].point.clone();
          
          // Hedefi güncelle (yumuşak geçiş için)
          targetPosition.current.copy(intersectionPoint);
          
          // Kamera ile kesişim noktası arasındaki vektör
          const cameraToPoint = new THREE.Vector3().subVectors(
            camera.position,
            intersectionPoint
          );
          
          // Mevcut uzaklık
          const distance = cameraToPoint.length();
          
          // Yeni uzaklık
          const newDistance = distance * (1 + zoomDirection * zoomSpeed);
          
          // Kamera yönünü koru
          const direction = cameraToPoint.normalize();
          
          // Animasyon için başlangıç pozisyonunu kaydet
          startPosition.current.copy(camera.position);
          
          // Yeni kamera pozisyonu
          endPosition.current.copy(intersectionPoint).add(
            direction.multiplyScalar(newDistance)
          );
          
          // Animasyon başlat
          isZooming.current = true;
          zoomStartTime.current = Date.now();
          zoomDuration.current = 200; // milisaniye
          
          // Kontrol hedefini kesişim noktasına ayarla (yumuşak geçiş)
          controlsRef.current.target.lerp(intersectionPoint, 0.1);
          controlsRef.current.update();
        } else {
          // Eğer kesişim yoksa, kamera yönünde yakınlaştır/uzaklaştır
          const zoomDirection = event.deltaY > 0 ? 1 : -1;
          const zoomSpeed = 0.1;
          
          // Kamera yönü
          const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
          
          // Animasyon için başlangıç pozisyonunu kaydet
          startPosition.current.copy(camera.position);
          
          // Yeni kamera pozisyonu
          endPosition.current.copy(camera.position).add(
            forward.multiplyScalar(-zoomDirection * zoomSpeed * 5)
          );
          
          // Animasyon başlat
          isZooming.current = true;
          zoomStartTime.current = Date.now();
          zoomDuration.current = 200; // milisaniye
        }
      };
      
      // Fare tekerleği olayını dinle
      const canvas = gl.domElement;
      canvas.addEventListener('wheel', handleWheel, { passive: false });
      
      return () => {
        canvas.removeEventListener('wheel', handleWheel);
      };
    }
  }, [gl, camera, scene]);
  
  // Parça seçildiğinde odaklan
  useEffect(() => {
    if (selectedPart && modelRef.current && controlsRef.current) {
      const object = modelRef.current.getObjectByName(selectedPart);
      if (object) {
        // Parçanın sınırlarını hesapla
        const box = new THREE.Box3().setFromObject(object);
        const center = new THREE.Vector3();
        box.getCenter(center);
        
        // Yumuşak geçiş için
        startPosition.current.copy(camera.position);
        
        // Parçanın boyutunu hesapla
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        
        // Kamerayı konumlandır
        const offset = new THREE.Vector3(1, 0.5, 1).normalize().multiplyScalar(maxDim * 2);
        endPosition.current.copy(center).add(offset);
        
        // Animasyon başlat
        isZooming.current = true;
        zoomStartTime.current = Date.now();
        zoomDuration.current = 500; // milisaniye
        
        // Kontrol hedefini yumuşak geçişle güncelle
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

// Zaman çizelgesi bileşeni
function TimelineProgress({ startDate, dueDate }) {
  const [progress, setProgress] = useState(0);
  const [timeLeft, setTimeLeft] = useState('');
  
  useEffect(() => {
    if (!startDate || !dueDate) return;
    
    const start = new Date(startDate).getTime();
    const end = new Date(dueDate).getTime();
    const now = Date.now();
    
    // İlerleme yüzdesi hesapla
    const totalDuration = end - start;
    const elapsed = now - start;
    const calculatedProgress = Math.min(100, Math.max(0, (elapsed / totalDuration) * 100));
    
    setProgress(calculatedProgress);
    
    // Kalan süre hesapla
    if (now > end) {
      setTimeLeft('Termin tarihi geçti!');
    } else {
      const remaining = end - now;
      const days = Math.floor(remaining / (1000 * 60 * 60 * 24));
      const hours = Math.floor((remaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      
      setTimeLeft(`${days} gün ${hours} saat kaldı`);
    }
    
    // Her dakika güncelle
    const timer = setInterval(() => {
      const now = Date.now();
      const elapsed = now - start;
      const calculatedProgress = Math.min(100, Math.max(0, (elapsed / totalDuration) * 100));
      
      setProgress(calculatedProgress);
      
      if (now > end) {
        setTimeLeft('Termin tarihi geçti!');
      } else {
        const remaining = end - now;
        const days = Math.floor(remaining / (1000 * 60 * 60 * 24));
        const hours = Math.floor((remaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        
        setTimeLeft(`${days} gün ${hours} saat kaldı`);
      }
    }, 60000); // Her dakika
    
    return () => clearInterval(timer);
  }, [startDate, dueDate]);
  
  if (!startDate || !dueDate) return null;
  
  // Renk hesapla (yeşilden kırmızıya)
  const getColor = () => {
    if (progress < 60) return '#2ecc71'; // Yeşil
    if (progress < 80) return '#f39c12'; // Sarı
    return '#e74c3c'; // Kırmızı
  };
  
  return (
    <div style={{ marginTop: '15px', marginBottom: '15px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
        <span>{new Date(startDate).toLocaleDateString()}</span>
        <span style={{ color: getColor(), fontWeight: 'bold' }}>{timeLeft}</span>
        <span>{new Date(dueDate).toLocaleDateString()}</span>
      </div>
      <div style={{ 
        width: '100%', 
        height: '10px', 
        backgroundColor: '#ecf0f1', 
        borderRadius: '5px',
        overflow: 'hidden'
      }}>
        <div style={{ 
          width: `${progress}%`, 
          height: '100%', 
          backgroundColor: getColor(),
          transition: 'width 0.5s ease-in-out, background-color 0.5s ease-in-out'
        }} />
      </div>
    </div>
  );
}

// Üst bilgi çubuğu bileşeni
function Header({ user, onLogout }) {
  return (
    <div style={{ 
      backgroundColor: '#2c3e50', 
      color: 'white',
      padding: '10px 20px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <h2 style={{ margin: 0 }}>OTC Üretim Takip</h2>
        <span style={{ 
          backgroundColor: '#3498db', 
          padding: '2px 8px', 
          borderRadius: '10px',
          fontSize: '0.8rem'
        }}>
          {user.role === 'admin' ? 'Yönetici' : user.role === 'production' ? 'Üretim' : 'Kalite'}
        </span>
      </div>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            backgroundColor: '#3498db',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 'bold'
          }}>
            {user.name.charAt(0)}
          </div>
          <span>{user.name}</span>
        </div>
        
        <button 
          onClick={onLogout}
          style={{
            backgroundColor: 'transparent',
            color: 'white',
            border: '1px solid #7f8c8d',
            padding: '5px 10px',
            borderRadius: '3px',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
          onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)'}
          onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          Çıkış
        </button>
      </div>
    </div>
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
  
  // Yeni eklenen durum değişkenleri
  const [partDetails, setPartDetails] = useState({});
  
  const modelRef = useRef();
  const cameraRef = useRef();

  // Kullanıcı girişi yaptığında
  const handleLogin = (loggedInUser) => {
    setUser(loggedInUser);
    
    // Kullanıcı bilgilerini localStorage'a kaydet
    localStorage.setItem('user', JSON.stringify(loggedInUser));
  };
  
  // Çıkış yapıldığında
  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('user');
  };
  
  // Sayfa yüklendiğinde localStorage'dan kullanıcı bilgilerini kontrol et
  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch (e) {
        console.error('Kullanıcı bilgileri yüklenemedi:', e);
        localStorage.removeItem('user');
      }
    }
  }, []);

  // Hiyerarşi hazır olduğunda
  const handleHierarchyReady = (hierarchyData) => {
    setHierarchy(hierarchyData);
  };

  // Parça tıklandığında
  const handlePartClick = (partName) => {
    setSelectedPart(partName);
  };

  // Menüden parça seçildiğinde
  const handleMenuPartSelect = (partName) => {
    setSelectedPart(partName);
  };

  // Durum değişikliği
  const handleStatusChange = (status) => {
    if (!selectedPart) return;
    setPartStatuses(prev => ({
      ...prev,
      [selectedPart]: status
    }));
  };

  // Parça detaylarını güncelle
  const updatePartDetail = (field, value) => {
    if (!selectedPart) return;
    
    setPartDetails(prev => ({
      ...prev,
      [selectedPart]: {
        ...prev[selectedPart],
        [field]: value
      }
    }));
  };

  // İzole modu değiştir
  const toggleIsolation = () => {
    setIsIsolated(!isIsolated);
  };

  // Filtrelenmiş hiyerarşi
  const getFilteredHierarchy = () => {
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
      
      if (hasMatch) {
        result[parentName] = filteredParts;
      }
    }
    
    return result;
  };
  
  const filteredHierarchy = getFilteredHierarchy();

  // Parça adını formatla
  const formatPartName = (partName) => {
    const count = hierarchy[Object.keys(hierarchy)[0]]?.[partName]?.count || 1;
    return count > 1 ? `${partName} (x${count})` : partName;
  };

  // Seçili parçanın detayları
  const selectedPartDetails = selectedPart ? partDetails[selectedPart] || {} : {};

  // Kullanıcı giriş yapmadıysa Login bileşenini göster
  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>*/
      {/* Üst Bilgi Çubuğu */}
      <Header user={user} onLogout={handleLogout} />*/
      
     /* {/* Üst Panel */}
      /*<div style={{ padding: '10px', backgroundColor: '#f0f0f0', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Parça ara..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ padding: '5px', flex: '1', minWidth: '150px' }}
        />
        <button onClick={() => setFilterStatus('tezgahta')} style={{ backgroundColor: statusColors.tezgahta, color: 'white', border: 'none', padding: '5px 10px', borderRadius: '3px' }}>
          Tezgahta
        </button>
        <button onClick={() => setFilterStatus('tamamlandi')} style={{ backgroundColor: statusColors.tamamlandi, color: 'white', border: 'none', padding: '5px 10px', borderRadius: '3px' }}>
          Tamamlandı
        </button>
        <button onClick={() => setFilterStatus('kalitede')} style={{ backgroundColor: statusColors.kalitede, color: 'white', border: 'none', padding: '5px 10px', borderRadius: '3px' }}>
          Kalitede
        </button>
        <button onClick={() => setFilterStatus('fason')} style={{ backgroundColor: statusColors.fason, color: 'white', border: 'none', padding: '5px 10px', borderRadius: '3px' }}>
          Fason
        </button>
        <button onClick={() => setFilterStatus(null)} style={{ backgroundColor: '#7f8c8d', color: 'white', border: 'none', padding: '5px 10px', borderRadius: '3px' }}>
          Tümü
        </button>
        <button onClick={toggleIsolation} style={{ backgroundColor: '#2c3e50', color: 'white', border: 'none', padding: '5px 10px', borderRadius: '3px' }}>
          {isIsolated ? 'Tümünü Göster' : 'Grubu İzole Et'}
        </button>
      </div>
      
      {/* Ana İçerik */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Sol Panel - Parça Listesi */}
        <div style={{ width: '300px', overflowY: 'auto', padding: '10px', borderRight: '1px solid #ccc' }}>
          <h3>Parça Listesi</h3>
          {Object.keys(filteredHierarchy).map(parentName => (
            <div key={parentName} style={{ marginBottom: '10px' }}>
              <h4>{parentName}</h4>
              <ul style={{ listStyleType: 'none', padding: 0 }}>
                {Object.keys(filteredHierarchy[parentName]).map(partName => {
                  const count = filteredHierarchy[parentName][partName].count || 1;
                  const status = partStatuses[partName];
                  const statusColor = statusColors[status] || 'gray';
                  const details = partDetails[partName] || {};
                  
                  return (
                    <li 
                      key={partName}
                      onClick={() => handleMenuPartSelect(partName)}
                      style={{
                        padding: '8px',
                        cursor: 'pointer',
                        backgroundColor: selectedPart === partName ? '#e0e0ff' : 'transparent',
                        borderLeft: status ? `4px solid ${statusColor}` : '4px solid transparent',
                        paddingLeft: '10px',
                        marginBottom: '4px',
                        borderRadius: '4px',
                        transition: 'background-color 0.2s'
                      }}
                    >
                      <div style={{ fontWeight: '' }}>
                        {count > 1 ? `${partName} (x${count})` : partName}
                      </div>
                      
                      {status && (
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
                      
                      {details.dueDate && (
                        <div style={{ 
                          fontSize: '0.7rem', 
                          color: '#888',
                          marginTop: '2px'
                        }}>
                          Termin: {new Date(details.dueDate).toLocaleDateString()}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
        
        {/* Sağ Panel - 3D Görünüm ve Parça Detayı */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {/* 3D Görünüm */}
          <div style={{ flex: 1, position: 'relative' }}>
            <Canvas
              camera={{ position: [0, 5, 10], fov: 50 }}
              onCreated={({ camera }) => { cameraRef.current = camera; }}
              style={{ touchAction: 'none' }} // Mobil cihazlarda kaydırma sorununu önler
            >
              <ambientLight intensity={0.5} />
              <directionalLight position={[10, 10, 10]} intensity={1} />
              
              {/* Özel kontroller */}
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
          </div>

          {/* Parça Detayı */}
           <div style={{ height: '150px', padding: '15px', borderTop: '1px solid #ccc', overflow: 'auto' }}>
           <h3 style={{ margin: '0 0 5px 0' }}>Parça Detayı</h3> {/* Üst boşluğu azalt */}
            {selectedPart ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                  {/* Sol Sütun */}
                 <div style={{ flex: 1, minWidth: '250px' }}>
                    <p><strong>Ad:</strong> {formatPartName(selectedPart)}</p>
                    <div style={{ marginBottom: '10px' }}>
                      <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                        Durum:
                      </label>
                      <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                        <button 
                          onClick={() => handleStatusChange('tezgahta')}
                          style={{ 
                            backgroundColor: statusColors.tezgahta, 
                            color: 'white', 
                            border: 'none', 
                            padding: '5px 10px',
                            borderRadius: '3px',
                            opacity: partStatuses[selectedPart] === 'tezgahta' ? 1 : 0.7
                          }}
                        >
                          Tezgahta
                        </button>
                        <button 
                          onClick={() => handleStatusChange('tamamlandi')}
                          style={{ 
                            backgroundColor: statusColors.tamamlandi, 
                            color: 'white', 
                            border: 'none', 
                            padding: '5px 10px',
                            borderRadius: '3px',
                            opacity: partStatuses[selectedPart] === 'tamamlandi' ? 1 : 0.7
                          }}
                        >
                          Tamamlandı
                        </button>
                        <button 
                          onClick={() => handleStatusChange('kalitede')}
                          style={{ 
                            backgroundColor: statusColors.kalitede, 
                            color: 'white', 
                            border: 'none', 
                            padding: '5px 10px',
                            borderRadius: '3px',
                            opacity: partStatuses[selectedPart] === 'kalitede' ? 1 : 0.7
                          }}
                        >
                          Kalitede
                        </button>
                        <button 
                          onClick={() => handleStatusChange('fason')}
                          style={{ 
                            backgroundColor: statusColors.fason, 
                            color: 'white', 
                            border: 'none', 
                            padding: '5px 10px',
                            borderRadius: '3px',
                            opacity: partStatuses[selectedPart] === 'fason' ? 1 : 0.7
                          }}
                        >
                          Fason
                        </button>
                      </div>
                    </div>
                    
                    <div style={{ marginBottom: '10px' }}>
                      <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                        Satın Alma Durumu:
                      </label>
                      <select 
                        value={selectedPartDetails.purchaseStatus || ''}
                        onChange={(e) => updatePartDetail('purchaseStatus', e.target.value)}
                        style={{ 
                          width: '100%', 
                          padding: '5px', 
                          borderRadius: '3px',
                          border: '1px solid #ccc'
                        }}
                      >
                        <option value="">Seçiniz</option>
                        {purchaseStatuses.map(status => (
                          <option key={status} value={status}>{status}</option>
                        ))}
                      </select>
                    </div>
                    
                    <div style={{ marginBottom: '10px' }}>
                      <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                        Konum:
                      </label>
                      <input 
                        type="text" 
                        value={selectedPartDetails.location || ''}
                        onChange={(e) => updatePartDetail('location', e.target.value)}
                        placeholder="Örn: Depo A, Raf 5"
                        style={{ 
                          width: '100%', 
                          padding: '5px', 
                          borderRadius: '3px',
                          border: '1px solid #ccc'
                        }}
                      />
                    </div>
                  </div>
                  
                  {/* Sağ Sütun */}
                  <div style={{ flex: 1, minWidth: '250px' }}>
                    {partStatuses[selectedPart] === 'tezgahta' && (
                      <div style={{ marginBottom: '10px' }}>
                        <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                          Tezgah Türü:
                        </label>
                        <select 
                          value={selectedPartDetails.machineType || ''}
                          onChange={(e) => updatePartDetail('machineType', e.target.value)}
                          style={{ 
                            width: '100%', 
                            padding: '5px', 
                            borderRadius: '3px',
                            border: '1px solid #ccc'
                          }}
                        >
                          <option value="">Seçiniz</option>
                          {machineTypes.map(type => (
                            <option key={type} value={type}>{type}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    
                    {partStatuses[selectedPart] === 'fason' && (
                      <>
                        <div style={{ marginBottom: '10px' }}>
                          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                            Fason Firma:
                          </label>
                          <input 
                            type="text" 
                            value={selectedPartDetails.outsourceCompany || ''}
                            onChange={(e) => updatePartDetail('outsourceCompany', e.target.value)}
                            placeholder="Firma adı"
                            style={{ 
                              width: '100%', 
                              padding: '5px', 
                              borderRadius: '3px',
                              border: '1px solid #ccc'
                            }}
                          />
                        </div>
                        
                        <div style={{ marginBottom: '10px' }}>
                          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                            Gönderim Tarihi:
                          </label>
                          <input 
                            type="date" 
                            value={selectedPartDetails.outsourceDate || ''}
                            onChange={(e) => updatePartDetail('outsourceDate', e.target.value)}
                            style={{ 
                              width: '100%', 
                              padding: '5px', 
                              borderRadius: '3px',
                              border: '1px solid #ccc'
                            }}
                          />
                        </div>
                      </>
                    )}
                    
                    <div style={{ marginBottom: '10px' }}>
                      <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                        Termin Tarihi:
                      </label>
                      <input 
                        type="date" 
                        value={selectedPartDetails.dueDate || ''}
                        onChange={(e) => updatePartDetail('dueDate', e.target.value)}
                        style={{ 
                          width: '100%', 
                          padding: '5px', 
                          borderRadius: '3px',
                          border: '1px solid #ccc'
                        }}
                      />
                    </div>
                    
                    <div style={{ marginBottom: '10px' }}>
                      <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                        Notlar:
                      </label>
                      <textarea 
                        value={selectedPartDetails.notes || ''}
                        onChange={(e) => updatePartDetail('notes', e.target.value)}
                        placeholder="Parça ile ilgili notlar..."
                        style={{ 
                          width: '100%', 
                          padding: '5px', 
                          borderRadius: '3px',
                          border: '1px solid #ccc',
                          minHeight: '60px',
                          resize: 'vertical'
                        }}
                      />
                    </div>
                  </div>
                </div>
                
                {/* Zaman Çizelgesi */}
                {(selectedPartDetails.outsourceDate || selectedPartDetails.dueDate) && (
                  <div style={{ marginTop: '10px', padding: '10px', backgroundColor: '#f9f9f9', borderRadius: '5px' }}>
                    <h4 style={{ margin: '0 0 10px 0' }}>Zaman Takibi</h4>
                    <TimelineProgress 
                      startDate={selectedPartDetails.outsourceDate || new Date().toISOString().split('T')[0]} 
                      dueDate={selectedPartDetails.dueDate} 
                    />
                  </div>
                )}
              </div>
            ) : (
              <p>Lütfen bir parça seçin</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
