import React, {
  useEffect,
  useRef,
  forwardRef,
  useImperativeHandle,
  useState,
  useMemo,
  useCallback,
} from 'react';
import { useGLTF, Environment, ContactShadows, Html, Line, Text } from '@react-three/drei';

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
const DEBUG_SELECTION = false;
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import './MachineModel.css'; // CSS dosyasını import ediyoruz
import { createRoot } from 'react-dom/client'; // ReactDOM.render yerine createRoot kullanacağız

// Ribbon menü bileşeni - Sahneden bağımsız olarak kullanılacak
const RibbonMenu = forwardRef(({
  viewMode, setViewMode,
  selectedPart, hideSelectedPart,
  hiddenPartsHistory, undoHide,
  hiddenParts, showAllParts, // Props from MachineModel
  // Functions to be called by RibbonMenu
  onSetViewOrientation,
  onZoomToFit,
  onActivateMeasureTool, isMeasureToolActive,
  onToggleExplodedView, isExplodedView,
  onToggleIsolation, // This would call App.jsx's toggleIsolation via MachineModel
  clippingAxis, isClippingActive, toggleClippingPlane,
  resetClipping, showClippingControls, clippingPosition,
  setClippingPosition, clippingPlane, updateClippingPlanePosition,
  modelSize,
  // Yeni eklenen prop'lar
  filterStatus, setFilterStatus,
  isIsolated,
  statusColors,
  explosionFactor, setExplosionFactor,
  onLogout, onSettings,
  searchTerm, setSearchTerm: setSearchTermProp,
  groupPaint, setGroupPaint,
  ribbonPinned, setRibbonPinned,
  ribbonCollapsed, setRibbonCollapsed
}, ref) => {
  const setSearchTerm = useCallback(setSearchTermProp, []);
  const [activeTab, setActiveTab] = useState('view');
  
  // Ribbon sekme tanımları
  const ribbonTabs = [
    { id: 'view', label: 'Görünüm' },
    { id: 'tools', label: 'Araçlar' },
    { id: 'assembly', label: 'Montaj' },
    { id: 'section', label: 'Kesit' },
    { id: 'account', label: 'Hesap' },
    { id: 'report', label: 'Rapor' }
  ];

  return (
    <div className="ribbon-container" style={{ position: 'relative' }}>
      {/* Pin / Minimize controls */}
      <div style={{ position: 'absolute', top: 6, right: 8, display: 'flex', gap: 8, zIndex: 10001 }}>
        <button
          className={`ribbon-button ${ribbonPinned ? 'active' : ''}`}
          onClick={() => setRibbonPinned(!ribbonPinned)}
          title={ribbonPinned ? 'Sabit (pano iğneli). Tıklayınca otomatik gizlenecek.' : 'Sabit değil. Tıklayınca sabitlenecek.'}
          style={{ padding: '4px 8px' }}
        >
          <span className="ribbon-button-icon">📌</span>
        </button>
        <button
          className="ribbon-button"
          onClick={() => setRibbonCollapsed(!ribbonCollapsed)}
          title={ribbonCollapsed ? 'Genişlet' : 'Küçült'}
          style={{ padding: '4px 8px' }}
        >
          <span className="ribbon-button-icon">{ribbonCollapsed ? '🔼' : '🔽'}</span>
        </button>
      </div>

      <div className="ribbon-tabs">
        {ribbonTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`ribbon-tab ${activeTab === tab.id ? 'active' : ''}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

    <div className="ribbon-menu">
      {!ribbonCollapsed && (
      <div className="ribbon-content">
        {activeTab === 'view' && (
          <>
          <div className="ribbon-group">
            <div className="ribbon-buttons">
              <input
                type="text"
                placeholder="Parça ara..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ padding: '8px', flex: '1', minWidth: '150px', border: '1px solid #ccc', borderRadius: '4px' }}
              />
            </div>
            <div className="ribbon-group-title">Arama</div>
          </div>
        <div className="ribbon-group">
          <div className="ribbon-buttons">
            <button
              className={`ribbon-button ${viewMode === 'normal' ? 'active' : ''}`}
              onClick={() => setViewMode('normal')}
              title="Normal görünüm"
            >
              <span className="ribbon-button-icon">📊</span>
              <span className="ribbon-button-text">Normal</span>
            </button>
            <button
              className={`ribbon-button ${viewMode === 'wireframe' ? 'active' : ''}`}
              onClick={() => setViewMode('wireframe')}
              title="Wireframe görünüm"
            >
              <span className="ribbon-button-icon">📱</span>
              <span className="ribbon-button-text">Wireframe</span>
            </button>
            <button
              className={`ribbon-button ${viewMode === 'xray' ? 'active' : ''}`}
              onClick={() => setViewMode('xray')}
              title="X-Ray görünüm"
            >
              <span className="ribbon-button-icon">🔍</span>
              <span className="ribbon-button-text">X-Ray</span>
            </button>
          </div>
          <div className="ribbon-group-title">Görünüm Modu</div>
        </div>
        <div className="ribbon-group">
            <div className="ribbon-buttons">
                <button className="ribbon-button" onClick={() => onSetViewOrientation('front')} title="Ön Görünüm"><span className="ribbon-button-icon">🖼️</span><span className="ribbon-button-text">Ön</span></button>
                <button className="ribbon-button" onClick={() => onSetViewOrientation('top')} title="Üst Görünüm"><span className="ribbon-button-icon">🔝</span><span className="ribbon-button-text">Üst</span></button>
                <button className="ribbon-button" onClick={() => onSetViewOrientation('iso')} title="İzometrik Görünüm"><span className="ribbon-button-icon">🧊</span><span className="ribbon-button-text">İzometrik</span></button>
                <button className="ribbon-button" onClick={() => toggleClippingPlane('x')} title="Kesit Görünümü"><span className="ribbon-button-icon">✂️</span><span className="ribbon-button-text">Kesit Al</span></button>
            </div>
            <div className="ribbon-group-title">Standart Görünümler</div>
        </div>
        <div className="ribbon-group">
            <div className="ribbon-buttons">
                <button className="ribbon-button" onClick={onZoomToFit} title="Modele Yakınlaş"><span className="ribbon-button-icon">🔎</span><span className="ribbon-button-text">Sığdır</span></button>
                {/* Zoom to Selection eklenebilir (selectedPart bilgisiyle) */}
            </div>
            <div className="ribbon-group-title">Yakınlaştırma</div>
        </div>
        {/* Grup boyama anahtarı */}
        <div className="ribbon-group">
          <div className="ribbon-buttons">
            <button
              className={`ribbon-button ${groupPaint ? 'active' : ''}`}
              onClick={() => setGroupPaint(!groupPaint)}
              title={groupPaint ? 'Grup boyamayı kapat (yalnızca tıklanan parça)' : 'Grup boyamayı aç (kopyaları birlikte boya)'}
            >
              <span className="ribbon-button-icon">👯</span>
              <span className="ribbon-button-text">Grup Boyama</span>
            </button>
          </div>
          <div className="ribbon-group-title">Seçim</div>
        </div>
        <div className="ribbon-group">
            <div className="ribbon-buttons">
                {Object.entries(statusColors).map(([statusKey, color]) => (
                    <button
                        key={statusKey}
                        onClick={() => setFilterStatus(statusKey)}
                        className={`ribbon-button ${filterStatus === statusKey ? 'active' : ''}`}
                        style={{ backgroundColor: color, color: 'white' }}
                        title={`${statusKey.charAt(0).toUpperCase() + statusKey.slice(1)} durumuna göre filtrele`}
                    >
                        <span className="ribbon-button-text">{statusKey.charAt(0).toUpperCase() + statusKey.slice(1)}</span>
                    </button>
                ))}
                <button
                    onClick={() => setFilterStatus(null)}
                    className={`ribbon-button ${filterStatus === null ? 'active' : ''}`}
                    style={{ backgroundColor: '#7f8c8d', color: 'white' }}
                    title="Tüm parçaları göster"
                >
                    <span className="ribbon-button-text">Tümü</span>
                </button>
                <button
                    onClick={onToggleIsolation}
                    className={`ribbon-button ${isIsolated ? 'active' : ''}`}
                    style={{ backgroundColor: '#2c3e50', color: 'white' }}
                    title={isIsolated ? 'Tümünü Göster' : 'Grubu İzole Et'}
                >
                    <span className="ribbon-button-text">{isIsolated ? 'Tümünü Göster' : 'Grubu İzole Et'}</span>
                </button>
            </div>
            <div className="ribbon-group-title">Filtreleme ve İzolasyon</div>
        </div>
        </>
    )}

        {activeTab === 'assembly' && (
          <>
        {/* Parça işlemleri grubu */}
        <div className="ribbon-group">
          <div className="ribbon-buttons">
            <button
                          className="ribbon-button"
                          onClick={hideSelectedPart}
                          disabled={!selectedPart}
                          title="Seçili parçayı gizle"
                        >
              <span className="ribbon-button-icon">👁️</span>
              <span className="ribbon-button-text">Gizle</span>
            </button>
            <button
              className="ribbon-button"
              onClick={undoHide}
              disabled={hiddenPartsHistory.length === 0}
              title="Son gizleme işlemini geri al"
            >
              <span className="ribbon-button-icon">↩️</span>
              <span className="ribbon-button-text">Geri Al</span>
            </button>
            <button
              className="ribbon-button"
              onClick={showAllParts}
              disabled={hiddenParts.length === 0}
              title="Tüm gizli parçaları göster"
            >
              <span className="ribbon-button-icon">👁️‍🗨️</span>
              <span className="ribbon-button-text">Tümünü Göster</span>
            </button>
             <button className="ribbon-button" onClick={onToggleIsolation} title="Seçili Grubu İzole Et / Tümünü Göster">
                <span className="ribbon-button-icon">🎯</span>
                <span className="ribbon-button-text">İzole Et</span>
            </button>
          </div>
          <div className="ribbon-group-title">Parça Görünürlüğü</div>
        </div>
        <div className="ribbon-group">
            <div className="ribbon-buttons">
                <button className={`ribbon-button ${isExplodedView ? 'active' : ''}`} onClick={onToggleExplodedView} title="Patlatılmış Görünüm">
                    <span className="ribbon-button-icon">💥</span>
                    <span className="ribbon-button-text">Patlat</span>
                </button>
                <div className="ribbon-slider-container">
                    <input
                        type="range"
                        min="0"
                        max="0.2"
                        step="0.01"
                        value={explosionFactor}
                        onChange={(e) => setExplosionFactor(parseFloat(e.target.value))}
                        className="ribbon-slider"
                    />
                    <span className="ribbon-slider-value">{explosionFactor.toFixed(2)}</span>
                </div>
            </div>
            <div className="ribbon-group-title">Montaj Araçları</div>
        </div>
        </>
        )}

        {activeTab === 'tools' && (
          <>
        <div className="ribbon-group">
            <div className="ribbon-buttons">
                <button className={`ribbon-button ${isMeasureToolActive ? 'active' : ''}`} onClick={onActivateMeasureTool} title="Ölçüm Aracını Aktif Et">
                    <span className="ribbon-button-icon">📏</span>
                    <span className="ribbon-button-text">Ölç</span>
                </button>
            </div>
            <div className="ribbon-group-title">Analiz</div>
        </div>
        <div className="ribbon-group">
            <div className="ribbon-buttons">
                <button
                  className={`ribbon-button ${isClippingActive ? 'active' : ''}`}
                  onClick={() => toggleClippingPlane('x')}
                  title="Kesit Görünümü"
                >
                  <span className="ribbon-button-icon">✂️</span>
                  <span className="ribbon-button-text">Kesit Al</span>
                </button>
            </div>
            <div className="ribbon-group-title">Kesit</div>
        </div>
        </>
        )}
        
        {/* Yeni Kesit sekmesi */}
        {activeTab === 'section' && (
          <>
            {/* Kesit işlemleri grubu */}
            <div className="ribbon-group">
              <div className="ribbon-buttons">
                <button
                  className={`ribbon-button ${clippingAxis === 'x' && isClippingActive ? 'active' : ''}`}
                  onClick={() => toggleClippingPlane('x')}
                  title="X ekseni boyunca kesit al"
                >
                  <span className="ribbon-button-icon">↔️</span>
                  <span className="ribbon-button-text">X Kesiti</span>
                </button>
                <button
                  className={`ribbon-button ${clippingAxis === 'y' && isClippingActive ? 'active' : ''}`}
                  onClick={() => toggleClippingPlane('y')}
                  title="Y ekseni boyunca kesit al"
                >
                  <span className="ribbon-button-icon">↕️</span>
                  <span className="ribbon-button-text">Y Kesiti</span>
                </button>
                <button
                  className={`ribbon-button ${clippingAxis === 'z' && isClippingActive ? 'active' : ''}`}
                  onClick={() => toggleClippingPlane('z')}
                  title="Z ekseni boyunca kesit al"
                >
                  <span className="ribbon-button-icon">⚡</span>
                  <span className="ribbon-button-text">Z Kesiti</span>
                </button>
              </div>
              <div className="ribbon-group-title">Kesit Düzlemi</div>
            </div>
            
            <div className="ribbon-group">
              <div className="ribbon-buttons">
                <button
                  className="ribbon-button"
                  onClick={() => {
                    if (isClippingActive) {
                      const newPos = clippingPosition - 1.0;
                      setClippingPosition(newPos);
                      if (clippingPlane) clippingPlane.constant = newPos;
                      updateClippingPlanePosition(clippingAxis, newPos);
                    }
                  }}
                  disabled={!isClippingActive}
                  title="Kesit düzlemini geriye doğru hareket ettir"
                >
                  <span className="ribbon-button-icon">⬅️</span>
                  <span className="ribbon-button-text">Geriye</span>
                </button>
                <button
                  className="ribbon-button"
                  onClick={() => {
                    if (isClippingActive) {
                      const newPos = clippingPosition + 1.0;
                      setClippingPosition(newPos);
                      if (clippingPlane) clippingPlane.constant = newPos;
                      updateClippingPlanePosition(clippingAxis, newPos);
                    }
                  }}
                  disabled={!isClippingActive}
                  title="Kesit düzlemini ileriye doğru hareket ettir"
                >
                  <span className="ribbon-button-icon">➡️</span>
                  <span className="ribbon-button-text">İleriye</span>
                </button>
                {isClippingActive && (
                  <button
                    className="ribbon-button"
                    onClick={resetClipping}
                    title="Kesiti kaldır"
                  >
                    <span className="ribbon-button-icon">❌</span>
                    <span className="ribbon-button-text">Kesiti Kaldır</span>
                  </button>
                )}
              </div>
              <div className="ribbon-group-title">Kesit Kontrolü</div>
            </div>
            
            <div className="ribbon-group">
              <div className="ribbon-buttons">
                <button
                  className="ribbon-button"
                  onClick={() => {
                    if (isClippingActive && clippingPlane) {
                      // Kamera açısına göre kesit düzlemini ayarla
                      const camera = document.querySelector('canvas')._reactInternals.canonical.stateNode.__r3f.fiber.nodes.camera;
                      if (camera) {
                        const direction = new THREE.Vector3();
                        camera.getWorldDirection(direction);
                        
                        // Kameranın baktığı yöne dik bir düzlem oluştur
                        const plane = new THREE.Plane();
                        plane.normal.copy(direction);
                        plane.constant = 0; // Başlangıçta kameranın pozisyonundan geçen düzlem
                        
                        setClippingPlane(plane);
                        setClippingAxis('custom');
                        setClippingPosition(0);
                        applyClippingToAllMaterials(plane);
                        updateClippingPlanePosition('custom', 0);
                      }
                    }
                  }}
                  disabled={!isClippingActive}
                  title="Kamera açısına göre kesit düzlemini ayarla"
                >
                  <span className="ribbon-button-icon">📷</span>
                  <span className="ribbon-button-text">Kamera Açısı</span>
                </button>
                <button
                  className="ribbon-button"
                  onClick={() => {
                    if (isClippingActive && clippingPlane) {
                      // Kesit düzlemini ters çevir
                      const plane = clippingPlane.clone();
                      plane.normal.negate();
                      setClippingPlane(plane);
                      applyClippingToAllMaterials(plane);
                    }
                  }}
                  disabled={!isClippingActive}
                  title="Kesit düzlemini ters çevir"
                >
                  <span className="ribbon-button-icon">🔄</span>
                  <span className="ribbon-button-text">Ters Çevir</span>
                </button>
              </div>
              <div className="ribbon-group-title">Gelişmiş</div>
            </div>
          </>
        )}
        {/* Arama kutusu genel bir alana taşınabilir veya her sekmede olabilir */}
        {/* <div className="ribbon-search-container"> ... </div> */}
        
        {activeTab === 'account' && (
          <>
            <div className="ribbon-group">
              <div className="ribbon-buttons">
                <button
                  className="ribbon-button"
                  onClick={onSettings}
                  title="Ayarlar"
                >
                  <span className="ribbon-button-icon">⚙️</span>
                  <span className="ribbon-button-text">Ayarlar</span>
                </button>
                <button
                  className="ribbon-button"
                  onClick={onLogout}
                  title="Oturumu Kapat"
                >
                  <span className="ribbon-button-icon">🚪</span>
                  <span className="ribbon-button-text">Oturumu Kapat</span>
                </button>
              </div>
              <div className="ribbon-group-title">Hesap İşlemleri</div>
            </div>
          </>
        )}
        
        {activeTab === 'report' && (
          <>
            <div className="ribbon-group">
              <div className="ribbon-buttons">
                <button
                  onClick={() => setViewMode('dashboard')}
                  style={{ backgroundColor: '#16a085', color: 'white', border: 'none', padding: '8px 12px', borderRadius: '4px', cursor: 'pointer' }}
                >
                  Raporlar
                </button>
              </div>
              <div className="ribbon-group-title">Raporlar</div>
            </div>
          </>
        )}

      </div>
      )}
      {/* Kesit pozisyonu kontrolü */}
      {showClippingControls && (
        <div className="clipping-slider-container">
          <div className="clipping-slider">
            <div className="slider-label">Kesit Pozisyonu: {clippingPosition.toFixed(1)}</div>
            <div className="slider-controls">
              <button
                className="ribbon-small-button"
                onClick={() => {
                  const newPos = clippingPosition - 0.5;
                  setClippingPosition(newPos);
                  if (clippingPlane) clippingPlane.constant = newPos;
                  updateClippingPlanePosition(clippingAxis, newPos);
                }}
              >
                <span className="ribbon-small-button-icon">-</span>
              </button>
              <input
                type="range"
                min={-(modelSize[clippingAxis] || 10) / 2} // modelSize tanımsızsa varsayılan değer
                max={(modelSize[clippingAxis] || 10) / 2}  // modelSize tanımsızsa varsayılan değer
                step="0.1"
                value={clippingPosition}
                onChange={(e) => {
                  const newPos = parseFloat(e.target.value);
                  setClippingPosition(newPos);
                  if (clippingPlane) clippingPlane.constant = newPos;
                  updateClippingPlanePosition(clippingAxis, newPos);
                }}
                className="position-slider"
              />
              <button
                className="ribbon-small-button"
                onClick={() => {
                  const newPos = clippingPosition + 0.5;
                  setClippingPosition(newPos);
                  if (clippingPlane) clippingPlane.constant = newPos;
                  updateClippingPlanePosition(clippingAxis, newPos);
                }}
              >
                <span className="ribbon-small-button-icon">+</span>
              </button>
            </div>
          </div>
          <div className="clipping-hint">
            Kesit düzlemini sürükleyerek veya tutamaçlardan çekerek pozisyonu ayarlayabilirsiniz.
          </div>
        </div>
      )}
    </div>
    </div>
  );
});

const MachineModel = forwardRef(
  ({ selectedPart, onPartClick, partStatuses, onHierarchyReady, isIsolated, toggleIsolation, filterStatus, setFilterStatus, explosionFactor, setExplosionFactor, onLogout, onSettings, searchTerm, setSearchTerm, viewMode, setViewMode, modelUrl: preferredModelUrl }, ref) => {
    // Create a default texture for fallback
    const createDefaultTexture = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const context = canvas.getContext('2d');
      if (context) {
        context.fillStyle = '#cccccc';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.strokeStyle = '#999999';
        context.lineWidth = 2;
        context.beginPath();
        context.moveTo(0, 0);
        context.lineTo(canvas.width, canvas.height);
        context.moveTo(canvas.width, 0);
        context.lineTo(0, canvas.height);
        context.stroke();
      }
      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      return texture;
    };

    // Create default texture once
    const defaultTexture = useMemo(() => createDefaultTexture(), []);

    // Model URL'i öncelikle prop'tan alınır; yoksa env'den (Google Drive linki dahil) okunur; yoksa yerel fallback kullanılır
    const computeModelUrl = () => {
      // 1) Projeler sayfasından gelen URL öncelikli
      if (preferredModelUrl && typeof preferredModelUrl === 'string') {
        if (preferredModelUrl.includes('drive.google.com')) {
          const env = import.meta?.env || {};
          const apiKey = (env.VITE_GDRIVE_API_KEY && String(env.VITE_GDRIVE_API_KEY).trim()) || '';
          const m = preferredModelUrl.match(/\/file\/d\/([^/]+)\//) || preferredModelUrl.match(/[?&]id=([^&]+)/);
          const fileId = m && m[1] ? m[1] : '';
          if (fileId) {
            // API key varsa Google Drive API yolunu kullan (CORS güvenli), yoksa usercontent hostu dene
            if (apiKey) return `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${apiKey}`;
            return `https://drive.usercontent.google.com/uc?export=download&id=${fileId}`;
          }
        }
        // Drive değilse veya id çıkarılamazsa doğrudan kullan
        return preferredModelUrl;
      }

      // 2) .env'den okuma
      const env = import.meta?.env || {};
      const raw = (env.VITE_MODEL_URL && String(env.VITE_MODEL_URL).trim()) || '';
      const fileIdEnv = (env.VITE_GDRIVE_FILE_ID && String(env.VITE_GDRIVE_FILE_ID).trim()) || '';
      const apiKey = (env.VITE_GDRIVE_API_KEY && String(env.VITE_GDRIVE_API_KEY).trim()) || '';

      // Google Drive FILE_ID'yi bul
      let fileId = fileIdEnv;
      if (!fileId && raw.includes('drive.google.com')) {
        const m = raw.match(/\/file\/d\/([^/]+)\//) || raw.match(/[?&]id=([^&]+)/);
        if (m && m[1]) fileId = m[1];
      }

      // 3) Google Drive ise API key ile (varsa) veya usercontent ile indir
      if (fileId) {
        if (apiKey) return `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${apiKey}`;
        return `https://drive.usercontent.google.com/uc?export=download&id=${fileId}`;
      }

      // 4) Ham URL varsa onu kullan; yoksa güvenilir CDN fallback'i kullan
      return raw || 'https://storage.googleapis.com/makinalar/ttu-0911-1000000-r00%20%281%29.glb';
    };
  
    const modelUrl = computeModelUrl();

    // Doku yükleme hatalarını önlemek için ek seçeneklerle GLTF yükleme
    const { scene, nodes } = useGLTF(modelUrl, {
      onError: (e) => console.error("GLTF yükleme hatası:", e),
      // Texture loading options to handle errors better
      textureColorSpace: THREE.SRGBColorSpace,
      crossorigin: 'anonymous'
    });
    // İsteğe bağlı: model URL'ini preload et
    try { if (useGLTF.preload) useGLTF.preload(modelUrl); } catch {}
    const meshRefs = useRef({});
    const groupRef = useRef();
    const selectedMeshRef = useRef(null);
    // Persisted selection criteria to make every click reliably paintable
    const selectedSigRef = useRef(null);
    const selectedGroupKeyRef = useRef(null);
    const selectedFamilyRef = useRef(null);
    const selectedGeoUUIDRef = useRef(null);
    const selectedMeshUUIDRef = useRef(null);
    // Seçim kaynağı: 'scene' (sahneden tıklama) veya 'external' (dış/menüden seçim)
    const lastSelectSourceRef = useRef('external');
    const partGroupsRef = useRef({});
    const partFamiliesRef = useRef({});
    const { camera, controls, gl, invalidate } = useThree();
    const [hoveredPart, setHoveredPart] = useState(null);
    const [internalSelectedPart, setInternalSelectedPart] = useState(selectedPart || null);
    
    // Sync selectedPart prop with internal state and try to link a concrete mesh for signature matching
    useEffect(() => {
      setInternalSelectedPart(selectedPart || null);
      // Sahneden tıklama sonrası gelen parent selectedPart güncellemesinde,
      // mevcut tıklanan mesh referansını korumak için override etmeyelim.
      if (lastSelectSourceRef.current === 'scene') {
        lastSelectSourceRef.current = 'external';
        return;
      }
      if (selectedPart) {
        const meshes = partGroupsRef.current[selectedPart];
        if (meshes && meshes.length > 0) {
          selectedMeshRef.current = meshes[0];
        } else if (meshRefs.current[selectedPart]) {
          selectedMeshRef.current = meshRefs.current[selectedPart];
        } else {
          selectedMeshRef.current = null;
        }
  
        // Update persisted selection criteria to keep highlighting even if name lookup fails
        const m = selectedMeshRef.current;
        if (m) {
          selectedSigRef.current = m.userData?.copySignature ?? null;
          selectedGroupKeyRef.current = m.userData?.serialGroupKey
            ?? m.userData?.baseNameNormalized
            ?? normalizePartName(selectedPart);
          selectedFamilyRef.current = m.userData?.partFamily ?? null;
          selectedGeoUUIDRef.current = m.geometry?.uuid ?? null;
          selectedMeshUUIDRef.current = m.uuid ?? null;
        } else {
          // Fall back to normalized text key so suffix -1/-2/-3 still group
          selectedSigRef.current = null;
          selectedGroupKeyRef.current = normalizePartName(selectedPart);
          selectedFamilyRef.current = null;
          selectedGeoUUIDRef.current = null;
          selectedMeshUUIDRef.current = null;
        }
      } else {
        selectedMeshRef.current = null;
        selectedSigRef.current = null;
        selectedGroupKeyRef.current = null;
        selectedFamilyRef.current = null;
        selectedGeoUUIDRef.current = null;
        selectedMeshUUIDRef.current = null;
      }
    }, [selectedPart]);
    const [isLoading, setIsLoading] = useState(true);
    const [hiddenParts, setHiddenParts] = useState([]); // Gizlenen parçaları tutacak state
    const [clippingPlane, setClippingPlane] = useState(null); // Kesit alma için
    const [clippingAxis, setClippingAxis] = useState('x'); // Kesit alma ekseni: 'x', 'y', 'z', 'custom'
    const [clippingPosition, setClippingPosition] = useState(0); // Kesit alma pozisyonu
    const [hiddenPartsHistory, setHiddenPartsHistory] = useState([]); // Gizleme geçmişi için
    const [modelSize, setModelSize] = useState({ x: 10, y: 10, z: 10 }); // Model boyutu
    const [isClippingActive, setIsClippingActive] = useState(false); // Kesit aktif mi
    const [clippingOffset, setClippingOffset] = useState({ x: 0, y: 0, z: 0 }); // Kesit düzlemi ofset

    // Kesit düzlemi için
    const [showClippingControls, setShowClippingControls] = useState(false); // Kesit kontrolleri göster/gizle
    const [clippingPlaneVisible, setClippingPlaneVisible] = useState(false); // Kesit düzlemi görünürlüğü
    const clippingPlaneRef = useRef(); // Kesit düzlemi referansı
    const [isDraggingClippingPlane, setIsDraggingClippingPlane] = useState(false); // Kesit düzlemi sürükleniyor mu
    const [clippingHandleSize, setClippingHandleSize] = useState({ width: 0, height: 0 }); // Kesit düzlemi tutamaç boyutu

    // Ribbon menü için DOM container ve root
    const ribbonContainerRef = useRef(null);
    const ribbonRootRef = useRef(null);
    const ribbonMenuRef = useRef(null);
    // Ribbon sabitleme/küçültme
    const [ribbonPinned, setRibbonPinned] = useState(true);
    const [ribbonCollapsed, setRibbonCollapsed] = useState(false);

    // Yeni state'ler
    const [isMeasureToolActive, setIsMeasureToolActive] = useState(false);
    const [isExplodedView, setIsExplodedView] = useState(false);
    // Grup boyama: kapalı (false) = sadece tıklanan parça boyanır
    const [groupPaint, setGroupPaint] = useState(false);
    
    // Memoize overallCenter calculation for exploded view
    const overallCenter = useMemo(() => {
        if (groupRef.current) {
            return new THREE.Box3().setFromObject(groupRef.current).getCenter(new THREE.Vector3());
        }
        return new THREE.Vector3(0, 0, 0);
    }, [groupRef.current, isExplodedView, modelSize]);
    
    // Ölçüm aracı için state'ler
    const [measurePoints, setMeasurePoints] = useState([]);
    const [measureMode, setMeasureMode] = useState('distance'); // 'distance', 'angle', 'radius'
    const [measureResult, setMeasureResult] = useState(null);
    const [measurementVisible, setMeasurementVisible] = useState(false);
    const [hoveredMeasurePoint, setHoveredMeasurePoint] = useState(null);
    // Ölçüm paneli sürükleme/konum
    const [measurePanelPos, setMeasurePanelPos] = useState(() => {
      try {
        const w = typeof window !== 'undefined' ? window.innerWidth : 900;
        return { x: Math.max(16, w - 340), y: 90 };
      } catch { return { x: 560, y: 90 }; }
    });
    const [isDraggingMeasurePanel, setIsDraggingMeasurePanel] = useState(false);
    const measurePanelDragOffsetRef = useRef({ x: 0, y: 0 });
    // Ölçüm paneli ayarları
    const [measureUnits, setMeasureUnits] = useState('mm'); // 'mm' | 'cm' | 'm' | 'in'
    const [measurePrecision, setMeasurePrecision] = useState(2); // ondalık hassasiyet
    const [showXYZ, setShowXYZ] = useState(true); // XYZ bileşenlerini göster
    const [coordSystem, setCoordSystem] = useState('world'); // 'world' | 'model' | 'camera' | 'selected'
    const [projectionAxis, setProjectionAxis] = useState('none'); // 'none' | 'x' | 'y' | 'z'
    
    // Sağ tık menüsü için state'ler
    const [contextMenuVisible, setContextMenuVisible] = useState(false);
    const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });
    
    // Cihaz tipini tespit et
    const [isMobile, setIsMobile] = useState(false);

    // Fare tekerleği yönünü tersine çevir
    useEffect(() => {
      if (controls) {
        const originalZoomSpeed = controls.zoomSpeed;
        controls.zoomSpeed = -Math.abs(originalZoomSpeed);
        return () => {
          if (controls) {
            controls.zoomSpeed = Math.abs(originalZoomSpeed);
          }
        };
      }
    }, [controls]);

    // Ribbon menüsünü DOM'a ekle
    // Mount RibbonMenu container and root once
    useEffect(() => {
      if (!ribbonRootRef.current) {
        const ribbonFixedContainer = document.createElement('div');
        ribbonFixedContainer.id = 'ribbon-menu-fixed-container';
        ribbonFixedContainer.style.position = 'fixed';
        ribbonFixedContainer.style.top = '0';
        ribbonFixedContainer.style.left = '0';
        ribbonFixedContainer.style.right = '0';
        ribbonFixedContainer.style.zIndex = '10000';
        ribbonFixedContainer.style.pointerEvents = 'auto';

        document.body.insertBefore(ribbonFixedContainer, document.body.firstChild);
        ribbonContainerRef.current = ribbonFixedContainer;

        const root = createRoot(ribbonFixedContainer);
        ribbonRootRef.current = root;

        // Apply body padding after first paint to account for ribbon height
        requestAnimationFrame(() => {
          const ribbonMenuHeight = ribbonFixedContainer.offsetHeight || 80;
          document.body.style.paddingTop = `${ribbonMenuHeight}px`;
        });
      }

      // Cleanup only on unmount
      return () => {
        if (ribbonRootRef.current) {
          ribbonRootRef.current.unmount();
          ribbonRootRef.current = null;
        }
        if (ribbonContainerRef.current && ribbonContainerRef.current.parentNode) {
          ribbonContainerRef.current.parentNode.removeChild(ribbonContainerRef.current);
          ribbonContainerRef.current = null;
        }
        document.body.style.paddingTop = '0';
      };
    }, []);

    // Update RibbonMenu props without re-mounting
    useEffect(() => {
      if (!ribbonRootRef.current) return;
  
      ribbonRootRef.current.render(
        <RibbonMenu
          ref={ribbonMenuRef}
          viewMode={viewMode}
          setViewMode={setViewMode}
          selectedPart={internalSelectedPart}
          hideSelectedPart={hideSelectedPart}
          hiddenPartsHistory={hiddenPartsHistory}
          undoHide={undoHide}
          hiddenParts={hiddenParts}
          showAllParts={showAllParts}
          clippingAxis={clippingAxis}
          isClippingActive={isClippingActive}
          toggleClippingPlane={toggleClippingPlane}
          resetClipping={resetClipping}
          showClippingControls={showClippingControls}
          clippingPosition={clippingPosition}
          setClippingPosition={setClippingPosition}
          clippingPlane={clippingPlane}
          onSetViewOrientation={setViewOrientation}
          onZoomToFit={zoomToFit}
          onActivateMeasureTool={activateMeasureTool}
          isMeasureToolActive={isMeasureToolActive}
          onToggleExplodedView={toggleExplodedView}
          isExplodedView={isExplodedView}
          onToggleIsolation={toggleIsolation}
          updateClippingPlanePosition={updateClippingPlanePosition}
          modelSize={modelSize}
          filterStatus={filterStatus}
          setFilterStatus={setFilterStatus}
          isIsolated={isIsolated}
          statusColors={statusColors}
          explosionFactor={explosionFactor}
          setExplosionFactor={setExplosionFactor}
          onLogout={onLogout}
          onSettings={onSettings}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          groupPaint={groupPaint}
          setGroupPaint={setGroupPaint}
          ribbonPinned={ribbonPinned}
          setRibbonPinned={setRibbonPinned}
          ribbonCollapsed={ribbonCollapsed}
          setRibbonCollapsed={setRibbonCollapsed}
        />
      );
  
      // Recompute body padding to current ribbon height
      requestAnimationFrame(() => {
        const el = ribbonContainerRef.current;
        if (el) {
          const h = el.offsetHeight || 80;
          document.body.style.paddingTop = `${h}px`;
        }
      });
    }, [viewMode, internalSelectedPart, hiddenPartsHistory, hiddenParts,
        clippingAxis, isClippingActive, showClippingControls,
        clippingPosition, clippingPlane, modelSize, isMeasureToolActive, isExplodedView,
        toggleIsolation, filterStatus, isIsolated, searchTerm, explosionFactor, groupPaint,
        ribbonPinned, ribbonCollapsed]);

    useEffect(() => {
      const checkMobile = () => {
        const mobile = window.innerWidth <= 768 ||
                      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        setIsMobile(mobile);
      };

      checkMobile();
      window.addEventListener('resize', checkMobile);
      return () => window.removeEventListener('resize', checkMobile);
    }, []);
    // Auto-hide on hover when not pinned
    useEffect(() => {
      const el = ribbonContainerRef.current;
      if (!el) return;
      const onEnter = () => { if (!ribbonPinned) setRibbonCollapsed(false); };
      const onLeave = () => { if (!ribbonPinned) setRibbonCollapsed(true); };
      el.addEventListener('mouseenter', onEnter);
      el.addEventListener('mouseleave', onLeave);
      return () => {
        el.removeEventListener('mouseenter', onEnter);
        el.removeEventListener('mouseleave', onLeave);
      };
    }, [ribbonPinned]);

    const setViewOrientation = (orientation) => {
      console.log(`Set view to: ${orientation}`);
      if (controls && camera && groupRef.current) {
        const box = new THREE.Box3().setFromObject(groupRef.current);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const distance = maxDim * 2;

        controls.target.copy(center);

        switch (orientation) {
            case 'front':
                camera.position.set(center.x, center.y, center.z + distance);
                break;
            case 'top':
                camera.position.set(center.x, center.y + distance, center.z);
                break;
            case 'iso':
                const d = distance / Math.sqrt(3);
                camera.position.set(center.x + d, center.y + d, center.z + d);
                break;
            default:
                camera.position.set(center.x, center.y, center.z + distance);
                break;
        }
        camera.lookAt(center);
        controls.update();
        
      }
    };

    const zoomToFit = () => {
      if (groupRef.current && controls && camera) {
        const box = new THREE.Box3().setFromObject(groupRef.current);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const fitOffset = 1.25;
        const fov = camera.fov * (Math.PI / 180);
        const cameraDistance = (maxDim / 2 / Math.tan(fov / 2)) * fitOffset;

        const direction = new THREE.Vector3();
        camera.getWorldDirection(direction);

        camera.position.copy(center).sub(direction.multiplyScalar(cameraDistance));
        controls.target.copy(center);
        controls.update();
      }
      console.log("Zoom to Fit");
    };

    const activateMeasureTool = () => {
      const newState = !isMeasureToolActive;
      setIsMeasureToolActive(newState);
      console.log(`Measure tool: ${newState ? 'ON' : 'OFF'}`);
      
      if (!newState) {
        // Ölçüm aracı kapatıldığında ölçüm verilerini temizle
        setMeasurePoints([]);
        setMeasureResult(null);
        setMeasurementVisible(false);
      } else {
        // Ölçüm aracı açıldığında varsayılan modu ayarla
        setMeasureMode('distance');
      }
    };
    
    // Ölçüm noktası ekleme fonksiyonu
    const addMeasurePoint = (point) => {
      if (!isMeasureToolActive) return;
      
      setMeasurePoints(prev => {
        const newPoints = [...prev, point];
        
        // Mesafe ölçümü için iki nokta gerekli
        if (measureMode === 'distance' && newPoints.length === 2) {
          const p0 = newPoints[0];
          const p1 = newPoints[1];
          const distance = p0.distanceTo(p1);
          const basis = getBasisAxes();
          const delta = p1.clone().sub(p0);
          const comps = basis ? { x: delta.dot(basis.x), y: delta.dot(basis.y), z: delta.dot(basis.z) } : null;
          setMeasureResult({
            type: 'distance',
            raw: distance, // model units
            comps,
            points: [...newPoints]
          });
          setMeasurementVisible(true);
        }
        
        // Açı ölçümü için üç nokta gerekli
        else if (measureMode === 'angle' && newPoints.length === 3) {
          const v1 = new THREE.Vector3().subVectors(newPoints[0], newPoints[1]);
          const v2 = new THREE.Vector3().subVectors(newPoints[2], newPoints[1]);
          const angle = v1.angleTo(v2) * (180 / Math.PI);
          setMeasureResult({
            type: 'angle',
            value: angle,
            unit: '°',
            points: [...newPoints]
          });
          setMeasurementVisible(true);
        }
        
        // Yarıçap ölçümü için üç nokta gerekli (çember üzerinde)
        else if (measureMode === 'radius' && newPoints.length === 3) {
          // Üç noktadan geçen çemberin yarıçapını hesapla
          const circle = calculateCircleFrom3Points(newPoints[0], newPoints[1], newPoints[2]);
          if (circle) {
            setMeasureResult({
              type: 'radius',
              raw: circle.radius, // model units
              center: circle.center,
              points: [...newPoints]
            });
            setMeasurementVisible(true);
          }
        }
        
        // Maksimum nokta sayısına ulaşıldığında sıfırla
        if ((measureMode === 'distance' && newPoints.length >= 2) ||
            (measureMode === 'angle' && newPoints.length >= 3) ||
            (measureMode === 'radius' && newPoints.length >= 3)) {
          return [];
        }
        
        return newPoints;
      });
    };
  
    // Ölçüm paneli sürükleme dinleyicileri
    useEffect(() => {
      if (!isDraggingMeasurePanel) return;
      const onMove = (e) => {
        e.preventDefault();
        const nx = e.clientX - measurePanelDragOffsetRef.current.x;
        const ny = e.clientY - measurePanelDragOffsetRef.current.y;
        const maxX = (window.innerWidth || 900) - 100;
        const maxY = (window.innerHeight || 600) - 50;
        setMeasurePanelPos({
          x: Math.max(0, Math.min(nx, maxX)),
          y: Math.max(0, Math.min(ny, maxY))
        });
      };
      const onUp = () => {
        setIsDraggingMeasurePanel(false);
        document.body.style.userSelect = '';
      };
      window.addEventListener('pointermove', onMove, { passive: false });
      window.addEventListener('pointerup', onUp, { passive: true });
      return () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
    }, [isDraggingMeasurePanel]);
  
    const startDragMeasurePanel = (e) => {
      try {
        e.stopPropagation();
        setIsDraggingMeasurePanel(true);
        measurePanelDragOffsetRef.current = {
          x: e.clientX - measurePanelPos.x,
          y: e.clientY - measurePanelPos.y
        };
        document.body.style.userSelect = 'none';
      } catch {}
    };
    
    // Üç noktadan geçen çemberi hesaplama
    const calculateCircleFrom3Points = (p1, p2, p3) => {
      try {
        // Üç nokta doğrusal mı kontrol et
        const v1 = new THREE.Vector3().subVectors(p2, p1);
        const v2 = new THREE.Vector3().subVectors(p3, p1);
        const cross = new THREE.Vector3().crossVectors(v1, v2);
        
        if (cross.lengthSq() < 0.0001) {
          console.warn('Üç nokta doğrusal, çember hesaplanamaz');
          return null;
        }
        
        // Çember merkezi ve yarıçapı hesapla
        // Bu basit bir hesaplama, daha karmaşık geometrik hesaplamalar gerekebilir
        const d1 = p1.distanceTo(p2);
        const d2 = p2.distanceTo(p3);
        const d3 = p3.distanceTo(p1);
        
        const perimeter = d1 + d2 + d3;
        const s = perimeter / 2;
        const area = Math.sqrt(s * (s - d1) * (s - d2) * (s - d3));
        
        const radius = (d1 * d2 * d3) / (4 * area);
        
        // Çember merkezi hesaplama (basitleştirilmiş)
        const center = new THREE.Vector3().addVectors(p1, p2).add(p3).divideScalar(3);
        
        return { center, radius };
      } catch (error) {
        console.error('Çember hesaplama hatası:', error);
        return null;
      }
    };
    
    // Ölçüm modunu değiştirme fonksiyonu
    const changeMeasureMode = (mode) => {
      setMeasureMode(mode);
      setMeasurePoints([]);
      setMeasureResult(null);
      setMeasurementVisible(false);
    };
    
    // Ölçüm sonuçlarını temizleme
    const clearMeasurements = () => {
      setMeasurePoints([]);
      setMeasureResult(null);
      setMeasurementVisible(false);
    };

    // Ölçü birimi dönüşümü ve formatlama yardımcıları
    const unitFactor = useCallback((units) => {
      switch (units) {
        case 'mm': return 1;
        case 'cm': return 0.1;
        case 'm':  return 0.001;
        case 'in': return 1 / 25.4;
        default:   return 1;
      }
    }, []);

    const formatLength = useCallback((len) => {
      try {
        return `${(len * unitFactor(measureUnits)).toFixed(Math.max(0, Math.min(6, measurePrecision)))} ${measureUnits}`;
      } catch {
        return `${len.toFixed(2)} ${measureUnits}`;
      }
    }, [measureUnits, measurePrecision, unitFactor]);

    // Seçilen koordinat sisteminin dünya uzayındaki eksenleri
    const getBasisAxes = useCallback(() => {
      try {
        if (coordSystem === 'model' && groupRef.current) {
          const m = new THREE.Matrix4().extractRotation(groupRef.current.matrixWorld);
          return {
            x: new THREE.Vector3(1, 0, 0).applyMatrix4(m).normalize(),
            y: new THREE.Vector3(0, 1, 0).applyMatrix4(m).normalize(),
            z: new THREE.Vector3(0, 0, 1).applyMatrix4(m).normalize()
          };
        }
        if (coordSystem === 'camera' && camera) {
          const x = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
          const y = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion).normalize();
          const z = new THREE.Vector3();
          camera.getWorldDirection(z).normalize();
          return { x, y, z };
        }
        if (coordSystem === 'selected' && (selectedMeshRef.current || groupRef.current)) {
          const basisOf = selectedMeshRef.current || groupRef.current;
          const m = new THREE.Matrix4().extractRotation(basisOf.matrixWorld);
          return {
            x: new THREE.Vector3(1, 0, 0).applyMatrix4(m).normalize(),
            y: new THREE.Vector3(0, 1, 0).applyMatrix4(m).normalize(),
            z: new THREE.Vector3(0, 0, 1).applyMatrix4(m).normalize()
          };
        }
      } catch {}
      // world
      return {
        x: new THREE.Vector3(1, 0, 0),
        y: new THREE.Vector3(0, 1, 0),
        z: new THREE.Vector3(0, 0, 1)
      };
    }, [coordSystem, camera]);

    // Patlatılmış görünüm için
    const updateExplodedView = useCallback(() => {
        if (groupRef.current && modelSize.x > 0 && isExplodedView) { // modelSize'ın geçerli olduğundan emin ol ve sadece patlatma modu aktifse
            const explosionDistance = modelSize.x * explosionFactor; // Patlatma mesafesini ayarla

            groupRef.current.traverse((child) => {
                if (child.isMesh) {
                    if (!child.userData.originalPosition) {
                        child.userData.originalPosition = child.position.clone();
                    }

                    // Her parçanın kendi merkezini veya bounding box merkezini kullanmak daha iyi sonuç verebilir
                    // Şimdilik basit bir yaklaşımla genel merkezden uzaklaştıralım
                    const direction = child.userData.originalPosition.clone().sub(overallCenter).normalize();
                    // Eğer parça zaten merkezdeyse (direction vector'ü sıfırsa), rastgele bir yönde hafifçe it
                    if (direction.lengthSq() < 0.0001) {
                        direction.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
                    }
                    child.position.copy(child.userData.originalPosition).add(direction.multiplyScalar(explosionDistance));
                }
            });
        }
    }, [groupRef.current, modelSize, explosionFactor, isExplodedView, overallCenter]);

    const toggleExplodedView = useCallback(() => {
        setIsExplodedView(prevExplodedState => {
            const newExplodedState = !prevExplodedState;
            console.log(`Exploded view: ${newExplodedState ? 'ON' : 'OFF'}`);

            if (groupRef.current && modelSize.x > 0) { // modelSize'ın geçerli olduğundan emin ol
                groupRef.current.traverse((child) => {
                    if (child.isMesh) {
                        if (!child.userData.originalPosition) {
                            child.userData.originalPosition = child.position.clone();
                        }

                        if (newExplodedState) { // Patlat
                            // Her parçanın kendi merkezini veya bounding box merkezini kullanmak daha iyi sonuç verebilir
                            // Şimdilik basit bir yaklaşımla genel merkezden uzaklaştıralım
                            const direction = child.userData.originalPosition.clone().sub(overallCenter).normalize();
                            // Eğer parça zaten merkezdeyse (direction vector'ü sıfırsa), rastgele bir yönde hafifçe it
                            if (direction.lengthSq() < 0.0001) {
                                direction.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
                            }
                            const explosionDistance = modelSize.x * explosionFactor; // Patlatma mesafesini ayarla
                            child.position.copy(child.userData.originalPosition).add(direction.multiplyScalar(explosionDistance));
                        } else { // Topla
                            child.position.copy(child.userData.originalPosition);
                        }
                    }
                });
            }
            return newExplodedState;
        });
    }, [groupRef.current, modelSize, explosionFactor, overallCenter]);


    useImperativeHandle(ref, () => ({
      ...groupRef.current,
      getObjectByName: (name) => meshRefs.current[name] || null,
      traverse: (callback) => {
        if (groupRef.current) groupRef.current.traverse(callback);
      },
      focusOnPart: (partName) => highlightPart(partName),
      setViewMode: (mode) => setViewMode(mode),
      togglePartVisibility: (partName) => {
        setHiddenPartsHistory(prev => [...prev, [...hiddenParts]]);
        setHiddenParts(prev =>
          prev.includes(partName)
            ? prev.filter(p => p !== partName)
            : [...prev, partName]
        );
      },
      isPartHidden: (partName) => hiddenParts.includes(partName),
      setClipping: (enabled, axis = 'x', position = 0) => {
        if (enabled) {
          const plane = new THREE.Plane();
          if (axis === 'x') plane.normal.set(1, 0, 0);
          else if (axis === 'y') plane.normal.set(0, 1, 0);
          else if (axis === 'z') plane.normal.set(0, 0, 1);
          plane.constant = position;
          setClippingPlane(plane);
          setClippingAxis(axis);
          setClippingPosition(position);
          setIsClippingActive(true);
          applyClippingToAllMaterials(plane);
          updateClippingPlanePosition(axis, position);
          setClippingPlaneVisible(true);
        } else {
          setClippingPlane(null);
          setIsClippingActive(false);
          setClippingPlaneVisible(false);
          applyClippingToAllMaterials(null);
        }
      },
      updateClippingPosition: (position) => {
        setClippingPosition(position);
        if (clippingPlane) {
          clippingPlane.constant = position;
          scene.traverse((child) => {
            if (child.isMesh && child.material) {
              if (Array.isArray(child.material)) {
                child.material.forEach(mat => { mat.needsUpdate = true; });
              } else {
                child.material.needsUpdate = true;
              }
            }
          });
          updateClippingPlanePosition(clippingAxis, position);
        }
      },
      getClippingState: () => ({
        enabled: isClippingActive,
        axis: clippingAxis,
        position: clippingPosition
      }),
      undoHidePart: () => {
        if (hiddenPartsHistory.length > 0) {
          const lastState = hiddenPartsHistory[hiddenPartsHistory.length - 1];
          setHiddenParts(lastState);
          setHiddenPartsHistory(prev => prev.slice(0, -1));
          return true;
        }
        return false;
      },
      setViewOrientation,
      zoomToFit,
      activateMeasureTool,
      toggleExplodedView // Bu MachineModel içindeki toggleExplodedView
    }), [viewMode, hiddenParts, clippingPlane, clippingAxis, clippingPosition, hiddenPartsHistory, isClippingActive, scene, isMeasureToolActive, isExplodedView, modelSize]); // modelSize eklendi

    const updateClippingPlanePosition = useCallback((axis, position) => {
      if (!scene || !scene.children.length) return; // Sahne boşsa veya yüklenmediyse çık
      const box = new THREE.Box3().setFromObject(scene);
      if (box.isEmpty()) return; // Bounding box boşsa çık

      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const planePosition = center.clone();

      if (clippingPlaneRef.current) {
        if (axis === 'x') {
          planePosition.x = position;
          const width = Math.max(0.1, size.z); // Boyut 0 olmasın
          const height = Math.max(0.1, size.y);
          clippingPlaneRef.current.scale.set(0.01, height, width);
          clippingPlaneRef.current.rotation.set(0, Math.PI / 2, 0);
          setClippingHandleSize({ width, height });
        } else if (axis === 'y') {
          planePosition.y = position;
          const width = Math.max(0.1, size.x);
          const height = Math.max(0.1, size.z);
          clippingPlaneRef.current.scale.set(width, 0.01, height);
          clippingPlaneRef.current.rotation.set(Math.PI / 2, 0, 0);
          setClippingHandleSize({ width, height });
        } else if (axis === 'z') {
          planePosition.z = position;
          const width = Math.max(0.1, size.x);
          const height = Math.max(0.1, size.y);
          clippingPlaneRef.current.scale.set(width, height, 0.01);
          clippingPlaneRef.current.rotation.set(0, 0, 0);
          setClippingHandleSize({ width, height });
        } else if (axis === 'custom') {
          // Custom düzlem için, normal vektörüne dik bir düzlem oluştur
          if (clippingPlane) {
            // Düzlemin normal vektörüne dik iki vektör bul
            const normal = clippingPlane.normal.clone();
            const v1 = new THREE.Vector3(1, 0, 0);
            if (Math.abs(normal.dot(v1)) > 0.9) {
              v1.set(0, 1, 0); // Normal X eksenine çok yakınsa Y eksenini kullan
            }
            const v2 = new THREE.Vector3().crossVectors(normal, v1).normalize();
            const v3 = new THREE.Vector3().crossVectors(normal, v2).normalize();
            
            // Düzlem boyutlarını ayarla
            const maxSize = Math.max(size.x, size.y, size.z);
            const width = maxSize;
            const height = maxSize;
            
            // Düzlemi konumlandır
            planePosition.copy(center).addScaledVector(normal, position);
            
            // Düzlemi normal vektörüne göre döndür
            clippingPlaneRef.current.position.copy(planePosition);
            clippingPlaneRef.current.lookAt(planePosition.clone().add(normal));
            clippingPlaneRef.current.scale.set(width, height, 0.01);
            
            setClippingHandleSize({ width, height });
          }
        }
        
        if (axis !== 'custom' || !clippingPlane) {
          clippingPlaneRef.current.position.copy(planePosition);
        }
      }
    }, [scene, clippingPlane, clippingPlaneRef, setClippingHandleSize]);

    const applyClippingToAllMaterials = useCallback((plane) => {
      if (!scene) return; // Sahne yoksa çık
      scene.traverse((child) => {
        if (child.isMesh) {
          if (Array.isArray(child.material)) {
            child.material.forEach(mat => {
              mat.clippingPlanes = plane ? [plane] : [];
              mat.clipIntersection = false;
              mat.needsUpdate = true;
            });
          } else if (child.material) {
            child.material.clippingPlanes = plane ? [plane] : [];
            child.material.clipIntersection = false;
            child.material.needsUpdate = true;
          }
        }
      });
      if (gl) gl.localClippingEnabled = !!plane;
    }, [scene, gl]);

    const getPartFamily = (name) => {
      const match = name.match(/^(TTU-\d+-\d+-\d+-R\d+)/);
      return match ? match[1] : name;
    };

    // Aynı parçanın kopyalarını gruplamak için isim normalizasyonu
    // Örn: "PARCA.001", "PARCA_2", "PARCA-2", "PARCA (2)", "PARCA copy 3" => "parca"
    const normalizePartName = (raw) => {
      if (!raw || typeof raw !== 'string') return '';
      let name = raw.trim();
  
      // Remove Blender/GLTF instance suffixes like ".001"
      name = name.replace(/\.\d+$/g, '');
  
      // Trailing kopya zincirlerini ...-RNN-INDEX sonrasını atarak sadeleştir
      // Örn: "TTU-...-R00-1_1" => "TTU-...-R00-1", "TPO-...-R00-3-1" => "TPO-...-R00-3"
      name = name.replace(/(-R\d{2}-\d+)((?:[_-]\d+)*)$/i, '$1');
  
      // Remove generic trailing duplication suffixes repeatedly: _2, -2, (2)
      let prev;
      do {
        prev = name;
        name = name
          .replace(/[_-]\d+$/g, '')
          .replace(/\s*\(\d+\)\s*$/g, '');
      } while (name !== prev);
  
      // Trailing "copy"/"kopya" variants
      name = name.replace(/\s+(copy|kopya)(\s*\d+)?$/i, '');
  
      // Collapse extra spaces
      name = name.replace(/\s{2,}/g, ' ');
  
      return name.toLowerCase();
    };

