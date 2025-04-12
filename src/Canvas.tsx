import React, { useEffect, useRef } from 'react'
import type { Options as ResizeOptions } from 'react-use-measure'
import { Canvas as CanvasImpl, RenderProps } from '@react-three/fiber'
import { EVENTS } from './events'

export interface CanvasProps
  extends Omit<RenderProps<HTMLCanvasElement>, 'size'>,
    React.HTMLAttributes<HTMLDivElement> {
  worker: Worker
  fallback?: React.ReactNode
  /**
   * Options to pass to useMeasure.
   * @see https://github.com/pmndrs/react-use-measure#api
   */
  resize?: ResizeOptions
  /** The target where events are being subscribed to, default: the div that wraps canvas */
  eventSource?: HTMLElement | React.MutableRefObject<HTMLElement>
  /** The event prefix that is cast into canvas pointer x/y events, default: "offset" */
  eventPrefix?: 'offset' | 'client' | 'page' | 'layer' | 'screen'

  renderProps?: Record<string, any>
}

function isRefObject<T>(ref: any): ref is React.MutableRefObject<T> {
  return ref && ref.current !== undefined
}


function transformFunctionIntoString(fn: Function) {
  return "return " + fn.toString();
}



export function Canvas({ eventSource, worker, fallback, style, className, id, renderProps, ...props }: CanvasProps) {
  const [shouldFallback, setFallback] = React.useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null!)
  const hasTransferredToOffscreen = useRef(false)
  const [initialized, setInitialized] = React.useState(false)

  function transformProps() {
    let simpleProps : Record<any, any>= {}
    let functionProps : Record<any, any> = { }
    const anyProps = props as any
    for (const prop in anyProps) {
      if (typeof anyProps[prop] === 'function') {
        functionProps[prop] = transformFunctionIntoString(anyProps[prop])
      } else{
        simpleProps[prop] = anyProps[prop]
      }
    }

    return { props: simpleProps, functionProps }
  }

  useEffect(() => {
    if (!worker) return

    const canvas = canvasRef.current
    try {
      if (hasTransferredToOffscreen.current) return;
      let offscreen = canvasRef.current.transferControlToOffscreen()

      hasTransferredToOffscreen.current = true

      worker.postMessage(
        {
          type: 'init',
          payload: {
            ...transformProps(),
            drawingSurface: offscreen,
            width: canvas.clientWidth,
            height: canvas.clientHeight,
            top: canvas.offsetTop,
            left: canvas.offsetLeft,
            pixelRatio: window.devicePixelRatio,
            renderProps,
          },
        },
        [offscreen]
      )
    } catch (e) {
      // Browser doesn't support offscreen canvas at all
      setFallback(true)
      return
    }

    worker.onmessage = (e) => {
      if (e.data.type === 'error') {
        // Worker failed to initialize
        setFallback(true)
      }
      if (e.data.type === 'ready') {
        // Worker initialized successfully
        setInitialized(true)
      }
    }

    const currentEventSource = isRefObject(eventSource) ? eventSource.current : eventSource || canvas

    Object.values(EVENTS).forEach(([eventName, passive]) => {
      currentEventSource.addEventListener(
        eventName,
        (event: any) => {
          // Prevent default for all passive events
          if (!passive) event.preventDefault()
          // Capture pointer automatically on pointer down
          if (eventName === 'pointerdown') {
            event.target.setPointerCapture(event.pointerId)
          } else if (eventName === 'pointerup') {
            event.target.releasePointerCapture(event.pointerId)
          }

          worker.postMessage({
            type: 'dom_events',
            payload: {
              eventName,
              deltaX: event.deltaX,
              deltaY: event.deltaY,
              pointerId: event.pointerId,
              pointerType: event.pointerType,
              button: event.button,
              buttons: event.buttons,
              altKey: event.altKey,
              ctrlKey: event.ctrlKey,
              metaKey: event.metaKey,
              shiftKey: event.shiftKey,
              movementX: event.movementX,
              movementY: event.movementY,
              clientX: event.clientX,
              clientY: event.clientY,
              offsetX: event.offsetX,
              offsetY: event.offsetY,
              pageX: event.pageX,
              pageY: event.pageY,
              x: event.x,
              y: event.y,
            },
          })
        },
        { passive }
      )
    })

    const handleResize = () => {
      worker.postMessage({
        type: 'resize',
        payload: {
          width: currentEventSource.clientWidth,
          height: currentEventSource.clientHeight,
          top: currentEventSource.offsetTop,
          left: currentEventSource.offsetLeft,
        },
      })
    }

    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [worker])

  useEffect(() => {
    if (!worker) return
    if(!initialized) return

    worker.postMessage({ type: 'renderProps', payload: {
        renderProps,
      },
    })
  }, [worker, renderProps])


  useEffect(() => {
    if (!worker) return
    worker.postMessage({ type: 'props', payload: transformProps() })
  }, [worker, props])

  return shouldFallback ? (
    <CanvasImpl id={id} className={className} style={style} {...props}>
      {fallback}
    </CanvasImpl>
  ) : (
    <canvas
      id={id}
      className={className}
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', display: 'block', ...style }}
      ref={canvasRef}
    />
  )
}
