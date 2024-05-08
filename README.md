<h1>react-three-offscreen</h1>

[![Version](https://img.shields.io/npm/v/@react-three/offscreen?style=flat&colorA=000000&colorB=000000)](https://npmjs.com/package/@react-three/offscreen)
[![Downloads](https://img.shields.io/npm/dt/@react-three/offscreen.svg?style=flat&colorA=000000&colorB=000000)](https://npmjs.com/package/@react-three/offscreen)
[![Twitter](https://img.shields.io/twitter/follow/pmndrs?label=%40pmndrs&style=flat&colorA=000000&colorB=000000&logo=twitter&logoColor=000000)](https://twitter.com/pmndrs)
[![Discord](https://img.shields.io/discord/740090768164651008?style=flat&colorA=000000&colorB=000000&label=discord&logo=discord&logoColor=000000)](https://discord.gg/ZZjjNvJ)
[![Open Collective](https://img.shields.io/opencollective/all/react-three-fiber?style=flat&colorA=000000&colorB=000000)](https://opencollective.com/react-three-fiber)
[![ETH](https://img.shields.io/badge/ETH-f5f5f5?style=flat&colorA=000000&colorB=000000)](https://blockchain.com/eth/address/0x6E3f79Ea1d0dcedeb33D3fC6c34d2B1f156F2682)
[![BTC](https://img.shields.io/badge/BTC-f5f5f5?style=flat&colorA=000000&colorB=000000)](https://blockchain.com/btc/address/36fuguTPxGCNnYZSRdgdh6Ea94brCAjMbH)

<br />
<a href="https://offscreen.pmnd.rs/"><img src="/front.jpg" width="100%" /></a>
<br />

```bash
npm install three @react-three/fiber @react-three/offscreen
```

This is an experimental package that allows you to render your [react-three-fiber](https://github.com/pmndrs/react-three-fiber) scene with an offscreen canvas in a web worker. This is mostly useful for self-contained webgl apps, and un-blocking the main thread.

## What's the big deal, workers existed before

You only could never just run your existing WebGL/Threejs app in it. It had to be rewritten. Pointer-events wouldn't work, controls, textures, GLTFs, etc. Worse, thanks to Safari you needed to maintain two forks of your app, one that runs in a worker and one that runs on the main thread as a fallback. This is probably the main reason why Threejs with an offscreen canvas has never caught on.

This package tries to fix that! The goal is that your existing code will just work. It will forward DOM events to the worker, patch and shim Threejs as well as basic document/window interfaces. It will automatically fall back to main thread if a browser doesn't support offscreen canvas. Even the eco system will work (Drei, Rapier physics, Postprocessing, ...).

## Usage

Instead of importing `<Canvas>` from `@react-three/fiber` you can import it from `@react-three/offscreen` and pass a `worker` prop. The `fallback` prop is optional, your scene will be rendered on the main thread when OffscreenCanvas is not supported.

It takes all other props that `<Canvas>` takes (dpr, shadows, etc), you can use it as a drop-in replacement.

```jsx
// App.jsx (main thread)
import { lazy } from 'react'
import { Canvas } from '@react-three/offscreen'

// This is the fallback component that will be rendered on the main thread
// This will happen on systems where OffscreenCanvas is not supported
const Scene = lazy(() => import('./Scene'))

// This is the worker thread that will render the scene
const worker = new Worker(new URL('./worker.jsx', import.meta.url), { type: 'module' })

export default function App() {
  return (
    <Canvas
      worker={worker} fallback={<Scene />}
      shadows camera={{ position: [0, 5, 10], fov: 25 }} />
  )
}
```

Your worker thread will be responsible for rendering the scene. The `render` function takes a single argument, a ReactNode. React-three-fiber and its React-root/reconciler will run in that worker, rendering your contents.

```jsx
// worker.jsx (worker thread)
import { render } from '@react-three/offscreen'
import Scene from './Scene'

render(<Scene />)
```

Your app or scene should idealy be self contained, it shouldn't postMessage with the DOM. This is because offscreen canvas + webgl is still not supported in Safari. If you must communicate with the DOM, you can use the web broadcast API.

```jsx
// Scene.jsx (a self contained webgl app)
export default function App() {
  return (
    <mesh>
      <boxGeometry />
    </mesh>
  )
}
```

## Troubleshooting

### Compromises and defaults

For better interop all non-passive events (click, contextmenu, dlbclick) will preventDefault, pointerdown will capture, pointerup will release capture.

### Nextjs

Just make sure to disable SSR for the canvas component because `Worker` only exists in the DOM:

```jsx
// src/app/page.jsx
import dynamic from 'next/dynamic'

const App = dynamic(() => import('@/components/App'), { ssr: false })
```

### Vite

Vites `@vitejs/plugin-react` tries to inject styles into `document` and assumes the presence of `window`, neither exist in a worker. As such you can consider the official React plugin faulty, it won't run React in a web worker. The workaround:

1. yarn add @vitejs/plugin-react@3.1.0
2. disable fast refresh (see: [stackoverflow](https://stackoverflow.com/questions/73815639/how-to-use-jsx-in-a-web-worker-with-vite)) (the option was removed in 4.x)

```jsx
export default defineConfig({
  plugins: [react({ fastRefresh: false })],
  worker: { plugins: [react()] },
})
```
