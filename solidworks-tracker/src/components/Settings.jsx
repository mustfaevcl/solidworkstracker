import React, { useEffect, useMemo, useState, useRef } from 'react';

const STORAGE_KEY = 'gmm_settings_v1';

const defaultSettings = {
  ui: {
    darkMode: false,
    bigButtons: false,
    language: 'tr',
    themeColor: '#3498db'
  },
  // Görünüm ile ilgili basit tercihler
  viewer: {
    defaultViewMode: 'normal', // normal | wireframe | xray
    showEdges: false,
    invertZoom: true // legacy alan (interaction.invertZoom ile birlikte kullanılabilir)
  },
  // İleri düzey kontrol ve etkileşim
  controls: {
    enableDamping: true,
    dampingFactor: 0.1,
    rotateSpeed: 0.7,
    zoomSpeed: 1.2,
    panSpeed: 0.8,
    enableRotate: true,
    enableZoom: true,
    enablePan: true,
    screenSpacePanning: false,
    minDistance: 0.1,
    maxDistance: 100,
    minPolarAngle: 0,
    maxPolarAngle: Math.PI,
    minAzimuthAngle: -Infinity,
    maxAzimuthAngle: Infinity,
    autoRotate: false,
    autoRotateSpeed: 0.5,
    doubleClickFocus: true
  },
  interaction: {
    invertZoom: true, // yeni alan
    clickToSelect: true,
    hoverHighlight: true,
    hoverThrottleMs: 50,
    clickDebounceMs: 120,
    selectionColor: '#ffff00',
    hoverColor: '#00ffff',
    contextMenu: true,
    doubleClickToZoomToFit: true,
    clickFocusCamera: false
  },
  // Performans ve renderer ayarları
  performance: {
    antialias: true,
    msaaSamples: 0, // 0 = varsayılan; WebGL2/MSAA destekliyse 4/8 gibi değerlere set edilebilir
    dynamicDpr: true,
    dprMin: 1,
    dprMax: 2,
    powerPreference: 'high-performance', // default | high-performance | low-power
    precision: 'highp', // mediump | highp
    physicallyCorrectLights: true,
    outputColorSpace: 'srgb', // srgb | displayp3 (uyumlu cihazlarda)
    toneMapping: 'aces', // none | linear | reinhard | cineon | aces
    toneMappingExposure: 0.9,
    shadowMapEnabled: true,
    shadowMapType: 'pcfsoft', // basic | pcf | pcfsoft | vsm (uygulamada destek durumuna göre)
    rendererLogarithmicDepthBuffer: false,
    alpha: false,
    depth: true,
    stencil: false,
    preserveDrawingBuffer: false,
    backgroundColor: '#ffffff'
  },
  // Efektler (UI tarafında toggle, uygulamada ileride bağlanabilir)
  effects: {
    fxaa: false,
    ssao: false,
    bloom: false,
    bloomStrength: 0.6,
    bloomRadius: 0.4,
    bloomThreshold: 0.85
  },
  model: {
    defaultModelUrl: ''
  },
  privacy: {
    analytics: false,
    offlineEnabled: true
  }
};

function deepMerge(target, src) {
  if (!src || typeof src !== 'object') return target;
  for (const k of Object.keys(src)) {
    if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k])) {
      target[k] = deepMerge(target[k] ? { ...target[k] } : {}, src[k]);
    } else {
      target[k] = src[k];
    }
  }
  return target;
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaultSettings };
    const parsed = JSON.parse(raw);
    // Legacy uyumluluğu: viewer.invertZoom varsa interaction.invertZoom'a taşımaya çalış
    if (parsed?.viewer?.invertZoom && !parsed?.interaction?.invertZoom) {
      parsed.interaction = parsed.interaction || {};
      parsed.interaction.invertZoom = !!parsed.viewer.invertZoom;
    }
    return deepMerge({ ...defaultSettings }, parsed);
  } catch {
    return { ...defaultSettings };
  }
}

function saveSettings(s) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}

