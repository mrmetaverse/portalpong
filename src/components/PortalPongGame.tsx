import React from 'react';
import * as THREE from 'three';

interface GameState {
  player1Score: number;
  player2Score: number;
  gameStatus: 'playing' | 'ended';
  winner: 'red' | 'blue' | null;
}

export type PortalPongConfigPreset = 'light' | 'normal' | 'chaos';

export interface PortalPongConfig {
  background: 'random' | 'bg1' | 'bg2' | 'bg3' | 'bg4' | 'bg5' | 'bg6' | 'bg7';
  preset: PortalPongConfigPreset;
  parallax: boolean;
  seed: number;
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

interface ControllerFrame {
  left: boolean;
  right: boolean;
  down: boolean;
  jumpQueued: boolean;
  jumpHeld: boolean;
  castQueued: boolean;
  aimX: number;
  aimY: number;
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
    const geometry = new THREE.BoxGeometry(width, 0.2, 1);
    const material = new THREE.MeshPhongMaterial({ color: 0x95a5a6 });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.set(x, y, 0);
    scene.add(this.mesh);

    this.top = y + 0.1;
    this.bottom = y - 0.1;
    this.left = x - width/2;
    this.right = x + width/2;
  }
}

class Spell {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  lifetime: number;
  exploded: boolean;
  explosionRadius: number;
  explosionMesh?: THREE.Mesh;
  explosionFramesLeft: number;
  owner: 'player1' | 'player2';
  ballImpulseApplied: boolean;
  scene: THREE.Scene;

  constructor(scene: THREE.Scene, position: THREE.Vector3, direction: THREE.Vector3, owner: 'player1' | 'player2') {
    const geometry = new THREE.SphereGeometry(0.1);
    const material = new THREE.MeshBasicMaterial({ 
      color: owner === 'player1' ? 0xff6b6b : 0x5dade2,
      transparent: true,
      opacity: 0.9
    });
    this.mesh = new THREE.Mesh(geometry, material);
    
    const normalizedDirection = direction.clone().normalize();
    const spawnOffset = normalizedDirection.clone().multiplyScalar(0.7);
    spawnOffset.y += 0.35;
    this.mesh.position.copy(position).add(spawnOffset);
    
    this.velocity = normalizedDirection.multiplyScalar(0.34).add(new THREE.Vector3(0, 0.08, 0));
    
    this.lifetime = 45;
    this.exploded = false;
    this.explosionRadius = 1.4;
    this.explosionFramesLeft = 8;
    this.owner = owner;
    this.ballImpulseApplied = false;
    this.scene = scene;
    scene.add(this.mesh);
  }

