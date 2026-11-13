export const CABLE_TYPES = [
  { id: 'sma', name: 'RF SMA' },
  { id: 'ntype', name: 'RF N' },
  { id: 'usb2', name: 'USB 2.0' },
  { id: 'usb3', name: 'USB 3.0' },
  { id: 'usbc', name: 'USB Type-C' },
  { id: 'ag', name: 'Ethernet' },
  { id: 'guc', name: 'Güç' },
  { id: 'rf', name: 'RF' },
  { id: 'usb', name: 'USB' },
  { id: 'diger', name: 'Diğer' }
]

export function uid() {
  return crypto.randomUUID()
}

export function emptyState() {
  return {
    version: 1,
    name: 'Adsız düzenek',
    models: [],
    components: [],
    cables: [],
    hiddenTypes: []
  }
}

export const PORT_TYPES = [
  { id: 'sma', name: 'RF SMA' },
  { id: 'ntype', name: 'RF N' },
  { id: 'usb2', name: 'USB 2.0' },
  { id: 'usb3', name: 'USB 3.0' },
  { id: 'usbc', name: 'USB Type-C' },
  { id: 'ag', name: 'Ethernet' },
  { id: 'guc', name: 'Güç' }
]

export function typeName(id) {
  return PORT_TYPES.find((item) => item.id === id)?.name
    || CABLE_TYPES.find((item) => item.id === id)?.name
    || 'Kablo'
}

export function componentPorts(state, component) {
  const model = state.models.find((item) => item.id === component.modelId)
  return [...(model?.ports || []), ...(component.ports || [])]
}

export function addModelPort(state, modelId, port) {
  return {
    ...state,
    models: state.models.map((item) => (
      item.id === modelId ? { ...item, ports: [...(item.ports || []), port] } : item
    ))
  }
}

export function movePort(state, pose) {
  const patch = { position: pose.position, normal: pose.normal, roll: pose.roll || 0 }
  const onModel = state.models.some((item) => (item.ports || []).some((port) => port.id === pose.portId))
  if (onModel) {
    return {
      ...state,
      models: state.models.map((item) => ({
        ...item,
        ports: (item.ports || []).map((port) => (port.id === pose.portId ? { ...port, ...patch } : port))
      }))
    }
  }
  return {
    ...state,
    components: state.components.map((item) => ({
      ...item,
      ports: item.ports.map((port) => (port.id === pose.portId ? { ...port, ...patch } : port))
    }))
  }
}

export function removeModelPort(state, modelId, portId) {
  return {
    ...state,
    models: state.models.map((item) => (
      item.id === modelId
        ? { ...item, ports: (item.ports || []).filter((port) => port.id !== portId) }
        : item
    )),
    cables: state.cables.filter((cable) => cable.a.portId !== portId && cable.b.portId !== portId)
  }
}

function place(index) {
  const column = index % 5
  const row = Math.floor(index / 5)
  return { x: column * 1.8, z: row * 1.8 }
}

export function addModel(state, model) {
  return { ...state, models: [...state.models, model] }
}

export function removeModel(state, modelId) {
  if (state.components.some((item) => item.modelId === modelId)) return state
  return { ...state, models: state.models.filter((item) => item.id !== modelId) }
}

export function addComponent(state, modelId, name) {
  const spot = place(state.components.length)
  const component = {
    id: uid(),
    name,
    modelId,
    position: [spot.x, 0, spot.z],
    yaw: 0,
    scale: 1,
    schema: { x: spot.x, z: spot.z, yaw: 0 },
    ports: []
  }
  return { ...state, components: [...state.components, component] }
}

export function duplicateComponent(state, id) {
  const source = state.components.find((item) => item.id === id)
  if (!source) return state
  const copy = structuredClone(source)
  copy.id = uid()
  copy.name = `${source.name} kopya`
  copy.position = [source.position[0] + 1.4, source.position[1], source.position[2]]
  copy.schema = { ...source.schema, x: source.schema.x + 1.4 }
  copy.ports = source.ports.map((port) => ({
    ...port,
    id: uid(),
    position: [...port.position],
    normal: [...port.normal]
  }))
  return { ...state, components: [...state.components, copy] }
}

export function updateComponent(state, id, patch) {
  return {
    ...state,
    components: state.components.map((item) => (item.id === id ? { ...item, ...patch } : item))
  }
}

export function removeComponent(state, id) {
  return {
    ...state,
    components: state.components.filter((item) => item.id !== id),
    cables: state.cables.filter((cable) => cable.a.componentId !== id && cable.b.componentId !== id)
  }
}

export function addPort(state, componentId, port) {
  return {
    ...state,
    components: state.components.map((item) => (
      item.id === componentId ? { ...item, ports: [...item.ports, port] } : item
    ))
  }
}

export function removePort(state, componentId, portId) {
  return {
    ...state,
    components: state.components.map((item) => (
      item.id === componentId
        ? { ...item, ports: item.ports.filter((port) => port.id !== portId) }
        : item
    )),
    cables: state.cables.filter((cable) => cable.a.portId !== portId && cable.b.portId !== portId)
  }
}

export function addCable(state, from, to, type) {
  const count = state.cables.filter((cable) => cable.type === type).length + 1
  const cable = {
    id: uid(),
    name: `${typeName(type)} ${count}`,
    type,
    a: from,
    b: to,
    bend: [0, 0, 0],
    schemaBend: [0, 0],
    vias: [],
    schemaVias: []
  }
  return { ...state, cables: [...state.cables, cable] }
}

export function updateCable(state, id, patch) {
  return {
    ...state,
    cables: state.cables.map((cable) => (cable.id === id ? { ...cable, ...patch } : cable))
  }
}

export function removeCable(state, id) {
  return { ...state, cables: state.cables.filter((cable) => cable.id !== id) }
}

export function toggleType(state, type) {
  const hidden = new Set(state.hiddenTypes)
  if (hidden.has(type)) hidden.delete(type)
  else hidden.add(type)
  return { ...state, hiddenTypes: [...hidden] }
}

export function componentName(state, id) {
  return state.components.find((item) => item.id === id)?.name || 'Parça'
}

export function portName(state, componentId, portId) {
  const component = state.components.find((item) => item.id === componentId)
  return component?.ports.find((port) => port.id === portId)?.name || 'Uç'
}
