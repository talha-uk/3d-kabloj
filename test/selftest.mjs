import * as THREE from 'three'
import { cameraBasis, flyDelta } from '../src/fly.js'
import { headingFromQuaternion, portOrientation, portRoll } from '../src/yaw.js'
import { softSnap, softSnapAngle } from '../src/snap.js'
import { focusFor } from '../src/focus.js'
import { routeClear, routePlacement, routeSchema, routeThrough } from '../src/route.js'
import { addCable, addComponent, addModel, addPort, emptyState, uid } from '../src/state.js'
import fs from 'node:fs'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

let failed = 0
function check(name, ok) {
  if (!ok) {
    failed += 1
    console.error('FAIL', name)
  } else {
    console.log('ok', name)
  }
}

const state = emptyState()
const withModel = addModel(state, { id: 'm', name: 'Kutu', file: 'kutu.glb' })
let next = addComponent(withModel, 'm', 'A')
next = addComponent(next, 'm', 'B')
const [a, b] = next.components
const pa = { id: uid(), name: 'Uç', position: [0.5, 0, 0], normal: [1, 0, 0] }
const pb = { id: uid(), name: 'Uç', position: [-0.5, 0, 0], normal: [-1, 0, 0] }
next = addPort(next, a.id, pa)
next = addPort(next, b.id, pb)
next = addCable(next, { componentId: a.id, portId: pa.id }, { componentId: b.id, portId: pb.id }, 'guc')

const cableFocus = focusFor(next, { kind: 'cable', cableId: next.cables[0].id })
check('kablo odağı iki ucu tutar', cableFocus.components.has(a.id) && cableFocus.components.has(b.id) && cableFocus.cables.size === 1)

const portFocus = focusFor(next, { kind: 'port', componentId: a.id, portId: pa.id })
check('port odağı kendisini tutar', portFocus.portFocus && portFocus.ports.has(`${a.id}:${pa.id}`))
check('port odağı bağlı kabloyu tutar', portFocus.cables.has(next.cables[0].id))
check('port odağı öteki ucu tutar', portFocus.ports.has(`${b.id}:${pb.id}`))

const partFocus = focusFor(next, { kind: 'component', componentId: a.id })
check('parça odağı bağlı parçayı tutar', partFocus.components.has(b.id) && partFocus.cables.has(next.cables[0].id))

const hidden = focusFor({ ...next, hiddenTypes: ['guc'] }, { kind: 'component', componentId: a.id })
check('gizli tür odağa girmez', hidden.cables.size === 0 && hidden.components.size === 1)

const placed = routePlacement([0, 0, 0], [0, 1, 0], [1, 0, 0], [0, 1, 0], [0, 0, 0])
check('yerleşim kablosu sarkar', placed && placed[2][1] < 0)

const flat = routeSchema([0, 1, 0], [1, 0, 0], [2, 1, 1], [-1, 0, 0], 0.02, [0, 0])
check('şema kablosu aynı yükseklikte', flat && flat.every((point) => Math.abs(point[1] - 0.02) < 1e-6))
check('şema kablosu iki ucu bağlar', flat[0][0] === 0 && flat.at(-1)[0] === 2)

const blocked = routeClear([-2, 0, 0], [-1, 0, 0], [2, 0, 0], [1, 0, 0], [{ min: [-0.4, -0.4, -0.4], max: [0.4, 0.4, 0.4] }], 0)
const samples = []
for (let i = 1; i < blocked.length - 1; i += 1) samples.push(blocked[i])
const through = samples.some((point) => Math.abs(point[0]) < 0.4 && Math.abs(point[1]) < 0.4 && Math.abs(point[2]) < 0.4)
check('kablo engelin içinden geçmez', blocked && blocked.some((point) => point[1] > 0.4) && !through)
const via = routeThrough([0, 0, 0], [0, 1, 0], [2, 0, 0], [0, 1, 0], [1, 0.4, 0.5])
check('kıvrım noktası kablonun üstünde', via && via.some((point) => point[0] === 1 && point[1] === 0.4 && point[2] === 0.5))
const clear = routeClear([-2, 1, 0], [0, 1, 0], [2, 1, 0], [0, 1, 0], [], 1)
check('boş yolda ikinci kablo yükselir', clear && clear[2][1] > clear[0][1])

const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100)
camera.up.set(0, 0, -1)
camera.position.set(0, 10, 0)
camera.lookAt(0, 0, 0)
camera.updateMatrixWorld(true)
const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0)
const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1)
check('şema kamerasında sağ +X', right.x > 0.9 && Math.abs(right.z) < 0.1)
check('şema kamerasında yukarı -Z', up.z < -0.9 && Math.abs(up.x) < 0.1)

