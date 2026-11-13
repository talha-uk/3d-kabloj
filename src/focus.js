// Üzerine gelinen parça veya kablo açık kalır. Bağlandığı uçlar da açık kalır.

export function focusFor(state, hit) {
  if (!hit) return null
  if (hit.kind === 'submesh') return { submesh: hit.mesh }
  if (hit.kind === 'cable' || hit.kind === 'bend') {
    const cable = state.cables.find((item) => item.id === hit.cableId)
    if (!cable) return null
    return {
      components: new Set([cable.a.componentId, cable.b.componentId]),
      cables: new Set([cable.id])
    }
  }
  if (hit.kind === 'port') {
    const hidden = new Set(state.hiddenTypes || [])
    const ports = new Set()
    const anyPort = new Set()
    const cables = new Set()
    const broad = !hit.componentId || hit.componentId === 'incele'
    if (broad) {
      anyPort.add(hit.portId)
      ports.add(`incele:${hit.portId}`)
    } else {
      ports.add(`${hit.componentId}:${hit.portId}`)
    }
    for (const cable of state.cables) {
      if (hidden.has(cable.type)) continue
      const touch = broad
        ? cable.a.portId === hit.portId || cable.b.portId === hit.portId
        : (cable.a.componentId === hit.componentId && cable.a.portId === hit.portId)
          || (cable.b.componentId === hit.componentId && cable.b.portId === hit.portId)
      if (!touch) continue
      cables.add(cable.id)
      ports.add(`${cable.a.componentId}:${cable.a.portId}`)
      ports.add(`${cable.b.componentId}:${cable.b.portId}`)
    }
    return { portFocus: true, ports, anyPort, cables }
  }
  if (hit.kind === 'component') {
    const hidden = new Set(state.hiddenTypes || [])
    const components = new Set([hit.componentId])
    const cables = new Set()
    for (const cable of state.cables) {
      if (hidden.has(cable.type)) continue
      if (cable.a.componentId !== hit.componentId && cable.b.componentId !== hit.componentId) continue
      cables.add(cable.id)
      components.add(cable.a.componentId)
      components.add(cable.b.componentId)
    }
    return { components, cables }
  }
  return null
}
