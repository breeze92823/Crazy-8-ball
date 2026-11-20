// The skyscraper the hub sits on, its tiled roof with parapet + glass railing,
// and the city far below: instanced towers with a world-space window texture
// (lit windows glow at night), a street grid and a few islands out at sea.
import {
  BoxGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  Vector2,
  Vector3,
} from 'three'
import { CITY, FACADE, ROOF } from '../config.js'
import { RAPIER, addFixed } from '../physics.js'
import { put } from '../propkit.js'
import { mulberry32, paintFacade } from '../textures.js'
import { paintCityBlock, paintFloor, tex } from './paint.js'
import { M } from './props.js'

// Facade material with UVs from world position, so one texture tiles windows at
// the same size on every instanced building whatever its scale.
function facadeMaterial() {
  const f = paintFacade(FACADE.glass, 512, 8, 4, 606)
  const map = tex(f.color)
  const lit = tex(f.lit)
  const m = new MeshStandardMaterial({ map, emissiveMap: lit, emissive: new Color('#ffd9a0'), emissiveIntensity: 0.2, roughness: 0.55, metalness: 0.1 })
  m.onBeforeCompile = (shader) => {
    shader.uniforms.cell = { value: new Vector2(FACADE.cellW, FACADE.cellH) }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform vec2 cell;')
      .replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
        {
          vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vec3 an = abs(normal);
          vec2 w = an.x > 0.5 ? wp.zy : wp.xy;
          vec2 fuv = an.y > 0.5 ? vec2(0.004, 0.004) : w / cell;
          vMapUv = fuv;
          vEmissiveMapUv = fuv;
        }`,
      )
  }
  return m
}

export function buildRooftop(scene) {
  const group = new Group()
  scene.add(group)
  const { halfX, minZ, maxZ, towerHeight } = ROOF
  const W = halfX * 2
  const D = maxZ - minZ
  const cz = (minZ + maxZ) / 2

  // --- floor ---
  const fl = paintFloor(ROOF.floor, ROOF.grout)
  const rep = [W / (ROOF.tile * 2), D / (ROOF.tile * 2)]
  const floorMat = new MeshStandardMaterial({ map: tex(fl.color, { repeat: rep }), normalMap: tex(fl.normal, { repeat: rep, srgb: false }), normalScale: new Vector2(0.5, 0.5), roughness: 0.8, metalness: 0 })
  const floor = new Mesh(new PlaneGeometry(W + 1.2, D + 1.2), floorMat)
  floor.rotation.x = -Math.PI / 2
  floor.position.set(0, 0, cz)
  floor.receiveShadow = true
  group.add(floor)
  addFixed(RAPIER.ColliderDesc.cuboid(halfX + 1, 0.5, D / 2 + 1), { x: 0, y: -0.5, z: cz })

  // --- tower (one instanced building, so it shares the city's facade shader) ---
  const facade = facadeMaterial()
  const tower = new InstancedMesh(new BoxGeometry(1, 1, 1), facade, 1)
  tower.setMatrixAt(0, new Matrix4().compose(new Vector3(0, -towerHeight / 2 - 1.2, cz), new Quaternion(), new Vector3(W + 1.2, towerHeight - 2.4, D + 1.2)))
  tower.setColorAt(0, new Color('#f4ecf0'))
  group.add(tower)
  // cornice bands under the roof edge
  const stone = new MeshStandardMaterial({ color: '#efe6e1', roughness: 0.85 })
  // top sits 3 cm under the tiled floor plane (y = 0): coplanar tops z-fought and striped the roof
  put(group, new BoxGeometry(W + 2.2, 1.2, D + 2.2), stone, 0, -0.63, cz, false).receiveShadow = true
  put(group, new BoxGeometry(W + 1.6, 0.5, D + 1.6), M.dark(), 0, -1.45, cz, false)

  // --- parapet + glass railing all round ---
  const glass = new MeshPhysicalMaterial({ color: '#cfe8ff', roughness: 0.05, metalness: 0, transparent: true, opacity: 0.22, depthWrite: false, envMapIntensity: 1.5 })
  const sides = [
    [0, minZ - 0.2, W + 0.8, 0], // north (x span)
    [0, maxZ + 0.2, W + 0.8, 0], // south
    [-halfX - 0.2, cz, D + 0.8, 1], // west (z span)
    [halfX + 0.2, cz, D + 0.8, 1],
  ]
  const postGeo = new BoxGeometry(0.09, ROOF.railing, 0.09)
  const posts = []
  for (const [x, z, len, alongZ] of sides) {
    const sx = alongZ ? 0.45 : len
    const sz = alongZ ? len : 0.45
    const wall = put(group, new BoxGeometry(sx, ROOF.parapet, sz), stone, x, ROOF.parapet / 2, z)
    wall.receiveShadow = true
    put(group, new BoxGeometry(alongZ ? 0.04 : len, ROOF.railing - 0.1, alongZ ? len : 0.04), glass, x, ROOF.parapet + ROOF.railing / 2, z, false)
    put(group, new BoxGeometry(alongZ ? 0.16 : len, 0.08, alongZ ? len : 0.16), M.walnut(), x, ROOF.parapet + ROOF.railing, z)
    const n = Math.round(len / 2.4)
    for (let i = 0; i <= n; i++) {
      const t = -len / 2 + (len * i) / n
      posts.push(alongZ ? [x, z + t] : [x + t, z])
    }
    // invisible wall higher than a jump from the parapet, low enough for the camera to see over
    addFixed(RAPIER.ColliderDesc.cuboid(sx / 2, 1.6, sz / 2), { x, y: 1.6, z })
  }
  const postMesh = new InstancedMesh(postGeo, M.dark(), posts.length)
  posts.forEach(([x, z], i) => postMesh.setMatrixAt(i, new Matrix4().makeTranslation(x, ROOF.parapet + ROOF.railing / 2, z)))
  postMesh.castShadow = true
  group.add(postMesh)

  buildCity(group, facade)
  return { group, facade }
}

function buildCity(group, facade) {
  const rand = mulberry32(CITY.seed)
  const ground = -ROOF.towerHeight
  const c = CITY.cell
  const items = []
  for (let gx = -CITY.radius; gx <= CITY.radius; gx += c) {
    for (let gz = -CITY.radius; gz <= CITY.radius; gz += c) {
      const d = Math.hypot(gx, gz)
      if (d > CITY.radius) continue
      if (Math.abs(gx) < CITY.clearX && Math.abs(gz) < CITY.clearZ) continue
      // a block holds 1-4 buildings
      const split = rand() < 0.5 ? 1 : 2
      for (let i = 0; i < split; i++) for (let k = 0; k < split; k++) {
        const fw = (c * 0.62) / split
        const x = gx + (split === 1 ? 0 : (i - 0.5) * c * 0.34)
        const z = gz + (split === 1 ? 0 : (k - 0.5) * c * 0.34)
        // taller towards a skyline ring, a few landmark towers
        const ring = Math.exp(-(((d - 170) / 120) ** 2))
        let h = CITY.minH + rand() * (CITY.maxH - CITY.minH) * (0.35 + ring * 0.65)
        if (rand() < CITY.towers) h *= 1.7
        const w = fw * (0.75 + rand() * 0.25)
        const dd = fw * (0.75 + rand() * 0.25)
        const tint = new Color().setHSL(0.6 + rand() * 0.15, 0.25 + rand() * 0.2, 0.72 + rand() * 0.18)
        items.push([x, ground + h / 2, z, w, h, dd, tint])
        if (h > 90 && rand() < 0.6) items.push([x, ground + h + h * 0.08, z, w * 0.6, h * 0.16, dd * 0.6, tint]) // setback crown
      }
    }
  }
  const city = new InstancedMesh(new BoxGeometry(1, 1, 1), facade, items.length)
  const m = new Matrix4()
  const q = new Quaternion()
  items.forEach(([x, y, z, w, h, d, tint], i) => {
    city.setMatrixAt(i, m.compose(new Vector3(x, y, z), q, new Vector3(w, h, d)))
    city.setColorAt(i, tint)
  })
  group.add(city)

  // streets
  const block = tex(paintCityBlock(), { repeat: [(CITY.radius * 2.4) / c, (CITY.radius * 2.4) / c] })
  const streets = new Mesh(new CircleGeometry(CITY.radius * 1.2, 64), new MeshStandardMaterial({ map: block, roughness: 0.95 }))
  streets.rotation.x = -Math.PI / 2
  streets.position.y = ground + 0.05
  // offset so roads fall between the buildings (cell centres are block centres)
  const o = -((((0.2 * CITY.radius - c / 2) / c) % 1) + 1) % 1
  block.offset.set(o, o)
  group.add(streets)
  // beach ring between city and sea
  const sand = new Mesh(new CircleGeometry(CITY.radius * 1.32, 64), new MeshStandardMaterial({ color: '#f1dcae', roughness: 1 }))
  sand.rotation.x = -Math.PI / 2
  sand.position.y = ground - 0.35
  group.add(sand)

  // islands out at sea
  const green = new MeshStandardMaterial({ color: '#3f8f3a', roughness: 1, flatShading: true })
  const beach = new MeshStandardMaterial({ color: '#f3e3b5', roughness: 1 })
  for (const [x, z, r] of CITY.islands) {
    const isl = new Group()
    isl.position.set(x, ground - 1, z)
    const geo = new ConeGeometry(r, r * 0.9, 9, 4)
    const pos = geo.attributes.position
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) < r * 0.44) pos.setX(i, pos.getX(i) * (0.85 + rand() * 0.3))
    }
    geo.computeVertexNormals()
    put(isl, geo, green, 0, r * 0.45, 0, false)
    const b = put(isl, new CircleGeometry(r * 1.15, 24), beach, 0, 0.2, 0, false)
    b.rotation.x = -Math.PI / 2
    group.add(isl)
  }
}
