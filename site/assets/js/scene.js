// Truvio — 3D hero scene.
// Envelopes travel through a scanning ring. As each one passes, it's marked valid (green),
// risky (amber) or invalid (red). Invalid ones drop out of the line; the rest carry on.
// Uses Three.js. Pauses when off-screen; shows a still frame if the visitor prefers reduced motion.

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const COUNT = 13;
const SPAN = 9; // envelopes travel from -SPAN to +SPAN on x
const SPEED = 1.15; // units per second

function cssColor(name, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return new THREE.Color(value || fallback);
}

function readPalette() {
  return {
    paper: cssColor('--surface', '#ffffff'),
    edge: cssColor('--line-strong', '#c6cae0'),
    brand: cssColor('--brand', '#5b4bdb'),
    valid: cssColor('--valid', '#1fb57f'),
    risky: cssColor('--risky', '#e39a2b'),
    invalid: cssColor('--invalid', '#dc4a3d')
  };
}

function makeEnvelope() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 0.98, 0.06),
    new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.05 })
  );
  group.add(body);

  // Flap: a "V" on the front, plus the outline
  const flapPoints = [
    new THREE.Vector3(-0.72, 0.46, 0.035), new THREE.Vector3(0, -0.06, 0.035),
    new THREE.Vector3(0, -0.06, 0.035), new THREE.Vector3(0.72, 0.46, 0.035)
  ];
  const flap = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(flapPoints),
    new THREE.LineBasicMaterial({ transparent: true })
  );
  group.add(flap);

  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(body.geometry),
    new THREE.LineBasicMaterial({ transparent: true })
  );
  group.add(outline);

  // Status dot (hidden until scanned)
  const dot = new THREE.Mesh(
    new THREE.CircleGeometry(0.13, 32),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 })
  );
  dot.position.set(0.5, -0.27, 0.04);
  group.add(dot);

  return { group, body, flap, outline, dot };
}

