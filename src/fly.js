import * as THREE from 'three'

const UP = new THREE.Vector3(0, 1, 0)

export function cameraBasis(camera) {
  const fwd = new THREE.Vector3()
  const right = new THREE.Vector3()
  camera.getWorldDirection(fwd)
  if (Math.abs(fwd.y) > 0.92) {
    right.setFromMatrixColumn(camera.matrixWorld, 0)
    fwd.setFromMatrixColumn(camera.matrixWorld, 1)
  } else {
    fwd.y = 0
    right.crossVectors(fwd, UP)
  }
  fwd.y = 0
  right.y = 0
  if (fwd.lengthSq() < 1e-8) fwd.set(0, 0, -1)
  if (right.lengthSq() < 1e-8) right.set(1, 0, 0)
  fwd.normalize()
  right.normalize()
  return { fwd, right }
}

export function flyDelta(camera, input, distance) {
  const { fwd, right } = cameraBasis(camera)
  const move = new THREE.Vector3()
  move.addScaledVector(fwd, input.forward || 0)
  move.addScaledVector(right, input.strafe || 0)
  move.addScaledVector(UP, input.lift || 0)
  if (move.lengthSq() < 1e-8) return move
  return move.normalize().multiplyScalar(distance)
}
