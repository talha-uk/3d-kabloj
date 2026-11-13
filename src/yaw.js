import * as THREE from 'three'

const UP = new THREE.Vector3(0, 1, 0)
const X = new THREE.Vector3(1, 0, 0)

export function headingFromQuaternion(quaternion) {
  const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion)
  return Math.atan2(forward.x, forward.z)
}

export function portOrientation(normal, roll = 0) {
  const n = normal.clone()
  if (n.lengthSq() < 1e-8) n.set(0, 1, 0)
  n.normalize()
  const obj = new THREE.Object3D()
  obj.quaternion.setFromUnitVectors(UP, n)
  const tangent = new THREE.Vector3().crossVectors(UP, n)
  if (tangent.lengthSq() < 1e-6) tangent.set(1, 0, 0)
  tangent.normalize()
  const localX = X.clone().applyQuaternion(obj.quaternion)
  localX.addScaledVector(n, -localX.dot(n))
  if (localX.lengthSq() > 1e-8) {
    localX.normalize()
    const twist = new THREE.Vector3().crossVectors(localX, tangent)
    const angle = Math.atan2(twist.dot(n), localX.dot(tangent))
    obj.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(n, angle))
  }
  const outward = new THREE.Vector3(0, 1, 0).applyQuaternion(obj.quaternion)
  if (outward.dot(n) < 0) {
    obj.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(X, Math.PI))
  }
  obj.rotateY(roll || 0)
  return obj.quaternion.clone()
}

export function portRoll(quaternion, normal) {
  const base = portOrientation(normal, 0)
  const delta = base.clone().invert().multiply(quaternion)
  const x = X.clone().applyQuaternion(delta)
  return Math.atan2(-x.z, x.x)
}

export function wrapAngle(delta) {
  let value = delta
  while (value > Math.PI) value -= Math.PI * 2
  while (value < -Math.PI) value += Math.PI * 2
  return value
}