export function startScene(container) {
  if (!container) return null;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  } catch {
    return null; // No WebGL: the hero still works without the scene
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  container.prepend(renderer.domElement);
  renderer.domElement.setAttribute('aria-hidden', 'true');

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  const CAM = { x: -6.2, y: 2.4, z: 9.6 };
  const LOOK = new THREE.Vector3(0.9, -0.1, 0);
  camera.position.set(CAM.x, CAM.y, CAM.z);
  camera.lookAt(LOOK);

  scene.add(new THREE.AmbientLight(0xffffff, 0.75));
  const key = new THREE.DirectionalLight(0xffffff, 0.9);
  key.position.set(-4, 6, 8);
  scene.add(key);
  const ringLight = new THREE.PointLight(0xffffff, 6, 7, 2);
  ringLight.position.set(0, 0, 1.5);
  scene.add(ringLight);

  // Scanning ring (faces the direction of travel)
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.55, 0.075, 24, 140),
    new THREE.MeshStandardMaterial({ emissiveIntensity: 1.2, roughness: 0.3 })
  );
  ring.rotation.y = Math.PI / 2;
  scene.add(ring);
  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(1.55, 0.26, 16, 140),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.12, depthWrite: false })
  );
  halo.rotation.y = Math.PI / 2;
  scene.add(halo);

  // Floor line the envelopes follow
  const track = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-SPAN, -0.75, 0), new THREE.Vector3(SPAN, -0.75, 0)]),
    new THREE.LineDashedMaterial({ dashSize: 0.18, gapSize: 0.14, transparent: true, opacity: 0.5 })
  );
  track.computeLineDistances();
  scene.add(track);

  const envelopes = Array.from({ length: COUNT }, (_, i) => {
    const env = makeEnvelope();
    scene.add(env.group);
    return {
      ...env,
      x: -SPAN + (i * (2 * SPAN)) / COUNT,
      y: 0,
      z: (Math.random() - 0.5) * 1.2,
      vy: 0,
      spin: (Math.random() - 0.5) * 0.4,
      phase: Math.random() * Math.PI * 2,
      status: null,
      fade: 1
    };
  });

  let palette = readPalette();

  function paintStatic() {
    ring.material.color.copy(palette.brand);
    ring.material.emissive.copy(palette.brand);
    halo.material.color.copy(palette.brand);
    ringLight.color.copy(palette.brand);
    track.material.color.copy(palette.edge);
    envelopes.forEach((e) => paintEnvelope(e));
  }

  function paintEnvelope(e) {
    const tint = e.status ? palette[e.status] : null;
    e.body.material.color.copy(palette.paper);
    if (tint) e.body.material.color.lerp(tint, 0.18);
    // Keep paper bright in light mode, subtle in dark mode
    const light = palette.paper.r + palette.paper.g + palette.paper.b > 2.4;
    e.body.material.emissive.copy(e.body.material.color);
    e.body.material.emissiveIntensity = light ? 0.55 : 0.12;
    e.outline.material.color.copy(tint || palette.edge);
    e.flap.material.color.copy(tint || palette.edge);
    e.dot.material.color.copy(tint || palette.edge);
    e.dot.material.opacity = tint ? e.fade : 0;
    e.body.material.transparent = e.fade < 1;
    e.body.material.opacity = e.fade;
    e.outline.material.opacity = e.fade;
    e.flap.material.opacity = e.fade;
  }

  function pickStatus() {
    const r = Math.random();
    if (r < 0.66) return 'valid';
    if (r < 0.83) return 'risky';
    return 'invalid';
  }

  function reset(e) {
    e.x = -SPAN - Math.random() * 1.5;
    e.y = 0;
    e.vy = 0;
    e.z = (Math.random() - 0.5) * 1.2;
    e.status = null;
    e.fade = 1;
    paintEnvelope(e);
  }

  function step(dt, t) {
    envelopes.forEach((e) => {
      e.x += SPEED * dt;
      if (!e.status && e.x > 0) {
        e.status = pickStatus();
        paintEnvelope(e);
      }
      if (e.status === 'invalid') {
        e.vy -= 5 * dt;
        e.y += e.vy * dt;
        e.fade = Math.max(0, e.fade - dt * 0.9);
        paintEnvelope(e);
      } else {
        e.y = Math.sin(t * 1.4 + e.phase) * 0.08;
      }
      if (e.x > SPAN || e.fade <= 0) reset(e);

      // Envelopes near the ring shrink slightly so they appear to pass through it
      const near = Math.max(0, 1 - Math.abs(e.x) / 2.2);
      const scale = 1.22 * (1 - near * 0.2);
      e.group.position.set(e.x, e.y, e.z * (1 - near));
      e.group.scale.setScalar(scale);
      e.group.rotation.set(0.08, -0.62 + e.x * 0.025, Math.sin(t + e.phase) * 0.04 + (e.status === 'invalid' ? e.spin * (1 - e.fade) * 3 : 0));
    });
    ring.rotation.x = t * 0.6;
    halo.material.opacity = 0.1 + Math.sin(t * 2.2) * 0.04;
  }

  function resize() {
    const { width, height } = container.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // Pull the camera back on narrow screens so the whole line stays in view
    CAM.z = camera.aspect < 1.2 ? 12.5 : 9.6;
    camera.position.z = CAM.z;
    camera.updateProjectionMatrix();
  }

  // Gentle parallax with the pointer
  const pointer = { x: 0, y: 0 };
  window.addEventListener('pointermove', (ev) => {
    pointer.x = (ev.clientX / window.innerWidth - 0.5) * 2;
    pointer.y = (ev.clientY / window.innerHeight - 0.5) * 2;
  }, { passive: true });

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let visible = true;
  let running = false;
  let last = performance.now();
  let time = 0;

  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;
    step(dt, time);
    camera.position.x += (CAM.x + pointer.x * 0.7 - camera.position.x) * 0.04;
    camera.position.y += (CAM.y - pointer.y * 0.5 - camera.position.y) * 0.04;
    camera.lookAt(LOOK);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  function renderStill() {
    // Advance once so the still frame shows envelopes before and after the ring
    envelopes.forEach((e, i) => {
      e.x = -SPAN + 1 + (i * (2 * SPAN - 2)) / COUNT;
      if (e.x > 0) { e.status = i % 5 === 0 ? 'risky' : 'valid'; }
      paintEnvelope(e);
    });
    step(0, 0);
    renderer.render(scene, camera);
  }

  function updateRunning() {
    const shouldRun = visible && !document.hidden && !reduceMotion.matches;
    if (shouldRun && !running) {
      running = true;
      last = performance.now();
      requestAnimationFrame(frame);
    } else if (!shouldRun) {
      running = false;
      renderStill();
    }
  }

  new ResizeObserver(() => { resize(); if (!running) renderStill(); }).observe(container);
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; updateRunning(); }).observe(container);
  document.addEventListener('visibilitychange', updateRunning);
  reduceMotion.addEventListener?.('change', updateRunning);

  // Recolour when the theme changes
  document.addEventListener('truvio:theme', () => {
    palette = readPalette();
    paintStatic();
    if (!running) renderer.render(scene, camera);
  });

  resize();
  paintStatic();
  updateRunning();
  return { renderer };
}
