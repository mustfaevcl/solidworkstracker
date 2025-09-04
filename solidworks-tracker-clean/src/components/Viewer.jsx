import { Canvas } from "@react-three/fiber"
import { OrbitControls, Stage, useGLTF } from "@react-three/drei"
import { useCursor } from "@react-three/drei"
import { useState } from "react"
import useStore from "../store/state"

function Model({ url }) {
  const gltf = useGLTF(url)
  const setSelected = useStore(state => state.setSelected)

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

    return (
      <mesh
        geometry={object.geometry}
        material={object.material.clone()}
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

export default function Viewer() {
  return (
    <Canvas camera={{ position: [5, 5, 5] }}>
      <ambientLight intensity={0.8} />
      <Stage>
        <Model url="/machine.glb" />
      </Stage>
      <OrbitControls />
    </Canvas>
  )
}
