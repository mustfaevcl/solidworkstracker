import React, { useMemo, useState } from "react";
import { Html, Line } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";

// MeasurementOverlay: render-prop pattern providing onPick handler to children
// UPDATED: offsets to endpoints + midpoint label offset to avoid occlusion,
// Html occlusion disabled (occlude={false}) + zIndexRange applied, and
// adaptive offset logic added so labels / lines sit outside geometry.
export default function MeasurementOverlay({ children }) {
  const [dimensions, setDimensions] = useState([]);
  const [pendingPick, setPendingPick] = useState(null);
  const { camera, size } = useThree();

  const handlePick = (e, object) => {
    e.stopPropagation();
    const faceIndex = typeof e.faceIndex === "number" ? e.faceIndex : 0;
    const worldPoint =
      e.point instanceof THREE.Vector3
        ? e.point.clone()
        : new THREE.Vector3(e.point.x, e.point.y, e.point.z);

    // Modifier support:
    // - Alt  => explicit point pick
    // - Ctrl/Shift/Meta => snap to vertex/edge
    // Default (no modifier) => FACE PICK for SolidWorks-like behavior
    const isPointPick = !!(e.altKey || e.nativeEvent?.altKey);
    const isSnapPick =
      !!(e.ctrlKey || e.shiftKey || e.metaKey || e.nativeEvent?.ctrlKey || e.nativeEvent?.shiftKey || e.nativeEvent?.metaKey);
 
    let pick;
    if (isPointPick) {
      // Force raw point pick at the raycast hit point
      pick = { type: "point", object, point: worldPoint.clone() };
    } else if (isSnapPick) {
      // Explicitly opt into edge/vertex snapping on the intersected triangle
      const tri = getTriangleWorld(object, faceIndex);
      const snapped = tri ? snapPickFromTriangle(tri, worldPoint, camera, size) : null;
      pick = snapped ? { object, ...snapped } : getFaceData(object, faceIndex, worldPoint);
    } else {
      // Default: treat as a face selection so computeDimension performs face-face or point-plane
      pick = getFaceData(object, faceIndex, worldPoint);
    }

    if (!pendingPick) {
      setPendingPick(pick);
    } else {
      const dim = computeDimension(pendingPick, pick);
      setDimensions((prev) => [
        ...prev,
        {
          id: cryptoRandomId(),
          ...dim,
          status: "confirmed",
        },
      ]);
      setPendingPick(null);
    }
  };

  const labelStyle = useMemo(
    () => ({
      color: "white",
      background: "rgba(0,0,0,0.85)",
      padding: "6px 8px",
      borderRadius: "4px",
      fontSize: "14px",
      whiteSpace: "nowrap",
      border: "1px solid rgba(255,255,255,0.3)",
      userSelect: "none",
      fontWeight: "bold",
      boxShadow: "0 2px 4px rgba(0,0,0,0.5)",
    }),
    []
  );

  return (
    <>
      {typeof children === "function" ? children(handlePick) : children}

      {/* Pending pick indicator (temporary = blue) */}
      {pendingPick && (
        <Html
          position={pendingPick.centroid || pendingPick.point}
          occlude={false}
          zIndexRange={[100, 0]}
        >
          <div
            style={{
              ...labelStyle,
              background: "rgba(30,144,255,0.95)",
              borderColor: "rgba(255,255,255,0.5)",
              padding: "8px 12px",
              fontSize: "16px",
            }}
          >
            Pick 2nd point…
          </div>
        </Html>
      )}

      {/* Confirmed dimensions */}
      {dimensions.map((dim) => {
        const lineColor = dim.color || (dim.status === "confirmed" ? "#111111" : "#1e90ff");
        return (
          <group key={dim.id}>
            <Line
              points={[dim.start, dim.end]}
              color={lineColor}
              lineWidth={3}
              depthTest={false}
              renderOrder={999}
            />
            <Html position={dim.mid} occlude={false} zIndexRange={[100, 0]}>
              <div
                style={{ ...labelStyle, cursor: "pointer", padding: "6px 8px" }}
                onClick={(ev) => {
                  ev.stopPropagation();
                  setDimensions((prev) => prev.filter((d) => d.id !== dim.id));
                }}
                title="Delete dimension"
              >
                {dim.text}
              </div>
            </Html>
          </group>
        );
      })}
    </>
  );
}

