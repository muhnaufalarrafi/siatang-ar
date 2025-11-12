"use client";

import React, { useEffect, useRef, useCallback, RefObject, useState } from "react";
import Link from "next/link";
import * as THREE from "three";
import { SRGBColorSpace } from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { ARButton } from "three/examples/jsm/webxr/ARButton.js";

// --- URL Konfigurasi ---
const MODEL_SCENE_SATU_URL = "/siatangwave.glb";
const SOUND_SCENE_SATU_URL = "/scene1.mp3";
const MODEL_SCENE_DUA_URL = "/siatang-opt.glb";
const SOUND_SCENE_DUA_URL = "/scene2.mp3";
const OPTION_1_URL =
  "https://www.canva.com/design/DAG3z9jxlxQ/28dhWuus3M3zYuts6y7PMw/view?utm_content=DAG3z9jxlxQ&utm_campaign=designshare&utm_medium=link2&utm_source=uniquelinks&utlId=ha7c9efb3a3#38";
const OPTION_2_URL =
  "https://www.canva.com/design/DAG3z9jxlxQ/28dhWuus3M3zYuts6y7PMw/view?utm_content=DAG3z9jxlxQ&utm_campaign=designshare&utm_medium=link2&utm_source=uniquelinks&utlId=ha7c9efb3a3#14";

// --- Konstanta Gestur ---
const GESTURE_CONSTANTS = {
  ROTATION_SENSITIVITY: 0.01,
  PAN_SENSITIVITY: 0.01,
  SCALE_SENSITIVITY: 0.002,
  MIN_SCALE: 0.1,
  MAX_SCALE: 3.0,
  TAP_THRESHOLD: 10,
};

// --- Model Cache Manager ---
interface CachedAsset {
  gltf?: GLTF;
  audio?: AudioBuffer;
  timestamp: number;
}

class AssetCacheManager {
  private cache: Map<string, CachedAsset> = new Map();
  private audioLoader: THREE.AudioLoader;
  private gltfLoader: GLTFLoader;
  private readonly CACHE_DURATION = 30 * 60 * 1000; // 30 menit

  constructor() {
    this.audioLoader = new THREE.AudioLoader();
    this.gltfLoader = new GLTFLoader();
  }

  isExpired(timestamp: number): boolean {
    return Date.now() - timestamp > this.CACHE_DURATION;
  }

  async loadGLTF(url: string): Promise<GLTF> {
    const cached = this.cache.get(url);
    if (cached && !this.isExpired(cached.timestamp) && cached.gltf) {
      console.log(`[CACHE] Model dari cache: ${url}`);
      return cached.gltf;
    }

    console.log(`[LOAD] Memuat model: ${url}`);
    return new Promise((resolve, reject) => {
      this.gltfLoader.load(
        url,
        (gltf: GLTF) => {
          this.cache.set(url, {
            gltf,
            timestamp: Date.now(),
          });
          resolve(gltf);
        },
        (progress: ProgressEvent) => {
          if (progress.lengthComputable) {
            const percentComplete = (progress.loaded / progress.total) * 100;
            console.log(`[PROGRESS] ${url}: ${percentComplete.toFixed(1)}%`);
          }
        },
        (error: unknown) => {
          reject(error);
        }
      );
    });
  }

  async loadAudio(url: string): Promise<AudioBuffer> {
    const cached = this.cache.get(url);
    if (cached && !this.isExpired(cached.timestamp) && cached.audio) {
      console.log(`[CACHE] Audio dari cache: ${url}`);
      return cached.audio;
    }

    console.log(`[LOAD] Memuat audio: ${url}`);
    return new Promise((resolve, reject) => {
      this.audioLoader.load(
        url,
        (buffer: AudioBuffer) => {
          this.cache.set(url, {
            audio: buffer,
            timestamp: Date.now(),
          });
          resolve(buffer);
        },
        undefined,
        (error: unknown) => {
          reject(error);
        }
      );
    });
  }

  clearCache(): void {
    this.cache.forEach((value, key) => {
      if (this.isExpired(value.timestamp)) {
        this.cache.delete(key);
      }
    });
  }

  clearAll(): void {
    this.cache.clear();
  }
}

// --- Singleton Cache Manager ---
const cacheManager = new AssetCacheManager();

