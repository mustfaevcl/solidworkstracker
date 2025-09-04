import React, { useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, GridHelper } from '@react-three/drei';
import MachineModel from './MachineModel';

const MachineViewer = () => {
  const modelRef = useRef();
  const [selectedPart, setSelectedPart] = useState(null);
  const [partStatuses, setPartStatuses] = useState({});
  const [isIsolated, setIsolated] = useState(false);

  const handlePartClick = (partName) => {
    setSelectedPart(partName);
  };

  const handleHierarchyReady = (hierarchy) => {
    console.log('Parça Hiyerarşisi:', hierarchy);
  };

  return (
    <Canvas
      camera={{
        position: [0, 2, 10],
        near: 0.01,
        far: 1000,
        fov: 45,
      }}
    >
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 10]} intensity={1} />

      <GridHelper args={[10, 10]} />

      <MachineModel
        selectedPart={selectedPart}
        onPartClick={handlePartClick}
        partStatuses={partStatuses}
        onHierarchyReady={handleHierarchyReady}
        isIsolated={isIsolated}
        ref={modelRef}
      />

      <OrbitControls
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
        maxDistance={50}
        minDistance={1}
      />
    </Canvas>
  );
};

export default MachineViewer;