// Serial/assembly key helpers:
// - "SERIAL_WITH_INDEX_REGEX" => "TTU-0736-1200001-0001-R00-1" (ilk indeks korunur, kopya ekleri atılır: _1, -2 vb.)
// - "SERIAL_FULL_REGEX"       => "TPO-0751-2000001-0007-R00"   (her türlü ekten önceki R bloğu)
// - "SERIAL_SUFFIX_REGEX"     => "…-R00"                       (en kaba fallback)
const SERIAL_WITH_INDEX_REGEX = /(.+?-R\d{2}-\d+)(?:[_-]\d+)*$/i;
const SERIAL_FULL_REGEX = /([A-Z]{2,4}-\d{3,5}-\d{6,8}-\d{3,5}-R\d{2})(?:[_-]\d+)+$/i;
const SERIAL_SUFFIX_REGEX = /(.+?-R\d{2})\s*(?:[_-]\d+)*$/i;

const extractSerialBaseKey = (raw) => {
  if (!raw || typeof raw !== 'string') return null;
  const s = raw.trim();
  // Öncelik: RNN-INDEX bazını çıkar (ör: ...-R00-1) ve tüm kopya eklerini yok say
  let m = s.match(SERIAL_WITH_INDEX_REGEX);
  if (m) return m[1].toLowerCase();
  // Sonra yalnızca RNN bazını çıkar
  m = s.match(SERIAL_FULL_REGEX);
  if (m) return m[1].toLowerCase();
  // En sonda kaba RNN eşleşmesi
  m = s.match(SERIAL_SUFFIX_REGEX);
  if (m) return m[1].toLowerCase();
  return null;
};

