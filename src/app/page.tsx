"use client";

import React, { useEffect, useRef, useCallback, RefObject, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { ARButton } from "three/examples/jsm/webxr/ARButton.js";

// --- URL Konfigurasi (Tidak berubah) ---
const MODEL_SCENE_SATU_URL = "/siatangwave.glb";
const SOUND_SCENE_SATU_URL = "/scene1.mp3";
const MODEL_SCENE_DUA_URL = "/siatang-opt.glb";
const SOUND_SCENE_DUA_URL = "/scene2.mp3";
const OPTION_1_URL = "https.www.google.com";
const OPTION_2_URL = "https.www.bing.com";

// --- Konstanta Gestur (Tidak berubah) ---
const GESTURE_CONSTANTS = {
  ROTATION_SENSITIVITY: 0.01,
  PAN_SENSITIVITY: 0.01,
  SCALE_SENSITIVITY: 0.002,
  MIN_SCALE: 0.1,
  MAX_SCALE: 3.0,
  TAP_THRESHOLD: 10, 
};

// --- Definisi Tipe (Tidak berubah) ---
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

// --- FUNGSI: createTextPlane (Tidak berubah) ---
function createTextPlane(text: string, width = 1.5, height = 0.75): THREE.Mesh {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return new THREE.Mesh(); 

  const canvasWidth = 256;
  const canvasHeight = 128;
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;

  context.fillStyle = 'rgba(0, 50, 100, 0.7)';
  context.beginPath();
  context.roundRect(0, 0, canvasWidth, canvasHeight, [20]); 
  context.fill();
  
  context.strokeStyle = 'rgba(100, 200, 255, 1)';
  context.lineWidth = 10;
  context.beginPath();
  context.roundRect(5, 5, canvasWidth - 10, canvasHeight - 10, [15]);
  context.stroke();

  context.fillStyle = 'white';
  context.font = 'bold 36px Arial';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, canvasWidth / 2, canvasHeight / 2);

  const texture = new THREE.CanvasTexture(canvas);
  const geometry = new THREE.PlaneGeometry(width, height);
  const material = new THREE.MeshBasicMaterial({ 
    map: texture, 
    transparent: true, 
    side: THREE.DoubleSide
  });
  
  const plane = new THREE.Mesh(geometry, material);
  return plane;
}