// ===== Helpers (MVP; extended with offsetting so labels/lines avoid occlusion) =====
function toArray(v) {
  return [v.x, v.y, v.z];
}

// cheap id for deletion
function cryptoRandomId() {
  // window.crypto may be unavailable in SSR; fallback to Math.random
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const arr = new Uint32Array(2);
    crypto.getRandomValues(arr);
    return `${arr[0].toString(16)}${arr[1].toString(16)}`;
  }
  return Math.random().toString(16).slice(2);
}

// ===== Edge/Vertex snapping helpers (unchanged) =====
function getTriangleWorld(object, faceIndex) {
  const geom = object.geometry;
  if (!geom || !geom.attributes || !geom.attributes.position) return null;

  const pos = geom.attributes.position;
  const index = geom.index;
  let a, b, c;

  if (index) {
    const i3 = faceIndex * 3;
    a = index.getX(i3);
    b = index.getX(i3 + 1);
    c = index.getX(i3 + 2);
  } else {
    a = faceIndex * 3;
    b = a + 1;
    c = a + 2;
  }

  const vA = new THREE.Vector3().fromBufferAttribute(pos, a).applyMatrix4(object.matrixWorld);
  const vB = new THREE.Vector3().fromBufferAttribute(pos, b).applyMatrix4(object.matrixWorld);
  const vC = new THREE.Vector3().fromBufferAttribute(pos, c).applyMatrix4(object.matrixWorld);

  return { vA, vB, vC };
}

function projectToScreen(camera, size, v3) {
  const ndc = v3.clone().project(camera);
  return {
    x: (ndc.x * 0.5 + 0.5) * size.width,
    y: (-ndc.y * 0.5 + 0.5) * size.height,
  };
}

function pixelDistance(p, q) {
  const dx = p.x - q.x;
  const dy = p.y - q.y;
  return Math.hypot(dx, dy);
}

function nearestPointOnSegmentWorld(p, a, b) {
  const ab = new THREE.Vector3().subVectors(b, a);
  const t = Math.max(0, Math.min(1, new THREE.Vector3().subVectors(p, a).dot(ab) / ab.lengthSq()));
  return a.clone().addScaledVector(ab, t);
}

function snapPickFromTriangle(tri, worldPoint, camera, size) {
  const VERTEX_PX = 12;
  const EDGE_PX = 10;

  const wpScr = projectToScreen(camera, size, worldPoint);
  const aScr = projectToScreen(camera, size, tri.vA);
  const bScr = projectToScreen(camera, size, tri.vB);
  const cScr = projectToScreen(camera, size, tri.vC);

  // Vertex snap
  const dA = pixelDistance(wpScr, aScr);
  const dB = pixelDistance(wpScr, bScr);
  const dC = pixelDistance(wpScr, cScr);
  const minV = Math.min(dA, dB, dC);

  if (minV <= VERTEX_PX) {
    if (minV === dA) return { type: "point", point: tri.vA.clone() };
    if (minV === dB) return { type: "point", point: tri.vB.clone() };
    return { type: "point", point: tri.vC.clone() };
  }

  // Edge snap: compute nearest world point on each segment, then compare pixel distance
  const nAB = nearestPointOnSegmentWorld(worldPoint, tri.vA, tri.vB);
  const nBC = nearestPointOnSegmentWorld(worldPoint, tri.vB, tri.vC);
  const nCA = nearestPointOnSegmentWorld(worldPoint, tri.vC, tri.vA);

  const nABScr = projectToScreen(camera, size, nAB);
  const nBCScr = projectToScreen(camera, size, nBC);
  const nCAScr = projectToScreen(camera, size, nCA);

  const dAB = pixelDistance(wpScr, nABScr);
  const dBC = pixelDistance(wpScr, nBCScr);
  const dCA = pixelDistance(wpScr, nCAScr);

  const minE = Math.min(dAB, dBC, dCA);

  if (minE <= EDGE_PX) {
    if (minE === dAB) return { type: "edge", a: tri.vA.clone(), b: tri.vB.clone(), closest: nAB };
    if (minE === dBC) return { type: "edge", a: tri.vB.clone(), b: tri.vC.clone(), closest: nBC };
    return { type: "edge", a: tri.vC.clone(), b: tri.vA.clone(), closest: nCA };
  }

  return null;
}