export default function Settings({ onBack, applyDarkMode, applyBigButtons }) {
  const [settings, setSettings] = useState(() => loadSettings());
  const [activeTab, setActiveTab] = useState('genel'); // genel | gorunum | controls | viewer | performance | effects | dil | model | veri | kisayol | gelismis
  const fileInputRef = useRef(null);
  const [savedToast, setSavedToast] = useState('');

  // toast auto hide
  useEffect(() => {
    if (!savedToast) return;
    const t = setTimeout(() => setSavedToast(''), 1800);
    return () => clearTimeout(t);
  }, [savedToast]);

  const setUi = (patch) => setSettings(prev => ({ ...prev, ui: { ...prev.ui, ...patch } }));
  const setViewer = (patch) => setSettings(prev => ({ ...prev, viewer: { ...prev.viewer, ...patch } }));
  const setControls = (patch) => setSettings(prev => ({ ...prev, controls: { ...prev.controls, ...patch } }));
  const setInteraction = (patch) => setSettings(prev => ({ ...prev, interaction: { ...prev.interaction, ...patch } }));
  const setPerformance = (patch) => setSettings(prev => ({ ...prev, performance: { ...prev.performance, ...patch } }));
  const setEffects = (patch) => setSettings(prev => ({ ...prev, effects: { ...prev.effects, ...patch } }));
  const setModel = (patch) => setSettings(prev => ({ ...prev, model: { ...prev.model, ...patch } }));
  const setPrivacy = (patch) => setSettings(prev => ({ ...prev, privacy: { ...prev.privacy, ...patch } }));

  const handleSave = () => {
    if (saveSettings(settings)) {
      // Apply immediate UI preferences if provided
      try { if (applyDarkMode) applyDarkMode(!!settings.ui.darkMode); } catch {}
      try { if (applyBigButtons) applyBigButtons(!!settings.ui.bigButtons); } catch {}
      setSavedToast('Ayarlar kaydedildi');
    } else {
      setSavedToast('Kaydetme hatası');
    }
  };

  const handleApplyNow = () => {
    // Apply a subset immediately without forcing save
    try { if (applyDarkMode) applyDarkMode(!!settings.ui.darkMode); } catch {}
    try { if (applyBigButtons) applyBigButtons(!!settings.ui.bigButtons); } catch {}
    setSavedToast('Uygulandı');
  };

  const handleReset = () => {
    setSettings({ ...defaultSettings });
    setSavedToast('Varsayılanlara döndürüldü (Kaydet ile kalıcı olur)');
  };

  const handleExport = () => {
    try {
      const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'gmm-settings.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch {}
  };

  const handleImportClick = () => fileInputRef.current?.click();

  const handleImport = (e) => {
    try {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const json = JSON.parse(ev.target.result);
          setSettings(prev => deepMerge({ ...prev }, json));
          setSavedToast('Ayarlar içe aktarıldı (Kaydet ile kalıcı olur)');
        } catch {
          setSavedToast('JSON okunamadı');
        }
      };
      reader.readAsText(file);
    } catch {
      setSavedToast('İçe aktarma hatası');
    } finally {
      e.target.value = '';
    }
  };

  const Section = ({ title, children, actions }) => (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <h3 style={cardTitleStyle}>{title}</h3>
        {actions}
      </div>
      <div>{children}</div>
    </div>
  );

  const tabs = [
    { id: 'genel', label: 'Genel' },
    { id: 'gorunum', label: 'Görünüm' },
    { id: 'controls', label: 'Fare & Kontroller' },
    { id: 'viewer', label: '3B Görüntüleyici' },
    { id: 'performance', label: 'Performans' },
    { id: 'effects', label: 'Efektler' },
    { id: 'dil', label: 'Dil ve Yerelleştirme' },
    { id: 'model', label: 'Model' },
    { id: 'veri', label: 'Veri / İçe-Dışa Aktarım' },
    { id: 'kisayol', label: 'Kısayollar' },
    { id: 'gelismis', label: 'Gelişmiş' }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#f5f7fb' }}>
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid #e6e6e6', background: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={onBack}
            title="Geri"
            style={topButtonStyle}
          >
            ⬅ Geri
          </button>
          <h2 style={{ margin: 0, color: '#2c3e50' }}>Ayarlar</h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={handleApplyNow} style={topButtonStyle} title="Anında uygula">Uygula</button>
          <button onClick={handleSave} style={{ ...topButtonStyle, background: '#2ecc71', color: '#fff', borderColor: '#27ae60' }} title="Kaydet">Kaydet</button>
        </div>
      </div>

      {/* Content */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left nav */}
        <div style={{ width: 220, borderRight: '1px solid #e6e6e6', background: '#fff', padding: 8, overflowY: 'auto' }}>
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '10px 12px',
                marginBottom: 6,
                borderRadius: 6,
                border: '1px solid ' + (activeTab === t.id ? '#3498db' : '#e0e0e0'),
                background: activeTab === t.id ? '#eaf3ff' : '#fff',
                color: activeTab === t.id ? '#2c3e50' : '#555',
                cursor: 'pointer'
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Right pane */}
        <div style={{ flex: 1, padding: 16, overflowY: 'auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Genel */}
          {activeTab === 'genel' && (
            <>
              <Section title="Kullanıcı Arayüzü">
                <div style={gridFormStyle}>
                  <label style={labelStyle}>
                    <input
                      type="checkbox"
                      checked={!!settings.ui.darkMode}
                      onChange={(e) => setUi({ darkMode: e.target.checked })}
                    />
                    Koyu Tema
                  </label>
                  <label style={labelStyle}>
                    <input
                      type="checkbox"
                      checked={!!settings.ui.bigButtons}
                      onChange={(e) => setUi({ bigButtons: e.target.checked })}
                    />
                    Büyük Butonlar
                  </label>
                  <label style={labelColStyle}>
                    Tema Rengi
                    <input
                      type="color"
                      value={settings.ui.themeColor || '#3498db'}
                      onChange={(e) => setUi({ themeColor: e.target.value })}
                      style={inputStyle}
                    />
                  </label>
                </div>
              </Section>

              <Section title="Gizlilik ve Çevrimdışı">
                <div style={gridFormStyle}>
                  <label style={labelStyle}>
                    <input
                      type="checkbox"
                      checked={!!settings.privacy.analytics}
                      onChange={(e) => setPrivacy({ analytics: e.target.checked })}
                    />
                    Temel kullanım analitiği
                  </label>
                  <label style={labelStyle}>
                    <input
                      type="checkbox"
                      checked={!!settings.privacy.offlineEnabled}
                      onChange={(e) => setPrivacy({ offlineEnabled: e.target.checked })}
                    />
                    Çevrimdışı mod (mümkünse yerel kuyruk)
                  </label>
                </div>
              </Section>
            </>
          )}

          {/* Görünüm */}
          {activeTab === 'gorunum' && (
            <>
              <Section title="Varsayılan Görünüm Modu">
                <div style={gridFormStyle}>
                  <label style={labelColStyle}>
                    Mod
                    <select
                      value={settings.viewer.defaultViewMode || 'normal'}
                      onChange={(e) => setViewer({ defaultViewMode: e.target.value })}
                      style={inputStyle}
                    >
                      <option value="normal">Normal</option>
                      <option value="wireframe">Wireframe</option>
                      <option value="xray">X-Ray</option>
                    </select>
                  </label>
                  <label style={labelStyle}>
                    <input
                      type="checkbox"
                      checked={!!settings.viewer.showEdges}
                      onChange={(e) => setViewer({ showEdges: e.target.checked })}
                    />
                    Kenar çizgilerini göster (varsayılan)
                  </label>
                </div>
              </Section>
            </>
          )}

          {/* Fare & Kontroller */}
          {activeTab === 'controls' && (
            <>
              <Section title="OrbitControls">
                <div style={gridFormStyle}>
                  <label style={labelStyle}>
                    <input
                      type="checkbox"
                      checked={!!settings.controls.enableDamping}
                      onChange={(e) => setControls({ enableDamping: e.target.checked })}
                    />
                    Sönümlemeyi etkinleştir
                  </label>
                  <label style={labelColStyle}>
                    Sönümleme Faktörü
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="1"
                      value={settings.controls.dampingFactor ?? 0.1}
                      onChange={(e) => setControls({ dampingFactor: parseFloat(e.target.value || '0.1') })}
                      style={inputStyle}
                    />
                  </label>

                  <label style={labelColStyle}>
                    Döndürme Hızı
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={settings.controls.rotateSpeed ?? 0.7}
                      onChange={(e) => setControls({ rotateSpeed: parseFloat(e.target.value || '0.7') })}
                      style={inputStyle}
                    />
                  </label>
                  <label style={labelColStyle}>
                    Zoom Hızı
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={settings.controls.zoomSpeed ?? 1.2}
                      onChange={(e) => setControls({ zoomSpeed: parseFloat(e.target.value || '1.2') })}
                      style={inputStyle}
                    />
                  </label>
                  <label style={labelColStyle}>
                    Pan Hızı
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={settings.controls.panSpeed ?? 0.8}
                      onChange={(e) => setControls({ panSpeed: parseFloat(e.target.value || '0.8') })}
                      style={inputStyle}
                    />
                  </label>

                  <label style={labelStyle}>
                    <input
                      type="checkbox"
                      checked={!!settings.controls.enableRotate}
                      onChange={(e) => setControls({ enableRotate: e.target.checked })}
                    />
                    Döndürmeyi etkinleştir
                  </label>
                  <label style={labelStyle}>
                    <input
                      type="checkbox"
                      checked={!!settings.controls.enableZoom}
                      onChange={(e) => setControls({ enableZoom: e.target.checked })}
                    />
                    Yakınlaştırmayı etkinleştir
                  </label>
                  <label style={labelStyle}>
                    <input
                      type="checkbox"
                      checked={!!settings.controls.enablePan}
                      onChange={(e) => setControls({ enablePan: e.target.checked })}
                    />
                    Pan'i etkinleştir
                  </label>
                  <label style={labelStyle}>
                    <input
                      type="checkbox"
                      checked={!!settings.controls.screenSpacePanning}
                      onChange={(e) => setControls({ screenSpacePanning: e.target.checked })}
                    />
                    Screen-space panning
                  </label>

                  <label style={labelColStyle}>
                    Min Mesafe
                    <input
                      type="number"
                      step="0.1"
                      min="0.01"
                      value={settings.controls.minDistance ?? 0.1}
                      onChange={(e) => setControls({ minDistance: parseFloat(e.target.value || '0.1') })}
                      style={inputStyle}
                    />
                  </label>
                  <label style={labelColStyle}>
                    Max Mesafe
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={settings.controls.maxDistance ?? 100}
                      onChange={(e) => setControls({ maxDistance: parseFloat(e.target.value || '100') })}
                      style={inputStyle}
                    />
                  </label>

                  <label style={labelColStyle}>
                    Min Polar Açı (rad)
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max={Math.PI}
                      value={settings.controls.minPolarAngle ?? 0}
                      onChange={(e) => setControls({ minPolarAngle: parseFloat(e.target.value || '0') })}
                      style={inputStyle}
                    />
                  </label>
                  <label style={labelColStyle}>
                    Max Polar Açı (rad)
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max={Math.PI}
                      value={settings.controls.maxPolarAngle ?? Math.PI}
                      onChange={(e) => setControls({ maxPolarAngle: parseFloat(e.target.value || String(Math.PI)) })}
                      style={inputStyle}
                    />
                  </label>

                  <label style={labelColStyle}>
                    Min Azimuth Açı (rad)
                    <input
                      type="number"
                      step="0.01"
                      value={Number.isFinite(settings.controls.minAzimuthAngle) ? settings.controls.minAzimuthAngle : -999}
                      onChange={(e) => setControls({ minAzimuthAngle: parseFloat(e.target.value || '-999') })}
                      style={inputStyle}
                    />
                  </label>
                  <label style={labelColStyle}>
                    Max Azimuth Açı (rad)
                    <input
                      type="number"
                      step="0.01"
                      value={Number.isFinite(settings.controls.maxAzimuthAngle) ? settings.controls.maxAzimuthAngle : 999}
                      onChange={(e) => setControls({ maxAzimuthAngle: parseFloat(e.target.value || '999') })}
                      style={inputStyle}
                    />
                  </label>

                  <label style={labelStyle}>
                    <input
                      type="checkbox"
                      checked={!!settings.controls.autoRotate}
                      onChange={(e) => setControls({ autoRotate: e.target.checked })}
                    />
                    Otomatik Döndür
                  </label>
                  <label style={labelColStyle}>
                    Auto-Rotate Hızı
                    <input
                      type="number"
                      step="0.05"
                      min="0"
                      value={settings.controls.autoRotateSpeed ?? 0.5}
                      onChange={(e) => setControls({ autoRotateSpeed: parseFloat(e.target.value || '0.5') })}
                      style={inputStyle}
                    />
                  </label>
                  <label style={labelStyle}>
                    <input
                      type="checkbox"
                      checked={!!settings.controls.doubleClickFocus}
                      onChange={(e) => setControls({ doubleClickFocus: e.target.checked })}
                    />
                    Çift tık ile hedefe odaklan
                  </label>
                </div>
              </Section>

              <Section title="Seçim ve Etkileşim">
                <div style={gridFormStyle}>
                  <label style={labelStyle}>
                    <input
                      type="checkbox"
                      checked={!!settings.interaction.invertZoom}
                      onChange={(e) => setInteraction({ invertZoom: e.target.checked })}
                    />
                    Yakınlaştırmayı tersine çevir
                  </label>
                  <label style={labelStyle}>
                    <input
                      type="checkbox"
                      checked={!!settings.interaction.clickToSelect}
                      onChange={(e) => setInteraction({ clickToSelect: e.target.checked })}
                    />
                    Tıklama ile seçim
                  </label>
                  <label style={labelStyle}>
                    <input
                      type="checkbox"
                      checked={!!settings.interaction.hoverHighlight}
                      onChange={(e) => setInteraction({ hoverHighlight: e.target.checked })}
                    />
                    Hover vurgusunu göster
                  </label>
                  <label style={labelColStyle}>
                    Hover Rengi
                    <input
                      type="color"
                      value={settings.interaction.hoverColor || '#00ffff'}
                      onChange={(e) => setInteraction({ hoverColor: e.target.value })}
                      style={inputStyle}
                    />
                  </label>
                  <label style={labelColStyle}>
                    Seçim Rengi
                    <input
                      type="color"
                      value={settings.interaction.selectionColor || '#ffff00'}
                      onChange={(e) => setInteraction({ selectionColor: e.target.value })}
                      style={inputStyle}
                    />
                  </label>
                  <label style={labelColStyle}>
                    Hover Throttle (ms)
                    <input
                      type="number"
                      min="0"
                      step="10"
                      value={settings.interaction.hoverThrottleMs ?? 50}
                      onChange={(e) => setInteraction({ hoverThrottleMs: parseInt(e.target.value || '50', 10) })}
                      style={inputStyle}
                    />
                  </label>
                  <label style={labelColStyle}>
                    Click Debounce (ms)
                    <input
                      type="number"
                      min="0"
                      step="10"
                      value={settings.interaction.clickDebounceMs ?? 120}
                      onChange={(e) => setInteraction({ clickDebounceMs: parseInt(e.target.value || '120', 10) })}
                      style={inputStyle}
                    />
                  </label>
                  <label style={labelStyle}>
                    <input
                      type="checkbox"
                      checked={!!settings.interaction.contextMenu}
                      onChange={(e) => setInteraction({ contextMenu: e.target.checked })}
                    />
                    Sağ tık menüsünü etkinleştir
                  </label>
                  <label style={labelStyle}>
                    <input
                      type="checkbox"
                      checked={!!settings.interaction.doubleClickToZoomToFit}
                      onChange={(e) => setInteraction({ doubleClickToZoomToFit: e.target.checked })}
                    />
                    Çift tık ile sığdır
                  </label>
                  <label style={labelStyle}>
                    <input
                      type="checkbox"
                      checked={!!settings.interaction.clickFocusCamera}
                      onChange={(e) => setInteraction({ clickFocusCamera: e.target.checked })}
                    />
                    Seçimde kamerayı odakla
                  </label>
                </div>
              </Section>
            </>
          )}

          {/* 3B Görüntüleyici */}
          {activeTab === 'viewer' && (
            <>
              <Section title="Görüntüleyici Ayarları">
                <div style={gridFormStyle}>
                  <label style={labelColStyle}>
                    Arkaplan Rengi
                    <input
                      type="color"
                      value={settings.performance.backgroundColor || '#ffffff'}
                      onChange={(e) => setPerformance({ backgroundColor: e.target.value })}
                      style={inputStyle}
                    />
                  </label>
                  <label style={labelStyle}>
                    <input
                      type="checkbox"
                      checked={!!settings.performance.physicallyCorrectLights}
                      onChange={(e) => setPerformance({ physicallyCorrectLights: e.target.checked })}
                    />
                    Fiziksel olarak doğru ışıklar
                  </label>
                  <label style={labelColStyle}>
                    Renk Uzayı
                    <select
                      value={settings.performance.outputColorSpace || 'srgb'}
                      onChange={(e) => setPerformance({ outputColorSpace: e.target.value })}
                      style={inputStyle}
                    >
                      <option value="srgb">sRGB</option>
                      <option value="displayp3">Display P3</option>
                    </select>
                  </label>
                  <label style={labelColStyle}>
                    Tone Mapping
                    <select
                      value={settings.performance.toneMapping || 'aces'}
                      onChange={(e) => setPerformance({ toneMapping: e.target.value })}
                      style={inputStyle}
                    >
                      <option value="none">None</option>
                      <option value="linear">Linear</option>
                      <option value="reinhard">Reinhard</option>
                      <option value="cineon">Cineon</option>
                      <option value="aces">ACES</option>
                    </select>
                  </label>
                  <label style={labelColStyle}>
                    Exposure
                    <input
                      type="number"
                      step="0.05"
                      min="0.1"
                      max="2"
                      value={settings.performance.toneMappingExposure ?? 0.9}
                      onChange={(e) => setPerformance({ toneMappingExposure: parseFloat(e.target.value || '0.9') })}
                      style={inputStyle}
                    />
                  </label>
                </div>
              </Section>
            </>
          )}

          {/* Performans */}
          {activeTab === 'performance' && (
            <>
              <Section title="Renderer & GPU">
                <div style={gridFormStyle}>
                  <label style={labelStyle}>
                    <input
                      type="checkbox"
                      checked={!!settings.performance.antialias}
                      onChange={(e) => setPerformance({ antialias: e.target.checked })}
                    />
                    Kenar yumuşatma (Antialias)
                  </label>
                  <label style={labelColStyle}>
                    MSAA (ör. 4)
                    <input
                      type="number"
                      step="1"
                      min="0"
                      max="8"
                      value={settings.performance.msaaSamples ?? 0}
                      onChange={(e) => setPerformance({ msaaSamples: parseInt(e.target.value || '0', 10) })}
                      style={inputStyle}
                    />
                  </label>
                  <label style={labelStyle}>
                    <input
                      type="checkbox"
                      checked={!!settings.performance.dynamicDpr}
                      onChange={(e) => setPerformance({ dynamicDpr: e.target.checked })}
                    />
                    Dinamik DPR
                  </label>
                  <label style={labelColStyle}>
                    DPR Min
                    <input
                      type="number"
                      step="0.1"
                      min="0.5"
                      max="2"
                      value={settings.performance.dprMin ?? 1}
                      onChange={(e) => setPerformance({ dprMin: parseFloat(e.target.value || '1') })}
                      style={inputStyle}
                    />
                  </label>
                  <label style={labelColStyle}>
                    DPR Max
                    <input
                      type="number"
                      step="0.1"
                      min="0.5"
                      max="3"
                      value={settings.performance.dprMax ?? 2}
                      onChange={(e) => setPerformance({ dprMax: parseFloat(e.target.value || '2') })}
                      style={inputStyle}
                    />
                  </label>
                  <label style={labelColStyle}>
                    powerPreference
                    <select
                      value={settings.performance.powerPreference || 'high-performance'}
                      onChange={(e) => setPerformance({ powerPreference: e.target.value })}
                      style={inputStyle}
                    >
                      <option value="default">default</option>
                      <option value="high-performance">high-performance</option>
                      <option value="low-power">low-power</option>
                    </select>
                  </label>
                  <label style={labelColStyle}>
                    precision
                    <select
                      value={settings.performance.precision || 'highp'}
                      onChange={(e) => setPerformance({ precision: e.target.value })}
                      style={inputStyle}
                    >
                      <option value="mediump">mediump</option>
                      <option value="highp">highp</option>
                    </select>
                  </label>
                </div>
              </Section>

              <Section title="Gölgeler & Derinlik">
                <div style={gridFormStyle}>
                  <label style={labelStyle}>
                    <input
                      type="checkbox"
                      checked={!!settings.performance.shadowMapEnabled}
                      onChange={(e) => setPerformance({ shadowMapEnabled: e.target.checked })}
                    />
                    ShadowMap aktif
                  </label>
                  <label style={labelColStyle}>
                    ShadowMap tipi
                    <select
                      value={settings.performance.shadowMapType || 'pcfsoft'}
                      onChange={(e) => setPerformance({ shadowMapType: e.target.value })}
                      style={inputStyle}
                    >
                      <option value="basic">basic</option>
                      <option value="pcf">pcf</option>
                      <option value="pcfsoft">pcfsoft</option>
                      <option value="vsm">vsm</option>
                    </select>
                  </label>
                  <label style={labelStyle}>
                    <input
                      type="checkbox"
                      checked={!!settings.performance.rendererLogarithmicDepthBuffer}
                      onChange={(e) => setPerformance({ rendererLogarithmicDepthBuffer: e.target.checked })}
                    />
                    Logarithmic Depth Buffer
                  </label>
                </div>
              </Section>

              <Section title="Çıkış ve Bellek">
                <div style={gridFormStyle}>
                  <label style={labelStyle}>
                    <input
                      type="checkbox"
                      checked={!!settings.performance.alpha}
                      onChange={(e) => setPerformance({ alpha: e.target.checked })}
                    />
                    Canvas alpha (şeffaflık)
                  </label>
                  <label style={labelStyle}>
                    <input
                      type="checkbox"
                      checked={!!settings.performance.depth}
                      onChange={(e) => setPerformance({ depth: e.target.checked })}
                    />
                    Depth buffer
                  </label>
                  <label style={labelStyle}>
                    <input
                      type="checkbox"
                      checked={!!settings.performance.stencil}
                      onChange={(e) => setPerformance({ stencil: e.target.checked })}
                    />
                    Stencil buffer
                  </label>
                  <label style={labelStyle}>
                    <input
                      type="checkbox"
                      checked={!!settings.performance.preserveDrawingBuffer}
                      onChange={(e) => setPerformance({ preserveDrawingBuffer: e.target.checked })}
                    />
                    preserveDrawingBuffer
                  </label>
                </div>
              </Section>
            </>
          )}

          {/* Efektler */}
          {activeTab === 'effects' && (
            <>
              <Section title="Post-Processing (deneysel)">
                <div style={gridFormStyle}>
                  <label style={labelStyle}>
                    <input
                      type="checkbox"
                      checked={!!settings.effects.fxaa}
                      onChange={(e) => setEffects({ fxaa: e.target.checked })}
                    />
                    FXAA (Hızlı kenar yumuşatma)
                  </label>
                  <label style={labelStyle}>
                    <input
                      type="checkbox"
                      checked={!!settings.effects.ssao}
                      onChange={(e) => setEffects({ ssao: e.target.checked })}
                    />
                    SSAO (Ekran uzayı ortam oklüzyonu)
                  </label>
                  <label style={labelStyle}>
                    <input
                      type="checkbox"
                      checked={!!settings.effects.bloom}
                      onChange={(e) => setEffects({ bloom: e.target.checked })}
                    />
                    Bloom (parlama)
                  </label>

                  <label style={labelColStyle}>
                    Bloom Strength
                    <input
                      type="number"
                      step="0.05"
                      min="0"
                      max="3"
                      value={settings.effects.bloomStrength ?? 0.6}
                      onChange={(e) => setEffects({ bloomStrength: parseFloat(e.target.value || '0.6') })}
                      style={inputStyle}
                    />
                  </label>
                  <label style={labelColStyle}>
                    Bloom Radius
                    <input
                      type="number"
                      step="0.05"
                      min="0"
                      max="2"
                      value={settings.effects.bloomRadius ?? 0.4}
                      onChange={(e) => setEffects({ bloomRadius: parseFloat(e.target.value || '0.4') })}
                      style={inputStyle}
                    />
                  </label>
                  <label style={labelColStyle}>
                    Bloom Threshold
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="1"
                      value={settings.effects.bloomThreshold ?? 0.85}
                      onChange={(e) => setEffects({ bloomThreshold: parseFloat(e.target.value || '0.85') })}
                      style={inputStyle}
                    />
                  </label>
                </div>
              </Section>
              <div style={{ color: '#7f8c8d', fontSize: 13 }}>
                Not: Efektler arayüzde yapılandırılmıştır; sahneye entegrasyon için görüntüleyici tarafında post-processing kurulumuna ihtiyaç vardır.
              </div>
            </>
          )}

          {/* Dil */}
          {activeTab === 'dil' && (
            <>
              <Section title="Dil ve Yerelleştirme">
                <div style={gridFormStyle}>
                  <label style={labelColStyle}>
                    Dil
                    <select
                      value={settings.ui.language || 'tr'}
                      onChange={(e) => setUi({ language: e.target.value })}
                      style={inputStyle}
                    >
                      <option value="tr">Türkçe</option>
                      <option value="en">English</option>
                    </select>
                  </label>
                </div>
              </Section>
            </>
          )}

          {/* Model */}
          {activeTab === 'model' && (
            <>
              <Section title="Model Varsayılanları">
                <div style={gridFormStyle}>
                  <label style={labelColStyle}>
                    Varsayılan Model URL
                    <input
                      type="text"
                      placeholder="https://... veya /models/... .glb"
                      value={settings.model.defaultModelUrl || ''}
                      onChange={(e) => setModel({ defaultModelUrl: e.target.value })}
                      style={inputStyle}
                    />
                  </label>
                </div>
              </Section>
            </>
          )}

          {/* Veri */}
          {activeTab === 'veri' && (
            <>
              <Section
                title="Ayarları Dışa/İçe Aktar"
                actions={
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={handleExport} style={miniButtonStyle} title="Dışa aktar (JSON)">Dışa Aktar</button>
                    <button onClick={handleImportClick} style={miniButtonStyle} title="İçe aktar (JSON)">İçe Aktar</button>
                    <input ref={fileInputRef} type="file" accept="application/json" onChange={handleImport} style={{ display: 'none' }} />
                  </div>
                }
              >
                <div style={{ color: '#666', fontSize: 14 }}>
                  Ayarlarınızı JSON olarak dışa aktarabilir ve başka bir cihazda içe aktarabilirsiniz.
                </div>
              </Section>

              <Section title="Varsayılanlara Dön">
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={handleReset} style={{ ...miniButtonStyle, borderColor: '#e74c3c', color: '#e74c3c' }} title="Varsayılana dön (Kaydet ile kalıcı olur)">
                    Varsayılanlara Döndür
                  </button>
                </div>
              </Section>
            </>
          )}

          {/* Kısayollar */}
          {activeTab === 'kisayol' && (
            <>
              <Section title="Klavye Kısayolları">
                <div style={{ fontSize: 14, color: '#2c3e50' }}>
                  <ul style={{ lineHeight: 1.8 }}>
                    <li><strong>Ctrl/Cmd + Z</strong>: Gizlemeyi geri al</li>
                    <li><strong>Ctrl/Cmd + Y</strong> veya <strong>Ctrl/Cmd + Shift + Z</strong>: Yeniden uygula</li>
                    <li><strong>Tab</strong>: Seçili parçayı gizle</li>
                    <li><strong>Shift + X/Y/Z</strong>: İlgili eksende kesiti aç/kapat</li>
                    <li><strong>Ctrl + W</strong>: Wireframe modunu aç/kapat</li>
                    <li><strong>Ctrl + R</strong>: X-Ray modunu aç/kapat</li>
                  </ul>
                </div>
              </Section>
            </>
          )}

          {/* Gelişmiş */}
          {activeTab === 'gelismis' && (
            <>
              <Section title="Gelişmiş Ayarlar">
                <div style={{ color: '#666', fontSize: 14 }}>
                  İleri düzey ayarlar için gelecekte seçenekler eklenecek (ör. materyal kalite profilleri, kesit birleşim stratejileri, torka özel görselleştirme parametreleri vb.).
                </div>
              </Section>
            </>
          )}
        </div>
      </div>

      {/* Toast */}
      {savedToast && (
        <div style={toastStyle}>
          {savedToast}
        </div>
      )}
    </div>
  );
}

// Styles
const cardStyle = {
  backgroundColor: '#fff',
  border: '1px solid #e6e6e6',
  borderRadius: 8,
  padding: 14
};

const cardTitleStyle = {
  margin: '0 0 10px 0',
  color: '#34495e'
};

const gridFormStyle = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 12,
  alignItems: 'center'
};

const labelStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  color: '#2c3e50'
};

const labelColStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  color: '#2c3e50'
};

const inputStyle = {
  padding: '8px 10px',
  borderRadius: 6,
  border: '1px solid #d0d0d0',
  background: '#fff'
};

const topButtonStyle = {
  padding: '8px 12px',
  borderRadius: 8,
  border: '1px solid #d0d0d0',
  background: '#fff',
  cursor: 'pointer'
};

const miniButtonStyle = {
  padding: '6px 10px',
  borderRadius: 6,
  border: '1px solid #d0d0d0',
  background: '#fff',
  cursor: 'pointer',
  fontSize: 13
};

const toastStyle = {
  position: 'fixed',
  bottom: 16,
  right: 16,
  background: 'rgba(0,0,0,0.85)',
  color: '#fff',
  padding: '10px 14px',
  borderRadius: 8,
  fontSize: 13
};