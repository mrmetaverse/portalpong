import React from 'react';
import * as THREE from 'three';

interface GameState {
  player1Score: number;
  player2Score: number;
  gameStatus: 'playing' | 'paused' | 'ended';
}

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

  constructor(scene: THREE.Scene, position: THREE.Vector3, direction: THREE.Vector3) {
    const geometry = new THREE.SphereGeometry(0.1);
    const material = new THREE.MeshBasicMaterial({ 
      color: 0xffff00,
      transparent: true,
      opacity: 0.8
    });
    this.mesh = new THREE.Mesh(geometry, material);
    
    const spawnOffset = new THREE.Vector3(
      direction.x * 0.6,
      0.6,
      0
    );
    this.mesh.position.copy(position).add(spawnOffset);
    
    this.velocity = new THREE.Vector3(
      direction.x * 0.2,
      0.2,
      0
    );
    
    this.lifetime = 15;
    this.exploded = false;
    this.explosionRadius = 0.5;
    scene.add(this.mesh);
  }

  update(scene: THREE.Scene) {
    if (this.exploded) return true;
    
    this.lifetime--;
    if (this.lifetime <= 0) {
      this.explode(scene);
      return true;
    }
    
    this.mesh.position.add(this.velocity);
    return false;
  }

  explode(scene: THREE.Scene) {
    this.exploded = true;
    const explosionGeo = new THREE.SphereGeometry(this.explosionRadius);
    const explosionMat = new THREE.MeshBasicMaterial({
      color: 0xff8800,
      transparent: true,
      opacity: 0.5
    });
    this.explosionMesh = new THREE.Mesh(explosionGeo, explosionMat);
    this.explosionMesh.position.copy(this.mesh.position);
    scene.add(this.explosionMesh);
    
    setTimeout(() => {
      if (this.explosionMesh) {
        scene.remove(this.explosionMesh);
        scene.remove(this.mesh);
      }
    }, 100);
  }
}

class Ball {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;

  constructor(scene: THREE.Scene) {
    const geometry = new THREE.SphereGeometry(0.3);
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

    if (this.mesh.position.y > gameHeight || this.mesh.position.y < 0) {
      this.velocity.y *= -1;
    }
  }