// --- Hook: useARGestures (Tidak berubah) ---
const useARGestures = (
  stateRef: RefObject<ThreeState>,
  containerRef: RefObject<HTMLDivElement | null>
) => {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let lastX = 0, rotating = false, lastPinch = 0, lastY = 0, panning = false;
    let tapStartX = 0, tapStartY = 0, isDragging = false;

    const pinchDist = (a: Touch, b: Touch) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

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
        
        if (state && state.camera && state.raycaster && state.pointer && state.interactiveObjects) {
          state.pointer.x = (tapStartX / window.innerWidth) * 2 - 1;
          state.pointer.y = -(tapStartY / window.innerHeight) * 2 + 1;
          state.raycaster.setFromCamera(state.pointer, state.camera);
          
          const intersects = state.raycaster.intersectObjects(state.interactiveObjects);

          if (intersects.length > 0) {
            const firstIntersect = intersects[0].object;
            if (firstIntersect.userData.URL) {
              console.log("Membuka URL:", firstIntersect.userData.URL);
              window.open(firstIntersect.userData.URL, '_blank'); 
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


/**
 * Hook utama untuk AR
 * MODIFIKASI: Trigger diubah ke TIMER 5 DETIK
 */
const useAREffect = (
  containerRef: RefObject<HTMLDivElement | null>,
  setArButton: (button: HTMLButtonElement) => void 
) => {
  const stateRef = useRef<ThreeState>({});
  const modelInitialized = useRef(false);
  const sceneStateRef = useRef<'scene1' | 'scene2'>('scene1');

  useARGestures(stateRef, containerRef);

  const cleanup = useCallback(() => {
    const { renderer, scene } = stateRef.current;
    if (!renderer || !scene) return;
    console.log("Cleaning up Three.js scene..."); // Akan ditangkap
    renderer.setAnimationLoop(null);
    scene.traverse(object => {
      if (object instanceof THREE.Mesh) {
        object.geometry?.dispose();
        if (Array.isArray(object.material)) {
          object.material.forEach(material => material.dispose());
        } else {
          object.material?.dispose();
        }
      }
    });
    renderer.dispose();
    const mount = containerRef.current;
    if (mount && mount.contains(renderer.domElement)) {
      mount.removeChild(renderer.domElement);
    }
    stateRef.current = {};
    modelInitialized.current = false;
    sceneStateRef.current = 'scene1';
  }, [containerRef]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

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
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.xr.enabled = true;
    container.appendChild(renderer.domElement);
    scene.add(camera);
    
    stateRef.current = { 
        renderer, scene, camera, clock, listener, 
        raycaster, pointer, interactiveObjects
    };

    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.5));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(0.5, 1, 0.5);
    scene.add(dirLight);

    const arButton = ARButton.createButton(renderer, {
      optionalFeatures: ["dom-overlay"],
      domOverlay: { root: container },
    });
    arButton.style.display = 'none'; 
    container.appendChild(arButton);
    setArButton(arButton); 

    const handleResize = () => {
        const { camera: cam, renderer: rend } = stateRef.current;
        if (!cam || !rend) return;
        cam.aspect = window.innerWidth / window.innerHeight;
        cam.updateProjectionMatrix();
        rend.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    const cleanupCurrentModel = () => {
        const state = stateRef.current;
        if (!state.mainGroup) return;
        if (state.model) {
            console.log("Cleaning up current model..."); // Akan ditangkap
            state.mainGroup.remove(state.model);
            state.model.traverse(object => {
                if (object instanceof THREE.Mesh) {
                    object.geometry?.dispose();
                    if (Array.isArray(object.material)) {
                        object.material.forEach(material => material.dispose());
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

    const loadScene2 = () => {
        const state = stateRef.current;
        if (!state.mainGroup || !state.listener || !state.camera || !state.interactiveObjects) {
            console.error("Gagal memuat Scene 2: State belum siap."); // Akan ditangkap
            return;
        }
        
        console.log("Memuat Scene 2..."); // Akan ditangkap
        sceneStateRef.current = 'scene2';

        cleanupCurrentModel();

        new GLTFLoader().load(
            MODEL_SCENE_DUA_URL,
            (gltf) => {
                console.log("Model Scene 2 BERHASIL dimuat!"); // Akan ditangkap
                const model = gltf.scene;
                model.rotation.y = -Math.PI / 2;
                state.mainGroup?.add(model);
                state.model = model;
                
                if (gltf.animations?.length) {
                    const mixer = new THREE.AnimationMixer(model);
                    // Biarkan animasi scene 2 berulang (loop)
                    mixer.clipAction(gltf.animations[0]).play(); 
                    state.mixer = mixer;
                }
            },
            undefined,
            (error) => {
                console.error("!!! GAGAL MEMUAT MODEL SCENE 2:", error); 
                console.error("Pastikan file '" + MODEL_SCENE_DUA_URL + "' ada di folder /public");
            }
        );

        if (state.listener) {
            const sound = new THREE.Audio(state.listener);
            const audioLoader = new THREE.AudioLoader();
            audioLoader.load(
                SOUND_SCENE_DUA_URL, 
                function(buffer) {
                    console.log("Suara Scene 2 BERHASIL dimuat!"); // Akan ditangkap
                    sound.setBuffer(buffer);
                    sound.setLoop(false);
                    sound.setVolume(0.5);
                    sound.play();
                }, 
                undefined, 
                (error) => {
                    console.error("!!! GAGAL MEMUAT SUARA SCENE 2:", error);
                    console.error("Pastikan file '" + SOUND_SCENE_DUA_URL + "' ada di folder /public");
                }
            );
        }

        const plane1 = createTextPlane("Opsi 1");
        plane1.position.set(1.5, 4.0, 0);
        plane1.userData = { URL: OPTION_1_URL };
        
        const plane2 = createTextPlane("Opsi 2");
        plane2.position.set(-1.5, 4.0, 0);
        plane2.userData = { URL: OPTION_2_URL };
        
        state.mainGroup?.add(plane1); 
        state.mainGroup?.add(plane2);
        state.interactiveObjects?.push(plane1, plane2);
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

        new GLTFLoader().load(
          MODEL_SCENE_SATU_URL,
          (gltf) => {
            console.log("Model Scene 1 dimuat!"); // Akan ditangkap
            const model = gltf.scene;
            model.rotation.y = -Math.PI / 2;
            mainGroup.add(model);
            state.model = model;
            
            // Putar Suara Scene 1 (tapi jangan jadikan trigger)
            if (state.listener) {
              const sound = new THREE.Audio(state.listener);
              const audioLoader = new THREE.AudioLoader();
              audioLoader.load(
                  SOUND_SCENE_SATU_URL, 
                  function(buffer) {
                    console.log("Suara Scene 1 BERHASIL dimuat!"); // Akan ditangkap
                    sound.setBuffer(buffer);
                    sound.setLoop(false);
                    sound.setVolume(0.5);
                    sound.play();
                    
                    // --- DIHAPUS: sound.onEnded ---
                    // sound.onEnded = () => { ... };
                  }, 
                  undefined, 
                  (error) => {
                    console.error("!!! GAGAL MEMUAT SUARA SCENE 1:", error); // Akan ditangkap
                  }
              );
            }

            // --- DIUBAH: Setup Animasi (tanpa trigger) ---
            if (gltf.animations?.length) {
              const mixer = new THREE.AnimationMixer(model);
              const action = mixer.clipAction(gltf.animations[0]);
              
              // Biarkan animasi berputar normal (atau loop, tidak masalah)
              action.play();
              state.mixer = mixer;

              // --- DIHAPUS: mixer.addEventListener('finished', ...) ---
              // Trigger dipindahkan ke timer

            } else {
                // FALLBACK: Jika model Scene 1 tidak punya animasi
                console.error("Model Scene 1 tidak punya animasi!");
            }

            // --- BARU: TRIGGER TIMER 5 DETIK ---
            // Kita tidak bisa menunggu audio 20 detik (Context Lost)
            // Kita tidak bisa menunggu animasi (mungkin juga 20 detik)
            // Kita paksa pindah scene setelah 5 detik.
            console.log("SETTING TIMER: Pindah ke Scene 2 dalam 5 detik...");
            setTimeout(() => {
                if (sceneStateRef.current === 'scene1') {
                    console.log("TIMER 5 DETIK HABIS. Memulai Scene 2.");
                    loadScene2();
                }
            }, 5000); // 5000 milidetik = 5 detik
            // ------------------------------------

          },
          undefined,
          (error) => {
            console.error("!!! GAGAL MEMUAT MODEL SCENE 1:", error); // Akan ditangkap
          }
        );
      }
      
      const dt = state.clock.getDelta();
      state.mixer?.update(dt);
      state.renderer.render(state.scene, state.camera);
    };
    
    // --- DIUBAH: Menambahkan listener untuk Context Lost ---
    // Ini tidak akan *memperbaiki* masalah, tapi akan memberi tahu kita di log
    // saat masalah itu terjadi.
    renderer.domElement.addEventListener('webglcontextlost', (event) => {
        console.error("!!! EVENT: webglcontextlost TERJADI!", event);
        event.preventDefault();
        // Di aplikasi nyata, kita akan mencoba me-restore context di sini
        // tapi untuk sekarang, kita hanya log saja.
    }, false);
    // ---------------------------------------------------
    
    renderer.setAnimationLoop(animate);

    return () => {
      window.removeEventListener('resize', handleResize);
      cleanup();
    };
  }, [containerRef, cleanup, setArButton]); 
};


// --- BARU: Komponen UI Pengganti ---
const ARUserInterface = ({ arButton, isSessionActive }: { arButton: HTMLButtonElement | null, isSessionActive: boolean }) => {
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

// --- BARU: Komponen On-Screen Debug Console ---
const OnScreenDebug = ({ messages }: { messages: string[] }) => {
  return (
    <div 
      className="absolute bottom-0 left-0 right-0 z-50 p-2 overflow-y-auto bg-black/60 text-white font-mono text-xs"
      style={{ maxHeight: '30vh', pointerEvents: 'none' }}
    >
      <p className="font-bold border-b border-gray-500 mb-1">[DEBUG CONSOLE]</p>
      {messages.map((msg, index) => (
        <div key={index} className={msg.startsWith('ERROR') ? 'text-red-400' : 'text-green-300'}>
          {'>'} {msg}
        </div>
      ))}
    </div>
  );
};


/**
 * Komponen Halaman Utama (Page)
 * (Tidak berubah)
 */
export default function Page() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [arButton, setArButton] = useState<HTMLButtonElement | null>(null);
  const [isSessionActive, setIsSessionActive] = useState(false);
  
  const [debugMessages, setDebugMessages] = useState<string[]>([]);

  useAREffect(mountRef, setArButton);

  useEffect(() => {
    if (!arButton) return; 

    const onSessionStart = () => setIsSessionActive(true);
    const onSessionEnd = () => setIsSessionActive(false);

    arButton.addEventListener('sessionstart', onSessionStart);
    arButton.addEventListener('sessionend', onSessionEnd);

    return () => {
      arButton.removeEventListener('sessionstart', onSessionStart);
      arButton.removeEventListener('sessionend', onSessionEnd);
    };
  }, [arButton]); 

  // --- Efek "pembajak" console (Tidak berubah) ---
  useEffect(() => {
    const originalLog = console.log;
    const originalError = console.error;

    const formatArgs = (args: unknown[]): string => {
      return args.map(arg => {
        if (typeof arg === 'string') return arg;
        if (arg instanceof Error) return arg.message;
        try {
          return JSON.stringify(arg, (key, value) => 
            (value instanceof Error) ? value.message : value, 
          2);
        } catch { 
          return '[Circular Object]';
        }
      }).join(' ');
    };

    console.log = (...args: unknown[]) => {
      originalLog.apply(console, args); 
      const message = formatArgs(args);
      setDebugMessages(prev => [...prev.slice(-20), message]); 
    };

    console.error = (...args: unknown[]) => {
      originalError.apply(console, args); 
      const message = formatArgs(args);
      setDebugMessages(prev => [...prev.slice(-20), `ERROR: ${message}`]); 
    };

    return () => {
      console.log = originalLog;
      console.error = originalError;
    };
  }, []); 

  return (
    <div className="w-screen h-screen relative overflow-hidden">
      <div ref={mountRef} className="w-full h-full" />
      
      {isSessionActive && (
        <header className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-4 py-3 bg-black/40 backdrop-blur text-white">
          <div className="font-bold">AR Atang</div>
          <div className="text-xs opacity-80 text-right">Tap: Opsi · 1-finger: rotate · Pinch: scale</div>
        </header>
      )}
      
      <ARUserInterface 
        arButton={arButton}
        isSessionActive={isSessionActive}
      />

      <OnScreenDebug messages={debugMessages} />

    </div>
  );
}

