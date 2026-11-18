import {
  connectMessage,
  createConnect,
  createViewport,
  definePrimitive,
  live,
  type ConnectDraft,
  type ConnectMessage,
  type ConnectReason,
  type Viewport,
} from "@ui-sdk/core";

/** The canvas's options. Every function is read at call time, so a caller can
 * pass a fresh closure on each render. */
export type CanvasPrimitiveOptions = {
  minZoom?: number;
  maxZoom?: number;
  /** One lattice step in canvas units, for the painted grid. */
  gridStep?: number;
  zoomMessage?: (zoom: number) => string;
  canConnect?: (from: string, to: string) => boolean;
  onConnect?: (from: string, to: string, details: { reason: ConnectReason; event?: Event }) => boolean;
  portLabel?: (key: string) => string;
  connectMessage?: (message: ConnectMessage, label: (key: string) => string) => string;
  /** Turns a client point into canvas units. */
  point?: (clientX: number, clientY: number) => { x: number; y: number };
  /** The snap distance in screen pixels at the current zoom. */
  radius?: (zoom: number) => number;
};

/** The wheel zooms at the pointer, the `studio-canvas` spec's gesture, where
 * the SDK's own `wheel` pans and zooms only with Ctrl or ⌘. */
const WHEEL_ZOOM_RATE = 0.01;

/**
 * The studio canvas's pan, zoom and connection behavior. `root` is the frame
 * that clips and takes the gestures, `world` the `<svg>` the transform moves,
 * `port` a connect end (`<stepId>:out` or `<stepId>:in`), and `draft` the line
 * a connection draws while it is under way.
 */
export const canvasPrimitive = definePrimitive({
  name: "studio-canvas",
  options: {
    minZoom: "number",
    maxZoom: "number",
    gridStep: "number",
    zoomMessage: "value",
    canConnect: "value",
    onConnect: "value",
    portLabel: "value",
    connectMessage: "value",
    point: "value",
    radius: "value",
  },
  state: (_options: CanvasPrimitiveOptions) => ({
    viewport: { x: 0, y: 0, zoom: 1 } as Viewport,
    connecting: null as ConnectDraft | null,
  }),
  live: ["viewport", "connecting"],
  api: (context) => {
    const viewport = createViewport(context, {
      key: "viewport",
      surface: () => context.element("root"),
      minZoom: () => context.options().minZoom ?? 0.1,
      maxZoom: () => context.options().maxZoom ?? 4,
      message: (zoom) => context.options().zoomMessage?.(zoom) ?? `Zoom ${Math.round(zoom * 100)}%`,
    });
    const connect = createConnect(context, {
      slot: "port",
      draft: "connecting",
      canConnect: (from, to) => context.options().canConnect?.(from, to) ?? true,
      connect: (from, to, details) => context.options().onConnect?.(from, to, details) ?? false,
      point: (x, y) => context.options().point?.(x, y) ?? viewport.toCanvas(x, y),
      radius: () => context.options().radius?.(viewport.get().zoom) ?? 28,
      label: (key) => context.options().portLabel?.(key) ?? key,
      message: (message, label) => (context.options().connectMessage ?? connectMessage)(message, label),
    });
    /** A press on the frame or the bare `<svg>` is a press on empty canvas. */
    const isBackground = (target: EventTarget | null) =>
      target !== null && (target === context.element("root") || target === context.element("world"));
    const gridStep = () => context.options().gridStep ?? 20;
    return { viewport, connect, isBackground, gridStep };
  },
  slots: (slot) => ({
    root: slot({
      // The painted grid lives on the frame, which no transform moves, so it
      // follows the viewport through two custom properties.
      live: live((state, { api }) => {
        const { x, y, zoom } = state.viewport;
        return {
          style: `--canvas-grid-size:${api.gridStep() * zoom}px;--canvas-grid-offset-x:${x}px;--canvas-grid-offset-y:${y}px`,
        };
      }),
      on: {
        pointerdown: (event, { api }) => {
          const e = event as PointerEvent;
          // Shift starts the marquee instead.
          if (e.shiftKey || !api.isBackground(e.target)) return;
          api.viewport.pointerdown(e);
        },
      },
      // React attaches `wheel` as passive, and a passive listener cannot stop
      // the page scrolling, so the wheel binds natively here.
      bind: (el, part) => {
        const onWheel = (event: WheelEvent) => {
          if ((event.target as Element).closest("[data-canvas-overlay]")) return;
          event.preventDefault();
          const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? el.clientHeight : 1;
          const delta = Math.max(-50, Math.min(50, event.deltaY * unit));
          part.api.viewport.zoomBy(Math.exp(-delta * WHEEL_ZOOM_RATE), { x: event.clientX, y: event.clientY }, { reason: "wheel", event });
        };
        el.addEventListener("wheel", onWheel, { passive: false });
        return () => el.removeEventListener("wheel", onWheel);
      },
    }),
    world: slot({
      live: live((state, { api }) => ({ style: api.viewport.style(state) })),
    }),
    port: slot<{ value: string }>({
      props: { value: "string" },
      on: {
        pointerdown: (event, { el, api, key }) => {
          if (el && key.endsWith(":out")) api.connect.pointerdown(event as PointerEvent, key, el);
        },
      },
    }),
    draft: slot<{}, { draft: ConnectDraft | null }>({
      present: (state) => state.connecting !== null,
      state: (state) => ({ draft: state.connecting }),
    }),
  }),
});
