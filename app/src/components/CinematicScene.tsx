import { useEffect, useRef } from 'react'

/** Cena decorativa: nunca bloqueia login, áudio ou navegação. */
export default function CinematicScene() {
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const element = root.current
    if (!element || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let alive = true
    let cleanup = () => {}
    const start = async () => {
      // WebGL somente em telas maiores; evita custo e bateria em celulares.
      if (window.innerWidth < 850 || !('WebGLRenderingContext' in window)) return
      const [THREE, { gsap }, { ScrollTrigger }] = await Promise.all([
        import('three'), import('gsap'), import('gsap/ScrollTrigger')
      ])
      if (!alive) return
      const canvas = document.createElement('canvas')
      canvas.setAttribute('aria-hidden', 'true')
      element.appendChild(canvas)
      let renderer: InstanceType<typeof THREE.WebGLRenderer>
      try { renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: 'low-power' }) }
      catch { canvas.remove(); return }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(40, 1, .1, 100)
      camera.position.z = 8
      const geometry = new THREE.TorusGeometry(2.1, .11, 12, 110)
      const material = new THREE.MeshBasicMaterial({ color: 0xd9ff43, transparent: true, opacity: .72 })
      const ring = new THREE.Mesh(geometry, material)
      ring.rotation.x = .75
      scene.add(ring)
      const inner = new THREE.Mesh(new THREE.TorusGeometry(1.45, .035, 8, 90), new THREE.MeshBasicMaterial({ color: 0x8cbf70, transparent: true, opacity: .55 }))
      inner.rotation.x = .75
      scene.add(inner)
      const resize = () => {
        const { width, height } = element.getBoundingClientRect()
        if (!width || !height) return
        camera.aspect = width / height
        camera.updateProjectionMatrix()
        renderer.setSize(width, height, false)
      }
      resize()
      const observer = new ResizeObserver(resize)
      observer.observe(element)
      let pointerX = 0, pointerY = 0, raf = 0
      const move = (event: PointerEvent) => {
        const rect = element.getBoundingClientRect()
        pointerX = ((event.clientX - rect.left) / rect.width - .5) * .35
        pointerY = ((event.clientY - rect.top) / rect.height - .5) * .25
      }
      const hero = element.closest<HTMLElement>('.mc2-hero')
      hero?.addEventListener('pointermove', move)
      const render = () => {
        if (!document.hidden) {
          ring.rotation.z += .0018
          ring.rotation.y += (pointerX - ring.rotation.y) * .025
          inner.rotation.y += (pointerY - inner.rotation.y) * .02
          renderer.render(scene, camera)
        }
        raf = requestAnimationFrame(render)
      }
      render()
      gsap.registerPlugin(ScrollTrigger)
      const animation = hero ? gsap.fromTo(hero.querySelector('.hero-copy'), { scale: 1, opacity: 1 }, {
        scale: .88, opacity: .35, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true }
      }) : null
      // O player usa scroll nativo; Lenis em wrapper incorreto bloqueava a rolagem.
      cleanup = () => {
        cancelAnimationFrame(raf); observer.disconnect(); hero?.removeEventListener('pointermove', move)
        animation?.scrollTrigger?.kill(); animation?.kill(); 
        geometry.dispose(); material.dispose(); inner.geometry.dispose(); (inner.material as InstanceType<typeof THREE.MeshBasicMaterial>).dispose()
        renderer.dispose(); canvas.remove()
      }
    }
    void start().catch(() => { /* 3D opcional: mantém o player funcionando */ })
    return () => { alive = false; cleanup() }
  }, [])
  return <div ref={root} className="mc2-scene" aria-hidden="true" />
}
