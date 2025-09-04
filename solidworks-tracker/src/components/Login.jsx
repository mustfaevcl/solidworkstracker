import React, { useState, useEffect } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, useGLTF, Environment } from '@react-three/drei';

// Kullanıcıları doğrudan frontend'de saklıyoruz
const localUsers = [
  {
    id: 1,
    username: 'admin',
    password: 'admin123',
    name: 'Admin',
    role: 'admin'
  },
  {
    id: 2,
    username: 'production_user',
    password: 'prodpass',
    name: 'Üretim Sorumlusu',
    role: 'production'
  },
  {
    id: 3,
    username: 'quality_user',
    password: 'qualpass',
    name: 'Kalite Kontrol',
    role: 'quality'
  }
];

// Basit 3D model görüntüleyici
function SimpleModel() {
  const computeModelUrl = () => {
    const env = import.meta?.env || {};
    const raw = (env.VITE_MODEL_URL && String(env.VITE_MODEL_URL).trim()) || '';
    const fileIdEnv = (env.VITE_GDRIVE_FILE_ID && String(env.VITE_GDRIVE_FILE_ID).trim()) || '';
    const apiKey = (env.VITE_GDRIVE_API_KEY && String(env.VITE_GDRIVE_API_KEY).trim()) || '';
    const base = (env.VITE_MODELS_BASE_URL && String(env.VITE_MODELS_BASE_URL).trim()) || '';
    const baseClean = base ? base.replace(/\/+$/, '') : '';
  
    // Google Drive FILE_ID çıkar
    let fileId = fileIdEnv;
    if (!fileId && raw.includes('drive.google.com')) {
      const m = raw.match(/\/file\/d\/([^/]+)\//) || raw.match(/[?&]id=([^&]+)/);
      if (m && m[1]) fileId = m[1];
    }
  
    if (fileId) {
      if (apiKey) return `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${apiKey}`;
      // API key yoksa direct download host kullan
      return `https://drive.usercontent.google.com/uc?export=download&id=${fileId}`;
    }
  
    // CDN tabanı (VITE_MODELS_BASE_URL) tanımlıysa, oradan küçük bir örnek dosyayı hedefleyin
    if (baseClean) {
      // Bu dosya ismini CDN'inize yükleyin veya mevcut küçük bir glb dosyanızın adını kullanın
      return `${baseClean}/ttu-0911-1000000-r00.glb`;
    }
  
    // Ham URL varsa onu kullan; yoksa yereldeki fallback
    return raw || '/ttu-0911-1000000-r00.glb';
  };

  const modelPath = computeModelUrl();
  const { scene } = useGLTF(modelPath, {
    onError: (e) => console.error("GLTF yükleme hatası:", e),
    textureColorSpace: THREE.SRGBColorSpace,
    crossorigin: 'anonymous'
  });
  
  useEffect(() => {
    if (scene) {
      // Modeli döndürmek için
      scene.rotation.y = Math.PI / 4;
      
      // Materyalleri güncelle - daha parlak görünüm için
      scene.traverse((child) => {
        if (child.isMesh) {
          // Handle texture errors first
          if (child.material) {
            const materials = Array.isArray(child.material) ? child.material : [child.material];
            materials.forEach(material => {
              // Check for blob URL texture errors
              const maps = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'];
              maps.forEach(mapType => {
                if (material[mapType]) {
                  // Check if texture is from a blob URL that failed to load
                  if (material[mapType].image &&
                      material[mapType].image.currentSrc &&
                      material[mapType].image.currentSrc.startsWith('blob:')) {
                    console.warn(`Mesh için ${mapType} blob dokusu yüklenemedi, kaldırılıyor`);
                    material[mapType] = null;
                  }
                  // Check if texture image is invalid
                  else if (material[mapType].image === undefined ||
                           material[mapType].image === null) {
                    console.warn(`Mesh için ${mapType} dokusu yüklenemedi, kaldırılıyor`);
                    material[mapType] = null;
                  }
                }
              });
              
              // Update material after potential texture removal
              material.needsUpdate = true;
            });
          }
          
          // Preserve original material properties when possible, or create new material with desired properties
          try {
            if (child.material && typeof child.material === 'object') {
              // Try to modify existing material
              if (!child.material.color || child.material.color.getHexString() === "000000") {
                child.material.color = new THREE.Color('#2980b9');
              }
              child.material.metalness = 0.7;
              child.material.roughness = 0.2;
              child.material.envMapIntensity = 1;
            } else {
              // Create new material if needed
              child.material = new THREE.MeshStandardMaterial({
                color: new THREE.Color('#2980b9'),
                metalness: 0.7,
                roughness: 0.2,
                envMapIntensity: 1
              });
            }
          } catch (materialError) {
            console.warn("Malzeme güncelleme hatası, varsayılan malzeme oluşturuluyor:", materialError);
            child.material = new THREE.MeshStandardMaterial({
              color: new THREE.Color('#2980b9'),
              metalness: 0.7,
              roughness: 0.2,
              envMapIntensity: 1
            });
          }
        }
      });
    }
  }, [scene]);
  
  return <primitive object={scene} scale={0.5} position={[0, -1, 0]} />;
}

// Ana Login bileşeni
function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // Kullanıcıları doğrudan frontend'den yüklüyoruz
  useEffect(() => {
    // Şifreleri client tarafında göstermemek için kaldırıyoruz
    const safeUsers = localUsers.map(({ password, ...user }) => user);
    setUsers(safeUsers);
  }, []);

  // Kullanıcı seçildiğinde şifre alanına odaklanma
  useEffect(() => {
    if (selectedUser) {
      document.getElementById('password-field').focus();
    }
  }, [selectedUser]);

  const handleUserSelect = (user) => {
    setSelectedUser(user);
    setUsername(user.username);
    setError('');
  };

  const handleLogin = (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    // Kullanıcı adı ve şifre boş olmamalı
    if (!username || !password) {
      setError('Kullanıcı adı ve şifre gereklidir!');
      setIsLoading(false);
      return;
    }

    // Sunucu yerine doğrudan frontend'de doğrulama yapıyoruz
    setTimeout(() => {
      const user = localUsers.find(u => u.username === username && u.password === password);
      
      if (user) {
        // Şifreyi client'a göndermeden önce kaldır
        const { password, ...userWithoutPassword } = user;
        onLogin(userWithoutPassword);
      } else {
        setError('Kullanıcı adı veya şifre hatalı!');
        setIsLoading(false);
      }
    }, 500); // Gerçek bir API çağrısı gibi hissettirmek için küçük bir gecikme
  };

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      width: '100vw',
      overflow: 'hidden',
      position: 'relative'
    }}>
      {/* Sol taraf - 3D model */}
      <div style={{
        flex: 1,
        background: 'linear-gradient(135deg, #2c3e50, #3498db)',
        position: 'relative',
        overflow: 'hidden'
      }}>
        <Canvas
          camera={{ position: [0, 0, 5], fov: 50 }}
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
        >
          <ambientLight intensity={0.5} />
          <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} intensity={1} castShadow />
          <SimpleModel />
          <Environment preset="warehouse" />
          <OrbitControls 
            enableZoom={false}
            enablePan={false}
            autoRotate
            autoRotateSpeed={0.5}
          />
        </Canvas>
        
        <div style={{
          position: 'absolute',
          bottom: '10%',
          left: '10%',
          color: 'white',
          zIndex: 10
        }}>
          <h1 style={{ fontSize: '2.5rem', margin: 0, textShadow: '2px 2px 4px rgba(0,0,0,0.5)' }}>
            Üretim Takip Sistemi
          </h1>
          <p style={{ fontSize: '1.2rem', maxWidth: '400px', textShadow: '1px 1px 2px rgba(0,0,0,0.5)' }}>
            3D model üzerinden parça durumlarını takip edin, üretim süreçlerini yönetin.
          </p>
        </div>
      </div>
      
      {/* Sağ taraf - Giriş formu */}
      <div style={{
        width: '400px',
        backgroundColor: 'white',
        padding: '40px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '30px' }}>
          <h2 style={{ color: '#2c3e50', margin: 0 }}>Hoş Geldiniz</h2>
          <p style={{ color: '#7f8c8d', marginTop: '10px' }}>Lütfen hesabınıza giriş yapın</p>
        </div>
        
        {!selectedUser ? (
          // Kullanıcı seçim ekranı
          <div>
            <p style={{ fontWeight: 'bold', marginBottom: '15px', color: '#34495e' }}>Kullanıcı Seçin:</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {users.map(user => (
                <button
                  key={user.id}
                  onClick={() => handleUserSelect(user)}
                  style={{
                    padding: '12px 15px',
                    border: '1px solid #e0e0e0',
                    borderRadius: '5px',
                    backgroundColor: 'white',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.2s',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f5f5f5'}
                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'white'}
                >
                  <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    backgroundColor: '#3498db',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: '15px',
                    fontSize: '18px'
                  }}>
                    {user.name.charAt(0)}
                  </div>
                  <div>
                    <div style={{ fontWeight: 'bold' }}>{user.name}</div>
                    <div style={{ fontSize: '0.8rem', color: '#7f8c8d' }}>{user.role === 'admin' ? 'Yönetici' : user.role === 'production' ? 'Üretim' : 'Kalite'}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          // Şifre giriş ekranı
          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: '20px', textAlign: 'center' }}>
              <div style={{
                width: '70px',
                height: '70px',
                borderRadius: '50%',
                backgroundColor: '#3498db',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 15px auto',
                fontSize: '30px'
              }}>
                {selectedUser.name.charAt(0)}
              </div>
              <div style={{ fontWeight: 'bold', fontSize: '1.2rem' }}>{selectedUser.name}</div>
              <div style={{ color: '#7f8c8d', fontSize: '0.9rem' }}>
                {selectedUser.role === 'admin' ? 'Yönetici' : selectedUser.role === 'production' ? 'Üretim Sorumlusu' : 'Kalite Kontrol'}
              </div>
            </div>
            
            <div style={{ marginBottom: '20px' }}>
              <label htmlFor="password-field" style={{ display: 'block', marginBottom: '5px', color: '#34495e', fontWeight: 'bold' }}>
                Şifre
              </label>
              <input
                id="password-field"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '5px',
                  border: '1px solid #e0e0e0',
                  fontSize: '1rem'
                }}
                placeholder="Şifrenizi girin"
                required
              />
            </div>
            
            {error && (
              <div style={{
                backgroundColor: '#ffebee',
                color: '#c62828',
                padding: '10px',
                borderRadius: '5px',
                marginBottom: '20px',
                fontSize: '0.9rem'
              }}>
                {error}
              </div>
            )}
            
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setSelectedUser(null)}
                style={{
                  padding: '12px',
                  flex: 1,
                  border: '1px solid #e0e0e0',
                  borderRadius: '5px',
                  backgroundColor: 'white',
                  cursor: 'pointer',
                  color: '#7f8c8d'
                }}
              >
                Geri
              </button>
              
              <button
                type="submit"
                disabled={isLoading}
                style={{
                  padding: '12px',
                  flex: 2,
                  backgroundColor: '#3498db',
                  color: 'white',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: isLoading ? 'default' : 'pointer',
                  position: 'relative',
                  overflow: 'hidden'
                }}
              >
                {isLoading ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{
                      width: '20px',
                      height: '20px',
                      border: '3px solid rgba(255,255,255,0.3)',
                      borderRadius: '50%',
                      borderTopColor: 'white',
                      animation: 'spin 1s linear infinite'
                    }} />
                    <style>
                      {`
                        @keyframes spin {
                          to { transform: rotate(360deg); }
                        }
                      `}
                    </style>
                  </div>
                ) : 'Giriş Yap'}
              </button>
            </div>
          </form>
        )}
        
        <div style={{ marginTop: '30px', textAlign: 'center', color: '#95a5a6', fontSize: '0.8rem' }}>
          &copy; 2025 GMM Üretim Takip Sistemi
        </div>
      </div>
    </div>
  );
}

export default Login;