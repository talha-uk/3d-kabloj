import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { TransformControls } from 'three/addons/controls/TransformControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { clone as cloneObject } from 'three/addons/utils/SkeletonUtils.js'
import { focusFor } from './focus.js'
import { flyDelta } from './fly.js'
import { headingFromQuaternion, portOrientation, portRoll, wrapAngle } from './yaw.js'
import { softSnap, softSnapAngle } from './snap.js'
import { CABLE_RADIUS, SCHEMA_LIFT, routeClear, routeSchema, routeVia } from './route.js'
const CABLE_COLOR = {
  sma: 0xd4af37,
  rf: 0xd4af37,
  ntype: 0x8e959b,
  usb2: 0x1a1a1a,
  usb: 0x1a1a1a,
  usb3: 0x1d4ed8,
  usbc: 0xd5dbe3,
  ag: 0xf4f4f4,
  guc: 0xc62828,
  diger: 0xc4a35a
}

function ownedBox(width, height, depth) {
  const geometry = new THREE.BoxGeometry(width, height, depth)
  geometry.userData.owned = true
  return geometry
}

function tagPort(mesh, component, port) {
  mesh.userData.kind = 'port'
  mesh.userData.componentId = component.id
  mesh.userData.portId = port.id
  mesh.castShadow = true
  return mesh
}

function addEthernetPort(pivot, radius, height, lift, component, port) {
  const width = radius * 2.7
  const face = radius * 2.25
  const depth = height
  const shell = remember(new THREE.MeshStandardMaterial({ color: 0xc5ccd1, metalness: 0.78, roughness: 0.28 }))
  const plastic = remember(new THREE.MeshStandardMaterial({ color: 0x1a1c1f, metalness: 0.04, roughness: 0.58 }))
  const cavity = remember(new THREE.MeshStandardMaterial({ color: 0x050607, metalness: 0.08, roughness: 0.82 }))
  const gold = remember(new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.92, roughness: 0.22 }))
  const localUp = new THREE.Vector3(0, 1, 0).applyQuaternion(pivot.quaternion.clone().invert())
  const up = Math.abs(localUp.z) >= Math.abs(localUp.x) ? Math.sign(localUp.z) || 1 : 1
  const bezel = tagPort(new THREE.Mesh(ownedBox(width * 1.16, depth * 0.14, face * 1.16), shell), component, port)
  bezel.position.y = lift + depth * 0.07
  const body = tagPort(new THREE.Mesh(ownedBox(width, depth * 0.62, face), shell), component, port)
  body.position.y = lift + depth * 0.42
  const nose = tagPort(new THREE.Mesh(ownedBox(width * 0.76, depth * 0.26, face * 0.7), plastic), component, port)
  nose.position.y = lift + depth * 0.78
  const mouth = tagPort(new THREE.Mesh(ownedBox(width * 0.58, depth * 0.07, face * 0.4), cavity), component, port)
  mouth.position.set(0, lift + depth * 0.9, -up * face * 0.05)
  const latch = tagPort(new THREE.Mesh(ownedBox(width * 0.26, depth * 0.2, face * 0.11), plastic), component, port)
  latch.position.set(0, lift + depth * 0.88, up * face * 0.3)
  pivot.add(bezel, body, nose, mouth, latch)
  const span = width * 0.48
  for (let pin = 0; pin < 8; pin += 1) {
    const contact = tagPort(new THREE.Mesh(ownedBox(width * 0.032, depth * 0.045, face * 0.14), gold), component, port)
    contact.position.set(-span / 2 + (span / 7) * pin, lift + depth * 0.94, -up * face * 0.16)
    pivot.add(contact)
  }
}

function portProfile(type, radius) {
  if (type === 'ag') return { kind: 'box', width: radius * 2.35, breadth: radius * 2.35 }
  if (type === 'usb' || type === 'usb2' || type === 'usb3') return { kind: 'box', width: radius * 3.4, breadth: radius * 1.2 }
  if (type === 'usbc') return { kind: 'usbc', width: radius * 2.8, breadth: radius * 1.05 }
  return { kind: 'round', width: radius * 2, breadth: radius * 2 }
}

function portGeometry(profile, depth) {
  if (profile.kind === 'usbc') {
    const shape = new THREE.Shape()
    const reach = profile.breadth / 2
    const half = Math.max(profile.width / 2, reach + 1e-4)
    shape.absarc(half - reach, 0, reach, -Math.PI / 2, Math.PI / 2, false)
    shape.absarc(-half + reach, 0, reach, Math.PI / 2, Math.PI * 1.5, false)
    const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 8 })
    geometry.rotateX(-Math.PI / 2)
    geometry.userData.owned = true
    return geometry
  }
  if (profile.kind === 'box') {
    const geometry = new THREE.BoxGeometry(profile.width, depth, profile.breadth)
    geometry.userData.owned = true
    return geometry
  }
  const geometry = new THREE.CylinderGeometry(profile.width / 2, profile.width / 2, depth, 16)
  geometry.userData.owned = true
  return geometry
}

function remember(material) {
  if (material.color && !material.userData.base) material.userData.base = material.color.clone()
  if (material.emissive && !material.userData.baseEmissive) {
    material.userData.baseEmissive = material.emissive.clone()
  }
  if (material.emissiveIntensity != null && material.userData.baseEI == null) {
    material.userData.baseEI = material.emissiveIntensity
  }
  return material
}

function cloneMaterials(root) {
  root.traverse((object) => {
    if (!object.isMesh) return
    const apply = (material) => {
      const cloned = remember(material.clone())
      cloned.side = THREE.DoubleSide
      return cloned
    }
    if (Array.isArray(object.material)) object.material = object.material.map(apply)
    else object.material = apply(object.material)
  })
}

function paintMaterial(material, bright, dim) {
  if (!material?.color || !material.userData.base) return
  material.color.copy(material.userData.base)
  if (!bright) material.color.multiplyScalar(dim)
  if (material.emissive && material.userData.baseEmissive) {
    material.emissive.copy(material.userData.baseEmissive)
    if (!bright) material.emissive.multiplyScalar(0)
  }
  if (material.emissiveIntensity != null && material.userData.baseEI != null) {
    material.emissiveIntensity = bright ? material.userData.baseEI : 0
  }
}

function paintObject(object, bright, dim) {
  object.traverse((child) => {
    if (!child.isMesh) return
    const materials = Array.isArray(child.material) ? child.material : [child.material]
    materials.forEach((material) => paintMaterial(material, bright, dim))
  })
}

