import React from 'react';
import * as THREE from 'three';

interface GameState {
  player1Score: number;
  player2Score: number;
  gameStatus: 'playing' | 'ended';
  winner: 'red' | 'blue' | null;
}

export type PortalPongConfigPreset = 'light' | 'normal' | 'chaos';
export type WizardColorKey = 'teal' | 'cyan' | 'lavender' | 'darkPurple' | 'red' | 'blue' | 'yellow' | 'orange';

const WIZARD_COLORS: Record<WizardColorKey, { hex: number; label: string; hudClass: string }> = {
  teal: { hex: 0x14b8a6, label: 'Teal', hudClass: 'text-teal-300' },
  cyan: { hex: 0x22d3ee, label: 'Cyan', hudClass: 'text-cyan-300' },
  lavender: { hex: 0xc4b5fd, label: 'Lavender', hudClass: 'text-violet-200' },
  darkPurple: { hex: 0x6d28d9, label: 'Dark Purple', hudClass: 'text-violet-400' },
  red: { hex: 0xef4444, label: 'Red', hudClass: 'text-rose-300' },
  blue: { hex: 0x3b82f6, label: 'Blue', hudClass: 'text-blue-300' },
  yellow: { hex: 0xfacc15, label: 'Yellow', hudClass: 'text-yellow-300' },
  orange: { hex: 0xf97316, label: 'Orange', hudClass: 'text-orange-300' }
};

export interface PortalPongConfig {
  background: 'random' | 'bg1' | 'bg2' | 'bg3' | 'bg4' | 'bg5' | 'bg6' | 'bg7';
  preset: PortalPongConfigPreset;
  parallax: boolean;
  seed: number;
  player1Color?: WizardColorKey;
  player2Color?: WizardColorKey;
  aiDifficulty?: number;
  localPlayer?: 'player1' | 'player2';
  mode?: 'ai' | 'matchmaking';
  matchmakingRoom?: string;
}

interface PortalPongGameProps {
  config?: PortalPongConfig;
  onExit?: () => void;
}

interface Bounds {
  width: number;
  height: number;
}

interface ParallaxLayers {
  far: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  mid?: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  near?: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  edgeFog?: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
}

interface PortalVisual {
  group: THREE.Group;
  ring: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  rim: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  inner: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  glow: THREE.Sprite;
  fog: THREE.Sprite;
  pulseOffset: number;
}

interface ControllerFrame {
  left: boolean;
  right: boolean;
  down: boolean;
  jumpQueued: boolean;
  jumpHeld: boolean;
  shieldHeld: boolean;
  castQueued: boolean;
  aimX: number;
  aimY: number;
}

interface MobileStickState {
  active: boolean;
  x: number;
  y: number;
  jumpLatch?: boolean;
  fireQueued?: boolean;
}

const BG_IDS: Array<Exclude<PortalPongConfig['background'], 'random'>> = [
  'bg1',
  'bg2',
  'bg3',
  'bg4',
  'bg5',
  'bg6',
  'bg7'
];

const PRESET_TO_PAIRS: Record<PortalPongConfigPreset, number> = {
  light: 1,
  normal: 2,
  chaos: 3
};

const WIN_SCORE = 7;
const REMOTE_STALE_MS = 1600;
const POWERUP_DURATION = 60 * 60; // 60 seconds at 60fps

type PowerupType = 'tripleJump' | 'permaFlight' | 'tripleBlast' | 'reflector' | 'teleport' | 'doubleSize' | 'quarterSize' | 'homingShots';
const ALL_POWERUPS: PowerupType[] = ['tripleJump', 'permaFlight', 'tripleBlast', 'reflector', 'teleport', 'doubleSize', 'quarterSize', 'homingShots'];
const POWERUP_COLORS: Record<PowerupType, number> = {
  tripleJump: 0x22c55e,
  permaFlight: 0x06b6d4,
  tripleBlast: 0xf97316,
  reflector: 0x3b82f6,
  teleport: 0xa855f7,
  doubleSize: 0xef4444,
  quarterSize: 0xfbbf24,
  homingShots: 0xec4899
};
const POWERUP_LABELS: Record<PowerupType, string> = {
  tripleJump: 'Triple Jump',
  permaFlight: 'Perma Flight',
  tripleBlast: 'Triple Blast',
  reflector: 'Reflector',
  teleport: 'Teleport',
  doubleSize: 'Double Size',
  quarterSize: 'Mini Mode',
  homingShots: 'Homing'
};

const buildRandom = (seed: number) => {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
};

const randomBetween = (random: () => number, min: number, max: number) => min + random() * (max - min);
const chooseOne = <T,>(random: () => number, values: readonly T[]): T => values[Math.floor(random() * values.length)];
const jitterColor = (baseHex: number, random: () => number, spread = 0.12) => {
  const color = new THREE.Color(baseHex);
  color.offsetHSL(
    randomBetween(random, -0.02, 0.02),
    randomBetween(random, -spread * 0.25, spread * 0.35),
    randomBetween(random, -spread, spread)
  );
  return color;
};
const hexToCss = (hex: number) => `#${hex.toString(16).padStart(6, '0')}`;
const shortestWrappedDelta = (current: number, previous: number, span: number) => {
  let delta = current - previous;
  const halfSpan = span / 2;
  if (delta > halfSpan) {
    delta -= span;
  } else if (delta < -halfSpan) {
    delta += span;
  }
  return delta;
};

const resolveBackground = (background: PortalPongConfig['background'], random: () => number) => {
  if (background !== 'random') {
    return background;
  }
  return BG_IDS[Math.floor(random() * BG_IDS.length)];
};

class Platform {
  mesh: THREE.Mesh;
  top: number;
  bottom: number;
  left: number;
  right: number;

  constructor(scene: THREE.Scene, x: number, y: number, width = 2) {
    const geometry = new THREE.BoxGeometry(width, 0.16, 0.78);
    const material = new THREE.MeshPhongMaterial({ color: 0x95a5a6 });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.set(x, y, 0);
    scene.add(this.mesh);

    this.top = y + 0.08;
    this.bottom = y - 0.08;
    this.left = x - width/2;
    this.right = x + width/2;
  }
}

class Spell {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  lifetime: number;
  age: number;
  exploded: boolean;
  explosionRadius: number;
  explosionMesh?: THREE.Mesh;
  explosionMaterial?: THREE.ShaderMaterial;
  explosionFramesLeft: number;
  explosionTotalFrames: number;
  owner: 'player1' | 'player2';
  ballImpulseApplied: boolean;
  nudgedPlayers: Set<'player1' | 'player2'>;
  target: THREE.Vector3;
  tailMeshes: THREE.Mesh[];
  tailPoints: THREE.Vector3[];
  fizzleParticles: Array<{ mesh: THREE.Mesh; velocity: THREE.Vector3; life: number }>;
  scene: THREE.Scene;
  explosionScale: number;
  homingTargets: Array<{ position: THREE.Vector3 }> | null;

  constructor(
    scene: THREE.Scene,
    position: THREE.Vector3,
    direction: THREE.Vector3,
    target: THREE.Vector3,
    owner: 'player1' | 'player2',
    explosionScale = 1
  ) {
    const geometry = new THREE.SphereGeometry(0.1);
    const material = new THREE.MeshBasicMaterial({ 
      color: 0xb388ff,
      transparent: true,
      opacity: 0.9
    });
    this.mesh = new THREE.Mesh(geometry, material);
    
    const normalizedDirection = direction.clone().normalize();
    const spawnOffset = normalizedDirection.clone().multiplyScalar(0.7);
    spawnOffset.y += 0.35;
    this.mesh.position.copy(position).add(spawnOffset);

    this.target = target.clone();
    const toTarget = this.target.clone().sub(this.mesh.position);
    const targetDirection = toTarget.lengthSq() > 0.0001 ? toTarget.normalize() : normalizedDirection;
    this.velocity = targetDirection.multiplyScalar(0.36);
    
    this.lifetime = 70;
    this.age = 0;
    this.exploded = false;
    this.explosionScale = explosionScale;
    this.explosionRadius = 1.05 * explosionScale;
    this.explosionTotalFrames = 52;
    this.explosionFramesLeft = this.explosionTotalFrames;
    this.homingTargets = null;
    this.owner = owner;
    this.ballImpulseApplied = false;
    this.nudgedPlayers = new Set();
    this.tailMeshes = [];
    this.tailPoints = [];
    this.fizzleParticles = [];
    this.scene = scene;
    scene.add(this.mesh);

    for (let i = 0; i < 6; i += 1) {
      const tail = new THREE.Mesh(
        new THREE.SphereGeometry(0.06 - i * 0.006, 10, 10),
        new THREE.MeshBasicMaterial({
          color: 0xc8a2ff,
          transparent: true,
          opacity: 0.42 - i * 0.05,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        })
      );
      this.tailMeshes.push(tail);
      this.tailPoints.push(this.mesh.position.clone());
      scene.add(tail);
    }
  }

  update(platforms: Platform[], ball: Ball, worldHalfWidth: number) {
    if (this.exploded) {
      this.explosionFramesLeft -= 1;
      if (this.explosionMesh && this.explosionMaterial) {
        this.explosionMesh.scale.addScalar(0.015);
        this.explosionMaterial.uniforms.uTime.value += 0.045;
        const life = Math.max(0, this.explosionFramesLeft / this.explosionTotalFrames);
        const progress = Math.pow(1 - life, 0.72);
        this.explosionMaterial.uniforms.uProgress.value = THREE.MathUtils.clamp(
          progress,
          0,
          1
        );
        this.explosionMaterial.uniforms.uOpacity.value = Math.pow(life, 0.58);
      }

      let allFizzled = true;
      this.fizzleParticles.forEach((particle) => {
        if (particle.life <= 0) {
          particle.mesh.visible = false;
          return;
        }
        allFizzled = false;
        particle.life -= 1;
        particle.velocity.y -= 0.00035;
        particle.mesh.position.add(particle.velocity);
        particle.mesh.scale.multiplyScalar(0.99);
        const material = particle.mesh.material as THREE.MeshBasicMaterial;
        material.opacity = Math.max(0, particle.life / 38);
      });

      if (this.explosionFramesLeft <= 0 && allFizzled) {
        this.cleanup();
        return true;
      }
      return false;
    }
    
    this.lifetime--;
    this.age += 1;
    if (this.lifetime <= 0) {
      this.explode();
      return false;
    }

    // Homing: steer toward nearest target
    if (this.homingTargets && this.homingTargets.length > 0) {
      let closest: THREE.Vector3 | null = null;
      let closestDist = Infinity;
      for (const t of this.homingTargets) {
        const d = this.mesh.position.distanceTo(t.position);
        if (d < closestDist) { closestDist = d; closest = t.position; }
      }
      if (closest) {
        const toTarget = closest.clone().sub(this.mesh.position).normalize();
        this.velocity.lerp(toTarget.multiplyScalar(0.36), 0.07);
      }
    }
    
    this.velocity.y -= 0.002;
    this.mesh.position.add(this.velocity);
    this.tailPoints.unshift(this.mesh.position.clone());
    if (this.tailPoints.length > this.tailMeshes.length) {
      this.tailPoints.length = this.tailMeshes.length;
    }

    const velocity2d = new THREE.Vector3(-this.velocity.y, this.velocity.x, 0);
    if (velocity2d.lengthSq() > 0.0001) {
      velocity2d.normalize();
    }
    this.tailMeshes.forEach((tail, idx) => {
      const point = this.tailPoints[Math.min(idx, this.tailPoints.length - 1)];
      const wiggleAmp = Math.max(0.01, 0.08 - idx * 0.011);
      const wigglePhase = this.age * 0.42 - idx * 0.8;
      const wiggle = Math.sin(wigglePhase) * wiggleAmp;
      tail.position.copy(point).addScaledVector(velocity2d, wiggle);
      const mat = tail.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0.05, 0.36 - idx * 0.045);
    });

    const toTarget = this.target.clone().sub(this.mesh.position);
    if (toTarget.length() <= Math.max(0.18, this.velocity.length() * 1.2)) {
      this.explode();
      return false;
    }

    if (this.mesh.position.y <= 0) {
      this.explode();
      return false;
    }

    const touchingPlatform = platforms.some((platform) => (
      this.mesh.position.x >= platform.left &&
      this.mesh.position.x <= platform.right &&
      this.mesh.position.y >= platform.bottom - 0.05 &&
      this.mesh.position.y <= platform.top + 0.05
    ));

    if (touchingPlatform || this.mesh.position.x > worldHalfWidth + 0.8 || this.mesh.position.x < -worldHalfWidth - 0.8) {
      this.explode();
      return false;
    }

    if (this.mesh.position.distanceTo(ball.mesh.position) <= 0.5) {
      this.explode();
    }