// --- Preload Manager ---
class PreloadManager {
  private isPreloading = false;
  private preloadPromise: Promise<void> | undefined;

  async preloadAllAssets(): Promise<void> {
    if (this.isPreloading && this.preloadPromise) {
      return this.preloadPromise;
    }

    this.isPreloading = true;
    this.preloadPromise = this.performPreload();

    try {
      await this.preloadPromise;
      console.log("[PRELOAD] Semua aset berhasil di-preload!");
    } catch (error) {
      console.error("[PRELOAD ERROR]", error);
    } finally {
      this.isPreloading = false;
    }
  }

  private async performPreload(): Promise<void> {
    const startTime = performance.now();
    console.log("[PRELOAD] Memulai preload aset...");

    try {
      // Preload Scene 1
      await cacheManager.loadGLTF(MODEL_SCENE_SATU_URL);
      await cacheManager.loadAudio(SOUND_SCENE_SATU_URL);

      // Preload Scene 2
      await cacheManager.loadGLTF(MODEL_SCENE_DUA_URL);
      await cacheManager.loadAudio(SOUND_SCENE_DUA_URL);

      const endTime = performance.now();
      const duration = ((endTime - startTime) / 1000).toFixed(2);
      console.log(`[PRELOAD] Preload selesai dalam ${duration}s`);
    } catch (error) {
      console.error("[PRELOAD] Fatal error:", error);
      throw error;
    }
  }
}

const preloadManager = new PreloadManager();

// --- Definisi Tipe ---
interface ThreeState {
  renderer?: THREE.WebGLRenderer;
  scene?: THREE.Scene;
  camera?: THREE.PerspectiveCamera;
  clock?: THREE.Clock;
  model?: THREE.Group;
  mixer?: THREE.AnimationMixer;
  listener?: THREE.AudioListener;
  mainGroup?: THREE.Group;
  raycaster?: THREE.Raycaster;
  pointer?: THREE.Vector2;
  interactiveObjects?: THREE.Mesh[];
}

// --- FUNGSI: createTextPlane ---
function createTextPlane(text: string, width = 1.5, height = 0.75): THREE.Mesh {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return new THREE.Mesh();

  const canvasWidth = 512;
  const canvasHeight = 256;
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;

  context.fillStyle = "rgba(0, 50, 100, 0.85)";
  const roundRect = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fill();
  };
  roundRect(context, 0, 0, canvasWidth, canvasHeight, 24);

  context.strokeStyle = "rgba(100, 200, 255, 1)";
  context.lineWidth = 8;
  context.strokeRect(6, 6, canvasWidth - 12, canvasHeight - 12);

  context.fillStyle = "white";
  context.font = "bold 42px Arial";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, canvasWidth / 2, canvasHeight / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  const geometry = new THREE.PlaneGeometry(width, height);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    side: THREE.DoubleSide,
  });

  return new THREE.Mesh(geometry, material);
}

