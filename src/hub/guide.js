// "Follow the arrow": a trail of white chevrons on the floor from the player to
// the target pad (A* round the tables), pulsing toward it, with a big arrow
// head at the end. Recomputed a few times a second.
import { CanvasTexture, Color, DynamicDrawUsage, InstancedMesh, Mesh, MeshBasicMaterial, Object3D, PlaneGeometry, Quaternion, SRGBColorSpace, Vector3 } from 'three'
import { findPath } from './nav.js'
import { floorAt } from './layout.js'
import { paintChevron, paintTriangle } from './paint.js'

const flat = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2)
const UP = new Vector3(0, 1, 0)
const MAX = 90
const STEP = 1.1

export function createGuide(scene) {
  const t = new CanvasTexture(paintChevron())
  t.colorSpace = SRGBColorSpace
  const mesh = new InstancedMesh(new PlaneGeometry(1.05, 1.05), new MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }), MAX)
  mesh.instanceMatrix.setUsage(DynamicDrawUsage)
  mesh.renderOrder = 2
  mesh.frustumCulled = false
  scene.add(mesh)
  const tt = new CanvasTexture(paintTriangle())
  tt.colorSpace = SRGBColorSpace
  const head = new Mesh(new PlaneGeometry(1.5, 1.5), new MeshBasicMaterial({ map: tt, transparent: true, depthWrite: false }))
  head.renderOrder = 2
  scene.add(head)
  const dummy = new Object3D()
  const col = new Color()
  let points = [] // [x, z, yaw]
  let target = null
  let recompute = 0
  let visible = false

  function build(px, pz) {
    points = []
    if (!target) return
    const path = findPath(px, pz, target.x, target.z)
    if (!path) return
    let carry = 1.4 // skip right at the feet
    for (let i = 0; i < path.length - 1; i++) {
      const [ax, az] = path[i]
      const [bx, bz] = path[i + 1]
      const len = Math.hypot(bx - ax, bz - az)
      const yaw = Math.atan2(-(bx - ax), -(bz - az))
      let d = carry
      while (d < len && points.length < MAX) {
        const k = d / len
        points.push([ax + (bx - ax) * k, az + (bz - az) * k, yaw])
        d += STEP
      }
      carry = d - len
    }
    // stop short of the pad itself, the head sits there
    while (points.length && Math.hypot(points[points.length - 1][0] - target.x, points[points.length - 1][1] - target.z) < target.stop) points.pop()
  }

  return {
    // target: { x, z, stop } or null
    setTarget(next) {
      if (next?.x !== target?.x || next?.z !== target?.z) recompute = 0
      target = next
    },
    setVisible(on) {
      visible = on
    },
    update(dt, elapsed, px, pz) {
      const on = visible && target
      mesh.visible = head.visible = !!on
      if (!on) return
      recompute -= dt
      if (recompute <= 0) {
        recompute = 0.3
        build(px, pz)
      }
      const n = points.length
      for (let i = 0; i < n; i++) {
        const [x, z, yaw] = points[i]
        // a bright pulse runs along the trail toward the target
        const wave = 0.5 + 0.5 * Math.sin(i * 0.55 - elapsed * 6)
        dummy.position.set(x, floorAt(x, z) + 0.03, z)
        dummy.quaternion.setFromAxisAngle(UP, yaw).multiply(flat)
        dummy.scale.setScalar(0.85 + wave * 0.25)
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
        mesh.setColorAt(i, col.setScalar(0.65 + wave * 0.35))
      }
      mesh.count = n
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      // arrow head: stands up, points down at the pad, bobbing
      const last = points[n - 1]
      const hx = target.x
      const hz = target.z
      head.position.set(hx, 1.0 + Math.sin(elapsed * 4) * 0.15, hz)
      head.rotation.set(0, last ? last[2] : 0, Math.PI)
    },
  }
}
