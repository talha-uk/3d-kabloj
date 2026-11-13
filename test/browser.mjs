import { createRequire } from 'node:module'
import fs from 'node:fs'

const require = createRequire('/home/talha/.npm/_npx/e41f203b7505f1fb/package.json')
const { chromium } = require('playwright')

const browser = await chromium.launch({
  executablePath: '/home/talha/.cache/ms-playwright/chromium-1254/chrome-linux64/chrome',
  headless: true,
  args: ['--use-gl=angle']
})
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
const errors = []
page.on('pageerror', (error) => errors.push(String(error)))
page.on('console', (message) => {
  if (message.type() === 'error' && !message.text().includes('favicon')) errors.push(message.text())
})
await page.goto('http://127.0.0.1:5173/?demo=1&test=1', { waitUntil: 'networkidle' })
await page.waitForFunction(() => window.__duzenek?.view?.groups?.size === 3, null, { timeout: 10000 })
const before = await page.evaluate(() => {
  const { view, state } = window.__duzenek
  return {
    cables: view.cableMeshes.size,
    components: state.components.length,
    gizmo: Boolean(view.transform.object)
  }
})
await page.screenshot({ path: '/tmp/duzenek-yerlesim.png' })

const dim = await page.evaluate(() => new Promise((resolve) => {
  const { view, state } = window.__duzenek
  const id = state.components[0].id
  const loose = state.components.find((item) => item.name === 'Kutu C').id
  view.setHover({ kind: 'component', componentId: id })
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const read = (group) => {
      let color = null
      group.traverse((object) => {
        if (color || !object.isMesh || object.userData.kind !== 'component') return
        color = object.material.color.r
      })
      return color
    }
    const self = read(view.groups.get(id))
    const other = read(view.groups.get(state.components[1].id))
    const alone = read(view.groups.get(loose))
    const cable = [...view.cableMeshes.values()][0]
    resolve({ self, other, alone, cable: cable?.material.color.r ?? null })
  }))
}))
await page.screenshot({ path: '/tmp/duzenek-odak.png' })
await page.getByRole('tab', { name: 'Şema' }).click()
await page.waitForTimeout(400)
await page.screenshot({ path: '/tmp/duzenek-sema.png' })
await page.getByRole('tab', { name: 'İncele' }).click()
await page.waitForFunction(() => window.__duzenek.view.inspectRoot.children.length > 0)
await page.screenshot({ path: '/tmp/duzenek-incele.png' })
const fly = await page.evaluate(() => {
  const view = window.__duzenek.view
  const camera = view.perspective
  camera.updateMatrixWorld(true)
  const origin = camera.position.clone()
  view.flyKeys.add('KeyD')
  view.applyFly(0.25)
  view.flyKeys.delete('KeyD')
  const moved = camera.position.clone().sub(origin)
  const right = new view.perspective.position.constructor(1, 0, 0)
  right.setFromMatrixColumn(camera.matrixWorld, 0)
  right.y = 0
  right.normalize()
  return moved.dot(right)
})
await browser.close()

const report = { before, dim, fly, errors }
fs.writeFileSync('/tmp/duzenek-rapor.json', JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
if (errors.length || before.cables !== 1 || !before.gizmo || fly < 0.05 || !(dim.self > dim.alone * 2) || !(dim.other > dim.alone * 2) || !(dim.cable > dim.alone)) {
  process.exit(1)
}
