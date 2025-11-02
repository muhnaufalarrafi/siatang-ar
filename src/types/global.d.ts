declare module "three/examples/jsm/loaders/GLTFLoader.js" {
  import { Loader, LoadingManager, Group, AnimationClip } from "three";
  export interface GLTF { scene: Group; animations: AnimationClip[]; }
  export class GLTFLoader extends Loader {
    constructor(manager?: LoadingManager);
    load(
      url: string,
      onLoad: (gltf: GLTF) => void,
      onProgress?: (e: ProgressEvent<EventTarget>) => void,
      onError?: (e: unknown) => void
    ): void;
  }
}
declare module "three/examples/jsm/webxr/ARButton.js" {
  import { WebGLRenderer } from "three";
  export class ARButton {
    static createButton(renderer: WebGLRenderer, options?: XRSessionInit): HTMLButtonElement;
  }
}
