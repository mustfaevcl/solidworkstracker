import React, { useState, useEffect } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, useGLTF, Environment } from '@react-three/drei';


// Basit 3D model görüntüleyici
function SimpleModel() {
  const modelPath = '/otc-0915-0000000-r00.glb'; // Mevcut modelinizin yolu
  const { scene } = useGLTF(modelPath);
  
  useEffect(() => {
    if (scene) {
      // Modeli döndürmek için
      scene.rotation.y = Math.PI / 4;
      
      // Materyalleri güncelle - daha parlak görünüm için
      scene.traverse((child) => {
        if (child.isMesh) {
          child.material = new THREE.MeshStandardMaterial({
            color: new THREE.Color('#2980b9'),
            metalness: 0.7,
            roughness: 0.2,
            envMapIntensity: 1
          });
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
  const [users, setUsers] = useState([
    { id: 1, name: 'Admin', username: 'admin', password: 'admin123', role: 'admin' },
    { id: 2, name: 'Üretim Sorumlusu', username: 'uretim', password: 'uretim123', role: 'production' },
    { id: 3, name: 'Kalite Kontrol', username: 'kalite', password: 'kalite123', role: 'quality' }
  ]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

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
    
    // Gerçek bir uygulamada burada API isteği yapılır
    setTimeout(() => {
      const user = users.find(u => u.username === username && u.password === password);
      
      if (user) {
        onLogin(user);
      } else {
        setError('Kullanıcı adı veya şifre hatalı!');
        setIsLoading(false);
      }
    }, 1000); // Simüle edilmiş gecikme
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
