// src/terrain-scene.ts
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { ExplorerBookmark, ExplorerVector3, SelectedWorldObjectRef, TerrainSessionState } from './explorer-types';
import { createId } from './explorer-store';
import { TerrainLoader } from './terrain/TerrainLoader';
import { loadTerrainObjects, type TerrainObjectLoadResult, type TerrainObjectSelectionRecord } from './terrain/TerrainObjects';
import {
    buildHeightMinimapRaster,
    minimapPointToWorld,
    worldToMinimapPoint,
} from './terrain/TerrainExplorerUtils';
import { TERRAIN_SCALE, TERRAIN_WORLD_SIZE } from './terrain/TerrainMesh';
import { TERRAIN_SIZE } from './terrain/formats/ATTReader';
import {
    createFileFromElectronData,
    isElectron,
    openDirectoryDialog,
    readTerrainWorldFiles,
    scanWorldFolders,
} from './electron-helper';

const TERRAIN_BASE_AMBIENT_INTENSITY = 0.6;
const TERRAIN_BASE_SUN_INTENSITY = 1.0;
const TERRAIN_MAX_PIXEL_RATIO = 1.5;
const TERRAIN_BRIGHTNESS_DEFAULT = 1.5;
const TERRAIN_OBJECT_DRAW_DISTANCE_DEFAULT = 6000;
const TERRAIN_OBJECT_CULL_INTERVAL_MS = 120;
const TERRAIN_CAMERA_MOVE_SPEED = 7000;
const TERRAIN_CAMERA_SPRINT_MULTIPLIER = 2.2;
const TERRAIN_MAX_DELTA_SECONDS = 0.1;

type MovementKeyCode = 'KeyW' | 'KeyA' | 'KeyS' | 'KeyD' | 'ShiftLeft' | 'ShiftRight';
const MOVEMENT_KEYS: readonly MovementKeyCode[] = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight'];

export class TerrainScene {
    public onObjectSelected?: (selection: SelectedWorldObjectRef | null) => void;
    public onCameraChanged?: (cameraPosition: ExplorerVector3, cameraTarget: ExplorerVector3) => void;
    public onWorldLoaded?: (worldNumber: number, availableWorldNumbers: number[]) => void;
    public onBookmarkCreated?: (bookmark: ExplorerBookmark) => void;
    public onOpenModelRequest?: (selection: SelectedWorldObjectRef, modelFile: File | null) => void;

    private scene!: THREE.Scene;
    private camera!: THREE.PerspectiveCamera;
    private renderer!: THREE.WebGLRenderer;
    private controls!: OrbitControls;
    private timer = new THREE.Timer();
    private isActive = false;
    private ambientLight: THREE.AmbientLight | null = null;
    private sunLight: THREE.DirectionalLight | null = null;
    private objectDrawDistance = TERRAIN_OBJECT_DRAW_DISTANCE_DEFAULT;
    private objectCullLastUpdateMs = 0;
    private readonly tempCullCenter = new THREE.Vector3();
    private readonly tempCullScale = new THREE.Vector3();
    private readonly movementKeys: Record<MovementKeyCode, boolean> = {
        KeyW: false,
        KeyA: false,
        KeyS: false,
        KeyD: false,
        ShiftLeft: false,
        ShiftRight: false,
    };
    private readonly tempMoveForward = new THREE.Vector3();
    private readonly tempMoveRight = new THREE.Vector3();
    private readonly tempMoveDelta = new THREE.Vector3();
    private readonly tempFocusOffset = new THREE.Vector3();
    private readonly raycaster = new THREE.Raycaster();
    private readonly pointer = new THREE.Vector2();

    private terrainMesh: THREE.Mesh | null = null;
    private objectsGroup: THREE.Group | null = null;
    private terrainLoader = new TerrainLoader();
    private objectRecords: TerrainObjectSelectionRecord[] = [];
    private selectedObjectRecord: TerrainObjectSelectionRecord | null = null;
    private isolatedObjectRecord: TerrainObjectSelectionRecord | null = null;
    private selectionMarker: THREE.Mesh | null = null;
    private minimapCanvas: HTMLCanvasElement | null = null;
    private minimapContext: CanvasRenderingContext2D | null = null;
    private minimapSourceCanvas: HTMLCanvasElement | null = null;
    private minimapNeedsRedraw = true;
    private pointerDown: { x: number; y: number } | null = null;
    private presentationMode = false;
    private pendingRestoreState: TerrainSessionState | null = null;
    private availableWorldNumbers: number[] = [];
    private loadedWorldNumber: number | null = null;
    private currentWorldFiles = new Map<string, File>();
    private cameraChangeHandle: number | null = null;

    /** Persistent store of all files from the Data folder (browser mode). */
    private dataFiles = new Map<string, File>();
    /** Root path to Data folder (Electron mode). */
    private dataRootPath: string | null = null;

    private statusEl: HTMLElement | null = null;
    private worldSelectEl: HTMLSelectElement | null = null;
    private wireframeEl: HTMLInputElement | null = null;
    private showObjectsEl: HTMLInputElement | null = null;
    private brightnessSliderEl: HTMLInputElement | null = null;
    private brightnessLabelEl: HTMLElement | null = null;
    private objectDistanceSliderEl: HTMLInputElement | null = null;
    private objectDistanceLabelEl: HTMLElement | null = null;
    private jumpXEl: HTMLInputElement | null = null;
    private jumpZEl: HTMLInputElement | null = null;
    private bookmarkNameEl: HTMLInputElement | null = null;
    private bookmarkStatusEl: HTMLElement | null = null;
    private objectDetailsEl: HTMLElement | null = null;
    private objectEmptyEl: HTMLElement | null = null;
    private objectWorldEl: HTMLElement | null = null;
    private objectTypeEl: HTMLElement | null = null;
    private objectModelEl: HTMLElement | null = null;
    private objectPositionEl: HTMLElement | null = null;
    private objectRotationEl: HTMLElement | null = null;
    private objectScaleEl: HTMLElement | null = null;
    private openModelBtn: HTMLButtonElement | null = null;
    private openModelHintEl: HTMLElement | null = null;
    private lastContextEl: HTMLElement | null = null;
    private tileCountEl: HTMLElement | null = null;
    private objectCountEl: HTMLElement | null = null;