// --- Hook: useARGestures ---
const useARGestures = (
  stateRef: RefObject<ThreeState>,
  containerRef: RefObject<HTMLDivElement | null>
) => {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let lastX = 0,
      rotating = false,
      lastPinch = 0,
      lastY = 0,
      panning = false;
    let tapStartX = 0,
      tapStartY = 0,
      isDragging = false;

    const pinchDist = (a: Touch, b: Touch) =>
      Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

    const onStart = (e: TouchEvent) => {
      isDragging = false;
      const model = stateRef.current?.model;
      if (!model) return;

      if (e.touches.length === 1) {
        rotating = true;
        lastX = e.touches[0].clientX;
        tapStartX = e.touches[0].clientX;
        tapStartY = e.touches[0].clientY;
      } else if (e.touches.length === 2) {
        rotating = false;
        isDragging = true;
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        if (Math.abs(dx) > Math.abs(dy)) {
          panning = false;
          lastPinch = pinchDist(e.touches[0], e.touches[1]);
        } else {
          panning = true;
          lastY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        }
      }
    };

    const onMove = (e: TouchEvent) => {
      const model = stateRef.current?.model;
      if (!model) return;

      if (!isDragging && e.touches.length === 1) {
        const dx = e.touches[0].clientX - tapStartX;
        const dy = e.touches[0].clientY - tapStartY;
        if (Math.hypot(dx, dy) > GESTURE_CONSTANTS.TAP_THRESHOLD) {
          isDragging = true;
        }
      }

      if (e.touches.length === 1 && rotating && isDragging) {
        const dx = e.touches[0].clientX - lastX;
        lastX = e.touches[0].clientX;
        model.rotation.y -= dx * GESTURE_CONSTANTS.ROTATION_SENSITIVITY;
      } else if (e.touches.length === 2 && isDragging) {
        const mainGroup = stateRef.current?.mainGroup;
        if (!mainGroup) return;

        if (panning) {
          const y = (e.touches[0].clientY + e.touches[1].clientY) / 2;
          const dy = y - lastY;
          lastY = y;
          mainGroup.position.z += dy * GESTURE_CONSTANTS.PAN_SENSITIVITY;
        } else {
          const d = pinchDist(e.touches[0], e.touches[1]);
          const scaleChange = (d - lastPinch) * GESTURE_CONSTANTS.SCALE_SENSITIVITY;
          const newScale = THREE.MathUtils.clamp(
            mainGroup.scale.x + scaleChange,
            GESTURE_CONSTANTS.MIN_SCALE,
            GESTURE_CONSTANTS.MAX_SCALE
          );
          lastPinch = d;
          mainGroup.scale.set(newScale, newScale, newScale);
        }
      }
    };

    const onEnd = (e: TouchEvent) => {
      if (!isDragging && e.changedTouches.length === 1) {
        const state = stateRef.current;
        if (
          state &&
          state.camera &&
          state.raycaster &&
          state.pointer &&
          state.interactiveObjects
        ) {
          state.pointer.x = (tapStartX / window.innerWidth) * 2 - 1;
          state.pointer.y = -(tapStartY / window.innerHeight) * 2 + 1;
          state.raycaster.setFromCamera(state.pointer, state.camera);

          const intersects = state.raycaster.intersectObjects(state.interactiveObjects);
          if (intersects.length > 0) {
            const obj = intersects[0].object;
            if (obj.userData.URL) {
              window.open(obj.userData.URL, "_blank");
            }
          }
        }
      }
      rotating = false;
      panning = false;
      isDragging = false;
    };

    container.addEventListener("touchstart", onStart, { passive: true });
    container.addEventListener("touchmove", onMove, { passive: true });
    container.addEventListener("touchend", onEnd);

    return () => {
      container.removeEventListener("touchstart", onStart);
      container.removeEventListener("touchmove", onMove);
      container.removeEventListener("touchend", onEnd);
    };
  }, [stateRef, containerRef]);
};

