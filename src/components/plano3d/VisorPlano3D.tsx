import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import FpsCounter from './FpsCounter';
import PanelCapas3D from './PanelCapas3D';
import styles from './VisorPlano3D.module.css';

// ── Modelo (LittlestTokyo — usa compresión Draco, requiere DRACOLoader) ──────
const MODEL_URL =
  'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/models/gltf/LittlestTokyo.glb';

// Fallback sin Draco (intercambiar si hay problemas con el decoder):
// const MODEL_URL =
//   'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/DamagedHelmet/glTF-Binary/DamagedHelmet.glb';

// Decoder Draco — CDN de Google, siempre disponible, sin instalar nada
const DRACO_DECODER_PATH = 'https://www.gstatic.com/draco/versioned/decoders/1.5.7/';

// ── Capas del modelo (S29 las mapeará a grupos reales del GLB) ───────────────
const LAYER_NAMES = [
  'Terreno',
  'Estructura',
  'Cerramientos',
  'Fachadas',
  'MEP',
  'Mobiliario',
] as const;

// ── Datos dummy del panel (S29 conecta la OT real seleccionada en el modelo) ─
const DUMMY_OT = {
  ot: 'OT-3D-DEMO',
  estado: 'En proceso',
  rubro: 'Estructura',
  responsable: 'Técnico Demo',
  nota:
    'Panel de prueba del spike S25. En S29 este panel mostrará la OT real\n' +
    'seleccionada al hacer clic en el marcador del modelo 3D.',
};

// ────────────────────────────────────────────────────────────────────────────

