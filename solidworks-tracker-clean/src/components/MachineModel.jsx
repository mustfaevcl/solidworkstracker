import React, {
  useEffect,
  useRef,
  forwardRef,
  useImperativeHandle,
  useState,
} from 'react';
import { useGLTF, Environment, ContactShadows, Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import './MachineModel.css'; // CSS dosyasını import ediyoruz


const MachineModel = forwardRef(
  ({ selectedPart, onPartClick, partStatuses, onHierarchyReady, isIsolated }, ref) => {
    const { scene } = useGLTF('/otc-0915-0000000-r00.glb');
    const meshRefs = useRef({});
    const groupRef = useRef();
    const partGroupsRef = useRef({});
    const partFamiliesRef = useRef({});
    const { camera, controls, gl } = useThree();
    const [hoveredPart, setHoveredPart] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [viewMode, setViewMode] = useState('normal'); // 'normal', 'wireframe', 'xray'
    const [hiddenParts, setHiddenParts] = useState([]); // Gizlenen parçaları tutacak state
    const [clippingPlane, setClippingPlane] = useState(null); // Kesit alma için
    const [clippingAxis, setClippingAxis] = useState('x'); // Kesit alma ekseni: 'x', 'y', 'z'
    const [clippingPosition, setClippingPosition] = useState(0); // Kesit alma pozisyonu
    const [showMobileControls, setShowMobileControls] = useState(false); // Kontrolleri gösterme durumu
    const [hiddenPartsHistory, setHiddenPartsHistory] = useState([]); // Gizleme geçmişi için
    const [modelSize, setModelSize] = useState({ x: 10, y: 10, z: 10 }); // Model boyutu
    const [showClippingPlane, setShowClippingPlane] = useState(false); // Kesit düzlemini göster/gizle
    const [isClippingActive, setIsClippingActive] = useState(false); // Kesit aktif mi
    const [clippingOffset, setClippingOffset] = useState({ x: 0, y: 0, z: 0 }); // Kesit düzlemi ofset
    const [controlsPosition, setControlsPosition] = useState('bottom-right'); // Kontrollerin konumu
    const [showControls, setShowControls] = useState(false); // Kontrol panelini göster/gizle
    
    // Ölçüm araçları için state'ler
    const [measurementMode, setMeasurementMode] = useState(false); // Ölçüm modu aktif mi
    const [measurementType, setMeasurementType] = useState('distance'); // 'distance', 'diameter', 'angle'
    const [measurementPoints, setMeasurementPoints] = useState([]); // Ölçüm noktaları
    const [measurementResult, setMeasurementResult] = useState(null); // Ölçüm sonucu
    const [showMeasurementResult, setShowMeasurementResult] = useState(false); // Ölçüm sonucunu göster/gizle
    const [measurementHistory, setMeasurementHistory] = useState([]); // Ölçüm geçmişi
    const [showMeasurementHistory, setShowMeasurementHistory] = useState(false); // Ölçüm geçmişini göster/gizle

    // Cihaz tipini tespit et
    const [isMobile, setIsMobile] = useState(false);
    
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

    // Ref ile üst bileşenden sahneye erişim
    useImperativeHandle(ref, () => ({
      ...groupRef.current,
      getObjectByName: (name) => {
        return meshRefs.current[name] || null;
      },
      traverse: (callback) => {
        if (groupRef.current) {
          groupRef.current.traverse(callback);
        }
      },
      focusOnPart: (partName) => {
        // Kamerayı hareket ettirmeden parçaya odaklan
        highlightPart(partName);
      },
      setViewMode: (mode) => {
        setViewMode(mode);
      },
      // Parça görünürlük fonksiyonları
      togglePartVisibility: (partName) => {
        setHiddenPartsHistory(prev => [...prev, [...hiddenParts]]); // Geçmişi kaydet
        setHiddenParts(prev => 
          prev.includes(partName) 
            ? prev.filter(p => p !== partName) 
            : [...prev, partName]
        );
      },
      // Parça görünürlük durumunu kontrol etme
      isPartHidden: (partName) => {
        return hiddenParts.includes(partName);
      },
      // Kesit alma fonksiyonları
      setClipping: (enabled, axis = 'x', position = 0) => {
        if (enabled) {
          const plane = new THREE.Plane();
          
          if (axis === 'x') {
            plane.normal.set(1, 0, 0);
          } else if (axis === 'y') {
            plane.normal.set(0, 1, 0);
          } else if (axis === 'z') {
            plane.normal.set(0, 0, 1);
          }
          
          plane.constant = position;
          setClippingPlane(plane);
          setClippingAxis(axis);
          setClippingPosition(position);
          setIsClippingActive(true);
          
          // Kesit düzlemini tüm materyallere uygula
          applyClippingToAllMaterials(plane);
        } else {
          setClippingPlane(null);
          setIsClippingActive(false);
          
          // Kesit düzlemini kaldır
          applyClippingToAllMaterials(null);
        }
      },
      updateClippingPosition: (position) => {
        setClippingPosition(position);
        if (clippingPlane) {
          clippingPlane.constant = position;
          
          // Materyalleri güncelle
          scene.traverse((child) => {
            if (child.isMesh && child.material) {
              if (Array.isArray(child.material)) {
                child.material.forEach(mat => {
                  mat.needsUpdate = true;
                });
              } else {
                child.material.needsUpdate = true;
              }
            }
          });
        }
      },
      getClippingState: () => {
        return {
          enabled: isClippingActive,
          axis: clippingAxis,
          position: clippingPosition
        };
      },
      // Gizleme geçmişini geri alma
      undoHidePart: () => {
        if (hiddenPartsHistory.length > 0) {
          const lastState = hiddenPartsHistory[hiddenPartsHistory.length - 1];
          setHiddenParts(lastState);
          setHiddenPartsHistory(prev => prev.slice(0, -1));
          return true;
        }
        return false;
      },
      // Ölçüm fonksiyonları
      startMeasurement: (type) => {
        setMeasurementMode(true);
        setMeasurementType(type);
        setMeasurementPoints([]);
        setMeasurementResult(null);
      },
      stopMeasurement: () => {
        setMeasurementMode(false);
        setMeasurementPoints([]);
        setMeasurementResult(null);
      }
    }), [viewMode, hiddenParts, clippingPlane, clippingAxis, clippingPosition, hiddenPartsHistory, isClippingActive, scene]);

    // Kesit düzlemini tüm materyallere uygulama fonksiyonu
    const applyClippingToAllMaterials = (plane) => {
      scene.traverse((child) => {
        if (child.isMesh) {
          // Materyalleri kontrol et
          if (Array.isArray(child.material)) {
            child.material.forEach(mat => {
              mat.clippingPlanes = plane ? [plane] : [];
              mat.clipIntersection = false; // Kesişim değil, kesme işlemi yap
              mat.needsUpdate = true;
            });
          } else {
            child.material.clippingPlanes = plane ? [plane] : [];
            child.material.clipIntersection = false;
            child.material.needsUpdate = true; // Burada düzeltme yapıldı: material -> child.material
          }
        }
      });
      
      // Renderer'ın clipping özelliklerini ayarla
      gl.localClippingEnabled = !!plane;
    };

    // Parça adından temel parça ailesini çıkarma
    const getPartFamily = (name) => {
      const match = name.match(/^(OTC-\d+-\d+-\d+-R\d+)/);
      return match ? match[1] : name;
    };

    // Parçayı vurgulama fonksiyonu
    const highlightPart = (partName) => {
      if (!partName) return;

      const mesh = meshRefs.current[partName];
      if (!mesh) return;

      // Menüde parçanın görünür olmasını sağla
      setTimeout(() => {
        let element = null;

        // Farklı seçiciler dene
        element = document.querySelector(`[data-part-name="${partName}"]`);

        if (!element) {
          const elements = Array.from(document.querySelectorAll('.menu-item, li, div, span, button, a'));
          element = elements.find(el => {
            return el.textContent && el.textContent.trim() === partName;
          });
        }

        if (!element) {
          const elements = Array.from(document.querySelectorAll('*'));
          element = elements.find(el => {
            return el.textContent && el.textContent.trim() === partName;
          });
        }

        if (element) {
          const parentMenu = element.closest('.collapsed, .folded, [aria-expanded="false"]');
          if (parentMenu) {
            const expandButton = parentMenu.querySelector('.expand-button, .toggle-button');
            if (expandButton) {
              expandButton.click();
            }
          }

          element.scrollIntoView({ behavior: 'smooth', block: 'center' });

          const originalBackground = element.style.backgroundColor;
          element.style.backgroundColor = 'rgba(255, 255, 0, 0.3)';
          element.style.transition = 'background-color 0.5s';

          setTimeout(() => {
            element.style.backgroundColor = originalBackground;
          }, 100);
        }
      }, 300);
    };

    // Hiyerarşiyi çıkart ve yukarıya bildir
    const buildHierarchy = () => {
      const root = {};
      const partCounts = {};

      scene.traverse((child) => {
        if (child.isMesh) {
          const name = child.name || 'isimsiz';
          partCounts[name] = (partCounts[name] || 0) + 1;
        }
      });

      scene.traverse((child) => {
        if (child.isMesh) {
          const name = child.name || 'isimsiz';
          const parentName = child.parent?.name || 'Kök';

          if (!root[parentName]) root[parentName] = {};

          if (!root[parentName][name]) {
            root[parentName][name] = {
              count: partCounts[name]
            };
          }
        }
      });

      onHierarchyReady(root);
    };

    // Model boyutunu hesapla
    const calculateModelSize = () => {
      const box = new THREE.Box3().setFromObject(scene);
      const size = box.getSize(new THREE.Vector3());
      setModelSize(size);
    };

    // Klavye kısayolları için event listener
    useEffect(() => {
      const handleKeyDown = (e) => {
        // TAB tuşu - seçili parçayı gizle
        if (e.key === 'Tab' && selectedPart) {
          e.preventDefault(); // Sayfada gezinmeyi engelle
          setHiddenPartsHistory(prev => [...prev, [...hiddenParts]]); // Geçmişi kaydet
          setHiddenParts(prev => [...prev, selectedPart]);
        }
        
        // CTRL+Z - son gizlenen parçayı geri getir
        if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
          if (hiddenPartsHistory.length > 0) {
            e.preventDefault(); // Tarayıcı geri alma işlemini engelle
            const lastState = hiddenPartsHistory[hiddenPartsHistory.length - 1];
            setHiddenParts(lastState);
            setHiddenPartsHistory(prev => prev.slice(0, -1));
          }
        }
        
        // Kesit alma için kısayollar
        if (e.key === 'x' && e.shiftKey) {
          toggleClippingPlane('x');
        }
        
        if (e.key === 'y' && e.shiftKey) {
          toggleClippingPlane('y');
        }
        
        if (e.key === 'z' && e.shiftKey) {
          toggleClippingPlane('z');
        }
        
        // Kesit pozisyonunu ayarlama
        if (showClippingPlane || isClippingActive) {
          if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
            setClippingPosition(prev => {
              const newPos = prev + 0.5;
              if (clippingPlane) clippingPlane.constant = newPos;
              return newPos;
            });
          } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
            setClippingPosition(prev => {
              const newPos = prev - 0.5;
              if (clippingPlane) clippingPlane.constant = newPos;
              return newPos;
            });
          }
          
          // Enter tuşu - kesme işlemini uygula
          if (e.key === 'Enter') {
            applyClipping();
          }
          
          // Escape tuşu - kesme işlemini iptal et
          if (e.key === 'Escape') {
            cancelClipping();
          }
        }
        
        // Görünüm modları için kısayollar
        if (e.key === 'w' && e.ctrlKey) {
          e.preventDefault();
          setViewMode(prev => prev === 'wireframe' ? 'normal' : 'wireframe');
        }
        
        if (e.key === 'r' && e.ctrlKey) {
          e.preventDefault();
          setViewMode(prev => prev === 'xray' ? 'normal' : 'xray');
        }
        
        // Ölçüm modu için kısayollar
        if (e.key === 'm' && e.ctrlKey) {
          e.preventDefault();
          setMeasurementMode(prev => !prev);
          if (measurementMode) {
            setMeasurementPoints([]);
            setMeasurementResult(null);
          }
        }
        
        // Kontrol panelini göster/gizle
        if (e.key === 'c' && e.ctrlKey) {
          e.preventDefault();
          setShowControls(prev => !prev);
        }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedPart, hiddenParts, hiddenPartsHistory, showClippingPlane, clippingAxis, measurementMode, clippingPlane, isClippingActive]);

    useEffect(() => {
      buildHierarchy();

      const partGroups = {};
      const partFamilies = {};

      // Yükleme durumunu göster
      setIsLoading(true);

      scene.traverse((child) => {
        if (child.isMesh) {
          const name = child.name;

          if (!partGroups[name]) {
            partGroups[name] = [];
          }

          partGroups[name].push(child);
          meshRefs.current[name] = child;

          if (!child.userData.originalColor) {
            child.userData.originalColor = child.material.color.clone();
          }

          child.userData.uniqueId = `${name}_${partGroups[name].length}`;

          const family = getPartFamily(name);
          child.userData.partFamily = family;

          if (!partFamilies[family]) {
            partFamilies[family] = [];
          }
          partFamilies[family].push(child);

          // Wireframe ve diğer görünüm modları için materyal kopyaları oluştur
          child.userData.materials = {
            normal: child.material.clone(),
            wireframe: new THREE.MeshBasicMaterial({
              color: child.material.color.clone(),
              wireframe: true,
              transparent: true,
              opacity: 0.7
            }),
            xray: new THREE.MeshBasicMaterial({
              color: child.material.color.clone(),
              transparent: true,
              opacity: 0.5
            })
          };

          // Kesit alma için clipping planes özelliğini ekle
          Object.values(child.userData.materials).forEach(material => {
            material.clippingPlanes = [];
            material.clipIntersection = false; // Kesişim değil, kesme işlemi yap
            material.clipShadows = true;
            material.needsUpdate = true;
          });

          child.cursor = 'pointer';
        }
      });

      partGroupsRef.current = partGroups;
      partFamiliesRef.current = partFamilies;

      if (groupRef.current) {
        groupRef.current.clear();
        groupRef.current.add(scene);
      }

      // Model boyutunu hesapla
      calculateModelSize();

      // Yükleme tamamlandı
      setIsLoading(false);
      
      // Renderer'ın clipping özelliğini etkinleştir
      gl.localClippingEnabled = true;
    }, [scene, gl]);

    // Seçili parça değiştiğinde odaklan
    useEffect(() => {
      if (selectedPart) {
        const timer = setTimeout(() => {
          highlightPart(selectedPart); // Kamerayı hareket ettirmeden parçayı vurgula
        }, 100);

        return () => clearTimeout(timer);
      }
    }, [selectedPart]);

    // Görünüm modu değiştiğinde tüm parçaların materyallerini güncelle
    useEffect(() => {
      Object.entries(partGroupsRef.current).forEach(([name, meshes]) => {
        if (!meshes || meshes.length === 0) return;

        meshes.forEach(mesh => {
          if (mesh.userData.materials && mesh.userData.materials[viewMode]) {
            mesh.material = mesh.userData.materials[viewMode];
            
            // Kesit düzlemini yeni materyale uygula
            if (isClippingActive && clippingPlane) {
              mesh.material.clippingPlanes = [clippingPlane];
              mesh.material.clipIntersection = false;
              mesh.material.needsUpdate = true;
            }
          }
        });
      });
    }, [viewMode, isClippingActive, clippingPlane]);

    // Kesit düzlemi değiştiğinde tüm materyalleri güncelle
    useEffect(() => {
      if (!isClippingActive) {
        applyClippingToAllMaterials(null);
        return;
      }
      
      applyClippingToAllMaterials(clippingPlane);
    }, [clippingPlane, isClippingActive]);

    // Kesit pozisyonu değiştiğinde düzlemi güncelle
    useEffect(() => {
      if (clippingPlane) {
        clippingPlane.constant = clippingPosition;
        
        // Tüm materyalleri güncelle
        scene.traverse((child) => {
          if (child.isMesh && child.material) {
            if (Array.isArray(child.material)) {
              child.material.forEach(mat => {
                mat.needsUpdate = true;
              });
            } else {
              child.material.needsUpdate = true;
            }
          }
        });
      }
    }, [clippingPosition, clippingPlane, scene]);

    // Ölçüm noktaları değiştiğinde ölçüm sonucunu hesapla
    useEffect(() => {
      if (!measurementMode || measurementPoints.length < 2) return;
      
      let result = null;
      
      switch (measurementType) {
        case 'distance':
          if (measurementPoints.length === 2) {
            const distance = measurementPoints[0].distanceTo(measurementPoints[1]);
            result = {
              type: 'distance',
              value: distance.toFixed(2),
              unit: 'mm',
              points: [...measurementPoints]
            };
          }
          break;
          
        case 'diameter':
          if (measurementPoints.length === 1) {
            // Çap ölçümü için parça geometrisini analiz et
            const raycaster = new THREE.Raycaster();
            const direction = new THREE.Vector3(1, 0, 0); // X ekseni boyunca
            raycaster.set(measurementPoints[0], direction);
            
            const intersects = raycaster.intersectObject(scene, true);
            if (intersects.length > 0) {
              const diameter = intersects[0].object.geometry.boundingSphere?.radius * 2 || 0;
              result = {
                type: 'diameter',
                value: diameter.toFixed(2),
                unit: 'mm',
                point: measurementPoints[0].clone(),
                object: intersects[0].object.name
              };
            }
          }
          break;
          
        case 'angle':
          if (measurementPoints.length === 3) {
            // Üç nokta arasındaki açıyı hesapla
            const v1 = new THREE.Vector3().subVectors(measurementPoints[0], measurementPoints[1]);
            const v2 = new THREE.Vector3().subVectors(measurementPoints[2], measurementPoints[1]);
            const angle = v1.angleTo(v2) * (180 / Math.PI);
            
            result = {
              type: 'angle',
              value: angle.toFixed(1),
              unit: '°',
              points: [...measurementPoints]
            };
          }
          break;
      }
      
      if (result) {
        setMeasurementResult(result);
        setShowMeasurementResult(true);
        
        // Ölçüm geçmişine ekle
        setMeasurementHistory(prev => [...prev, result]);
      }
    }, [measurementPoints, measurementType, measurementMode, scene]);

    // Seçim ve renklendirme mantığı
    useFrame(() => {
      Object.entries(partGroupsRef.current).forEach(([name, meshes]) => {
        if (!meshes || meshes.length === 0) return;

        const status = partStatuses[name];
        const isHidden = hiddenParts.includes(name);

        // İzole mod kontrolü
        if (isIsolated) {
          let selectedParentName = null;
          if (selectedPart) {
            const selectedMeshes = partGroupsRef.current[selectedPart];
            if (selectedMeshes && selectedMeshes.length > 0) {
              selectedParentName = selectedMeshes[0].parent?.name;
            }
          }

          const thisParentName = meshes[0].parent?.name;

          const shouldBeVisible = (name === selectedPart || 
                                 (selectedParentName && thisParentName === selectedParentName)) && 
                                 !isHidden;

          meshes.forEach(mesh => {
            mesh.visible = shouldBeVisible;

            if (shouldBeVisible) {
              mesh.userData.selectable = true;
            } else {
              mesh.userData.selectable = false;
            }
          });
        } else {
          meshes.forEach(mesh => {
            mesh.visible = !isHidden; // Gizlenen parçaları gösterme
            mesh.userData.selectable = !isHidden;
          });
        }

        // Renklendirme
        meshes.forEach(mesh => {
          let isSelected = false;
          let isHovered = name === hoveredPart;

          if (selectedPart) {
            const selectedMesh = meshRefs.current[selectedPart];
            if (selectedMesh) {
              const selectedFamily = selectedMesh.userData.partFamily;
              isSelected = mesh.userData.partFamily === selectedFamily;
            } else {
              isSelected = name === selectedPart;
            }
          }

          // Renk önceliği: Hover > Seçili > Durum > Orijinal
          if (isHovered) {
            mesh.material.color.set('#00ffff'); // Cyan
          } else if (isSelected) {
            mesh.material.color.set('yellow');
          } else {
            switch (status) {
              case 'tezgahta':
                mesh.material.color.set('orange');
                break;
              case 'tamamlandi':
                mesh.material.color.set('green');
                break;
              case 'kalitede':
                mesh.material.color.set('blue');
                break;
              default:
                if (mesh.userData.originalColor) {
                  mesh.material.color.copy(mesh.userData.originalColor);
                }
                break;
            }
          }
        });
      });
    });

    // Seçili parçayı gizleme fonksiyonu
    const hideSelectedPart = () => {
      if (selectedPart) {
        setHiddenPartsHistory(prev => [...prev, [...hiddenParts]]); // Geçmişi kaydet
        setHiddenParts(prev => [...prev, selectedPart]);
      }
    };

    // Son gizleme işlemini geri alma
    const undoHide = () => {
      if (hiddenPartsHistory.length > 0) {
        const lastState = hiddenPartsHistory[hiddenPartsHistory.length - 1];
        setHiddenParts(lastState);
        setHiddenPartsHistory(prev => prev.slice(0, -1));
      }
    };

    // Tüm gizli parçaları gösterme
    const showAllParts = () => {
      if (hiddenParts.length > 0) {
        setHiddenPartsHistory(prev => [...prev, [...hiddenParts]]);
        setHiddenParts([]);
      }
    };

    // Kesit düzlemi göster/gizle
    const toggleClippingPlane = (axis) => {
      if (showClippingPlane && clippingAxis === axis) {
        setShowClippingPlane(false);
        if (!isClippingActive) {
          setClippingPlane(null);
        }
      } else {
        setShowClippingPlane(true);
        setClippingAxis(axis);
        setClippingPosition(0);
        setClippingOffset({ x: 0, y: 0, z: 0 });
        
        // Düzlemi oluştur ama henüz kesme işlemi yapma
        const plane = new THREE.Plane();
        if (axis === 'x') {
          plane.normal.set(1, 0, 0);
        } else if (axis === 'y') {
          plane.normal.set(0, 1, 0);
        } else if (axis === 'z') {
          plane.normal.set(0, 0, 1);
        }
        plane.constant = 0;
        
        // Eğer zaten aktif bir kesit varsa, onu güncelle
        if (isClippingActive) {
          setClippingPlane(plane);
          applyClippingToAllMaterials(plane);
        } else {
          setClippingPlane(plane);
        }
      }
    };

    // Kesme işlemini uygula
    const applyClipping = () => {
      setIsClippingActive(true);
      setShowClippingPlane(false);
      
      // Kesit düzlemini tüm materyallere uygula
      applyClippingToAllMaterials(clippingPlane);
    };

    // Kesme işlemini iptal et
    const cancelClipping = () => {
      setShowClippingPlane(false);
      if (!isClippingActive) {
        setClippingPlane(null);
      }
    };

    // Kesit düzlemini sıfırla
    const resetClipping = () => {
      setIsClippingActive(false);
      setShowClippingPlane(false);
      setClippingPlane(null);
      setClippingPosition(0);
      setClippingOffset({ x: 0, y: 0, z: 0 });
      
      // Tüm materyallerden kesit düzlemini kaldır
      applyClippingToAllMaterials(null);
    };

    // Kesit düzlemi ofsetini güncelle
    const updateClippingOffset = (axis, value) => {
      setClippingOffset(prev => ({
        ...prev,
        [axis]: value
      }));
    };

    // Ölçüm modunu başlat
    const startMeasurement = (type) => {
      setMeasurementMode(true);
      setMeasurementType(type);
      setMeasurementPoints([]);
      setMeasurementResult(null);
      setShowMeasurementResult(false);
    };

    // Ölçüm modunu durdur
    const stopMeasurement = () => {
      setMeasurementMode(false);
      setMeasurementPoints([]);
      setMeasurementResult(null);
      setShowMeasurementResult(false);
    };

    // Ölçüm noktası ekle
    const addMeasurementPoint = (point) => {
      if (!measurementMode) return;
      
      setMeasurementPoints(prev => {
        // Mesafe ölçümü için en fazla 2 nokta
        if (measurementType === 'distance' && prev.length >= 2) {
          return [point];
        }
        
        // Çap ölçümü için sadece 1 nokta
        if (measurementType === 'diameter') {
          return [point];
        }
        
        // Açı ölçümü için en fazla 3 nokta
        if (measurementType === 'angle' && prev.length >= 3) {
          return [point];
        }
        
        return [...prev, point];
      });
    };

    // Kontrol panelinin konumunu değiştir
    const changeControlsPosition = (position) => {
      setControlsPosition(position);
    };

    return (
      <>
        {isLoading && (
          <Html center>
            <div className="loading-container">
              <div className="loading-spinner"></div>
              <div className="loading-text">Model yükleniyor...</div>
            </div>
          </Html>
        )}
        
        <Environment preset="warehouse" />
        <ContactShadows 
          position={[0, -1, 0]} 
          opacity={0.4} 
          scale={10} 
          blur={1.5} 
          far={1} 
        />
        
        <group
          ref={groupRef}
          onClick={(e) => {
            e.stopPropagation();
            
            if (measurementMode && e.intersections && e.intersections.length > 0) {
              // Ölçüm modu aktifse, tıklanan noktayı ölçüm noktası olarak ekle
              const point = e.intersections[0].point.clone();
              addMeasurementPoint(point);
              return;
            }
            
            if (e.object?.name && e.object.userData.selectable !== false) {
              onPartClick(e.object.name); // Tıklandığında parça seçimi yap
            }
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            if (e.object?.name && e.object.userData.selectable !== false) {
              setHoveredPart(e.object.name);
              document.body.style.cursor = measurementMode ? 'crosshair' : 'pointer';
            }
          }}
          onPointerOut={() => {
            setHoveredPart(null);
            document.body.style.cursor = measurementMode ? 'crosshair' : 'auto';
          }}
        />
        
        {/* Ölçüm çizgileri ve noktaları */}
        {measurementMode && measurementPoints.length > 0 && (
          <>
            {/* Ölçüm noktalarını göster */}
            {measurementPoints.map((point, index) => (
              <mesh key={`point-${index}`} position={point}>
                <sphereGeometry args={[0.05, 16, 16]} />
                <meshBasicMaterial color="red" />
              </mesh>
            ))}
            
            {/* Mesafe ölçümü için çizgi */}
            {measurementType === 'distance' && measurementPoints.length === 2 && (
              <line>
                <bufferGeometry attach="geometry">
                  <bufferAttribute
                    attachObject={['attributes', 'position']}
                    count={2}
                    array={new Float32Array([
                      measurementPoints[0].x, measurementPoints[0].y, measurementPoints[0].z,
                      measurementPoints[1].x, measurementPoints[1].y, measurementPoints[1].z
                    ])}
                    itemSize={3}
                  />
                </bufferGeometry>
                <lineBasicMaterial attach="material" color="red" linewidth={2} />
              </line>
            )}
            
            {/* Açı ölçümü için çizgiler */}
            {measurementType === 'angle' && measurementPoints.length >= 2 && (
              <>
                {measurementPoints.length >= 2 && (
                  <line>
                    <bufferGeometry attach="geometry">
                      <bufferAttribute
                        attachObject={['attributes', 'position']}
                        count={2}
                        array={new Float32Array([
                          measurementPoints[0].x, measurementPoints[0].y, measurementPoints[0].z,
                          measurementPoints[1].x, measurementPoints[1].y, measurementPoints[1].z
                        ])}
                        itemSize={3}
                      />
                    </bufferGeometry>
                    <lineBasicMaterial attach="material" color="red" linewidth={2} />
                  </line>
                )}
                
                {measurementPoints.length === 3 && (
                  <line>
                    <bufferGeometry attach="geometry">
                      <bufferAttribute
                        attachObject={['attributes', 'position']}
                        count={2}
                        array={new Float32Array([
                          measurementPoints[1].x, measurementPoints[1].y, measurementPoints[1].z,
                          measurementPoints[2].x, measurementPoints[2].y, measurementPoints[2].z
                        ])}
                        itemSize={3}
                      />
                    </bufferGeometry>
                    <lineBasicMaterial attach="material" color="red" linewidth={2} />
                  </line>
                )}
              </>
            )}
          </>
        )}
        
        {/* Ölçüm sonucunu göster */}
        {showMeasurementResult && measurementResult && (
          <Html
            position={
              measurementResult.type === 'diameter' 
                ? measurementResult.point
                : measurementResult.points[0]
            }
          >
            <div className="measurement-result">
              <div className="result-value">
                {measurementResult.type === 'distance' && `Mesafe: ${measurementResult.value} ${measurementResult.unit}`}
                {measurementResult.type === 'diameter' && `Çap: ${measurementResult.value} ${measurementResult.unit}`}
                {measurementResult.type === 'angle' && `Açı: ${measurementResult.value}${measurementResult.unit}`}
              </div>
            </div>
          </Html>
        )}
        
        {/* Sabit konumlu kontrol paneli */}
        <Html
          position={[0, 0, 0]}
          prepend
          center={false}
          portal={{current: document.body}}
          style={{
            position: 'fixed',
            top: controlsPosition.includes('top') ? '10px' : 'auto',
            bottom: controlsPosition.includes('bottom') ? '10px' : 'auto',
            left: controlsPosition.includes('left') ? '10px' : 'auto',
            right: controlsPosition.includes('right') ? '10px' : 'auto',
            zIndex: 1000,
            pointerEvents: 'auto'
          }}
        >
          <div className={`control-panel ${showControls ? 'expanded' : 'collapsed'}`}>
            <div className="control-panel-header">
              <button 
                className="toggle-panel-button"
                onClick={() => setShowControls(!showControls)}
              >
                {showControls ? '▼ Kontrol Paneli' : '▲ Kontrol Paneli'}
              </button>
              
              {showControls && (
                <div className="panel-position-controls">
                  <button onClick={() => changeControlsPosition('top-left')}>↖</button>
                  <button onClick={() => changeControlsPosition('top-right')}>↗</button>
                  <button onClick={() => changeControlsPosition('bottom-left')}>↙</button>
                  <button onClick={() => changeControlsPosition('bottom-right')}>↘</button>
                </div>
              )}
            </div>
            
            {showControls && (
              <div className="control-panel-content">
                {/* Görünüm modu kontrolleri */}
                <div className="control-section">
                  <div className="section-title">Görünüm</div>
                  <div className="button-group">
                    <button 
                      className={`view-mode-button ${viewMode === 'normal' ? 'active' : ''}`}
                      onClick={() => setViewMode('normal')}
                    >
                      Normal
                    </button>
                    <button 
                      className={`view-mode-button ${viewMode === 'wireframe' ? 'active' : ''}`}
                      onClick={() => setViewMode('wireframe')}
                    >
                      Wireframe
                    </button>
                    <button 
                      className={`view-mode-button ${viewMode === 'xray' ? 'active' : ''}`}
                      onClick={() => setViewMode('xray')}
                    >
                      X-Ray
                    </button>
                  </div>
                </div>
                
                {/* Parça kontrolleri */}
                <div className="control-section">
                  <div className="section-title">Parça İşlemleri</div>
                  <div className="button-group">
                    <button 
                      className="part-button"
                      onClick={hideSelectedPart}
                      disabled={!selectedPart}
                    >
                      Parçayı Gizle
                    </button>
                    <button 
                      className="part-button"
                      onClick={undoHide}
                      disabled={hiddenPartsHistory.length === 0}
                    >
                      Geri Al
                    </button>
                    <button 
                      className="part-button"
                      onClick={showAllParts}
                      disabled={hiddenParts.length === 0}
                    >
                      Tümünü Göster
                    </button>
                  </div>
                </div>
                
                {/* Kesit kontrolleri */}
                <div className="control-section">
                  <div className="section-title">Kesit Alma</div>
                  <div className="button-group">
                    <button 
                      className={`axis-button ${clippingAxis === 'x' && (showClippingPlane || isClippingActive) ? 'active' : ''}`}
                      onClick={() => toggleClippingPlane('x')}
                    >
                      X Ekseni
                    </button>
                    <button 
                      className={`axis-button ${clippingAxis === 'y' && (showClippingPlane || isClippingActive) ? 'active' : ''}`}
                      onClick={() => toggleClippingPlane('y')}
                    >
                      Y Ekseni
                    </button>
                    <button 
                      className={`axis-button ${clippingAxis === 'z' && (showClippingPlane || isClippingActive) ? 'active' : ''}`}
                      onClick={() => toggleClippingPlane('z')}
                    >
                      Z Ekseni
                    </button>
                    {isClippingActive && (
                      <button 
                        className="part-button"
                        onClick={resetClipping}
                      >
                        Kesiti Kaldır
                      </button>
                    )}
                  </div>
                  
                  {(showClippingPlane || isClippingActive) && (
                    <div className="clipping-controls">
                      <div className="clipping-slider">
                        <div className="slider-label">Kesit Pozisyonu: {clippingPosition.toFixed(1)}</div>
                        <div className="slider-controls">
                          <button 
                            className="slider-button"
                            onClick={() => {
                              const newPos = clippingPosition - 0.5;
                              setClippingPosition(newPos);
                              if (clippingPlane) clippingPlane.constant = newPos;
                            }}
                          >
                            -
                          </button>
                          <input
                            type="range"
                            min={-modelSize[clippingAxis] / 2}
                            max={modelSize[clippingAxis] / 2}
                            step="0.1"
                            value={clippingPosition}
                            onChange={(e) => {
                              const newPos = parseFloat(e.target.value);
                              setClippingPosition(newPos);
                              if (clippingPlane) clippingPlane.constant = newPos;
                            }}
                            className="position-slider"
                          />
                          <button 
                            className="slider-button"
                            onClick={() => {
                              const newPos = clippingPosition + 0.5;
                              setClippingPosition(newPos);
                              if (clippingPlane) clippingPlane.constant = newPos;
                            }}
                          >
                            +
                          </button>
                        </div>
                      </div>
                      
                      {showClippingPlane && (
                        <div className="clipping-actions">
                          <button 
                            className="action-button apply"
                            onClick={applyClipping}
                          >
                            Kesiti Uygula
                          </button>
                          <button 
                            className="action-button cancel"
                            onClick={cancelClipping}
                          >
                            İptal
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                
                {/* Ölçüm kontrolleri */}
                <div className="control-section">
                  <div className="section-title">Ölçüm Araçları</div>
                  <div className="button-group">
                    <button 
                      className={`measurement-button ${measurementMode && measurementType === 'distance' ? 'active' : ''}`}
                      onClick={() => measurementMode && measurementType === 'distance' ? stopMeasurement() : startMeasurement('distance')}
                    >
                      Mesafe Ölçümü
                    </button>
                    <button 
                      className={`measurement-button ${measurementMode && measurementType === 'angle' ? 'active' : ''}`}
                      onClick={() => measurementMode && measurementType === 'angle' ? stopMeasurement() : startMeasurement('angle')}
                    >
                      Açı Ölçümü
                    </button>
                    <button 
                      className={`measurement-button ${measurementMode && measurementType === 'diameter' ? 'active' : ''}`}
                      onClick={() => measurementMode && measurementType === 'diameter' ? stopMeasurement() : startMeasurement('diameter')}
                    >
                      Çap Ölçümü
                    </button>
                  </div>
                  
                  {measurementMode && (
                    <div className="measurement-instructions">
                      {measurementType === 'distance' && (
                        <p>İki nokta seçerek mesafe ölçümü yapın.</p>
                      )}
                      {measurementType === 'angle' && (
                        <p>Üç nokta seçerek açı ölçümü yapın.</p>
                      )}
                      {measurementType === 'diameter' && (
                        <p>Bir parça üzerinde nokta seçerek çap ölçümü yapın.</p>
                      )}
                      <button 
                        className="action-button cancel"
                        onClick={stopMeasurement}
                      >
                        Ölçümü İptal Et
                      </button>
                    </div>
                  )}
                  
                  {measurementHistory.length > 0 && (
                    <div className="measurement-history">
                      <button 
                        className="history-toggle"
                        onClick={() => setShowMeasurementHistory(!showMeasurementHistory)}
                      >
                        {showMeasurementHistory ? 'Ölçüm Geçmişini Gizle' : 'Ölçüm Geçmişini Göster'}
                      </button>
                      
                      {showMeasurementHistory && (
                        <div className="history-list">
                          {measurementHistory.map((result, index) => (
                            <div key={index} className="history-item">
                              {result.type === 'distance' && `Mesafe: ${result.value} ${result.unit}`}
                              {result.type === 'diameter' && `Çap: ${result.value} ${result.unit}`}
                              {result.type === 'angle' && `Açı: ${result.value}${result.unit}`}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </Html>
      </>
    );
  }
);

export default MachineModel;
