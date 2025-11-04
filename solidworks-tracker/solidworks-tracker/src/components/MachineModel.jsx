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
const SUPPRESS_TEXTURE_WARNINGS = true;
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import './MachineModel.css'; // CSS dosyasını import ediyoruz
import { createRoot } from 'react-dom/client'; // ReactDOM.render yerine createRoot kullanacağız
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import useStore from "./store/state"

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
  // Needed for advanced clipping actions from Ribbon
  setClippingPlane, setClippingAxis, applyClippingToAllMaterials,
  modelSize,
  modelCenter,
  // Yeni eklenen prop'lar
  filterStatus, setFilterStatus,
  isIsolated,
  statusColors,
  explosionFactor, setExplosionFactor,
  onLogout, onSettings,
  searchTerm, setSearchTerm: setSearchTermProp,
  groupPaint, setGroupPaint,
  showEdges, setShowEdges,
  ribbonPinned, setRibbonPinned,
  ribbonCollapsed, setRibbonCollapsed,
  // Kesit: gelişmiş seçenekler
  sectionMode, setSectionMode,
  clipIntersection, setClipIntersection,
  clipIncludeMode, setClipIncludeMode,
  clipSelection,
  addSelectedToClipSelection, removeSelectedFromClipSelection, clearClipSelection,
  capVisible, setCapVisible, capColor, setCapColor,
  // Multi-plane (Kesit 2/3)
  isClippingActive2, clippingPlane2, clippingAxis2, setClippingAxis2, clippingPosition2, setClippingPosition2, toggleClippingPlane2,
  isClippingActive3, clippingPlane3, clippingAxis3, setClippingAxis3, clippingPosition3, setClippingPosition3, toggleClippingPlane3,
  // Cylindrical section
  cylindricalEnabled, setCylindricalEnabled, cylinderAxis, setCylinderAxis, cylinderRadius, setCylinderRadius, cylinderSides, setCylinderSides,
  // Torque visualization controls
  showTorqueViz, setShowTorqueViz, torqueStageFilter, setTorqueStageFilter,
  // Assembly Step Navigator
  stepCount, stepIndex, onPrevStep, onNextStep,
  // Assembly autoplay
  autoPlay, setAutoPlay, playIntervalSec, setPlayIntervalSec,
  // Edges loading state
  isEdgesLoading,
  // App-level UI controls
  darkMode, setDarkMode, bigButtons, setBigButtons,
  // User info
  user,
  // Project info and navigation
  selectedMachine,
  onGoToProjects,
  // Export handlers
  onExportBOMCSV,
  onExportBOMJSON,
  onExportInstructionsHTML,
  onExportBOMPDF,
  onExportBOMSetsCSV,
  onExportBOMSetsJSON,
  onToggleFastenerPreview,
  isFastenerPreviewOpen,
  onExportInstructionsPDF,
  onMarkTightened,
  onMarkRemoved,
  onToggleMissing
 }, ref) => {
  const setSearchTerm = useCallback(setSearchTermProp, []);
  const [activeTab, setActiveTab] = useState('view');

  // Admin helpers/state (only used if user.role === 'admin')
  const [adminKey, setAdminKey] = useState(() => {
    try { return localStorage.getItem('adminKey') || ''; } catch { return ''; }
  });
  useEffect(() => {
    try { localStorage.setItem('adminKey', adminKey); } catch {}
  }, [adminKey]);
  const [models, setModels] = useState([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [apiError, setApiError] = useState('');

  const authorized = useMemo(() => !!adminKey && !!(user && String(user.role || '').toLowerCase() === 'admin'), [adminKey, user]);

  const formatBytes = (b) => {
    try {
      const units = ['B','KB','MB','GB'];
      let i = 0, v = Number(b) || 0;
      while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
      return `${v.toFixed(1)} ${units[i]}`;
    } catch { return String(b || 0); }
  };
  const formatDate = (ms) => {
    try { return new Date(Number(ms) || 0).toLocaleString('tr-TR'); } catch { return ''; }
  };

  const refreshModels = useCallback(async () => {
    if (!authorized) return;
    setLoadingModels(true);
    setApiError('');
    try {
      const resp = await fetch('/api/models', { headers: { 'x-admin-key': adminKey } });
      if (!resp.ok) throw new Error(`Listeleme başarısız: ${resp.status}`);
      const data = await resp.json();
      setModels(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      setApiError(String(e.message || e));
    } finally {
      setLoadingModels(false);
    }
  }, [authorized, adminKey]);

  const uploadModel = useCallback(async () => {
    if (!authorized || !selectedFile) return;
    setUploading(true);
    setApiError('');
    try {
      const fd = new FormData();
      fd.append('file', selectedFile);
      const resp = await fetch('/api/models/upload', {
        method: 'POST',
        headers: { 'x-admin-key': adminKey },
        body: fd
      });
      if (!resp.ok) {
        const t = await resp.text().catch(() => '');
        throw new Error(t || `Yükleme başarısız: ${resp.status}`);
      }
      setSelectedFile(null);
      await refreshModels();
    } catch (e) {
      setApiError(String(e.message || e));
    } finally {
      setUploading(false);
    }
  }, [authorized, selectedFile, adminKey, refreshModels]);

  const deleteModel = useCallback(async (name) => {
    if (!authorized || !name) return;
    setApiError('');
    try {
      const resp = await fetch(`/api/models/${encodeURIComponent(name)}`, {
        method: 'DELETE',
        headers: { 'x-admin-key': adminKey }
      });
      if (!resp.ok) throw new Error(`Silme başarısız: ${resp.status}`);
      await refreshModels();
    } catch (e) {
      setApiError(String(e.message || e));
    }
  }, [authorized, adminKey, refreshModels]);

  useEffect(() => {
    if (activeTab === 'admin') refreshModels();
  }, [activeTab, refreshModels]);

  // Ribbon sekme tanımları
  const isAdmin = !!(user && String(user.role || '').toLowerCase() === 'admin');
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
            <button
              className={`ribbon-button ${showEdges ? 'active' : ''}`}
              onClick={() => setShowEdges(!showEdges)}
              title={showEdges ? 'Kenar çizgilerini gizle' : 'Kenar çizgilerini göster'}
              disabled={isEdgesLoading}
            >
              <span className="ribbon-button-icon">🧵</span>
              <span className="ribbon-button-text">
                {isEdgesLoading ? 'İşleniyor...' : 'Kenarlar'}
              </span>
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
                        max="1.0"
                        step="0.005"
                        value={explosionFactor}
                        onChange={(e) => setExplosionFactor(parseFloat(e.target.value))}
                        className="ribbon-slider"
                    />
                    <span className="ribbon-slider-value">{explosionFactor.toFixed(3)}</span>
                </div>
            </div>
            <div className="ribbon-group-title">Montaj Araçları</div>
        </div>

        {/* Assembly status controls */}
        <div className="ribbon-group">
          <div className="ribbon-buttons">
            <button className="ribbon-button" onClick={() => onMarkTightened && onMarkTightened()} title="Seçili elemanı Sıkıldı olarak işaretle">
              <span className="ribbon-button-icon">🔩</span>
              <span className="ribbon-button-text">Sıkıldı</span>
            </button>
            <button className="ribbon-button" onClick={() => onMarkRemoved && onMarkRemoved()} title="Seçili elemanı Söküldü olarak işaretle">
              <span className="ribbon-button-icon">🧰</span>
              <span className="ribbon-button-text">Söküldü</span>
            </button>
            <button className="ribbon-button" onClick={() => onToggleMissing && onToggleMissing()} title="Seçili elemanı Eksik olarak işaretle / kaldır">
              <span className="ribbon-button-icon">⚠️</span>
              <span className="ribbon-button-text">Eksik</span>
            </button>
          </div>
          <div className="ribbon-group-title">Montaj Durumu</div>
        </div>

        {/* Step Navigator */}
        <div className="ribbon-group">
          <div className="ribbon-buttons" style={{ alignItems: 'center', gap: 8 }}>
            <button
              className="ribbon-button"
              onClick={onPrevStep}
              title="Önceki adım"
              disabled={(stepCount || 0) === 0 || stepIndex <= 0}
            >
              <span className="ribbon-button-icon">◀️</span>
              <span className="ribbon-button-text">Önceki</span>
            </button>
            <div style={{ padding: '6px 8px', border: '1px solid #ddd', borderRadius: 6, background: '#fff' }}>
              Adım: {(stepCount || 0) === 0 ? '0/0' : `${(stepIndex + 1)}/${stepCount}`}
            </div>
            <button
              className="ribbon-button"
              onClick={onNextStep}
              title="Sonraki adım"
              disabled={(stepCount || 0) === 0 || (stepIndex + 1) >= (stepCount || 0)}
            >
              <span className="ribbon-button-icon">▶️</span>
              <span className="ribbon-button-text">Sonraki</span>
            </button>
          </div>
          <div className="ribbon-group-title">Montaj Adım Gezgini</div>
        </div>

        {/* Autoplay controls */}
        <div className="ribbon-group">
          <div className="ribbon-buttons" style={{ alignItems: 'center', gap: 8 }}>
            <button
              className={`ribbon-button ${autoPlay ? 'active' : ''}`}
              onClick={() => setAutoPlay(v => !v)}
              title={autoPlay ? 'Otomatik oynatmayı durdur' : 'Adımları otomatik olarak sırayla oynat'}
            >
              <span className="ribbon-button-icon">{autoPlay ? '⏸️' : '▶️'}</span>
              <span className="ribbon-button-text">{autoPlay ? 'Durdur' : 'Oynat'}</span>
            </button>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: '#444' }}>Hız (sn)</span>
              <input
                type="number"
                min={0.2}
                step={0.1}
                value={playIntervalSec}
                onChange={(e) => setPlayIntervalSec(Math.max(0.2, parseFloat(e.target.value || '1.5')))}
                style={{ width: 64 }}
                title="Adımlar arası süre (saniye)"
              />
            </label>
          </div>
          <div className="ribbon-group-title">Otomatik Oynatma</div>
        </div>

        {/* Torque visualization controls */}
        <div className="ribbon-group">
          <div className="ribbon-buttons" style={{ alignItems: 'center', gap: 8 }}>
            <button
              className={`ribbon-button ${showTorqueViz ? 'active' : ''}`}
              onClick={() => setShowTorqueViz(v => !v)}
              title="Tork desenini göster/gizle"
            >
              <span className="ribbon-button-icon">🧭</span>
              <span className="ribbon-button-text">Tork Deseni</span>
            </button>
            <select
              value={torqueStageFilter}
              onChange={(e) => setTorqueStageFilter(e.target.value)}
              title="Aşama filtresi"
            >
              <option value="all">Tümü</option>
              <option value="1">Aşama 1</option>
              <option value="2">Aşama 2</option>
              <option value="3">Aşama 3</option>
            </select>
          </div>
          <div className="ribbon-group-title">Tork Görselleştirme</div>
        </div>
        </>
        )}

        {activeTab === 'tools' && (
          <>
        <div className="ribbon-group">
            <div className="ribbon-buttons">
                <button
                  className={`ribbon-button ${isMeasureToolActive ? 'active' : ''}`}
                  onClick={() => {
                    // Show alert message instead of activating the tool
                    alert("Bu özellik sapmasız ölçüler alabilmek için geliştirme aşamasındadır. Bu nedenle erişime kapalıdır.");
                  }}
                  title="Bu özellik sapmasız ölçüler alabilmek için geliştirme aşamasındadır. Bu nedenle erişime kapalıdır."
                  style={{ opacity: 0.3, cursor: 'not-allowed' }}
                >
                    <span className="ribbon-button-icon">📏</span>
                    <span className="ribbon-button-text">Ölç</span>
                </button>
            </div>
            <div className="ribbon-group-title">Analiz</div>
        </div>
        {/* Weld Map controls removed as requested */}
        </>
        )}
        
        {/* Yeni Kesit sekmesi */}
        {activeTab === 'section' && (
          <>
            {/* Kesit işlemleri grubu */}
            
            <div className="ribbon-group">
              <div className="ribbon-buttons">
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

            {/* Ek Düzlemler (Kesit 1 ve Kesit 2) - yan yana yerleşim */}
            <div className="ribbon-group">
              <div className="ribbon-buttons" style={{ gap: 12, flexWrap: 'nowrap', alignItems: 'center' }}>
                {/* Kesit 1 */}
                <button
                  className={`ribbon-button ${isClippingActive2 ? 'active' : ''}`}
                  onClick={() => toggleClippingPlane2(clippingAxis2)}
                  title="Kesit 1 Aç/Kapat"
                >
                  <span className="ribbon-button-icon">1️⃣</span>
                  <span className="ribbon-button-text">Kesit 1</span>
                </button>
                <select
                  value={clippingAxis2}
                  onChange={(e) => setClippingAxis2(e.target.value)}
                  disabled={!isClippingActive2}
                  title="Kesit 1 ekseni"
                >
                  <option value="x">X</option>
                  <option value="y">Y</option>
                  <option value="z">Z</option>
                </select>
                <input
                  type="range"
                  min={(modelCenter[clippingAxis2] || 0) - (modelSize[clippingAxis2] || 10) / 2}
                  max={(modelCenter[clippingAxis2] || 0) + (modelSize[clippingAxis2] || 10) / 2}
                  step="any"
                  value={clippingPosition2}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    setClippingPosition2(v);
                    if (clippingPlane2) clippingPlane2.constant = -v;
                    applyClippingToAllMaterials(clippingPlane);
                  }}
                  disabled={!isClippingActive2}
                  onWheel={(e) => {
                    if (!isClippingActive2) return;
                    e.preventDefault();
                    const range = (modelSize[clippingAxis2] || 10);
                    const center = (modelCenter[clippingAxis2] || 0);
                    const minV = center - range / 2;
                    const maxV = center + range / 2;
                    const sensitivity = range * 0.001; // 0.1% of model size per wheel unit
                    const delta = -e.deltaY; // wheel up increases position
                    const next = Math.min(maxV, Math.max(minV, clippingPosition2 + delta * sensitivity));
                    setClippingPosition2(next);
                    if (clippingPlane2) clippingPlane2.constant = -next;
                    applyClippingToAllMaterials(clippingPlane);
                  }}
                />
                <span className="ribbon-slider-value">{clippingPosition2.toFixed(3)}</span>

                {/* Spacer */}
                <span style={{ width: 12, display: 'inline-block' }} />

                {/* Kesit 2 */}
                <button
                  className={`ribbon-button ${isClippingActive3 ? 'active' : ''}`}
                  onClick={() => toggleClippingPlane3(clippingAxis3)}
                  title="Kesit 2 Aç/Kapat (Kesit 1 açıksa aktif olur)"
                  disabled={!isClippingActive2}
                >
                  <span className="ribbon-button-icon">2️⃣</span>
                  <span className="ribbon-button-text">Kesit 2</span>
                </button>
                <select
                  value={clippingAxis3}
                  onChange={(e) => setClippingAxis3(e.target.value)}
                  disabled={!isClippingActive3}
                  title="Kesit 2 ekseni"
                >
                  <option value="x">X</option>
                  <option value="y">Y</option>
                  <option value="z">Z</option>
                </select>
                <input
                  type="range"
                  min={(modelCenter[clippingAxis3] || 0) - (modelSize[clippingAxis3] || 10) / 2}
                  max={(modelCenter[clippingAxis3] || 0) + (modelSize[clippingAxis3] || 10) / 2}
                  step="any"
                  value={clippingPosition3}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    setClippingPosition3(v);
                    if (clippingPlane3) clippingPlane3.constant = -v;
                    applyClippingToAllMaterials(clippingPlane);
                  }}
                  disabled={!isClippingActive3}
                  onWheel={(e) => {
                    if (!isClippingActive3) return;
                    e.preventDefault();
                    const range = (modelSize[clippingAxis3] || 10);
                    const center = (modelCenter[clippingAxis3] || 0);
                    const minV = center - range / 2;
                    const maxV = center + range / 2;
                    const sensitivity = range * 0.001;
                    const delta = -e.deltaY;
                    const next = Math.min(maxV, Math.max(minV, clippingPosition3 + delta * sensitivity));
                    setClippingPosition3(next);
                    if (clippingPlane3) clippingPlane3.constant = -next;
                    applyClippingToAllMaterials(clippingPlane);
                  }}
                />
                <span className="ribbon-slider-value">{clippingPosition3.toFixed(3)}</span>
              </div>
              <div className="ribbon-group-title">Ek Düzlemler</div>
            </div>

            {/* Silindirik Kesit */}
            <div className="ribbon-group">
              <div className="ribbon-buttons" style={{ gap: 8 }}>
                <button
                  className={`ribbon-button ${cylindricalEnabled ? 'active' : ''}`}
                  onClick={() => setCylindricalEnabled(v => !v)}
                  title="Silindirik kesiti aç/kapat"
                >
                  <span className="ribbon-button-icon">⭕</span>
                  <span className="ribbon-button-text">Silindirik</span>
                </button>
                <select
                  value={cylinderAxis}
                  onChange={(e) => setCylinderAxis(e.target.value)}
                  disabled={!cylindricalEnabled}
                  title="Silindir ekseni"
                >
                  <option value="x">X</option>
                  <option value="y">Y</option>
                  <option value="z">Z</option>
                </select>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6 }} title="Yarıçap">
                  <span>R</span>
                  <input
                    type="range"
                    min={0.01}
                    max={Math.max(0.1, Math.max(modelSize.x, modelSize.y, modelSize.z))}
                    step="0.01"
                    value={cylinderRadius}
                    onChange={(e) => setCylinderRadius(parseFloat(e.target.value))}
                    disabled={!cylindricalEnabled}
                  />
                  <span className="ribbon-slider-value">{cylinderRadius.toFixed(2)}</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6 }} title="Düzlemsel yaklaşım yan sayısı">
                  <span>N</span>
                  <input
                    type="number"
                    min={6}
                    max={64}
                    value={cylinderSides}
                    onChange={(e) => setCylinderSides(parseInt(e.target.value || '12', 10))}
                    disabled={!cylindricalEnabled}
                    style={{ width: 64 }}
                  />
                </label>
              </div>
              <div className="ribbon-group-title">Silindirik Kesit</div>
            </div>

            {/* Kesit Yöntemi ve Seçenekler */}
            <div className="ribbon-group">
              <div className="ribbon-buttons">
                <button
                  className={`ribbon-button ${sectionMode === 'planar' ? 'active' : ''}`}
                  onClick={() => { setSectionMode('planar'); setClipIntersection(false); }}
                  title="Düzlemsel Kesit"
                >
                  <span className="ribbon-button-icon">📐</span>
                  <span className="ribbon-button-text">Düzlemsel</span>
                </button>
                <button
                  className={`ribbon-button ${sectionMode === 'regional' ? 'active' : ''}`}
                  onClick={() => { setSectionMode('regional'); setClipIntersection(true); }}
                  title="Bölgesel Kesit (kesişim)"
                >
                  <span className="ribbon-button-icon">🧩</span>
                  <span className="ribbon-button-text">Bölgesel</span>
                </button>
                <button
                  className={`ribbon-button ${clipIntersection ? 'active' : ''}`}
                  onClick={() => setClipIntersection(v => !v)}
                  title="Kesişim (AND) kullan"
                >
                  <span className="ribbon-button-icon">∩</span>
                  <span className="ribbon-button-text">Kesişim</span>
                </button>
              </div>
              <div className="ribbon-group-title">Kesit Yöntemi</div>
            </div>

            {/* Dahil/Hariç Seçimi */}
            <div className="ribbon-group">
              <div className="ribbon-buttons">
                <button
                  className={`ribbon-button ${clipIncludeMode === 'all' ? 'active' : ''}`}
                  onClick={() => setClipIncludeMode('all')}
                  title="Tüm gövdeler/bileşenler kesite dahil"
                >
                  <span className="ribbon-button-icon">🟢</span>
                  <span className="ribbon-button-text">Tümü</span>
                </button>
                <button
                  className={`ribbon-button ${clipIncludeMode === 'include' ? 'active' : ''}`}
                  onClick={() => setClipIncludeMode('include')}
                  title="Sadece seçtiklerimi kesite dahil et"
                >
                  <span className="ribbon-button-icon">➕</span>
                  <span className="ribbon-button-text">Yalnız Dahil</span>
                </button>
                <button
                  className={`ribbon-button ${clipIncludeMode === 'exclude' ? 'active' : ''}`}
                  onClick={() => setClipIncludeMode('exclude')}
                  title="Seçtiklerimi kesit dışında bırak"
                >
                  <span className="ribbon-button-icon">🚫</span>
                  <span className="ribbon-button-text">Hariç Tut</span>
                </button>
                <button
                  className="ribbon-button"
                  onClick={addSelectedToClipSelection}
                  disabled={!selectedPart}
                  title="Seçili parçayı listeye ekle"
                >
                  <span className="ribbon-button-icon">➕</span>
                  <span className="ribbon-button-text">Seçiliyi Ekle</span>
                </button>
                <button
                  className="ribbon-button"
                  onClick={removeSelectedFromClipSelection}
                  disabled={!selectedPart}
                  title="Seçili parçayı listeden çıkar"
                >
                  <span className="ribbon-button-icon">➖</span>
                  <span className="ribbon-button-text">Seçiliyi Çıkar</span>
                </button>
                <button
                  className="ribbon-button"
                  onClick={clearClipSelection}
                  title="Listeyi temizle"
                >
                  <span className="ribbon-button-icon">🧹</span>
                  <span className="ribbon-button-text">Temizle</span>
                </button>
              </div>
              <div className="ribbon-group-title">Kesit Kapsamı ({clipSelection.length})</div>
            </div>

            {/* Tapa (cap) kontrolü */}
            <div className="ribbon-group">
              <div className="ribbon-buttons" style={{ alignItems: 'center', gap: 8 }}>
                <button
                  className={`ribbon-button ${capVisible ? 'active' : ''}`}
                  onClick={() => setCapVisible(v => !v)}
                  title={(isClippingActive || isClippingActive2 || isClippingActive3 || cylindricalEnabled) ? 'Kesit tapasını göster/gizle' : 'Kesit açıkken çalışır'}
                  disabled={!(isClippingActive || isClippingActive2 || isClippingActive3 || cylindricalEnabled)}
                >
                  <span className="ribbon-button-icon">🧱</span>
                  <span className="ribbon-button-text">Tapa</span>
                </button>
                <span
                  className="ribbon-help"
                  title="Kesilen yüzeyi düz ve renkli bir yüzey gibi gösterir; görsel algıyı güçlendirir ve nereden kesildiğini netleştirir."
                  style={{ fontSize: 14, color: '#555', border: '1px solid #ccc', borderRadius: '50%', width: 18, height: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'help' }}
                >?</span>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 6px' }}>
                  <span style={{ fontSize: 12, color: '#444' }}>Renk</span>
                  <input type="color" value={capColor} onChange={(e) => setCapColor(e.target.value)} />
                </label>
              </div>
              <div className="ribbon-group-title">Kesit Tapası</div>
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
              <div className="ribbon-buttons" style={{ alignItems: 'center', gap: 8 }}>
                <div className="profile-menu-header" style={{ padding: '6px 10px', border: '1px solid #ddd', borderRadius: 6, background: '#fff' }}>
                  <div><strong>{user?.name || 'Kullanıcı'}</strong></div>
                  {user?.role && <div className="profile-menu-role" style={{ fontSize: '12px', color: '#666' }}>{String(user.role).toUpperCase()}</div>}
                </div>
              </div>
              <div className="ribbon-group-title">Kullanıcı</div>
            </div>

            <div className="ribbon-group">
              <div className="ribbon-buttons">
                <button
                  className="ribbon-button"
                  onClick={() => setDarkMode(v => !v)}
                  title="Koyu Tema"
                >
                  <span className="ribbon-button-icon">{darkMode ? '☀️' : '🌙'}</span>
                  <span className="ribbon-button-text">{darkMode ? 'Açık Tema' : 'Koyu Tema'}</span>
                </button>
                <button
                  className="ribbon-button"
                  onClick={() => setBigButtons(v => !v)}
                  title="Büyük Butonlar"
                >
                  <span className="ribbon-button-icon">{bigButtons ? '↙️' : '↗️'}</span>
                  <span className="ribbon-button-text">{bigButtons ? 'Normal Butonlar' : 'Büyük Butonlar'}</span>
                </button>
              </div>
              <div className="ribbon-group-title">Görünüm</div>
            </div>

            <div className="ribbon-group">
              <div className="ribbon-buttons">
                {user?.role === 'admin' && (
                  <button
                    className="ribbon-button"
                    onClick={() => setViewMode('admin')}
                    title="Yönetim"
                  >
                    <span className="ribbon-button-icon">🛠️</span>
                    <span className="ribbon-button-text">Yönetim</span>
                  </button>
                )}
                <button className="ribbon-button" onClick={onSettings}
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

            {/* Sağda proje bilgisi ve Projeler kısayolu */}
            <div className="ribbon-group" style={{ marginLeft: 'auto' }}>
              <div className="ribbon-buttons" style={{ alignItems: 'center', gap: 8 }}>
                <button
                  className="ribbon-button"
                  onClick={() => { if (typeof onGoToProjects === 'function') onGoToProjects(); }}
                  title="Projeler"
                >
                  <span className="ribbon-button-icon">📁</span>
                  <span className="ribbon-button-text">Projeler</span>
                </button>
                {selectedMachine && (
                  <div style={{ marginLeft: 8, color: '#2c3e50', display: 'flex', gap: 12, alignItems: 'baseline' }}>
                    <strong>{selectedMachine.name}</strong>
                    <span style={{ color: '#7f8c8d', fontSize: '0.9rem' }}>
                      Takipçi: {selectedMachine.tracker}
                    </span>
                  </div>
                )}
              </div>
              <div className="ribbon-group-title">Proje</div>
            </div>
          </>
        )}
        
        {activeTab === 'report' && (
          <>
            {/* BOM Export */}
            <div className="ribbon-group">
              <div className="ribbon-buttons" style={{ gap: 8 }}>
                <button className="ribbon-button" onClick={() => onExportBOMCSV && onExportBOMCSV('all')} title="Tüm model için BOM (CSV)">
                  <span className="ribbon-button-icon">📤</span>
                  <span className="ribbon-button-text">BOM CSV (Tümü)</span>
                </button>
                <button className="ribbon-button" onClick={() => onExportBOMCSV && onExportBOMCSV('assembly')} title="Seçili montaj için BOM (CSV)">
                  <span className="ribbon-button-icon">📤</span>
                  <span className="ribbon-button-text">BOM CSV (Montaj)</span>
                </button>
                <button className="ribbon-button" onClick={() => onExportBOMJSON && onExportBOMJSON('assembly')} title="Seçili montaj için BOM (JSON)">
                  <span className="ribbon-button-icon">🗂️</span>
                  <span className="ribbon-button-text">BOM JSON</span>
                </button>
                {/* Fastener set exports */}
                <button className="ribbon-button" onClick={() => onExportBOMSetsCSV && onExportBOMSetsCSV('all')} title="Bağlantı setlerini tek satırda toplayarak (CSV)">
                  <span className="ribbon-button-icon">🧩</span>
                  <span className="ribbon-button-text">BOM Set CSV</span>
                </button>
                <button className="ribbon-button" onClick={() => onExportBOMSetsJSON && onExportBOMSetsJSON('all')} title="Bağlantı setleri (JSON)">
                  <span className="ribbon-button-icon">🧩</span>
                  <span className="ribbon-button-text">BOM Set JSON</span>
                </button>
                <button className="ribbon-button" onClick={() => onToggleFastenerPreview && onToggleFastenerPreview()} title="Bağlantı setleri önizleme paneli">
                  <span className="ribbon-button-icon">👀</span>
                  <span className="ribbon-button-text">{isFastenerPreviewOpen ? 'Set Panelini Kapat' : 'Set Önizleme'}</span>
                </button>
              </div>
              <div className="ribbon-group-title">BOM Dışa Aktar</div>
            </div>

            {/* Instructions export */}
            <div className="ribbon-group">
              <div className="ribbon-buttons" style={{ gap: 8 }}>
                <button className="ribbon-button" onClick={() => onExportInstructionsHTML && onExportInstructionsHTML('assembly')} title="Montaj talimatlarını HTML olarak indir (yazdır → PDF)">
                  <span className="ribbon-button-icon">📄</span>
                  <span className="ribbon-button-text">Talimat (HTML)</span>
                </button>
                <button className="ribbon-button" onClick={() => onExportInstructionsPDF && onExportInstructionsPDF('assembly')} title="Montaj talimatlarını PDF olarak dışa aktar">
                  <span className="ribbon-button-icon">🖨️</span>
                  <span className="ribbon-button-text">Talimat (PDF)</span>
                </button>
                <button
                  className="ribbon-button"
                  onClick={() => alert('Raporlar ekranı yakında')}
                  title="Grafik rapor ekranına git"
                >
                  <span className="ribbon-button-icon">📊</span>
                  <span className="ribbon-button-text">Raporlar</span>
                </button>
              </div>
              <div className="ribbon-group-title">Dışa Aktar / Raporlar</div>
            </div>
          </>
        )}

        {activeTab === 'admin' && isAdmin && (
          <>
            {/* Admin Key + Refresh */}
            <div className="ribbon-group">
              <div className="ribbon-buttons" style={{ gap: 8, alignItems: 'center' }}>
                <input
                  type="password"
                  placeholder="Admin Anahtarı"
                  value={adminKey}
                  onChange={(e) => setAdminKey(e.target.value)}
                  style={{ padding: '8px', minWidth: '220px', border: '1px solid #ccc', borderRadius: 6 }}
                  title="x-admin-key değeri"
                />
                <button
                  className="ribbon-button"
                  onClick={refreshModels}
                  disabled={!authorized}
                  title="Modelleri listele"
                >
                  <span className="ribbon-button-icon">🔄</span>
                  <span className="ribbon-button-text">Yenile</span>
                </button>
              </div>
              <div className="ribbon-group-title">Kimlik ve Liste</div>
            </div>

            {/* Upload */}
            <div className="ribbon-group">
              <div className="ribbon-buttons" style={{ gap: 8, alignItems: 'center' }}>
                <input
                  type="file"
                  accept=".glb,.gltf,.zip,.draco"
                  onChange={(e) => setSelectedFile(e.target.files && e.target.files[0] ? e.target.files[0] : null)}
                  title="Sıkıştırılmış .glb/.gltf/.zip/.draco"
                />
                <button
                  className="ribbon-button"
                  onClick={uploadModel}
                  disabled={!authorized || !selectedFile || uploading}
                  title="Sıkıştırılmış modeli public/models klasörüne yükle"
                >
                  <span className="ribbon-button-icon">📂</span>
                  <span className="ribbon-button-text">{uploading ? 'Yükleniyor...' : 'Model Yükle'}</span>
                </button>
              </div>
              <div className="ribbon-group-title">Yükleme</div>
            </div>

            {/* Models list */}
            <div className="ribbon-group" style={{ flex: 1 }}>
              <div className="ribbon-buttons" style={{ display: 'block', width: '100%' }}>
                {apiError && (
                  <div style={{ color: '#c0392b', marginBottom: 8, fontSize: 12 }}>
                    {apiError}
                  </div>
                )}
                {loadingModels ? (
                  <div style={{ fontSize: 12, color: '#555' }}>Liste yükleniyor...</div>
                ) : (
                  <div style={{ maxHeight: 220, overflow: 'auto', border: '1px solid #eee', borderRadius: 6 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: '#f7f7f7' }}>
                          <th style={{ textAlign: 'left', padding: '6px' }}>Dosya</th>
                          <th style={{ textAlign: 'right', padding: '6px', width: 90 }}>Boyut</th>
                          <th style={{ textAlign: 'right', padding: '6px', width: 140 }}>Tarih</th>
                          <th style={{ textAlign: 'right', padding: '6px', width: 80 }}>Sil</th>
                        </tr>
                      </thead>
                      <tbody>
                        {models.length === 0 ? (
                          <tr><td colSpan="4" style={{ padding: '8px', color: '#777' }}>Kayıt yok</td></tr>
                        ) : models.map((m, idx) => (
                          <tr key={`mdl-${idx}`} style={{ borderTop: '1px solid #eee' }}>
                            <td style={{ padding: '6px' }} title={m.name}>{m.name}</td>
                            <td style={{ padding: '6px', textAlign: 'right' }}>{formatBytes(m.size)}</td>
                            <td style={{ padding: '6px', textAlign: 'right' }}>{formatDate(m.mtime)}</td>
                            <td style={{ padding: '6px', textAlign: 'right' }}>
                              <button
                                className="ribbon-button"
                                onClick={() => deleteModel(m.name)}
                                disabled={!authorized}
                                title="Modeli sil"
                              >
                                <span className="ribbon-button-icon">🗑️</span>
                                <span className="ribbon-button-text">Sil</span>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              <div className="ribbon-group-title">Modeller</div>
            </div>
          </>
        )}
      </div>
      )}
      {/* Kesit pozisyonu kontrolü */}
      {showClippingControls && (
        <div className="clipping-slider-container">
          <div className="clipping-slider">
            <div className="slider-label">Kesit Pozisyonu: {clippingPosition.toFixed(3)}</div>
            <div className="slider-controls">
              <button
                className="ribbon-small-button"
                onClick={() => {
                  const newPos = clippingPosition - 0.5;
                  setClippingPosition(newPos);
                  if (clippingPlane) clippingPlane.constant = -(newPos);
                  updateClippingPlanePosition(clippingAxis, newPos);
                }}
              >
                <span className="ribbon-small-button-icon">-</span>
              </button>
              <input
                type="range"
                min={(modelCenter[clippingAxis] || 0) - (modelSize[clippingAxis] || 10) / 2} // modelSize tanımsızsa varsayılan değer
                max={(modelCenter[clippingAxis] || 0) + (modelSize[clippingAxis] || 10) / 2}  // modelSize tanımsızsa varsayılan değer
                step="any"
                value={clippingPosition}
                onChange={(e) => {
                  const newPos = parseFloat(e.target.value);
                  setClippingPosition(newPos);
                  if (clippingPlane) clippingPlane.constant = -(newPos);
                  updateClippingPlanePosition(clippingAxis, newPos);
                }}
                onWheel={(e) => {
                  e.preventDefault();
                  const range = (modelSize[clippingAxis] || 10);
                  const center = (modelCenter[clippingAxis] || 0);
                  const minV = center - range / 2;
                  const maxV = center + range / 2;
                  const sensitivity = range * 0.001; // 0.1% of model size per wheel unit
                  const delta = -e.deltaY; // wheel up increases position
                  const next = Math.min(maxV, Math.max(minV, clippingPosition + delta * sensitivity));
                  setClippingPosition(next);
                  if (clippingPlane) clippingPlane.constant = -(next);
                  updateClippingPlanePosition(clippingAxis, next);
                }}
                className="position-slider"
              />
              <button
                className="ribbon-small-button"
                onClick={() => {
                  const newPos = clippingPosition + 0.5;
                  setClippingPosition(newPos);
                  if (clippingPlane) clippingPlane.constant = -(newPos);
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
  ({ selectedPart, selectedAssemblyKey, onPartClick, partStatuses, onHierarchyReady, isIsolated, toggleIsolation, filterStatus, setFilterStatus, explosionFactor, setExplosionFactor, onLogout, onSettings, searchTerm, setSearchTerm, viewMode, setViewMode, modelUrl: preferredModelUrl, darkMode, setDarkMode, bigButtons, setBigButtons, user, selectedMachine, onGoToProjects }, ref) => {
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

    // İlk render'da orijinali denemeden önce yerel modeller için -draco varyantını senkron seç
    const initialResolvedUrl = useMemo(() => {
      const u = typeof modelUrl === 'string' ? modelUrl : '';
      if (!u || !u.startsWith('/models/') || !/\.glb$/i.test(u)) return u;
      const base = u.replace(/\.glb$/i, '');
      const hasSuffix = /-(draco|compressed|geo)$/i.test(base);
      return hasSuffix ? u : `${base}-draco.glb`;
    }, [modelUrl]);

    // Seçilecek gerçek URL (varsa sıkıştırılmış varyantı tercih et)
    const [resolvedUrl, setResolvedUrl] = useState(initialResolvedUrl);

    useEffect(() => {
      let cancelled = false;
      async function pickBestVariant() {
        try {
          // Yalnızca yerel modellerde varyant dene
          const u = typeof modelUrl === 'string' ? modelUrl : '';
          if (!u || !u.startsWith('/models/')) {
            if (!cancelled) setResolvedUrl(u);
            return;
          }
          // Adaylar (sırayla kontrol edilir): -draco, -compressed, -geo, orijinal
          const base = u.replace(/\.glb$/i, '');
          const suffixMatch = base.match(/-(draco|compressed|geo)$/i);
          let candidates;
          if (suffixMatch) {
            // URL zaten varyantı işaret ediyor; önce onu, sonra orijinali dene
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

          // Ağ üzerinden doğrula ve mevcut ilk başarılı varyanta kilitlen
          for (const c of candidates) {
            try {
              const resp = await fetch(c, { method: 'GET', cache: 'no-cache' });
              if (resp && (resp.ok || resp.status === 200)) {
                if (!cancelled) setResolvedUrl(c);
                break;
              }
            } catch {
              // ignore and try next
            }
          }
        } catch {
          if (!cancelled) setResolvedUrl(initialResolvedUrl);
        }
      }
      pickBestVariant();
      return () => { cancelled = true; };
    }, [modelUrl, initialResolvedUrl]);

    // Renderer ve controls referansını öne al
    const { camera, controls, gl, invalidate } = useThree();
    const maxAniso = useMemo(() => {
      try {
        return gl?.capabilities?.getMaxAnisotropy ? gl.capabilities.getMaxAnisotropy() : 8;
      } catch { return 8; }
    }, [gl]);
 
    // Slight contrast boost and modern tone mapping
    useEffect(() => {
      if (!gl) return;
      try {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.12;
        if ('outputColorSpace' in gl) gl.outputColorSpace = THREE.SRGBColorSpace;
        if (invalidate) invalidate();
      } catch {}
    }, [gl, invalidate]);
 
    // GLB yükleme hatasını yakalamak için state
    const [loadError, setLoadError] = useState(null);

    // Doku yükleme hatalarını önlemek ve sıkıştırılmış verileri decode etmek için GLTF yükleme
    const { scene, nodes } = useGLTF(resolvedUrl, {
      onError: (e) => {
        console.error("GLTF yükleme hatası:", e);
        try { setLoadError(e?.message || "Model yüklenemedi"); } catch {}
      },
      // Texture loading options to handle errors better
      textureColorSpace: THREE.SRGBColorSpace,
      crossorigin: 'anonymous',
      extensions: (loader) => {
        try {
          // Meshopt (geometry stream optimizasyonu)
          if (MeshoptDecoder) {
            loader.setMeshoptDecoder(MeshoptDecoder);
          }
          // Draco (geometri sıkıştırma)
          const dracoLoader = new DRACOLoader();
          dracoLoader.setDecoderPath("https://www.gstatic.com/draco/v1/decoders/");
          dracoLoader.setDecoderConfig({ type: "wasm" });
          loader.setDRACOLoader(dracoLoader);
          // KTX2/Basis (GPU doku sıkıştırma)
          const ktx2 = new KTX2Loader();
          ktx2.setTranscoderPath("https://unpkg.com/three@0.176.0/examples/jsm/libs/basis/");
          if (gl && gl.capabilities) {
            ktx2.detectSupport(gl);
          }
          loader.setKTX2Loader(ktx2);
        } catch (err) {
          console.warn("GLTF loader extensions init failed:", err);
        }
      }
    });
    // İsteğe bağlı: model URL'ini preload et
    try { if (useGLTF.preload) useGLTF.preload(resolvedUrl); } catch {}
    // Eğer yükleme hatası oluştuysa sahneye devam etmeyelim; beyaz sayfa yerine mesaj gösterelim
    if (loadError) {
      return (
        <Html center>
          <div style={{
            color: '#c0392b',
            background: 'rgba(255,255,255,0.95)',
            border: '1px solid #e6b0aa',
            padding: '12px 16px',
            borderRadius: 6,
            fontSize: 14,
            maxWidth: 420,
            textAlign: 'center'
          }}>
            <strong>Model yüklenemedi</strong>
            <div style={{ marginTop: 6, color: '#7f8c8d' }}>{String(loadError)}</div>
            <div style={{ marginTop: 8, fontSize: 12 }}>
              Lütfen valid GLB dosyasını public/models altına yerleştirin. Hiyerarşi/isimler korunur.
            </div>
          </div>
        </Html>
      );
    }
    const meshRefs = useRef({});
    const groupRef = useRef();
    const selectedMeshRef = useRef(null);
    /* Persisted selection criteria to make every click reliably paintable */
    const selectedSigRef = useRef(null);
    const selectedGroupKeyRef = useRef(null);
    const selectedFamilyRef = useRef(null);
    const selectedGeoUUIDRef = useRef(null);
    const selectedMeshUUIDRef = useRef(null);
    /* Sidebar assembly selection key (lowercased) */
    const selectedAssemblyKeyRef = useRef(null);
    /* Root/main assembly base key (lowercased), set by buildHierarchy() */
    const mainAssemblyKeyRef = useRef(null);
    /* Seçim kaynağı: 'scene' (sahneden tıklama) veya 'external' (dış/menüden seçim) */
    const lastSelectSourceRef = useRef('external');
    const partGroupsRef = useRef({});
    const partFamiliesRef = useRef({});
    // Fastener grouping
    const fastenerSetsRef = useRef([]);                  // Array of { id, assemblyId, label, members: { bolt, washer, nut }, hasMissing }
    const fastenerSetByIdRef = useRef(new Map());        // id -> set
    const meshToFastenerSetRef = useRef(new Map());      // mesh.uuid -> set.id
    // Store group centers to prevent recalculation during animation
    const groupCentersRef = useRef(new Map());
    // Store previous explosion factor to prevent unnecessary updates
    const prevExplosionFactorRef = useRef(explosionFactor);
    // const { camera, controls, gl, invalidate } = useThree(); // moved earlier
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
    // Track assembly selection from parent (sidebar)
    useEffect(() => {
      if (selectedAssemblyKey && typeof selectedAssemblyKey === 'string') {
        const key = extractAssemblyId(selectedAssemblyKey) || selectedAssemblyKey;
        selectedAssemblyKeyRef.current = (key || '').toLowerCase();
      } else {
        selectedAssemblyKeyRef.current = null;
      }
    }, [selectedAssemblyKey]);

    const [isLoading, setIsLoading] = useState(true);
    const [hiddenParts, setHiddenParts] = useState([]); // Gizlenen parçaları tutacak state
    const [clippingPlane, setClippingPlane] = useState(null); // Kesit alma için
    const [clippingAxis, setClippingAxis] = useState('x'); // Kesit alma ekseni: 'x', 'y', 'z', 'custom'
    const [clippingPosition, setClippingPosition] = useState(0); // Kesit alma pozisyonu
    const [hiddenPartsHistory, setHiddenPartsHistory] = useState([]); // Gizleme geçmişi için
    const [redoHiddenPartsHistory, setRedoHiddenPartsHistory] = useState([]); // Geri al (redo) yığını
    const [modelSize, setModelSize] = useState({ x: 10, y: 10, z: 10 }); // Model boyutu
    const [modelCenter, setModelCenter] = useState({ x: 0, y: 0, z: 0 }); // Model merkezi
    const [isClippingActive, setIsClippingActive] = useState(false); // Kesit aktif mi
    const [clippingOffset, setClippingOffset] = useState({ x: 0, y: 0, z: 0 }); // Kesit düzlemi ofset

    // Kesit yöntemleri ve seçim/dahil-hariç
    const [sectionMode, setSectionMode] = useState('planar'); // 'planar' | 'regional'
// Multi-plane states (Kesit 2/3)
const [isClippingActive2, setIsClippingActive2] = useState(false);
const [clippingPlane2, setClippingPlane2] = useState(null);
const [clippingAxis2, setClippingAxis2] = useState('y');
const [clippingPosition2, setClippingPosition2] = useState(0);

const [isClippingActive3, setIsClippingActive3] = useState(false);
const [clippingPlane3, setClippingPlane3] = useState(null);
const [clippingAxis3, setClippingAxis3] = useState('z');
const [clippingPosition3, setClippingPosition3] = useState(0);

// Cylindrical section (approximated via multiple clipping planes)
const [cylindricalEnabled, setCylindricalEnabled] = useState(false);
const [cylinderAxis, setCylinderAxis] = useState('z');
const [cylinderRadius, setCylinderRadius] = useState(() => {
  const maxDim = Math.max(modelSize.x || 10, modelSize.y || 10, modelSize.z || 10);
  return Math.max(0.01, maxDim * 0.05);
});
const cylinderCenterRef = useRef(new THREE.Vector3(0, 0, 0));
const [cylinderSides, setCylinderSides] = useState(12);

 // Initialize/refresh cylinder center when model loads/changes
 useEffect(() => {
   try {
     if (groupRef.current) {
       const c = new THREE.Box3().setFromObject(groupRef.current).getCenter(new THREE.Vector3());
       cylinderCenterRef.current.copy(c);
     }
   } catch {}
 }, [scene, modelSize]);
    const [clipIntersection, setClipIntersection] = useState(false);
    const [clipIncludeMode, setClipIncludeMode] = useState('all'); // 'all' | 'include' | 'exclude'
    const [clipSelection, setClipSelection] = useState([]); // seçime göre dahil/hariç tutulacak parça adları

    // Kesit tapası (görsel)
    const [capVisible, setCapVisible] = useState(true);
    const [capColor, setCapColor] = useState('#fff59d');

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

    // Fastener Set paneli için bağımsız DOM kökü
    const fastenerPanelContainerRef = useRef(null);
    const fastenerPanelRootRef = useRef(null);

    // Ribbon sabitleme/küçültme
    const [ribbonPinned, setRibbonPinned] = useState(true);
    const [ribbonCollapsed, setRibbonCollapsed] = useState(false);

    // Yeni state'ler
   const [isMeasureToolActive, setIsMeasureToolActive] = useState(false);
   const [isExplodedView, setIsExplodedView] = useState(false);
   const [explodedTransition, setExplodedTransition] = useState(0); // 0 = collapsed, 1 = exploded
   // Grup boyama: kapalı (false) = sadece tıklanan parça boyanır
   const [groupPaint, setGroupPaint] = useState(false);
   const [showEdges, setShowEdges] = useState(false);
   const [isEdgesLoading, setIsEdgesLoading] = useState(false);
   const [showFastenerPreview, setShowFastenerPreview] = useState(false);

   // Toggle panel for fastener sets preview
   const toggleFastenerPreview = useCallback(() => {
     setShowFastenerPreview(v => !v);
   }, []);

   // Per-part assembly state (tightened / removed / missing)
   const [partAsmStates, setPartAsmStates] = useState({}); // name -> { montajDurumu: 'tightened'|'loose'|undefined, removed: bool, missing: bool }
   const partAsmStatesRef = useRef({});
   useEffect(() => { partAsmStatesRef.current = partAsmStates; }, [partAsmStates]);


    // Store selectors (weld map removed)
    const torquePatterns = useStore(state => state.torquePatterns);
    const assemblySteps = useStore(state => state.assemblySteps);
    const updateAssemblyStep = useStore(state => state.updateAssemblyStep);

    // Torque visualization state
    const [showTorqueViz, setShowTorqueViz] = useState(false);
    const [torqueStageFilter, setTorqueStageFilter] = useState('all');

    // Assembly autoplay
    const [autoPlay, setAutoPlay] = useState(false);
    const [playIntervalSec, setPlayIntervalSec] = useState(1.5);
    // Animated step-through for torque sequence
    const [torqueAnimIdx, setTorqueAnimIdx] = useState(0);
    const torqueAnimRef = useRef({ acc: 0 });

    // Assembly step navigator state (index is per selected part)
    const [currentStepIdx, setCurrentStepIdx] = useState(0);
    const stepsForPart = useMemo(() => {
      try {
        const part = internalSelectedPart || '';
        return (assemblySteps || []).filter(st => (st.partName || '') === part);
      } catch { return []; }
    }, [assemblySteps, internalSelectedPart]);
    useEffect(() => {
      // Clamp index if selection changed or steps length changed
      setCurrentStepIdx(prev => {
        const max = Math.max((stepsForPart.length || 1) - 1, 0);
        return Math.max(0, Math.min(prev, max));
      });
    }, [stepsForPart.length, internalSelectedPart]);

    // Assembly Step Navigator handlers and camera focus
    const focusOnCurrentStep = useCallback(() => {
      try {
        const m = selectedMeshRef.current || (internalSelectedPart ? meshRefs.current[internalSelectedPart] : null);
        const targetBox = m ? new THREE.Box3().setFromObject(m) : (groupRef.current ? new THREE.Box3().setFromObject(groupRef.current) : null);
        if (!targetBox) return;
        const center = targetBox.getCenter(new THREE.Vector3());
        if (controls) { controls.target.copy(center); controls.update?.(); }
        if (camera) { camera.lookAt(center); }
        if (invalidate) { invalidate(); }
      } catch {}
    }, [internalSelectedPart, controls, camera, invalidate]);

    const goToStep = useCallback((idx) => {
      const max = Math.max((stepsForPart.length || 1) - 1, 0);
      const clamped = Math.max(0, Math.min(idx, max));
      setCurrentStepIdx(clamped);
      focusOnCurrentStep();
    }, [stepsForPart.length, focusOnCurrentStep]);

    const onPrevStep = useCallback(() => {
      goToStep(currentStepIdx - 1);
    }, [currentStepIdx, goToStep]);

    const onNextStep = useCallback(() => {
      goToStep(currentStepIdx + 1);
    }, [currentStepIdx, goToStep]);

    // Autoplay assembly steps
    useEffect(() => {
      if (!autoPlay) return;
      const count = stepsForPart.length || 0;
      if (count === 0) return;
      const id = setInterval(() => {
        setCurrentStepIdx(prev => {
          const next = (prev + 1) % count;
          // Focus camera on step change
          try { focusOnCurrentStep(); } catch {}
          return next;
        });
      }, Math.max(200, playIntervalSec * 1000));
      return () => clearInterval(id);
    }, [autoPlay, playIntervalSec, stepsForPart.length, focusOnCurrentStep]);
    
    // Memoize overallCenter calculation for exploded view
    // Only recalculate when groupRef changes, not during animation
    const overallCenter = useMemo(() => {
        if (groupRef.current) {
            return new THREE.Box3().setFromObject(groupRef.current).getCenter(new THREE.Vector3());
        }
        return new THREE.Vector3(0, 0, 0);
    }, [groupRef.current]);
    
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
    const [modelUnits, setModelUnits] = useState('auto'); // 'auto' | 'mm' | 'cm' | 'm' | 'in' -> model geometri birimi (glTF genelde metre)
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
          modelCenter={modelCenter}
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
          showEdges={showEdges}
          setShowEdges={setShowEdges}
          showTorqueViz={showTorqueViz}
          setShowTorqueViz={setShowTorqueViz}
          torqueStageFilter={torqueStageFilter}
          setTorqueStageFilter={setTorqueStageFilter}
          ribbonPinned={ribbonPinned}
          setRibbonPinned={setRibbonPinned}
          ribbonCollapsed={ribbonCollapsed}
          setRibbonCollapsed={setRibbonCollapsed}
          sectionMode={sectionMode}
          setSectionMode={setSectionMode}
          clipIntersection={clipIntersection}
          setClipIntersection={setClipIntersection}
          clipIncludeMode={clipIncludeMode}
          setClipIncludeMode={setClipIncludeMode}
          clipSelection={clipSelection}
          addSelectedToClipSelection={addSelectedToClipSelection}
          removeSelectedFromClipSelection={removeSelectedFromClipSelection}
          clearClipSelection={clearClipSelection}
          capVisible={capVisible}
          setCapVisible={setCapVisible}
          capColor={capColor}
          setCapColor={setCapColor}
          setClippingPlane={setClippingPlane}
          setClippingAxis={setClippingAxis}
          applyClippingToAllMaterials={applyClippingToAllMaterials}
          isClippingActive2={isClippingActive2}
          clippingPlane2={clippingPlane2}
          clippingAxis2={clippingAxis2}
          setClippingAxis2={setClippingAxis2}
          clippingPosition2={clippingPosition2}
          setClippingPosition2={setClippingPosition2}
          toggleClippingPlane2={toggleClippingPlane2}
          isClippingActive3={isClippingActive3}
          clippingPlane3={clippingPlane3}
          clippingAxis3={clippingAxis3}
          setClippingAxis3={setClippingAxis3}
          clippingPosition3={clippingPosition3}
          setClippingPosition3={setClippingPosition3}
          toggleClippingPlane3={toggleClippingPlane3}
          cylindricalEnabled={cylindricalEnabled}
          setCylindricalEnabled={setCylindricalEnabled}
          cylinderAxis={cylinderAxis}
          setCylinderAxis={setCylinderAxis}
          cylinderRadius={cylinderRadius}
          setCylinderRadius={setCylinderRadius}
          cylinderSides={cylinderSides}
          setCylinderSides={setCylinderSides}
          stepCount={stepsForPart.length}
          stepIndex={currentStepIdx}
          onPrevStep={onPrevStep}
          onNextStep={onNextStep}
          autoPlay={autoPlay}
          setAutoPlay={setAutoPlay}
          playIntervalSec={playIntervalSec}
          setPlayIntervalSec={setPlayIntervalSec}
          isEdgesLoading={isEdgesLoading}
          darkMode={darkMode}
          setDarkMode={setDarkMode}
          bigButtons={bigButtons}
          setBigButtons={setBigButtons}
          user={user}
          selectedMachine={preferredModelUrl ? selectedMachine : selectedMachine}
          onGoToProjects={onGoToProjects}
          onExportBOMCSV={exportBOMCSV}
          onExportBOMJSON={exportBOMJSON}
          onExportInstructionsHTML={exportInstructionsHTML}
          onExportBOMSetsCSV={exportBOMFastenerSetsCSV}
          onExportBOMSetsJSON={exportBOMFastenerSetsJSON}
          onToggleFastenerPreview={toggleFastenerPreview}
          isFastenerPreviewOpen={showFastenerPreview}
          onExportInstructionsPDF={exportInstructionsPDF}
          onMarkTightened={markSelectedTightened}
          onMarkRemoved={markSelectedRemoved}
          onToggleMissing={toggleSelectedMissing}
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
    }, [
        viewMode, internalSelectedPart, hiddenPartsHistory, hiddenParts,
        clippingAxis, isClippingActive, showClippingControls,
        clippingPosition, clippingPlane, modelSize, isMeasureToolActive, isExplodedView,
        toggleIsolation, filterStatus, isIsolated, searchTerm, explosionFactor, groupPaint,
        ribbonPinned, ribbonCollapsed, darkMode, bigButtons, user, selectedMachine,
        sectionMode, clipIntersection, clipIncludeMode, clipSelection,
        capVisible, capColor,
        isClippingActive2, clippingPlane2, clippingAxis2, clippingPosition2,
        isClippingActive3, clippingPlane3, clippingAxis3, clippingPosition3,
        cylindricalEnabled, cylinderAxis, cylinderRadius, cylinderSides
    ]);

    // Fastener Set panelini bağımsız DOM'a render et (Ribbon gibi)
    useEffect(() => {
      // Panel kapatıldıysa DOM'u temizle
      if (!showFastenerPreview) {
        try {
          if (fastenerPanelRootRef.current) {
            fastenerPanelRootRef.current.unmount();
            fastenerPanelRootRef.current = null;
          }
          if (fastenerPanelContainerRef.current) {
            const n = fastenerPanelContainerRef.current;
            if (n && n.parentNode) n.parentNode.removeChild(n);
            fastenerPanelContainerRef.current = null;
          }
        } catch {}
        return;
      }

      try {
        // Container oluştur
        const container = document.createElement('div');
        container.id = 'fastener-panel-container';
        container.style.position = 'fixed';
        container.style.right = '16px';
        container.style.top = `${ribbonPinned ? 100 : 60}px`;
        container.style.width = '440px';
        container.style.maxHeight = '60vh';
        container.style.overflow = 'auto';
        container.style.background = 'rgba(255,255,255,0.98)';
        container.style.border = '1px solid #ddd';
        container.style.borderRadius = '8px';
        container.style.boxShadow = '0 10px 28px rgba(0,0,0,0.18)';
        container.style.padding = '12px';
        container.style.zIndex = '10003';
        container.style.color = '#222';
        container.style.fontFamily = 'sans-serif';
        document.body.appendChild(container);
        fastenerPanelContainerRef.current = container;

        // İçerik verileri
        const scope = (selectedAssemblyKeyRef.current && selectedAssemblyKeyRef.current.length) ? 'assembly' : 'all';
        const rows = collectFastenerSetsBOM(scope);

        const onClose = () => setShowFastenerPreview(false);
        const onGo = (label) => {
          try {
            const list = fastenerSetsRef.current || [];
            const setObj = list.find(s => s && s.label === label);
            if (setObj) selectFastenerSet(setObj);
          } catch {}
        };

        // Panel React ağacı
        const root = createRoot(container);
        fastenerPanelRootRef.current = root;
        root.render(
          <div onPointerDown={(e) => e.stopPropagation()} onPointerMove={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
              <strong>Bağlantı Setleri ({rows.length})</strong>
              <div style={{ display:'flex', gap:8 }}>
                <button className="ribbon-button" onClick={() => exportBOMFastenerSetsCSV(scope)} title="CSV indir">CSV</button>
                <button className="ribbon-button" onClick={() => exportBOMFastenerSetsJSON(scope)} title="JSON indir">JSON</button>
                <button className="ribbon-button" onClick={onClose} title="Kapat">✖</button>
              </div>
            </div>
            <div style={{ fontSize:12, color:'#666', marginBottom:10 }}>
              Kapsam: {scope === 'assembly' ? 'Seçili Montaj' : 'Tümü'}
            </div>

            {rows.length === 0 && (
              <div style={{
                marginBottom:10, padding:10, background:'#fffbe6', border:'1px solid #ffe58f',
                borderRadius:6, color:'#8c6d1f', fontSize:12, lineHeight:1.4
              }}>
                Bu modelde otomatik bağlantı seti bulunamadı.
                <div style={{ marginTop:6 }}>
                  İpucu: İsimlerde “M8x30”, “DIN 125”, “DIN 934”, “cıvata”, “rondela”, “somun” gibi ifadeler geçmelidir.
                </div>
              </div>
            )}

            <div style={{ display:'grid', gridTemplateColumns:'1fr 72px 60px 70px', gap:8, alignItems:'center' }}>
              <div style={{ fontWeight:600 }}>Set</div>
              <div style={{ fontWeight:600, textAlign:'right' }}>Adet</div>
              <div style={{ fontWeight:600, textAlign:'right' }}>Eksik</div>
              <div style={{ fontWeight:600, textAlign:'right' }}>Git</div>
              {rows.map((r, i) => (
                <React.Fragment key={`fsrow-${i}`}>
                  <div
                    title={r.label}
                    onClick={() => onGo(r.label)}
                    style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', cursor:'pointer', color:'#0969da', textDecoration:'underline' }}
                  >
                    {r.label}
                  </div>
                  <div style={{ textAlign:'right' }}>{r.count}</div>
                  <div style={{ textAlign:'right', color:(r.missing || 0) > 0 ? '#e74c3c' : '#2ecc71' }}>
                    {r.missing || 0}
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <button
                      title="Bu setten bir üyeyi seç ve sahnede vurgula"
                      onClick={() => onGo(r.label)}
                      style={{ padding:'4px 10px', border:'1px solid #ccc', borderRadius:6, background:'#f5f5f5', color:'#222', cursor:'pointer' }}
                    >
                      ➡️ Git
                    </button>
                  </div>
                </React.Fragment>
              ))}
            </div>
          </div>
        );

        // Temizlik
        return () => {
          try {
            if (fastenerPanelRootRef.current) {
              fastenerPanelRootRef.current.unmount();
              fastenerPanelRootRef.current = null;
            }
            if (fastenerPanelContainerRef.current) {
              const n = fastenerPanelContainerRef.current;
              if (n && n.parentNode) n.parentNode.removeChild(n);
              fastenerPanelContainerRef.current = null;
            }
          } catch {}
        };
      } catch {
        // panel render hatası durumunda sessiz geç
      }
    // panel, montaj seçimi veya ribbon pin değişiminde yeniden hesapla
    }, [showFastenerPreview, selectedAssemblyKey, ribbonPinned]);

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
      if (!camera || !groupRef.current) return;

      const box = new THREE.Box3().setFromObject(groupRef.current);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const distance = maxDim * 2;

      // If OrbitControls exist, set target to center
      if (controls) {
        try { controls.target.copy(center); } catch {}
      }

      switch (orientation) {
        case 'front':
          camera.position.set(center.x, center.y, center.z + distance);
          break;
        case 'top':
          camera.position.set(center.x, center.y + distance, center.z);
          break;
        case 'iso': {
          const d = distance / Math.sqrt(3);
          camera.position.set(center.x + d, center.y + d, center.z + d);
          break;
        }
        default:
          camera.position.set(center.x, center.y, center.z + distance);
          break;
      }

      camera.lookAt(center);
      if (controls) { try { controls.update(); } catch {} }
      if (invalidate) { try { invalidate(); } catch {} }
    };

    const zoomToFit = () => {
      if (!groupRef.current || !camera) { console.log("Zoom to Fit"); return; }

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
      if (controls) {
        try { controls.target.copy(center); controls.update(); } catch {}
      }
      camera.lookAt(center);
      if (invalidate) { try { invalidate(); } catch {} }
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
        const ab = new THREE.Vector3().subVectors(p2, p1);
        const ac = new THREE.Vector3().subVectors(p3, p1);
        const n = new THREE.Vector3().crossVectors(ab, ac);
        if (n.lengthSq() < 1e-10) {
          console.warn('Üç nokta doğrusal, çember hesaplanamaz');
          return null;
        }

        // Ortonormal baz kur (p1 merkezli düzlemde 2B hesap yap)
        const e1 = ab.clone().normalize();
        const e3 = n.clone().normalize();
        const e2 = new THREE.Vector3().crossVectors(e3, e1).normalize();

        // 2B koordinatlar: A=(0,0), B=(d,0), C=(ux,uy)
        const d = ab.length();
        const u = ac.dot(e1);
        const v = ac.dot(e2);

        if (Math.abs(v) < 1e-10) {
          // C, AB çizgisine çok yakın -> sayısal kararsızlık
          console.warn('Noktalar çok hizalı, çember hassas değil');
          return null;
        }

        // 2B çember merkezi: x = d/2, y = (u^2 + v^2 - d*u) / (2*v)
        const cx2d = d / 2;
        const cy2d = (u * u + v * v - d * u) / (2 * v);

        // 3B merkeze projeksiyon
        const center = new THREE.Vector3()
          .copy(p1)
          .add(e1.clone().multiplyScalar(cx2d))
          .add(e2.clone().multiplyScalar(cy2d));

        const radius = center.distanceTo(p1);
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
    // Model baz biriminden milimetreye çeviren katsayı (heuristik: model boyutuna göre tahmin)
    const modelToMmFactor = useCallback((units) => {
      switch (units) {
        case 'mm': return 1;
        case 'cm': return 10;
        case 'm':  return 1000;
        case 'in': return 25.4;
        case 'auto': {
          try {
            const maxDim = Math.max(modelSize.x || 0, modelSize.y || 0, modelSize.z || 0);
            // Heuristik:
            // - Çok küçük modeller (<= 50): metre kabul et (1 model birimi ~ 1 m)
            // - Orta büyüklükte (<= 5000): santimetre kabul et (1 model birimi ~ 1 cm)
            // - Daha büyük: milimetre kabul et (1 model birimi ~ 1 mm)
            if (maxDim <= 50) return 1000;     // m -> mm
            if (maxDim <= 5000) return 10;     // cm -> mm
            return 1;                           // mm
          } catch { return 1; }
        }
        default:   return 1;
      }
    }, [modelSize]);
    
    // Milimetreden seçilen gösterim birimine çeviren katsayı
    const unitFactor = useCallback((units) => {
      switch (units) {
        case 'mm': return 1;
        case 'cm': return 0.1;
        case 'm':  return 0.001;
        case 'in': return 1 / 25.4;
        default:   return 1;
      }
    }, []);
    
    // lenModel: model birimindeki değer -> kullanıcı seçili birimde string
    const formatLength = useCallback((lenModel) => {
      try {
        const mm = (Number(lenModel) || 0) * modelToMmFactor(modelUnits);  // önce modele göre mm'ye çevir
        const val = mm * unitFactor(measureUnits);                         // sonra hedef birime çevir
        return `${val.toFixed(Math.max(0, Math.min(6, measurePrecision)))} ${measureUnits}`;
      } catch {
        const v = Number(lenModel ?? 0);
        return `${v.toFixed(2)} ${measureUnits}`;
      }
    }, [measureUnits, measurePrecision, unitFactor, modelUnits, modelToMmFactor]);

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
        if (groupRef.current && modelSize.x > 0) { // modelSize'ın geçerli olduğundan emin ol
            const explosionDistance = modelSize.x * explosionFactor; // Patlatma mesafesini ayarla

            // Use pre-calculated group centers
            const groupCenters = groupCentersRef.current;

            // Calculate target positions for all meshes
            groupRef.current.traverse((child) => {
                if (child.isMesh) {
                    // Ensure original position is set
                    if (!child.userData.originalPosition) {
                        child.userData.originalPosition = child.position.clone();
                    }

                    // Store original position as target for collapsed state
                    if (!child.userData.collapsedPosition) {
                        child.userData.collapsedPosition = child.userData.originalPosition.clone();
                    }

                    // Only recalculate exploded position if explosion factor has changed significantly
                    // or if exploded position hasn't been calculated yet
                    const shouldRecalculate = !child.userData.explodedPosition ||
                                            Math.abs((child.userData.lastExplosionFactor || 0) - explosionFactor) > 0.01;
                    
                    if (shouldRecalculate) {
                        // Find the nearest parent group with a calculated center
                        let groupCenter = overallCenter;
                        let currentParent = child.parent;
                        let level = 0;
                        
                        while (currentParent) {
                            if (groupCenters.has(currentParent.uuid)) {
                                groupCenter = groupCenters.get(currentParent.uuid);
                                break;
                            }
                            currentParent = currentParent.parent;
                            level++;
                        }

                        // Calculate direction from group center
                        const direction = child.userData.originalPosition.clone().sub(groupCenter).normalize();
                        
                        // If the direction vector is zero (shouldn't happen but just in case), use a small random direction
                        if (direction.lengthSq() < 0.0001) {
                            direction.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
                        }
                        
                        // Calculate exploded position
                        const levelFactor = Math.pow(1.2, level); // Reduced exponential increase based on hierarchy depth
                        const staggerFactor = 1 + (level * 0.1); // Add slight stagger based on hierarchy level
                        const targetPosition = child.userData.originalPosition.clone().add(direction.multiplyScalar(explosionDistance * levelFactor * staggerFactor));
                        
                        // Store target position for exploded state
                        if (!child.userData.explodedPosition) {
                            child.userData.explodedPosition = new THREE.Vector3();
                        }
                        child.userData.explodedPosition.copy(targetPosition);
                        
                        // Store the explosion factor used for this calculation
                        child.userData.lastExplosionFactor = explosionFactor;
                    }
                }
            });
        }
    }, [groupRef.current, modelSize, explosionFactor, overallCenter]);

    const toggleExplodedView = useCallback(() => {
        // Add a slight delay for a more cinematic effect
        setTimeout(() => {
            setIsExplodedView(prevExplodedState => {
                const newExplodedState = !prevExplodedState;
                console.log(`Exploded view: ${newExplodedState ? 'ON' : 'OFF'}`);
                
                // Ensure positions are calculated when toggling
                updateExplodedView();
                
                // The actual animation will be handled by the useFrame hook
                return newExplodedState;
            });
        }, 100); // 100ms delay for a more deliberate cinematic effect
    }, [updateExplodedView]);


    useImperativeHandle(ref, () => ({
      ...groupRef.current,
      getObjectByName: (name) => meshRefs.current[name] || null,
      traverse: (callback) => {
        if (groupRef.current) groupRef.current.traverse(callback);
      },
      focusOnPart: (partName) => highlightPart(partName),
      setViewMode: (mode) => setViewMode(mode),
      togglePartVisibility: (partName) => {
        setRedoHiddenPartsHistory([]); // her yeni değişimde redo temizle
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
          clippingPlane.constant = (clippingAxis === 'x' || clippingAxis === 'y' || clippingAxis === 'z') ? -position : position;
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
      toggleExplodedView, // Bu MachineModel içindeki toggleExplodedView
      // External step controls for QR/flow integration
      nextStep: () => { try { onNextStep(); } catch {} },
      prevStep: () => { try { onPrevStep(); } catch {} },
      setStepIndex: (idx) => { try { goToStep(Number(idx) || 0); } catch {} }
    }), [viewMode, hiddenParts, clippingPlane, clippingAxis, clippingPosition, hiddenPartsHistory, isClippingActive, scene, isMeasureToolActive, isExplodedView, modelSize, onNextStep, onPrevStep, goToStep]);

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
        if (clippingPlane) {
          if (axis === 'x') clippingPlane.constant = -planePosition.x;
          else if (axis === 'y') clippingPlane.constant = -planePosition.y;
          else if (axis === 'z') clippingPlane.constant = -planePosition.z;
          else {
            const normal = clippingPlane.normal.clone();
            clippingPlane.constant = -normal.dot(planePosition);
          }
        }
      }
    }, [scene, clippingPlane, clippingPlaneRef, setClippingHandleSize]);

    const applyClippingToAllMaterials = useCallback((/* plane (ignored for composite) */) => {
      if (!scene) return; // Sahne yoksa çık
  
      // Compose all active planes (primary + secondary + tertiary + cylindrical)
      const planes = [];
      if (isClippingActive && clippingPlane) planes.push(clippingPlane);
      if (isClippingActive2 && clippingPlane2) planes.push(clippingPlane2);
      if (isClippingActive3 && clippingPlane3) planes.push(clippingPlane3);
  
      // Cylindrical approximation via multiple planar clips
      if (cylindricalEnabled && cylinderSides >= 3 && cylinderRadius > 0) {
        const center = cylinderCenterRef.current || new THREE.Vector3(0, 0, 0);
        // Build N outward-facing planes tangent to the cylinder
        for (let i = 0; i < cylinderSides; i++) {
          const theta = (i / cylinderSides) * Math.PI * 2;
          let nx = 0, ny = 0, nz = 0;
          if (cylinderAxis === 'x') {
            // normals in YZ plane
            ny = Math.cos(theta);
            nz = Math.sin(theta);
          } else if (cylinderAxis === 'y') {
            // normals in XZ plane
            nx = Math.cos(theta);
            nz = Math.sin(theta);
          } else {
            // 'z' axis: normals in XY plane
            nx = Math.cos(theta);
            ny = Math.sin(theta);
          }
          const n = new THREE.Vector3(nx, ny, nz).normalize();
          // Plane equation: n·p + c = 0. Choose c so that inside region satisfies n·(p - center) <= radius
          // => n·p - radius - n·center <= 0  => c = -radius - n·center
          const c = -cylinderRadius - n.dot(center);
          planes.push(new THREE.Plane(n, c));
        }
      }
  
      // Intersection is required when regional mode or cylindrical is used
      const requireIntersection = (sectionMode === 'regional') || !!clipIntersection || !!cylindricalEnabled;
  
      scene.traverse((child) => {
        if (!child.isMesh) return;
  
        // Hedef mesh için dahil/hariç mantığı
        const name = child.name || '';
        let include = true;
        if (clipIncludeMode === 'include') {
          include = clipSelection.includes(name);
        } else if (clipIncludeMode === 'exclude') {
          include = !clipSelection.includes(name);
        }
  
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach(mat => {
          if (!mat) return;
          mat.clippingPlanes = include ? planes : [];
          mat.clipIntersection = requireIntersection;
          mat.needsUpdate = true;
        });
      });
  
      if (gl) gl.localClippingEnabled = planes.length > 0;
    }, [
      scene, gl,
      // inclusion/exclusion + mode
      clipIncludeMode, clipSelection, sectionMode, clipIntersection,
      // composite planes
      isClippingActive, clippingPlane,
      isClippingActive2, clippingPlane2,
      isClippingActive3, clippingPlane3,
      // cylinder
      cylindricalEnabled, cylinderAxis, cylinderRadius, cylinderSides
    ]);

    const getPartFamily = (name) => {
      const match = name.match(/^(TTU-\d+-\d+-\d+-R\d+)/);
      return match ? match[1] : name;
    };

    // ------- BOM helpers and exporters -------
    const collectBOM = useCallback((scope = 'all') => {
      // scope: 'all' | 'assembly'
      const map = new Map(); // name -> { name, count, status }
      const asmKey = (selectedAssemblyKeyRef.current || '').toLowerCase();

      const add = (name) => {
        if (!name) return;
        const key = String(name);
        const status = partStatuses ? (partStatuses[key] || '') : '';
        if (!map.has(key)) map.set(key, { name: key, count: 0, status });
        const rec = map.get(key);
        rec.count += 1;
        // Prefer non-empty status
        if (!rec.status && status) rec.status = status;
      };

      if (groupRef.current) {
        groupRef.current.traverse((child) => {
          if (!child.isMesh) return;
          const partName = child.name || '';
          if (!partName) return;

          if (scope === 'assembly') {
            const meshAsm = (child.userData?.assemblyId || '').toLowerCase();
            // If no assembly selected, fallback to include all
            if (asmKey && meshAsm !== asmKey) return;
          }
          add(partName);
        });
      }
      return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'tr'));
    }, [partStatuses]);

    const downloadBlob = (filename, mime, dataStr) => {
      try {
        const blob = new Blob([dataStr], { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 0);
      } catch (e) {
        console.warn('Download failed:', e);
      }
    };

    const exportBOMCSV = (scope = 'all') => {
      const rows = collectBOM(scope);
      const header = ['Parça', 'Adet', 'Durum'];
      const csv = [header.join(';')]
        .concat(rows.map(r => [r.name, String(r.count), String(r.status || '')].join(';')))
        .join('\n');
      const suffix = scope === 'assembly' ? 'montaj' : 'tum';
      downloadBlob(`BOM_${suffix}.csv`, 'text/csv;charset=utf-8', csv);
    };

    const exportBOMJSON = (scope = 'all') => {
      const rows = collectBOM(scope);
      const json = JSON.stringify({ scope, items: rows }, null, 2);
      const suffix = scope === 'assembly' ? 'montaj' : 'tum';
      downloadBlob(`BOM_${suffix}.json`, 'application/json;charset=utf-8', json);
    };

    // Export instructions as PDF by opening print dialog on a new window
    const exportInstructionsPDF = (scope = 'assembly') => {
      const rows = collectBOM(scope);
      const steps = stepsForPart || [];
      const today = new Date();
      const title = 'Üretim Montaj Talimatı (PDF)';
      const html = `
        <!doctype html>
        <html lang="tr">
        <head>
          <meta charset="utf-8" />
          <title>${title}</title>
          <meta name="viewport" content="width=device-width,initial-scale=1" />
          <style>
            body { font-family: Arial, sans-serif; color:#222; margin:16px; }
            table { border-collapse: collapse; width:100%; }
            th, td { border: 1px solid #ccc; padding: 6px; font-size: 12px; }
            thead { background: #f2f2f2; }
            h2, h3 { margin: 8px 0; }
            .meta { font-size: 12px; color: #666; margin-bottom: 8px; }
            @media print { .no-print { display:none; } }
          </style>
        </head>
        <body>
          <div class="no-print" style="text-align:right;margin-bottom:8px">
            <button onclick="window.print()">Yazdır / PDF</button>
          </div>
          <h2>${title}</h2>
          <div class="meta">${today.toLocaleString('tr-TR')}</div>
          <h3>Malzeme Listesi (BOM)</h3>
          <table>
            <thead><tr><th align="left">Parça</th><th align="right">Adet</th><th align="left">Durum</th></tr></thead>
            <tbody>
              ${rows.map(r => `<tr><td>${r.name}</td><td align="right">${r.count}</td><td>${r.status || ''}</td></tr>`).join('')}
            </tbody>
          </table>
          <hr />
          <h3>Montaj Adımları</h3>
          ${steps.length ? `<ol>${steps.map((s,i)=>`<li><strong>${s.title||('Adım '+(i+1))}</strong> — ${s.status||'beklemede'}${s.description?(' — '+s.description):''}</li>`).join('')}</ol>` : `<div style="color:#666">Bu parça için kayıtlı montaj adımı bulunamadı.</div>`}
        </body>
        </html>
      `;
      try {
        const w = window.open('', '_blank');
        if (w) {
          w.document.open();
          w.document.write(html);
          w.document.close();
          w.focus();
          // Auto print after small delay
          setTimeout(() => { try { w.print(); } catch {} }, 300);
        } else {
          // Fallback: download HTML for manual printing
          downloadBlob(`Montaj_Talimat_${scope}.html`, 'text/html;charset=utf-8', html);
        }
      } catch {
        downloadBlob(`Montaj_Talimat_${scope}.html`, 'text/html;charset=utf-8', html);
      }
    };

    // Grouped BOM for fastener sets
    const collectFastenerSetsBOM = (scope = 'all') => {
      const map = new Map(); // label -> { label, count, missing }
      const asmKey = (selectedAssemblyKeyRef.current || '').toLowerCase();

      const add = (label, missing) => {
        if (!label) return;
        if (!map.has(label)) map.set(label, { label, count: 0, missing: 0 });
        const r = map.get(label);
        r.count += 1;
        if (missing) r.missing += 1;
      };

      const list = fastenerSetsRef.current || [];
      list.forEach(set => {
        if (scope === 'assembly') {
          // Filter by current assembly selection if any
          if (asmKey && (set.assemblyId || '') !== asmKey) return;
        }
        add(set.label, !!set.hasMissing);
      });

      // Sort stable
      return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, 'tr'));
    };

    const exportBOMFastenerSetsCSV = (scope = 'all') => {
      const rows = collectFastenerSetsBOM(scope);
      const header = ['Set', 'Adet', 'Eksik (set)'];
      const csv = [header.join(';')]
        .concat(rows.map(r => [r.label, String(r.count), String(r.missing || 0)].join(';')))
        .join('\n');
      const suffix = scope === 'assembly' ? 'montaj' : 'tum';
      downloadBlob(`BOM_SET_${suffix}.csv`, 'text/csv;charset=utf-8', csv);
    };

    const exportBOMFastenerSetsJSON = (scope = 'all') => {
      const rows = collectFastenerSetsBOM(scope);
      const json = JSON.stringify({ scope, sets: rows }, null, 2);
      const suffix = scope === 'assembly' ? 'montaj' : 'tum';
      downloadBlob(`BOM_SET_${suffix}.json`, 'application/json;charset=utf-8', json);
    };

    const exportInstructionsHTML = (scope = 'assembly') => {
      const rows = collectBOM(scope);
      // Use assembly steps for current part if available
      const steps = stepsForPart || [];
      const today = new Date();
      const title = 'Üretim Montaj Talimatı';

      const bomTable = `
        <table border="1" cellspacing="0" cellpadding="6" style="border-collapse:collapse;width:100%;font-family:sans-serif">
          <thead style="background:#f2f2f2">
            <tr><th align="left">Parça</th><th align="right">Adet</th><th align="left">Durum</th></tr>
          </thead>
          <tbody>
            ${rows.map(r => `<tr><td>${r.name}</td><td align="right">${r.count}</td><td>${r.status || ''}</td></tr>`).join('')}
          </tbody>
        </table>
      `;

      const stepsHtml = steps.length > 0 ? `
        <h3>Montaj Adımları (${steps.length})</h3>
        <ol>
          ${steps.map((s, i) => `
            <li style="margin-bottom:8px">
              <div><strong>${(s.title || `Adım ${i+1}`)}</strong> — ${s.status || 'beklemede'}</div>
              ${s.description ? `<div style="color:#555">${s.description}</div>` : ''}
            </li>
          `).join('')}
        </ol>
      ` : `<div style="color:#666">Bu parça için kayıtlı montaj adımı bulunamadı.</div>`;

      const machineInfo = selectedMachine ? `
        <div style="margin:6px 0;color:#444">
          <strong>Proje:</strong> ${selectedMachine.name} &nbsp; • &nbsp;
          <strong>Takipçi:</strong> ${selectedMachine.tracker || '-'}
        </div>
      ` : '';

      const html = `
        <!doctype html>
        <html lang="tr">
        <head>
          <meta charset="utf-8" />
          <title>${title}</title>
          <meta name="viewport" content="width=device-width,initial-scale=1" />
        </head>
        <body style="margin:16px;font-family:sans-serif;color:#222">
          <h2 style="margin:0 0 6px 0">${title}</h2>
          <div style="font-size:12px;color:#666">${today.toLocaleString('tr-TR')}</div>
          ${machineInfo}
          <hr />
          <h3>Malzeme Listesi (BOM)</h3>
          ${bomTable}
          <hr />
          ${stepsHtml}
          <hr />
          <div style="font-size:12px;color:#777">Bu belge sistem tarafından otomatik oluşturulmuştur.</div>
        </body>
        </html>
      `;
      downloadBlob(`Montaj_Talimat_${scope}.html`, 'text/html;charset=utf-8', html);
    };
    // ------- END BOM/export helpers -------

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

    // --------- Fastener (Bolt/Nut/Washer) helpers ---------
    const detectFastenerType = (rawName) => {
      if (!rawName) return null;
      const s = String(rawName).toLowerCase();

      // Common standards and local keywords
      const isBolt =
        /\b(m\d{1,2}\s*(x|×)\s*\d{1,3})\b/.test(s) ||
        /\b(din|iso)\s*(931|933|912|7991|7380)\b/.test(s) ||
        /\bbolt\b|\bcıvata\b|\bcivata\b/.test(s);

      const isNut =
        /\b(din|iso)\s*(934|985|439|6923)\b/.test(s) ||
        /\bnut\b|\bsomun\b/.test(s);

      const isWasher =
        /\b(din|iso)\s*(125|9021|127|7989)\b/.test(s) ||
        /\bwasher\b|\brondela\b/.test(s);

      if (isBolt) return 'bolt';
      if (isNut) return 'nut';
      if (isWasher) return 'washer';
      return null;
    };

    // Try to extract a metric size token from name (e.g., "M8x30", "M10 x 50")
    const extractMetricSize = (rawName) => {
      if (!rawName) return null;
      const s = String(rawName).toUpperCase();
      const m = s.match(/\bM\s*(\d{1,2})\s*(?:[X×]\s*(\d{1,3}))?\b/);
      if (!m) return null;
      const d = m[1];
      const L = m[2] ? m[2] : null;
      return L ? `M${d}x${L}` : `M${d}`;
    };

    const makeSetLabel = ({ boltName, washerName, nutName }) => {
      const size = extractMetricSize(boltName) || extractMetricSize(washerName) || extractMetricSize(nutName) || '';
      const parts = [];
      if (boltName) parts.push('cıvata');
      if (washerName) parts.push('rondela');
      if (nutName) parts.push('somun');
      const kind = parts.length ? parts.join(' + ') : 'bağlantı elemanları';
      return `Bağlantı Seti${size ? ` ${size}` : ''}: ${kind}`;
    };

    const getCenterOfObject = (obj) => {
      try {
        const b = new THREE.Box3().setFromObject(obj);
        if (!b.isEmpty()) return b.getCenter(new THREE.Vector3());
      } catch {}
      return new THREE.Vector3();
    };

    // Build fastener sets by simple heuristics:
    // - Find bolts
    // - For each bolt, search siblings (same parent) first for nearest washer and nearest nut, fallback to same assemblyId in scene
    // - Create set; mark hasMissing if any of washer/nut missing
    const buildFastenerSets = () => {
      try {
        fastenerSetsRef.current = [];
        fastenerSetByIdRef.current.clear();
        meshToFastenerSetRef.current.clear();

        if (!groupRef.current) return;

        // Index meshes by type and by assembly
        const bolts = [];
        const nuts = [];
        const washers = [];
        const allMeshes = [];

        groupRef.current.traverse((n) => {
          if (!n.isMesh) return;
          const t = detectFastenerType(n.name || '');
          if (!t) { allMeshes.push(n); return; }
          if (t === 'bolt') bolts.push(n);
          else if (t === 'nut') nuts.push(n);
          else if (t === 'washer') washers.push(n);
          allMeshes.push(n);
        });

        if (bolts.length === 0 && nuts.length === 0 && washers.length === 0) return;

        const byAssembly = (arr) => {
          const map = new Map(); // asm -> array
          arr.forEach(m => {
            const a = (m.userData?.assemblyId || '').toLowerCase();
            const key = a || '__noasm__';
            if (!map.has(key)) map.set(key, []);
            map.get(key).push(m);
          });
          return map;
        };

        const nutsByAsm = byAssembly(nuts);
        const washersByAsm = byAssembly(washers);

        const pickNearestIn = (candidates, refObj) => {
          if (!candidates || candidates.length === 0) return null;
          const rc = getCenterOfObject(refObj);
          let best = null;
          let bestD2 = Infinity;
          for (const c of candidates) {
            const cc = getCenterOfObject(c);
            const d2 = rc.distanceToSquared(cc);
            if (d2 < bestD2) { bestD2 = d2; best = c; }
          }
          return best;
        };

        bolts.forEach((bolt, i) => {
          const asm = (bolt.userData?.assemblyId || '').toLowerCase();
          const siblings = (bolt.parent && bolt.parent.children) ? bolt.parent.children.filter(x => x.isMesh) : [];

          // Prefer siblings first
          const sibWashers = siblings.filter(m => detectFastenerType(m.name || '') === 'washer');
          const sibNuts = siblings.filter(m => detectFastenerType(m.name || '') === 'nut');

          let washer = pickNearestIn(sibWashers, bolt);
          let nut = pickNearestIn(sibNuts, bolt);

          // Fallback to same assembly
          if (!washer) {
            washer = pickNearestIn(washersByAsm.get(asm) || washers, bolt);
          }
          if (!nut) {
            nut = pickNearestIn(nutsByAsm.get(asm) || nuts, bolt);
          }

          // Avoid pairing the same item to multiple bolts by naive de-dup: if already assigned, skip
          const alreadyAssigned = (m) => m && meshToFastenerSetRef.current.has(m.uuid);
          if (alreadyAssigned(washer)) washer = null;
          if (alreadyAssigned(nut)) nut = null;

          const label = makeSetLabel({ boltName: bolt.name, washerName: washer?.name, nutName: nut?.name });
          const setId = `fs_${(asm || 'na')}_${extractMetricSize(bolt.name) || 'M?'}_${i}`;

          const hasMissing = !(washer && nut);

          const set = {
            id: setId,
            assemblyId: asm,
            label,
            members: { bolt, washer, nut },
            hasMissing
          };

          fastenerSetsRef.current.push(set);
          fastenerSetByIdRef.current.set(setId, set);
          meshToFastenerSetRef.current.set(bolt.uuid, setId);
          if (washer) meshToFastenerSetRef.current.set(washer.uuid, setId);
          if (nut) meshToFastenerSetRef.current.set(nut.uuid, setId);
        });
      } catch (e) {
        console.warn('buildFastenerSets failed:', e);
      }
    };

    // Kullanıcı panelde bir "set" satırına tıkladığında o setten bir elemanı seçip sahnede vurgular
    const selectFastenerSet = useCallback((set) => {
      try {
        if (!set) return;
        const m = set.members?.bolt || set.members?.washer || set.members?.nut;
        if (!m) return;

        selectedMeshRef.current = m;
        selectedSigRef.current = m.userData?.copySignature ?? null;
        selectedGroupKeyRef.current = m.userData?.serialGroupKey ?? getSerialGroupKeyFromNode(m);
        selectedFamilyRef.current = m.userData?.partFamily ?? null;
        selectedGeoUUIDRef.current = m.geometry?.uuid ?? null;
        selectedMeshUUIDRef.current = m.uuid ?? null;
        lastSelectSourceRef.current = 'scene';
        selectedAssemblyKeyRef.current = null;

        const targetName = m.name || `mesh_${(m.uuid || '').slice(0,8)}`;
        setInternalSelectedPart(targetName);
        if (invalidate) invalidate();
        onPartClick(targetName);
      } catch {}
    }, [invalidate, onPartClick]);

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

/* Assembly detection helpers (TTU-0911-1601000 pattern) */
const ASSEMBLY_ID_REGEX = /([A-Z]{3,4}-\d{4}-\d{7})/i;

const extractAssemblyId = (raw) => {
  if (!raw || typeof raw !== 'string') return null;
  const m = raw.match(ASSEMBLY_ID_REGEX);
  return m && m[1] ? m[1].toLowerCase() : null;
};

const findAssemblyIdInAncestors = (node) => {
  try {
    let cur = node;
    while (cur) {
      const id = extractAssemblyId(cur.name || '');
      if (id) return id;
      cur = cur.parent || null;
    }
  } catch {}
  return null;
};
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
      try {
        // Hedef yapı:
        // 1) Ana montaj (ör. TTU-0911-1000000-R00)
        // 2) Alt montajlar (ör. TTU-0911-1100000-R00, 1200000, 1600000, 1700000)
        // 3) Alt montajın altındaki düğümler:
        //    - Kaynaklı parça kökü: ...-0000-RNN  -> altında yapraklar ...-0001, -0002, ...
        //    - Diğer parçalar: TTU-....-.......-RNN veya DIN_... vb doğrudan parça isimleri
        const hierarchy = {};
        const partCounts = {};

        // Match anywhere in the name (not only full-string), to be robust against suffixes like "-1", "(Instance)" etc.
        const FULL_ASM_ANY = /([A-Z]{3,4}-\d{4}-\d{7}-R\d{2})/i;
        const WELD_ROOT_ANY = /([A-Z]{3,4}-\d{4}-\d{7}-0000-R\d{2})/i;
        const WELD_LEAF_ANY = /([A-Z]{3,4}-\d{4}-\d{7})-(\d{4})(?!-R\d{2})/i;

        const getName = (n) => (n && n.name) ? n.name : `isimsiz_${n?.isMesh ? 'mesh' : 'grup'}_${(n?.uuid || '').slice(0,5)}`;

        const getNearestAssemblyCode = (n) => {
          let cur = n;
          while (cur) {
            const nm = getName(cur);
            const m = nm.match(FULL_ASM_ANY);
            if (m) return m[1];
            cur = cur.parent || null;
          }
          return null;
        };

        const getTopAssemblyCode = (n) => {
          let cur = n;
          let top = null;
          while (cur) {
            const nm = getName(cur);
            const m = nm.match(FULL_ASM_ANY);
            if (m) top = m[1];
            cur = cur.parent || null;
          }
          return top;
        };

        const getNearestWeldRootCode = (n) => {
          let cur = n;
          while (cur) {
            const nm = getName(cur);
            const m = nm.match(WELD_ROOT_ANY);
            if (m) {
              // Tam kök adını (ör. ...-0000-R00) olduğu gibi döndür
              return m[1];
            }
            cur = cur.parent || null;
          }
          return null;
        };

        // Parça sayacı (aynı isimde birden fazla mesh için)
        scene.traverse((child) => {
          if (child.isMesh) {
            const nm = getName(child);
            partCounts[nm] = (partCounts[nm] || 0) + 1;
          }
        });

        // Ana montajı bul: mesh'ler için "en üstteki montaj kodu" sıklığına göre seçim
        const topAsmFreq = {};
        scene.traverse((child) => {
          if (!child.isMesh) return;
          const top = getTopAssemblyCode(child);
          if (top) topAsmFreq[top] = (topAsmFreq[top] || 0) + 1;
        });
        // Prefer TTU-…-1000000-RNN as ana montaj, eğer mevcutsa; yoksa frekansça en baskın olanı seç
        const asmCandidates = Object.keys(topAsmFreq);
        let mainAsm = (scene.name || 'Model');
        if (asmCandidates.length > 0) {
          const preferred = asmCandidates.find(k => {
            try {
              const base = (extractAssemblyId(k) || '').toLowerCase(); // ör: ttu-0911-1000000
              return /-[0-9]{7}$/i.test(base) && base.endsWith('-1000000');
            } catch { return false; }
          });
          if (preferred) {
            mainAsm = preferred;
          } else {
            mainAsm = asmCandidates.sort((a, b) => (topAsmFreq[b] - topAsmFreq[a]))[0];
          }
        }
        // Persist base key of main assembly for isolation logic (e.g., TTU-0911-1000000)
        const mainBase = (extractAssemblyId(mainAsm) || extractAssemblyId(scene.name || '') || '').toLowerCase();
try { mainAssemblyKeyRef.current = mainBase; } catch {}

        // Kök düğüm
        hierarchy[mainAsm] = { name: mainAsm, isMesh: false, children: {}, count: 1 };
        const rootChildren = hierarchy[mainAsm].children;

        // 2. seviye alt montajları belirle (ana montajın doğrudan altındaki montajlar)
        const level2Set = new Set();
        scene.traverse((child) => {
          if (!child.isMesh) return;
          const nearAsm = getNearestAssemblyCode(child);
          const top = getTopAssemblyCode(child);
          if (nearAsm && extractAssemblyId(top) === mainBase && nearAsm !== mainAsm) {
            level2Set.add(nearAsm);
          }
        });

        // Yardımcı: çocuk düğüm oluştur/artan say
        const ensureNode = (parentChildren, key, isMesh, count = 1) => {
          if (!parentChildren[key]) {
            parentChildren[key] = { name: key, isMesh, children: {}, count };
          } else if (isMesh) {
            parentChildren[key].count = (parentChildren[key].count || 0) + count;
          }
          return parentChildren[key];
        };

        // 2. seviye düğümleri ekle
        level2Set.forEach((asmCode) => {
          rootChildren[asmCode] = { name: asmCode, isMesh: false, children: {}, count: 1 };
        });

        // 3. seviye: kaynaklı parça kökleri (…-0000-RNN), her bir 2. seviye altına
        const weldRootsByL2 = {};
        scene.traverse((node) => {
          const nm = getName(node);
          if (WELD_ROOT_ANY.test(nm)) {
            const l2 = getNearestAssemblyCode(node);
            const top = getTopAssemblyCode(node);
            if (l2 && extractAssemblyId(top) === mainBase) {
              weldRootsByL2[l2] = weldRootsByL2[l2] || new Set();
              weldRootsByL2[l2].add(nm);
            }
          }
        });

        Object.entries(weldRootsByL2).forEach(([l2, wrSet]) => {
          const l2Node = rootChildren[l2] || (rootChildren[l2] = { name: l2, isMesh: false, children: {}, count: 1 });
          wrSet.forEach((wrName) => {
            l2Node.children[wrName] = { name: wrName, isMesh: false, children: {}, count: 1 };
          });
        });

        // 3./4. seviyeler: kaynak yaprakları ve doğrudan parçalar
        scene.traverse((child) => {
          if (!child.isMesh) return;

          const nm = getName(child);
          const l2 = getNearestAssemblyCode(child);
          const top = getTopAssemblyCode(child);
          if (!(l2 && extractAssemblyId(top) === mainBase && l2 !== mainAsm)) return;

          const l2Node = rootChildren[l2] || (rootChildren[l2] = { name: l2, isMesh: false, children: {}, count: 1 });

          // Eğer bu mesh bir kaynak kökü altında ise -> yaprak olarak kökün altına koy
          const wrName = getNearestWeldRootCode(child);
          if (wrName && l2Node.children[wrName]) {
            // Yaprak adı olarak mesh adını kullan (ör. …-0001)
            const wrNode = l2Node.children[wrName];
            ensureNode(wrNode.children, nm, true, 1);
            return;
          }

          // Aksi halde doğrudan parça (ör. TTU-0022-..., DIN_..., Spring_washer_...) olarak 2. seviyeye ekle
          ensureNode(l2Node.children, nm, true, 1);
        });

        onHierarchyReady(hierarchy);
      } catch (err) {
        console.warn('buildHierarchy() failed, fallback is used:', err);
        const fallback = {};
        const rootKey = scene.name || 'Model';
        fallback[rootKey] = { name: rootKey, isMesh: false, children: {}, count: 1 };
        onHierarchyReady(fallback);
      }
    };

    // TTU için sağlam 4-seviyeli hiyerarşi kurucu:
    // 1) Ana Montaj (TTU-0911-1000000-R00/TTU-0911-1000000)
    // 2) Alt Montajlar (TTU-0911-1100000-R00/… -> üçüncü blok 7 hane, alt montaj için son 4 hanesi 0 olacak şekilde yuvarlanır)
    // 3) Alt montaj altı: Kaynak Kökleri (…-0000-RNN) ve doğrudan parçalar (TTU-0022-…/DIN_/Spring_washer_/…)
    // 4) Yapraklar: Kaynak Kökü altında …-0001, …-0002, …
    const buildHierarchy_TTU = () => {
      try {
        const hierarchy = {};
        const partCounts = {};

        const getName = (n) => (n && n.name) ? n.name : `isimsiz_${n?.isMesh ? 'mesh' : 'grup'}_${(n?.uuid || '').slice(0,5)}`;

        // Yardımcı: isimden TTU-XXXX-XXXXXXX (baz) yakala
        const getBaseIdFromString = (s) => extractAssemblyId(s || '');

        // En yakın kaynak kökü adını (…-0000-RNN) ata zincirinde bul
        const WELD_ROOT_ANY = /([A-Z]{3,4}-\d{4}-\d{7}-0000-R\d{2})/i;
        const findNearestWeldRootName = (node) => {
          let cur = node;
          while (cur) {
            const nm = getName(cur);
            const m = nm.match(WELD_ROOT_ANY);
            if (m) return m[1];
            cur = cur.parent || null;
          }
          return null;
        };

        // Baz ID -> (prefix "TTU-0911", üçüncü blok sayısı)
        const splitBase = (baseId) => {
          try {
            const parts = String(baseId).split('-');
            return { prefix: `${parts[0]}-${parts[1]}`, n3: parseInt(parts[2], 10) || 0 };
          } catch { return { prefix: '', n3: 0 }; }
        };

        const pad7 = (n) => String(n).padStart(7, '0');
        const roundToL2 = (n) => Math.floor(n / 10000) * 10000;

        // 1) Ana montaj baz ID'sini çoğunluk ile bul (mesh isim/ata zincirinden)
        const baseFreq = {};
        scene.traverse((child) => {
          if (!child.isMesh) return;
          const nm = getName(child);
          const baseFromSelf = getBaseIdFromString(nm);
          const baseFromAnc = baseFromSelf || findAssemblyIdInAncestors(child);
          const b = (baseFromAnc || baseFromSelf || '').toLowerCase();
          if (b) baseFreq[b] = (baseFreq[b] || 0) + 1;

          // sayaçlar
          partCounts[nm] = (partCounts[nm] || 0) + 1;
        });
        let mainBase = Object.keys(baseFreq).sort((a, b) => (baseFreq[b] - baseFreq[a]))[0] || '';
        if (!mainBase) {
          const sBase = getBaseIdFromString(scene.name || '');
          if (sBase) mainBase = sBase.toLowerCase();
        }
        if (!mainBase) {
          // Emniyet: hiç bulunamazsa çık
          const fallback = {};
          const rootKey = scene.name || 'Model';
          fallback[rootKey] = { name: rootKey, isMesh: false, children: {}, count: 1 };
          onHierarchyReady(fallback);
          return;
        }

        // İzolasyon için ana baz ID'yi kaydet
        try { mainAssemblyKeyRef.current = mainBase.toLowerCase(); } catch {}

        const { prefix: mainPrefix } = splitBase(mainBase);

        // Kök etiket: varsa full kod (…-RNN), yoksa "…-R00"
        const rootLabelFull = (() => {
          const m = (scene.name || '').match(/([A-Z]{3,4}-\d{4}-\d{7}-R\d{2})/i);
          if (m) return m[1];
          return `${mainPrefix}-${mainBase.split('-')[2]}-R00`;
        })();

        hierarchy[rootLabelFull] = { name: rootLabelFull, isMesh: false, children: {}, count: 1 };
        const rootChildren = hierarchy[rootLabelFull].children;

        // 2) L2 düğümlerini oluştur: tüm meshler için baz ID al, üçüncü bloğu 10.000'lik dilime yuvarla
        const ensureNode = (parentChildren, key, isMesh, count = 1) => {
          if (!parentChildren[key]) {
            parentChildren[key] = { name: key, isMesh, children: {}, count };
          } else if (isMesh) {
            parentChildren[key].count = (parentChildren[key].count || 0) + count;
          }
          return parentChildren[key];
        };

        const l2LabelsSet = new Set();

        scene.traverse((node) => {
          const nm = getName(node);
          // Kaynak kökleri varsa isimden al
          const wrName = findNearestWeldRootName(node);
          const baseFromSelf = getBaseIdFromString(nm);
          const baseFromAnc = baseFromSelf || findAssemblyIdInAncestors(node);
          const b = (baseFromAnc || baseFromSelf || '').toLowerCase();
          if (!b) return;

          const { n3 } = splitBase(b);
          const l2n = roundToL2(n3);
          if (l2n === 0) return;

          // L2 label'ı ana prefix ile üret (ör. TTU-0911-1100000-R00)
          const l2Label = `${mainPrefix}-${pad7(l2n)}-R00`.toLowerCase();
          if (!l2LabelsSet.has(l2Label)) {
            l2LabelsSet.add(l2Label);
            rootChildren[l2Label] = { name: l2Label, isMesh: false, children: {}, count: 1 };
          }
        });

        // 3) Kaynak köklerini L2 altına yerleştir
        scene.traverse((node) => {
          const nm = getName(node);
          const m = nm.match(WELD_ROOT_ANY);
          if (!m) return;

          const wrName = m[1];
          // wrName'den baz ID al ve L2'ye yuvarla
          const wrBase = getBaseIdFromString(wrName);
          if (!wrBase) return;
          const { n3 } = splitBase(wrBase);
          const l2n = roundToL2(n3);
          if (l2n === 0) return;
          const l2Label = `${mainPrefix}-${pad7(l2n)}-R00`.toLowerCase();

          const l2Node = rootChildren[l2Label] || (rootChildren[l2Label] = { name: l2Label, isMesh: false, children: {}, count: 1 });
          // Aynı isimli wr varsa tekrar etme
          if (!l2Node.children[wrName]) {
            l2Node.children[wrName] = { name: wrName, isMesh: false, children: {}, count: 1 };
          }
        });

        // 4) Yapraklar ve doğrudan parçalar
        scene.traverse((child) => {
          if (!child.isMesh) return;

          const nm = getName(child);
          const baseFromSelf = getBaseIdFromString(nm);
          const baseFromAnc = baseFromSelf || findAssemblyIdInAncestors(child);
          const b = (baseFromAnc || baseFromSelf || '').toLowerCase();
          if (!b) {
            // Baz bulunamazsa ana köke koymak yerine atla (gürültüyü azalt)
            return;
          }

          const { n3 } = splitBase(b);
          const l2n = roundToL2(n3);
          const l2Label = `${mainPrefix}-${pad7(l2n)}-R00`.toLowerCase();
          const l2Node = rootChildren[l2Label] || (rootChildren[l2Label] = { name: l2Label, isMesh: false, children: {}, count: 1 });

          // Kaynak kökü varsa önce ona yerleştir
          const wrName = findNearestWeldRootName(child);
          if (wrName && l2Node.children[wrName]) {
            ensureNode(l2Node.children[wrName].children, nm, true, 1);
          } else {
            // Aksi halde doğrudan L2 altına parça olarak koy
            ensureNode(l2Node.children, nm, true, 1);
          }
        });

        onHierarchyReady(hierarchy);
      } catch (err) {
        console.warn('buildHierarchy_TTU() failed, fallback is used:', err);
        const fallback = {};
        const rootKey = scene.name || 'Model';
        fallback[rootKey] = { name: rootKey, isMesh: false, children: {}, count: 1 };
        onHierarchyReady(fallback);
      }
    };

    const calculateModelSize = () => {
      if (scene && scene.children.length > 0) {
        const box = new THREE.Box3().setFromObject(scene);
        if (!box.isEmpty()) {
          const size = box.getSize(new THREE.Vector3());
          const center = box.getCenter(new THREE.Vector3());
          setModelSize(size);
          setModelCenter({ x: center.x, y: center.y, z: center.z });
          return size; // Boyutu döndür
        }
      }
      const defaultSize = { x: 10, y: 10, z: 10 };
      const defaultCenter = { x: 0, y: 0, z: 0 };
      setModelSize(defaultSize); // Varsayılan boyut
      setModelCenter(defaultCenter);
      return defaultSize;
    };

    useEffect(() => {
      const handleKeyDown = (e) => {
              const key = (e.key || '').toLowerCase();
              if (key === 'tab' && internalSelectedPart) {
                e.preventDefault();
                setRedoHiddenPartsHistory([]); // yeni gizlemede redo temizle
                setHiddenPartsHistory(prev => [...prev, [...hiddenParts]]);
                setHiddenParts(prev => [...prev, internalSelectedPart]);
              }
        // Undo (Ctrl/Cmd + Z) and Redo (Ctrl/Cmd + Y or Ctrl/Cmd + Shift + Z)
        if ((e.ctrlKey || e.metaKey) && key === 'z' && !e.shiftKey) {
          if (hiddenPartsHistory.length > 0) {
            e.preventDefault();
            // push current to redo, then restore previous
            setRedoHiddenPartsHistory(prev => [...prev, [...hiddenParts]]);
            const lastState = hiddenPartsHistory[hiddenPartsHistory.length - 1];
            setHiddenParts(lastState);
            setHiddenPartsHistory(prev => prev.slice(0, -1));
          }
        } else if ((e.ctrlKey || e.metaKey) && (key === 'y' || (key === 'z' && e.shiftKey))) {
          if (redoHiddenPartsHistory.length > 0) {
            e.preventDefault();
            // push current to undo, then apply last redo snapshot
            setHiddenPartsHistory(prev => [...prev, [...hiddenParts]]);
            const lastRedo = redoHiddenPartsHistory[redoHiddenPartsHistory.length - 1];
            setHiddenParts(lastRedo);
            setRedoHiddenPartsHistory(prev => prev.slice(0, -1));
          }
        }
        if (key === 'x' && e.shiftKey && !e.ctrlKey && !e.metaKey) toggleClippingPlane('x');
        if (key === 'y' && e.shiftKey && !e.ctrlKey && !e.metaKey) toggleClippingPlane('y');
        if (key === 'z' && e.shiftKey && !e.ctrlKey && !e.metaKey) toggleClippingPlane('z');
        if (clippingPlaneVisible || isClippingActive) {
          let newPosStep = 0.5;
          if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
            setClippingPosition(prev => {
              const newPos = prev + newPosStep;
              if (clippingPlane) clippingPlane.constant = -newPos;
              updateClippingPlanePosition(clippingAxis, newPos);
              return newPos;
            });
          } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
            setClippingPosition(prev => {
              const newPos = prev - newPosStep;
              if (clippingPlane) clippingPlane.constant = -newPos;
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
                if (!SUPPRESS_TEXTURE_WARNINGS) console.info(`${object.name || 'Isimsiz mesh'} için varsayılan doku uygulandı`);
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

      buildHierarchy_TTU();

      const partGroups = {};
      const partFamiliesData = {}; // Adını değiştirdim, ref ile karışmasın

      scene.traverse((child) => {
        if (child.isMesh) {
          const name = child.name || `isimsiz_mesh_${child.uuid.substring(0,5)}`;
          // Detect and store assembly id on each mesh (lowercased)
          try {
            const aId = findAssemblyIdInAncestors(child) || extractAssemblyId(name);
            child.userData.assemblyId = aId ? aId.toLowerCase() : null;
          } catch {}
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
              if (!SUPPRESS_TEXTURE_WARNINGS) console.info(`Mesh ${name} için varsayılan doku uygulandı`);
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
                    roughness: 0.55,
                    metalness: 0.15
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
              if (!material) return;
              material.clippingPlanes = [];
              material.clipIntersection = false;
              material.clipShadows = true;
              material.needsUpdate = true;
            });
            // Use unique normal material by default to avoid shared-material color bleed
            child.material = child.userData.materials.normal;
            child.material.needsUpdate = true
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
              if (!material) return;
              material.clippingPlanes = [];
              material.clipIntersection = false;
              material.clipShadows = true;
              material.needsUpdate = true;
            });
          }
          // Sharpen: material tuning and texture filtering
          try {
            if (child.material) {
              // Contrast/clarity: slightly lower roughness, lower metalness, stronger env map
              if (child.material.roughness === undefined || child.material.roughness > 0.5) child.material.roughness = 0.5;
              if (child.material.metalness !== undefined && child.material.metalness > 0.12) child.material.metalness = 0.12;
              if ('envMapIntensity' in child.material) {
                child.material.envMapIntensity = Math.min(0.9, child.material.envMapIntensity ?? 0.85);
              }
              // Maximize texture anisotropy and ensure sRGB for base color map
              const maps = ['map','normalMap','roughnessMap','metalnessMap','aoMap','emissiveMap'];
              maps.forEach(k => {
                const tex = child.material[k];
                if (tex && typeof tex === 'object') {
                  try {
                    if (tex.anisotropy === undefined || tex.anisotropy < maxAniso) tex.anisotropy = maxAniso;
                    if (k === 'map') {
                      if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
                    }
                    tex.needsUpdate = true;
                  } catch {}
                }
              });
              child.material.needsUpdate = true;
            }
          } catch {}
          // Edges overlay visibility only; creation handled in showEdges effect to avoid extra draw calls
          try {
            if (child.userData && child.userData.edgesHelper) {
              child.userData.edgesHelper.visible = showEdges;
            }
          } catch {}
          child.cursor = 'pointer';
        }
      });

      partGroupsRef.current = partGroups;
      partFamiliesRef.current = partFamiliesData; // Güncellenmiş veri

      if (groupRef.current) {
        groupRef.current.clear();
        groupRef.current.add(scene);
      }

      // Build fastener sets after scene attached
      buildFastenerSets();
      
      // Initialize original positions for exploded view
      if (groupRef.current) {
        groupRef.current.traverse((child) => {
          if (child.isMesh) {
            // Store original position for exploded view calculations
            if (!child.userData.originalPosition) {
              child.userData.originalPosition = child.position.clone();
            }
            // Store original position as target for collapsed state
            if (!child.userData.collapsedPosition) {
              child.userData.collapsedPosition = child.userData.originalPosition.clone();
            }
          }
        });
      }
      
      setIsLoading(false);
      gl.localClippingEnabled = true;
    }, [scene, gl, onHierarchyReady]); // onHierarchyReady bağımlılıklara eklendi

    // Load persisted assembly states from backend (if available)
    useEffect(() => {
      let cancelled = false;
      const load = async () => {
        try {
          const resp = await fetch('/api/records', { method: 'GET' });
          if (!resp.ok) return;
          const data = await resp.json();
          const list = Array.isArray(data.records) ? data.records : [];
          const map = {};
          list.forEach(r => {
            const name = String(r['Parça Adı'] || '').trim();
            if (!name) return;
            const montajDurumu = String(r['Montaj Durumu'] || '').trim();
            const removed = String(r['Sökülmüş'] || '').trim();
            const missing = String(r['Eksik'] || '').trim();
            map[name] = {
              montajDurumu: montajDurumu || undefined,
              removed: removed === '1' || /evet|true/i.test(removed),
              missing: missing === '1' || /evet|true/i.test(missing),
            };
          });
          if (!cancelled) setPartAsmStates(map);
        } catch {}
      };
      load();
      return () => { cancelled = true; };
    }, []);

    const persistPartAsmState = async (name, state) => {
      try {
        const payload = {
          'Parça Adı': name,
          'Montaj Durumu': state?.montajDurumu || '',
          'Sökülmüş': state?.removed ? '1' : '',
          'Eksik': state?.missing ? '1' : ''
        };
        await fetch('/api/records/upsert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ record: payload })
        });
      } catch (e) {
        console.warn('Persist failed:', e);
      }
    };

    const updateStateForSelection = (fn) => {
      const target = selectedMeshRef.current || (internalSelectedPart ? meshRefs.current[internalSelectedPart] : null);
      if (!target) return;
      const name = target.name || internalSelectedPart;
      setPartAsmStates(prev => {
        const next = { ...(prev[name] || {}), ...fn(prev[name] || {}) };
        const map = { ...prev, [name]: next };
        // fire and forget persist
        persistPartAsmState(name, next);
        return map;
      });
    };

    const markSelectedTightened = () => updateStateForSelection(() => ({ montajDurumu: 'tightened', removed: false }));
    const markSelectedRemoved = () => updateStateForSelection(s => ({ removed: !s.removed, montajDurumu: s.removed ? s.montajDurumu : (s.montajDurumu || '') }));
    const toggleSelectedMissing = () => updateStateForSelection(s => ({ missing: !s.missing }));

    // Calculate and store group centers only once when model is loaded
    useEffect(() => {
      if (groupRef.current) {
        const groupCenters = new Map();
        
        // Calculate group centers
        groupRef.current.traverse((child) => {
          if (child.isGroup || (child.isObject3D && child.children && child.children.length > 0)) {
            // Only calculate if not already stored
            if (!groupCenters.has(child.uuid)) {
              try {
                const box = new THREE.Box3().setFromObject(child);
                if (!box.isEmpty()) {
                  const center = new THREE.Vector3();
                  box.getCenter(center);
                  groupCenters.set(child.uuid, center);
                } else {
                  // Fallback to simple center calculation
                  groupCenters.set(child.uuid, new THREE.Vector3());
                }
              } catch (e) {
                // Fallback to simple center calculation
                groupCenters.set(child.uuid, new THREE.Vector3());
              }
            }
          }
        });
        
        // Store in ref for use in updateExplodedView
        groupCentersRef.current = groupCenters;
      }
    }, [groupRef.current]);
    
    // Calculate initial exploded positions when model is loaded
    useEffect(() => {
      if (groupRef.current) {
        updateExplodedView();
      }
    }, [groupRef.current, updateExplodedView]);

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
            // Do not override clipping here; re-apply globally after switching materials
            mesh.material.needsUpdate = true;
          }
        });
      });
      // Re-apply composite clipping to the newly assigned materials
      if (isClippingActive || isClippingActive2 || isClippingActive3 || cylindricalEnabled) {
        applyClippingToAllMaterials(clippingPlane);
      } else {
        applyClippingToAllMaterials(null);
      }
    }, [
      viewMode,
      // composite clipping state
      isClippingActive, isClippingActive2, isClippingActive3, cylindricalEnabled,
      clippingPlane,
      applyClippingToAllMaterials
    ]);
 
 
    // Create/remove edges helpers when showEdges toggles to minimize stutter
    useEffect(() => {
      if (!scene) return;
      
      // State for edge creation progress
      let cancelled = false;
      setIsEdgesLoading(true);
      
      const createEdgesAsync = async () => {
        try {
          // Collect all meshes that need edges
          const meshes = [];
          scene.traverse((child) => {
            if (!child.isMesh || !child.geometry || !child.visible) return;
            // Skip tiny meshes to reduce draw calls
            const geo = child.geometry;
            if (!geo.boundingBox && geo.computeBoundingBox) {
              try { geo.computeBoundingBox(); } catch {}
            }
            const bb = geo.boundingBox;
            if (bb) {
              const size = new THREE.Vector3();
              bb.getSize(size);
              // Increased threshold to skip more tiny parts
              if (size.length() < 0.1) return; // skip very tiny parts
            }
            if (!child.userData || !child.userData.edgesHelper) {
              meshes.push(child);
            }
          });
          
          // Process meshes in small batches to avoid blocking the main thread
          const batchSize = 3; // Reduced batch size
          const thresholdDeg = 60; // higher threshold => fewer lines (less visual clutter)
          
          for (let i = 0; i < meshes.length; i += batchSize) {
            if (cancelled) {
              setIsEdgesLoading(false);
              return;
            }
            
            const batch = meshes.slice(i, i + batchSize);
            batch.forEach((child) => {
              if (cancelled) return;
              
              if (child.userData && child.userData.edgesHelper) {
                child.userData.edgesHelper.visible = true;
                return;
              }
              
              try {
                const geo = child.geometry;
                const eg = new THREE.EdgesGeometry(geo, thresholdDeg);
                if (!eg.attributes || !eg.attributes.position || eg.attributes.position.count === 0) {
                  eg.dispose();
                  return;
                }
                const lm = new THREE.LineBasicMaterial({ color: 0x444444, transparent: true, opacity: 0.28, depthTest: true });
                const lines = new THREE.LineSegments(eg, lm);
                lines.name = (child.name ? `${child.name}__edges` : `edges_${child.id}`);
                // Let lines be frustum-culled; no special renderOrder needed
                child.add(lines);
                child.userData = child.userData || {};
                child.userData.edgesHelper = lines;
              } catch (err) {
                console.warn('Edge creation failed for mesh:', child.name, err);
              }
            });
            
            // Yield to the event loop after each batch with longer delay
            if (i + batchSize < meshes.length) {
              await new Promise(resolve => setTimeout(resolve, 5)); // Increased delay
            }
          }
          
          if (!cancelled && invalidate) invalidate();
        } catch (err) {
          console.error('Error creating edges:', err);
        } finally {
          if (!cancelled) {
            setIsEdgesLoading(false);
          }
        }
      };
      
      const removeEdges = () => {
        // Remove edges to free GPU/CPU work
        scene.traverse((child) => {
          if (child.isMesh && child.userData && child.userData.edgesHelper) {
            try {
              const lines = child.userData.edgesHelper;
              child.remove(lines);
              if (lines.geometry) lines.geometry.dispose();
              if (lines.material) lines.material.dispose();
            } catch (err) {
              console.warn('Edge removal failed for mesh:', child.name, err);
            }
            child.userData.edgesHelper = null;
            delete child.userData.edgesHelper;
          }
        });
      };
      
      if (showEdges) {
        createEdgesAsync();
      } else {
        removeEdges();
        setIsEdgesLoading(false);
        if (invalidate) invalidate();
      }
      
      // Cleanup function to cancel async operations
      return () => {
        cancelled = true;
      };
    }, [showEdges, scene, invalidate, isEdgesLoading]);

    useEffect(() => {
      // Clear clipping only when no planes and no cylinder are active
      if (!isClippingActive && !isClippingActive2 && !isClippingActive3 && !cylindricalEnabled) {
        applyClippingToAllMaterials(null);
        return;
      }
      applyClippingToAllMaterials(clippingPlane);
    }, [clippingPlane, isClippingActive, isClippingActive2, isClippingActive3, cylindricalEnabled]);

    // Dahil/Hariç seçimleri veya kesişim modu değiştiğinde materyalleri güncelle
    useEffect(() => {
      // If nothing is active, clear clipping
      if (!isClippingActive && !isClippingActive2 && !isClippingActive3 && !cylindricalEnabled) {
        applyClippingToAllMaterials(null);
        return;
      }
      applyClippingToAllMaterials(clippingPlane);
    }, [
      clipIncludeMode, clipSelection, clipIntersection, sectionMode,
      isClippingActive, isClippingActive2, isClippingActive3, cylindricalEnabled
    ]);
 
    // Silindirik kesit parametreleri veya düzlem kombinasyonları değiştiğinde materyalleri güncelle
    useEffect(() => {
      if (!cylindricalEnabled && !isClippingActive && !isClippingActive2 && !isClippingActive3) return;
      applyClippingToAllMaterials(clippingPlane);
    }, [
      cylindricalEnabled, cylinderAxis, cylinderRadius, cylinderSides,
      isClippingActive, isClippingActive2, isClippingActive3
    ]);

    useEffect(() => {
      if (clippingPlane) {
        clippingPlane.constant = (clippingAxis === 'x' || clippingAxis === 'y' || clippingAxis === 'z') ? -clippingPosition : clippingPosition;
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
    }, [clippingPosition, clippingPlane, scene, clippingAxis]);


    // Patlatma faktörü değiştiğinde patlatılmış parçaları güncelle
    // Only update exploded positions when explosion factor changes significantly
    
    useEffect(() => {
      // Only update if explosion factor has changed significantly
      if (Math.abs(explosionFactor - prevExplosionFactorRef.current) > 0.005) {
        updateExplodedView();
        prevExplosionFactorRef.current = explosionFactor;
      }
      
      // When explosion factor changes, we should also update the positions of meshes
      // if we're in exploded view mode
      if (isExplodedView && groupRef.current) {
        groupRef.current.traverse((child) => {
          if (child.isMesh && child.userData.collapsedPosition && child.userData.explodedPosition) {
            // Interpolate between collapsed and exploded positions based on current transition
            child.position.lerpVectors(
              child.userData.collapsedPosition,
              child.userData.explodedPosition,
              explodedTransition
            );
          }
        });
      }
    }, [explosionFactor, isExplodedView, explodedTransition, groupRef.current, updateExplodedView]);
    
    // Handle exploded view transition animation
    useEffect(() => {
      // Set target transition value
      const targetTransition = isExplodedView ? 1 : 0;
      
      // For immediate transition (when switching modes), set directly
      // This useEffect is primarily for handling state changes, animation is handled in useFrame
    }, [isExplodedView]);
    
    // Easing function for smooth animation
    const easeInOutCubic = (t) => {
      return t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;
    };
    
    // Animate transition between collapsed and exploded states
    useFrame((state, delta) => {
      // Only animate if we're transitioning
      const targetTransition = isExplodedView ? 1 : 0;
      
      // Check if we need to animate (if we haven't reached the target)
      if (Math.abs(explodedTransition - targetTransition) > 0.001) {
        // Use delta time for frame-rate independent animation
        // This ensures smooth animation regardless of frame rate
        const speed = 0.8; // Much slower animation speed for ultra-smooth cinematic effect
        const step = speed * delta;
        
        // Update transition value
        let newTransition;
        if (targetTransition === 1) {
          newTransition = Math.min(1, explodedTransition + step);
        } else {
          newTransition = Math.max(0, explodedTransition - step);
        }
        
        // Apply easing function for more natural movement
        const easedTransition = easeInOutCubic(newTransition);
        
        setExplodedTransition(newTransition);
        
        // Update positions of all meshes with easing
        if (groupRef.current) {
          groupRef.current.traverse((child) => {
            if (child.isMesh && child.userData.collapsedPosition && child.userData.explodedPosition) {
              // Interpolate between collapsed and exploded positions with easing
              child.position.lerpVectors(
                child.userData.collapsedPosition,
                child.userData.explodedPosition,
                easedTransition
              );
            }
          });
        }
      } else if (Math.abs(explodedTransition - targetTransition) > 0.001) {
        // Snap to exact target value if we're very close
        setExplodedTransition(targetTransition);
        
        // Set final positions
        if (groupRef.current) {
          groupRef.current.traverse((child) => {
            if (child.isMesh && child.userData.collapsedPosition && child.userData.explodedPosition) {
              if (targetTransition === 1) {
                child.position.copy(child.userData.explodedPosition);
              } else {
                child.position.copy(child.userData.collapsedPosition);
              }
            }
          });
        }
      }
    });

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

        // Isolation visibility is computed per-mesh below

        meshes.forEach(mesh => {
          // Compute isolation visibility per mesh
          let isVisibleInIsolation = true;
          if (isIsolated) {
            const asmKey = (selectedAssemblyKeyRef.current || '').toLowerCase();
            const rootAsm = (mainAssemblyKeyRef.current || '').toLowerCase();
            if (asmKey) {
              // If root assembly selected, show everything (do not filter down)
              if (rootAsm && asmKey === rootAsm) {
                isVisibleInIsolation = true;
              } else {
                const meshAsm = (mesh.userData?.assemblyId || '').toLowerCase();
                isVisibleInIsolation = (rootAsm && asmKey === rootAsm) ? true : (!!meshAsm && meshAsm === asmKey);
              }
            } else if (internalSelectedPart) {
              // Fallback: same parent-group isolation for single-part selection
              let selectedParentName = null;
              const selectedMeshes = partGroupsRef.current[internalSelectedPart];
              if (selectedMeshes && selectedMeshes.length > 0) {
                selectedParentName = selectedMeshes[0].parent ? selectedMeshes[0].parent.name : internalSelectedPart;
              }
              const currentParentName = mesh.parent ? mesh.parent.name : name;
              isVisibleInIsolation = (name === internalSelectedPart) || (selectedParentName && currentParentName === selectedParentName);
            } else {
              // No assembly and no part selection -> show all
              isVisibleInIsolation = true;
            }
          }

          mesh.visible = !isHiddenByApp && isVisibleInIsolation;
          mesh.userData.selectable = mesh.visible;
          mesh.raycast = mesh.visible ? THREE.Mesh.prototype.raycast : () => false; // Performans için

          if (mesh.visible) {
            let isSelectedForColoring = false;
            let isHoveredForColoring = name === hoveredPart;

            // Assembly-level highlight overrides any single-part/groupPaint logic
            const asmKey = (selectedAssemblyKeyRef.current || '').toLowerCase();
            const rootAsm = (mainAssemblyKeyRef.current || '').toLowerCase();
            if (asmKey) {
              const meshAsm = (mesh.userData?.assemblyId || '').toLowerCase();
              isSelectedForColoring = (rootAsm && asmKey === rootAsm) ? true : (!!meshAsm && meshAsm === asmKey);
            } else if (internalSelectedPart) {
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

            // If selected belongs to a fastener set, co-highlight its set members
            try {
              const sel = selectedMeshRef.current;
              if (sel) {
                const selSetId = meshToFastenerSetRef.current.get(sel.uuid);
                if (selSetId && meshToFastenerSetRef.current.get(mesh.uuid) === selSetId) {
                  isSelectedForColoring = true;
                }
              }
            } catch {}

            // Override by assembly state: missing > removed > tightened
            const st = partAsmStatesRef.current[name] || null;
            if (st && (st.missing || st.removed || st.montajDurumu === 'tightened')) {
              if (st.missing) {
                mesh.material.color.set('#e74c3c'); // red
                mesh.material.transparent = true; mesh.material.opacity = 0.95;
              } else if (st.removed) {
                mesh.material.color.set('#6c5ce7'); // purple
                mesh.material.transparent = true; mesh.material.opacity = 0.6;
              } else if (st.montajDurumu === 'tightened') {
                mesh.material.color.set('#2ecc71'); // green
                mesh.material.transparent = false; mesh.material.opacity = 1.0;
              }
            } else if (isHoveredForColoring) {
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

    // Torque animation ticker: advance highlighted segment periodically
    useFrame((_, delta) => {
      try {
        if (!showTorqueViz || !internalSelectedPart) return;
        const pattern = (torquePatterns || []).find(p => (p.partName || '') === (internalSelectedPart || ''));
        if (!pattern || !pattern.spec || pattern.spec.length === 0) return;
        const rows = [...(pattern.spec || [])]
          .filter(r => (torqueStageFilter === 'all') || String(r.stage || 1) === String(torqueStageFilter))
          .sort((a, b) => (a.stage - b.stage) || (a.sequenceIndex - b.sequenceIndex));
        if (rows.length === 0) return;

        torqueAnimRef.current.acc = (torqueAnimRef.current.acc || 0) + (delta || 0);
        const stepSeconds = 1.0; // time per highlight
        if (torqueAnimRef.current.acc >= stepSeconds) {
          torqueAnimRef.current.acc = 0;
          setTorqueAnimIdx(prev => (prev + 1) % rows.length);
        }
      } catch {}
    });

    const hideSelectedPart = () => {
          if (internalSelectedPart) {
            setRedoHiddenPartsHistory([]); // yeni gizlemede redo temizle
            setHiddenPartsHistory(prev => [...prev, [...hiddenParts]]);
            setHiddenParts(prev => [...prev, internalSelectedPart]);
          }
        };

    const undoHide = () => {
      if (hiddenPartsHistory.length > 0) {
        setRedoHiddenPartsHistory(prev => [...prev, [...hiddenParts]]);
        const lastState = hiddenPartsHistory[hiddenPartsHistory.length - 1];
        setHiddenParts(lastState);
        setHiddenPartsHistory(prev => prev.slice(0, -1));
      }
    };

    const showAllParts = () => {
      if (hiddenParts.length > 0) {
        setHiddenPartsHistory(prev => [...prev, [...hiddenParts]]);
        setHiddenParts([]);
        setRedoHiddenPartsHistory([]); // tümünü gösterince redo sıfırla
      }
    };


    // Kesit dahil/hariç seçim yardımcıları
    const addSelectedToClipSelection = () => {
      if (!internalSelectedPart) return;
      setClipSelection(prev => (prev.includes(internalSelectedPart) ? prev : [...prev, internalSelectedPart]));
    };
    const removeSelectedFromClipSelection = () => {
      if (!internalSelectedPart) return;
      setClipSelection(prev => prev.filter(n => n !== internalSelectedPart));
    };
    const clearClipSelection = () => {
      setClipSelection([]);
    };

    const toggleClippingPlane = (axis) => {
      if (isClippingActive && clippingAxis === axis) {
        resetClipping();
        return;
      }
      setClippingAxis(axis);
      const initPos = (axis === 'x' || axis === 'y' || axis === 'z') ? ((modelCenter[axis] ?? 0)) : 0;
      setClippingPosition(initPos);
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
      plane.constant = (axis === 'x' || axis === 'y' || axis === 'z') ? -initPos : 0;
      
      setClippingPlane(plane);
      setIsClippingActive(true);
      setCapVisible(true);
      applyClippingToAllMaterials(plane);
      updateClippingPlanePosition(axis, initPos);
      setClippingPlaneVisible(true);
      setShowClippingControls(true);
    };

    // Secondary clipping plane (Kesit 2)
    const toggleClippingPlane2 = (axis) => {
      if (isClippingActive2 && clippingAxis2 === axis) {
        // turn off
        setIsClippingActive2(false);
        setClippingPlane2(null);
        // Also ensure Kesit 3 is off when Kesit 2 is turned off
        setIsClippingActive3(false);
        setClippingPlane3(null);
        applyClippingToAllMaterials(clippingPlane);
        return;
      }
      // turn on or switch axis
      setClippingAxis2(axis);
      const plane = new THREE.Plane();
      if (axis === 'x') plane.normal.set(1, 0, 0);
      else if (axis === 'y') plane.normal.set(0, 1, 0);
      else plane.normal.set(0, 0, 1);
      const init2 = (clippingPosition2 || (modelCenter[axis] || 0));
      plane.constant = (axis === 'x' || axis === 'y' || axis === 'z') ? -init2 : 0;
      setClippingPosition2(init2);
      setClippingPlane2(plane);
      setIsClippingActive2(true);
      applyClippingToAllMaterials(clippingPlane);
    };

    // Tertiary clipping plane (Kesit 3)
    const toggleClippingPlane3 = (axis) => {
      if (isClippingActive3 && clippingAxis3 === axis) {
        // turn off
        setIsClippingActive3(false);
        setClippingPlane3(null);
        applyClippingToAllMaterials(clippingPlane);
        return;
      }
      // turn on or switch axis
      setClippingAxis3(axis);
      const plane = new THREE.Plane();
      if (axis === 'x') plane.normal.set(1, 0, 0);
      else if (axis === 'y') plane.normal.set(0, 1, 0);
      else plane.normal.set(0, 0, 1);
      const init3 = (clippingPosition3 || (modelCenter[axis] || 0));
      plane.constant = (axis === 'x' || axis === 'y' || axis === 'z') ? -init3 : 0;
      setClippingPosition3(init3);
      setClippingPlane3(plane);
      setIsClippingActive3(true);
      applyClippingToAllMaterials(clippingPlane);
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
      // Also clear secondary and tertiary planes
      setIsClippingActive2(false);
      setClippingPlane2(null);
      setIsClippingActive3(false);
      setClippingPlane3(null);
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
        clippingPlane.constant = (clippingAxis === 'x' || clippingAxis === 'y' || clippingAxis === 'z') ? -newPosition : newPosition;
        
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

        <Environment preset="studio" intensity={0.95} />

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
                // Scene click clears any assembly group selection
                selectedAssemblyKeyRef.current = null;

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
        
        {/* Weld Map overlay removed as requested */}

        {/* Assembly Step overlay */}
        {(stepsForPart.length > 0) && (() => {
          try {
            const st = stepsForPart[Math.min(currentStepIdx, Math.max(stepsForPart.length - 1, 0))];
            if (!st) return null;
            // Position near selected mesh center
            let center = new THREE.Vector3();
            try {
              const m = selectedMeshRef.current || (internalSelectedPart ? meshRefs.current[internalSelectedPart] : null);
              const box = m ? new THREE.Box3().setFromObject(m) : (groupRef.current ? new THREE.Box3().setFromObject(groupRef.current) : null);
              if (box) {
                center = box.getCenter(new THREE.Vector3());
                center.y = box.max.y + 0.12;
              }
            } catch {}
            return (
              <Html position={[center.x, center.y, center.z]} occlude>
                <div
                  style={{
                    background: 'rgba(0,0,0,0.80)',
                    color: '#fff',
                    padding: 10,
                    borderRadius: 8,
                    minWidth: 260,
                    maxWidth: 360
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ fontWeight: 'bold' }}>
                      Adım {(currentStepIdx + 1)}/{stepsForPart.length}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.9 }}>
                      {st.status === 'done' ? 'Tamamlandı' : (st.status === 'in_progress' ? 'Devam ediyor' : 'Beklemede')}
                    </div>
                  </div>
                  <div style={{ marginTop: 6 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{st.title || 'Adım'}</div>
                    {st.description && <div style={{ fontSize: 12, color: '#ddd', marginTop: 4 }}>{st.description}</div>}
                    {!!(st.checklist && st.checklist.length) && (
                      <div style={{ fontSize: 12, color: '#ddd', marginTop: 6 }}>
                        Checklist: {(st.checklist.filter(c => c.done).length)}/{st.checklist.length}
                      </div>
                    )}
                    {st.torquePatternId && (
                      <div style={{ fontSize: 12, color: '#ddd', marginTop: 4 }}>
                        Tork Deseni: {String(st.torquePatternId)}
                      </div>
                    )}
                  </div>
                  <div style={{ marginTop: 8, display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    {(st.status !== 'in_progress' && st.status !== 'done') && (
                      <button
                        className="ribbon-button"
                        onClick={() => updateAssemblyStep(st.id, { status: 'in_progress', startedAt: Date.now() })}
                        title="Adımı başlat"
                      >
                        Başlat
                      </button>
                    )}
                    {st.status !== 'done' && (
                      <button
                        className="ribbon-button"
                        onClick={() => { updateAssemblyStep(st.id, { status: 'done', finishedAt: Date.now() }); onNextStep(); }}
                        title="Adımı tamamla ve sonraki adıma geç"
                      >
                        Tamamla ▶
                      </button>
                    )}
                  </div>
                </div>
              </Html>
            );
          } catch { return null; }
        })()}

        {/* Torque Pattern overlay */}
        {showTorqueViz && internalSelectedPart && (() => {
          try {
            const pattern = (torquePatterns || []).find(p => (p.partName || '') === (internalSelectedPart || ''));
            if (!pattern || !pattern.spec || pattern.spec.length === 0) return null;

            const rows = [...(pattern.spec || [])]
              .filter(r => (torqueStageFilter === 'all') || String(r.stage || 1) === String(torqueStageFilter))
              .sort((a, b) => (a.stage - b.stage) || (a.sequenceIndex - b.sequenceIndex));

            if (rows.length === 0) return null;

            let center = new THREE.Vector3();
            let radius = 0.3;
            try {
              const m = selectedMeshRef.current || (internalSelectedPart ? meshRefs.current[internalSelectedPart] : null);
              const box = m ? new THREE.Box3().setFromObject(m) : (groupRef.current ? new THREE.Box3().setFromObject(groupRef.current) : null);
              if (box) {
                center = box.getCenter(new THREE.Vector3()).clone();
                const size = box.getSize(new THREE.Vector3());
                radius = Math.max(0.05, Math.min((size.length() || 1) * 0.15, 1.0));
                center.y = box.max.y + Math.max(0.03, size.y * 0.05);
              }
            } catch {}

            const uniqueBolts = [];
            rows.forEach(r => { if (r.boltId && !uniqueBolts.includes(r.boltId)) uniqueBolts.push(r.boltId); });
            if (uniqueBolts.length === 0) return null;

            const posForBolt = (boltId, idx) => {
              const i = idx >= 0 ? idx : uniqueBolts.indexOf(boltId);
              const n = Math.max(uniqueBolts.length, 1);
              const theta = (i / n) * Math.PI * 2;
              const x = center.x + radius * Math.cos(theta);
              const z = center.z + radius * Math.sin(theta);
              const y = center.y;
              return new THREE.Vector3(x, y, z);
            };

            const points = rows.map(r => posForBolt(r.boltId, uniqueBolts.indexOf(r.boltId)));
            const stage = rows[0]?.stage || 1;
            const color = stage === 1 ? '#1abc9c' : (stage === 2 ? '#e67e22' : '#9b59b6');
            // Active pair for animated highlight
            const activeIdx = Math.min(torqueAnimIdx, rows.length - 1);
            const pA = posForBolt(rows[activeIdx].boltId, uniqueBolts.indexOf(rows[activeIdx].boltId));
            const pB = posForBolt(rows[(activeIdx + 1) % rows.length].boltId, uniqueBolts.indexOf(rows[(activeIdx + 1) % rows.length].boltId));

            return (
              <group key={`torque-viz-${internalSelectedPart}-${stage}`}>
                {points.length >= 2 && (
                  <>
                    <Line points={points} color={color} lineWidth={2} />
                    {/* Highlight current segment */}
                    <Line points={[pA, pB]} color="#f1c40f" lineWidth={4} />
                  </>
                )}
                {rows.map((r, i) => {
                  const p = posForBolt(r.boltId, uniqueBolts.indexOf(r.boltId));
                  const isActive = i === activeIdx;
                  return (
                    <group key={`bolt-${i}`} position={p}>
                      <mesh>
                        <sphereGeometry args={[isActive ? 0.02 : 0.015, 12, 12]} />
                        <meshBasicMaterial color={isActive ? '#f1c40f' : color} />
                      </mesh>
                      <Text position={[0, 0.04, 0]} fontSize={isActive ? 0.095 : 0.08} color={isActive ? '#111' : '#333'} anchorX="center" anchorY="middle" backgroundColor="#ffffff" padding={0.02}>
                        {String(r.sequenceIndex ?? (i + 1))}
                      </Text>
                    </group>
                  );
                })}
        {/* Fastener set info near current selection */}
        {(() => {
          try {
            const sel = selectedMeshRef.current;
            if (!sel) return null;
            const setId = meshToFastenerSetRef.current.get(sel.uuid);
            if (!setId) return null;
            const set = fastenerSetByIdRef.current.get(setId);
            if (!set) return null;

            let center = new THREE.Vector3();
            try {
              const box = new THREE.Box3().setFromObject(sel);
              if (box) {
                center = box.getCenter(new THREE.Vector3());
                center.y = box.max.y + 0.12;
              }
            } catch {}

            const hasWasher = !!set.members.washer;
            const hasNut = !!set.members.nut;

            return (
              <Html position={[center.x, center.y, center.z]} occlude>
                <div style={{
                  background: 'rgba(0,0,0,0.85)',
                  color: '#fff',
                  padding: 10,
                  borderRadius: 8,
                  fontSize: 12,
                  minWidth: 240,
                  maxWidth: 360,
                  boxShadow: '0 6px 16px rgba(0,0,0,0.35)'
                }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>{set.label}</div>
                  <div>• Cıvata: <span style={{ color: '#7fdb6a' }}>{set.members.bolt?.name || '-'}</span></div>
                  <div>• Rondela: <span style={{ color: hasWasher ? '#7fdb6a' : '#e74c3c' }}>{set.members.washer?.name || 'Eksik'}</span></div>
                  <div>• Somun: <span style={{ color: hasNut ? '#7fdb6a' : '#e74c3c' }}>{set.members.nut?.name || 'Eksik'}</span></div>
                </div>
              </Html>
            );
          } catch {
            return null;
          }
        })()}

              </group>
            );
          } catch { return null; }
        })()}

        {/* Ölçüm noktaları: UI isteğiyle kaldırıldı */}
        
        {/* Hover yapılan ölçüm noktası: UI isteğiyle kaldırıldı */}
        
        {/* Ölçüm çizgileri + lider ve uçta kutu */}
        {measurementVisible && measureResult && measureResult.type === 'distance' && (() => {
          try {
            const p0 = measureResult.points[0].clone();
            const p1 = measureResult.points[1].clone();

            const seg = p1.clone().sub(p0);
            const segLen = Math.max(seg.length(), 1e-6);
            const segDir = seg.clone().divideScalar(segLen);

            const camDir = new THREE.Vector3();
            if (camera && camera.getWorldDirection) camera.getWorldDirection(camDir);
            let n = new THREE.Vector3().crossVectors(segDir, camDir).normalize();
            if (n.lengthSq() < 1e-6) {
              // Kamera doğrultusu segmente paralelse dünya up ile yedekle
              n = new THREE.Vector3().crossVectors(segDir, new THREE.Vector3(0, 1, 0)).normalize();
              if (n.lengthSq() < 1e-6) n = new THREE.Vector3(1, 0, 0); // son çare
            }
            const leaderDir = new THREE.Vector3().crossVectors(n, segDir).normalize();

            const modelDiag = Math.sqrt(
              Math.max(1e-6, (modelSize.x || 0) ** 2 + (modelSize.y || 0) ** 2 + (modelSize.z || 0) ** 2)
            );
            const leaderLen = Math.min(
              Math.max(modelDiag * 0.03, 0.08), // alt sınır
              Math.max(0.12, segLen * 0.3)      // üst sınır
            );

            const leaderStart = p1.clone();
            const leaderEnd = leaderStart.clone().add(leaderDir.multiplyScalar(leaderLen));

            const display = formatLength(measureResult.raw ?? 0);

            return (
              <group>
                {/* Ana ölçü çizgisi */}
                <Line points={[p0, p1]} color="#ff0000" lineWidth={2} />
                {/* Lider (çubuk) */}
                <Line points={[leaderStart, leaderEnd]} color="#ff0000" lineWidth={2} />
                {/* Uçta küçük kutu */}
                <Html position={[leaderEnd.x, leaderEnd.y, leaderEnd.z]} occlude center>
                  <div style={{
                    background: '#ffffff',
                    border: '1px solid #333',
                    borderRadius: 4,
                    padding: '4px 6px',
                    fontSize: 12,
                    color: '#111',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
                    whiteSpace: 'nowrap'
                  }}>
                    {display}
                  </div>
                </Html>
              </group>
            );
          } catch {
            return null;
          }
        })()}
        
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
              {`R: ${formatLength(measureResult.raw ?? 0)} • D: ${formatLength((measureResult.raw ?? 0) * 2)}`}
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
            visible={capVisible && isClippingActive}
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
              color={capColor}
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


