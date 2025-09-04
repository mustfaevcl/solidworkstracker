import { Canvas } from "@react-three/fiber"
import { OrbitControls, Stage, useGLTF, Html } from "@react-three/drei"
import { useCursor } from "@react-three/drei"
import { useState, useEffect, Suspense } from "react"
import * as THREE from "three"
import useStore from "../components/store/state"

function computeModelUrl() {
  const env = import.meta?.env || {};
  const raw = (env.VITE_MODEL_URL && String(env.VITE_MODEL_URL).trim()) || '';
  const fileIdEnv = (env.VITE_GDRIVE_FILE_ID && String(env.VITE_GDRIVE_FILE_ID).trim()) || '';
  const apiKey = (env.VITE_GDRIVE_API_KEY && String(env.VITE_GDRIVE_API_KEY).trim()) || '';

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

  // Ham URL varsa onu kullan; yoksa yereldeki fallback
  return raw || '/ttu-0911-1000000-r00.glb';
}

function Model({ url = computeModelUrl() }) {
  const [modelError, setModelError] = useState(false)
  const gltf = useGLTF(url, {
    onError: (e) => {
      console.error("GLTF yükleme hatası:", e)
      setModelError(true)
    },
    textureColorSpace: THREE.SRGBColorSpace,
    crossorigin: 'anonymous'
  })
  const setSelected = useStore(state => state.setSelected)

  // Handle texture errors in the loaded scene
  useEffect(() => {
    if (gltf.scene) {
      try {
        gltf.scene.traverse((object) => {
          if (object.isMesh && object.material) {
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            
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
                    // Create a replacement texture with a solid color instead of null
                    const replacementTexture = new THREE.Texture();
                    replacementTexture.needsUpdate = true;
                    material[mapType] = replacementTexture;
                  }
                  // Check if texture image is invalid
                  else if (material[mapType].image === undefined ||
                           material[mapType].image === null) {
                    console.warn(`Mesh için ${mapType} dokusu yüklenemedi, kaldırılıyor`);
                    // Create a replacement texture with a solid color instead of null
                    const replacementTexture = new THREE.Texture();
                    replacementTexture.needsUpdate = true;
                    material[mapType] = replacementTexture;
                  }
                }
              });
              
              // Update material after potential texture replacement
              material.needsUpdate = true;
            });
          }
        });
      } catch (error) {
        console.error("Doku işleme hatası:", error);
      }
    }
  }, [gltf.scene]);

  if (modelError) {
    return <ErrorFallback />;
  }

  return (
    <group>
      {gltf.scene.children.map((child, index) => (
        <SelectableMesh key={index} object={child} />
      ))}
    </group>
  )

  function SelectableMesh({ object }) {
    const [hovered, setHovered] = useState(false)
    useCursor(hovered)
    const selectedPart = useStore(state => state.selectedPart)
    const partStatuses = useStore(state => state.partStatuses)
    const status = partStatuses[object.name]

    // Create a safe material that won't throw errors
    const safeMaterial = (() => {
      try {
        if (object.material) {
          const clonedMaterial = object.material.clone();
          // Ensure all texture properties are valid
          const textureProps = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'];
          textureProps.forEach(prop => {
            if (clonedMaterial[prop] && !clonedMaterial[prop].isTexture) {
              clonedMaterial[prop] = null;
            }
          });
          return clonedMaterial;
        }
      } catch (e) {
        console.warn("Malzeme klonlama hatası:", e);
      }
      
      // Create a default material as fallback
      return new THREE.MeshStandardMaterial({
        color: new THREE.Color(0x808080),
        roughness: 0.7,
        metalness: 0.3
      });
    })();

    return (
      <mesh
        geometry={object.geometry}
        material={safeMaterial}
        position={object.position}
        rotation={object.rotation}
        scale={object.scale}
        onClick={() => setSelected(object.name)}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
        material-color={
          status === "Tamamlandı" ? "green" :
          status === "Kalite" ? "orange" :
          status === "Kaplama" ? "blue" :
          status === "Fason" ? "purple" :
          status === "CNC" ? "red" : "gray"
        }
      />
    )
  }
}

// Fallback component when model fails to load
function ErrorFallback() {
  return (
    <mesh>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="red" />
      <Html position={[0, 1.5, 0]}>
        <div style={{ color: 'white', background: 'rgba(0,0,0,0.7)', padding: '10px', borderRadius: '5px' }}>
          Model yüklenemedi
        </div>
      </Html>
    </mesh>
  )
}

// Loading indicator component
function LoadingIndicator() {
  return (
    <mesh>
      <sphereGeometry args={[1, 16, 16]} />
      <meshStandardMaterial color="blue" wireframe />
    </mesh>
  )
}

export default function Viewer() {
  return (
    <Canvas camera={{ position: [5, 5, 5] }}>
      <ambientLight intensity={0.8} />
      <Suspense fallback={<LoadingIndicator />}>
        <Stage>
          <Model />
        </Stage>
      </Suspense>
      <OrbitControls />
    </Canvas>
  )
}