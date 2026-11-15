import mountIris from './media/taste/iris.js'
import * as motion from './media/taste/lib.js'
import { init } from './media/taste/motion.js'

const section = document.querySelector('[data-moment="iris-opens"]')
const canAnimate = matchMedia('(min-width: 900px) and (prefers-reduced-motion: no-preference)')
let active

function syncMoment() {
  if (canAnimate.matches && !active) {
    active = mountIris(section, { from: 'surface' }, motion)
    section.dataset.momentMounted = 'iris-opens'
  } else if (!canAnimate.matches && active) {
    active.destroy()
    active = undefined
    delete section.dataset.momentMounted
  }
}

canAnimate.addEventListener('change', syncMoment)
syncMoment()
init()