const findSerialBaseKeyInAncestors = (node) => {
  try {
    let current = node;
    while (current) {
      const base = extractSerialBaseKey(current.name || '');
      if (base) return base;
      current = current.parent || null;
    }
  } catch {}
  return null;
};

// Compute a stable group key from ancestors; fallback to normalized current name
const getSerialGroupKeyFromNode = (node) =>
  findSerialBaseKeyInAncestors(node) ?? normalizePartName(node?.name || '');
    const highlightPart = (partName) => {
      if (!partName) return;
      const mesh = meshRefs.current[partName];
      if (!mesh) return;

      setTimeout(() => {
        let element = document.querySelector(`[data-part-name="${partName}"]`);
        if (!element) {
          const elements = Array.from(document.querySelectorAll('.menu-item, li, div, span, button, a'));
          element = elements.find(el => el.textContent && el.textContent.trim() === partName);
        }
        if (!element) {
          const elements = Array.from(document.querySelectorAll('*'));
          element = elements.find(el => el.textContent && el.textContent.trim() === partName);
        }

        if (element) {
          const parentMenu = element.closest('.collapsed, .folded, [aria-expanded="false"]');
          if (parentMenu) {
            const expandButton = parentMenu.querySelector('.expand-button, .toggle-button');
            if (expandButton) expandButton.click();
          }
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          const originalBackground = element.style.backgroundColor;
          element.style.backgroundColor = 'rgba(255, 255, 0, 0.3)';
          element.style.transition = 'background-color 0.5s';
          setTimeout(() => { element.style.backgroundColor = originalBackground; }, 100);
        }
      }, 300);
    };

    const buildHierarchy = () => {
        const hierarchyDataRoot = {}; // Use a different name to avoid confusion
        const partCounts = {};

        // First pass: count all meshes by name
        scene.traverse((child) => {
            if (child.isMesh) {
                const name = child.name || `isimsiz_mesh_${child.uuid.substring(0,5)}`;
                partCounts[name] = (partCounts[name] || 0) + 1;
            }
        });

        // Create a root node for the entire model in hierarchyDataRoot
        const rootKey = scene.name || "Model";
        hierarchyDataRoot[rootKey] = {
            name: rootKey,
            isMesh: false,
            children: {},
            count: 1,
        };

        // Second pass: build the hierarchy
        scene.traverse((node) => {
            if (node !== scene) { // Sahnenin kendisini işlemeyelim
                let parentInHierarchyChildren = hierarchyDataRoot[rootKey].children; // Default to the main root's children object

                // Find the correct parent in our hierarchyDataRoot structure
                // This needs a recursive or iterative way to find the parent in the hierarchyDataRoot
                // For simplicity, let's assume a flat structure under the main root for now,
                // or that GLTF nodes directly under scene are top-level.
                // A more robust solution would traverse the GLTF parent-child relationships
                // and replicate that in hierarchyDataRoot.

                // Simplified: if node's parent is the scene, add to rootKey's children
                if (node.parent === scene) {
                    // parentInHierarchyChildren is already hierarchyDataRoot[rootKey].children
                } else if (node.parent && node.parent.name) {
                    // Attempt to find the parent in the already built part of hierarchyDataRoot
                    // This part is tricky and might need a helper function to find the parent node in hierarchyDataRoot
                    // For now, let's keep it simple and assume direct children of scene or known groups
                    // This logic needs to be more robust for deep hierarchies.
                    // A temporary placeholder:
                    if (hierarchyDataRoot[rootKey].children[node.parent.name]) {
                        parentInHierarchyChildren = hierarchyDataRoot[rootKey].children[node.parent.name].children;
                    } else {
                        // If parent is not found directly under rootKey, it might be a deeper node.
                        // This indicates the need for a more complex traversal to build the hierarchy.
                        // For now, we'll add it to the root if its direct GLTF parent isn't found in our hierarchy yet.
                    }
                }


                const nodeName = node.name || `isimsiz_${node.isMesh ? 'mesh' : 'grup'}_${node.uuid.substring(0,5)}`;
                if (!parentInHierarchyChildren[nodeName]) {
                     parentInHierarchyChildren[nodeName] = {
                        name: nodeName, isMesh: node.isMesh, children: {}, count: node.isMesh ? (partCounts[nodeName] || 1) : 1,
                    };
                }
            }
        });
        onHierarchyReady(hierarchyDataRoot);
    };


    const calculateModelSize = () => {
      if (scene && scene.children.length > 0) {
        const box = new THREE.Box3().setFromObject(scene);
        if (!box.isEmpty()) {
          const size = box.getSize(new THREE.Vector3());
          setModelSize(size);
          return size; // Boyutu döndür
        }
      }
      const defaultSize = { x: 10, y: 10, z: 10 };
      setModelSize(defaultSize); // Varsayılan boyut
      return defaultSize;
    };

    useEffect(() => {
      const handleKeyDown = (e) => {
              if (e.key === 'Tab' && internalSelectedPart) {
                e.preventDefault();
                setHiddenPartsHistory(prev => [...prev, [...hiddenParts]]);
                setHiddenParts(prev => [...prev, internalSelectedPart]);
              }
        if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
          if (hiddenPartsHistory.length > 0) {
            e.preventDefault();
            const lastState = hiddenPartsHistory[hiddenPartsHistory.length - 1];
            setHiddenParts(lastState);
            setHiddenPartsHistory(prev => prev.slice(0, -1));
          }
        }
        if (e.key === 'x' && e.shiftKey) toggleClippingPlane('x');
        if (e.key === 'y' && e.shiftKey) toggleClippingPlane('y');
        if (e.key === 'z' && e.shiftKey) toggleClippingPlane('z');
        if (clippingPlaneVisible || isClippingActive) {
          let newPosStep = 0.5;
          if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
            setClippingPosition(prev => {
              const newPos = prev + newPosStep;
              if (clippingPlane) clippingPlane.constant = newPos;
              updateClippingPlanePosition(clippingAxis, newPos);
              return newPos;
            });
          } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
            setClippingPosition(prev => {
              const newPos = prev - newPosStep;
              if (clippingPlane) clippingPlane.constant = newPos;
              updateClippingPlanePosition(clippingAxis, newPos);
              return newPos;
            });
          }
          if (e.key === 'Escape') resetClipping();
        }
        if (e.key === 'w' && e.ctrlKey) {
          e.preventDefault();
          setViewMode(prev => prev === 'wireframe' ? 'normal' : 'wireframe');
        }
        if (e.key === 'r' && e.ctrlKey) {
          e.preventDefault();
          setViewMode(prev => prev === 'xray' ? 'normal' : 'xray');
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
          }, [internalSelectedPart, hiddenParts, hiddenPartsHistory, clippingPlaneVisible, clippingAxis, clippingPlane, isClippingActive]);

    useEffect(() => {
      setIsLoading(true);
      
// Doku yükleme hatalarını ele almak için
      const textureLoader = new THREE.TextureLoader();
      textureLoader.crossOrigin = 'anonymous';
      
// Tüm dokuları kontrol et ve hatalı olanları düzelt
      try {
        scene.traverse((object) => {
          if (object.isMesh && object.material) {
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            
            materials.forEach(material => {
              // Doku haritalarını kontrol et
              const maps = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'];
              
              let hasValidTexture = false;
              
              maps.forEach(mapType => {
                if (material[mapType]) {
                  // Check if texture is valid
                  if (!material[mapType].image ||
                      material[mapType].image.complete === false ||
                      material[mapType].image.currentSrc?.startsWith('blob:')) {
                    console.warn(`${object.name || 'Isimsiz mesh'} için ${mapType} dokusu yüklenemedi, kaldırılıyor`);
                    material[mapType] = null;
                  } else {
                    hasValidTexture = true;
                  }
                }
              });
              
              // If no valid textures, apply default texture to base map
              if (!hasValidTexture && material.map === null) {
                material.map = defaultTexture;
                console.warn(`${object.name || 'Isimsiz mesh'} için varsayılan doku uygulanıyor`);
              }
              
              // Update material after potential texture removal or addition
              material.needsUpdate = true;
            });
          }
        });
      } catch (error) {
        console.error("Doku işleme hatası:", error);
      }
      const currentModelSize = calculateModelSize(); // Model boyutunu hesapla ve sakla
      setModelSize(currentModelSize); // State'i güncelle

      buildHierarchy();

      const partGroups = {};
      const partFamiliesData = {}; // Adını değiştirdim, ref ile karışmasın

      scene.traverse((child) => {
        if (child.isMesh) {
          const name = child.name || `isimsiz_mesh_${child.uuid.substring(0,5)}`;
          // Her mesh için normalize edilmiş temel ad anahtarını sakla
          try {
            child.userData.baseNameNormalized = (typeof name === 'string')
              ? name.trim()
                  .replace(/\.\d+$/g, '')              // .001
                  .replace(/[_-]\d+$/g, '')            // _2 or -2
                  .replace(/\s*\(\d+\)\s*$/g, '')      // (2)
                  .replace(/\s+copy(\s*\d+)?$/i, '')   // copy, copy 3
                  .replace(/\s+kopya(\s*\d+)?$/i, '')  // kopya, kopya 3 (TR)
                  .replace(/\s{2,}/g, ' ')
                  .toLowerCase()
              : '';
            // İmza: normalize edilmiş ad + geometri boyutu (aynı parçanın kopyaları için güçlü eşleşme)
            let sx = 0, sy = 0, sz = 0;
            if (child.geometry) {
              if (!child.geometry.boundingBox && child.geometry.computeBoundingBox) {
                try { child.geometry.computeBoundingBox(); } catch {}
              }
              if (child.geometry.boundingBox) {
                const size = new THREE.Vector3();
                child.geometry.boundingBox.getSize(size);
                sx = Math.round(size.x * 1000) / 1000;
                sy = Math.round(size.y * 1000) / 1000;
                sz = Math.round(size.z * 1000) / 1000;
              }
            }
            try {
              const serialKey = getSerialGroupKeyFromNode(child);
              child.userData.serialGroupKey = serialKey || child.userData.baseNameNormalized || '';
            } catch {
              child.userData.serialGroupKey = child.userData.baseNameNormalized || '';
            }
            child.userData.copySignature = `${child.userData.serialGroupKey}|${sx},${sy},${sz}`;
          } catch {}
          if (!partGroups[name]) partGroups[name] = [];
          partGroups[name].push(child);
          meshRefs.current[name] = child;

          // Materyal ve doku hata yönetimi
          try {
            // Orijinal rengi sakla
            if (!child.userData.originalColor) {
              child.userData.originalColor = child.material && child.material.color ?
                child.material.color.clone() : new THREE.Color(0x808080);
            }
            
            // Eğer materyal yoksa veya bozuksa, yeni bir materyal oluştur
            if (!child.material || typeof child.material !== 'object') {
              console.warn(`Mesh ${name} için geçersiz materyal, yenisi oluşturuluyor`);
              child.material = new THREE.MeshStandardMaterial({
                color: child.userData.originalColor,
                roughness: 0.7,
                metalness: 0.3
              });
            }
            
            // Doku hatalarını kontrol et ve gerekirse düzelt
            let hasValidTexture = false;
            
            if (child.material.map) {
              // Check if texture is from a blob URL that failed to load
              if (child.material.map.image &&
                  child.material.map.image.currentSrc &&
                  child.material.map.image.currentSrc.startsWith('blob:')) {
                console.warn(`Mesh ${name} için blob doku yüklenemedi, doku kaldırılıyor`);
                child.material.map = null;
              }
              // Check if texture image is invalid
              else if (child.material.map.image === undefined ||
                       child.material.map.image === null) {
                console.warn(`Mesh ${name} için doku yüklenemedi, doku kaldırılıyor`);
                child.material.map = null;
              } else {
                // Texture is valid
                hasValidTexture = true;
              }
            }
            
            // If no valid textures, apply default texture to base map
            if (!hasValidTexture && child.material.map === null) {
              child.material.map = defaultTexture;
              console.warn(`Mesh ${name} için varsayılan doku uygulanıyor`);
            }
            
            // Ensure material properties are valid
            if (child.material.roughness === undefined) child.material.roughness = 0.7;
            if (child.material.metalness === undefined) child.material.metalness = 0.3;
            if (child.material.opacity === undefined) child.material.opacity = 1.0;
            
            // Update material after potential texture removal or addition
            child.material.needsUpdate = true;
          } catch (err) {
            console.error(`Mesh ${name} materyal işleme hatası:`, err);
            // Hata durumunda basit bir materyal kullan
            child.material = new THREE.MeshStandardMaterial({
              color: new THREE.Color(0x808080),
              roughness: 0.7,
              metalness: 0.3
            });
          }
          
          child.userData.uniqueId = `${name}_${partGroups[name].length}`;
          const family = getPartFamily(name);
          child.userData.partFamily = family;
          if (!partFamiliesData[family]) partFamiliesData[family] = [];
          partFamiliesData[family].push(child);

          // Farklı görünüm modları için materyaller
          try {
            // Avoid cloning the original PBR material to prevent excessive GPU memory usage.
            // Keep the original reference for "normal" mode and create lightweight alternates.
            child.userData.materials = {
              normal: (child.material && child.material.clone
                ? child.material.clone()
                : new THREE.MeshStandardMaterial({
                    color: child.userData.originalColor || new THREE.Color(0x808080),
                    roughness: 0.7,
                    metalness: 0.3
                  })),
              wireframe: new THREE.MeshBasicMaterial({
                color: child.userData.originalColor || new THREE.Color(0x808080),
                wireframe: true,
                transparent: true,
                opacity: 0.7
              }),
              xray: new THREE.MeshBasicMaterial({
                color: child.userData.originalColor || new THREE.Color(0x808080),
                transparent: true,
                opacity: 0.5
              })
            };
            Object.values(child.userData.materials).forEach(material => {
              material.clippingPlanes = [];
              material.clipIntersection = false;
              material.clipShadows = true;
              material.needsUpdate = true;
            });
            // Use unique normal material by default to avoid shared-material color bleed
            child.material = child.userData.materials.normal;
            child.material.needsUpdate = true;
          } catch (materialCloneError) {
            console.warn(`Mesh ${name} için materyal klonlama hatası, varsayılan materyaller kullanılacak:`, materialCloneError);
            // Fallback if cloning fails
            child.userData.materials = {
              normal: new THREE.MeshStandardMaterial({
                color: child.userData.originalColor || new THREE.Color(0x808080),
                roughness: 0.7,
                metalness: 0.3
              }),
              wireframe: new THREE.MeshBasicMaterial({
                color: child.userData.originalColor || new THREE.Color(0x808080),
                wireframe: true,
                transparent: true,
                opacity: 0.7
              }),
              xray: new THREE.MeshBasicMaterial({
                color: child.userData.originalColor || new THREE.Color(0x808080),
                transparent: true,
                opacity: 0.5
              })
            };
            Object.values(child.userData.materials).forEach(material => {
              material.clippingPlanes = [];
              material.clipIntersection = false;
              material.clipShadows = true;
              material.needsUpdate = true;
            });
          }
          child.cursor = 'pointer';
        }
      });

      partGroupsRef.current = partGroups;
      partFamiliesRef.current = partFamiliesData; // Güncellenmiş veri

      if (groupRef.current) {
        groupRef.current.clear();
        groupRef.current.add(scene);
      }
      setIsLoading(false);
      gl.localClippingEnabled = true;
    }, [scene, gl, onHierarchyReady]); // onHierarchyReady bağımlılıklara eklendi

    useEffect(() => {
          if (internalSelectedPart) {
            const timer = setTimeout(() => {
              highlightPart(internalSelectedPart);
            }, 100);
        return () => clearTimeout(timer);
          }
        }, [internalSelectedPart]);

    useEffect(() => {
      Object.entries(partGroupsRef.current).forEach(([name, meshes]) => {
        if (!meshes || meshes.length === 0) return;
        meshes.forEach(mesh => {
          if (mesh.userData.materials && mesh.userData.materials[viewMode]) {
            mesh.material = mesh.userData.materials[viewMode];
            if (isClippingActive && clippingPlane) {
              mesh.material.clippingPlanes = [clippingPlane];
              mesh.material.clipIntersection = false;
              mesh.material.needsUpdate = true;
            }
          }
        });
      });
    }, [viewMode, isClippingActive, clippingPlane]);

    useEffect(() => {
      if (!isClippingActive) {
        applyClippingToAllMaterials(null);
        return;
      }
      applyClippingToAllMaterials(clippingPlane);
    }, [clippingPlane, isClippingActive]);

    useEffect(() => {
      if (clippingPlane) {
        clippingPlane.constant = clippingPosition;
        scene.traverse((child) => {
          if (child.isMesh && child.material) {
            if (Array.isArray(child.material)) {
              child.material.forEach(mat => { mat.needsUpdate = true; });
            } else {
              child.material.needsUpdate = true;
            }
          }
        });
      }
    }, [clippingPosition, clippingPlane, scene]);

    // Patlatma faktörü değiştiğinde patlatılmış parçaları güncelle
    useEffect(() => {
      updateExplodedView();
    }, [explosionFactor]);

    // Demand frameloop: redraw when selection/hover/status/visibility/clipping changes
    useEffect(() => {
      if (invalidate) invalidate();
    }, [
      internalSelectedPart,
      hoveredPart,
      partStatuses,
      hiddenParts,
      isIsolated,
      viewMode,
      isClippingActive,
      clippingPlane,
      explosionFactor,
      clippingPosition,
      groupPaint,
      invalidate
    ]);


    useFrame(() => {
      // Seçili parçanın normalize adı, kopya imzası ve geometri bilgisi (varsa) değerlendirilir
      const selectedMesh = selectedMeshRef.current ?? (internalSelectedPart ? meshRefs.current[internalSelectedPart] : null);
      const selectedNorm =
        selectedGroupKeyRef.current
        ?? selectedMesh?.userData?.serialGroupKey
        ?? selectedMesh?.userData?.baseNameNormalized
        ?? (internalSelectedPart ? normalizePartName(internalSelectedPart) : '');
      const selectedSig = selectedSigRef.current ?? (selectedMesh?.userData?.copySignature ?? null);
      const selectedFamily = selectedFamilyRef.current ?? (selectedMesh?.userData?.partFamily ?? null);
      const selectedGeoUUID = selectedGeoUUIDRef.current ?? (selectedMesh && selectedMesh.geometry ? selectedMesh.geometry.uuid : null);

      Object.entries(partGroupsRef.current).forEach(([name, meshes]) => {
        if (!meshes || meshes.length === 0) return;
        const status = partStatuses[name];
        const isHiddenByApp = hiddenParts.includes(name); // App.jsx'ten gelen gizli parça listesi

        let isVisibleInIsolation = true;
                        if (isIsolated) {
                            let selectedParentName = null;
                            if (internalSelectedPart) {
                                const selectedMeshes = partGroupsRef.current[internalSelectedPart];
                                if (selectedMeshes && selectedMeshes.length > 0) {
                                    // Get parent name from the first mesh of selected part
                                    if (selectedMeshes[0].parent) {
                                        selectedParentName = selectedMeshes[0].parent.name;
                                    }
                                    // If no parent name, use the part name itself as the group identifier
                                    else {
                                        selectedParentName = internalSelectedPart;
                                    }
                                }
                            }
                            // Get parent name for current mesh group
                            const currentParentName = meshes[0].parent ? meshes[0].parent.name : name;
                            isVisibleInIsolation = (name === internalSelectedPart || (selectedParentName && currentParentName === selectedParentName));
                        }

        meshes.forEach(mesh => {
            mesh.visible = !isHiddenByApp && isVisibleInIsolation;
            mesh.userData.selectable = mesh.visible;
            mesh.raycast = mesh.visible ? THREE.Mesh.prototype.raycast : () => false; // Performans için

            if (mesh.visible) {
                            let isSelectedForColoring = false;
                            let isHoveredForColoring = name === hoveredPart;
                            
                            // Check if this mesh should be highlighted as selected
                            if (internalSelectedPart) {
                                if (!groupPaint) {
                                  // Grup boyama kapalı: yalnızca tıklanan mesh boyansın (UUID öncelikli)
                                  if (selectedMeshUUIDRef?.current) {
                                    isSelectedForColoring = mesh.uuid === selectedMeshUUIDRef.current;
                                  } else if (selectedMeshRef.current) {
                                    isSelectedForColoring = mesh === selectedMeshRef.current;
                                  } else {
                                    // Geriye dönük: isim eşleşmesi (tekil parça adı)
                                    isSelectedForColoring = (name === internalSelectedPart);
                                  }
                                } else {
                                  // Grup boyama açık: mevcut güçlü sıralamayı uygula
                                  const currKey = mesh.userData?.serialGroupKey
                                    ?? mesh.userData?.baseNameNormalized
                                    ?? (typeof name === 'string' ? normalizePartName(name) : '');
                                  const currSig = mesh.userData?.copySignature ?? null;

                                  // Öncelik 1: Aynı copySignature (en güçlü kopya eşlemesi)
                                  if (selectedSig && currSig && currSig === selectedSig) {
                                      isSelectedForColoring = true;
                                  }
                                  // Öncelik 2: Normalize edilmiş base-name/serial key eşleşmesi
                                  else if (selectedNorm && currKey === selectedNorm) {
                                      isSelectedForColoring = true;
                                  }
                                  // Öncelik 3: Aile eşleşmesi (varsa)
                                  else if (selectedFamily && mesh.userData.partFamily) {
                                      isSelectedForColoring = mesh.userData.partFamily === selectedFamily;
                                  }
                                  // Öncelik 4: Geometri UUID eşleşmesi (son çare)
                                  else if (selectedGeoUUID && mesh.geometry && mesh.geometry.uuid === selectedGeoUUID) {
                                      isSelectedForColoring = true;
                                  }
                                }
                            }
            
                            if (isHoveredForColoring) {
                                mesh.material.color.set('#00ffff'); // Cyan
                            } else if (isSelectedForColoring) {
                                mesh.material.color.set('yellow');
                            } else {
                                switch (status) {
                                    case 'tezgahta': mesh.material.color.set('orange'); break;
                                    case 'tamamlandi': mesh.material.color.set('green'); break;
                                    case 'kalitede': mesh.material.color.set('blue'); break;
                                    default:
                                        if (mesh.material && mesh.material.map) {
                                            // Doku varsa orijinal materyal rengini koru
                                            if (mesh.userData.originalColor) { mesh.material.color.copy(mesh.userData.originalColor); }
                                        } else if (mesh.userData.originalColor) {
                                            mesh.material.color.copy(mesh.userData.originalColor);
                                        }
                                        break;
                                }
                            }
                        }
        });
      });
    });

    const hideSelectedPart = () => {
          if (internalSelectedPart) {
            setHiddenPartsHistory(prev => [...prev, [...hiddenParts]]);
            setHiddenParts(prev => [...prev, internalSelectedPart]);
          }
        };

    const undoHide = () => {
      if (hiddenPartsHistory.length > 0) {
        const lastState = hiddenPartsHistory[hiddenPartsHistory.length - 1];
        setHiddenParts(lastState);
        setHiddenPartsHistory(prev => prev.slice(0, -1));
      }
    };

    const showAllParts = () => {
      if (hiddenParts.length > 0) {
        setHiddenPartsHistory(prev => [...prev, [...hiddenParts]]);
        setHiddenParts([]);
      }
    };

    const toggleClippingPlane = (axis) => {
      if (isClippingActive && clippingAxis === axis) {
        resetClipping();
        return;
      }
      setClippingAxis(axis);
      setClippingPosition(0);
      setClippingOffset({ x: 0, y: 0, z: 0 });
      
      // Kesit düzlemi oluştur
      const plane = new THREE.Plane();
      if (axis === 'x') plane.normal.set(1, 0, 0);
      else if (axis === 'y') plane.normal.set(0, 1, 0);
      else if (axis === 'z') plane.normal.set(0, 0, 1);
      else if (axis === 'custom') {
        // Custom axis için mevcut düzlemi koru veya varsayılan olarak X eksenini kullan
        if (clippingPlane) {
          plane.normal.copy(clippingPlane.normal);
        } else {
          plane.normal.set(1, 0, 0);
        }
      }
      plane.constant = 0;
      
      setClippingPlane(plane);
      setIsClippingActive(true);
      applyClippingToAllMaterials(plane);
      updateClippingPlanePosition(axis, 0);
      setClippingPlaneVisible(true);
      setShowClippingControls(true);
    };
    
    // Kesit düzlemini döndürme fonksiyonu
    const rotateClippingPlane = (angleX, angleY) => {
      if (!clippingPlane) return;
      
      // Mevcut normal vektörünü al
      const normal = clippingPlane.normal.clone();
      
      // Rotasyon matrisi oluştur
      const rotationMatrix = new THREE.Matrix4();
      rotationMatrix.makeRotationAxis(new THREE.Vector3(0, 1, 0), angleX);
      rotationMatrix.multiply(new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(1, 0, 0), angleY));
      
      // Normal vektörünü döndür
      normal.applyMatrix4(rotationMatrix);
      normal.normalize();
      
      // Yeni düzlem oluştur
      const newPlane = new THREE.Plane();
      newPlane.normal.copy(normal);
      newPlane.constant = clippingPlane.constant;
      
      // Düzlemi güncelle
      setClippingPlane(newPlane);
      applyClippingToAllMaterials(newPlane);
      
      // Kesit düzlemi görselini güncelle
      if (clippingPlaneRef.current) {
        clippingPlaneRef.current.lookAt(
          clippingPlaneRef.current.position.x + normal.x,
          clippingPlaneRef.current.position.y + normal.y,
          clippingPlaneRef.current.position.z + normal.z
        );
      }
    };

    const resetClipping = () => {
      setIsClippingActive(false);
      setClippingPlane(null);
      setClippingPosition(0);
      setClippingOffset({ x: 0, y: 0, z: 0 });
      setClippingPlaneVisible(false);
      setShowClippingControls(false);
      applyClippingToAllMaterials(null);
    };

    const updateClippingOffset = (axis, value) => {
      setClippingOffset(prev => ({ ...prev, [axis]: value }));
    };

    const handleClippingPlaneDragStart = () => {
      setIsDraggingClippingPlane(true);
      // Disable camera controls while dragging
      if (controls) {
              controls.enabled = false;
            }
            // setSelectedPart(null); // Clear selected part when dragging clipping plane
    };
    
    const handleClippingPlaneDragEnd = () => {
      setIsDraggingClippingPlane(false);
      // Re-enable camera controls
      if (controls) {
              controls.enabled = true;
            }
            // setSelectedPart(null); // Clear selected part when dragging clipping plane ends
    };

    const handleClippingPlaneDrag = (e, point) => {
      if (!isDraggingClippingPlane || !clippingPlane) return;
      
      // Calculate drag direction based on clipping plane normal
      const normal = clippingPlane.normal.clone();
      
      // Project the point onto the normal to get the distance
      const pointToOrigin = point.clone().sub(clippingPlaneRef.current.position);
      const projectionDistance = pointToOrigin.dot(normal);
      
      // Update position
      const newPosition = clippingPosition + projectionDistance;
      setClippingPosition(newPosition);
      
      if (clippingPlane) {
        clippingPlane.constant = newPosition;
        
        // Update plane visual position
        if (clippingPlaneRef.current) {
          clippingPlaneRef.current.position.add(normal.clone().multiplyScalar(projectionDistance));
        }
        
        // Update all materials
        scene.traverse((child) => {
          if (child.isMesh && child.material) {
            if (Array.isArray(child.material)) {
              child.material.forEach(mat => { mat.needsUpdate = true; });
            } else {
              child.material.needsUpdate = true;
            }
          }
        });
      }
    };
    
    // Kesit düzlemi tutamaçlarını sürükleme
    const handleClippingHandleDrag = (e, handleIndex) => {
      if (!clippingPlane || !isDraggingClippingPlane) return;
      
      // Tutamaç pozisyonunu güncelle
      const intersection = e.point.clone();
      const planeCenter = clippingPlaneRef.current.position.clone();
      
      // Tutamacın düzlem üzerindeki yeni pozisyonu
      const handleOffset = intersection.sub(planeCenter);
      
      // Düzlemin normal vektörünü güncelle
      if (handleIndex === 0) { // Rotasyon tutamacı
        const normal = new THREE.Vector3().subVectors(intersection, planeCenter).normalize();
        clippingPlane.normal.copy(normal);
        
        // Düzlem görselini güncelle
        if (clippingPlaneRef.current) {
          clippingPlaneRef.current.lookAt(
            clippingPlaneRef.current.position.x + normal.x,
            clippingPlaneRef.current.position.y + normal.y,
            clippingPlaneRef.current.position.z + normal.z
          );
        }
        
        // Tüm materyalleri güncelle
        applyClippingToAllMaterials(clippingPlane);
      }
    };

