import { useEffect, useRef } from "react";
import * as THREE from "three";
import { MIRROR_LR } from "../lib/postureEngine.js";

// 3D body model driven by the IMU. Vertical axis of the device is `ay`
// (ay ~ +1 g standing). Same maths as the standalone Analyzer.html:
//   pitch = atan2(-az, hypot(ax, ay))   forward / backward lean
//   roll  = atan2(ax, ay)               left / right lean
// `color` is the posture-decision colour (green / blue / amber / red).
export default function Avatar3D({ sensor, color = "#00ff88" }) {
  const mountRef = useRef(null);
  const stateRef = useRef({ sensor, color });

  // Keep latest props available to the animation loop without
  // re-creating the Three.js scene on every sensor update.
  useEffect(() => {
    stateRef.current = { sensor, color };
  }, [sensor, color]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let width = container.clientWidth || 300;
    let height = container.clientHeight || 260;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x080c10);
    scene.fog = new THREE.FogExp2(0x080c10, 0.06);

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
    camera.position.set(0, 1.4, 5.6);
    camera.lookAt(0, 0.1, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    container.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const dir = new THREE.DirectionalLight(0xffffff, 1);
    dir.position.set(5, 10, 5);
    scene.add(dir);
    scene.add(new THREE.GridHelper(30, 30, 0x1e2a38, 0x111820));

    const human = new THREE.Group();
    scene.add(human);

    const matBody = new THREE.MeshStandardMaterial({ color: 0x00ff88, roughness: 0.4, metalness: 0.1 });
    const matHead = new THREE.MeshStandardMaterial({ color: 0xffcc99, roughness: 0.6 });
    const matLimb = new THREE.MeshStandardMaterial({ color: 0x334455, roughness: 0.5 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 0.5), matBody);
    human.add(body);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.35, 32, 32), matHead);
    head.position.y = 1.5;
    human.add(head);

    [[-0.1], [0.1]].forEach(([x]) => {
      const e = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 12, 12),
        new THREE.MeshStandardMaterial({ color: 0x111111 })
      );
      e.position.set(x, 1.6, 0.33);
      human.add(e);
    });

    function makeLimb(x, y, z) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.2, 0.25), matLimb.clone());
      m.position.set(x, y, z);
      human.add(m);
      return m;
    }

    const leftArm = makeLimb(-0.8, 0.4, 0);
    const rightArm = makeLimb(0.8, 0.4, 0);
    const leftLeg = makeLimb(-0.3, -1.6, 0);
    const rightLeg = makeLimb(0.3, -1.6, 0);

    const shadowPlane = new THREE.Mesh(
      new THREE.CircleGeometry(1.2, 32),
      new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.04 })
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = -2.3;
    scene.add(shadowPlane);

    let frameId;

    function animate() {
      frameId = requestAnimationFrame(animate);

      const { sensor: s, color: bodyColor } = stateRef.current;
      const ax = s?.ax ?? 0;
      const ay = s?.ay ?? 1;
      const az = s?.az ?? 0;
      const pitch = Math.atan2(-az, Math.hypot(ax, ay));
      const roll = Math.atan2(ax, ay);

      human.rotation.x += (pitch - human.rotation.x) * 0.12;
      human.rotation.z += ((MIRROR_LR ? roll : -roll) - human.rotation.z) * 0.12;

      const t = Date.now() * 0.002;
      leftArm.rotation.x = Math.sin(t) * 0.1;
      rightArm.rotation.x = -Math.sin(t) * 0.1;
      leftLeg.rotation.x = -Math.sin(t) * 0.08;
      rightLeg.rotation.x = Math.sin(t) * 0.08;

      const sway = Math.abs(s?.gx || 0) + Math.abs(s?.gy || 0);
      human.position.x = Math.sin(Date.now() * 0.005) * sway * 0.003;

      matBody.color.set(bodyColor);
      shadowPlane.material.color.set(bodyColor);

      renderer.render(scene, camera);
    }
    animate();

    const resizeObserver = new ResizeObserver(() => {
      width = container.clientWidth || width;
      height = container.clientHeight || height;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    });
    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div ref={mountRef} className="w-full h-full min-h-[260px]" />;
}
