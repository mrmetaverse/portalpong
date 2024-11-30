import React from 'react';
import * as THREE from 'three';

interface GameState {
  player1Health: number;
  player2Health: number;
  player1Clues: number;
  player2Clues: number;
  gameStatus: 'playing' | 'player1_won' | 'player2_won';
}

interface Bomb {
  mesh: THREE.Mesh;
  position: THREE.Vector3;
  timeLeft: number;
  owner: 'player1' | 'player2';
}

interface Platform {
  mesh: THREE.Mesh;
  top: number;
  bottom: number;
  left: number;
  right: number;
}

interface ClueItem {
  mesh: THREE.Mesh;
  position: THREE.Vector3;
  collected: boolean;
}

interface Room {
  id: number;
  x: number;
  y: number;
  platforms: Platform[];
  portals: Portal[];
  clues: ClueItem[];
  discovered: boolean;
  connections: number[];
  leftDoor?: Portal;
  rightDoor?: Portal;
}

interface Portal {
  mesh: THREE.Mesh;
  position: THREE.Vector3;
  targetRoomId: number;
  direction: 'left' | 'right';
}

const generatePlatforms = (scene: THREE.Scene) => {
  const platforms: Platform[] = [];
  
  // Create floor platform
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(20, 0.5, 5),
    new THREE.MeshPhongMaterial({ color: 0x808080 })
  );
  floor.position.set(0, -1, 0);
  scene.add(floor);
  
  // Add floor to platforms with collision bounds
  platforms.push({
    mesh: floor,
    top: -0.75,     // Position + half height
    bottom: -1.25,  // Position - half height
    left: -10,      // Position - half width
    right: 10       // Position + half width
  });

  // Create random platforms (rest of the code stays the same)
  const platformCount = 3 + Math.floor(Math.random() * 5);
  
  for (let i = 0; i < platformCount; i++) {
    const width = 2 + Math.random() * 3;
    const x = -8 + Math.random() * 16; // Random x between -8 and 8
    const y = 1 + Math.random() * 4;   // Random y between 1 and 5
    
    const geometry = new THREE.BoxGeometry(width, 0.2, 1);
    const material = new THREE.MeshPhongMaterial({ color: 0x95a5a6 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, 0);
    scene.add(mesh);

    platforms.push({
      mesh,
      top: y + 0.1,
      bottom: y - 0.1,
      left: x - width/2,
      right: x + width/2
    });
  }

  return platforms;
};

class Player {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  onGround: boolean;
  direction: THREE.Vector3;
  health: number;
  clues: number;
  isAttacking: boolean;
  attackCooldown: number;
  bombCooldown: number;
  pressingDown: boolean;

  constructor(scene: THREE.Scene, color: number, startX: number) {
    const geometry = new THREE.SphereGeometry(0.5);
    const material = new THREE.MeshBasicMaterial({ color });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.set(startX, 0, 0);
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.onGround = true;
    this.direction = new THREE.Vector3(1, 0, 0);
    this.health = 10;
    this.clues = 0;
    this.isAttacking = false;
    this.attackCooldown = 0;
    this.bombCooldown = 0;
    this.pressingDown = false;
    scene.add(this.mesh);
  }

  update(platforms: Platform[]) {
    if (!this.onGround) {
      this.velocity.y -= 0.015;
    }

    const nextPosition = this.mesh.position.clone().add(this.velocity);
    const playerRadius = 0.5;

    // Floor collision first
    if (nextPosition.y - playerRadius < 0) {
      nextPosition.y = playerRadius; // Keep player above ground
      this.velocity.y = 0;
      this.onGround = true;
    }

    // Then check other platforms
    this.onGround = this.onGround || false; // Keep ground state if we're on the floor
    platforms.forEach(platform => {
      const playerLeft = nextPosition.x - playerRadius;
      const playerRight = nextPosition.x + playerRadius;
      const playerTop = nextPosition.y + playerRadius;
      const playerBottom = nextPosition.y - playerRadius;

      if (playerRight >= platform.left && playerLeft <= platform.right) {
        if (!this.pressingDown && playerBottom <= platform.top && 
            this.mesh.position.y - playerRadius > platform.top) {
          nextPosition.y = platform.top + playerRadius;
          this.velocity.y = 0;
          this.onGround = true;
        } 
        else if (playerTop >= platform.bottom && 
                 this.mesh.position.y + playerRadius < platform.bottom) {
          nextPosition.y = platform.bottom - playerRadius;
          this.velocity.y = 0;
        }
      }

      if (playerTop >= platform.bottom && playerBottom <= platform.top) {
        if (playerRight >= platform.left && 
            this.mesh.position.x + playerRadius < platform.left) {
          nextPosition.x = platform.left - playerRadius;
          this.velocity.x = 0;
        } else if (playerLeft <= platform.right && 
                   this.mesh.position.x - playerRadius > platform.right) {
          nextPosition.x = platform.right + playerRadius;
          this.velocity.x = 0;
        }
      }
    });

    this.mesh.position.copy(nextPosition);
    
    // Update cooldowns
    if (this.attackCooldown > 0) this.attackCooldown--;
    if (this.bombCooldown > 0) this.bombCooldown--;
    
    // Reset attack state
    this.isAttacking = false;
  }

