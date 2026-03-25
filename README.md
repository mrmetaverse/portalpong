# PortalPong

A multiplayer platform-physics game inspired by Pong and Spy vs Spy, built with Three.js and React.

## Gameplay

Two players compete to score points by getting the ball into their opponent's portal:
- Red player uses WASD to move and E to cast spells
- Blue player uses IJKL to move and O to cast spells
- Players can bounce the ball by touching it or using spell explosions
- The map loops horizontally (go right, appear on left)

## New Modernized Build

- Match setup screen with seeded procedural generation controls
- Background selector for `bg1` through `bg7`, plus random rotation mode
- Parallax edge layers for cave depth and better visual motion
- Improved spell explosions with cooldown and radial impulse behavior
- Win condition flow with end-match overlay and quick arena reroll

## Local Development

```bash
npm install
npm run dev
```

## Production Build

```bash
npm run build
```

## Vercel Deployment

1. Import this repository into Vercel.
2. Framework preset: Other.
3. Build command: `npm run build`
4. Output directory: `build`
5. Deploy.

`vercel.json` is already included with SPA rewrite routing so all paths resolve to `index.html`.

## Development

Current State:
![image](https://github.com/user-attachments/assets/1c3e152a-2099-44fb-a26b-18e71ab631bf)

Mockups: 
![image](https://github.com/user-attachments/assets/0cd515a0-557a-48b0-9029-40aaba9edae5)
![image](https://github.com/user-attachments/assets/16da082f-7d87-4eaf-a666-359af44ec782)

![image](https://github.com/user-attachments/assets/38a88564-b5a3-4584-b178-012b52c12632)