// --- Hook: useAREffect ---
const useAREffect = (
  containerRef: RefObject<HTMLDivElement | null>,
  setArButton: (button: HTMLButtonElement | null) => void
): { isUnsupported: boolean; stateRef: RefObject<ThreeState> } => {
  const stateRef = useRef<ThreeState>({});
  const modelInitialized = useRef(false);
  const sceneStateRef = useRef<"scene1" | "scene2">("scene1");
  const loadingRef = useRef<{ [key: string]: boolean }>({});
  const [isUnsupported, setIsUnsupported] = useState(false);

  useARGestures(stateRef, containerRef);

  const stopAllAudio = useCallback(() => {
    console.log("[AUDIO] Stop Audio Context dihindari untuk reusability.");
  }, []);

  const stopAllAnimations = useCallback(() => {
    const state = stateRef.current;
    if (state.mixer) {
      state.mixer.stopAllAction();
      state.mixer = undefined;
      console.log("[ANIMATION] Semua animasi dihentikan");
    }
  }, []);

  const init = useCallback(async () => {
    if (stateRef.current.renderer) {
      console.warn("[INIT] Inisialisasi sudah berjalan.");
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    if (!navigator.xr) {
      console.warn("[AR SUPPORT] WebXR API tidak tersedia.");
      setIsUnsupported(true);
      return;
    }

    try {
      const supported = await navigator.xr.isSessionSupported("immersive-ar");
      if (!supported) {
        console.warn("[AR SUPPORT] immersive-ar tidak didukung.");
        setIsUnsupported(true);
        return;
      }
    } catch (error) {
      console.error("[AR SUPPORT ERROR]", error);
      setIsUnsupported(true);
      return;
    }

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);
    const clock = new THREE.Clock();
    const listener = new THREE.AudioListener();
    camera.add(listener);
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const interactiveObjects: THREE.Mesh[] = [];

    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.xr.enabled = true;
    container.appendChild(renderer.domElement);
    scene.add(camera);

    stateRef.current = {
      renderer,
      scene,
      camera,
      clock,
      listener,
      raycaster,
      pointer,
      interactiveObjects,
    };

    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.5));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(0.5, 1, 0.5);
    scene.add(dirLight);

    const arButton = ARButton.createButton(renderer, {
      optionalFeatures: ["dom-overlay"],
      domOverlay: { root: container },
    }) as HTMLButtonElement;
    arButton.style.display = "none";
    container.appendChild(arButton);
    setArButton(arButton);

    const handleResize = () => {
      const { camera: cam, renderer: rend } = stateRef.current;
      if (!cam || !rend) return;
      cam.aspect = window.innerWidth / window.innerHeight;
      cam.updateProjectionMatrix();
      rend.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", handleResize);

    const cleanupCurrentModel = () => {
      const state = stateRef.current;
      if (!state.mainGroup) return;
      if (state.model) {
        state.mainGroup.remove(state.model);
        state.model.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            object.geometry?.dispose();
            if (Array.isArray(object.material)) {
              object.material.forEach((mat) => mat.dispose());
            } else {
              object.material?.dispose();
            }
          }
        });
        state.model = undefined;
      }
      if (state.mixer) {
        state.mixer.stopAllAction();
        state.mixer = undefined;
      }
      state.interactiveObjects?.splice(0, state.interactiveObjects.length);
    };

    const playAudioWithCache = async (audioUrl: string, volume = 0.5): Promise<void> => {
      const state = stateRef.current;
      if (!state.listener) return;

      try {
        if (state.listener.context.state === "suspended") {
          await state.listener.context.resume();
          console.log("[AUDIO] Audio Context di-resume.");
        }

        const buffer = await cacheManager.loadAudio(audioUrl);
        const sound = new THREE.Audio(state.listener);
        sound.setBuffer(buffer);
        sound.setLoop(false);
        sound.setVolume(volume);
        sound.play();
        console.log(`[AUDIO] Bermain: ${audioUrl}`);
      } catch (error) {
        console.error(`[ERROR] Gagal memuat audio ${audioUrl}:`, error);
      }
    };

    const loadScene2 = async () => {
      if (loadingRef.current["scene2"]) return;

      const state = stateRef.current;
      if (!state.mainGroup || !state.listener || !state.camera || !state.interactiveObjects) {
        console.error("Gagal memuat Scene 2: State belum siap.");
        return;
      }

      loadingRef.current["scene2"] = true;
      sceneStateRef.current = "scene2";
      cleanupCurrentModel();

      try {
        const gltf = await cacheManager.loadGLTF(MODEL_SCENE_DUA_URL);
        const model = gltf.scene;
        model.rotation.y = -Math.PI / 2;
        state.mainGroup?.add(model);
        state.model = model;

        if (gltf.animations?.length) {
          const mixer = new THREE.AnimationMixer(model);
          mixer.clipAction(gltf.animations[0]).play();
          state.mixer = mixer;
        }

        await playAudioWithCache(SOUND_SCENE_DUA_URL, 0.5);

        const plane1 = createTextPlane("Denah");
        plane1.position.set(1.5, 4.0, 0);
        plane1.userData = { URL: OPTION_1_URL };

        const plane2 = createTextPlane("Rundown");
        plane2.position.set(-1.5, 4.0, 0);
        plane2.userData = { URL: OPTION_2_URL };

        state.mainGroup?.add(plane1, plane2);
        state.interactiveObjects?.push(plane1, plane2);
        console.log("[SUCCESS] Scene 2 berhasil dimuat!");
      } catch (error) {
        console.error("[ERROR] Gagal memuat Scene 2:", error);
      } finally {
        loadingRef.current["scene2"] = false;
      }
    };

    const animate = (_: number, frame?: XRFrame) => {
      const state = stateRef.current;
      if (!state.renderer || !state.scene || !state.camera || !state.clock) return;

      if (frame && !modelInitialized.current) {
        modelInitialized.current = true;

        const mainGroup = new THREE.Group();
        mainGroup.position.set(0, -1, -2.5);
        mainGroup.scale.set(0.3, 0.3, 0.3);
        state.camera?.add(mainGroup);
        state.mainGroup = mainGroup;

        cacheManager
          .loadGLTF(MODEL_SCENE_SATU_URL)
          .then((gltf) => {
            const model = gltf.scene;
            model.rotation.y = -Math.PI / 2;
            mainGroup.add(model);
            state.model = model;

            playAudioWithCache(SOUND_SCENE_SATU_URL, 0.5);

            if (gltf.animations?.length) {
              const mixer = new THREE.AnimationMixer(model);
              mixer.clipAction(gltf.animations[0]).play();
              state.mixer = mixer;
            }

            setTimeout(() => {
              if (sceneStateRef.current === "scene1") {
                loadScene2();
              }
            }, 5000);
          })
          .catch((error) => {
            console.error("[ERROR] Gagal memuat Model Scene 1:", error);
          });
      }

      const dt = state.clock.getDelta();
      state.mixer?.update(dt);
      state.renderer.render(state.scene, state.camera);
    };

    renderer.setAnimationLoop(animate);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [setArButton, containerRef]);

  const cleanup = useCallback(() => {
    const { renderer, scene } = stateRef.current;
    if (!renderer || !scene) return;
    console.log("[CLEANUP] Memulai cleanup Three.js scene...");

    renderer.setAnimationLoop(null);
    stopAllAnimations();
    stopAllAudio();

    scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry?.dispose();
        if (Array.isArray(object.material)) {
          object.material.forEach((mat) => mat.dispose());
        } else {
          object.material?.dispose();
        }
      }
    });

    renderer.dispose();
    const mount = containerRef.current;
    if (mount && renderer.domElement && mount.contains(renderer.domElement)) {
      mount.removeChild(renderer.domElement);
    }

    stateRef.current = {};
    modelInitialized.current = false;
    sceneStateRef.current = "scene1";
    console.log("[CLEANUP] Cleanup selesai");
  }, [containerRef, stopAllAudio, stopAllAnimations]);

  useEffect(() => {
    let mounted = true;
    if (mounted) {
      init();
    }

    return () => {
      mounted = false;
      cleanup();
      setArButton(null);
    };
  }, [containerRef, cleanup, setArButton, init]);

  return { isUnsupported, stateRef };
};