// Error boundary state
    const [webglError, setWebglError] = useState(null);
    
    // Handle WebGL context loss
    useEffect(() => {
      const handleContextLost = (event) => {
        event.preventDefault();
        console.warn("WebGL context lost");
        setWebglError("WebGL context lost. Trying to recover...");
      };
      
      const handleContextRestored = () => {
        console.log("WebGL context restored");
        setWebglError(null);
      };
      
      // Add event listeners for WebGL context events
      const canvas = gl && gl.domElement;
      if (canvas) {
        canvas.addEventListener('webglcontextlost', handleContextLost);
        canvas.addEventListener('webglcontextrestored', handleContextRestored);
      }
      
      return () => {
        if (canvas) {
          canvas.removeEventListener('webglcontextlost', handleContextLost);
          canvas.removeEventListener('webglcontextrestored', handleContextRestored);
        }
      };
    }, [gl]);

    if (webglError) {
      return (
        <Html center>
          <div className="error-container" style={{ 
            color: 'red', 
            padding: '20px', 
            backgroundColor: 'rgba(255, 255, 255, 0.9)',
            borderRadius: '8px',
            textAlign: 'center'
          }}>
            <h3>WebGL Hatası</h3>
            <p>{webglError}</p>
            <button 
              onClick={() => window.location.reload()} 
              style={{
                marginTop: '10px',
                padding: '8px 16px',
                backgroundColor: '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Yeniden Yükle
            </button>
          </div>
        </Html>
      );
    }
    return (
      <group style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
        {isLoading && (
          <Html center>
            <div className="loading-container">
              <div className="loading-spinner"></div>
              <div className="loading-text">Model yükleniyor...</div>
            </div>
          </Html>
        )}

        <Environment preset="studio" />

        <group
          ref={groupRef}
          onClick={(e) => {
            // Check if interactions are disabled (during clipping plane drag)
            if (groupRef.current?.userData?.pointerEvents?.enabled === false) {
              e.stopPropagation();
              return;
            }
            
            e.stopPropagation();
            
            // Ölçüm aracı aktifse ve bir objeye tıklandıysa
            if (isMeasureToolActive && e.point) { addMeasurePoint(e.point.clone()); /* Ölçüm aracı aktifken diğer işlemler de çalışsın */ }
            
            // Normal tıklama işlemi
            {
              // Hedef: en yakın isimli mesh düğümünü bul (alt mesh isimsiz olabilir)
              const findNamedMeshUp = (n) => {
                let cur = n;
                while (cur && (!cur.isMesh || !cur.name || !cur.name.trim())) {
                  cur = cur.parent || null;
                }
                return cur || n;
              };

              const target = findNamedMeshUp(e.object);

              if (target?.userData?.selectable !== false) {
                // Gerçek (isimli) mesh'i sakla ve kalıcı seçim kriterlerini güncelle
                selectedMeshRef.current = target;
                selectedSigRef.current = target.userData?.copySignature ?? null;
                selectedGroupKeyRef.current = target.userData?.serialGroupKey ?? getSerialGroupKeyFromNode(target);
                selectedFamilyRef.current = target.userData?.partFamily ?? null;
                selectedGeoUUIDRef.current = target.geometry?.uuid ?? null;
                selectedMeshUUIDRef.current = target.uuid ?? null;
                lastSelectSourceRef.current = 'scene';

                // Seçimi anlık olarak tıklanan hedefin adına ayarla (her parça tıklanabilir)
                const targetName = target.name || e.object.name || `mesh_${(target.uuid || '').slice(0,8)}`;
                setInternalSelectedPart(targetName);

                if (DEBUG_SELECTION) {
                  try {
                    const u = target.userData || {};
                    console.log('[Select]', {
                      clickedName: targetName,
                      serialBaseKey: selectedGroupKeyRef.current,
                      baseNameNormalized: u.baseNameNormalized,
                      serialGroupKey: u.serialGroupKey,
                      copySignature: u.copySignature,
                      partFamily: u.partFamily,
                      geoUUID: target.geometry?.uuid
                    });
                  } catch {}
                }

                if (invalidate) invalidate();

                // Üst bileşene hedef adını ilet (dış state ile uyum)
                onPartClick(targetName);
              }
            }
          }}
          onContextMenu={(e) => {
            e.stopPropagation();
            e.preventDefault();
            
            // Sağ tık menüsünü göster
            const canvas = gl.domElement;
            const rect = canvas.getBoundingClientRect();
            setContextMenuPosition({
              x: e.clientX - rect.left,
              y: e.clientY - rect.top
            });
            setContextMenuVisible(true);
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            
            // Ölçüm aracı aktifse ve bir noktaya hover yapıldıysa
            if (isMeasureToolActive && e.point) {
              setHoveredMeasurePoint(e.point.clone());
              document.body.style.cursor = 'crosshair';
              return;
            }
            
            // Normal hover işlemi
            if (e.object?.name && e.object.userData.selectable !== false) {
              setHoveredPart(e.object.name);
              document.body.style.cursor = 'pointer';
            }
          }}
          onPointerOut={() => {
            setHoveredPart(null);
            setHoveredMeasurePoint(null);
            document.body.style.cursor = isMeasureToolActive ? 'crosshair' : 'auto';
          }}
        />
        
        {/* Ölçüm noktaları */}
        {isMeasureToolActive && measurePoints.map((point, index) => (
          <mesh key={`measure-point-${index}`} position={point} scale={0.05}>
            <sphereGeometry args={[1, 16, 16]} />
            <meshBasicMaterial color="#ff0000" />
          </mesh>
        ))}
        
        {/* Hover yapılan ölçüm noktası */}
        {isMeasureToolActive && hoveredMeasurePoint && (
          <mesh position={hoveredMeasurePoint} scale={0.03}>
            <sphereGeometry args={[1, 16, 16]} />
            <meshBasicMaterial color="#ffff00" transparent opacity={0.7} />
          </mesh>
        )}
        
        {/* Ölçüm çizgileri */}
        {measurementVisible && measureResult && measureResult.type === 'distance' && (
          <>
            <Line
              points={[measureResult.points[0], measureResult.points[1]]}
              color="#ff0000"
              lineWidth={2}
            />
            <Text
              position={[
                (measureResult.points[0].x + measureResult.points[1].x) / 2,
                (measureResult.points[0].y + measureResult.points[1].y) / 2 + 0.1,
                (measureResult.points[0].z + measureResult.points[1].z) / 2
              ]}
              fontSize={0.15}
              color="#ffffff"
              backgroundColor="#000000"
              padding={0.05}
              anchorX="center"
              anchorY="middle"
            >
              {formatLength(measureResult.raw ?? 0)}
            </Text>
          </>
        )}
        
        {/* Açı ölçümü */}
        {measurementVisible && measureResult && measureResult.type === 'angle' && (
          <>
            <Line
              points={[measureResult.points[0], measureResult.points[1]]}
              color="#ff0000"
              lineWidth={2}
            />
            <Line
              points={[measureResult.points[1], measureResult.points[2]]}
              color="#ff0000"
              lineWidth={2}
            />
            <Text
              position={[
                measureResult.points[1].x,
                measureResult.points[1].y + 0.1,
                measureResult.points[1].z
              ]}
              fontSize={0.15}
              color="#ffffff"
              backgroundColor="#000000"
              padding={0.05}
              anchorX="center"
              anchorY="middle"
            >
              {`${measureResult.value.toFixed(1)}${measureResult.unit}`}
            </Text>
          </>
        )}
        
        {/* Yarıçap ölçümü */}
        {measurementVisible && measureResult && measureResult.type === 'radius' && (
          <>
            {/* Çember merkezi */}
            <mesh position={measureResult.center} scale={0.05}>
              <sphereGeometry args={[1, 16, 16]} />
              <meshBasicMaterial color="#00ff00" />
            </mesh>
            
            {/* Merkez ile noktalar arası çizgiler */}
            {measureResult.points.map((point, index) => (
              <Line
                key={`radius-line-${index}`}
                points={[measureResult.center, point]}
                color="#00ff00"
                lineWidth={1}
              />
            ))}
            
            <Text
              position={[
                measureResult.center.x,
                measureResult.center.y + 0.1,
                measureResult.center.z
              ]}
              fontSize={0.15}
              color="#ffffff"
              backgroundColor="#000000"
              padding={0.05}
              anchorX="center"
              anchorY="middle"
            >
              {`R: ${formatLength(measureResult.raw ?? 0)}`}
            </Text>
          </>
        )}

        {/* Ölçüm paneli (dialog) */}
        {isMeasureToolActive && (
          <Html position={[0, 0, 0]} portal={gl.domElement.parentElement}>
            <div
              style={{
                position: 'fixed',
                top: `${measurePanelPos.y}px`,
                left: `${measurePanelPos.x}px`,
                minWidth: '300px',
                background: 'rgba(255,255,255,0.98)',
                border: '1px solid #ddd',
                borderRadius: '8px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                padding: '0 12px 12px 12px',
                zIndex: 10000,
                color: '#222',
                fontFamily: 'sans-serif',
                cursor: isDraggingMeasurePanel ? 'grabbing' : 'default'
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onPointerMove={(e) => e.stopPropagation()}
              onWheel={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 8,
                  padding: '10px 0 8px 0',
                  cursor: 'grab',
                  borderBottom: '1px solid #eee'
                }}
                onPointerDown={startDragMeasurePanel}
              >
                <strong>Ölçüm</strong>
                <button
                  onClick={() => {
                    setIsMeasureToolActive(false);
                    document.body.style.cursor = 'auto';
                  }}
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 16 }}
                  title="Kapat"
                >
                  ✖
                </button>
              </div>

              {/* Mod seçimi */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <button
                  onClick={() => changeMeasureMode('distance')}
                  className={`ribbon-button ${measureMode === 'distance' ? 'active' : ''}`}
                  style={{ flex: 1 }}
                  title="Mesafe"
                >
                  Mesafe
                </button>
                <button
                  onClick={() => changeMeasureMode('angle')}
                  className={`ribbon-button ${measureMode === 'angle' ? 'active' : ''}`}
                  style={{ flex: 1 }}
                  title="Açı"
                >
                  Açı
                </button>
                <button
                  onClick={() => changeMeasureMode('radius')}
                  className={`ribbon-button ${measureMode === 'radius' ? 'active' : ''}`}
                  style={{ flex: 1 }}
                  title="Yarıçap"
                >
                  Yarıçap
                </button>
              </div>

              {/* Ayarlar */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  Birim
                  <select value={measureUnits} onChange={(e) => setMeasureUnits(e.target.value)}>
                    <option value="mm">mm</option>
                    <option value="cm">cm</option>
                    <option value="m">m</option>
                    <option value="in">in</option>
                  </select>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  Duyarlılık
                  <input
                    type="number"
                    min={0}
                    max={6}
                    value={measurePrecision}
                    onChange={(e) => setMeasurePrecision(parseInt(e.target.value || '0', 10))}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  Koordinat Sistemi
                  <select value={coordSystem} onChange={(e) => setCoordSystem(e.target.value)}>
                    <option value="world">Dünya</option>
                    <option value="model">Model</option>
                    <option value="camera">Kamera</option>
                    <option value="selected">Seçili</option>
                  </select>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  Projeksiyon
                  <select value={projectionAxis} onChange={(e) => setProjectionAxis(e.target.value)}>
                    <option value="none">Yok</option>
                    <option value="x">X</option>
                    <option value="y">Y</option>
                    <option value="z">Z</option>
                  </select>
                </label>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <input type="checkbox" checked={showXYZ} onChange={(e) => setShowXYZ(e.target.checked)} />
                XYZ ölçümlerini göster
              </label>

              {/* Anlık bilgi */}
              <div
                style={{
                  background: '#f7f7f9',
                  border: '1px solid #eee',
                  borderRadius: 6,
                  padding: 8,
                  fontSize: 13,
                  lineHeight: 1.5,
                  marginBottom: 10
                }}
              >
                {measureMode === 'distance' && (!measureResult || !measureResult.points || measureResult.points.length < 2) && (
                  <div>İpucu: İki noktaya tıklayın.</div>
                )}
                {measureMode === 'angle' && (!measureResult || !measureResult.points || measureResult.points.length < 3) && (
                  <div>İpucu: Üç noktaya tıklayın (orta nokta tepe noktası).</div>
                )}
                {measureMode === 'radius' && (!measureResult || !measureResult.points || measureResult.points.length < 3) && (
                  <div>İpucu: Çember üzerindeki üç noktayı seçin.</div>
                )}

                {measurementVisible && measureResult && measureResult.type === 'distance' && (
                  <>
                    <div><strong>Uzunluk:</strong> {formatLength(measureResult.raw ?? 0)}</div>
                    {showXYZ && measureResult.comps && (
                      <div style={{ marginTop: 4 }}>
                        <div>X: {formatLength(measureResult.comps.x)}</div>
                        <div>Y: {formatLength(measureResult.comps.y)}</div>
                        <div>Z: {formatLength(measureResult.comps.z)}</div>
                      </div>
                    )}
                    {projectionAxis !== 'none' && (() => {
                      const basis = getBasisAxes();
                      if (!basis || !measureResult.comps) return null;
                      const map = { x: 'x', y: 'y', z: 'z' };
                      const comp = measureResult.comps[map[projectionAxis]];
                      return <div style={{ marginTop: 4 }}><strong>Projeksiyon ({projectionAxis.toUpperCase()}):</strong> {formatLength(comp)}</div>;
                    })()}
                  </>
                )}

                {measurementVisible && measureResult && measureResult.type === 'angle' && (
                  <div><strong>Açı:</strong> {Number(measureResult.value ?? 0).toFixed(Math.max(0, Math.min(6, measurePrecision)))}°</div>
                )}

                {measurementVisible && measureResult && measureResult.type === 'radius' && (
                  <div><strong>Yarıçap:</strong> {formatLength(measureResult.raw ?? 0)}</div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="ribbon-button" onClick={clearMeasurements} title="Ölçüm noktalarını temizle">Temizle</button>
              </div>
            </div>
          </Html>
        )}

        {clippingPlaneVisible && (
          <mesh
            ref={clippingPlaneRef}
            onPointerDown={(e) => {
              e.stopPropagation();
              handleClippingPlaneDragStart();
              // Disable scene interactions while dragging
              if (groupRef.current) {
                groupRef.current.userData.pointerEvents = groupRef.current.userData.pointerEvents || {};
                groupRef.current.userData.pointerEvents.enabled = false;
              }
            }}
            onPointerUp={(e) => {
              e.stopPropagation();
              handleClippingPlaneDragEnd();
              // Re-enable scene interactions
              if (groupRef.current) {
                groupRef.current.userData.pointerEvents = groupRef.current.userData.pointerEvents || {};
                groupRef.current.userData.pointerEvents.enabled = true;
              }
            }}
            onPointerOut={handleClippingPlaneDragEnd}
            onPointerMove={(e) => {
              if (isDraggingClippingPlane) {
                e.stopPropagation();
                handleClippingPlaneDrag(e, e.point);
              }
            }}
          >
            <boxGeometry args={[1, 1, 1]} />
            <meshBasicMaterial
              color="#ff5500"
              opacity={0.5}
              transparent={true}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
        )}
        
        {/* Sağ tık menüsü */}
        {contextMenuVisible && (
          <Html position={[0, 0, 0]} portal={gl.domElement.parentElement}>
            <div
              style={{
                position: 'absolute',
                left: `${contextMenuPosition.x}px`,
                top: `${contextMenuPosition.y}px`,
                backgroundColor: 'white',
                border: '1px solid #ccc',
                borderRadius: '4px',
                boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
                padding: '5px 0',
                zIndex: 1000,
                minWidth: '150px'
              }}
            >
              <div
                style={{
                  padding: '8px 12px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  color: '#333',
                  borderBottom: '1px solid #eee'
                }}
                onClick={() => {
                  // Kamera açısına göre modeli hizala
                  if (camera && groupRef.current) {
                    const direction = new THREE.Vector3();
                    camera.getWorldDirection(direction);
                    
                    // Modelin merkezi
                    const box = new THREE.Box3().setFromObject(groupRef.current);
                    const center = box.getCenter(new THREE.Vector3());
                    
                    // Modeli kamera açısına göre döndür
                    const lookAtMatrix = new THREE.Matrix4();
                    lookAtMatrix.lookAt(
                      new THREE.Vector3(0, 0, 0),
                      direction.negate(),
                      new THREE.Vector3(0, 1, 0)
                    );
                    
                    // Rotasyon matrisini çıkar
                    const rotationMatrix = new THREE.Matrix4().extractRotation(lookAtMatrix);
                    
                    // Quaternion'a çevir
                    const quaternion = new THREE.Quaternion().setFromRotationMatrix(rotationMatrix);
                    
                    // Modeli döndür
                    groupRef.current.quaternion.copy(quaternion);
                    
                    // Menüyü kapat
                    setContextMenuVisible(false);
                  }
                }}
              >
                Kamera Açısına Göre Hizala
              </div>
              <div
                style={{
                  padding: '8px 12px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  color: '#333',
                  borderBottom: '1px solid #eee'
                }}
                onClick={() => {
                  // Modeli sıfırla
                  if (groupRef.current) {
                    groupRef.current.rotation.set(0, 0, 0);
                    setContextMenuVisible(false);
                  }
                }}
              >
                Modeli Sıfırla
              </div>
              <div
                style={{
                  padding: '8px 12px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  color: '#333'
                }}
                onClick={() => {
                  setContextMenuVisible(false);
                }}
              >
                İptal
              </div>
            </div>
          </Html>
        )}
        
        {/* Sağ tık menüsünü kapatmak için overlay */}
        {contextMenuVisible && (
          <Html position={[0, 0, 0]} portal={gl.domElement.parentElement} style={{ pointerEvents: 'none' }}>
            <div
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 999
              }}
              onClick={() => setContextMenuVisible(false)}
            />
          </Html>
        )}
      </group>
    );
  }
);

export default MachineModel;