    return false;
  }

  explode() {
    if (this.exploded) {
      return;
    }
    this.exploded = true;
    const explosionGeo = new THREE.SphereGeometry(this.explosionRadius);
    const explosionMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 0.75 },
        uProgress: { value: 0.04 },
        uSeed: { value: this.age * 0.137 + (this.owner === 'player1' ? 1.13 : 2.31) },
        uColorCore: { value: new THREE.Color(0xcdb4ff) },
        uColorArc: { value: new THREE.Color(0x9c6bff) },
        uColorHot: { value: new THREE.Color(0xf3ecff) }
      },
      vertexShader: `
        varying vec3 vLocalPos;
        void main() {
          vLocalPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uOpacity;
        uniform float uProgress;
        uniform float uSeed;
        uniform vec3 uColorCore;
        uniform vec3 uColorArc;
        uniform vec3 uColorHot;
        varying vec3 vLocalPos;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }

        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          float a = hash(i);
          float b = hash(i + vec2(1.0, 0.0));
          float c = hash(i + vec2(0.0, 1.0));
          float d = hash(i + vec2(1.0, 1.0));
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
        }

        void main() {
          vec3 p = normalize(vLocalPos);
          float radius = length(vLocalPos);
          float theta = atan(p.y, p.x);
          float phi = atan(p.z, length(p.xy));

          float electricField = noise(vec2(theta * 6.2 + uSeed + uTime * 2.6, phi * 9.0 - uTime * 1.7));
          electricField += noise(vec2(theta * 12.3 - uTime * 3.5, phi * 16.0 + uSeed));
          electricField *= 0.5;

          float front = smoothstep(0.0, 0.18, uProgress);
          float core = smoothstep(0.48, 0.0, radius) * (1.0 - uProgress * 0.8);
          float shock = exp(-abs(radius - uProgress) * 12.0) * front;
          float arc1 = pow(max(0.0, sin(theta * 13.0 + electricField * 4.5 + uTime * 8.8)), 12.0);
          float arc2 = pow(max(0.0, sin(phi * 18.0 - electricField * 5.7 - uTime * 10.7)), 10.0);
          float arcs = (arc1 + arc2) * shock;

          float energy = core * 0.55 + shock * (0.75 + electricField * 0.5) + arcs * 1.35;
          vec3 color = mix(uColorCore, uColorArc, clamp(shock + arcs * 0.35, 0.0, 1.0));
          color = mix(color, uColorHot, clamp(arcs + core * 0.7, 0.0, 1.0));

          float alpha = clamp(energy * uOpacity, 0.0, 1.0);
          gl_FragColor = vec4(color * (0.9 + shock * 0.5), alpha);
        }
      `
    });
    this.explosionMesh = new THREE.Mesh(explosionGeo, explosionMat);
    this.explosionMaterial = explosionMat;
    this.explosionMesh.position.copy(this.mesh.position);
    this.scene.add(this.explosionMesh);
    this.fizzleParticles = [];
    for (let i = 0; i < 11; i += 1) {
      const particle = new THREE.Mesh(
        new THREE.SphereGeometry(randomBetween(Math.random, 0.03, 0.055), 8, 8),
        new THREE.MeshBasicMaterial({
          color: i % 3 === 0 ? 0xf3ecff : 0xc49bff,
          transparent: true,
          opacity: 0.85,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        })
      );
      particle.position.copy(this.mesh.position);
      const drift = new THREE.Vector3(
        randomBetween(Math.random, -0.03, 0.03),
        randomBetween(Math.random, 0.01, 0.055),
        0
      );
      this.fizzleParticles.push({
        mesh: particle,
        velocity: drift,
        life: Math.floor(randomBetween(Math.random, 18, 38))
      });
      this.scene.add(particle);
    }
    this.tailMeshes.forEach((tail) => {
      const mat = tail.material as THREE.MeshBasicMaterial;
      mat.opacity = 0;
      tail.visible = false;
    });
  }

  cleanup() {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    const projectileMaterial = this.mesh.material;
    if (Array.isArray(projectileMaterial)) {
      projectileMaterial.forEach((material) => material.dispose());
    } else {
      projectileMaterial.dispose();
    }
    this.tailMeshes.forEach((tail) => {
      this.scene.remove(tail);
      tail.geometry.dispose();
      const tailMaterial = tail.material;
      if (Array.isArray(tailMaterial)) {
        tailMaterial.forEach((material) => material.dispose());
      } else {
        tailMaterial.dispose();
      }
    });
    this.fizzleParticles.forEach((particle) => {
      this.scene.remove(particle.mesh);
      particle.mesh.geometry.dispose();
      const particleMaterial = particle.mesh.material;
      if (Array.isArray(particleMaterial)) {
        particleMaterial.forEach((material) => material.dispose());
      } else {
        particleMaterial.dispose();
      }
    });
    this.fizzleParticles = [];
    if (this.explosionMesh) {
      this.scene.remove(this.explosionMesh);
      this.explosionMesh.geometry.dispose();
      const explosionMaterial = this.explosionMesh.material;
      if (Array.isArray(explosionMaterial)) {
        explosionMaterial.forEach((material) => material.dispose());
      } else {
        explosionMaterial.dispose();
      }
      this.explosionMaterial = undefined;
    }
  }
}

class Ball {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  radius: number;

  constructor(scene: THREE.Scene) {
    this.radius = 0.3;
    const geometry = new THREE.SphereGeometry(this.radius);
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.mesh = new THREE.Mesh(geometry, material);
    this.velocity = new THREE.Vector3(
      (Math.random() - 0.5) * 0.12,
      (Math.random() - 0.5) * 0.12,
      0
    );
    this.mesh.position.set(0, 4.2, 0);
    scene.add(this.mesh);
  }

  update(gameHeight: number, worldHalfWidth: number, platforms: Platform[]) {
    const nextPosition = this.mesh.position.clone().add(this.velocity);

    // Check platform collisions
    platforms.forEach(platform => {
      // Ball's current bounds
      const ballBottom = this.mesh.position.y - 0.3;
      const ballTop = this.mesh.position.y + 0.3;
      const ballLeft = this.mesh.position.x - 0.3;
      const ballRight = this.mesh.position.x + 0.3;

      // Ball's next bounds
      const nextBallBottom = nextPosition.y - 0.3;
      const nextBallTop = nextPosition.y + 0.3;
      const nextBallLeft = nextPosition.x - 0.3;
      const nextBallRight = nextPosition.x + 0.3;

      // Collision checks
      if (nextBallRight >= platform.left && nextBallLeft <= platform.right) {
        // Vertical collision
        if (nextBallBottom <= platform.top && ballBottom > platform.top) {
          // Hitting platform from above
          nextPosition.y = platform.top + 0.3;
          this.velocity.y *= -1;
        } else if (nextBallTop >= platform.bottom && ballTop < platform.bottom) {
          // Hitting platform from below
          nextPosition.y = platform.bottom - 0.3;
          this.velocity.y *= -1;
        }
      }

      if (nextBallTop >= platform.bottom && nextBallBottom <= platform.top) {
        // Horizontal collision
        if (nextBallRight >= platform.left && ballRight < platform.left) {
          // Hitting platform from left
          nextPosition.x = platform.left - 0.3;
          this.velocity.x *= -1;
        } else if (nextBallLeft <= platform.right && ballLeft > platform.right) {
          // Hitting platform from right
          nextPosition.x = platform.right + 0.3;
          this.velocity.x *= -1;
        }
      }
    });

    // Update position after collision checks
    this.mesh.position.copy(nextPosition);
    
    // Existing wrapping and bounds checks
    if (this.mesh.position.x > worldHalfWidth) this.mesh.position.x = -worldHalfWidth;
    if (this.mesh.position.x < -worldHalfWidth) this.mesh.position.x = worldHalfWidth;

    if (this.mesh.position.y > gameHeight - this.radius) {
      this.mesh.position.y = gameHeight - this.radius;
      this.velocity.y = -Math.abs(this.velocity.y);
    }

    // Hard clamp + bounce so the ball cannot sink and jitter in the floor.
    if (this.mesh.position.y < this.radius) {
      this.mesh.position.y = this.radius;
      this.velocity.y = Math.abs(this.velocity.y);
      if (this.velocity.y < 0.09) {
        this.velocity.y = 0.09;
      }
    }

    const speed = this.velocity.length();
    if (speed > 0.3) {
      this.velocity.multiplyScalar(0.3 / speed);
    }
  }

  bounce(normal: THREE.Vector3, speed = 1) {
    const dot = this.velocity.dot(normal);
    this.velocity.sub(normal.multiplyScalar(2 * dot));
    this.velocity.multiplyScalar(speed);
  }

  applyImpulse(impulse: THREE.Vector3) {
    this.velocity.add(impulse);
    const speed = this.velocity.length();
    if (speed < 0.12) {
      this.velocity.normalize().multiplyScalar(0.12);
    }
  }

  reset() {
    this.mesh.position.set(0, 4.2, 0);
    this.velocity.set(
      (Math.random() - 0.5) * 0.12,
      (Math.random() - 0.5) * 0.12,
      0
    );
  }
}

interface WizardRig {
  root: THREE.Group;
  hat: THREE.Mesh;
  wand: THREE.Mesh;
  glow: THREE.Mesh;
  baseWandRotationZ: number;
}

const createWizardAvatar = (color: number, isLeftSide: boolean): WizardRig => {
  const group = new THREE.Group();
  const robeColor = new THREE.Color(color).multiplyScalar(0.5);

  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.38, 18, 18),
    new THREE.MeshPhongMaterial({ color, shininess: 70 })
  );
  body.position.y = 0.37;
  group.add(body);

  const robe = new THREE.Mesh(
    new THREE.ConeGeometry(0.34, 0.56, 18),
    new THREE.MeshPhongMaterial({ color: robeColor, shininess: 35 })
  );
  robe.position.y = 0.05;
  group.add(robe);

  const hat = new THREE.Mesh(
    new THREE.ConeGeometry(0.28, 0.6, 18),
    new THREE.MeshPhongMaterial({ color: 0x222831, shininess: 10 })
  );
  hat.position.y = 0.95;
  group.add(hat);

  const wand = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.02, 0.55, 10),
    new THREE.MeshPhongMaterial({ color: 0x4a2c17 })
  );
  const baseWandRotationZ = isLeftSide ? -0.5 : 0.5;
  wand.rotation.z = baseWandRotationZ;
  wand.position.set(isLeftSide ? -0.34 : 0.34, 0.32, 0.08);
  group.add(wand);

  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xfff4a6, transparent: true, opacity: 0.85 })
  );
  glow.position.copy(wand.position).add(new THREE.Vector3(isLeftSide ? -0.03 : 0.03, 0.3, 0));
  group.add(glow);

  return {
    root: group,
    hat,
    wand,
    glow,
    baseWandRotationZ
  };
};

class Player {
  mesh: THREE.Group;
  rig: WizardRig;
  velocity: THREE.Vector3;
  onGround: boolean;
  direction: THREE.Vector3;
  pressingDown: boolean;
  spellCooldown: number;
  shieldActive: boolean;
  shieldMesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  shieldPulseTime: number;
  id: 'player1' | 'player2';
  jumpBufferFrames: number;
  coyoteFrames: number;
  jumpsUsed: number;
  jumpHeld: boolean;
  holdJumpFrames: number;
  flyActive: boolean;
  flyFuelFrames: number;
  flySputterPhase: number;
  facing: 1 | -1;
  wobbleTime: number;
  powerups: Partial<Record<PowerupType, number>>;
  baseColor: number;
  activePowerupLabel: string;