    constructor() {
        this.initThree();
        this.initUI();
        this.animate();
    }

    setActive(active: boolean) {
        this.isActive = active;
        this.resetMovementKeys();
        if (active) {
            this.timer.reset();
            window.dispatchEvent(new Event('resize'));
            this.scheduleCameraChangedEmit();
            this.minimapNeedsRedraw = true;
        }
    }

    public applyPresentationMode(enabled: boolean) {
        this.presentationMode = enabled;
        this.updateSelectionMarker();
        this.minimapNeedsRedraw = true;
    }

    public setStatusMessage(message: string) {
        if (this.statusEl) {
            this.statusEl.textContent = message;
        }
    }

    public getCurrentState(): TerrainSessionState {
        return {
            lastWorldNumber: this.loadedWorldNumber,
            availableWorldNumbers: [...this.availableWorldNumbers],
            cameraPosition: this.toExplorerVector3(this.camera.position),
            cameraTarget: this.toExplorerVector3(this.controls.target),
            selectedObject: this.selectedObjectRecord?.selection || null,
            wireframe: this.wireframeEl?.checked ?? false,
            showObjects: this.showObjectsEl?.checked ?? true,
            brightness: parseFloat(this.brightnessSliderEl?.value || `${TERRAIN_BRIGHTNESS_DEFAULT}`) || TERRAIN_BRIGHTNESS_DEFAULT,
            objectDistance: this.objectDrawDistance,
        };
    }

    public restoreSessionState(state: TerrainSessionState) {
        this.pendingRestoreState = {
            ...state,
            availableWorldNumbers: [...state.availableWorldNumbers],
        };

        if (this.wireframeEl) {
            this.wireframeEl.checked = state.wireframe;
        }
        if (this.showObjectsEl) {
            this.showObjectsEl.checked = state.showObjects;
        }
        if (this.brightnessSliderEl && this.brightnessLabelEl) {
            this.brightnessSliderEl.value = `${state.brightness}`;
            this.brightnessLabelEl.textContent = `Brightness: ${state.brightness.toFixed(2)}×`;
            this.setBrightness(state.brightness);
        }
        if (this.objectDistanceSliderEl && this.objectDistanceLabelEl) {
            this.objectDistanceSliderEl.value = `${Math.round(state.objectDistance)}`;
            this.objectDrawDistance = Math.max(500, state.objectDistance);
            this.objectDistanceLabelEl.textContent = `Object Distance: ${Math.round(this.objectDrawDistance)}`;
        }

        if (!this.loadedWorldNumber && state.lastWorldNumber !== null) {
            this.setLastContextMessage(`Last session: World ${state.lastWorldNumber}. Reload Data folder to restore camera and object selection.`);
        }

        if (this.loadedWorldNumber !== null && state.lastWorldNumber === this.loadedWorldNumber) {
            this.applyPendingRestoreState();
        }
    }

    public async loadWorldByNumber(worldNumber: number): Promise<void> {
        await this.loadWorld(worldNumber);
    }

    public resolveModelFile(modelFileKey: string | null): File | null {
        if (!modelFileKey) return null;
        return this.currentWorldFiles.get(modelFileKey.toLowerCase()) || null;
    }

    public getCurrentTextureFiles(): File[] {
        const result: File[] = [];
        for (const [key, file] of this.currentWorldFiles) {
            if (/\.(jpg|jpeg|png|tga|ozj|ozt)$/i.test(key)) {
                result.push(file);
            }
        }
        return result;
    }

    public createCurrentBookmark(name: string): ExplorerBookmark | null {
        if (this.loadedWorldNumber === null) {
            this.setBookmarkStatus('Load a world before saving a bookmark.');
            return null;
        }

        const trimmedName = name.trim();
        if (!trimmedName) {
            this.setBookmarkStatus('Enter a bookmark name.');
            return null;
        }

        return {
            id: createId('bookmark'),
            name: trimmedName,
            worldNumber: this.loadedWorldNumber,
            cameraPosition: this.toExplorerVector3(this.camera.position),
            cameraTarget: this.toExplorerVector3(this.controls.target),
            selectedObject: this.selectedObjectRecord?.selection || null,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
    }

    public async jumpToBookmark(bookmark: ExplorerBookmark): Promise<boolean> {
        if (!this.hasLoadedData()) {
            this.setStatusMessage(`Reload Data folder to open bookmark "${bookmark.name}".`);
            return false;
        }

        if (this.loadedWorldNumber !== bookmark.worldNumber) {
            await this.loadWorld(bookmark.worldNumber);
        }

        this.applyCameraState(bookmark.cameraPosition, bookmark.cameraTarget);
        if (bookmark.selectedObject) {
            const matched = this.findRecordForSelection(bookmark.selectedObject);
            if (matched) {
                this.selectObjectRecord(matched);
            }
        }
        this.setBookmarkStatus(`Jumped to "${bookmark.name}".`);
        return true;
    }

    public selectObjectById(objectId: string): boolean {
        const record = this.objectRecords.find(item => item.selection.objectId === objectId);
        if (!record) return false;
        this.selectObjectRecord(record);
        return true;
    }

    private initThree() {
        const container = document.getElementById('terrain-canvas-container');
        if (!container) return;

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87CEEB);

        const worldCenter = (TERRAIN_SIZE * TERRAIN_SCALE) / 2;

        this.camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 10, 100000);
        this.camera.position.set(worldCenter, 5000, worldCenter + 5000);