  bounce(normal: THREE.Vector3, speed = 1) {
    const dot = this.velocity.dot(normal);
    this.velocity.sub(normal.multiplyScalar(2 * dot));
    this.velocity.multiplyScalar(speed);
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

class Player {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  onGround: boolean;
  direction: THREE.Vector3;

  constructor(scene: THREE.Scene, color: number, startX: number) {
    const geometry = new THREE.SphereGeometry(0.5);
    const material = new THREE.MeshBasicMaterial({ color });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.set(startX, 0, 0);
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.onGround = true;
    this.direction = new THREE.Vector3(1, 0, 0);
    scene.add(this.mesh);
  }

  update(platforms: Platform[]) {
    if (!this.onGround) {
      this.velocity.y -= 0.015;
    }

    const nextPosition = this.mesh.position.clone().add(this.velocity);

    this.onGround = false;
    platforms.forEach(platform => {
      if (nextPosition.x >= platform.left && 
          nextPosition.x <= platform.right && 
          nextPosition.y >= platform.bottom &&
          nextPosition.y <= platform.top) {
        if (this.velocity.y < 0) {
          nextPosition.y = platform.top;
          this.velocity.y = 0;
          this.onGround = true;
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

    this.velocity.x *= 0.9;
  }

  jump() {
    if (this.onGround) {
      this.velocity.y = 0.4;
      this.onGround = false;
    }
  }

  moveLeft() {
    this.velocity.x = -0.15;
    this.direction.x = -1;
  }

  moveRight() {
    this.velocity.x = 0.15;
    this.direction.x = 1;
  }

  castSpell(scene: THREE.Scene) {
    return new Spell(scene, this.mesh.position, this.direction);
  }
}

const SpyGame: React.FC = () => {
  const mountRef = React.useRef<HTMLDivElement>(null);
  const [gameState, setGameState] = React.useState<GameState>({
    player1Score: 0,
    player2Score: 0,
    gameStatus: 'playing'
  });

  React.useEffect(() => {
    if (!mountRef.current) return;

    const currentMount = mountRef.current;
    
    // Scene setup with black background
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    
    // Add background effects
    const backgroundPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 30),
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
        },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelMatrix * viewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform float uTime;
          varying vec2 vUv;
          
          void main() {
            vec3 color1 = vec3(sin(uTime * 0.3) * 0.5 + 0.5, 
                              sin(uTime * 0.4) * 0.5 + 0.5,
                              sin(uTime * 0.5) * 0.5 + 0.5);
            vec3 color2 = vec3(sin(uTime * 0.6) * 0.5 + 0.5,
                              sin(uTime * 0.7) * 0.5 + 0.5,
                              sin(uTime * 0.8) * 0.5 + 0.5);
            
            vec3 finalColor = mix(color1, color2, vUv.x);
            gl_FragColor = vec4(finalColor * 0.3, 1.0);  // Dimmed for better contrast
          }
        `
      })
    );
    backgroundPlane.position.z = -5;
    scene.add(backgroundPlane);

    // Add cave-like overlay
    const caveOverlay = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 30),
      new THREE.ShaderMaterial({
        transparent: true,
        uniforms: {
          uTime: { value: 0 }
        },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelMatrix * viewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform float uTime;
          varying vec2 vUv;
          
          float random(vec2 st) {
            return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
          }
          
          void main() {
            float noise = random(vUv + uTime * 0.1);
            float line = step(0.97, noise);
            gl_FragColor = vec4(vec3(1.0), line * 0.1);  // White lines with 0.1 opacity
          }
        `
      })
    );
    caveOverlay.position.z = -4;
    scene.add(caveOverlay);

    // Camera and renderer setup
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 5, 10);
    
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    currentMount.appendChild(renderer.domElement);

    // Calculate game boundaries
    const getViewBounds = () => {
      const vFOV = THREE.MathUtils.degToRad(camera.fov);
      const height = 2 * Math.tan(vFOV / 2) * Math.abs(camera.position.z);
      const width = height * camera.aspect;
      return { width, height };
    };

    const viewBounds = getViewBounds();
    const gameHeight = viewBounds.height - 1;

    // Create game objects
    const player1 = new Player(scene, 0xff0000, -5);
    const player2 = new Player(scene, 0x0000ff, 5);
    const ball = new Ball(scene);
    let activeSpells: Spell[] = [];

    // Create random symmetric platforms
    const generatePlatforms = () => {
      const platforms: Platform[] = [];
      
      // Random number of platforms (1, 3, 5, or 7)
      const platformCount = [1, 3, 5, 7][Math.floor(Math.random() * 4)];
      
      // Always create center platform
      platforms.push(new Platform(scene, 0, 2 + Math.random() * 2));

      if (platformCount > 1) {
        // Create symmetric pairs
        const pairCount = (platformCount - 1) / 2;
        for (let i = 0; i < pairCount; i++) {
          const x = 3 + Math.random() * 4; // Random x between 3 and 7
          const y = 1 + Math.random() * 3; // Random y between 1 and 4
          
          // Create symmetric pair
          platforms.push(new Platform(scene, x, y));
          platforms.push(new Platform(scene, -x, y));
        }
      }

      return platforms;
    };

    const platforms = generatePlatforms();

    // Create half walls behind players
    const createHalfWall = (x: number) => {
      const wall = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 4, 1),
        new THREE.MeshPhongMaterial({ color: 0x808080 })
      );
      wall.position.set(x, 2, 0);
      scene.add(wall);
      
      // Add collision bounds for the wall
      return {
        mesh: wall,
        top: 4,
        bottom: 0,
        left: x - 0.25,
        right: x + 0.25
      };
    };

    const leftWall = createHalfWall(-9.5);
    const rightWall = createHalfWall(9.5);
    