function getFaceData(object, faceIndex, worldPoint) {
  const geom = object.geometry;
  if (!geom || !geom.attributes || !geom.attributes.position) {
    return {
      type: "face",
      object,
      point: worldPoint.clone(),
      centroid: worldPoint.clone(),
      normal: new THREE.Vector3(0, 1, 0),
    };
  }

  const pos = geom.attributes.position;
  const index = geom.index;
  let a, b, c;

  if (index) {
    const i3 = faceIndex * 3;
    a = index.getX(i3);
    b = index.getX(i3 + 1);
    c = index.getX(i3 + 2);
  } else {
    a = faceIndex * 3;
    b = a + 1;
    c = a + 2;
  }

  const vA = new THREE.Vector3().fromBufferAttribute(pos, a).applyMatrix4(object.matrixWorld);
  const vB = new THREE.Vector3().fromBufferAttribute(pos, b).applyMatrix4(object.matrixWorld);
  const vC = new THREE.Vector3().fromBufferAttribute(pos, c).applyMatrix4(object.matrixWorld);

  const centroid = new THREE.Vector3().addVectors(vA, vB).add(vC).multiplyScalar(1 / 3);
  const edge1 = new THREE.Vector3().subVectors(vB, vA);
  const edge2 = new THREE.Vector3().subVectors(vC, vA);
  const normal = new THREE.Vector3().crossVectors(edge1, edge2).normalize();

  return { type: "face", object, point: worldPoint.clone(), centroid, normal };
}

// Function to calculate intersection point with mesh geometry along a ray
function calculateMeshIntersection(object, origin, direction) {
  if (!object || !object.geometry) return null;
  
  const raycaster = new THREE.Raycaster();
  raycaster.set(origin, direction);
  raycaster.far = 10; // Set a reasonable maximum distance
  raycaster.near = 0; // Start from the origin point
  
  const intersects = raycaster.intersectObject(object, true);
  if (intersects.length > 0) {
    // Filter out intersections that are too far away or behind the origin
    const validIntersects = intersects.filter(intersect => {
      // Check if intersection is in front of the origin point
      const intersectionDirection = new THREE.Vector3().subVectors(intersect.point, origin);
      return intersectionDirection.dot(direction) > 0 && intersect.distance < 10;
    });
    
    if (validIntersects.length > 0) {
      return validIntersects[0].point;
    }
  }
  
  return null;
}

// Function to calculate more accurate face-to-face intersection
function calculateFaceToFaceIntersection(sel1, sel2) {
  const { n: n1, p: q1 } = planeFrom(sel1);
  const { n: n2, p: q2 } = planeFrom(sel2);
  
  // Calculate direction vector between the two points
  const direction = new THREE.Vector3().subVectors(q2, q1).normalize();
  
  // Try multiple rays to find the best intersection points
  const rays = [
    { origin: q1, direction: direction },
    { origin: q1.clone().add(n1.clone().multiplyScalar(0.01)), direction: direction },
    { origin: q1.clone().add(n1.clone().multiplyScalar(-0.01)), direction: direction },
    { origin: q1.clone().add(n1.clone().cross(direction).normalize().multiplyScalar(0.01)), direction: direction },
    { origin: q2, direction: direction.clone().negate() },
    { origin: q2.clone().add(n2.clone().multiplyScalar(0.01)), direction: direction.clone().negate() },
    { origin: q2.clone().add(n2.clone().multiplyScalar(-0.01)), direction: direction.clone().negate() },
    { origin: q2.clone().add(n2.clone().cross(direction).normalize().multiplyScalar(0.01)), direction: direction.clone().negate() }
  ];
  
  let bestIntersection1 = null;
  let bestIntersection2 = null;
  let minDistance = Infinity;
  
  // Try pairs of rays (one from each face)
  for (let i = 0; i < 4; i++) {
    for (let j = 4; j < 8; j++) {
      const intersection1 = calculateMeshIntersection(sel1.object, rays[i].origin, rays[i].direction);
      const intersection2 = calculateMeshIntersection(sel2.object, rays[j].origin, rays[j].direction);
      
      if (intersection1 && intersection2) {
        const distance = intersection1.distanceTo(intersection2);
        if (distance < minDistance) {
          minDistance = distance;
          bestIntersection1 = intersection1;
          bestIntersection2 = intersection2;
        }
      }
    }
  }
  
  // If we still don't have valid intersections, try a simpler approach
  if (!bestIntersection1 || !bestIntersection2) {
    bestIntersection1 = calculateMeshIntersection(sel1.object, q1, direction);
    bestIntersection2 = calculateMeshIntersection(sel2.object, q2, direction.clone().negate());
    
    if (bestIntersection1 && bestIntersection2) {
      minDistance = bestIntersection1.distanceTo(bestIntersection2);
    }
  }
  
  // If we still don't have valid intersections, use the original points as fallback
  if (!bestIntersection1 || !bestIntersection2) {
    bestIntersection1 = q1;
    bestIntersection2 = q2;
    minDistance = q1.distanceTo(q2);
  }
  
  return { intersection1: bestIntersection1, intersection2: bestIntersection2, distance: minDistance };
}