const look = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
look.position.set(0, 1, 5)
look.lookAt(0, 1, 0)
look.updateMatrixWorld(true)
const ahead = flyDelta(look, { forward: 1, strafe: 0 }, 1)
const aside = flyDelta(look, { forward: 0, strafe: 1 }, 1)
check('W bakılan yere gider', ahead.z < -0.9 && Math.abs(ahead.x) < 0.1)
check('D sağa gider', aside.x > 0.9 && Math.abs(aside.z) < 0.1)
const risen = flyDelta(look, { forward: 0, strafe: 0, lift: 1 }, 1)
check('E yukarı gider', risen.y > 0.9 && Math.abs(risen.x) < 0.1 && Math.abs(risen.z) < 0.1)
const plan = cameraBasis(camera)
check('şemada W ekranın yukarısı', plan.fwd.z < -0.9)
check('şemada D ekranın sağı', plan.right.x > 0.9)
for (const angle of [0, 0.4, -1.2, 2.7, -3]) {
  const turned = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, angle, 0))
  const back = headingFromQuaternion(turned)
  const wrapped = Math.atan2(Math.sin(angle), Math.cos(angle))
  check(`yaw ${angle} korunur`, Math.abs(Math.atan2(Math.sin(back - wrapped), Math.cos(back - wrapped))) < 1e-5)
}
const axis = new THREE.Vector3(0.2, 0.9, -0.3).normalize()
const spun = portOrientation(axis, 0.8)
const read = portRoll(spun, axis)
check('port dönüşü korunur', Math.abs(Math.atan2(Math.sin(read - 0.8), Math.cos(read - 0.8))) < 1e-4)
check('ızgara yakını yapışır', softSnap(1.1) === 1)
check('ızgara uzağı serbest', softSnap(1.4) === 1.4)
check('ufak açı yapışır', softSnapAngle(Math.PI / 90) === 0)
check('ara açı serbest', Math.abs(softSnapAngle(Math.PI / 18) - Math.PI / 18) < 1e-9)

const glb = boxGlb()
fs.mkdirSync(new URL('../public/', import.meta.url), { recursive: true })
fs.writeFileSync(new URL('../public/test-kutu.glb', import.meta.url), glb)
check('örnek glb yazıldı', glb.byteLength > 100)
const parsed = await new GLTFLoader().parseAsync(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength), '')
check('glb sahneye çıkar', parsed.scene.children.length === 1)

function boxGlb() {
  const faces = [
    [[0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5], [1, 0, 0]],
    [[-0.5, -0.5, 0.5], [-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [-0.5, 0.5, 0.5], [-1, 0, 0]],
    [[-0.5, 0.5, -0.5], [-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5], [0, 1, 0]],
    [[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, -0.5, -0.5], [-0.5, -0.5, -0.5], [0, -1, 0]],
    [[-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, -0.5, 0.5], [0, 0, 1]],
    [[0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5], [-0.5, -0.5, -0.5], [0, 0, -1]]
  ]
  const positions = []
  const normals = []
  const indices = []
  for (const face of faces) {
    const base = positions.length / 3
    const normal = face[4]
    for (let i = 0; i < 4; i += 1) {
      positions.push(...face[i])
      normals.push(...normal)
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }
  const bin = Buffer.alloc(648)
  for (let i = 0; i < positions.length; i += 1) bin.writeFloatLE(positions[i], i * 4)
  for (let i = 0; i < normals.length; i += 1) bin.writeFloatLE(normals[i], 288 + i * 4)
  for (let i = 0; i < indices.length; i += 1) bin.writeUInt16LE(indices[i], 576 + i * 2)
  const json = JSON.stringify({
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: 'Kutu' }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }] }],
    materials: [{ name: 'kutu', pbrMetallicRoughness: { baseColorFactor: [0.62, 0.66, 0.7, 1], metallicFactor: 0.2, roughnessFactor: 0.6 } }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 24, type: 'VEC3', min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] },
      { bufferView: 1, componentType: 5126, count: 24, type: 'VEC3' },
      { bufferView: 2, componentType: 5123, count: 36, type: 'SCALAR' }
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 288, target: 34962 },
      { buffer: 0, byteOffset: 288, byteLength: 288, target: 34962 },
      { buffer: 0, byteOffset: 576, byteLength: 72, target: 34963 }
    ],
    buffers: [{ byteLength: 648 }]
  })
  const jsonBuf = Buffer.from(json)
  const jsonPad = (4 - (jsonBuf.length % 4)) % 4
  const jsonChunk = Buffer.concat([jsonBuf, Buffer.alloc(jsonPad, 0x20)])
  const binPad = (4 - (bin.length % 4)) % 4
  const binChunk = Buffer.concat([bin, Buffer.alloc(binPad)])
  const total = 12 + 8 + jsonChunk.length + 8 + binChunk.length
  const out = Buffer.alloc(total)
  out.writeUInt32LE(0x46546c67, 0)
  out.writeUInt32LE(2, 4)
  out.writeUInt32LE(total, 8)
  out.writeUInt32LE(jsonChunk.length, 12)
  out.writeUInt32LE(0x4e4f534a, 16)
  jsonChunk.copy(out, 20)
  const binStart = 20 + jsonChunk.length
  out.writeUInt32LE(binChunk.length, binStart)
  out.writeUInt32LE(0x004e4942, binStart + 4)
  binChunk.copy(out, binStart + 8)
  return out
}

if (failed) {
  console.error(failed, 'hata')
  process.exit(1)
}
console.log('selftest geçti')