  punch() {
    if (this.attackCooldown === 0) {
      this.isAttacking = true;
      this.attackCooldown = 30; // 0.5 seconds cooldown
    }
  }

  plantBomb(scene: THREE.Scene, bombs: Bomb[]) {
    if (this.bombCooldown === 0) {
      const bombGeometry = new THREE.SphereGeometry(0.3);
      const bombMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
      const bombMesh = new THREE.Mesh(bombGeometry, bombMaterial);
      bombMesh.position.copy(this.mesh.position);
      
      const bomb: Bomb = {
        mesh: bombMesh,
        position: this.mesh.position.clone(),
        timeLeft: 300, // 5 seconds at 60fps
        owner: this.mesh.position.x < 0 ? 'player1' : 'player2'
      };
      
      scene.add(bombMesh);
      bombs.push(bomb);
      this.bombCooldown = 180; // 3 seconds cooldown
    }
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
}

const findOppositeRooms = (rooms: Room[]) => {
  // Find rooms in opposite corners
  const leftmostRooms = rooms.filter(r => r.x === 0);
  const rightmostRooms = rooms.filter(r => r.x === 2); // For 3x4 grid

  const topLeft = leftmostRooms.find(r => r.y === 0);
  const bottomRight = rightmostRooms.find(r => r.y === 3);

  return {
    player1Spawn: topLeft?.id ?? 0,
    player2Spawn: bottomRight?.id ?? rooms.length - 1
  };
};

const createRoom = (
  roomId: number, 
  allRooms: Room[], 
  gameScene: THREE.Scene
) => {
  const room = allRooms[roomId];
  
  // Clear existing room
  room.platforms.forEach((p: Platform) => gameScene.remove(p.mesh));
  room.portals.forEach((p: Portal) => gameScene.remove(p.mesh));
  room.clues?.forEach((c: ClueItem) => gameScene.remove(c.mesh));
  
  // Generate platforms
  const newPlatforms = generatePlatforms(gameScene);
  room.platforms = newPlatforms;

  // Create doors on both sides
  const createDoor = (isLeft: boolean): Portal => {
    const x = isLeft ? -9 : 9;
    const portalGeometry = new THREE.BoxGeometry(0.5, 2, 1);
    const portalMaterial = new THREE.MeshBasicMaterial({ color: 0x8B4513 });
    const portalMesh = new THREE.Mesh(portalGeometry, portalMaterial);
    portalMesh.position.set(x, 1, 0);
    gameScene.add(portalMesh);
    
    const direction = isLeft ? 'left' : 'right';
    
    return {
      mesh: portalMesh,
      position: new THREE.Vector3(x, 1, 0),
      targetRoomId: -1,
      direction
    };
  };

  room.leftDoor = createDoor(true);
  room.rightDoor = createDoor(false);

  // Connect doors to adjacent rooms
  allRooms.forEach((otherRoom: Room) => {
    if (otherRoom.id !== room.id) {
      if (otherRoom.x === room.x - 1 && otherRoom.y === room.y) {
        room.leftDoor!.targetRoomId = otherRoom.id;
      }
      if (otherRoom.x === room.x + 1 && otherRoom.y === room.y) {
        room.rightDoor!.targetRoomId = otherRoom.id;
      }
    }
  });

  return room;
};

const SpyGame: React.FC = () => {
  const mountRef = React.useRef<HTMLDivElement>(null);
  const [gameState, setGameState] = React.useState<GameState>({
    player1Health: 10,
    player2Health: 10,
    player1Clues: 0,
    player2Clues: 0,
    gameStatus: 'playing'
  });
  const [currentRoomId, setCurrentRoomId] = React.useState(0);
  const [rooms, setRooms] = React.useState<Room[]>([]);

  React.useEffect(() => {
    if (!mountRef.current) return;
    const currentMount = mountRef.current;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);

    // Camera setup
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 5, 10);
    camera.lookAt(0, 0, 0);
    
    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    currentMount.appendChild(renderer.domElement);

    const player1 = new Player(scene, 0xff0000, -5);
    const player2 = new Player(scene, 0x0000ff, 5);
    let bombs: Bomb[] = [];

    // Create clues
    const createClue = (x: number, y: number) => {
      const clueGeometry = new THREE.BoxGeometry(0.3, 0.3, 0.3);
      const clueMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });
      const clueMesh = new THREE.Mesh(clueGeometry, clueMaterial);
      clueMesh.position.set(x, y, 0);
      scene.add(clueMesh);
      return clueMesh;
    };

    // Controls
    const keys = {
      player1: { left: false, right: false, jump: false, attack: false, bomb: false },
      player2: { left: false, right: false, jump: false, attack: false, bomb: false }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      switch(e.key) {
        case 'a': keys.player1.left = true; break;
        case 'd': keys.player1.right = true; break;
        case 'w': keys.player1.jump = true; break;
        case 'e': keys.player1.attack = true; break;
        case 'b': keys.player1.bomb = true; break;
        case 'i': keys.player2.left = true; break;
        case 'l': keys.player2.right = true; break;
        case 'j': keys.player2.jump = true; break;
        case 'o': keys.player2.attack = true; break;
        case 'n': keys.player2.bomb = true; break;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      switch(e.key) {
        case 'a': keys.player1.left = false; break;
        case 'd': keys.player1.right = false; break;
        case 'w': keys.player1.jump = false; break;
        case 'e': keys.player1.attack = false; break;
        case 'b': keys.player1.bomb = false; break;
        case 'i': keys.player2.left = false; break;
        case 'l': keys.player2.right = false; break;
        case 'j': keys.player2.jump = false; break;
        case 'o': keys.player2.attack = false; break;
        case 'n': keys.player2.bomb = false; break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    // Generate random room layout
    const generateRooms = () => {
      const newRooms: Room[] = [];
      const totalRooms = 10;
      
      // Create rooms in a grid
      for (let i = 0; i < totalRooms; i++) {
        const room: Room = {
          id: i,
          x: i % 3,  // 3x4 grid
          y: Math.floor(i / 3),
          platforms: [],
          portals: [],
          clues: [],
          discovered: i === 0,  // Start room is discovered
          connections: []
        };
        newRooms.push(room);
      }

      // Randomly connect rooms
      for (let i = 0; i < totalRooms; i++) {
        const room = newRooms[i];
        const possibleConnections = newRooms.filter(r => 
          r.id !== room.id && 
          Math.abs(r.x - room.x) + Math.abs(r.y - room.y) === 1 &&
          !room.connections.includes(r.id)
        );

        if (possibleConnections.length > 0) {
          const target = possibleConnections[Math.floor(Math.random() * possibleConnections.length)];
          room.connections.push(target.id);
          target.connections.push(room.id);
        }
      }

      return newRooms;
    };

    const rooms = generateRooms();
    const { player1Spawn, player2Spawn } = findOppositeRooms(rooms);

    // Create all rooms first
    rooms.forEach(room => createRoom(room.id, rooms, scene));

    // Spawn players in their respective rooms
    player1.mesh.position.set(-5, 1, 0); // Start on left side of spawn room
    player2.mesh.position.set(5, 1, 0);  // Start on right side of spawn room
    
    setCurrentRoomId(player1Spawn); // Start viewing player 1's room

    // Modify the checkPortals function to use doors
    const checkPortals = () => {
      const currentRoom = rooms[currentRoomId];
      
      [currentRoom.leftDoor, currentRoom.rightDoor].forEach(door => {
        if (!door || door.targetRoomId === -1) return;

        [player1, player2].forEach(player => {
          const distance = player.mesh.position.distanceTo(door.position);
          if (distance < 1) {
            // Transport player to new room
            const targetRoom = rooms[door.targetRoomId];
            player.mesh.position.x = door.direction === 'right' ? -8 : 8;
            targetRoom.discovered = true;
            
            // If this is the viewed player, switch rooms
            if (player === player1) { // Assuming we follow player 1
              setCurrentRoomId(door.targetRoomId);
            }
          }
        });
      });
    };

    // Add more lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    directionalLight.position.set(0, 10, 5);
    scene.add(directionalLight);

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);

      // Update players based on keys
      if (keys.player1.left) player1.moveLeft();
      if (keys.player1.right) player1.moveRight();
      if (keys.player1.jump) player1.jump();
      if (keys.player1.attack) player1.punch();
      if (keys.player1.bomb) player1.plantBomb(scene, bombs);

      if (keys.player2.left) player2.moveLeft();
      if (keys.player2.right) player2.moveRight();
      if (keys.player2.jump) player2.jump();
      if (keys.player2.attack) player2.punch();
      if (keys.player2.bomb) player2.plantBomb(scene, bombs);

      // Update physics
      player1.update(rooms[currentRoomId].platforms);
      player2.update(rooms[currentRoomId].platforms);

      // Update bombs
      bombs = bombs.filter(bomb => {
        bomb.timeLeft--;
        if (bomb.timeLeft <= 0) {
          // Explosion
          const distance1 = bomb.position.distanceTo(player1.mesh.position);
          const distance2 = bomb.position.distanceTo(player2.mesh.position);
          
          if (distance1 < 2 && bomb.owner !== 'player1') {
            setGameState(prev => ({
              ...prev,
              player1Health: Math.max(0, prev.player1Health - 9)
            }));
          }
          
          if (distance2 < 2 && bomb.owner !== 'player2') {
            setGameState(prev => ({
              ...prev,
              player2Health: Math.max(0, prev.player2Health - 9)
            }));
          }
          
          scene.remove(bomb.mesh);
          return false;
        }
        return true;
      });

      // Check combat
      const playerDistance = player1.mesh.position.distanceTo(player2.mesh.position);
      if (playerDistance < 1.2) {
        if (player1.isAttacking) {
          setGameState(prev => ({
            ...prev,
            player2Health: Math.max(0, prev.player2Health - 2)
          }));
        }
        if (player2.isAttacking) {
          setGameState(prev => ({
            ...prev,
            player1Health: Math.max(0, prev.player1Health - 2)
          }));
        }
      }

      // Check clue collection
      const currentRoom = rooms[currentRoomId];
      currentRoom.clues?.forEach(clue => {
        if (!clue.collected) {
          [player1, player2].forEach(player => {
            const distance = player.mesh.position.distanceTo(clue.position);
            if (distance < 1) {
              clue.collected = true;
              scene.remove(clue.mesh);
              setGameState(prev => ({
                ...prev,
                [player === player1 ? 'player1Clues' : 'player2Clues']: 
                  prev[player === player1 ? 'player1Clues' : 'player2Clues'] + 1
              }));
            }
          });
        }
      });

      checkPortals();
      renderer.render(scene, camera);
    };

    animate();

    // Add resize handler
    const handleResize = () => {
      if (!mountRef.current) return;
      const width = window.innerWidth;
      const height = window.innerHeight;
      
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      currentMount?.removeChild(renderer.domElement);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('resize', handleResize);
    };
  }, [currentRoomId]);

  return (
    <div className="w-full h-screen">
      <div ref={mountRef} className="w-full h-full" />
      <div className="absolute top-4 left-4 bg-black/50 text-white p-4 rounded">
        <div>Red Health: {gameState.player1Health} Clues: {gameState.player1Clues}</div>
        <div>Blue Health: {gameState.player2Health} Clues: {gameState.player2Clues}</div>
      </div>
      {/* Mini-map */}
      <div className="absolute bottom-4 right-4 bg-black/50 p-2 rounded">
        <div className="grid grid-cols-3 gap-1">
          {rooms.map(room => (
            <div 
              key={room.id}
              className={`w-4 h-4 border ${
                room.discovered ? 'bg-gray-500' : 'bg-gray-900'
              } ${currentRoomId === room.id ? 'border-yellow-500' : 'border-gray-700'}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default SpyGame;