// --- Komponen UI ---
const ARUserInterface = ({
  arButton,
  isSessionActive,
}: {
  arButton: HTMLButtonElement | null;
  isSessionActive: boolean;
}) => {
  const startAR = () => {
    arButton?.click();
  };

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
      {!isSessionActive && (
        <button
          onClick={startAR}
          disabled={!arButton}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg font-bold text-lg shadow-lg disabled:bg-gray-400 pointer-events-auto"
        >
          {arButton ? "Mulai AR" : "Memuat..."}
        </button>
      )}
    </div>
  );
};

// --- Komponen Halaman Utama ---
export default function Page() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [arButton, setArButton] = useState<HTMLButtonElement | null>(null);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [isPreloaded, setIsPreloaded] = useState(false);
  const [preloadProgress, setPreloadProgress] = useState(0);
  const [showSkipButton, setShowSkipButton] = useState(false);

  const { isUnsupported, stateRef } = useAREffect(mountRef, setArButton);

  // Handle Skip Preload
  const handleSkipPreload = () => {
    console.log("[PRELOAD] Pengguna menekan Skip — langsung lanjut ke AR");
    setIsPreloaded(true);
    setShowSkipButton(false);
  };

  // Preload effect dengan skip
  useEffect(() => {
    console.log("[APP] Memulai preload aset pada page load...");

    const preloadTimer = setInterval(() => {
      setPreloadProgress((prev) => {
        if (prev < 90) return Math.min(90, prev + Math.random() * 30);
        return prev;
      });
    }, 300);

    const skipTimeout = setTimeout(() => {
      setShowSkipButton(true);
    }, 10000); // Tampilkan tombol skip setelah 10 detik

    const timeoutId = setTimeout(() => {
      console.warn("[APP] Preload timeout - melanjutkan dengan cache yang ada");
      clearInterval(preloadTimer);
      clearTimeout(skipTimeout);
      setPreloadProgress(100);
      setIsPreloaded(true);
    }, 120000); // 2 menit timeout

    preloadManager
      .preloadAllAssets()
      .then(() => {
        clearTimeout(timeoutId);
        clearTimeout(skipTimeout);
        clearInterval(preloadTimer);
        setPreloadProgress(100);
        setIsPreloaded(true);
        console.log("[APP] Preload selesai - App siap digunakan!");
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        clearTimeout(skipTimeout);
        clearInterval(preloadTimer);
        console.error("[APP] Preload gagal:", error);
        setPreloadProgress(100);
        setIsPreloaded(true);
      });

    return () => {
      clearInterval(preloadTimer);
      clearTimeout(timeoutId);
      clearTimeout(skipTimeout);
    };
  }, []);

  useEffect(() => {
    if (!arButton) return;

    const onSessionStart = () => {
      setIsSessionActive(true);
      const listener = stateRef.current?.listener;
      if (listener && listener.context.state !== 'running') {
        listener.context.resume().catch(e => console.error("Gagal resume AudioContext:", e));
      }
    };

    const onSessionEnd = () => {
      console.log("[SESSION] AR session berakhir - Menghentikan semua...");
      setIsSessionActive(false);
    };

    arButton.addEventListener("sessionstart", onSessionStart);
    arButton.addEventListener("sessionend", onSessionEnd);

    return () => {
      arButton.removeEventListener("sessionstart", onSessionStart);
      arButton.removeEventListener("sessionend", onSessionEnd);
    };
  }, [arButton, stateRef]);

  return (
    <div className="w-screen h-screen relative overflow-hidden">
      <div ref={mountRef} className="w-full h-full" />

      {/* Pesan perangkat tidak mendukung */}
      {isUnsupported && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/85 text-white text-center p-6">
          <div className="text-2xl font-bold mb-4">Perangkat Tidak Mendukung AR</div>
          <p className="text-sm text-gray-300 max-w-md">
            Maaf — perangkat atau browser Anda belum mendukung fitur Augmented Reality berbasis WebXR.
            <br />
            Untuk pengalaman AR, coba:
          </p>
          <ul className="text-sm text-gray-300 mt-3 list-disc list-inside max-w-md">
            <li>Gunakan <strong>Chrome di Android</strong> (versi terbaru).</li>
            <li>Atau gunakan <strong>Safari di iOS 17.2+</strong> (jika tersedia dukungan WebXR).</li>
            <li>Pastikan browser Anda diperbarui dan akses kamera diizinkan.</li>
          </ul>
          <div className="mt-6">
            <Link href="/" className="px-4 py-2 bg-gray-700 rounded-md text-white text-sm inline-block">
              Tutup
            </Link>
          </div>
        </div>
      )}

      {/* Loader preload dengan tombol skip */}
      {!isPreloaded && !isUnsupported && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/80 backdrop-blur">
          <div className="text-white text-center max-w-xs px-6">
            <div className="text-3xl font-bold mb-8">AR Atang</div>
            <div className="w-64 h-2 bg-gray-700 rounded-full overflow-hidden mb-4">
              <div
                className="h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${preloadProgress}%` }}
              />
            </div>
            <div className="text-sm text-gray-300 mb-6">
              Loading 3D Models... {Math.round(preloadProgress)}%
            </div>

            {showSkipButton && (
              <button
                onClick={handleSkipPreload}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm text-white transition"
              >
                Lewati & Mulai AR
              </button>
            )}

            <div className="text-xs text-gray-500 mt-4">
              File akan dimuat saat dibutuhkan
            </div>
          </div>
        </div>
      )}

      {isSessionActive && !isUnsupported && (
        <header className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-4 py-3 bg-black/40 backdrop-blur text-white">
          <div className="font-bold">AR Atang</div>
          <div className="text-xs opacity-80 text-right">Tap: Opsi · 1-finger: rotate · Pinch: scale</div>
        </header>
      )}

      {/* Tampilkan tombol AR bila preloaded dan perangkat mendukung */}
      {isPreloaded && !isUnsupported && <ARUserInterface arButton={arButton} isSessionActive={isSessionActive} />}
    </div>
  );
}