  constructor(scene: THREE.Scene, color: number, startX: number, id: 'player1' | 'player2') {
    this.rig = createWizardAvatar(color, startX < 0);
    this.mesh = this.rig.root;
    this.mesh.scale.setScalar(0.84);
    this.mesh.position.set(startX, 0.44, 0);
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.onGround = true;
    this.direction = new THREE.Vector3(1, 0, 0);
    this.pressingDown = false;
    this.spellCooldown = 0;
    this.shieldActive = false;
    this.shieldPulseTime = Math.random() * Math.PI * 2;
    this.id = id;
    this.jumpBufferFrames = 0;
    this.coyoteFrames = 0;
    this.jumpsUsed = 0;
    this.jumpHeld = false;
    this.holdJumpFrames = 0;
    this.flyActive = false;
    this.flyFuelFrames = 180; // ~3 seconds at 60fps
    this.flySputterPhase = Math.random() * Math.PI * 2;
    this.facing = startX < 0 ? 1 : -1;
    this.wobbleTime = Math.random() * Math.PI * 2;
    this.powerups = {};
    this.baseColor = color;
    this.activePowerupLabel = '';
    this.mesh.rotation.y = this.facing === 1 ? 0 : Math.PI;

    this.shieldMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.64, 20, 20),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    this.shieldMesh.visible = false;
    this.shieldMesh.position.set(0, 0.45, 0);
    this.mesh.add(this.shieldMesh);
    scene.add(this.mesh);
  }

  hasPowerup(type: PowerupType): boolean {
    return (this.powerups[type] ?? 0) > 0;
  }

  grantPowerup(type: PowerupType) {
    this.powerups[type] = POWERUP_DURATION;
    this.activePowerupLabel = POWERUP_LABELS[type];
  }

  update(platforms: Platform[], worldHalfWidth: number) {
    // Tick powerup timers
    let anyActive = false;
    let lastLabel = '';
    for (const key of ALL_POWERUPS) {
      if ((this.powerups[key] ?? 0) > 0) {
        this.powerups[key] = (this.powerups[key] as number) - 1;
        anyActive = true;
        lastLabel = POWERUP_LABELS[key];
      }
    }
    this.activePowerupLabel = anyActive ? lastLabel : '';

    // Double size: scale 2x, speed 0.5x; quarter size: scale 0.5x
    const baseScale = 0.84;
    const targetScale = this.hasPowerup('doubleSize') ? baseScale * 2 : this.hasPowerup('quarterSize') ? baseScale * 0.5 : baseScale;
    this.mesh.scale.setScalar(targetScale);

    // Reflector: auto shield while active
    if (this.hasPowerup('reflector')) {
      this.shieldActive = true;
    }

    const playerRadius = this.hasPowerup('doubleSize') ? 0.88 : 0.44;
    const prevPosition = this.mesh.position.clone();

    if (this.spellCooldown > 0) {
      this.spellCooldown -= 1;
    }
    this.shieldPulseTime += 0.11;
    if (this.jumpBufferFrames > 0) {
      this.jumpBufferFrames -= 1;
    }
    if (this.onGround) {
      this.coyoteFrames = 7;
      this.jumpsUsed = 0;
      this.flyActive = false;
      this.flyFuelFrames = 180;
    } else if (this.coyoteFrames > 0) {
      this.coyoteFrames -= 1;
    }

    if (!this.onGround || this.velocity.y > 0) {
      const canFlyNow = !this.onGround && this.jumpsUsed >= 2 && this.jumpHeld && this.flyFuelFrames > 0;
      if (canFlyNow) {
        this.flyActive = true;
      } else if (!this.jumpHeld || this.flyFuelFrames <= 0) {
        this.flyActive = false;
      }

      if (this.flyActive) {
        // Sputtery flight: intermittent lift bursts rather than smooth hover.
        this.flySputterPhase += 0.43;
        const sputter = Math.sin(this.flySputterPhase) * 0.55 + (Math.random() - 0.5) * 0.45;
        const lift = 0.006 + Math.max(0, sputter) * 0.012;
        this.velocity.y += lift;
        this.velocity.y -= 0.0055;
        this.velocity.y = THREE.MathUtils.clamp(this.velocity.y, -0.04, 0.135);
        this.velocity.x *= 0.985;
        // Perma flight never depletes fuel
        if (!this.hasPowerup('permaFlight')) {
          this.flyFuelFrames = Math.max(0, this.flyFuelFrames - 1);
        }
      } else {
        // Classic platformer jump shaping: hold to stretch arc, tap for short hop.
        const canApplyHold = this.jumpHeld && this.holdJumpFrames > 0 && this.velocity.y > 0;
        if (canApplyHold) {
          // Hold adds roughly one-third extra jump height per jump.
          this.velocity.y += 0.0052;
          this.holdJumpFrames -= 1;
        }
        this.velocity.y -= 0.014;
      }
    }

    const maxAirJumps = this.hasPowerup('tripleJump') ? 2 : 1;
    const canUseGroundJump = this.onGround || this.coyoteFrames > 0;
    const canUseAirJump = this.jumpsUsed < maxAirJumps + 1 && !canUseGroundJump;
    if (this.jumpBufferFrames > 0 && (canUseGroundJump || canUseAirJump)) {
      const quickJumpVelocity = 0.315;
      this.velocity.y = quickJumpVelocity;
      this.jumpBufferFrames = 0;
      this.coyoteFrames = 0;
      this.onGround = false;
      this.jumpsUsed = canUseGroundJump ? 1 : this.jumpsUsed + 1;
      this.holdJumpFrames = 9;
    }

    const nextPosition = this.mesh.position.clone().add(this.velocity);

    this.onGround = false;
    platforms.forEach(platform => {
      const landingLeniency = 0.14;
      const sideLeniency = 0.22;
      const playerLeft = nextPosition.x - playerRadius + sideLeniency;
      const playerRight = nextPosition.x + playerRadius - sideLeniency;
      const playerTop = nextPosition.y + playerRadius;
      const playerBottom = nextPosition.y - playerRadius;
      const wasFeetAbove = prevPosition.y - playerRadius >= platform.top - landingLeniency;
      const isFalling = this.velocity.y <= 0;
      const overlapsX = playerRight >= platform.left && playerLeft <= platform.right;

      if (overlapsX) {
        if (
          !this.pressingDown &&
          isFalling &&
          wasFeetAbove &&
          playerBottom <= platform.top + landingLeniency
        ) {
          nextPosition.y = platform.top + playerRadius;
          this.velocity.y = 0;
          this.onGround = true;
        } else if (
          playerTop >= platform.bottom &&
          prevPosition.y + playerRadius <= platform.bottom + 0.02 &&
          this.velocity.y > 0
        ) {
          nextPosition.y = platform.bottom - playerRadius;
          this.velocity.y = 0;
        }
      }

      if (playerTop >= platform.bottom && playerBottom <= platform.top) {
        if (playerRight >= platform.left && 
            prevPosition.x + playerRadius <= platform.left) {
          nextPosition.x = platform.left - playerRadius;
          this.velocity.x = 0;
        } else if (playerLeft <= platform.right && 
                   prevPosition.x - playerRadius >= platform.right) {
          nextPosition.x = platform.right + playerRadius;
          this.velocity.x = 0;
        }
      }
    });

    this.mesh.position.copy(nextPosition);

    if (this.mesh.position.y < 0) {
      this.mesh.position.y = 0;
      this.velocity.y = 0;
      this.onGround = true;
      this.flyActive = false;
      this.flyFuelFrames = this.hasPowerup('permaFlight') ? 180 : 180;
    }

    if (this.mesh.position.x > worldHalfWidth) this.mesh.position.x = -worldHalfWidth;
    if (this.mesh.position.x < -worldHalfWidth) this.mesh.position.x = worldHalfWidth;

    this.velocity.x *= 0.78;

    const horizontalSpeed = Math.abs(this.velocity.x);
    this.wobbleTime += 0.08 + horizontalSpeed * 0.6;
    const wobble = Math.sin(this.wobbleTime) * Math.min(0.12, horizontalSpeed * 0.5 + 0.03);
    this.rig.hat.rotation.z = wobble;
    this.rig.hat.rotation.x = Math.cos(this.wobbleTime * 1.4) * 0.04;
    this.rig.wand.rotation.z = this.rig.baseWandRotationZ + wobble * 1.8;
    this.rig.wand.rotation.x = Math.sin(this.wobbleTime * 1.9) * 0.1;
    this.rig.glow.position.y = 0.62 + Math.abs(wobble) * 0.2;

    if (this.shieldActive) {
      this.shieldMesh.visible = true;
      this.shieldMesh.material.opacity = 0.2 + Math.sin(this.shieldPulseTime) * 0.05;
      this.shieldMesh.scale.setScalar(1 + Math.sin(this.shieldPulseTime * 1.7) * 0.02);
    } else {
      this.shieldMesh.material.opacity = Math.max(0, this.shieldMesh.material.opacity - 0.06);
      if (this.shieldMesh.material.opacity <= 0.01) {
        this.shieldMesh.visible = false;
      }
    }
  }

  queueJump() {
    this.jumpBufferFrames = 8;
  }

  moveLeft() {
    const sp = this.hasPowerup('doubleSize') ? 0.5 : 1;
    this.velocity.x = Math.max(this.velocity.x - 0.018 * sp, -0.085 * sp);
    this.direction.x = -1;
    this.facing = -1;
    this.mesh.rotation.y = Math.PI;
  }

  moveRight() {
    const sp = this.hasPowerup('doubleSize') ? 0.5 : 1;
    this.velocity.x = Math.min(this.velocity.x + 0.018 * sp, 0.085 * sp);
    this.direction.x = 1;
    this.facing = 1;
    this.mesh.rotation.y = 0;
  }

  setJumpHeld(isHeld: boolean) {
    this.jumpHeld = isHeld;
  }

  setShieldHeld(isHeld: boolean) {
    this.shieldActive = isHeld;
  }

  isFlying() {
    return this.flyActive;
  }

  applyKnockback(impulse: THREE.Vector3) {
    this.velocity.add(impulse);
    this.velocity.x = THREE.MathUtils.clamp(this.velocity.x, -0.19, 0.19);
    this.velocity.y = Math.min(this.velocity.y, 0.36);
  }

  setAimDirection(worldTarget: THREE.Vector3) {
    const toTarget = worldTarget.clone().sub(this.mesh.position);
    if (toTarget.lengthSq() < 0.01) {
      return;
    }
    toTarget.normalize();
    this.direction.copy(toTarget);
    if (Math.abs(this.direction.x) > 0.01) {
      this.direction.x = Math.sign(this.direction.x);
    }
    this.direction.y = THREE.MathUtils.clamp(this.direction.y, -0.4, 0.75);
  }

  castSpell(scene: THREE.Scene, target: THREE.Vector3) {
    if (this.spellCooldown > 0) return null;
    this.spellCooldown = 16;
    return new Spell(scene, this.mesh.position, this.direction.clone(), target, this.id);
  }

  castSpells(scene: THREE.Scene, target: THREE.Vector3, homingTargets?: Array<{ position: THREE.Vector3 }>): Spell[] {
    if (this.spellCooldown > 0) return [];
    this.spellCooldown = 16;

    const explosionScale = this.hasPowerup('doubleSize') ? 2 : 1;
    const homing = this.hasPowerup('homingShots');

    if (this.hasPowerup('tripleBlast')) {
      return [-5, 0, 5].map(deg => {
        const rad = (deg * Math.PI) / 180;
        const dir = this.direction.clone();
        const newX = dir.x * Math.cos(rad) - dir.y * Math.sin(rad);
        const newY = dir.x * Math.sin(rad) + dir.y * Math.cos(rad);
        dir.x = newX; dir.y = newY; dir.normalize();
        const s = new Spell(scene, this.mesh.position, dir, target, this.id, explosionScale);
        if (homing && homingTargets) s.homingTargets = homingTargets;
        return s;
      });
    }
    const s = new Spell(scene, this.mesh.position, this.direction.clone(), target, this.id, explosionScale);
    if (homing && homingTargets) s.homingTargets = homingTargets;
    return [s];
  }
}

// Add a new class for moving walls
class MovingWall implements Platform {
  mesh: THREE.Mesh;
  baseY: number;
  amplitude: number;
  frequency: number;
  top: number = 0;
  bottom: number = 0;
  left: number;
  right: number;

  constructor(scene: THREE.Scene, x: number, baseY: number = 2) {
    const geometry = new THREE.BoxGeometry(0.4, 3.3, 0.8);
    const material = new THREE.MeshPhongMaterial({ color: 0x808080 });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.set(x, baseY, 0);
    scene.add(this.mesh);

    this.baseY = baseY;
    this.amplitude = 2;
    this.frequency = 0.5;

    // Set initial bounds
    this.left = x - 0.2;
    this.right = x + 0.2;
    
    // Initial position update
    this.updateBounds(0);
  }

  updateBounds(time: number) {
    const yOffset = Math.sin(time * this.frequency) * this.amplitude;
    this.mesh.position.y = this.baseY + yOffset;
    this.top = this.mesh.position.y + 1.65;
    this.bottom = this.mesh.position.y - 1.65;
  }
}

// ─── Mystery Box ─────────────────────────────────────────────────────────────

