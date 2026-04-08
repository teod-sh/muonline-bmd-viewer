declare module 'three/webgpu' {
  import WebGPURendererClass from 'three/src/renderers/webgpu/WebGPURenderer.js';

  export const WebGPURenderer: typeof WebGPURendererClass;
}
