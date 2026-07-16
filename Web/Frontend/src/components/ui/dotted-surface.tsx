import React from "react";
import * as THREE from "three";
import { cn } from "@/lib/utils";

export type DottedSurfaceProps = {
  className?: string;
  /** Dot color at rest; defaults to the theme's muted foreground tone */
  baseColor?: string;
  /** Dot color near the cursor; defaults to the theme's primary violet */
  highlightColor?: string;
};

// Interactive 3D dot field: a slow sine wave ripples the grid while dots near
// the pointer lift and shift color. Renders transparent so the page's own
// background (tokens, glow orbs) shows through. Honors prefers-reduced-motion.
export const DottedSurface = ({
  className,
  baseColor = "#9ca3af",
  highlightColor = "#a78bfa",
}: DottedSurfaceProps) => {
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const SEPARATION = 90;
    const AMOUNTX = 46;
    const AMOUNTY = 34;

    let width = container.clientWidth;
    let height = container.clientHeight;

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(55, width / height, 1, 10000);
    camera.position.set(0, 780, 1500);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.position = "absolute";
    renderer.domElement.style.inset = "0";
    container.appendChild(renderer.domElement);

    // Build particle grid
    const numParticles = AMOUNTX * AMOUNTY;
    const positions = new Float32Array(numParticles * 3);
    const basePositions = new Float32Array(numParticles * 3);
    const colors = new Float32Array(numParticles * 3);

    const base = new THREE.Color(baseColor);
    const highlight = new THREE.Color(highlightColor);

    let i = 0;
    for (let ix = 0; ix < AMOUNTX; ix++) {
      for (let iy = 0; iy < AMOUNTY; iy++) {
        const x = ix * SEPARATION - (AMOUNTX * SEPARATION) / 2;
        const z = iy * SEPARATION - (AMOUNTY * SEPARATION) / 2;
        const idx = i * 3;

        positions[idx] = x;
        positions[idx + 1] = 0;
        positions[idx + 2] = z;

        basePositions[idx] = x;
        basePositions[idx + 1] = 0;
        basePositions[idx + 2] = z;

        colors[idx] = base.r;
        colors[idx + 1] = base.g;
        colors[idx + 2] = base.b;

        i++;
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 9,
      vertexColors: true,
      transparent: true,
      opacity: 1,
      sizeAttenuation: true,
    });

    const points = new THREE.Points(geometry, material);
    scene.add(points);

    // Mouse tracking via raycast onto a horizontal plane
    const raycaster = new THREE.Raycaster();
    const mouseNDC = new THREE.Vector2(9999, 9999);
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const mouseWorld = new THREE.Vector3(9999, 0, 9999);
    let mouseActive = false;
    let mouseTimeout: ReturnType<typeof setTimeout>;

    const updateMouseWorld = () => {
      raycaster.setFromCamera(mouseNDC, camera);
      const hit = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(groundPlane, hit)) {
        mouseWorld.copy(hit);
      }
    };

    // Listen on window (not the container) so the effect still tracks the
    // cursor when the surface sits behind other content (e.g. as a fixed
    // page background under pointer-events-none). Coordinates are converted
    // to container-relative NDC; moves outside the container simply land the
    // raycast beyond the influence radius.
    const handlePointerMove = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      mouseNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      updateMouseWorld();
      mouseActive = true;
      clearTimeout(mouseTimeout);
      mouseTimeout = setTimeout(() => {
        mouseActive = false;
      }, 2500);
    };

    const handlePointerLeave = () => {
      mouseActive = false;
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("blur", handlePointerLeave);

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    let count = 0;
    let animationFrameId: number;
    const INFLUENCE_RADIUS = 380;
    const LIFT_STRENGTH = 210;

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      const posAttr = geometry.attributes.position as THREE.BufferAttribute;
      const colorAttr = geometry.attributes.color as THREE.BufferAttribute;
      const arr = posAttr.array as Float32Array;
      const colArr = colorAttr.array as Float32Array;

      let p = 0;
      for (let ix = 0; ix < AMOUNTX; ix++) {
        for (let iy = 0; iy < AMOUNTY; iy++) {
          const idx = p * 3;
          const bx = basePositions[idx];
          const bz = basePositions[idx + 2];

          // base wave motion (still under reduced motion)
          let y = reducedMotion
            ? 0
            : Math.sin((ix + count) * 0.3) * 26 + Math.sin((iy + count) * 0.5) * 26;

          // mouse influence: lift dots near the cursor, fading with distance
          let mix = 0;
          if (mouseActive) {
            const dx = bx - mouseWorld.x;
            const dz = bz - mouseWorld.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            if (dist < INFLUENCE_RADIUS) {
              const falloff = 1 - dist / INFLUENCE_RADIUS;
              const eased = falloff * falloff;
              y += eased * LIFT_STRENGTH;
              mix = eased;
            }
          }

          arr[idx + 1] = y;

          colArr[idx] = base.r + (highlight.r - base.r) * mix;
          colArr[idx + 1] = base.g + (highlight.g - base.g) * mix;
          colArr[idx + 2] = base.b + (highlight.b - base.b) * mix;

          p++;
        }
      }

      posAttr.needsUpdate = true;
      colorAttr.needsUpdate = true;

      renderer.render(scene, camera);
      if (!reducedMotion) count += 0.06;
    };

    const handleResize = () => {
      width = container.clientWidth;
      height = container.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    window.addEventListener("resize", handleResize);

    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      clearTimeout(mouseTimeout);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("blur", handlePointerLeave);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, [baseColor, highlightColor]);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className={cn("absolute inset-0 overflow-hidden", className)}
    />
  );
};

export default DottedSurface;