    // Add walls to platforms array for collision detection
    platforms.push(leftWall);
    platforms.push(rightWall);

    // Create portals
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

    // Create floor
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(20, 0.5, 5),
      new THREE.MeshPhongMaterial({ color: 0x808080 })
    );
    floor.position.set(0, -1, 0);
    scene.add(floor);

    // Add lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight.position.set(0, 10, 0);
    scene.add(directionalLight);

    // Controls
    const keys = {
      player1: { left: false, right: false, jump: false, spell: false },
      player2: { left: false, right: false, jump: false, spell: false }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      switch(e.key) {
        case 'a': keys.player1.left = true; break;
        case 'd': keys.player1.right = true; break;
        case 'w': keys.player1.jump = true; break;
        case 'e': keys.player1.spell = true; break;
        case 'i': keys.player2.left = true; break;
        case 'l': keys.player2.right = true; break;
        case 'j': keys.player2.jump = true; break;
        case 'o': keys.player2.spell = true; break;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      switch(e.key) {
        case 'a': keys.player1.left = false; break;
        case 'd': keys.player1.right = false; break;
        case 'w': keys.player1.jump = false; break;
        case 'e': keys.player1.spell = false; break;
        case 'i': keys.player2.left = false; break;
        case 'l': keys.player2.right = false; break;
        case 'j': keys.player2.jump = false; break;
        case 'o': keys.player2.spell = false; break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      
      const time = performance.now() * 0.001;
      backgroundPlane.material.uniforms.uTime.value = time;
      caveOverlay.material.uniforms.uTime.value = time;

      if (keys.player1.left) player1.moveLeft();
      if (keys.player1.right) player1.moveRight();
      if (keys.player1.jump) player1.jump();
      if (keys.player1.spell) {
        activeSpells.push(player1.castSpell(scene));
        keys.player1.spell = false;
      }

      if (keys.player2.left) player2.moveLeft();
      if (keys.player2.right) player2.moveRight();
      if (keys.player2.jump) player2.jump();
      if (keys.player2.spell) {
        activeSpells.push(player2.castSpell(scene));
        keys.player2.spell = false;
      }

      player1.update(platforms);
      player2.update(platforms);
      ball.update(gameHeight, platforms);

      activeSpells = activeSpells.filter(spell => !spell.update(scene));

      // Check collisions
      [player1, player2].forEach(player => {
        const distance = ball.mesh.position.distanceTo(player.mesh.position);
        if (distance < 0.8) {
          const normal = new THREE.Vector3()
            .subVectors(ball.mesh.position, player.mesh.position)
            .normalize();
          ball.bounce(normal, 1.1);
        }
      });

      activeSpells.forEach(spell => {
        if (spell.exploded && spell.explosionMesh) {
          const distance = ball.mesh.position.distanceTo(spell.explosionMesh.position);
          if (distance < spell.explosionRadius) {
            const normal = new THREE.Vector3()
              .subVectors(ball.mesh.position, spell.explosionMesh.position)
              .normalize();
            ball.bounce(normal, 1.2);
          }
        }
      });

      // Goal detection
      const ballX = ball.mesh.position.x;
      const ballY = ball.mesh.position.y;
      
      if (ballX < -8.5 && ballY > 1.3 && ballY < 3.7) {
        setGameState(prev => ({
          ...prev,
          player2Score: prev.player2Score + 1
        }));
        ball.reset();
      }
      
      if (ballX > 8.5 && ballY > 1.3 && ballY < 3.7) {
        setGameState(prev => ({
          ...prev,
          player1Score: prev.player1Score + 1
        }));
        ball.reset();
      }

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      currentMount?.removeChild(renderer.domElement);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  return (
    <div className="w-full h-screen">
      <div ref={mountRef} className="w-full h-full" />
      <div className="absolute top-4 left-4 bg-black/50 text-white p-4 rounded">
        <div>Red Score: {gameState.player1Score}</div>
        <div>Blue Score: {gameState.player2Score}</div>
      </div>
    </div>
  );
};

export default SpyGame;