  update(platforms: Platform[], ball: Ball) {
    if (this.exploded) {
      this.explosionFramesLeft -= 1;
      if (this.explosionMesh) {
        this.explosionMesh.scale.addScalar(0.12);
        const material = this.explosionMesh.material as THREE.MeshBasicMaterial;
        material.opacity = Math.max(0, this.explosionFramesLeft / 8);
      }
      if (this.explosionFramesLeft <= 0) {
        this.cleanup();
        return true;
      }
      return false;
    }
    
    this.lifetime--;
    if (this.lifetime <= 0) {
      this.explode();
      return false;
    }
    
    this.velocity.y -= 0.004;
    this.mesh.position.add(this.velocity);

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

    if (touchingPlatform || this.mesh.position.x > 10.5 || this.mesh.position.x < -10.5) {
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
    const explosionMat = new THREE.MeshBasicMaterial({
      color: 0xff8800,
      transparent: true,
      opacity: 0.35
    });
    this.explosionMesh = new THREE.Mesh(explosionGeo, explosionMat);
    this.explosionMesh.position.copy(this.mesh.position);
    this.scene.add(this.explosionMesh);
  }

  cleanup() {
    this.scene.remove(this.mesh);
    if (this.explosionMesh) {
      this.scene.remove(this.explosionMesh);
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
      (Math.random() - 0.5) * 0.2,
      (Math.random() - 0.5) * 0.2,
      0
    );
    this.mesh.position.set(0, 2, 0);
    scene.add(this.mesh);
  }

  update(gameHeight: number, platforms: Platform[]) {
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
    if (this.mesh.position.x > 10) this.mesh.position.x = -10;
    if (this.mesh.position.x < -10) this.mesh.position.x = 10;

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
    if (speed > 0.38) {
      this.velocity.multiplyScalar(0.38 / speed);
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
    this.mesh.position.set(0, 2, 0);
    this.velocity.set(
      (Math.random() - 0.5) * 0.2,
      (Math.random() - 0.5) * 0.2,
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

  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.38, 18, 18),
    new THREE.MeshPhongMaterial({ color, shininess: 70 })
  );
  body.position.y = 0.37;
  group.add(body);

  const robe = new THREE.Mesh(
    new THREE.ConeGeometry(0.34, 0.56, 18),
    new THREE.MeshPhongMaterial({ color: color === 0xff0000 ? 0x6e1b1b : 0x1e3a8a })
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
  id: 'player1' | 'player2';
  jumpBufferFrames: number;
  coyoteFrames: number;
  jumpsUsed: number;
  jumpHeld: boolean;
  holdJumpFrames: number;
  holdFramesAppliedThisJump: number;
  firstJumpWasLong: boolean;
  facing: 1 | -1;
  wobbleTime: number;

  constructor(scene: THREE.Scene, color: number, startX: number, id: 'player1' | 'player2') {
    this.rig = createWizardAvatar(color, startX < 0);
    this.mesh = this.rig.root;
    this.mesh.position.set(startX, 0.52, 0);
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.onGround = true;
    this.direction = new THREE.Vector3(1, 0, 0);
    this.pressingDown = false;
    this.spellCooldown = 0;
    this.id = id;
    this.jumpBufferFrames = 0;
    this.coyoteFrames = 0;
    this.jumpsUsed = 0;
    this.jumpHeld = false;
    this.holdJumpFrames = 0;
    this.holdFramesAppliedThisJump = 0;
    this.firstJumpWasLong = false;
    this.facing = startX < 0 ? 1 : -1;
    this.wobbleTime = Math.random() * Math.PI * 2;
    this.mesh.rotation.y = this.facing === 1 ? 0 : Math.PI;
    scene.add(this.mesh);
  }

  update(platforms: Platform[]) {
    const playerRadius = 0.52;
    const prevPosition = this.mesh.position.clone();

    if (this.spellCooldown > 0) {
      this.spellCooldown -= 1;
    }
    if (this.jumpBufferFrames > 0) {
      this.jumpBufferFrames -= 1;
    }
    if (this.onGround) {
      this.coyoteFrames = 7;
      this.jumpsUsed = 0;
      this.firstJumpWasLong = false;
    } else if (this.coyoteFrames > 0) {
      this.coyoteFrames -= 1;
    }

    if (!this.onGround || this.velocity.y > 0) {
      // Classic platformer jump shaping: hold to stretch arc, tap for short hop.
      const canApplyHold = this.jumpHeld && this.holdJumpFrames > 0 && this.velocity.y > 0;
      if (canApplyHold) {
        this.velocity.y += 0.0062;
        this.holdJumpFrames -= 1;
        this.holdFramesAppliedThisJump += 1;
        if (this.jumpsUsed === 1 && this.holdFramesAppliedThisJump >= 3) {
          this.firstJumpWasLong = true;
        }
      }
      this.velocity.y -= 0.014;
    }

    const canUseGroundJump = this.onGround || this.coyoteFrames > 0;
    const canUseAirJump = this.jumpsUsed === 1 && !this.firstJumpWasLong;
    if (this.jumpBufferFrames > 0 && (canUseGroundJump || canUseAirJump)) {
      const quickJumpVelocity = 0.315;
      this.velocity.y = quickJumpVelocity;
      this.jumpBufferFrames = 0;
      this.coyoteFrames = 0;
      this.onGround = false;
      this.jumpsUsed += 1;
      this.holdJumpFrames = 10;
      this.holdFramesAppliedThisJump = 0;
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
    }

    if (this.mesh.position.x > 10) this.mesh.position.x = -10;
    if (this.mesh.position.x < -10) this.mesh.position.x = 10;

    this.velocity.x *= 0.78;

    const horizontalSpeed = Math.abs(this.velocity.x);
    this.wobbleTime += 0.08 + horizontalSpeed * 0.6;
    const wobble = Math.sin(this.wobbleTime) * Math.min(0.12, horizontalSpeed * 0.5 + 0.03);
    this.rig.hat.rotation.z = wobble;
    this.rig.hat.rotation.x = Math.cos(this.wobbleTime * 1.4) * 0.04;
    this.rig.wand.rotation.z = this.rig.baseWandRotationZ + wobble * 1.8;
    this.rig.wand.rotation.x = Math.sin(this.wobbleTime * 1.9) * 0.1;
    this.rig.glow.position.y = 0.62 + Math.abs(wobble) * 0.2;
  }

  queueJump() {
    this.jumpBufferFrames = 8;
  }

  moveLeft() {
    this.velocity.x = Math.max(this.velocity.x - 0.018, -0.085);
    this.direction.x = -1;
    this.facing = -1;
    this.mesh.rotation.y = Math.PI;
  }

  moveRight() {
    this.velocity.x = Math.min(this.velocity.x + 0.018, 0.085);
    this.direction.x = 1;
    this.facing = 1;
    this.mesh.rotation.y = 0;
  }

  setJumpHeld(isHeld: boolean) {
    this.jumpHeld = isHeld;
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

  castSpell(scene: THREE.Scene) {
    if (this.spellCooldown > 0) {
      return null;
    }
    this.spellCooldown = 16;
    return new Spell(scene, this.mesh.position, this.direction.clone(), this.id);
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
    const geometry = new THREE.BoxGeometry(0.5, 4, 1);
    const material = new THREE.MeshPhongMaterial({ color: 0x808080 });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.set(x, baseY, 0);
    scene.add(this.mesh);

    this.baseY = baseY;
    this.amplitude = 2;
    this.frequency = 0.5;

    // Set initial bounds
    this.left = x - 0.25;
    this.right = x + 0.25;
    
    // Initial position update
    this.updateBounds(0);
  }

  updateBounds(time: number) {
    const yOffset = Math.sin(time * this.frequency) * this.amplitude;
    this.mesh.position.y = this.baseY + yOffset;
    this.top = this.mesh.position.y + 2;
    this.bottom = this.mesh.position.y - 2;
  }
}

const PortalPongGame: React.FC<PortalPongGameProps> = ({ config, onExit }) => {
  const mountRef = React.useRef<HTMLDivElement>(null);
  const resumeFromPauseRef = React.useRef<() => void>(() => {});
  const exitMatchRef = React.useRef<() => void>(() => {});
  const [matchSeedBump, setMatchSeedBump] = React.useState(0);
  const [chosenBackground, setChosenBackground] = React.useState<Exclude<PortalPongConfig['background'], 'random'> | null>(null);
  const [connectionStatus, setConnectionStatus] = React.useState('Offline AI');
  const [pauseMenuOpen, setPauseMenuOpen] = React.useState(false);
  const [resumeCountdown, setResumeCountdown] = React.useState<number | null>(null);
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
    aiDifficulty: THREE.MathUtils.clamp(config?.aiDifficulty ?? 3, 1, 10),
    localPlayer: config?.localPlayer ?? 'player1',
    mode: config?.mode ?? 'ai',
    matchmakingRoom: config?.matchmakingRoom ?? ''
  }), [config?.aiDifficulty, config?.background, config?.localPlayer, config?.matchmakingRoom, config?.mode, config?.parallax, config?.preset, config?.seed, matchSeedBump]);

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
    texture.wrapS = THREE.MirroredRepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.repeat.set(0.54, 0.62);
    texture.colorSpace = THREE.SRGBColorSpace;

    const setupParallax = (bounds: Bounds): ParallaxLayers => {
      const far = new THREE.Mesh(
        new THREE.PlaneGeometry(bounds.width * 1.8, bounds.height * 1.8),
        new THREE.MeshBasicMaterial({ map: texture, opacity: 0.9, transparent: true })
      );
      far.position.set(0, 3.6, -10.5);
      scene.add(far);

      if (!mergedConfig.parallax) {
        return { far };
      }

      const midTexture = texture.clone();
      midTexture.wrapS = THREE.MirroredRepeatWrapping;
      midTexture.wrapT = THREE.ClampToEdgeWrapping;
      midTexture.repeat.set(0.64, 0.7);
      midTexture.colorSpace = THREE.SRGBColorSpace;
      const mid = new THREE.Mesh(
        new THREE.PlaneGeometry(bounds.width * 2.0, bounds.height * 1.95),
        new THREE.MeshBasicMaterial({
          map: midTexture,
          transparent: true,
          opacity: 0.32
        })
      );
      mid.position.set(0, 3.45, -9.1);
      scene.add(mid);

      const nearTexture = texture.clone();
      nearTexture.wrapS = THREE.MirroredRepeatWrapping;
      nearTexture.wrapT = THREE.ClampToEdgeWrapping;
      nearTexture.repeat.set(0.78, 0.82);
      nearTexture.colorSpace = THREE.SRGBColorSpace;
      const near = new THREE.Mesh(
        new THREE.PlaneGeometry(bounds.width * 2.2, bounds.height * 2.05),
        new THREE.MeshBasicMaterial({
          map: nearTexture,
          transparent: true,
          opacity: 0.2
        })
      );
      near.position.set(0, 3.3, -7.9);
      scene.add(near);

      const edgeFog = new THREE.Mesh(
        new THREE.PlaneGeometry(bounds.width * 2.1, bounds.height * 2.1),
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
    const gameHeight = viewBounds.height - 1;
    const parallaxLayers = setupParallax(viewBounds);

    const player1 = new Player(scene, 0xff0000, -5, 'player1');
    const player2 = new Player(scene, 0x4a90e2, 5, 'player2');
    const localRole = mergedConfig.localPlayer === 'player2' ? 'player2' : 'player1';
    const activePlayer = localRole === 'player2' ? player2 : player1;
    const controlledByAi = localRole === 'player1' ? player2 : player1;
    const ball = new Ball(scene);
    let activeSpells: Spell[] = [];
    let matchEnded = false;
    let pausedForMenu = false;
    let countdownEndAt = 0;
    let lastCountdownValue: number | null = null;
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

    const generatePlatforms = () => {
      const platforms: Platform[] = [];
      const pairCount = PRESET_TO_PAIRS[mergedConfig.preset];
      
      platforms.push(new Platform(scene, 0, randomBetween(random, 2.2, 3.6), randomBetween(random, 1.8, 2.8)));

      for (let i = 0; i < pairCount; i++) {
        const x = randomBetween(random, 2.8, 7.1);
        const y = randomBetween(random, 1.2, 4.2);
        const width = randomBetween(random, 1.7, 3.2);
        platforms.push(new Platform(scene, x, y, width));
        platforms.push(new Platform(scene, -x, y, width));
      }
      return platforms;
    };

    const platforms = generatePlatforms();

    const leftWall = new MovingWall(scene, -9.5);
    const rightWall = new MovingWall(scene, 9.5);
    
    platforms.push(leftWall);
    platforms.push(rightWall);

    const createPortal = (x: number) => {
      const curve = new THREE.EllipseCurve(
        x, 2.5,
        0.5, 1.2,
        0, 2 * Math.PI,
        true
      );
      const points = curve.getPoints(50);
      const portalGeometry = new THREE.BufferGeometry().setFromPoints(points);
      const portalMaterial = new THREE.LineBasicMaterial({ color: x < 0 ? 0xff0000 : 0x0000ff });
      const portal = new THREE.Line(portalGeometry, portalMaterial);
      scene.add(portal);
      return portal;
    };

    createPortal(-9);
    createPortal(9);

    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(20, 0.5, 5),
      new THREE.MeshPhongMaterial({ color: 0x808080 })
    );
    floor.position.set(0, -1, 0);
    scene.add(floor);

    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight.position.set(0, 10, 0);
    scene.add(directionalLight);

    const localInput: ControllerFrame = {
      left: false,
      right: false,
      down: false,
      jumpQueued: false,
      jumpHeld: false,
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
      castQueued: false,
      aimX: controlledByAi.mesh.position.x + (localRole === 'player1' ? -2 : 2),
      aimY: controlledByAi.mesh.position.y + 0.4
    };

    const clearLocalInput = () => {
      localInput.left = false;
      localInput.right = false;
      localInput.down = false;
      localInput.jumpHeld = false;
      localInput.jumpQueued = false;
      localInput.castQueued = false;
    };

    const beginPause = () => {
      if (matchEnded || pausedForMenu || performance.now() < countdownEndAt) {
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
      if (pausedForMenu || performance.now() < countdownEndAt || matchEnded) {
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
        case 's': localInput.down = true; break;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (pausedForMenu || performance.now() < countdownEndAt || matchEnded) {
        return;
      }
      switch(e.key) {
        case 'a': localInput.left = false; break;
        case 'd': localInput.right = false; break;
        case 'w':
        case ' ':
          localInput.jumpHeld = false;
          break;
        case 's': localInput.down = false; break;
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (pausedForMenu || performance.now() < countdownEndAt || matchEnded) {
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
      input: Pick<ControllerFrame, 'left' | 'right' | 'down' | 'jumpHeld' | 'aimX' | 'aimY'>;
      jumpSeq: number;
      castSeq: number;
    }) => {
      remoteLastSeenAt = performance.now();
      remoteInput.left = payload.input.left;
      remoteInput.right = payload.input.right;
      remoteInput.down = payload.input.down;
      remoteInput.jumpHeld = payload.input.jumpHeld;
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

    const pushBallByExplosion = (spell: Spell) => {
      if (!spell.explosionMesh || spell.ballImpulseApplied) {
        return;
      }
      const distance = ball.mesh.position.distanceTo(spell.explosionMesh.position);
      if (distance >= spell.explosionRadius) {
        return;
      }
      const rawDirection = new THREE.Vector3().subVectors(ball.mesh.position, spell.explosionMesh.position);
      if (rawDirection.lengthSq() < 0.0001) {
        rawDirection.set(spell.owner === 'player1' ? 1 : -1, 0.3, 0);
      } else {
        rawDirection.normalize();
      }
      const centeredness = 1 - (distance / spell.explosionRadius);
      const impulseStrength = 0.12 + centeredness * 0.28;
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
      spell.ballImpulseApplied = true;
    };

    let localJumpSeq = 0;
    let localCastSeq = 0;

    const applyControllerToPlayer = (player: Player, frame: ControllerFrame) => {
      player.pressingDown = frame.down;
      player.setJumpHeld(frame.jumpHeld);
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
        const spell = player.castSpell(scene);
        if (spell) {
          activeSpells.push(spell);
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

      if (mergedConfig.parallax) {
        const trackedX = (player1.mesh.position.x + player2.mesh.position.x + ball.mesh.position.x) / 3;
        parallaxLayers.far.material.map!.offset.x = trackedX * 0.0045;
        parallaxLayers.far.material.map!.offset.y = ball.mesh.position.y * 0.0008;
        if (parallaxLayers.mid?.material.map) {
          parallaxLayers.mid.material.map.offset.x = trackedX * 0.0068;
          parallaxLayers.mid.material.map.offset.y = ball.mesh.position.y * 0.0012;
        }
        if (parallaxLayers.near?.material.map) {
          parallaxLayers.near.material.map.offset.x = trackedX * 0.0092;
          parallaxLayers.near.material.map.offset.y = ball.mesh.position.y * 0.0018;
        }
        if (parallaxLayers.edgeFog) {
          parallaxLayers.edgeFog.position.x = trackedX * 0.012;
        }
      }

      const time = performance.now() * 0.001;
      leftWall.updateBounds(time);
      rightWall.updateBounds(time + Math.PI);

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

      player1.update(platforms);
      player2.update(platforms);
      ball.update(gameHeight, platforms);

      activeSpells = activeSpells.filter((spell) => !spell.update(platforms, ball));

      [player1, player2].forEach(player => {
        const distance = ball.mesh.position.distanceTo(player.mesh.position);
        if (distance < 0.8) {
          const normal = new THREE.Vector3()
            .subVectors(ball.mesh.position, player.mesh.position)
            .normalize();
          ball.bounce(normal, 1.1);
        }
      });

      activeSpells.forEach((spell) => pushBallByExplosion(spell));

      const ballX = ball.mesh.position.x;
      const ballY = ball.mesh.position.y;
      
      if (ballX < -8.5 && ballY > 1.3 && ballY < 3.7) {
        setGameState((prev) => {
          const player2Score = prev.player2Score + 1;
          if (player2Score >= WIN_SCORE) {
            matchEnded = true;
            return { ...prev, player2Score, gameStatus: 'ended', winner: 'blue' };
          }
          return { ...prev, player2Score };
        });
        ball.reset();
      }
      
      if (ballX > 8.5 && ballY > 1.3 && ballY < 3.7) {
        setGameState((prev) => {
          const player1Score = prev.player1Score + 1;
          if (player1Score >= WIN_SCORE) {
            matchEnded = true;
            return { ...prev, player1Score, gameStatus: 'ended', winner: 'red' };
          }
          return { ...prev, player1Score };
        });
        ball.reset();
      }

      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      sizeRenderer();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(frameHandle);
      activeSpells.forEach((spell) => spell.cleanup());
      currentMount?.removeChild(renderer.domElement);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('pointermove', handlePointerMove);
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
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
  }, [mergedConfig, onExit]);

  return (
    <div className="w-full h-screen">
      <div ref={mountRef} className="w-full h-full" />
      <div className="absolute top-4 left-4 bg-slate-900/35 backdrop-blur-md text-white p-4 rounded-md border border-white/20 shadow-[0_0_20px_rgba(15,23,42,0.35)]">
        <div className="font-semibold mb-1">PortalPong</div>
        <div>Red Score: {gameState.player1Score}</div>
        <div>Blue Score: {gameState.player2Score}</div>
        <div className="text-xs mt-2 text-slate-300">Win Score: {WIN_SCORE}</div>
        <div className="text-xs text-slate-300">Background: {chosenBackground ?? 'loading'}</div>
        <div className="text-xs text-slate-300">Mode: {mergedConfig.mode === 'matchmaking' ? 'Matchmaking' : 'Vs AI'}</div>
        {mergedConfig.mode !== 'matchmaking' ? (
          <div className="text-xs text-slate-300">AI Difficulty: {mergedConfig.aiDifficulty ?? 3}</div>
        ) : null}
        <div className="text-xs text-slate-300">Local Side: {mergedConfig.localPlayer ?? 'player1'}</div>
        <div className="text-xs text-slate-300">{connectionStatus}</div>
      </div>
      {pauseMenuOpen ? (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/45 backdrop-blur-sm">
          <div className="w-[min(92vw,30rem)] border border-cyan-100/35 bg-slate-900/35 backdrop-blur-md p-6 text-center text-white shadow-[0_0_30px_rgba(34,211,238,0.2)]">
            <div className="mb-4 text-3xl font-bold uppercase tracking-widest text-cyan-100 drop-shadow-[0_0_10px_rgba(165,243,252,0.5)]">Paused</div>
            <div className="mb-6 text-xs uppercase tracking-wide text-slate-300">
              Press ESC to resume with countdown
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
      {gameState.gameStatus === 'ended' ? (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/45 backdrop-blur-sm">
          <div className="rounded-lg border border-white/25 bg-slate-900/40 backdrop-blur-md px-6 py-5 text-center text-white shadow-[0_0_20px_rgba(15,23,42,0.4)]">
            <div className="text-2xl font-semibold mb-2">
              {gameState.winner === 'red' ? 'Red Team Wins' : 'Blue Team Wins'}
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