        this.renderer = new THREE.WebGLRenderer({
            antialias: false,
            powerPreference: 'high-performance',
        });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, TERRAIN_MAX_PIXEL_RATIO));
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;
        container.appendChild(this.renderer.domElement);
        this.timer.connect(document);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.target.set(worldCenter, 0, worldCenter);
        this.controls.enableDamping = true;
        this.controls.maxDistance = 50000;
        this.controls.minDistance = 100;
        this.controls.addEventListener('change', () => {
            this.scheduleCameraChangedEmit();
            this.minimapNeedsRedraw = true;
        });

        this.ambientLight = new THREE.AmbientLight(0xffffff, TERRAIN_BASE_AMBIENT_INTENSITY);
        this.sunLight = new THREE.DirectionalLight(0xffffff, TERRAIN_BASE_SUN_INTENSITY);
        this.sunLight.position.set(worldCenter, 10000, worldCenter);
        this.scene.add(this.ambientLight, this.sunLight);

        this.selectionMarker = new THREE.Mesh(
            new THREE.RingGeometry(0.7, 1, 48),
            new THREE.MeshBasicMaterial({
                color: 0x31d7ff,
                transparent: true,
                opacity: 0.8,
                side: THREE.DoubleSide,
                depthWrite: false,
            }),
        );
        this.selectionMarker.rotation.x = -Math.PI / 2;
        this.selectionMarker.visible = false;
        this.selectionMarker.renderOrder = 12;
        this.scene.add(this.selectionMarker);

        this.renderer.domElement.addEventListener('pointerdown', event => {
            this.pointerDown = { x: event.clientX, y: event.clientY };
        });
        this.renderer.domElement.addEventListener('pointerup', event => {
            if (!this.pointerDown || event.button !== 0) return;
            const dx = event.clientX - this.pointerDown.x;
            const dy = event.clientY - this.pointerDown.y;
            this.pointerDown = null;
            if (dx * dx + dy * dy > 25) {
                return;
            }
            this.handleCanvasSelection(event);
        });

        window.addEventListener('resize', () => {
            if (!this.isActive) return;
            this.camera.aspect = container.clientWidth / container.clientHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(container.clientWidth, container.clientHeight);
            this.minimapNeedsRedraw = true;
        });
    }

    private initUI() {
        const dropZone = document.getElementById('terrain-data-drop-zone');
        const folderInput = document.getElementById('terrain-data-folder-input') as HTMLInputElement | null;
        this.statusEl = document.getElementById('terrain-status');
        this.worldSelectEl = document.getElementById('terrain-world-select') as HTMLSelectElement | null;
        this.wireframeEl = document.getElementById('terrain-wireframe') as HTMLInputElement | null;
        this.showObjectsEl = document.getElementById('terrain-show-objects') as HTMLInputElement | null;
        this.brightnessSliderEl = document.getElementById('terrain-brightness-slider') as HTMLInputElement | null;
        this.brightnessLabelEl = document.getElementById('terrain-brightness-label');
        this.objectDistanceSliderEl = document.getElementById('terrain-object-distance-slider') as HTMLInputElement | null;
        this.objectDistanceLabelEl = document.getElementById('terrain-object-distance-label');
        this.minimapCanvas = document.getElementById('terrain-minimap-canvas') as HTMLCanvasElement | null;
        this.minimapContext = this.minimapCanvas?.getContext('2d') || null;
        this.jumpXEl = document.getElementById('terrain-jump-x') as HTMLInputElement | null;
        this.jumpZEl = document.getElementById('terrain-jump-z') as HTMLInputElement | null;
        this.bookmarkNameEl = document.getElementById('terrain-bookmark-name') as HTMLInputElement | null;
        this.bookmarkStatusEl = document.getElementById('terrain-bookmark-status');
        this.objectDetailsEl = document.getElementById('terrain-object-details');
        this.objectEmptyEl = document.getElementById('terrain-object-empty');
        this.objectWorldEl = document.getElementById('terrain-selected-world');
        this.objectTypeEl = document.getElementById('terrain-selected-type');
        this.objectModelEl = document.getElementById('terrain-selected-model');
        this.objectPositionEl = document.getElementById('terrain-selected-position');
        this.objectRotationEl = document.getElementById('terrain-selected-rotation');
        this.objectScaleEl = document.getElementById('terrain-selected-scale');
        this.openModelBtn = document.getElementById('terrain-open-model-btn') as HTMLButtonElement | null;
        this.openModelHintEl = document.getElementById('terrain-open-model-hint');
        this.lastContextEl = document.getElementById('terrain-last-context');
        this.tileCountEl = document.getElementById('terrain-tile-count');
        this.objectCountEl = document.getElementById('terrain-object-count');

        if (dropZone && folderInput) {
            dropZone.addEventListener('click', () => {
                if (isElectron()) {
                    void this.handleDataSelectElectron();
                } else {
                    folderInput.click();
                }
            });

            folderInput.addEventListener('change', () => {
                if (folderInput.files && folderInput.files.length > 0) {
                    this.handleDataFiles(folderInput.files);
                }
            });

            dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-hover'); });
            dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-hover'));
            dropZone.addEventListener('drop', e => {
                e.preventDefault();
                dropZone.classList.remove('drag-hover');
                if (e.dataTransfer?.files) {
                    this.handleDataFiles(e.dataTransfer.files);
                }
            });
        }

        const loadBtn = document.getElementById('terrain-load-world-btn');
        loadBtn?.addEventListener('click', () => {
            const value = this.worldSelectEl?.value;
            if (value) {
                void this.loadWorld(parseInt(value, 10));
            }
        });

        this.wireframeEl?.addEventListener('change', () => {
            if (this.terrainMesh) {
                (this.terrainMesh.material as THREE.ShaderMaterial).wireframe = this.wireframeEl?.checked ?? false;
            }
        });

        window.addEventListener('keydown', (e) => {
            if (!this.terrainMesh || !this.isActive) return;
            const key = parseInt(e.key, 10);
            if (key >= 0 && key <= 4) {
                const mat = this.terrainMesh.material as THREE.ShaderMaterial;
                mat.uniforms.uDebugMode.value = key;
                console.log(`[TERRAIN] Debug mode: ${key} (0=normal, 1=layer1, 2=layer2, 3=alpha, 4=atlasUV)`);
            }
        });

        this.showObjectsEl?.addEventListener('change', () => {
            if (this.objectsGroup) {
                this.objectsGroup.visible = this.showObjectsEl?.checked ?? true;
                if (this.objectsGroup.visible) {
                    this.updateObjectDistanceCulling(true);
                }
            }
        });

        if (this.brightnessSliderEl && this.brightnessLabelEl) {
            this.brightnessSliderEl.addEventListener('input', (e) => {
                const value = parseFloat((e.target as HTMLInputElement).value);
                this.brightnessLabelEl!.textContent = `Brightness: ${value.toFixed(2)}×`;
                this.setBrightness(value);
            });
            const initialBrightness = parseFloat(this.brightnessSliderEl.value) || TERRAIN_BRIGHTNESS_DEFAULT;
            this.brightnessLabelEl.textContent = `Brightness: ${initialBrightness.toFixed(2)}×`;
            this.setBrightness(initialBrightness);
        }

        if (this.objectDistanceSliderEl && this.objectDistanceLabelEl) {
            this.objectDistanceSliderEl.addEventListener('input', (e) => {
                const value = parseFloat((e.target as HTMLInputElement).value);
                this.objectDrawDistance = Math.max(500, value);
                this.objectDistanceLabelEl!.textContent = `Object Distance: ${Math.round(this.objectDrawDistance)}`;
                this.updateObjectDistanceCulling(true);
            });
            const initialDistance = parseFloat(this.objectDistanceSliderEl.value) || TERRAIN_OBJECT_DRAW_DISTANCE_DEFAULT;
            this.objectDrawDistance = Math.max(500, initialDistance);
            this.objectDistanceLabelEl.textContent = `Object Distance: ${Math.round(this.objectDrawDistance)}`;
        }

        this.minimapCanvas?.addEventListener('click', event => {
            if (!this.minimapCanvas) return;
            const rect = this.minimapCanvas.getBoundingClientRect();
            const worldPoint = minimapPointToWorld(
                event.clientX - rect.left,
                event.clientY - rect.top,
                rect.width,
                rect.height,
                TERRAIN_WORLD_SIZE,
            );
            this.jumpToCoordinates(worldPoint.x, worldPoint.z);
        });

        document.getElementById('terrain-jump-btn')?.addEventListener('click', () => {
            const x = parseFloat(this.jumpXEl?.value || '0');
            const z = parseFloat(this.jumpZEl?.value || '0');
            this.jumpToCoordinates(x, z);
        });

        document.getElementById('terrain-save-bookmark-btn')?.addEventListener('click', () => {
            const bookmark = this.createCurrentBookmark(this.bookmarkNameEl?.value || '');
            if (!bookmark) return;
            this.onBookmarkCreated?.(bookmark);
            if (this.bookmarkNameEl) {
                this.bookmarkNameEl.value = '';
            }
            this.setBookmarkStatus(`Saved "${bookmark.name}".`);
        });

        document.getElementById('terrain-focus-object-btn')?.addEventListener('click', () => {
            this.focusSelectedObject();
        });
        document.getElementById('terrain-isolate-object-btn')?.addEventListener('click', () => {
            this.isolateSelectedObject();
        });
        document.getElementById('terrain-reset-isolate-btn')?.addEventListener('click', () => {
            this.resetObjectIsolation();
        });
        this.openModelBtn?.addEventListener('click', () => {
            if (!this.selectedObjectRecord) return;
            this.onOpenModelRequest?.(this.selectedObjectRecord.selection, this.selectedObjectRecord.modelFile);
        });

        window.addEventListener('keydown', (e) => this.handleMovementKey(e, true));
        window.addEventListener('keyup', (e) => this.handleMovementKey(e, false));
        window.addEventListener('blur', () => this.resetMovementKeys());

        this.updateObjectInspector();
        this.updateCoordinateInputs(this.controls.target.x, this.controls.target.z);
    }

    /** Electron: open native directory dialog and load */
    private async handleDataSelectElectron() {
        const folderPath = await openDirectoryDialog();
        if (folderPath) {
            this.dataRootPath = folderPath;
            this.dataFiles.clear();
            if (this.statusEl) this.statusEl.textContent = 'Scanning Data folder...';

            let worldNumbers: number[];
            try {
                worldNumbers = await scanWorldFolders(folderPath);
            } catch (error) {
                console.error('Failed to scan world folders:', error);
                const message = (error as Error)?.message || String(error);
                if (this.statusEl) {
                    if (message.includes("No handler registered for 'fs:scanWorldFolders'")) {
                        this.statusEl.textContent = 'Electron backend is outdated. Restart the desktop app.';
                    } else {
                        this.statusEl.textContent = `Error scanning Data folder: ${message}`;
                    }
                }
                return;
            }

            if (worldNumbers.length === 0) {
                if (this.statusEl) this.statusEl.textContent = `No World folders found in Data: ${folderPath}`;
                return;
            }

            this.availableWorldNumbers = worldNumbers;
            if (this.statusEl) this.statusEl.textContent = `Found ${worldNumbers.length} world(s). Select one to load.`;
            this.populateWorldSelect(worldNumbers);
            await this.loadWorld(this.pickInitialWorldToLoad(worldNumbers));
        }
    }

    /** Browser: handle dropped / selected Data folder files */
    private handleDataFiles(fileList: FileList) {
        if (this.statusEl) this.statusEl.textContent = 'Scanning Data folder...';

        this.dataFiles.clear();
        this.dataRootPath = null;

        // Determine root folder name from first file's webkitRelativePath
        const firstPath = ((fileList[0] as any).webkitRelativePath as string) || fileList[0].name;
        const rootName = firstPath.split('/')[0];

        for (let i = 0; i < fileList.length; i++) {
            const f = fileList[i];
            const rel = ((f as any).webkitRelativePath as string) || f.name;
            // Strip the root folder prefix (e.g. "Data/World1/..." → "World1/...")
            const trimmed = rel.startsWith(rootName + '/') ? rel.slice(rootName.length + 1) : rel;
            this.dataFiles.set(trimmed.toLowerCase(), f);
        }

        // Scan for World{N}/ subfolders
        const worldNumbers = this.scanWorldNumbers();

        if (worldNumbers.length === 0) {
            if (this.statusEl) this.statusEl.textContent = 'No World folders found in Data.';
            return;
        }

        this.availableWorldNumbers = worldNumbers;
        if (this.statusEl) this.statusEl.textContent = `Found ${worldNumbers.length} world(s). Select one to load.`;
        this.populateWorldSelect(worldNumbers);

        void this.loadWorld(this.pickInitialWorldToLoad(worldNumbers));
    }

    /** Scan dataFiles keys for world{N}/ prefixes */
    private scanWorldNumbers(): number[] {
        const worlds = new Set<number>();
        for (const key of this.dataFiles.keys()) {
            const match = key.match(/^world(\d+)\//);
            if (match) worlds.add(parseInt(match[1], 10));
        }
        return [...worlds].sort((a, b) => a - b);
    }

    private pickInitialWorldToLoad(worldNumbers: number[]): number {
        const preferred = this.pendingRestoreState?.lastWorldNumber;
        if (preferred !== null && preferred !== undefined && worldNumbers.includes(preferred)) {
            return preferred;
        }
        return worldNumbers[0];
    }

    /** Populate the world dropdown and show it */
    private populateWorldSelect(worldNumbers: number[]) {
        const container = document.getElementById('terrain-world-selector');
        if (!this.worldSelectEl || !container) return;

        this.worldSelectEl.innerHTML = '';
        for (const n of worldNumbers) {
            const opt = document.createElement('option');
            opt.value = n.toString();
            opt.textContent = `World ${n}`;
            this.worldSelectEl.appendChild(opt);
        }

        container.style.display = '';
    }

    /** Load a specific world by number */
    private async loadWorld(worldNumber: number) {
        if (this.statusEl) this.statusEl.textContent = `Loading World ${worldNumber}...`;
        this.updateStats(0, 0);
        this.objectRecords = [];
        this.currentWorldFiles.clear();
        this.clearSelection();
        this.resetObjectIsolation();

        if (this.worldSelectEl) {
            this.worldSelectEl.value = worldNumber.toString();
        }

        let files = this.buildWorldFiles(worldNumber);
        if (files.size === 0 && this.dataRootPath && isElectron()) {
            if (this.statusEl) this.statusEl.textContent = `Loading World ${worldNumber} files from disk...`;
            try {
                files = await this.loadWorldFilesFromElectron(worldNumber);
            } catch (error) {
                console.error('Failed to load world files from Electron:', error);
                const message = (error as Error)?.message || String(error);
                if (this.statusEl) {
                    if (message.includes("No handler registered for 'fs:readTerrainWorldFiles'")) {
                        this.statusEl.textContent = 'Electron backend is outdated. Restart the desktop app.';
                    } else {
                        this.statusEl.textContent = `Error loading World ${worldNumber} files: ${message}`;
                    }
                }
                return;
            }
        }

        if (files.size === 0) {
            if (this.statusEl) this.statusEl.textContent = `No files found for World ${worldNumber}.`;
            this.updateStats(0, 0);
            return;
        }

        this.currentWorldFiles = new Map<string, File>();
        files.forEach((file, key) => {
            this.currentWorldFiles.set(key.toLowerCase(), file);
        });

        try {
            const result = await this.terrainLoader.load(files);

            if (this.terrainMesh) {
                this.scene.remove(this.terrainMesh);
                this.terrainMesh.geometry.dispose();
                (this.terrainMesh.material as THREE.Material).dispose();
            }
            if (this.objectsGroup) {
                this.scene.remove(this.objectsGroup);
            }

            this.terrainMesh = result.mesh;
            this.scene.add(this.terrainMesh);
            this.updateStats(this.getTerrainTileCount(result.mesh), result.objectsData?.objects.length ?? 0);
            this.loadedWorldNumber = result.mapNumber;

            const worldCenter = (TERRAIN_SIZE * TERRAIN_SCALE) / 2;
            this.controls.target.set(worldCenter, 0, worldCenter);
            this.camera.position.set(worldCenter, 5000, worldCenter + 5000);

            if (this.statusEl) this.statusEl.textContent = `World ${result.mapNumber} loaded. Loading objects...`;

            if (result.objectsData) {
                const objectResult: TerrainObjectLoadResult = await loadTerrainObjects(
                    result.objectsData,
                    files,
                    result.mapNumber,
                    (loaded, total) => {
                        if (this.statusEl) this.statusEl.textContent = `Loading objects: ${loaded}/${total}...`;
                    },
                );
                this.objectsGroup = objectResult.group;
                this.objectRecords = objectResult.records;
                this.scene.add(this.objectsGroup);

                if (this.showObjectsEl && this.objectsGroup) {
                    this.objectsGroup.visible = this.showObjectsEl.checked;
                    if (this.showObjectsEl.checked) {
                        this.updateObjectDistanceCulling(true);
                    }
                }
            }

            this.updateTerrainMaterialState();
            this.buildMinimapSource();
            this.minimapNeedsRedraw = true;
            this.applyPendingRestoreState();
            this.updateSelectionMarker();
            this.scheduleCameraChangedEmit();
            this.onWorldLoaded?.(result.mapNumber, [...this.availableWorldNumbers]);

            if (this.statusEl) {
                const objCount = result.objectsData?.objects.length ?? 0;
                this.statusEl.textContent = `World ${result.mapNumber} loaded. ${objCount} objects.`;
            }
        } catch (e) {
            console.error('Terrain loading error:', e);
            if (this.statusEl) this.statusEl.textContent = `Error: ${(e as Error).message}`;
            this.updateStats(0, 0);
        }
    }

    /** Electron: read all files from Data/World{N} and Data/Object{N}. */
    private async loadWorldFilesFromElectron(worldNumber: number): Promise<Map<string, File>> {
        if (!this.dataRootPath) return new Map();

        const entries = await readTerrainWorldFiles(this.dataRootPath, worldNumber);
        const files = new Map<string, File>();
        for (const entry of entries) {
            files.set(entry.key.toLowerCase(), createFileFromElectronData(entry.name, entry.data));
        }
        return files;
    }

    /**
     * Build a files Map for the given world number.
     * Includes files from world{N}/ and object{N}/ subfolders.
     * Keys are relative paths (e.g. "world1/EncTerrain1.att").
     */
    private buildWorldFiles(worldNumber: number): Map<string, File> {
        const worldPrefix = `world${worldNumber}/`;
        const objectPrefix = `object${worldNumber}/`;
        const files = new Map<string, File>();

        for (const [key, file] of this.dataFiles) {
            if (key.startsWith(worldPrefix) || key.startsWith(objectPrefix)) {
                files.set(key, file);
            }
        }

        return files;
    }

    private buildMinimapSource() {
        if (!this.terrainMesh) {
            this.minimapSourceCanvas = null;
            return;
        }

        const geometry = this.terrainMesh.geometry as THREE.BufferGeometry;
        const positions = geometry.getAttribute('position');
        if (!positions) {
            this.minimapSourceCanvas = null;
            return;
        }

        const colorAttribute = geometry.getAttribute('color');
        const vertexGridSize = Math.round(Math.sqrt(positions.count));
        const raster = buildHeightMinimapRaster(
            positions.array as ArrayLike<number>,
            colorAttribute?.array as ArrayLike<number> | null,
            vertexGridSize,
        );

        const sourceCanvas = document.createElement('canvas');
        sourceCanvas.width = raster.width;
        sourceCanvas.height = raster.height;
        const context = sourceCanvas.getContext('2d');
        if (!context) {
            this.minimapSourceCanvas = null;
            return;
        }

        const imageDataArray = new Uint8ClampedArray(raster.data.length);
        imageDataArray.set(raster.data);
        context.putImageData(new ImageData(imageDataArray, raster.width, raster.height), 0, 0);
        this.minimapSourceCanvas = sourceCanvas;
    }

    private handleCanvasSelection(event: PointerEvent) {
        if (!this.objectsGroup) {
            this.clearSelection();
            return;
        }

        const rect = this.renderer.domElement.getBoundingClientRect();
        this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        this.raycaster.setFromCamera(this.pointer, this.camera);
        const intersections = this.raycaster.intersectObject(this.objectsGroup, true);
        const record = this.resolveSelectionRecord(intersections);
        if (record) {
            this.selectObjectRecord(record);
        } else {
            this.clearSelection();
        }
    }

    private resolveSelectionRecord(intersections: THREE.Intersection<THREE.Object3D<THREE.Object3DEventMap>>[]): TerrainObjectSelectionRecord | null {
        for (const intersection of intersections) {
            const directRecord = intersection.object.userData.terrainObjectRecord as TerrainObjectSelectionRecord | undefined;
            if (directRecord) {
                return directRecord;
            }

            const instancedRecords = intersection.object.userData.terrainObjectRecords as TerrainObjectSelectionRecord[] | undefined;
            if (typeof intersection.instanceId === 'number' && instancedRecords?.[intersection.instanceId]) {
                return instancedRecords[intersection.instanceId];
            }
        }

        return null;
    }

    private selectObjectRecord(record: TerrainObjectSelectionRecord) {
        this.selectedObjectRecord = record;
        this.updateObjectInspector();
        this.updateSelectionMarker();
        this.onObjectSelected?.(record.selection);
        this.minimapNeedsRedraw = true;
    }

    private clearSelection() {
        this.selectedObjectRecord = null;
        this.updateObjectInspector();
        this.updateSelectionMarker();
        this.onObjectSelected?.(null);
        this.minimapNeedsRedraw = true;
    }

    private updateObjectInspector() {
        const record = this.selectedObjectRecord;
        if (!record) {
            this.objectDetailsEl?.classList.add('hidden');
            this.objectEmptyEl?.classList.remove('hidden');
            if (this.openModelHintEl) {
                this.openModelHintEl.textContent = 'Select an object to inspect it.';
            }
            if (this.openModelBtn) {
                this.openModelBtn.disabled = true;
            }
            return;
        }

        this.objectDetailsEl?.classList.remove('hidden');
        this.objectEmptyEl?.classList.add('hidden');
        if (this.objectWorldEl) this.objectWorldEl.textContent = `${record.selection.worldNumber}`;
        if (this.objectTypeEl) this.objectTypeEl.textContent = `${record.selection.type}`;
        if (this.objectModelEl) this.objectModelEl.textContent = record.selection.modelName || 'Unresolved';
        if (this.objectPositionEl) this.objectPositionEl.textContent = this.formatVector(record.selection.position);
        if (this.objectRotationEl) this.objectRotationEl.textContent = this.formatVector(record.selection.rotation);
        if (this.objectScaleEl) this.objectScaleEl.textContent = record.selection.scale.toFixed(2);
        if (this.openModelBtn) this.openModelBtn.disabled = !record.modelFile;
        if (this.openModelHintEl) {
            this.openModelHintEl.textContent = record.modelFile
                ? 'Model file resolved from current world data.'
                : 'Model file is not available in the currently loaded world files.';
        }
    }

    private updateSelectionMarker() {
        if (!this.selectionMarker) return;
        if (!this.selectedObjectRecord || this.presentationMode) {
            this.selectionMarker.visible = false;
            return;
        }

        const position = this.selectedObjectRecord.selection.position;
        this.selectionMarker.visible = true;
        this.selectionMarker.position.set(position.x, position.y + 8, position.z);
        const scale = Math.max(90, this.selectedObjectRecord.approximateRadius * 1.35);
        this.selectionMarker.scale.set(scale, scale, scale);
    }

    private focusSelectedObject() {
        const record = this.selectedObjectRecord;
        if (!record) return;

        const target = new THREE.Vector3(
            record.selection.position.x,
            record.selection.position.y + record.approximateRadius * 0.25,
            record.selection.position.z,
        );

        this.tempFocusOffset.copy(this.camera.position).sub(this.controls.target);
        const offsetLength = Math.max(this.tempFocusOffset.length(), record.approximateRadius * 6);
        if (this.tempFocusOffset.lengthSq() < 1e-8) {
            this.tempFocusOffset.set(record.approximateRadius * 3, record.approximateRadius * 2.4, record.approximateRadius * 3);
        } else {
            this.tempFocusOffset.normalize().multiplyScalar(offsetLength);
            if (this.tempFocusOffset.y < record.approximateRadius * 1.6) {
                this.tempFocusOffset.y = record.approximateRadius * 1.6;
            }
        }

        this.controls.target.copy(target);
        this.camera.position.copy(target).add(this.tempFocusOffset);
        this.controls.update();
        this.scheduleCameraChangedEmit();
        this.minimapNeedsRedraw = true;
    }

    private isolateSelectedObject() {
        if (!this.selectedObjectRecord || !this.objectsGroup) return;
        this.isolatedObjectRecord = this.selectedObjectRecord;
        this.updateObjectDistanceCulling(true);
    }

    private resetObjectIsolation() {
        this.isolatedObjectRecord = null;
        this.updateObjectDistanceCulling(true);
    }

    private applyPendingRestoreState() {
        if (!this.pendingRestoreState || this.loadedWorldNumber === null) return;
        if (this.pendingRestoreState.lastWorldNumber !== null && this.pendingRestoreState.lastWorldNumber !== this.loadedWorldNumber) {
            return;
        }

        if (this.pendingRestoreState.cameraPosition && this.pendingRestoreState.cameraTarget) {
            this.applyCameraState(this.pendingRestoreState.cameraPosition, this.pendingRestoreState.cameraTarget);
        }
        if (this.pendingRestoreState.selectedObject) {
            const record = this.findRecordForSelection(this.pendingRestoreState.selectedObject);
            if (record) {
                this.selectObjectRecord(record);
            }
        }
        this.pendingRestoreState = null;
    }

    private findRecordForSelection(selection: SelectedWorldObjectRef): TerrainObjectSelectionRecord | null {
        const byId = this.objectRecords.find(record => record.selection.objectId === selection.objectId);
        if (byId) {
            return byId;
        }

        return this.objectRecords.find(record =>
            record.selection.type === selection.type &&
            Math.abs(record.selection.position.x - selection.position.x) < 1 &&
            Math.abs(record.selection.position.z - selection.position.z) < 1,
        ) || null;
    }

    private applyCameraState(cameraPosition: ExplorerVector3, cameraTarget: ExplorerVector3) {
        this.camera.position.set(cameraPosition.x, cameraPosition.y, cameraPosition.z);
        this.controls.target.set(cameraTarget.x, cameraTarget.y, cameraTarget.z);
        this.controls.update();
        this.updateCoordinateInputs(cameraTarget.x, cameraTarget.z);
        this.minimapNeedsRedraw = true;
    }

    private jumpToCoordinates(worldX: number, worldZ: number) {
        const targetX = THREE.MathUtils.clamp(worldX, 0, TERRAIN_WORLD_SIZE);
        const targetZ = THREE.MathUtils.clamp(worldZ, 0, TERRAIN_WORLD_SIZE);
        this.tempFocusOffset.copy(this.camera.position).sub(this.controls.target);
        this.controls.target.set(targetX, this.controls.target.y, targetZ);
        this.camera.position.copy(this.controls.target).add(this.tempFocusOffset);
        this.controls.update();
        this.updateCoordinateInputs(targetX, targetZ);
        this.scheduleCameraChangedEmit();
        this.minimapNeedsRedraw = true;
    }

    private getTerrainTileCount(mesh: THREE.Mesh): number {
        const geometry = mesh.geometry as THREE.BufferGeometry;
        const indexCount = geometry.getIndex()?.count ?? 0;
        if (indexCount > 0) {
            return Math.floor(indexCount / 6);
        }
        const positionCount = geometry.getAttribute('position')?.count ?? 0;
        return Math.floor(positionCount / 4);
    }

    private updateStats(tileCount: number, objectCount: number) {
        if (this.tileCountEl) this.tileCountEl.textContent = Math.max(0, tileCount).toLocaleString();
        if (this.objectCountEl) this.objectCountEl.textContent = Math.max(0, objectCount).toLocaleString();
    }

    private updateObjectDistanceCulling(force = false) {
        if (!this.objectsGroup || !this.objectsGroup.visible) return;

        const now = performance.now();
        if (!force && now - this.objectCullLastUpdateMs < TERRAIN_OBJECT_CULL_INTERVAL_MS) {
            return;
        }

        if (this.isolatedObjectRecord) {
            for (const child of this.objectsGroup.children) {
                child.visible = this.isChildVisibleForIsolatedRecord(child, this.isolatedObjectRecord);
            }
            this.objectCullLastUpdateMs = now;
            return;
        }

        if (force) {
            this.objectsGroup.updateMatrixWorld(true);
        }

        const maxDistance = this.objectDrawDistance;
        const cameraPos = this.camera.position;
        for (const child of this.objectsGroup.children) {
            child.visible = this.isWithinObjectDistance(child, cameraPos, maxDistance);
        }

        this.objectCullLastUpdateMs = now;
    }

    private isChildVisibleForIsolatedRecord(child: THREE.Object3D, record: TerrainObjectSelectionRecord): boolean {
        if (record.instancedMesh) {
            return child === record.instancedMesh;
        }
        return child === record.object3D;
    }

    private isWithinObjectDistance(object: THREE.Object3D, cameraPos: THREE.Vector3, maxDistance: number): boolean {
        const mesh = object as THREE.Mesh;
        const geometry = mesh.geometry as THREE.BufferGeometry | undefined;

        if (geometry) {
            if (!geometry.boundingSphere) {
                geometry.computeBoundingSphere();
            }
            const sphere = geometry.boundingSphere;
            if (sphere) {
                this.tempCullCenter.copy(sphere.center).applyMatrix4(object.matrixWorld);
                this.tempCullScale.setFromMatrixScale(object.matrixWorld);
                const radiusScale = Math.max(this.tempCullScale.x, this.tempCullScale.y, this.tempCullScale.z);
                const radius = sphere.radius * radiusScale;
                const maxRange = maxDistance + radius;
                return this.tempCullCenter.distanceToSquared(cameraPos) <= maxRange * maxRange;
            }
        }

        object.getWorldPosition(this.tempCullCenter);
        return this.tempCullCenter.distanceToSquared(cameraPos) <= maxDistance * maxDistance;
    }

    private setBrightness(value: number) {
        const safeValue = Math.max(0.1, value);
        this.renderer.toneMappingExposure = safeValue;
        if (this.ambientLight) this.ambientLight.intensity = TERRAIN_BASE_AMBIENT_INTENSITY * safeValue;
        if (this.sunLight) this.sunLight.intensity = TERRAIN_BASE_SUN_INTENSITY * safeValue;
    }

    private updateTerrainMaterialState() {
        if (this.terrainMesh && this.wireframeEl) {
            (this.terrainMesh.material as THREE.ShaderMaterial).wireframe = this.wireframeEl.checked;
        }
        if (this.objectsGroup && this.showObjectsEl) {
            this.objectsGroup.visible = this.showObjectsEl.checked;
        }
    }

    private handleMovementKey(event: KeyboardEvent, isDown: boolean) {
        if (!this.isActive) return;
        const code = event.code as MovementKeyCode;
        if (!MOVEMENT_KEYS.includes(code)) return;
        if (event.ctrlKey || event.metaKey || event.altKey) return;

        if (isDown && this.isTypingIntoUI(event.target)) {
            return;
        }

        this.movementKeys[code] = isDown;
        event.preventDefault();
    }

    private isTypingIntoUI(target: EventTarget | null): boolean {
        if (!(target instanceof HTMLElement)) return false;
        const tagName = target.tagName.toLowerCase();
        return (
            tagName === 'input' ||
            tagName === 'textarea' ||
            tagName === 'select' ||
            target.isContentEditable
        );
    }

    private resetMovementKeys() {
        this.movementKeys.KeyW = false;
        this.movementKeys.KeyA = false;
        this.movementKeys.KeyS = false;
        this.movementKeys.KeyD = false;
        this.movementKeys.ShiftLeft = false;
        this.movementKeys.ShiftRight = false;
    }

    private updateKeyboardMovement(deltaSeconds: number) {
        const forwardInput = (this.movementKeys.KeyW ? 1 : 0) + (this.movementKeys.KeyS ? -1 : 0);
        const rightInput = (this.movementKeys.KeyA ? 1 : 0) + (this.movementKeys.KeyD ? -1 : 0);
        if (forwardInput === 0 && rightInput === 0) return;

        this.camera.getWorldDirection(this.tempMoveForward);
        this.tempMoveForward.y = 0;
        if (this.tempMoveForward.lengthSq() < 1e-8) return;
        this.tempMoveForward.normalize();

        this.tempMoveRight.set(this.tempMoveForward.z, 0, -this.tempMoveForward.x).normalize();
        this.tempMoveDelta.set(0, 0, 0);
        this.tempMoveDelta.addScaledVector(this.tempMoveForward, forwardInput);
        this.tempMoveDelta.addScaledVector(this.tempMoveRight, rightInput);
        if (this.tempMoveDelta.lengthSq() < 1e-8) return;
        this.tempMoveDelta.normalize();

        const sprint = this.movementKeys.ShiftLeft || this.movementKeys.ShiftRight;
        const speed = TERRAIN_CAMERA_MOVE_SPEED * (sprint ? TERRAIN_CAMERA_SPRINT_MULTIPLIER : 1);
        this.tempMoveDelta.multiplyScalar(speed * deltaSeconds);

        this.camera.position.add(this.tempMoveDelta);
        this.controls.target.add(this.tempMoveDelta);
        this.updateCoordinateInputs(this.controls.target.x, this.controls.target.z);
        this.scheduleCameraChangedEmit();
        this.minimapNeedsRedraw = true;
    }

    private drawMinimap() {
        if (!this.minimapCanvas || !this.minimapContext || !this.minimapNeedsRedraw) return;

        const width = this.minimapCanvas.width;
        const height = this.minimapCanvas.height;
        const ctx = this.minimapContext;

        ctx.clearRect(0, 0, width, height);
        if (this.minimapSourceCanvas) {
            ctx.drawImage(this.minimapSourceCanvas, 0, 0, width, height);
        } else {
            ctx.fillStyle = '#0f172a';
            ctx.fillRect(0, 0, width, height);
        }

        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.strokeRect(0.5, 0.5, width - 1, height - 1);

        if (this.selectedObjectRecord) {
            const selectedPoint = worldToMinimapPoint(
                this.selectedObjectRecord.selection.position.x,
                this.selectedObjectRecord.selection.position.z,
                TERRAIN_WORLD_SIZE,
                width,
                height,
            );
            ctx.fillStyle = '#f59e0b';
            ctx.beginPath();
            ctx.arc(selectedPoint.x, selectedPoint.y, 4.5, 0, Math.PI * 2);
            ctx.fill();
        }

        const targetPoint = worldToMinimapPoint(
            this.controls.target.x,
            this.controls.target.z,
            TERRAIN_WORLD_SIZE,
            width,
            height,
        );
        const cameraPoint = worldToMinimapPoint(
            this.camera.position.x,
            this.camera.position.z,
            TERRAIN_WORLD_SIZE,
            width,
            height,
        );
        ctx.strokeStyle = '#31d7ff';
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.moveTo(cameraPoint.x, cameraPoint.y);
        ctx.lineTo(targetPoint.x, targetPoint.y);
        ctx.stroke();
        ctx.fillStyle = '#31d7ff';
        ctx.beginPath();
        ctx.arc(cameraPoint.x, cameraPoint.y, 3.5, 0, Math.PI * 2);
        ctx.fill();

        this.minimapNeedsRedraw = false;
    }

    private scheduleCameraChangedEmit() {
        if (this.cameraChangeHandle !== null) {
            cancelAnimationFrame(this.cameraChangeHandle);
        }
        this.cameraChangeHandle = requestAnimationFrame(() => {
            this.cameraChangeHandle = null;
            this.updateCoordinateInputs(this.controls.target.x, this.controls.target.z);
            this.onCameraChanged?.(
                this.toExplorerVector3(this.camera.position),
                this.toExplorerVector3(this.controls.target),
            );
        });
    }

    private updateCoordinateInputs(x: number, z: number) {
        if (this.jumpXEl) {
            this.jumpXEl.value = x.toFixed(0);
        }
        if (this.jumpZEl) {
            this.jumpZEl.value = z.toFixed(0);
        }
    }

    private setBookmarkStatus(message: string) {
        if (this.bookmarkStatusEl) {
            this.bookmarkStatusEl.textContent = message;
        }
    }

    private setLastContextMessage(message: string) {
        if (this.lastContextEl) {
            this.lastContextEl.textContent = message;
        }
    }

    private formatVector(vector: { x: number; y: number; z: number }): string {
        return `${vector.x.toFixed(0)}, ${vector.y.toFixed(0)}, ${vector.z.toFixed(0)}`;
    }

    private toExplorerVector3(vector: THREE.Vector3): ExplorerVector3 {
        return {
            x: vector.x,
            y: vector.y,
            z: vector.z,
        };
    }

    private hasLoadedData(): boolean {
        return this.dataFiles.size > 0 || this.dataRootPath !== null;
    }

    private animate = (timestamp?: DOMHighResTimeStamp) => {
        requestAnimationFrame(this.animate);
        if (!this.isActive) return;

        this.timer.update(timestamp);
        const delta = Math.min(this.timer.getDelta(), TERRAIN_MAX_DELTA_SECONDS);
        this.updateKeyboardMovement(delta);
        this.controls.update();
        this.updateObjectDistanceCulling();
        this.updateSelectionMarker();
        this.drawMinimap();
        this.renderer.render(this.scene, this.camera);
    };
}