function jacketTexture(dashed) {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 16
  const context = canvas.getContext('2d')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, 64, 16)
  context.fillStyle = '#000000'
  if (dashed) {
    context.clearRect(0, 0, 64, 16)
    context.fillStyle = '#ffffff'
    for (let x = 0; x < 64; x += 16) context.fillRect(x, 0, 9, 16)
  } else {
    for (let x = 0; x < 64; x += 8) context.fillRect(x, 0, 2, 16)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function measure(scene) {
  const box = new THREE.Box3().setFromObject(scene)
  if (box.isEmpty()) return { s: 1, x: 0, y: 0, z: 0 }
  const s = 1 / Math.max(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z, 1e-6)
  return {
    s,
    x: -((box.min.x + box.max.x) / 2) * s,
    y: -box.min.y * s,
    z: -((box.min.z + box.max.z) / 2) * s
  }
}

function stripExtras(root) {
  const extras = []
  root.traverse((object) => {
    if (object.isLight || object.isCamera) extras.push(object)
  })
  extras.forEach((object) => object.removeFromParent())
}

export class View {
  constructor(canvas, hooks) {
    this.canvas = canvas
    this.hooks = hooks
    this.state = null
    this.mode = 'yerlesim'
    this.tool = 'sec'
    this.selection = null
    this.hover = null
    this.pending = null
    this.gen = 0
    this.live = true
    this.models = new Map()
    this.groups = new Map()
    this.pivots = new Map()
    this.cableMeshes = new Map()
    this.bend = null
    this.down = null
    this.pan = null
    this.bendDrag = null
    this.viewHalf = 4

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance'
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 0.38
    this.dim = 0.45
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color('#d5d0c6')
    this.perspective = new THREE.PerspectiveCamera(45, 1, 0.02, 200)
    this.perspective.position.set(3, 2.4, 4)
    this.perspective.up.set(0, 1, 0)
    this.ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100)
    this.ortho.position.set(0, 12, 0)
    // Üstten bakış. Ekranın yukarısı dünya -Z olur. Orbit bu kamerayı döndürmez.
    this.ortho.up.set(0, 0, -1)
    this.ortho.lookAt(0, 0, 0)

    this.loader = new GLTFLoader()
    this.raycaster = new THREE.Raycaster()
    this.pointer = new THREE.Vector2()
    this.solid = jacketTexture(false)
    this.dashed = jacketTexture(true)

    const pmrem = new THREE.PMREMGenerator(this.renderer)
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    pmrem.dispose()

    const hemi = new THREE.HemisphereLight(0xfff6ea, 0x8a8175, 0.55)
    this.scene.add(hemi)
    const sun = new THREE.DirectionalLight(0xffffff, 1.35)
    sun.position.set(4, 9, 3)
    sun.castShadow = true
    sun.shadow.mapSize.set(1024, 1024)
    sun.shadow.camera.near = 0.2
    sun.shadow.camera.far = 40
    sun.shadow.camera.left = -10
    sun.shadow.camera.right = 10
    sun.shadow.camera.top = 10
    sun.shadow.camera.bottom = -10
    this.scene.add(sun)

    this.grid = new THREE.GridHelper(24, 24, 0x5c564c, 0x8a8175)
    this.grid.position.y = 0
    this.scene.add(this.grid)

    this.pickRoot = new THREE.Group()
    this.inspectRoot = new THREE.Group()
    this.cableRoot = new THREE.Group()
    this.bendRoot = new THREE.Group()
    this.scene.add(this.pickRoot, this.inspectRoot, this.cableRoot, this.bendRoot)

    this.orbit = new OrbitControls(this.perspective, canvas)
    this.orbit.enableDamping = false
    this.orbit.target.set(0, 0.4, 0)
    this.orbit.addEventListener('change', () => this.requestRender())

    this.transform = new TransformControls(this.perspective, canvas)
    this.transform.setSize(1.6)
    this.scene.add(this.transform.getHelper())
    canvas.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return
      this.setPointer(event)
      if (this.bendUnderPointer()) {
        this.orbit.enabled = false
        this.transform.enabled = false
        this.holdingBend = true
        return
      }
      if (this.gizmoHandleHit()) {
        this.orbit.enabled = false
        this.transform.enabled = true
        this.holdingGizmo = true
        return
      }
      this.transform.enabled = false
      this.holdingGizmo = false
      if (this.mode !== 'sema') this.orbit.enabled = true
    }, true)
    this.transform.addEventListener('dragging-changed', (event) => {
      this.orbit.enabled = !event.value && this.mode !== 'sema'
      if (event.value) this.hooks.onPoseStart?.()
      else this.commitPose()
    })
    this.transform.addEventListener('objectChange', () => {
      this.softenTransform()
      this.syncCables()
      this.requestRender()
    })

    this.box = null
    this.syncClearColor()
    const scheme = matchMedia('(prefers-color-scheme: dark)')
    scheme.addEventListener('change', () => {
      this.syncClearColor()
      this.requestRender()
    })

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(canvas.parentElement)
    window.addEventListener('pointerup', () => {
      this.transform.enabled = true
      this.holdingGizmo = false
      if (!this.transform.dragging && !this.bendDrag && this.mode !== 'sema') this.orbit.enabled = true
    })
    canvas.addEventListener('pointerdown', (event) => {
      if (event.button === 1) {
        event.preventDefault()
        this.onMiddle(event)
        return
      }
      this.onDown(event)
    })
    canvas.addEventListener('auxclick', (event) => event.preventDefault())
    canvas.addEventListener('pointermove', (event) => this.onMove(event))
    window.addEventListener('pointerup', (event) => this.onUp(event))
    canvas.addEventListener('wheel', (event) => this.onWheel(event), { passive: false })
    canvas.addEventListener('contextmenu', (event) => event.preventDefault())

    this.resize()
    this.flyKeys = new Set()
    this.flyFast = false
    this.clock = new THREE.Clock()
    window.addEventListener('keydown', (event) => this.onFlyDown(event))
    window.addEventListener('keyup', (event) => this.onFlyUp(event))
    window.addEventListener('blur', () => {
      this.flyKeys.clear()
      this.flyFast = false
    })
    this.tick = this.tick.bind(this)
    requestAnimationFrame(this.tick)
  }

  onFlyDown(event) {
    const typing = event.target instanceof HTMLInputElement
      || event.target instanceof HTMLTextAreaElement
      || event.target instanceof HTMLSelectElement
      || event.target.closest?.('[role="toolbar"], [role="tablist"], dialog')
    if (typing) return
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') this.flyFast = true
    if (!['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) return
    this.flyKeys.add(event.code)
    event.preventDefault()
  }

  onFlyUp(event) {
    this.flyKeys.delete(event.code)
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') this.flyFast = false
  }

  applyFly(dt) {
    if (this.transform.dragging) return
    let forward = 0
    let strafe = 0
    let lift = 0
    if (this.flyKeys.has('KeyW') || this.flyKeys.has('ArrowUp')) forward += 1
    if (this.flyKeys.has('KeyS') || this.flyKeys.has('ArrowDown')) forward -= 1
    if (this.flyKeys.has('KeyD') || this.flyKeys.has('ArrowRight')) strafe += 1
    if (this.flyKeys.has('KeyA') || this.flyKeys.has('ArrowLeft')) strafe -= 1
    if (this.flyKeys.has('KeyE')) lift += 1
    if (this.flyKeys.has('KeyQ')) lift -= 1
    if (!forward && !strafe && !lift) return
    const camera = this.activeCamera()
    camera.updateMatrixWorld(true)
    const span = this.mode === 'sema'
      ? this.viewHalf / Math.max(this.ortho.zoom, 0.2)
      : this.perspective.position.distanceTo(this.orbit.target)
    const step = Math.max(0.35, span * 0.7) * (this.flyFast ? 2.4 : 1) * dt
    const delta = flyDelta(camera, { forward, strafe, lift }, step)
    if (delta.lengthSq() < 1e-10) return
    if (this.mode === 'sema') {
      this.ortho.position.add(delta)
      this.ortho.up.set(0, 0, -1)
      this.ortho.lookAt(this.ortho.position.x, 0, this.ortho.position.z)
      this.ortho.updateMatrixWorld(true)
    } else {
      this.perspective.position.add(delta)
      this.orbit.target.add(delta)
    }
  }

  syncClearColor() {
    const color = getComputedStyle(document.getElementById('gorunum')).backgroundColor || '#d5d0c6'
    this.scene.background.set(color)
    this.renderer.setClearColor(color, 1)
    const channels = color.match(/[\d.]+/g)?.map(Number) || [213, 208, 198]
    const dark = channels[0] < 80
    const major = dark ? 0x6f675c : 0x8a8175
    const minor = dark ? 0x3c3832 : 0xb7b0a4
    this.grid.material.color?.set(major)
    if (Array.isArray(this.grid.material)) {
      this.grid.material[0].color.set(major)
      this.grid.material[1].color.set(minor)
    }
  }

  requestRender() {
    this.live = true
  }

  tick() {
    requestAnimationFrame(this.tick)
    const dt = Math.min(this.clock.getDelta(), 0.05)
    if (this.flyKeys.size) {
      this.applyFly(dt)
      this.live = true
    }
    if (!this.live) return
    if (this.box) this.box.update()
    this.renderer.render(this.scene, this.activeCamera())
    this.live = false
  }

  activeCamera() {
    return this.mode === 'sema' ? this.ortho : this.perspective
  }

  resize() {
    const parent = this.canvas.parentElement
    const width = Math.max(1, parent.clientWidth)
    const height = Math.max(1, parent.clientHeight)
    this.renderer.setSize(width, height, false)
    this.perspective.aspect = width / height
    this.perspective.updateProjectionMatrix()
    const aspect = width / height
    this.ortho.top = this.viewHalf
    this.ortho.bottom = -this.viewHalf
    this.ortho.left = -this.viewHalf * aspect
    this.ortho.right = this.viewHalf * aspect
    this.ortho.updateProjectionMatrix()
    this.requestRender()
  }

  async setState(state) {
    this.state = state
    const generation = ++this.gen
    await this.ensureModels()
    if (generation !== this.gen || this.state !== state) return
    this.syncComponents()
    this.syncInspect()
    this.syncCables()
    this.syncGizmo()
    this.applyFocus()
    this.requestRender()
  }

  setMode(mode) {
    if (this.mode === mode) return
    this.mode = mode
    this.pending = null
    this.orbit.enabled = mode !== 'sema'
    this.pickRoot.visible = mode !== 'incele'
    this.cableRoot.visible = mode !== 'incele'
    this.grid.visible = true
    if (mode === 'sema') this.frameSchema()
    this.syncComponents()
    this.syncInspect()
    this.syncCables()
    this.syncGizmo()
    this.applyFocus()
    this.requestRender()
  }

  setTool(tool) {
    this.tool = tool
    if (tool !== 'kablo') this.pending = null
    this.syncGizmo()
    this.requestRender()
  }

  setSelection(selection) {
    this.selection = selection
    this.syncGizmo()
    this.syncCables()
    this.applyFocus()
    this.requestRender()
  }

  frameComponent(id) {
    const group = this.groups.get(id)
    if (!group) return
    this.frameObject(group)
    this.requestRender()
  }

  setHover(hit) {
    const key = this.hitKey(hit)
    if (key === this.hitKey(this.hover)) return
    this.hover = hit
    this.applyFocus()
    this.requestRender()
  }

  cancelCable() {
    this.pending = null
    this.applyFocus()
    this.requestRender()
  }

  frame() {
    if (this.mode === 'sema') this.frameSchema()
    else if (this.mode === 'incele') this.frameObject(this.inspectRoot)
    else this.frameObject(this.pickRoot)
    this.requestRender()
  }

  async ensureModels() {
    await Promise.all(this.state.models.map(async (model) => {
      if (this.models.has(model.id)) return
      const buffer = await this.hooks.modelBuffer(model)
      if (!buffer) return
      const gltf = await this.loader.parseAsync(buffer, '')
      stripExtras(gltf.scene)
      this.models.set(model.id, { scene: gltf.scene, fit: measure(gltf.scene) })
    }))
  }

  syncComponents() {
    if (this.mode === 'incele') return
    const alive = new Set(this.state.components.map((item) => item.id))
    for (const [id, group] of this.groups) {
      if (alive.has(id)) continue
      this.disposeMaterials(group)
      group.removeFromParent()
      this.groups.delete(id)
    }
    this.pivots.clear()
    for (const component of this.state.components) {
      const record = this.state.models.find((item) => item.id === component.modelId)
      const signature = `${component.modelId}:${JSON.stringify(record?.ports || [])}:${JSON.stringify(component.ports)}`
      let group = this.groups.get(component.id)
      if (!group || group.userData.signature !== signature) {
        if (group) {
          if (this.transform.object === group) this.transform.detach()
          this.disposeMaterials(group)
          group.removeFromParent()
        }
        group = this.buildComponent(component)
        if (!group) continue
        group.userData.signature = signature
        this.groups.set(component.id, group)
        this.pickRoot.add(group)
      }
      this.indexPivots(group)
      if (this.transform.dragging && this.transform.object === group) continue
      this.applyPose(group, component)
    }
  }

  buildComponent(component) {
    const model = this.models.get(component.modelId)
    if (!model) return null
    const fit = model.fit
    const align = new THREE.Group()
    align.scale.setScalar(fit.s)
    align.position.set(fit.x, fit.y, fit.z)
    const visual = cloneObject(model.scene)
    cloneMaterials(visual)
    visual.traverse((object) => {
      if (!object.isMesh) return
      object.castShadow = true
      object.receiveShadow = true
      object.userData.kind = 'component'
      object.userData.componentId = component.id
    })
    align.add(visual)
    const record = this.state.models.find((item) => item.id === component.modelId)
    const ports = [...(record?.ports || []), ...(component.ports || [])]
    for (const port of ports) align.add(this.makePort(component, port, fit.s))
    const group = new THREE.Group()
    group.name = component.id
    group.userData.componentId = component.id
    group.add(align)
    return group
  }

  makePort(component, port, fitScale) {
    const pivot = new THREE.Group()
    pivot.name = port.id
    pivot.userData.portId = port.id
    pivot.userData.componentId = component.id
    pivot.userData.pivot = true
    pivot.position.fromArray(port.position)
    const normal = new THREE.Vector3().fromArray(port.normal)
    if (normal.lengthSq() < 1e-8) normal.set(0, 1, 0)
    pivot.quaternion.copy(portOrientation(normal, port.roll || 0))
    const lift = 0.0015 / fitScale
    const bulk = port.type === 'ntype' ? 1.85 : port.type === 'ag' ? 1.74 : port.type === 'sma' || port.type === 'rf' ? 0.72 : 1
    const radius = 0.016 / fitScale * bulk
    const height = 0.042 / fitScale * (port.type === 'ntype' ? 1.35 : port.type === 'ag' ? 1.38 : 1)
    if (port.type === 'ag') {
      addEthernetPort(pivot, radius, height, lift, component, port)
      return pivot
    }
    const profile = portProfile(port.type, radius)
    const marker = {
      sma: 0xd4af37,
      rf: 0xd4af37,
      ntype: 0x8e959b,
      usb2: 0x161616,
      usb: 0x161616,
      usb3: 0x1d4ed8,
      usbc: 0xd5dbe3,
      ag: 0xf7f7f7,
      guc: 0xc62828
    }
    const material = remember(new THREE.MeshStandardMaterial({
      color: marker[port.type] || 0xd5dbe2,
      metalness: port.type === 'sma' || port.type === 'rf' || port.type === 'ntype' || port.type === 'usbc' ? 0.82 : 0.35,
      roughness: port.type === 'sma' || port.type === 'rf' ? 0.28 : 0.45
    }))
    const bodyGeometry = portGeometry(profile, height)
    const body = new THREE.Mesh(bodyGeometry, material)
    body.position.y = (profile.kind === 'usbc' ? 0 : height / 2) + lift
    body.castShadow = true
    const collarMaterial = material.clone()
    collarMaterial.userData = {}
    if (port.type === 'guc') collarMaterial.color.set(0x141414)
    else if (port.type === 'ag') collarMaterial.color.set(0x9aa0a6)
    else if (port.type === 'usb3') collarMaterial.color.set(0x0b1f4d)
    else if (port.type === 'usbc') collarMaterial.color.set(0x6e7580)
    remember(collarMaterial)
    const collarDepth = height * 0.22
    const collarProfile = {
      kind: profile.kind,
      width: profile.width * 1.28,
      breadth: profile.breadth * 1.28
    }
    const collarGeometry = portGeometry(collarProfile, collarDepth)
    const collar = new THREE.Mesh(collarGeometry, collarMaterial)
    collar.position.y = (profile.kind === 'usbc' ? 0 : collarDepth / 2) + lift
    collar.castShadow = true
    for (const mesh of [body, collar]) {
      mesh.userData.kind = 'port'
      mesh.userData.componentId = component.id
      mesh.userData.portId = port.id
    }
    pivot.add(body, collar)
    return pivot
  }

  indexPivots(group) {
    group.traverse((object) => {
      if (object.userData.pivot) {
        this.pivots.set(`${object.userData.componentId}:${object.userData.portId}`, object)
      }
    })
  }

  applyPose(group, component) {
    const scale = component.scale || 1
    group.scale.setScalar(scale)
    if (this.mode === 'sema') {
      group.position.set(component.schema.x, 0, component.schema.z)
      group.rotation.set(0, component.schema.yaw || 0, 0)
    } else {
      group.position.set(component.position[0], component.position[1], component.position[2])
      group.rotation.set(0, component.yaw || 0, 0)
    }
    group.updateMatrixWorld(true)
  }

  syncInspect() {
    this.inspectRoot.visible = this.mode === 'incele'
    if (this.mode !== 'incele') return
    const modelId = this.hooks.inspectModelId?.() || ''
    const model = modelId ? this.models.get(modelId) : null
    const record = this.state?.models.find((item) => item.id === modelId)
    const ports = record?.ports || []
    const signature = `${modelId}:${JSON.stringify(ports)}`
    if (!model) {
      if (this.inspectRoot.userData.signature !== '') {
        this.clearGroup(this.inspectRoot)
        this.inspectRoot.userData.signature = ''
      }
      return
    }
    if (this.inspectRoot.userData.signature === signature && this.inspectRoot.children.length) return
    const keepCamera = this.inspectRoot.userData.modelId === modelId && this.inspectRoot.children.length > 0
    this.clearGroup(this.inspectRoot)
    this.inspectRoot.userData.signature = signature
    this.inspectRoot.userData.modelId = modelId
    const fit = model.fit
    const align = new THREE.Group()
    align.scale.setScalar(fit.s)
    align.position.set(fit.x, fit.y, fit.z)
    const visual = cloneObject(model.scene)
    cloneMaterials(visual)
    visual.traverse((object) => {
      if (!object.isMesh) return
      object.castShadow = true
      object.receiveShadow = true
      object.userData.kind = 'submesh'
    })
    align.add(visual)
    for (const port of ports) align.add(this.makePort({ id: 'incele' }, port, fit.s))
    this.inspectRoot.add(align)
    if (!keepCamera) this.frameObject(this.inspectRoot)
  }

  portFrame(componentId, portId) {
    const pivot = this.pivots.get(`${componentId}:${portId}`)
    if (!pivot) return null
    pivot.updateWorldMatrix(true, false)
    const position = new THREE.Vector3()
    const quaternion = new THREE.Quaternion()
    pivot.getWorldPosition(position)
    pivot.getWorldQuaternion(quaternion)
    const normal = new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion).normalize()
    return {
      position: [position.x, position.y, position.z],
      normal: [normal.x, normal.y, normal.z]
    }
  }

  syncCables() {
    this.clearCables()
    if (!this.state || this.mode === 'incele') return
    const hidden = new Set(this.state.hiddenTypes || [])
    const visible = this.state.cables.filter((cable) => !hidden.has(cable.type))
    const frames = new Map()
    const lanes = []
    for (const cable of visible) {
      const a = this.portFrame(cable.a.componentId, cable.a.portId)
      const b = this.portFrame(cable.b.componentId, cable.b.portId)
      frames.set(cable.id, { a, b })
      if (!a || !b) continue
      const mid = [(a.position[0] + b.position[0]) / 2, (a.position[2] + b.position[2]) / 2]
      let lane = 0
      for (const prev of lanes) {
        const dx = prev.mid[0] - mid[0]
        const dz = prev.mid[1] - mid[1]
        if (dx * dx + dz * dz < 0.04) lane = Math.max(lane, prev.lane + 1)
      }
      lanes.push({ mid, lane })
      frames.get(cable.id).lane = lane
    }
    for (const cable of visible) {
      const frame = frames.get(cable.id)
      const a = frame?.a
      const b = frame?.b
      if (!a || !b) continue
      const plain = this.plainRoute(a, b, cable)
      const vias = this.viasOf(cable, plain)
      const lift = SCHEMA_LIFT[cable.type] || 0.02
      const points = vias.length
        ? routeVia(a.position, a.normal, b.position, b.normal, vias, this.mode === 'sema' ? lift : null)
        : plain
      if (!points) continue
      const curve = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3().fromArray(point)))
      curve.curveType = 'centripetal'
      const radius = (CABLE_RADIUS[cable.type] || 0.008) * (this.mode === 'sema' ? 0.7 : 1)
      const tubular = Math.max(20, Math.round(curve.getLength() * 40))
      const geometry = new THREE.TubeGeometry(curve, tubular, radius, 8, false)
      geometry.userData.owned = true
      const map = (cable.type === 'usb' ? this.dashed : this.solid).clone()
      map.wrapS = THREE.RepeatWrapping
      map.wrapT = THREE.RepeatWrapping
      map.repeat.set(Math.max(2, curve.getLength() * 10), 1)
      const material = remember(new THREE.MeshStandardMaterial({
        color: CABLE_COLOR[cable.type] || 0xc4a35a,
        map,
        roughness: cable.type === 'rf' ? 0.45 : 0.68,
        metalness: cable.type === 'rf' ? 0.35 : 0.08,
        alphaTest: cable.type === 'usb' ? 0.4 : 0
      }))
      const mesh = new THREE.Mesh(geometry, material)
      mesh.castShadow = true
      mesh.userData.kind = 'cable'
      mesh.userData.cableId = cable.id
      this.cableRoot.add(mesh)
      this.cableMeshes.set(cable.id, mesh)
      const pickGeometry = new THREE.TubeGeometry(curve, tubular, Math.max(radius * 4, 0.03), 6, false)
      pickGeometry.userData.owned = true
      const pick = new THREE.Mesh(pickGeometry, new THREE.MeshBasicMaterial())
      pick.visible = false
      pick.userData.kind = 'cable'
      pick.userData.cableId = cable.id
      this.cableRoot.add(pick)
      if (this.selection?.kind === 'cable' && this.selection.id === cable.id && vias.length) {
        this.addBendHandles(cable, vias, this.mode === 'sema' ? lift : null)
      }
    }
  }

  plainRoute(a, b, cable) {
    if (this.mode === 'sema') {
      return routeSchema(a.position, a.normal, b.position, b.normal, SCHEMA_LIFT[cable.type] || 0.02, [0, 0])
    }
    const boxes = []
    for (const group of this.groups.values()) {
      const box = new THREE.Box3().setFromObject(group)
      if (box.isEmpty()) continue
      boxes.push({ min: [box.min.x, box.min.y, box.min.z], max: [box.max.x, box.max.y, box.max.z] })
    }
    return routeClear(a.position, a.normal, b.position, b.normal, boxes, 0)
  }

  viasOf(cable, plain) {
    if (this.bendDrag?.id === cable.id) return this.bendDrag.vias
    const schema = this.mode === 'sema'
    const stored = schema ? cable.schemaVias : cable.vias
    if (stored?.length) return stored.map((via) => [...via])
    if (!plain) return []
    const base = plain[Math.min(2, plain.length - 1)]
    if (schema) {
      const bend = cable.schemaBend || [0, 0]
      if (Math.abs(bend[0]) > 1e-4 || Math.abs(bend[1]) > 1e-4) return [[base[0] + bend[0], base[2] + bend[1]]]
      return []
    }
    const bend = cable.bend || [0, 0, 0]
    if (bend.some((value) => Math.abs(value) > 1e-4)) {
      return [[base[0] + bend[0], base[1] + (bend[1] || 0), base[2] + (bend[2] || 0)]]
    }
    return []
  }

  bendRadius() {
    if (this.mode === 'sema') {
      const span = (this.ortho.top - this.ortho.bottom) / Math.max(this.ortho.zoom, 0.001)
      return span / Math.max(this.canvas.clientHeight, 1) * 18
    }
    const dist = this.perspective.position.distanceTo(this.orbit.target)
    return Math.max(0.05, dist * 0.022)
  }

  addBendHandles(cable, vias, lift) {
    const radius = this.bendRadius()
    vias.forEach((via, index) => {
      const at = lift == null ? via : [via[0], lift, via[1]]
      const geometry = new THREE.SphereGeometry(radius, 20, 14)
      geometry.userData.owned = true
      const mesh = new THREE.Mesh(
        geometry,
        remember(new THREE.MeshStandardMaterial({ color: 0xf2c14e, roughness: 0.35, metalness: 0.15 }))
      )
      mesh.position.fromArray(at)
      mesh.userData.kind = 'bend'
      mesh.userData.cableId = cable.id
      mesh.userData.viaIndex = index
      const pickGeometry = new THREE.SphereGeometry(radius * 2.4, 12, 10)
      pickGeometry.userData.owned = true
      const pick = new THREE.Mesh(pickGeometry, new THREE.MeshBasicMaterial())
      pick.visible = false
      pick.position.fromArray(at)
      pick.userData.kind = 'bend'
      pick.userData.cableId = cable.id
      pick.userData.viaIndex = index
      this.bendRoot.add(mesh, pick)
    })
  }

  clearCables() {
    for (const child of [...this.cableRoot.children]) {
      if (child.geometry?.userData.owned) child.geometry.dispose()
      if (child.material?.map && child.material.map !== this.solid && child.material.map !== this.dashed) {
        child.material.map.dispose()
      }
      if (child.material) child.material.dispose()
      child.removeFromParent()
    }
    this.cableMeshes.clear()
    for (const child of [...this.bendRoot.children]) {
      if (child.geometry?.userData.owned) child.geometry.dispose()
      if (child.material) child.material.dispose()
      child.removeFromParent()
    }
  }

  syncGizmo() {
    let group = null
    if (this.selection?.kind === 'component' && this.mode !== 'incele') group = this.groups.get(this.selection.id) || null
    if (this.selection?.kind === 'port') {
      group = this.pivots.get(`${this.selection.componentId}:${this.selection.portId}`) || null
      if (!group) {
        for (const pivot of this.pivots.values()) {
          if (pivot.userData.portId === this.selection.portId) {
            group = pivot
            break
          }
        }
      }
    }
    const rotate = this.tool === 'dondur'
    const editing = Boolean(group) && this.tool !== 'kablo'
    if (!editing) {
      this.transform.detach()
      this.setBox(group && this.mode !== 'incele' ? group : null)
      return
    }
    this.transform.camera = this.activeCamera()
    this.transform.setMode(rotate ? 'rotate' : 'translate')
    this.transform.setSize(rotate ? 2.4 : 1.6)
    this.transform.space = this.selection?.kind === 'port' || rotate ? 'local' : 'world'
    const schema = this.mode === 'sema'
    const port = this.selection?.kind === 'port'
    this.transform.showX = !rotate
    this.transform.showY = rotate || port || !schema
    this.transform.showZ = !rotate
    this.transform.showXY = !schema && !rotate
    this.transform.showYZ = !schema && !rotate
    this.transform.showXZ = !schema && !rotate
    this.transform.showE = false
    this.transform.showXYZE = false
    if (rotate) {
      this.transform.showX = false
      this.transform.showZ = false
      this.transform.showY = true
    }
    if (this.transform.object !== group) this.transform.attach(group)
    this.setBox(group)
  }

  setBox(object) {
    if (this.box) {
      this.box.removeFromParent()
      this.box.geometry?.dispose()
      this.box = null
    }
    if (!object) return
    this.box = new THREE.BoxHelper(object, 0xb45309)
    this.scene.add(this.box)
  }

  applyFocus() {
    const focus = focusFor(this.state || { cables: [], hiddenTypes: [] }, this.hover)
    const dim = this.dim
    const paintNode = (root) => {
      root.traverse((object) => {
        if (!object.isMesh) return
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        materials.forEach((material) => paintMaterial(material, this.meshLit(object, focus), dim))
      })
    }
    if (this.mode === 'incele') {
      paintNode(this.inspectRoot)
    } else {
      for (const group of this.groups.values()) paintNode(group)
      for (const mesh of this.cableMeshes.values()) paintNode(mesh)
      paintNode(this.bendRoot)
    }
    if (this.pending) {
      const pivot = this.pivots.get(`${this.pending.componentId}:${this.pending.portId}`)
      pivot?.traverse((object) => {
        if (object.isMesh && object.material?.emissive) object.material.emissive.set(0xf2c14e)
      })
    }
  }

  meshLit(object, focus) {
    if (!focus) return true
    const kind = object.userData.kind
    if (focus.submesh) return object === focus.submesh
    if (focus.portFocus) {
      if (kind === 'port') {
        const key = `${object.userData.componentId}:${object.userData.portId}`
        return focus.ports.has(key) || focus.anyPort.has(object.userData.portId)
      }
      if (kind === 'cable' || kind === 'bend') return focus.cables.has(object.userData.cableId)
      return false
    }
    if (kind === 'cable' || kind === 'bend') return focus.cables?.has(object.userData.cableId)
    if (object.userData.componentId && focus.components) return focus.components.has(object.userData.componentId)
    return true
  }

  frameObject(root) {
    const box = new THREE.Box3().setFromObject(root)
    if (box.isEmpty()) {
      this.orbit.target.set(0, 0.4, 0)
      this.perspective.position.set(3, 2.4, 4)
      this.perspective.lookAt(this.orbit.target)
      this.perspective.up.set(0, 1, 0)
      return
    }
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    const radius = Math.max(size.x, size.y, size.z) * 1.35 || 1
    this.orbit.target.copy(center)
    this.perspective.up.set(0, 1, 0)
    this.perspective.position.set(center.x + radius * 0.75, center.y + radius * 0.55, center.z + radius)
    this.perspective.lookAt(center)
    this.orbit.update()
  }

  frameSchema() {
    const box = new THREE.Box3().setFromObject(this.pickRoot)
    const center = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3())
    const size = box.isEmpty() ? new THREE.Vector3(4, 1, 4) : box.getSize(new THREE.Vector3())
    this.viewHalf = Math.max(size.x, size.z, 2) * 0.7
    this.ortho.zoom = 1
    this.ortho.up.set(0, 0, -1)
    this.ortho.position.set(center.x, 16, center.z)
    this.ortho.lookAt(center.x, 0, center.z)
    this.ortho.updateMatrixWorld(true)
    this.resize()
  }

  setPointer(event) {
    const rect = this.canvas.getBoundingClientRect()
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
  }

  hits(root) {
    this.raycaster.setFromCamera(this.pointer, this.activeCamera())
    return this.raycaster.intersectObject(root, true)
  }

  gizmoHandleHit() {
    if (!this.transform.object) return false
    const gizmo = this.transform._gizmo
    const handles = gizmo?.gizmo?.[this.transform.mode]
    if (!handles) return false
    this.raycaster.setFromCamera(this.pointer, this.activeCamera())
    const roots = [handles]
    if (this.transform.mode === 'rotate' && gizmo.picker?.rotate) roots.push(gizmo.picker.rotate)
    return roots.some((root) => this.raycaster.intersectObject(root, true).some((hit) => hit.object.visible || root !== handles))
  }

  firstHit() {
    const root = this.mode === 'incele' ? this.inspectRoot : this.pickRoot
    const cableHits = this.mode === 'incele' ? [] : [...this.hits(this.cableRoot), ...this.hits(this.bendRoot)]
    const bodyHits = this.hits(root)
    const all = [...cableHits, ...bodyHits].sort((a, b) => a.distance - b.distance)
    const bendHit = all.find((hit) => hit.object.userData.kind === 'bend')
    if (bendHit) {
      const data = bendHit.object.userData
      return { ...data, point: bendHit.point, face: bendHit.face, object: bendHit.object }
    }
    for (const hit of all) {
      const data = hit.object.userData
      if (!data.kind) continue
      if (data.kind === 'submesh') return { kind: 'submesh', mesh: hit.object, point: hit.point, face: hit.face, object: hit.object }
      return { ...data, point: hit.point, face: hit.face, object: hit.object }
    }
    return null
  }

  hitKey(hit) {
    if (!hit) return ''
    return `${hit.kind}:${hit.componentId || ''}:${hit.cableId || ''}:${hit.portId || ''}:${hit.mesh?.uuid || ''}`
  }

  onDown(event) {
    if (event.button !== 0 || this.transform.dragging) return
    this.setPointer(event)
    if (this.gizmoHandleHit()) return
    const hit = this.firstHit()
    this.down = { x: event.clientX, y: event.clientY, hit }
    if (this.tool === 'dondur' && this.turnObject(hit)) {
      const object = this.turnObject(hit)
      this.yawDrag = {
        object,
        start: this.screenAngle(event, object),
        quat: object.quaternion.clone(),
        started: false
      }
    }
    if (hit?.kind === 'bend') {
      const cable = this.state.cables.find((item) => item.id === hit.cableId)
      const a = cable && this.portFrame(cable.a.componentId, cable.a.portId)
      const b = cable && this.portFrame(cable.b.componentId, cable.b.portId)
      const plain = a && b ? this.plainRoute(a, b, cable) : null
      this.bendDrag = {
        id: hit.cableId,
        index: hit.viaIndex || 0,
        vias: this.viasOf(cable, plain).map((via) => [...via]),
        moved: false,
        started: false
      }
      this.orbit.enabled = false
    }
  }

  onMove(event) {
    this.setPointer(event)
    if (this.yawDrag && this.down) {
      this.dragYaw(event)
      return
    }
    if (this.bendDrag && this.down) {
      if (!this.bendDrag.started) {
        this.bendDrag.started = true
        this.hooks.onPoseStart?.()
      }
      this.dragBend()
      return
    }
    if (this.pan) {
      this.dragPan(event)
      return
    }
    if (this.down && this.mode === 'sema' && !this.down.hit && !this.transform.dragging) {
      if (Math.hypot(event.clientX - this.down.x, event.clientY - this.down.y) > 4) {
        this.pan = { x: event.clientX, y: event.clientY, px: this.ortho.position.x, pz: this.ortho.position.z }
      }
    }
    if (this.down || this.transform.dragging) return
    const hit = this.firstHit()
    const hover = hit ? { kind: hit.kind, componentId: hit.componentId, cableId: hit.cableId, portId: hit.portId, mesh: hit.mesh } : null
    this.setHover(hover)
  }

  dragPan(event) {
    const width = this.canvas.clientWidth || 1
    const height = this.canvas.clientHeight || 1
    const worldPerX = (this.ortho.right - this.ortho.left) / this.ortho.zoom / width
    const worldPerY = (this.ortho.top - this.ortho.bottom) / this.ortho.zoom / height
    this.ortho.updateMatrixWorld(true)
    const right = new THREE.Vector3().setFromMatrixColumn(this.ortho.matrixWorld, 0)
    const up = new THREE.Vector3().setFromMatrixColumn(this.ortho.matrixWorld, 1)
    const dx = event.clientX - this.pan.x
    const dy = event.clientY - this.pan.y
    this.ortho.up.set(0, 0, -1)
    this.ortho.position.set(this.pan.px, 16, this.pan.pz)
    this.ortho.position.addScaledVector(right, -dx * worldPerX)
    this.ortho.position.addScaledVector(up, dy * worldPerY)
    this.ortho.lookAt(this.ortho.position.x, 0, this.ortho.position.z)
    this.ortho.updateMatrixWorld(true)
    this.requestRender()
  }

  bendUnderPointer() {
    this.raycaster.setFromCamera(this.pointer, this.activeCamera())
    return this.raycaster.intersectObject(this.bendRoot, true).some((hit) => hit.object.userData.kind === 'bend')
  }

  onMiddle(event) {
    if (this.selection?.kind !== 'cable') return
    this.setPointer(event)
    const hit = this.firstHit()
    if (!hit || hit.cableId !== this.selection.id) return
    if (hit.kind !== 'cable' && hit.kind !== 'bend') return
    const cable = this.state.cables.find((item) => item.id === this.selection.id)
    const placed = this.placeVia(cable, hit.point)
    if (!placed) return
    this.hooks.onPoseStart?.()
    this.hooks.onBend?.(cable.id, placed.vias, this.mode === 'sema')
    this.bendDrag = { id: cable.id, index: placed.index, vias: placed.vias, moved: true, started: true }
    this.down = { x: event.clientX, y: event.clientY, hit }
    this.orbit.enabled = false
  }

  placeVia(cable, point) {
    if (!cable) return null
    const a = this.portFrame(cable.a.componentId, cable.a.portId)
    const b = this.portFrame(cable.b.componentId, cable.b.portId)
    if (!a || !b) return null
    const plain = this.plainRoute(a, b, cable)
    const vias = this.viasOf(cable, plain).map((via) => [...via])
    const schema = this.mode === 'sema'
    const spot = schema
      ? [softSnap(point.x), softSnap(point.z)]
      : [softSnap(point.x), point.y, softSnap(point.z)]
    const chain = schema
      ? [[a.position[0], a.position[2]], ...vias, [b.position[0], b.position[2]]]
      : [a.position, ...vias, b.position]
    const probe = schema ? [spot[0], spot[1]] : spot
    let index = 0
    let best = Infinity
    for (let i = 0; i < chain.length - 1; i += 1) {
      const distance = this.segmentDistance(probe, chain[i], chain[i + 1])
      if (distance < best) {
        best = distance
        index = i
      }
    }
    vias.splice(index, 0, spot)
    return { vias, index }
  }

  segmentDistance(point, start, end) {
    const ab = [end[0] - start[0], (end[1] ?? 0) - (start[1] ?? 0), (end[2] ?? 0) - (start[2] ?? 0)]
    const ap = [point[0] - start[0], (point[1] ?? 0) - (start[1] ?? 0), (point[2] ?? 0) - (start[2] ?? 0)]
    const length = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2]
    const t = length < 1e-8 ? 0 : Math.min(1, Math.max(0, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / length))
    const dx = start[0] + ab[0] * t - point[0]
    const dy = (start[1] ?? 0) + ab[1] * t - (point[1] ?? 0)
    const dz = (start[2] ?? 0) + ab[2] * t - (point[2] ?? 0)
    return dx * dx + dy * dy + dz * dz
  }

  dragBend() {
    this.raycaster.setFromCamera(this.pointer, this.activeCamera())
    const via = this.bendDrag.vias[this.bendDrag.index]
    if (!via) return
    const point = new THREE.Vector3()
    if (this.mode === 'sema') {
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(SCHEMA_LIFT.guc || 0.02))
      if (!this.raycaster.ray.intersectPlane(plane, point)) return
      this.bendDrag.vias[this.bendDrag.index] = [softSnap(point.x), softSnap(point.z)]
    } else {
      const normal = new THREE.Vector3()
      this.activeCamera().getWorldDirection(normal)
      const anchor = new THREE.Vector3(via[0], via[1] || 0, via[2] || 0)
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, anchor)
      if (!this.raycaster.ray.intersectPlane(plane, point)) return
      this.bendDrag.vias[this.bendDrag.index] = [softSnap(point.x), point.y, softSnap(point.z)]
    }
    this.bendDrag.moved = true
    this.orbit.enabled = false
    this.syncCables()
    this.requestRender()
  }

  softenTransform() {
    const object = this.transform.object
    if (!object) return
    if (this.transform.mode === 'rotate') {
      if (object.userData.pivot) {
        const normal = new THREE.Vector3(0, 1, 0).applyQuaternion(object.quaternion).normalize()
        const roll = softSnapAngle(portRoll(object.quaternion, normal))
        object.quaternion.copy(portOrientation(normal, roll))
      } else {
        object.rotation.set(0, softSnapAngle(headingFromQuaternion(object.quaternion)), 0)
      }
      return
    }
    object.updateWorldMatrix(true, false)
    const world = object.getWorldPosition(new THREE.Vector3())
    const x = softSnap(world.x)
    const z = softSnap(world.z)
    if (x === world.x && z === world.z) return
    world.x = x
    world.z = z
    if (object.parent) object.parent.worldToLocal(world)
    object.position.copy(world)
  }

  onUp(event) {
    if (!this.down) return
    const moved = Math.hypot(event.clientX - this.down.x, event.clientY - this.down.y) > 4
    if (this.yawDrag) {
      if (this.yawDrag.started) this.commitPose()
      this.yawDrag = null
      if (this.mode !== 'sema') this.orbit.enabled = true
      this.down = null
      this.pan = null
      return
    }
    if (this.bendDrag) {
      if (this.bendDrag.moved) this.hooks.onBend?.(this.bendDrag.id, this.bendDrag.vias, this.mode === 'sema')
      this.bendDrag = null
      if (this.mode !== 'sema') this.orbit.enabled = true
      this.down = null
      this.pan = null
      return
    }
    this.pan = null
    const hit = this.down.hit
    this.down = null
    if (moved) return
    this.click(hit)
  }

  click(hit) {
    if (this.mode === 'incele' && hit?.kind === 'submesh') {
      this.createModelPort(hit)
      return
    }
    if (this.mode === 'incele' && hit?.kind === 'port' && this.tool !== 'kablo') {
      this.hooks.onSelect?.({ kind: 'port', componentId: 'incele', portId: hit.portId })
      return
    }
    if (this.tool === 'kablo' && hit?.kind === 'port') {
      this.pickCablePort(hit)
      return
    }
    if (!hit) {
      this.hooks.onSelect?.(null)
      return
    }
    if (hit.kind === 'cable' || hit.kind === 'bend') {
      this.hooks.onSelect?.({ kind: 'cable', id: hit.cableId })
      this.hooks.status?.('Kıvrım için kablonun üstüne orta tuşla bas.')
    }
    else if (hit.kind === 'port') this.hooks.onSelect?.({ kind: 'port', componentId: hit.componentId, portId: hit.portId })
    else if (hit.kind === 'component') this.hooks.onSelect?.({ kind: 'component', id: hit.componentId })
    else if (hit.kind === 'submesh') this.setHover(hit)
  }

  createModelPort(hit) {
    const align = this.inspectRoot.children[0]
    if (!align || !hit.face) return
    const inverse = align.matrixWorld.clone().invert()
    const point = hit.point.clone().applyMatrix4(inverse)
    const worldNormal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize()
    const towardCamera = this.perspective.position.clone().sub(hit.point).normalize()
    if (worldNormal.dot(towardCamera) < 0) worldNormal.negate()
    const normal = worldNormal.clone().transformDirection(inverse).normalize()
    this.hooks.onModelPort?.({
      position: [point.x, point.y, point.z],
      normal: [normal.x, normal.y, normal.z]
    })
  }

  createPort(hit) {
    const group = this.groups.get(hit.componentId)
    const align = group?.children[0]
    if (!align) return
    const inverse = align.matrixWorld.clone().invert()
    const point = hit.point.clone().applyMatrix4(inverse)
    const worldNormal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize()
    const normal = worldNormal.clone().transformDirection(inverse).normalize()
    this.hooks.onPort?.({
      componentId: hit.componentId,
      position: [point.x, point.y, point.z],
      normal: [normal.x, normal.y, normal.z]
    })
  }

  pickCablePort(hit) {
    if (!this.pending) {
      this.pending = { componentId: hit.componentId, portId: hit.portId }
      this.hooks.status?.('İkinci bağlantı noktasını seç.')
      this.applyFocus()
      this.requestRender()
      return
    }
    if (this.pending.portId === hit.portId && this.pending.componentId === hit.componentId) {
      this.pending = null
      this.hooks.status?.('Kablo iptal.')
      return
    }
    const ends = { a: this.pending, b: { componentId: hit.componentId, portId: hit.portId } }
    this.pending = null
    this.hooks.onCable?.(ends)
  }

  onWheel(event) {
    if (this.mode !== 'sema') return
    event.preventDefault()
    const factor = event.deltaY > 0 ? 0.92 : 1.08
    this.ortho.zoom = Math.min(16, Math.max(0.2, this.ortho.zoom * factor))
    this.ortho.updateProjectionMatrix()
    this.requestRender()
  }

  commitPose() {
    const group = this.transform.object
    if (!group) return
    if (group.userData.pivot) {
      const normal = new THREE.Vector3(0, 1, 0).applyQuaternion(group.quaternion).normalize()
      const roll = portRoll(group.quaternion, normal)
      group.quaternion.copy(portOrientation(normal, roll))
      this.hooks.onPortPose?.({
        componentId: group.userData.componentId,
        portId: group.userData.portId,
        position: [group.position.x, group.position.y, group.position.z],
        normal: [normal.x, normal.y, normal.z],
        roll
      })
      return
    }
    const id = group.userData.componentId
    const yaw = headingFromQuaternion(group.quaternion)
    group.rotation.set(0, yaw, 0)
    if (this.mode === 'sema') {
      this.hooks.onPose?.(id, { schema: { x: group.position.x, z: group.position.z, yaw } })
    } else {
      this.hooks.onPose?.(id, {
        position: [group.position.x, group.position.y, group.position.z],
        yaw
      })
    }
  }

  turnObject(hit) {
    if (!hit) return null
    if (this.selection?.kind === 'port' && hit.kind === 'port' && hit.portId === this.selection.portId) {
      return this.pivots.get(`${hit.componentId}:${hit.portId}`) || null
    }
    if (this.selection?.kind === 'component' && (hit.kind === 'component' || hit.kind === 'port') && hit.componentId === this.selection.id) {
      return this.groups.get(hit.componentId) || null
    }
    if (!this.selection && hit.kind === 'component') return this.groups.get(hit.componentId) || null
    return null
  }

  screenAngle(event, object) {
    const center = object.getWorldPosition(new THREE.Vector3()).project(this.activeCamera())
    const rect = this.canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    const y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    return Math.atan2(y - center.y, x - center.x)
  }

  dragYaw(event) {
    const drag = this.yawDrag
    if (Math.hypot(event.clientX - this.down.x, event.clientY - this.down.y) < 3 && !drag.started) return
    if (!drag.started) {
      drag.started = true
      this.orbit.enabled = false
      this.hooks.onPoseStart?.()
    }
    const delta = wrapAngle(this.screenAngle(event, drag.object) - drag.start)
    if (drag.object.userData.pivot) {
      const normal = new THREE.Vector3(0, 1, 0).applyQuaternion(drag.quat).normalize()
      drag.object.quaternion.copy(drag.quat)
      drag.object.rotateY(delta)
      const roll = softSnapAngle(portRoll(drag.object.quaternion, normal))
      drag.object.quaternion.copy(portOrientation(normal, roll))
    } else {
      drag.object.rotation.set(0, softSnapAngle(headingFromQuaternion(drag.quat) + delta), 0)
    }
    this.syncCables()
    this.requestRender()
  }

  clearGroup(group) {
    for (const child of [...group.children]) {
      this.disposeMaterials(child)
      child.removeFromParent()
    }
  }

  disposeMaterials(root) {
    root.traverse((object) => {
      if (!object.isMesh) return
      if (object.geometry?.userData.owned) object.geometry.dispose()
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      materials.forEach((material) => material?.dispose())
    })
  }
}