const MYSTERY_BOX_VERT = `
  varying vec2 vUv;
  varying vec3 vNormal;
  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const MYSTERY_BOX_FRAG = `
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vNormal;
  vec3 hsl2rgb(float h, float s, float l) {
    float c = (1.0 - abs(2.0*l - 1.0)) * s;
    float x = c * (1.0 - abs(mod(h*6.0, 2.0) - 1.0));
    float m = l - c*0.5;
    vec3 rgb;
    if      (h < 1.0/6.0) rgb = vec3(c,x,0.0);
    else if (h < 2.0/6.0) rgb = vec3(x,c,0.0);
    else if (h < 3.0/6.0) rgb = vec3(0.0,c,x);
    else if (h < 4.0/6.0) rgb = vec3(0.0,x,c);
    else if (h < 5.0/6.0) rgb = vec3(x,0.0,c);
    else                   rgb = vec3(c,0.0,x);
    return rgb + vec3(m);
  }
  float noise(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  void main() {
    vec2 uv = vUv;
    float t = uTime * 0.4;
    float blob1 = sin(uv.x * 3.5 + t * 1.3) * cos(uv.y * 2.8 - t * 0.9);
    float blob2 = sin(uv.y * 4.2 - t * 1.1 + 3.14) * cos(uv.x * 3.1 + t * 0.7);
    float blob3 = sin((uv.x + uv.y) * 3.0 + t * 0.6);
    float lava = (blob1 + blob2 + blob3) * 0.33;
    float h = fract(lava * 0.5 + t * 0.12);
    float s = 0.85;
    float l = 0.45 + lava * 0.12;
    vec3 col = hsl2rgb(h, s, l);
    float rim = 1.0 - max(dot(vNormal, vec3(0.0, 0.0, 1.0)), 0.0);
    col += rim * rim * 0.6;
    gl_FragColor = vec4(col, 0.93);
  }
`;

class MysteryBox {
  group: THREE.Group;
  material: THREE.ShaderMaterial;
  opened: boolean;
  openAge: number;
  scene: THREE.Scene;
  position: THREE.Vector3;

  constructor(scene: THREE.Scene, x: number, y: number) {
    this.scene = scene;
    this.opened = false;
    this.openAge = 0;
    this.position = new THREE.Vector3(x, y, 0);

    this.material = new THREE.ShaderMaterial({
      vertexShader: MYSTERY_BOX_VERT,
      fragmentShader: MYSTERY_BOX_FRAG,
      uniforms: { uTime: { value: 0 } },
      transparent: true,
      side: THREE.DoubleSide
    });

    this.group = new THREE.Group();
    const cube = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), this.material);
    this.group.add(cube);

    // Question mark sprite
    const qCanvas = document.createElement('canvas');
    qCanvas.width = 64; qCanvas.height = 64;
    const ctx2d = qCanvas.getContext('2d')!;
    ctx2d.fillStyle = 'white';
    ctx2d.font = 'bold 48px Arial';
    ctx2d.textAlign = 'center';
    ctx2d.textBaseline = 'middle';
    ctx2d.fillText('?', 32, 34);
    const qTex = new THREE.CanvasTexture(qCanvas);
    const qSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: qTex, transparent: true, opacity: 0.9, depthWrite: false })
    );
    qSprite.scale.setScalar(0.55);
    qSprite.position.z = 0.36;
    this.group.add(qSprite);

    this.group.position.copy(this.position);
    scene.add(this.group);
  }

  update(dt: number) {
    this.material.uniforms.uTime.value += dt;
    this.group.rotation.y += 0.018;
    this.group.rotation.x += 0.009;
    // Bob
    this.group.position.y = this.position.y + Math.sin(this.material.uniforms.uTime.value * 1.4) * 0.15;
  }

  open() {
    if (this.opened) return;
    this.opened = true;
    // Burst: spawn small colored cubes flying outward
    for (let i = 0; i < 12; i++) {
      const geo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color().setHSL(Math.random(), 1, 0.55),
        transparent: true, opacity: 0.9
      });
      const frag = new THREE.Mesh(geo, mat);
      frag.position.copy(this.group.position);
      const angle = (i / 12) * Math.PI * 2;
      const spd = 0.12 + Math.random() * 0.1;
      const vel = new THREE.Vector3(Math.cos(angle) * spd, Math.sin(angle) * spd + 0.1, (Math.random() - 0.5) * 0.08);
      this.scene.add(frag);
      let life = 30;
      const tick = () => {
        if (life-- <= 0) { this.scene.remove(frag); geo.dispose(); mat.dispose(); return; }
        frag.position.add(vel);
        vel.y -= 0.006;
        (frag.material as THREE.MeshBasicMaterial).opacity = life / 30;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
    this.cleanup();
  }

  cleanup() {
    this.scene.remove(this.group);
    this.material.dispose();
  }
}

// ─── Powerup Pickup ───────────────────────────────────────────────────────────

class PowerupPickup {
  mesh: THREE.Mesh;
  glowMesh: THREE.Mesh;
  type: PowerupType;
  position: THREE.Vector3;
  collected: boolean;
  age: number;
  scene: THREE.Scene;
  labelSprite: THREE.Sprite;

  constructor(scene: THREE.Scene, position: THREE.Vector3, type: PowerupType) {
    this.scene = scene;
    this.type = type;
    this.position = position.clone();
    this.collected = false;
    this.age = 0;

    const color = POWERUP_COLORS[type];
    const geo = new THREE.OctahedronGeometry(0.28, 0);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.copy(this.position);
    scene.add(this.mesh);

    const glowGeo = new THREE.SphereGeometry(0.42, 16, 16);
    const glowMat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.18,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    this.glowMesh = new THREE.Mesh(glowGeo, glowMat);
    this.glowMesh.position.copy(this.position);
    scene.add(this.glowMesh);

    // Label
    const lCanvas = document.createElement('canvas');
    lCanvas.width = 256; lCanvas.height = 48;
    const lCtx = lCanvas.getContext('2d')!;
    lCtx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
    lCtx.font = 'bold 22px Arial';
    lCtx.textAlign = 'center';
    lCtx.textBaseline = 'middle';
    lCtx.fillText(POWERUP_LABELS[type], 128, 24);
    const lTex = new THREE.CanvasTexture(lCanvas);
    this.labelSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: lTex, transparent: true, depthWrite: false })
    );
    this.labelSprite.scale.set(2.2, 0.42, 1);
    this.labelSprite.position.copy(this.position).add(new THREE.Vector3(0, 0.65, 0));
    scene.add(this.labelSprite);
  }

  update(dt: number) {
    this.age += dt;
    const bob = Math.sin(this.age * 2.2) * 0.12;
    this.mesh.position.y = this.position.y + bob;
    this.mesh.rotation.y += 0.04;
    this.glowMesh.position.y = this.position.y + bob;
    this.glowMesh.scale.setScalar(1 + Math.sin(this.age * 3.1) * 0.07);
    this.labelSprite.position.y = this.position.y + bob + 0.65;
  }

  collect() {
    if (this.collected) return;
    this.collected = true;
    this.scene.remove(this.mesh);
    this.scene.remove(this.glowMesh);
    this.scene.remove(this.labelSprite);
    (this.mesh.material as THREE.MeshBasicMaterial).dispose();
    (this.glowMesh.material as THREE.MeshBasicMaterial).dispose();
  }
}

const PortalPongGame: React.FC<PortalPongGameProps> = ({ config, onExit }) => {
  const mountRef = React.useRef<HTMLDivElement>(null);
  const resumeFromPauseRef = React.useRef<() => void>(() => {});
  const exitMatchRef = React.useRef<() => void>(() => {});
  const leftJoystickRef = React.useRef<HTMLDivElement>(null);
  const rightJoystickRef = React.useRef<HTMLDivElement>(null);
  const moveStickRef = React.useRef<MobileStickState>({ active: false, x: 0, y: 0, jumpLatch: false });
  const aimStickRef = React.useRef<MobileStickState>({ active: false, x: 0, y: 0, fireQueued: false });
  const shieldTouchRef = React.useRef(false);
  const [matchSeedBump, setMatchSeedBump] = React.useState(0);
  const [chosenBackground, setChosenBackground] = React.useState<Exclude<PortalPongConfig['background'], 'random'> | null>(null);
  const [connectionStatus, setConnectionStatus] = React.useState('Offline AI');
  const [mobileControlsEnabled, setMobileControlsEnabled] = React.useState(false);
  const [moveStickUi, setMoveStickUi] = React.useState({ active: false, x: 0, y: 0 });
  const [aimStickUi, setAimStickUi] = React.useState({ active: false, x: 0, y: 0 });
  const [shieldButtonActive, setShieldButtonActive] = React.useState(false);
  const [pauseMenuOpen, setPauseMenuOpen] = React.useState(false);
  const [resumeCountdown, setResumeCountdown] = React.useState<number | null>(null);
  const [roundCountdownText, setRoundCountdownText] = React.useState<string | null>(null);
  const [goalCelebrationActive, setGoalCelebrationActive] = React.useState(false);
  const [p1PowerupLabel, setP1PowerupLabel] = React.useState('');
  const [p2PowerupLabel, setP2PowerupLabel] = React.useState('');
  const [gameState, setGameState] = React.useState<GameState>({
    player1Score: 0,
    player2Score: 0,
    gameStatus: 'playing',
    winner: null
  });

  const mergedConfig = React.useMemo<PortalPongConfig>(() => ({
    background: config?.background ?? 'random',
    preset: config?.preset ?? 'normal',
    parallax: config?.parallax ?? true,
    seed: (config?.seed ?? 42) + matchSeedBump,
    player1Color: config?.player1Color ?? 'cyan',
    player2Color: config?.player2Color ?? 'lavender',
    aiDifficulty: THREE.MathUtils.clamp(config?.aiDifficulty ?? 3, 1, 10),
    localPlayer: config?.localPlayer ?? 'player1',
    mode: config?.mode ?? 'ai',
    matchmakingRoom: config?.matchmakingRoom ?? ''
  }), [config?.aiDifficulty, config?.background, config?.localPlayer, config?.matchmakingRoom, config?.mode, config?.parallax, config?.player1Color, config?.player2Color, config?.preset, config?.seed, matchSeedBump]);

  React.useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    setMobileControlsEnabled(window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0);
  }, []);

  const updateStickFromPointer = (
    e: React.PointerEvent<HTMLDivElement>,
    padRef: React.RefObject<HTMLDivElement>,
    stickRef: React.MutableRefObject<MobileStickState>,
    setUi: React.Dispatch<React.SetStateAction<{ active: boolean; x: number; y: number }>>
  ) => {
    const pad = padRef.current;
    if (!pad) {
      return;
    }
    const rect = pad.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    let dx = e.clientX - centerX;
    let dy = e.clientY - centerY;
    const maxRadius = Math.min(rect.width, rect.height) * 0.36;
    const magnitude = Math.hypot(dx, dy);
    if (magnitude > maxRadius) {
      const scale = maxRadius / magnitude;
      dx *= scale;
      dy *= scale;
    }
    const normalizedX = THREE.MathUtils.clamp(dx / maxRadius, -1, 1);
    const normalizedY = THREE.MathUtils.clamp(dy / maxRadius, -1, 1);
    stickRef.current.active = true;
    stickRef.current.x = normalizedX;
    stickRef.current.y = normalizedY;
    setUi({ active: true, x: dx, y: dy });
  };

  const resetStick = (
    stickRef: React.MutableRefObject<MobileStickState>,
    setUi: React.Dispatch<React.SetStateAction<{ active: boolean; x: number; y: number }>>,
    queueFire = false
  ) => {
    if (queueFire) {
      const magnitude = Math.hypot(stickRef.current.x, stickRef.current.y);
      if (magnitude > 0.35) {
        stickRef.current.fireQueued = true;
      }
    }
    stickRef.current.active = false;
    stickRef.current.x = 0;
    stickRef.current.y = 0;
    setUi({ active: false, x: 0, y: 0 });
  };

  React.useEffect(() => {
    if (!mountRef.current) return;

    const currentMount = mountRef.current;
    let frameHandle = 0;
    const random = buildRandom(mergedConfig.seed);
    const selectedBackground = resolveBackground(mergedConfig.background, random);
    setChosenBackground(selectedBackground);
    setGameState({
      player1Score: 0,
      player2Score: 0,
      gameStatus: 'playing',
      winner: null
    });
    setPauseMenuOpen(false);
    setResumeCountdown(null);
    setRoundCountdownText('3');
    setGoalCelebrationActive(false);
    
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);

    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
    camera.position.set(0, 5, 10);
    
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    currentMount.appendChild(renderer.domElement);

    const getViewBounds = () => {
      const vFOV = THREE.MathUtils.degToRad(camera.fov);
      const height = 2 * Math.tan(vFOV / 2) * Math.abs(camera.position.z);
      const width = height * camera.aspect;
      return { width, height };
    };

    const sizeRenderer = () => {
      const width = currentMount.clientWidth;
      const height = currentMount.clientHeight;
      camera.aspect = Math.max(width / height, 0.1);
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    sizeRenderer();

    const texture = new THREE.TextureLoader().load(`/${selectedBackground}.png`);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.repeat.set(0.56, 0.66);
    texture.colorSpace = THREE.SRGBColorSpace;

    const setupParallax = (bounds: Bounds): ParallaxLayers => {
      const far = new THREE.Mesh(
        new THREE.PlaneGeometry(bounds.width * 3.1, bounds.height * 2.9),
        new THREE.MeshBasicMaterial({ map: texture, opacity: 0.9, transparent: true })
      );
      far.position.set(0, 3.48, -10.1);
      scene.add(far);

      if (!mergedConfig.parallax) {
        return { far };
      }

      const midTexture = texture.clone();
      midTexture.wrapS = THREE.RepeatWrapping;
      midTexture.wrapT = THREE.ClampToEdgeWrapping;
      midTexture.repeat.set(0.66, 0.74);
      midTexture.colorSpace = THREE.SRGBColorSpace;
      const mid = new THREE.Mesh(
        new THREE.PlaneGeometry(bounds.width * 3.35, bounds.height * 3.0),
        new THREE.MeshBasicMaterial({
          map: midTexture,
          transparent: true,
          opacity: 0.36
        })
      );
      mid.position.set(0, 3.44, -9.5);
      scene.add(mid);

      const nearTexture = texture.clone();
      nearTexture.wrapS = THREE.RepeatWrapping;
      nearTexture.wrapT = THREE.ClampToEdgeWrapping;
      nearTexture.repeat.set(0.76, 0.84);
      nearTexture.colorSpace = THREE.SRGBColorSpace;
      const near = new THREE.Mesh(
        new THREE.PlaneGeometry(bounds.width * 3.6, bounds.height * 3.15),
        new THREE.MeshBasicMaterial({
          map: nearTexture,
          transparent: true,
          opacity: 0.24
        })
      );
      near.position.set(0, 3.4, -8.9);
      scene.add(near);

      const edgeFog = new THREE.Mesh(
        new THREE.PlaneGeometry(bounds.width * 3.0, bounds.height * 2.95),
        new THREE.ShaderMaterial({
          transparent: true,
          uniforms: {
            vignetteStrength: { value: 0.62 }
          },
          vertexShader: `
            varying vec2 vUv;
            void main() {
              vUv = uv;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `,
          fragmentShader: `
            varying vec2 vUv;
            uniform float vignetteStrength;
            void main() {
              float horizontal = smoothstep(0.0, 0.18, vUv.x) * (1.0 - smoothstep(0.82, 1.0, vUv.x));
              float vertical = smoothstep(0.05, 0.32, vUv.y);
              float mask = horizontal * vertical;
              float alpha = (1.0 - mask) * vignetteStrength;
              gl_FragColor = vec4(vec3(0.0), alpha);
            }
          `
        })
      );
      edgeFog.position.set(0, 3.2, -5.2);
      scene.add(edgeFog);

      return { far, mid, near, edgeFog };
    };

    const viewBounds = getViewBounds();
    let gameHeight = viewBounds.height - 1;
    let ballSpawnY = THREE.MathUtils.clamp(gameHeight * 0.62, 3.4, 5.8);
    let worldHalfWidth = THREE.MathUtils.clamp(viewBounds.width * 0.5, 8.2, 13.5);
    let goalCenterX = worldHalfWidth - 1;
    let goalTriggerX = goalCenterX - 0.5;
    const parallaxLayers = setupParallax(viewBounds);

    const playerSpawnX = THREE.MathUtils.clamp(worldHalfWidth - 3.2, 3.8, 7.2);
    const player1Theme = WIZARD_COLORS[mergedConfig.player1Color ?? 'cyan'];
    const player2Theme = WIZARD_COLORS[mergedConfig.player2Color ?? 'lavender'];
    const player1 = new Player(scene, player1Theme.hex, -playerSpawnX, 'player1');
    const player2 = new Player(scene, player2Theme.hex, playerSpawnX, 'player2');
    const localRole = mergedConfig.localPlayer === 'player2' ? 'player2' : 'player1';
    const activePlayer = localRole === 'player2' ? player2 : player1;
    const controlledByAi = localRole === 'player1' ? player2 : player1;
    const ball = new Ball(scene);
    let activeSpells: Spell[] = [];
    let activeMysteryBoxes: MysteryBox[] = [];
    let activePowerupPickups: PowerupPickup[] = [];
    let mysteryBoxNextSpawnAt = Date.now() + 15000; // first spawn 15s in
    let matchEnded = false;
    let pausedForMenu = false;
    let countdownEndAt = 0;
    let lastCountdownValue: number | null = null;
    let goalCelebrationEndAt = 0;
    let pendingRoundCountdownAfterGoal = false;
    let goalCelebrationUiShown = false;
    let roundCountdownEndAt = 0;
    let lastRoundCountdownText = '';
    let remoteLastSeenAt = 0;
    let lastConnectionLabel = '';
    let remoteJumpSeq = 0;
    let remoteCastSeq = 0;
    let aiCastCooldown = 0;
    let aiReactionFrames = 0;
    let networkSendBusy = false;
    let networkPollBusy = false;
    let lastNetworkSendAt = 0;
    let lastNetworkPollAt = 0;
    let player1ScoreLocal = 0;
    let player2ScoreLocal = 0;
    let horizontalWrapSpan = worldHalfWidth * 2;
    let parallaxFocusX = (player1.mesh.position.x + player2.mesh.position.x + ball.mesh.position.x * 2) / 4;
    let parallaxPhaseX = 0;
    let parallaxSmoothX = 0;
    let lastBallY = ball.mesh.position.y;
    let parallaxPhaseY = 0;
    let parallaxSmoothY = 0;

    const generatePlatforms = () => {
      const platforms: Platform[] = [];
      const pairCount = PRESET_TO_PAIRS[mergedConfig.preset] + 2;
      const minY = 1.35;
      const maxY = Math.max(minY + 0.6, Math.min(gameHeight - 1.4, 6.8));
      
      platforms.push(new Platform(scene, 0, randomBetween(random, 2.3, 3.8), randomBetween(random, 1.9, 2.9)));

      for (let i = 0; i < pairCount; i++) {
        const laneT = (i + 1) / (pairCount + 1);
        const maxWidth = THREE.MathUtils.clamp(worldHalfWidth * 0.28, 2.0, 3.4);
        const width = randomBetween(random, 1.6, maxWidth);
        const minX = 2.3 + laneT * 0.35;
        const maxX = Math.max(minX + 0.25, worldHalfWidth - width / 2 - 1.0);
        const x = randomBetween(random, minX, maxX);
        const laneY = minY + laneT * (maxY - minY);
        const y = THREE.MathUtils.clamp(laneY + randomBetween(random, -0.55, 0.65), minY, maxY);
        platforms.push(new Platform(scene, x, y, width));
        platforms.push(new Platform(scene, -x, y, width));
      }

      const extraCenterCount = 1 + Math.floor(random() * 2);
      for (let i = 0; i < extraCenterCount; i += 1) {
        const y = randomBetween(random, 2.4, Math.min(maxY + 0.8, gameHeight - 1.0));
        const width = randomBetween(random, 1.4, 2.1);
        platforms.push(new Platform(scene, randomBetween(random, -1.1, 1.1), y, width));
      }
      return platforms;
    };

    const platforms = generatePlatforms();

    const leftWall = new MovingWall(scene, -worldHalfWidth + 0.5);
    const rightWall = new MovingWall(scene, worldHalfWidth - 0.5);
    
    platforms.push(leftWall);
    platforms.push(rightWall);

    const portalFogTexture = (() => {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const gradient = ctx.createRadialGradient(64, 64, 8, 64, 64, 64);
        gradient.addColorStop(0, 'rgba(255,255,255,0.95)');
        gradient.addColorStop(0.35, 'rgba(255,255,255,0.5)');
        gradient.addColorStop(0.8, 'rgba(255,255,255,0.08)');
        gradient.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 128, 128);
      }
      const textureFromCanvas = new THREE.CanvasTexture(canvas);
      textureFromCanvas.colorSpace = THREE.SRGBColorSpace;
      return textureFromCanvas;
    })();

    const createPortal = (x: number): PortalVisual => {
      const portalColor = x < 0 ? player1Theme.hex : player2Theme.hex;
      const group = new THREE.Group();
      group.position.set(x, 2.5, 0.05);
      group.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2;

      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.74, 0.1, 16, 48),
        new THREE.MeshBasicMaterial({
          color: portalColor,
          transparent: true,
          opacity: 0.7,
          blending: THREE.AdditiveBlending
        })
      );
      ring.scale.set(1, 1.2, 1);
      group.add(ring);

      const rim = new THREE.Mesh(
        new THREE.TorusGeometry(0.78, 0.04, 12, 48),
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.45,
          blending: THREE.AdditiveBlending
        })
      );
      rim.scale.set(1, 1.2, 1);
      group.add(rim);

      const inner = new THREE.Mesh(
        new THREE.RingGeometry(0.35, 0.62, 64, 1),
        new THREE.MeshBasicMaterial({
          color: portalColor,
          transparent: true,
          opacity: 0.28,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide
        })
      );
      inner.rotation.z = randomBetween(random, 0, Math.PI * 2);
      inner.scale.set(1, 1.18, 1);
      group.add(inner);

      const glow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: portalFogTexture,
          color: portalColor,
          transparent: true,
          opacity: 0.35,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        })
      );
      glow.scale.set(1.9, 2.2, 1);
      glow.position.set(0, 0, -0.03);
      group.add(glow);

      const fog = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: portalFogTexture,
          color: 0xffffff,
          transparent: true,
          opacity: 0.15,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        })
      );
      fog.scale.set(2.7, 2.95, 1);
      fog.position.set(0, -0.12, -0.08);
      group.add(fog);

      scene.add(group);
      return {
        group,
        ring,
        rim,
        inner,
        glow,
        fog,
        pulseOffset: random() * Math.PI * 2
      };
    };

    const portals: PortalVisual[] = [createPortal(-goalCenterX), createPortal(goalCenterX)];

    const groundStyle = chooseOne(random, ['rock', 'grass', 'water'] as const);
    const styleSeed = randomBetween(random, -100, 100);
    const styleColors = (
      groundStyle === 'water'
        ? {
            c1: jitterColor(0x1f4a7a, random, 0.1),
            c2: jitterColor(0x3aa6d8, random, 0.12),
            c3: jitterColor(0x7ce5ff, random, 0.1)
          }
        : groundStyle === 'grass'
          ? {
              c1: jitterColor(0x2c6b2f, random, 0.12),
              c2: jitterColor(0x5ba846, random, 0.15),
              c3: jitterColor(0xa9d76c, random, 0.1)
            }
          : {
              c1: jitterColor(0x4e524d, random, 0.1),
              c2: jitterColor(0x777b76, random, 0.12),
              c3: jitterColor(0x9ea59b, random, 0.1)
            }
    );
    const floorUniforms = {
      uTime: { value: 0 },
      uStyle: { value: groundStyle === 'rock' ? 0 : groundStyle === 'grass' ? 1 : 2 },
      uSeed: { value: styleSeed },
      uBumpAmp: { value: groundStyle === 'water' ? 0.2 : 0.32 },
      uBumpFreq: { value: groundStyle === 'water' ? 4.8 : 6.8 },
      uColorA: { value: styleColors.c1 },
      uColorB: { value: styleColors.c2 },
      uColorC: { value: styleColors.c3 }
    };
    const floorMaterial = new THREE.ShaderMaterial({
      uniforms: floorUniforms,
      vertexShader: `
        uniform float uTime;
        uniform float uStyle;
        uniform float uSeed;
        uniform float uBumpAmp;
        uniform float uBumpFreq;
        varying vec2 vUv;
        varying float vHeight;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }

        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          float a = hash(i);
          float b = hash(i + vec2(1.0, 0.0));
          float c = hash(i + vec2(0.0, 1.0));
          float d = hash(i + vec2(1.0, 1.0));
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
        }

        void main() {
          vUv = uv;
          vec3 transformed = position;
          vec2 p = uv * uBumpFreq + vec2(uSeed * 0.1, uSeed * 0.07);
          float n1 = noise(p);
          float n2 = noise(p * 1.9 + 2.3);
          float n3 = noise(p * 3.4 - 4.1);
          float terrain = (n1 * 0.55 + n2 * 0.3 + n3 * 0.15) * 2.0 - 1.0;
          float ripple = sin((uv.x * 11.0 + uTime * 1.6) + uSeed) * 0.4
            + cos((uv.y * 13.0 - uTime * 1.9) - uSeed) * 0.3;
          float waterBlend = step(1.5, uStyle);
          float bump = mix(terrain, ripple, waterBlend) * uBumpAmp;
          transformed.z += bump;
          vHeight = bump;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uStyle;
        uniform vec3 uColorA;
        uniform vec3 uColorB;
        uniform vec3 uColorC;
        varying vec2 vUv;
        varying float vHeight;

        void main() {
          float bands = smoothstep(-0.24, 0.2, vHeight);
          vec3 base = mix(uColorA, uColorB, bands);
          float grain = fract(sin(dot(vUv * 127.0, vec2(12.9898, 78.233))) * 43758.5453);
          base = mix(base, uColorC, smoothstep(0.35, 0.9, grain));

          if (uStyle > 1.5) {
            float shimmer = 0.5 + 0.5 * sin((vUv.x * 30.0 + vUv.y * 18.0) - uTime * 3.2);
            base += vec3(0.05, 0.09, 0.12) * shimmer;
          } else if (uStyle > 0.5) {
            float moss = smoothstep(0.3, 0.8, fract(sin(dot(vUv * 83.0, vec2(5.19, 12.17))) * 9258.0));
            base = mix(base, uColorC, moss * 0.2);
          }

          gl_FragColor = vec4(base, 1.0);
        }
      `
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(26, 11, 200, 80), floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -1, 0);
    scene.add(floor);
    floor.scale.x = (worldHalfWidth / 10) * 1.35;
    floor.scale.y = 1.45;

    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight.position.set(0, 10, 0);
    scene.add(directionalLight);

    const applyResponsiveLayout = () => {
      const bounds = getViewBounds();
      gameHeight = bounds.height - 1;
      ballSpawnY = THREE.MathUtils.clamp(gameHeight * 0.62, 3.4, 5.8);
      worldHalfWidth = THREE.MathUtils.clamp(bounds.width * 0.5, 8.2, 13.5);
      goalCenterX = worldHalfWidth - 1;
      goalTriggerX = goalCenterX - 0.5;
      horizontalWrapSpan = worldHalfWidth * 2;

      floor.scale.x = (worldHalfWidth / 10) * 1.35;
      floor.scale.y = 1.45;

      leftWall.mesh.position.x = -worldHalfWidth + 0.5;
      leftWall.left = leftWall.mesh.position.x - 0.25;
      leftWall.right = leftWall.mesh.position.x + 0.25;
      rightWall.mesh.position.x = worldHalfWidth - 0.5;
      rightWall.left = rightWall.mesh.position.x - 0.25;
      rightWall.right = rightWall.mesh.position.x + 0.25;

      portals[0].group.position.x = -goalCenterX;
      portals[1].group.position.x = goalCenterX;
      player1.mesh.position.x = THREE.MathUtils.clamp(player1.mesh.position.x, -worldHalfWidth + 0.9, worldHalfWidth - 0.9);
      player2.mesh.position.x = THREE.MathUtils.clamp(player2.mesh.position.x, -worldHalfWidth + 0.9, worldHalfWidth - 0.9);
      ball.mesh.position.x = THREE.MathUtils.clamp(ball.mesh.position.x, -worldHalfWidth + ball.radius, worldHalfWidth - ball.radius);
    };
    applyResponsiveLayout();

    const localInput: ControllerFrame = {
      left: false,
      right: false,
      down: false,
      jumpQueued: false,
      jumpHeld: false,
      shieldHeld: false,
      castQueued: false,
      aimX: activePlayer.mesh.position.x + (localRole === 'player1' ? 2 : -2),
      aimY: activePlayer.mesh.position.y + 0.4
    };
    const remoteInput: ControllerFrame = {
      left: false,
      right: false,
      down: false,
      jumpQueued: false,
      jumpHeld: false,
      shieldHeld: false,
      castQueued: false,
      aimX: controlledByAi.mesh.position.x + (localRole === 'player1' ? -2 : 2),
      aimY: controlledByAi.mesh.position.y + 0.4
    };

    const clearLocalInput = () => {
      localInput.left = false;
      localInput.right = false;
      localInput.down = false;
      localInput.jumpHeld = false;
      localInput.shieldHeld = false;
      localInput.jumpQueued = false;
      localInput.castQueued = false;
      shieldTouchRef.current = false;
      setShieldButtonActive(false);
      moveStickRef.current.jumpLatch = false;
      moveStickRef.current.fireQueued = false;
      aimStickRef.current.fireQueued = false;
      resetStick(moveStickRef, setMoveStickUi);
      resetStick(aimStickRef, setAimStickUi);
    };

    const ballMaterial = ball.mesh.material as THREE.MeshBasicMaterial;
    const setBallCenteredCharged = () => {
      ball.mesh.position.set(0, ballSpawnY, 0);
      ball.velocity.set(0, 0, 0);
      ball.mesh.scale.setScalar(1.06);
      ballMaterial.color.setHex(0xdcc9ff);
    };
    const launchBallFromCenterSlow = () => {
      ball.mesh.position.set(0, ballSpawnY, 0);
      const xDirection = random() < 0.5 ? -1 : 1;
      const xSpeed = randomBetween(random, 0.055, 0.08) * xDirection;
      const ySpeed = randomBetween(random, -0.015, 0.045);
      ball.velocity.set(xSpeed, ySpeed, 0);
      ball.mesh.scale.setScalar(1);
      ballMaterial.color.setHex(0xffffff);
    };
    const beginRoundCountdown = () => {
      clearLocalInput();
      setBallCenteredCharged();
      roundCountdownEndAt = performance.now() + 4000;
      lastRoundCountdownText = '3';
      if (goalCelebrationUiShown) {
        goalCelebrationUiShown = false;
        setGoalCelebrationActive(false);
      }
      setRoundCountdownText('3');
    };
    const beginGoalCelebration = () => {
      clearLocalInput();
      setBallCenteredCharged();
      goalCelebrationEndAt = performance.now() + 1250;
      pendingRoundCountdownAfterGoal = true;
      lastRoundCountdownText = 'GOAL!';
      goalCelebrationUiShown = true;
      setGoalCelebrationActive(true);
      setRoundCountdownText('GOAL!');
      // Clear mystery boxes and pickups between rounds
      activeMysteryBoxes.forEach(b => b.cleanup());
      activeMysteryBoxes = [];
      activePowerupPickups.forEach(p => p.collect());
      activePowerupPickups = [];
      mysteryBoxNextSpawnAt = Date.now() + 10000;
    };
    beginRoundCountdown();

    const beginPause = () => {
      if (
        matchEnded ||
        pausedForMenu ||
        performance.now() < countdownEndAt ||
        performance.now() < goalCelebrationEndAt ||
        performance.now() < roundCountdownEndAt
      ) {
        return;
      }
      pausedForMenu = true;
      clearLocalInput();
      setPauseMenuOpen(true);
    };

    const beginResumeCountdown = () => {
      if (matchEnded || !pausedForMenu) {
        return;
      }
      pausedForMenu = false;
      countdownEndAt = performance.now() + 3000;
      lastCountdownValue = 3;
      setPauseMenuOpen(false);
      setResumeCountdown(3);
    };

    resumeFromPauseRef.current = beginResumeCountdown;
    exitMatchRef.current = () => {
      setPauseMenuOpen(false);
      setResumeCountdown(null);
      onExit?.();
    };

    const mouse = new THREE.Vector2();
    const raycaster = new THREE.Raycaster();
    const aimPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const worldAimPoint = new THREE.Vector3();

    const syncAimFromPointer = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const hit = raycaster.ray.intersectPlane(aimPlane, worldAimPoint);
      if (hit) {
        activePlayer.setAimDirection(worldAimPoint);
        localInput.aimX = worldAimPoint.x;
        localInput.aimY = worldAimPoint.y;
      }
      return hit;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (pausedForMenu) {
          beginResumeCountdown();
        } else {
          beginPause();
        }
        return;
      }
      if (
        pausedForMenu ||
        performance.now() < countdownEndAt ||
        performance.now() < goalCelebrationEndAt ||
        performance.now() < roundCountdownEndAt ||
        matchEnded
      ) {
        return;
      }
      switch(e.key) {
        case 'a': localInput.left = true; break;
        case 'd': localInput.right = true; break;
        case 'w':
        case ' ':
          localInput.jumpQueued = true;
          localInput.jumpHeld = true;
          break;
        case 's': localInput.shieldHeld = true; break;
        case 'ArrowDown': localInput.down = true; break;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (
        pausedForMenu ||
        performance.now() < countdownEndAt ||
        performance.now() < goalCelebrationEndAt ||
        performance.now() < roundCountdownEndAt ||
        matchEnded
      ) {
        return;
      }
      switch(e.key) {
        case 'a': localInput.left = false; break;
        case 'd': localInput.right = false; break;
        case 'w':
        case ' ':
          localInput.jumpHeld = false;
          break;
        case 's': localInput.shieldHeld = false; break;
        case 'ArrowDown': localInput.down = false; break;
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (
        pausedForMenu ||
        performance.now() < countdownEndAt ||
        performance.now() < goalCelebrationEndAt ||
        performance.now() < roundCountdownEndAt ||
        matchEnded
      ) {
        return;
      }
      syncAimFromPointer(e);
    };

    const handlePointerDown = (e: PointerEvent) => {
      if (pausedForMenu || performance.now() < countdownEndAt || matchEnded) {
        return;
      }
      syncAimFromPointer(e);
      localInput.castQueued = true;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    renderer.domElement.addEventListener('pointermove', handlePointerMove);
    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    const applyRemoteFrame = (payload: {
      input: Pick<ControllerFrame, 'left' | 'right' | 'down' | 'jumpHeld' | 'shieldHeld' | 'aimX' | 'aimY'>;
      jumpSeq: number;
      castSeq: number;
    }) => {
      remoteLastSeenAt = performance.now();
      remoteInput.left = payload.input.left;
      remoteInput.right = payload.input.right;
      remoteInput.down = payload.input.down;
      remoteInput.jumpHeld = payload.input.jumpHeld;
      remoteInput.shieldHeld = payload.input.shieldHeld;
      remoteInput.aimX = payload.input.aimX;
      remoteInput.aimY = payload.input.aimY;
      if (payload.jumpSeq > remoteJumpSeq) {
        remoteInput.jumpQueued = true;
        remoteJumpSeq = payload.jumpSeq;
      }
      if (payload.castSeq > remoteCastSeq) {
        remoteInput.castQueued = true;
        remoteCastSeq = payload.castSeq;
      }
    };

    const dislodgeBallFromPlayers = (extraKick = 0.04) => {
      const contactRadius = 0.84;
      [player1, player2].forEach((player) => {
        const offset = new THREE.Vector3().subVectors(ball.mesh.position, player.mesh.position);
        const distance = offset.length();
        if (distance >= contactRadius) {
          return;
        }
        const normal = distance > 0.0001
          ? offset.multiplyScalar(1 / distance)
          : new THREE.Vector3(player.id === 'player1' ? 1 : -1, 0.2, 0).normalize();
        const overlap = contactRadius - Math.max(distance, 0.0001);
        ball.mesh.position.addScaledVector(normal, overlap + 0.018);
        ball.velocity.addScaledVector(normal, extraKick);
      });
    };

    const pushBallByExplosion = (spell: Spell) => {
      if (!spell.explosionMesh || spell.ballImpulseApplied) {
        return;
      }
      const effectiveRadius = spell.explosionRadius + 0.35;
      const distance = ball.mesh.position.distanceTo(spell.explosionMesh.position);
      if (distance >= effectiveRadius) {
        return;
      }
      const rawDirection = new THREE.Vector3().subVectors(ball.mesh.position, spell.explosionMesh.position);
      if (rawDirection.lengthSq() < 0.0001) {
        rawDirection.set(spell.owner === 'player1' ? 1 : -1, 0.3, 0);
      } else {
        rawDirection.normalize();
      }
      const centeredness = 1 - (distance / effectiveRadius);
      const impulseStrength = 0.16 + centeredness * 0.26;
      if (centeredness > 0.92) {
        rawDirection.set(spell.owner === 'player1' ? 1 : -1, 0.05, 0);
      }
      // Always give some lift so grounded hits arc away instead of dragging.
      rawDirection.y = Math.max(rawDirection.y, 0.22);
      rawDirection.normalize();
      ball.applyImpulse(rawDirection.multiplyScalar(impulseStrength));
      // Ensure immediate floor release if blast happens while grounded.
      if (ball.mesh.position.y <= ball.radius + 0.01) {
        ball.mesh.position.y = ball.radius + 0.02;
        ball.velocity.y = Math.max(ball.velocity.y, 0.2);
      }
      dislodgeBallFromPlayers(0.08);
      spell.ballImpulseApplied = true;
    };

    const pushPlayerBySpell = (spell: Spell, target: Player, directHit: boolean) => {
      const origin = spell.explosionMesh?.position ?? spell.mesh.position;
      const direction = new THREE.Vector3().subVectors(target.mesh.position, origin);
      if (direction.lengthSq() < 0.0001) {
        direction.set(spell.owner === 'player1' ? 1 : -1, 0.6, 0);
      }
      direction.y = Math.max(direction.y, directHit ? 0.45 : 0.2);
      direction.normalize();

      const shieldFactor = target.shieldActive ? 0.32 : 1;
      const baseStrength = directHit ? 0.22 : 0.075;
      target.applyKnockback(direction.multiplyScalar(baseStrength * shieldFactor));
      spell.nudgedPlayers.add(target.id);
    };

    let localJumpSeq = 0;
    let localCastSeq = 0;

    const applyControllerToPlayer = (player: Player, frame: ControllerFrame) => {
      player.pressingDown = frame.down;
      player.setJumpHeld(frame.jumpHeld);
      player.setShieldHeld(frame.shieldHeld);
      if (frame.left) {
        player.moveLeft();
      }
      if (frame.right) {
        player.moveRight();
      }
      if (frame.jumpQueued) {
        player.queueJump();
        frame.jumpQueued = false;
      }
      player.setAimDirection(new THREE.Vector3(frame.aimX, frame.aimY, 0));
      if (frame.castQueued) {
        if (!player.isFlying()) {
          const target = new THREE.Vector3(frame.aimX, frame.aimY, 0);
          if (player.hasPowerup('teleport')) {
            // Teleport: warp to aim location, no spell
            if (player.spellCooldown <= 0) {
              player.mesh.position.set(frame.aimX, Math.max(frame.aimY, 0.44), 0);
              player.velocity.set(0, 0, 0);
              player.spellCooldown = 22;
            }
          } else {
            const homingTargets = player.hasPowerup('homingShots')
              ? [{ position: ball.mesh.position }, { position: (player.id === 'player1' ? player2 : player1).mesh.position }]
              : undefined;
            const spells = player.castSpells(scene, target, homingTargets);
            spells.forEach(s => activeSpells.push(s));
          }
        }
        frame.castQueued = false;
      }
    };

    const updateAiController = (aiPlayer: Player, frame: ControllerFrame) => {
      const aiDifficulty = mergedConfig.aiDifficulty ?? 3;
      const linearSkill = THREE.MathUtils.clamp((aiDifficulty - 1) / 9, 0, 1);
      // Steep pacing curve: difficulty 5 is ~25% of full-speed behavior, difficulty 10 is full speed.
      const pace = Math.pow(linearSkill, 1.7);
      const lerp = (slow: number, fast: number) => THREE.MathUtils.lerp(slow, fast, pace);

      const reactionMin = Math.round(lerp(70, 16));
      const reactionVariance = Math.round(lerp(50, 12));
      const aimErrorXRange = lerp(4.2, 1.3);
      const aimErrorYRange = lerp(1.7, 0.8);
      const prediction = lerp(0.06, 0.85);
      const lateralNoise = lerp(2.8, 1.4);
      const deadZone = lerp(1.9, 1.1);
      const hesitationChance = lerp(0.7, 0.26);
      const jumpChance = lerp(0.1, 0.45);
      const castChance = lerp(0.02, 0.12);
      const castRange = lerp(2.1, 3.8);
      const lineupRange = lerp(1.4, 2.9);
      const castCooldownMin = Math.round(lerp(260, 140));
      const castCooldownVariance = Math.round(lerp(140, 80));

      frame.jumpHeld = aiPlayer.velocity.y > 0.08 && random() < lerp(0.08, 0.35);
      if (aiReactionFrames > 0) {
        aiReactionFrames -= 1;
      } else {
        const aimErrorX = randomBetween(random, -aimErrorXRange, aimErrorXRange);
        const aimErrorY = randomBetween(random, -aimErrorYRange, aimErrorYRange);
        const targetX = ball.mesh.position.x + ball.velocity.x * prediction + randomBetween(random, -lateralNoise, lateralNoise);
        const deltaX = targetX - aiPlayer.mesh.position.x;
        frame.left = deltaX < -deadZone;
        frame.right = deltaX > deadZone;
        if (random() < hesitationChance) {
          frame.left = false;
          frame.right = false;
        }
        frame.down = false;
      frame.shieldHeld = random() < lerp(0.12, 0.35) && ball.mesh.position.distanceTo(aiPlayer.mesh.position) < lerp(3.4, 4.8);
        frame.aimX = ball.mesh.position.x + aimErrorX;
        frame.aimY = ball.mesh.position.y + 0.1 + aimErrorY;

        const shouldJump = aiPlayer.onGround &&
          ball.mesh.position.y > aiPlayer.mesh.position.y + 0.75 &&
          Math.abs(deltaX) < 2.2 &&
          random() < jumpChance;
        if (shouldJump) {
          frame.jumpQueued = true;
        }

        aiReactionFrames = reactionMin + Math.floor(random() * Math.max(1, reactionVariance));
      }

      if (aiCastCooldown > 0) {
        aiCastCooldown -= 1;
      }
      const castDistance = aiPlayer.mesh.position.distanceTo(ball.mesh.position);
      const hasLineup = Math.abs(ball.mesh.position.x - aiPlayer.mesh.position.x) < lineupRange;
      if (aiCastCooldown === 0 && castDistance < castRange && hasLineup && random() < castChance) {
        frame.castQueued = true;
        aiCastCooldown = castCooldownMin + Math.floor(random() * Math.max(1, castCooldownVariance));
      }
    };

    const animate = () => {
      frameHandle = requestAnimationFrame(animate);
      if (matchEnded) {
        renderer.render(scene, camera);
        return;
      }

      if (pausedForMenu) {
        renderer.render(scene, camera);
        return;
      }

      const remainingCountdownMs = countdownEndAt - performance.now();
      if (remainingCountdownMs > 0) {
        const nextCountdown = Math.ceil(remainingCountdownMs / 1000);
        if (nextCountdown !== lastCountdownValue) {
          lastCountdownValue = nextCountdown;
          setResumeCountdown(nextCountdown);
        }
        renderer.render(scene, camera);
        return;
      }
      if (lastCountdownValue !== null) {
        lastCountdownValue = null;
        setResumeCountdown(null);
      }

      const remainingGoalMs = goalCelebrationEndAt - performance.now();
      if (remainingGoalMs > 0) {
        if (!goalCelebrationUiShown) {
          goalCelebrationUiShown = true;
          setGoalCelebrationActive(true);
        }
        if (lastRoundCountdownText !== 'GOAL!') {
          lastRoundCountdownText = 'GOAL!';
          setRoundCountdownText('GOAL!');
        }
        renderer.render(scene, camera);
        return;
      }
      if (pendingRoundCountdownAfterGoal) {
        pendingRoundCountdownAfterGoal = false;
        beginRoundCountdown();
        renderer.render(scene, camera);
        return;
      }

      const remainingRoundMs = roundCountdownEndAt - performance.now();
      if (remainingRoundMs > 0) {
        const nextRoundText = remainingRoundMs > 3000
          ? '3'
          : remainingRoundMs > 2000
            ? '2'
            : remainingRoundMs > 1000
              ? '1'
              : 'BATTLE!';
        if (nextRoundText !== lastRoundCountdownText) {
          lastRoundCountdownText = nextRoundText;
          setRoundCountdownText(nextRoundText);
        }
        const chargePulse = 1.04 + Math.sin(performance.now() * 0.02) * 0.05;
        ball.mesh.scale.setScalar(chargePulse);
        renderer.render(scene, camera);
        return;
      }
      if (lastRoundCountdownText) {
        lastRoundCountdownText = '';
        setRoundCountdownText(null);
        launchBallFromCenterSlow();
      }

      if (mergedConfig.parallax) {
        // Movement-relative parallax prevents wrap-around snapbacks.
        const focusX = (activePlayer.mesh.position.x * 0.22) + (controlledByAi.mesh.position.x * 0.18) + (ball.mesh.position.x * 0.6);
        const deltaFocusX = shortestWrappedDelta(focusX, parallaxFocusX, horizontalWrapSpan);
        parallaxFocusX = focusX;
        parallaxPhaseX += deltaFocusX;
        parallaxSmoothX = THREE.MathUtils.lerp(parallaxSmoothX, parallaxPhaseX, 0.12);

        const deltaBallY = ball.mesh.position.y - lastBallY;
        lastBallY = ball.mesh.position.y;
        parallaxPhaseY += deltaBallY;
        parallaxSmoothY = THREE.MathUtils.lerp(parallaxSmoothY, parallaxPhaseY, 0.08);

        parallaxLayers.far.material.map!.offset.x = parallaxSmoothX * 0.0044;
        parallaxLayers.far.material.map!.offset.y = parallaxSmoothY * 0.0012;
        if (parallaxLayers.mid?.material.map) {
          parallaxLayers.mid.material.map.offset.x = parallaxSmoothX * 0.0054;
          parallaxLayers.mid.material.map.offset.y = parallaxSmoothY * 0.0015;
        }
        if (parallaxLayers.near?.material.map) {
          parallaxLayers.near.material.map.offset.x = parallaxSmoothX * 0.0062;
          parallaxLayers.near.material.map.offset.y = parallaxSmoothY * 0.0018;
        }
        if (parallaxLayers.edgeFog) {
          parallaxLayers.edgeFog.position.x = parallaxSmoothX * 0.01;
        }
      }

      const time = performance.now() * 0.001;
      floorMaterial.uniforms.uTime.value = time;
      leftWall.updateBounds(time);
      rightWall.updateBounds(time + Math.PI);

      portals.forEach((portal, idx) => {
        const pulse = 0.5 + 0.5 * Math.sin(time * 3.2 + portal.pulseOffset);
        const slowPulse = 0.5 + 0.5 * Math.sin(time * 1.35 + portal.pulseOffset + idx);
        portal.ring.rotation.z += 0.006;
        portal.rim.rotation.z -= 0.01;
        portal.inner.rotation.z += 0.014;
        portal.inner.material.opacity = 0.14 + pulse * 0.24;
        portal.glow.material.opacity = 0.2 + pulse * 0.22;
        portal.fog.material.opacity = 0.06 + slowPulse * 0.12;
        portal.glow.scale.set(1.85 + pulse * 0.3, 2.2 + pulse * 0.35, 1);
        portal.fog.scale.set(2.5 + slowPulse * 0.28, 2.85 + slowPulse * 0.34, 1);
      });

      if (mobileControlsEnabled) {
        const moveStick = moveStickRef.current;
        const aimStick = aimStickRef.current;
        localInput.left = moveStick.x < -0.12;
        localInput.right = moveStick.x > 0.12;
        localInput.down = moveStick.y > 0.5;

        const jumpIntent = moveStick.active && moveStick.y < -0.55;
        if (jumpIntent && !moveStick.jumpLatch) {
          localInput.jumpQueued = true;
          moveStick.jumpLatch = true;
        } else if (!jumpIntent) {
          moveStick.jumpLatch = false;
        }
        localInput.jumpHeld = jumpIntent;
        localInput.shieldHeld = shieldTouchRef.current;

        if (aimStick.active) {
          localInput.aimX = activePlayer.mesh.position.x + aimStick.x * 4.8;
          localInput.aimY = activePlayer.mesh.position.y + aimStick.y * 3.2;
        }
        if (aimStick.fireQueued) {
          localInput.castQueued = true;
          aimStick.fireQueued = false;
        }
      }

      if (localInput.jumpQueued) {
        localJumpSeq += 1;
      }
      if (localInput.castQueued) {
        localCastSeq += 1;
      }

      applyControllerToPlayer(activePlayer, localInput);

      const nowMs = performance.now();
      const remoteConnected = mergedConfig.mode === 'matchmaking' && nowMs - remoteLastSeenAt < REMOTE_STALE_MS;
      if (mergedConfig.mode === 'matchmaking') {
        const roomCode = (mergedConfig.matchmakingRoom ?? '').trim().toUpperCase();
        const shouldSend = roomCode && nowMs - lastNetworkSendAt > 70 && !networkSendBusy;
        const shouldPoll = roomCode && nowMs - lastNetworkPollAt > 120 && !networkPollBusy;

        if (shouldSend) {
          networkSendBusy = true;
          lastNetworkSendAt = nowMs;
          const payload = {
            room: roomCode,
            player: localRole,
            input: {
              left: localInput.left,
              right: localInput.right,
              down: localInput.down,
              jumpHeld: localInput.jumpHeld,
              shieldHeld: localInput.shieldHeld,
              aimX: localInput.aimX,
              aimY: localInput.aimY
            },
            jumpSeq: localJumpSeq,
            castSeq: localCastSeq,
            sentAt: Date.now()
          };
          fetch('/api/match/control', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          }).catch(() => {
            // Swallow network hiccups; AI fallback handles gaps.
          }).finally(() => {
            networkSendBusy = false;
          });
        }

        if (shouldPoll) {
          networkPollBusy = true;
          lastNetworkPollAt = nowMs;
          fetch(`/api/match/state?room=${encodeURIComponent(roomCode)}`)
            .then((response) => response.ok ? response.json() : null)
            .then((payload: {
              player1: null | { input: ControllerFrame; jumpSeq: number; castSeq: number };
              player2: null | { input: ControllerFrame; jumpSeq: number; castSeq: number };
            } | null) => {
              if (!payload) {
                return;
              }
              const remoteRole = localRole === 'player1' ? 'player2' : 'player1';
              const remotePayload = remoteRole === 'player1' ? payload.player1 : payload.player2;
              if (remotePayload) {
                applyRemoteFrame({
                  input: {
                    left: Boolean(remotePayload.input.left),
                    right: Boolean(remotePayload.input.right),
                    down: Boolean(remotePayload.input.down),
                    jumpHeld: Boolean(remotePayload.input.jumpHeld),
                    shieldHeld: Boolean(remotePayload.input.shieldHeld),
                    aimX: Number(remotePayload.input.aimX) || 0,
                    aimY: Number(remotePayload.input.aimY) || 0
                  },
                  jumpSeq: Number(remotePayload.jumpSeq) || 0,
                  castSeq: Number(remotePayload.castSeq) || 0
                });
              }
            })
            .catch(() => {
              // Keep running locally with AI fallback on network failures.
            })
            .finally(() => {
              networkPollBusy = false;
            });
        }
      }

      if (mergedConfig.mode === 'matchmaking' && remoteConnected) {
        applyControllerToPlayer(controlledByAi, remoteInput);
      } else {
        updateAiController(controlledByAi, remoteInput);
        applyControllerToPlayer(controlledByAi, remoteInput);
      }

      const nextStatus = mergedConfig.mode === 'matchmaking'
        ? (remoteConnected ? `Online Match ${mergedConfig.matchmakingRoom || ''}` : `Waiting In ${mergedConfig.matchmakingRoom || ''} + AI`)
        : 'Offline AI';
      if (nextStatus !== lastConnectionLabel) {
        lastConnectionLabel = nextStatus;
        setConnectionStatus(nextStatus);
      }

      player1.update(platforms, worldHalfWidth);
      player2.update(platforms, worldHalfWidth);
      ball.update(gameHeight, worldHalfWidth, platforms);

      activeSpells = activeSpells.filter((spell) => !spell.update(platforms, ball, worldHalfWidth));

      // Spells can directly hit players and cause strong knockback.
      activeSpells.forEach((spell) => {
        if (spell.exploded) {
          return;
        }
        [player1, player2].forEach((target) => {
          if (target.id === spell.owner) {
            return;
          }
          const toTarget = target.mesh.position.distanceTo(spell.mesh.position);
          const shieldRadius = target.shieldActive ? 0.8 : 0;
          if (target.shieldActive && toTarget <= shieldRadius) {
            spell.explode();
            pushPlayerBySpell(spell, target, false);
            return;
          }
          if (toTarget <= 0.52) {
            spell.explode();
            pushPlayerBySpell(spell, target, true);
          }
        });
      });

      [player1, player2].forEach((player) => {
        const contactRadius = 0.84;
        const playerSupportRadius = 0.44;
        const offset = new THREE.Vector3().subVectors(ball.mesh.position, player.mesh.position);
        const distance = offset.length();
        if (distance >= contactRadius) {
          return;
        }

        const normal = distance > 0.0001
          ? offset.multiplyScalar(1 / distance)
          : new THREE.Vector3(player.id === 'player1' ? 1 : -1, 0.2, 0).normalize();
        const overlap = contactRadius - Math.max(distance, 0.0001);

        // Always separate penetration first to avoid jitter loops.
        ball.mesh.position.addScaledVector(normal, overlap + 0.012);

        const playerIsAboveBall = player.mesh.position.y > ball.mesh.position.y + 0.2;
        const playerFallingOntoBall = player.velocity.y <= 0.03;
        if (playerIsAboveBall && playerFallingOntoBall) {
          // Allow controlled "stand/jump on ball" behavior without interpenetration.
          const desiredY = ball.mesh.position.y + ball.radius + playerSupportRadius;
          if (player.mesh.position.y < desiredY + 0.12) {
            player.mesh.position.y = desiredY;
            player.velocity.y = Math.max(player.velocity.y, 0);
            player.onGround = true;
          }
          ball.velocity.x += player.velocity.x * 0.42;
          ball.velocity.y = Math.min(ball.velocity.y, -0.045);
        } else {
          ball.bounce(normal, 1.03);
          ball.velocity.addScaledVector(normal, ball.velocity.length() < 0.08 ? 0.06 : 0.02);
        }
      });

      activeSpells.forEach((spell) => pushBallByExplosion(spell));
      activeSpells.forEach((spell) => {
        if (!spell.explosionMesh) {
          return;
        }
        [player1, player2].forEach((target) => {
          if (target.id === spell.owner || spell.nudgedPlayers.has(target.id)) {
            return;
          }
          const distance = target.mesh.position.distanceTo(spell.explosionMesh!.position);
          if (distance < spell.explosionRadius) {
            pushPlayerBySpell(spell, target, false);
          }
        });
      });

      // ── Mystery box spawn ──────────────────────────────────────────────────
      const now = Date.now();
      if (!matchEnded && !pausedForMenu && activeMysteryBoxes.length === 0 && activePowerupPickups.length === 0 && now >= mysteryBoxNextSpawnAt) {
        const bx = (Math.random() - 0.5) * (worldHalfWidth * 1.1);
        const by = 1.8 + Math.random() * 3.2;
        activeMysteryBoxes.push(new MysteryBox(scene, bx, by));
        mysteryBoxNextSpawnAt = now + (20000 + Math.random() * 20000);
      }

      // ── Mystery box update + blast/player open ─────────────────────────────
      activeMysteryBoxes = activeMysteryBoxes.filter(box => {
        if (box.opened) return false;
        box.update(1 / 60);

        // Check explosion hits
        let hit = false;
        for (const spell of activeSpells) {
          if (spell.exploded && spell.explosionMesh) {
            const d = spell.explosionMesh.position.distanceTo(box.group.position);
            if (d < spell.explosionRadius + 0.5) { hit = true; break; }
          }
          if (!spell.exploded) {
            const d = spell.mesh.position.distanceTo(box.group.position);
            if (d < 0.6) { hit = true; break; }
          }
        }
        // Check player melee hit
        for (const p of [player1, player2]) {
          if (p.mesh.position.distanceTo(box.group.position) < 0.8) { hit = true; break; }
        }

        if (hit) {
          const boxPos = box.group.position.clone();
          box.open();
          const randomType = ALL_POWERUPS[Math.floor(Math.random() * ALL_POWERUPS.length)];
          activePowerupPickups.push(new PowerupPickup(scene, boxPos, randomType));
          return false;
        }
        return true;
      });

      // ── Powerup pickup update + collection ────────────────────────────────
      activePowerupPickups = activePowerupPickups.filter(pickup => {
        if (pickup.collected) return false;
        pickup.update(1 / 60);
        for (const p of [player1, player2]) {
          if (p.mesh.position.distanceTo(pickup.mesh.position) < 0.62) {
            pickup.collect();
            p.grantPowerup(pickup.type);
            // Teleport powerup changes castSpell behavior, handled in controller
            return false;
          }
        }
        // auto-expire after 20s
        if (pickup.age > 20 * 60) { pickup.collect(); return false; }
        return true;
      });

      const ballX = ball.mesh.position.x;
      const ballY = ball.mesh.position.y;
      
      if (ballX < -goalTriggerX && ballY > 1.45 && ballY < 3.45) {
        player2ScoreLocal += 1;
        if (player2ScoreLocal >= WIN_SCORE) {
          matchEnded = true;
          setRoundCountdownText(null);
          setGoalCelebrationActive(false);
          setGameState((prev) => ({ ...prev, player2Score: player2ScoreLocal, gameStatus: 'ended', winner: 'blue' }));
        } else {
          setGameState((prev) => ({ ...prev, player2Score: player2ScoreLocal }));
          beginGoalCelebration();
        }
        return;
      }
      
      if (ballX > goalTriggerX && ballY > 1.45 && ballY < 3.45) {
        player1ScoreLocal += 1;
        if (player1ScoreLocal >= WIN_SCORE) {
          matchEnded = true;
          setRoundCountdownText(null);
          setGoalCelebrationActive(false);
          setGameState((prev) => ({ ...prev, player1Score: player1ScoreLocal, gameStatus: 'ended', winner: 'red' }));
        } else {
          setGameState((prev) => ({ ...prev, player1Score: player1ScoreLocal }));
          beginGoalCelebration();
        }
        return;
      }

      // Update powerup HUD labels every 30 frames
      if (Math.round(performance.now() / 16) % 30 === 0) {
        setP1PowerupLabel(player1.activePowerupLabel);
        setP2PowerupLabel(player2.activePowerupLabel);
      }

      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      sizeRenderer();
      applyResponsiveLayout();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(frameHandle);
      activeSpells.forEach((spell) => spell.cleanup());
      activeMysteryBoxes.forEach(b => b.cleanup());
      activePowerupPickups.forEach(p => p.collect());
      currentMount?.removeChild(renderer.domElement);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('pointermove', handlePointerMove);
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      portals.forEach((portal) => {
        scene.remove(portal.group);
        portal.ring.geometry.dispose();
        portal.ring.material.dispose();
        portal.rim.geometry.dispose();
        portal.rim.material.dispose();
        portal.inner.geometry.dispose();
        portal.inner.material.dispose();
        portal.glow.material.dispose();
        portal.fog.material.dispose();
      });
      floor.geometry.dispose();
      floor.material.dispose();
      portalFogTexture.dispose();
      texture.dispose();
      parallaxLayers.far.material.dispose();
      parallaxLayers.far.geometry.dispose();
      if (parallaxLayers.mid) {
        parallaxLayers.mid.material.map?.dispose();
        parallaxLayers.mid.material.dispose();
        parallaxLayers.mid.geometry.dispose();
      }
      if (parallaxLayers.near) {
        parallaxLayers.near.material.map?.dispose();
        parallaxLayers.near.material.dispose();
        parallaxLayers.near.geometry.dispose();
      }
      if (parallaxLayers.edgeFog) {
        parallaxLayers.edgeFog.material.dispose();
        parallaxLayers.edgeFog.geometry.dispose();
      }
      renderer.dispose();
    };
  }, [mergedConfig, onExit, mobileControlsEnabled]);

  const leftTeamColor = WIZARD_COLORS[mergedConfig.player1Color ?? 'cyan'];
  const rightTeamColor = WIZARD_COLORS[mergedConfig.player2Color ?? 'lavender'];

  return (
    <div className="w-full h-screen touch-none">
      <div ref={mountRef} className="w-full h-full touch-none" />
      <div className="absolute top-3 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 pointer-events-none">
        <div className="bg-slate-950/30 backdrop-blur-sm text-white px-4 py-2 rounded-md border border-white/20 shadow-[0_0_16px_rgba(15,23,42,0.3)]">
          <div className="flex items-center gap-3 text-3xl font-black leading-none">
            <span style={{ color: hexToCss(leftTeamColor.hex), textShadow: `0 0 10px ${hexToCss(leftTeamColor.hex)}AA` }}>{gameState.player1Score}</span>
            <span className="text-slate-300/80 text-lg">-</span>
            <span style={{ color: hexToCss(rightTeamColor.hex), textShadow: `0 0 10px ${hexToCss(rightTeamColor.hex)}AA` }}>{gameState.player2Score}</span>
          </div>
        </div>
        {(p1PowerupLabel || p2PowerupLabel) && (
          <div className="flex gap-2 text-[11px] font-bold tracking-wide">
            {p1PowerupLabel && (
              <span className="px-2 py-0.5 rounded-full bg-slate-950/50 backdrop-blur-sm border border-white/20"
                style={{ color: hexToCss(leftTeamColor.hex), textShadow: `0 0 8px ${hexToCss(leftTeamColor.hex)}` }}>
                {p1PowerupLabel}
              </span>
            )}
            {p2PowerupLabel && (
              <span className="px-2 py-0.5 rounded-full bg-slate-950/50 backdrop-blur-sm border border-white/20"
                style={{ color: hexToCss(rightTeamColor.hex), textShadow: `0 0 8px ${hexToCss(rightTeamColor.hex)}` }}>
                {p2PowerupLabel}
              </span>
            )}
          </div>
        )}
      </div>
      {mobileControlsEnabled && gameState.gameStatus !== 'ended' && !pauseMenuOpen && resumeCountdown === null && roundCountdownText === null ? (
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute left-5 bottom-6 pointer-events-auto">
            <div className="text-[10px] text-white/70 uppercase tracking-wide mb-2">Move</div>
            <div
              ref={leftJoystickRef}
              className="relative h-28 w-28 rounded-full border border-white/30 bg-slate-900/35 backdrop-blur-sm"
              style={{ touchAction: 'none' }}
              onPointerDown={(e) => {
                e.preventDefault();
                updateStickFromPointer(e, leftJoystickRef, moveStickRef, setMoveStickUi);
              }}
              onPointerMove={(e) => {
                e.preventDefault();
                if (!moveStickRef.current.active) {
                  return;
                }
                updateStickFromPointer(e, leftJoystickRef, moveStickRef, setMoveStickUi);
              }}
              onPointerUp={(e) => {
                e.preventDefault();
                resetStick(moveStickRef, setMoveStickUi);
              }}
              onPointerCancel={(e) => {
                e.preventDefault();
                resetStick(moveStickRef, setMoveStickUi);
              }}
            >
              <div
                className="absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-100/60 bg-cyan-200/25 backdrop-blur-sm"
                style={{ transform: `translate(calc(-50% + ${moveStickUi.x}px), calc(-50% + ${moveStickUi.y}px))` }}
              />
            </div>
          </div>
          <div className="absolute right-5 bottom-6 pointer-events-auto">
            <div className="text-[10px] text-white/70 uppercase tracking-wide mb-2 text-right">Aim / Cast</div>
            <div
              ref={rightJoystickRef}
              className="relative h-28 w-28 rounded-full border border-white/30 bg-slate-900/35 backdrop-blur-sm"
              style={{ touchAction: 'none' }}
              onPointerDown={(e) => {
                e.preventDefault();
                updateStickFromPointer(e, rightJoystickRef, aimStickRef, setAimStickUi);
              }}
              onPointerMove={(e) => {
                e.preventDefault();
                if (!aimStickRef.current.active) {
                  return;
                }
                updateStickFromPointer(e, rightJoystickRef, aimStickRef, setAimStickUi);
              }}
              onPointerUp={(e) => {
                e.preventDefault();
                resetStick(aimStickRef, setAimStickUi, true);
              }}
              onPointerCancel={(e) => {
                e.preventDefault();
                resetStick(aimStickRef, setAimStickUi);
              }}
            >
              <div
                className="absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full border border-yellow-100/60 bg-yellow-200/25 backdrop-blur-sm"
                style={{ transform: `translate(calc(-50% + ${aimStickUi.x}px), calc(-50% + ${aimStickUi.y}px))` }}
              />
            </div>
          </div>
          <div className="absolute right-[9.3rem] bottom-10 pointer-events-auto">
            <button
              type="button"
              className={`h-14 w-14 rounded-full border text-[10px] uppercase tracking-wide ${
                shieldButtonActive
                  ? 'border-cyan-100/80 bg-cyan-300/35 text-cyan-50'
                  : 'border-cyan-100/45 bg-cyan-300/15 text-cyan-100'
              } backdrop-blur-sm`}
              style={{ touchAction: 'none' }}
              onPointerDown={(e) => {
                e.preventDefault();
                shieldTouchRef.current = true;
                setShieldButtonActive(true);
              }}
              onPointerUp={(e) => {
                e.preventDefault();
                shieldTouchRef.current = false;
                setShieldButtonActive(false);
              }}
              onPointerCancel={(e) => {
                e.preventDefault();
                shieldTouchRef.current = false;
                setShieldButtonActive(false);
              }}
              onPointerLeave={() => {
                shieldTouchRef.current = false;
                setShieldButtonActive(false);
              }}
            >
              Shield
            </button>
          </div>
        </div>
      ) : null}
      {pauseMenuOpen ? (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/45 backdrop-blur-sm">
          <div className="w-[min(92vw,30rem)] border border-cyan-100/35 bg-slate-900/35 backdrop-blur-md p-6 text-center text-white shadow-[0_0_30px_rgba(34,211,238,0.2)]">
            <div className="mb-4 text-3xl font-bold uppercase tracking-widest text-cyan-100 drop-shadow-[0_0_10px_rgba(165,243,252,0.5)]">Paused</div>
            <div className="mb-6 text-xs uppercase tracking-wide text-slate-300">
              Press ESC to resume with countdown
            </div>
            <div className="mb-6 border border-white/20 bg-slate-950/35 px-4 py-3 text-left text-xs text-slate-200">
              <div className="font-semibold text-slate-100 mb-2">Match Info</div>
              <div>Win Score: {WIN_SCORE}</div>
              <div>Background: {chosenBackground ?? 'loading'}</div>
              <div>Mode: {mergedConfig.mode === 'matchmaking' ? 'Matchmaking' : 'Vs AI'}</div>
              {mergedConfig.mode !== 'matchmaking' ? (
                <div>AI Difficulty: {mergedConfig.aiDifficulty ?? 3}</div>
              ) : null}
              <div>Local Side: {mergedConfig.localPlayer ?? 'player1'}</div>
              <div>Status: {connectionStatus}</div>
            </div>
            <div className="flex flex-col gap-3">
              <button
                type="button"
                className="border border-yellow-100/45 bg-yellow-200/10 backdrop-blur-sm px-4 py-2 text-sm uppercase tracking-wide text-yellow-100 hover:bg-yellow-200/20"
                onClick={() => resumeFromPauseRef.current()}
              >
                Resume Match
              </button>
              {onExit ? (
                <button
                  type="button"
                  className="border border-rose-100/45 bg-rose-200/10 backdrop-blur-sm px-4 py-2 text-sm uppercase tracking-wide text-rose-100 hover:bg-rose-200/20"
                  onClick={() => exitMatchRef.current()}
                >
                  Exit To Menu
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
      {resumeCountdown !== null ? (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/35 backdrop-blur-[2px] pointer-events-none">
          <div className="text-7xl font-extrabold text-yellow-300 drop-shadow-[0_0_12px_rgba(253,224,71,0.7)]">
            {resumeCountdown}
          </div>
        </div>
      ) : null}
      {roundCountdownText !== null && gameState.gameStatus !== 'ended' ? (
        <div
          className={`absolute inset-0 flex items-center justify-center pointer-events-none ${
            goalCelebrationActive
              ? 'bg-amber-950/35 backdrop-blur-[2px]'
              : 'bg-slate-950/28 backdrop-blur-[1px]'
          }`}
        >
          <div className="text-center">
            <div
              className={`font-extrabold ${
                goalCelebrationActive
                  ? 'text-8xl text-amber-200 drop-shadow-[0_0_18px_rgba(251,191,36,0.9)]'
                  : 'text-7xl text-violet-200 drop-shadow-[0_0_14px_rgba(196,181,253,0.85)]'
              }`}
            >
              {roundCountdownText}
            </div>
          </div>
        </div>
      ) : null}
      {gameState.gameStatus === 'ended' ? (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/45 backdrop-blur-sm">
          <div className="rounded-lg border border-white/25 bg-slate-900/40 backdrop-blur-md px-6 py-5 text-center text-white shadow-[0_0_20px_rgba(15,23,42,0.4)]">
            <div className="text-2xl font-semibold mb-2">
              {gameState.winner === 'red' ? 'Left Team Wins' : 'Right Team Wins'}
            </div>
            <button
              type="button"
              className="rounded-md bg-yellow-400 px-4 py-2 text-black font-semibold"
              onClick={() => setMatchSeedBump((prev) => prev + 1)}
            >
              Play Next Match
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default PortalPongGame;