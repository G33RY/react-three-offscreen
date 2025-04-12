import * as THREE from 'three'
import mitt from 'mitt'
import { createRoot, Dpr, extend, ReconcilerRoot, Size } from '@react-three/fiber'
import { DomEvent } from '@react-three/fiber/dist/declarations/src/core/events'
import { createPointerEvents } from './events'

function turnStringIntoFunction(fn: string) {
  return (new Function(fn))()
}

function transformProps(props: Record<string, any>, functionProps: Record<string, any> | null = null) {
  if(!functionProps) {
    functionProps = {}
  }
  for (let functionProp in functionProps) {
    const fn = functionProps[functionProp]
    if (typeof fn === 'string' && fn.startsWith("return ")) {
      props[functionProp] = turnStringIntoFunction(fn)
    }
  }

}


export function render(children: ((props: Record<string, any>) => React.ReactNode) | React.ReactNode) {
  extend(THREE)

  let root: ReconcilerRoot<HTMLCanvasElement>
  let dpr: Dpr = [1, 2]
  let size: Size = { width: 0, height: 0, top: 0, left: 0, updateStyle: false }
  const emitter = mitt()

  // noinspection JSConstantReassignment
  const handleInit = (payload: any) => {
    const { props, functionProps, renderProps, drawingSurface: canvas, width, top, left, height, pixelRatio } = payload
    transformProps(props, functionProps)

    try {
      // Unmount root if already mounted
      if (root) {
        root.unmount()
      }

      // Shim the canvas into a fake window/document
      Object.assign(canvas, {
        pageXOffset: left,
        pageYOffset: top,
        clientLeft: left,
        clientTop: top,
        clientWidth: width,
        clientHeight: height,
        style: { touchAction: 'none' },
        ownerDocument: canvas,
        documentElement: canvas,
        getBoundingClientRect() {
          return size
        },
        setAttribute() {},
        setPointerCapture() {},
        releasePointerCapture() {},
        addEventListener(event: string, callback: () => void) {
          emitter.on(event, callback)
        },
        removeEventListener(event: string, callback: () => void) {
          emitter.off(event, callback)
        },
      })
      // Create react-three-fiber root
      root = createRoot(canvas)
      // Configure root
      root.configure({
        events: createPointerEvents(emitter),
        size: (size = { width, height, top, left, updateStyle: false }),
        dpr: (dpr = Math.min(Math.max(1, pixelRatio), 2)),
        ...props,
        onCreated: (state) => {
          if (props.eventPrefix) {
            state.setEvents({
              compute: (event, state) => {
                const x = event[(props.eventPrefix + 'X') as keyof DomEvent] as number
                const y = event[(props.eventPrefix + 'Y') as keyof DomEvent] as number
                state.pointer.set((x / state.size.width) * 2 - 1, -(y / state.size.height) * 2 + 1)
                state.raycaster.setFromCamera(state.pointer, state.camera)
              },
            })
          }
          props.onCreated(state)
        },
      })

      // Render children once
      if(typeof children === 'function') {
        root.render(children(renderProps))
      }else{
        root.render(children)
      }

    postMessage({ type: 'ready' })
    } catch (e: any) {
      postMessage({ type: 'error', payload: e?.message })
    }

    // Shim window to the canvas from here on
    self.window = canvas
  }

  const handleResize = ({ width, height, top, left }: Size) => {
    if (!root) return
    root.configure({ size: (size = { width, height, top, left, updateStyle: false }), dpr })
  }

  const handleEvents = (payload: any) => {
    emitter.emit(payload.eventName, { ...payload, preventDefault() {}, stopPropagation() {} })
  }

  const handleProps = (payload: any) => {
    if (!root) return
    const {props, functionProps} = payload
    transformProps(props, functionProps)
    if (props.dpr) dpr = props.dpr

    root.configure({ size, dpr, ...props })
  }

  const handleRenderProps = (payload: any) => {
    if(!root) return;
    if(typeof children !== 'function') return

    const {  renderProps } = payload

    // Render children once
    root.render(children(renderProps))
  }

  const handlerMap = {
    resize: handleResize,
    init: handleInit,
    dom_events: handleEvents,
    props: handleProps,
    renderProps: handleRenderProps,
  }

  self.onmessage = (event) => {
    const { type, payload } = event.data
    const handler = handlerMap[type as keyof typeof handlerMap]
    if (handler) handler(payload)
  }

  // Shims for threejs
  // @ts-ignore
  THREE.ImageLoader.prototype.load = function (
    url: string,
    onLoad: (img: ImageBitmap) => void,
    onProgress: () => void,
    onError: (e: Error) => void
  ) {
    if (this.path !== undefined) url = this.path + url
    url = this.manager.resolveURL(url)
    const scope = this
    const cached = THREE.Cache.get(url)

    if (cached !== undefined) {
      scope.manager.itemStart(url)
      if (onLoad) onLoad(cached)
      scope.manager.itemEnd(url)
      return cached
    }

    fetch(url)
      .then((res) => res.blob())
      .then((res) => createImageBitmap(res, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }))
      .then((bitmap) => {
        THREE.Cache.add(url, bitmap)
        if (onLoad) onLoad(bitmap)
        scope.manager.itemEnd(url)
      })
      .catch(onError)
    return {}
  }

  // Shims for web offscreen canvas
  // @ts-ignore
  self.window = {}
  // @ts-ignore
  self.document = {}
  // @ts-ignore
  self.Image = class {
    height = 1
    width = 1
    set onload(callback: any) {
      callback(true)
    }
  }
}