function computeDimension(sel1, sel2) {
  // Helper to format result — now offsets endpoints slightly outward so
  // lines & labels do not lie inside the mesh (avoid occlusion).
  const makeResult = (start, end, mode, valueOverride) => {
    const s = start.clone();
    const e = end.clone();

    const rawValue = typeof valueOverride === "number" ? valueOverride : s.distanceTo(e);

    // Direction and adaptive offset: small fraction of the measured distance
    const dir = new THREE.Vector3().subVectors(e, s);
    const dist = dir.length() || 1e-6;
    const dirNorm = dir.clone().divideScalar(dist);

    // adaptive offset (world units) — tweak these constants to taste/units
    const OFFSET_MIN = 0.005;
    const OFFSET_MAX = 0.05;
    const adaptiveOffset = Math.min(OFFSET_MAX, Math.max(OFFSET_MIN, dist * 0.02));

    // Push endpoints outward along measurement direction so the line/label sits outside geometry
    // This is important for visibility in SolidWorks-like behavior
    s.addScaledVector(dirNorm, -adaptiveOffset);
    e.addScaledVector(dirNorm, adaptiveOffset);

    const mid = s.clone().add(e).multiplyScalar(0.5);

    return {
      start: toArray(s),
      end: toArray(e),
      mid: toArray(mid),
      value: rawValue,
      text: `${rawValue.toFixed(2)} mm`,
      color: "#111111",
      mode,
    };
  };

  // Plane from face-selection
  const planeFrom = (sel) => {
    const n = sel.normal?.clone().normalize();
    const p = (sel.centroid || sel.point).clone();
    return { n, p };
  };

  // Project a point onto a plane
  const projectPointToPlane = (point, planeNormal, planePoint) => {
    const v = new THREE.Vector3().subVectors(point, planePoint);
    const distSigned = v.dot(planeNormal);
    const projected = point.clone().addScaledVector(planeNormal, -distSigned);
    return { projected, distSigned };
  };

  // Types
  const t1 = sel1.type || (sel1.normal ? "face" : "point");
  const t2 = sel2.type || (sel2.normal ? "face" : "point");

  // Extract reference points
  const p1 = (sel1.centroid ? sel1.centroid.clone() : sel1.point.clone());
  const p2 = (sel2.centroid ? sel2.centroid.clone() : sel2.point.clone());

  // Edge helpers
  const edgeEndpoints = (sel) => [sel.a.clone(), sel.b.clone()];
  const nearestEndpointToPoint = (edgeSel, point) => {
    const [ea, eb] = edgeEndpoints(edgeSel);
    return ea.distanceTo(point) <= eb.distanceTo(point) ? ea : eb;
  };

  // Vertex/Point - Point
  if (t1 === "point" && t2 === "point") {
    return makeResult(p1, p2, "point-point");
  }

  // Edge - Edge (nearest endpoints)
  if (t1 === "edge" && t2 === "edge") {
    const [a1, b1] = edgeEndpoints(sel1);
    const [a2, b2] = edgeEndpoints(sel2);
    const pairs = [
      [a1, a2],
      [a1, b2],
      [b1, a2],
      [b1, b2],
    ];
    let best = pairs[0];
    let bestD = best[0].distanceTo(best[1]);
    for (let i = 1; i < pairs.length; i++) {
      const d = pairs[i][0].distanceTo(pairs[i][1]);
      if (d < bestD) {
        best = pairs[i];
        bestD = d;
      }
    }
    return makeResult(best[0], best[1], "edge-edge");
  }

  // Edge - Point (use nearest edge endpoint)
  if (t1 === "edge" && t2 === "point") {
    const ep = nearestEndpointToPoint(sel1, p2);
    return makeResult(ep, p2, "edge-point");
  }
  if (t1 === "point" && t2 === "edge") {
    const ep = nearestEndpointToPoint(sel2, p1);
    return makeResult(p1, ep, "edge-point");
  }

  // Edge - Face (use edge midpoint as representative point projected orthogonally)
  if (t1 === "edge" && t2 === "face") {
    const [ea, eb] = edgeEndpoints(sel1);
    const mid = ea.clone().add(eb).multiplyScalar(0.5);
    const { n: n2, p: q2 } = planeFrom(sel2);
    const { projected, distSigned } = projectPointToPlane(mid, n2, q2);
    return makeResult(projected, mid, "edge-plane", Math.abs(distSigned));
  }
  if (t1 === "face" && t2 === "edge") {
    const [ea, eb] = edgeEndpoints(sel2);
    const mid = ea.clone().add(eb).multiplyScalar(0.5);
    const { n: n1, p: q1 } = planeFrom(sel1);
    const { projected, distSigned } = projectPointToPlane(mid, n1, q1);
    return makeResult(projected, mid, "edge-plane", Math.abs(distSigned));
  }

  // Point - Plane
  if (t1 === "point" && t2 === "face") {
    const { n: n2, p: q2 } = planeFrom(sel2);
    const { projected, distSigned } = projectPointToPlane(p1, n2, q2);
    return makeResult(projected.clone(), p1.clone(), "point-plane", Math.abs(distSigned));
  }
  if (t1 === "face" && t2 === "point") {
    const { n: n1, p: q1 } = planeFrom(sel1);
    const { projected, distSigned } = projectPointToPlane(p2, n1, q1);
    return makeResult(projected.clone(), p2.clone(), "point-plane", Math.abs(distSigned));
  }

  // Face - Face
  if (t1 === "face" && t2 === "face") {
    // Calculate more accurate face-to-face intersection
    const { intersection1, intersection2, distance } = calculateFaceToFaceIntersection(sel1, sel2);
    
    // If we have valid intersection points, use them
    if (intersection1 && intersection2) {
      return makeResult(intersection1, intersection2, "face-face", distance);
    }
    
    // Fallback to plane-based calculation
    const { n: n1, p: q1 } = planeFrom(sel1);
    const { n: n2, p: q2 } = planeFrom(sel2);
    const dot = Math.abs(n1.dot(n2));

    if (dot > 0.95) {
      // Parallel planes: orthogonal distance along n1
      const d = n1.dot(new THREE.Vector3().subVectors(q2, q1));
      const start = q1.clone();
      const end = q1.clone().addScaledVector(n1, d);
      return makeResult(start, end, "plane-parallel", Math.abs(d));
    } else {
      // Non-parallel faces: SolidWorks-like behavior — use point-to-plane
      // from the second face's reference point to the first face's plane.
      const { projected, distSigned } = projectPointToPlane(q2, n1, q1);
      
      // Calculate intersection points with actual geometry
      // For now, we'll use the projected point and the original point
      // but ensure they're on the surface of the respective faces
      const intersection1 = projected.clone();
      const intersection2 = q2.clone();
      
      return makeResult(intersection1, intersection2, "plane-nonparallel", Math.abs(distSigned));
    }
  }

  // Fallback default
  return makeResult(p1, p2, "point-point");
}