export default function VisorPlano3D() {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef  = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef  = useRef<OrbitControls | null>(null);
  const animFrameRef = useRef<number>(0);

  const layerGroupsRef = useRef<THREE.Object3D[][]>(
    LAYER_NAMES.map(() => [])
  );

  const [fps, setFps]                   = useState(0);
  const [loading, setLoading]           = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadError, setLoadError]       = useState<string | null>(null);
  const [layerVisible, setLayerVisible] = useState<boolean[]>(
    LAYER_NAMES.map(() => true)
  );
  const [showDetail, setShowDetail] = useState(false);

  const handleLayerToggle = useCallback((index: number, visible: boolean) => {
    setLayerVisible((prev) => {
      const next = [...prev];
      next[index] = visible;
      return next;
    });
    layerGroupsRef.current[index]?.forEach((obj) => {
      obj.visible = visible;
    });
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // ── Escena ────────────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x161921);

    // ── Cámara ────────────────────────────────────────────────────────────
    const camera = new THREE.PerspectiveCamera(
      60,
      container.clientWidth / container.clientHeight,
      0.01,
      2000
    );
    camera.position.set(10, 5, 10);

    // ── Renderer ──────────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // ── OrbitControls ─────────────────────────────────────────────────────
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance   = 0.5;
    controls.maxDistance   = 800;
    controlsRef.current = controls;

    // ── Luces ─────────────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dir = new THREE.DirectionalLight(0xffffff, 1.0);
    dir.position.set(10, 20, 10);
    scene.add(dir);

    // ── Marcador hardcodeado (esfera naranja) ─────────────────────────────
    const markerGeo = new THREE.SphereGeometry(0.3, 16, 16);
    const markerMat = new THREE.MeshStandardMaterial({
      color: 0xcc7a00,
      emissive: 0x552f00,
      emissiveIntensity: 0.5,
    });
    const marker = new THREE.Mesh(markerGeo, markerMat);
    marker.name = 'ot-marker';
    marker.position.set(0, 1.5, 0);
    scene.add(marker);

    // ── AnimationMixer ────────────────────────────────────────────────────
    let mixer: THREE.AnimationMixer | null = null;

    // ── Loaders — GLTFLoader + DRACOLoader ───────────────────────────────
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath(DRACO_DECODER_PATH);

    const loader = new GLTFLoader();
    loader.setDRACOLoader(dracoLoader);

    loader.load(
      MODEL_URL,
      (gltf) => {
        scene.add(gltf.scene);

        // Activar animaciones si el modelo las tiene
        if (gltf.animations && gltf.animations.length > 0) {
          mixer = new THREE.AnimationMixer(gltf.scene);
          gltf.animations.forEach((clip) => mixer!.clipAction(clip).play());
        }

        // Bounding box → centrar cámara y reescalar marcador
        const box    = new THREE.Box3().setFromObject(gltf.scene);
        const center = box.getCenter(new THREE.Vector3());
        const size   = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);

        camera.near = maxDim * 0.001;
        camera.far  = maxDim * 10;
        camera.position.set(
          center.x + maxDim * 0.9,
          center.y + maxDim * 0.4,
          center.z + maxDim * 0.9
        );
        camera.updateProjectionMatrix();
        controls.target.copy(center);
        controls.update();

        marker.position.set(
          center.x + size.x * 0.1,
          box.min.y + size.y * 0.33,
          center.z + size.z * 0.15
        );
        const markerScale = Math.max(size.x, size.z) * 0.013;
        marker.scale.setScalar(markerScale);

        // Distribuir nodos en 6 grupos de capas
        const root = gltf.scene;
        const firstChild = root.children[0] as THREE.Object3D | undefined;
        const topNodes: THREE.Object3D[] =
          root.children.length === 1 && firstChild && firstChild.children.length > 0
            ? [...firstChild.children]
            : [...root.children];

        const chunkSize = Math.max(1, Math.ceil(topNodes.length / LAYER_NAMES.length));
        layerGroupsRef.current = LAYER_NAMES.map((_, i) =>
          topNodes.slice(i * chunkSize, (i + 1) * chunkSize)
        );

        setLoading(false);
      },
      (progress) => {
        if (progress.total > 0) {
          setLoadProgress(Math.round((progress.loaded / progress.total) * 100));
        }
      },
      (err) => {
        console.error('[VisorPlano3D] Error cargando modelo:', err);
        setLoadError('No se pudo cargar el modelo 3D. Verificá la conexión.');
        setLoading(false);
      }
    );

    // ── Loop de animación + FPS (THREE.Timer reemplaza Clock deprecado) ───
    let frameCount  = 0;
    let lastFpsTime = performance.now();
    let lastTime    = performance.now();

    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);
      const now   = performance.now();
      const delta = (now - lastTime) / 1000;
      lastTime    = now;

      if (mixer) mixer.update(delta);
      controls.update();
      renderer.render(scene, camera);

      frameCount++;
      if (now - lastFpsTime >= 1000) {
        setFps(frameCount);
        frameCount  = 0;
        lastFpsTime = now;
      }
    };
    animate();

    // ── Resize ────────────────────────────────────────────────────────────
    const handleResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // ── Cleanup ───────────────────────────────────────────────────────────
    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animFrameRef.current);
      if (mixer) mixer.stopAllAction();
      controls.dispose();
      dracoLoader.dispose();
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach((m: THREE.Material) => m.dispose());
        }
      });
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div className={styles.root}>
      <div className={styles.canvasWrap} ref={containerRef}>
        {loading && (
          <div className={styles.loadOverlay}>
            <div className={styles.loadSpinner} />
            <span>
              Cargando modelo 3D
              {loadProgress > 0 ? ` (${loadProgress}%)` : '…'}
            </span>
          </div>
        )}
        {loadError && (
          <div className={styles.errorOverlay}>{loadError}</div>
        )}
        {!loading && <FpsCounter fps={fps} />}
      </div>

      <PanelCapas3D
        layers={[...LAYER_NAMES]}
        visible={layerVisible}
        onToggle={handleLayerToggle}
        onVerDetalle={() => setShowDetail(true)}
      />

      {showDetail && (
        <div className={styles.detailOverlay}>
          <div className={styles.detailPanel}>
            <div className={styles.detailHeader}>
              <span className={styles.detailOtCode}>{DUMMY_OT.ot}</span>
              <button
                className={styles.detailClose}
                onClick={() => setShowDetail(false)}
              >
                ✕
              </button>
            </div>
            <div className={styles.detailBody}>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Estado</span>
                <span className={styles.detailValue}>{DUMMY_OT.estado}</span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Rubro</span>
                <span className={styles.detailValue}>{DUMMY_OT.rubro}</span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Responsable</span>
                <span className={styles.detailValue}>{DUMMY_OT.responsable}</span>
              </div>
              <p className={styles.detailNote}>
                {DUMMY_OT.nota}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}