import type {
  BmdSessionState,
  CharacterPreset,
  CharacterSessionState,
  ExplorerBookmark,
  RecentBookmarkEntry,
  RecentModelEntry,
  RecentWorldEntry,
  TerrainSessionState,
  ViewerSessionState,
  ViewerTab,
} from './explorer-types';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const STORAGE_KEY = 'mu-bmd-viewer:explorer-state';
const STATE_VERSION = 1;
const MAX_RECENT_WORLDS = 8;
const MAX_RECENT_BOOKMARKS = 10;
const MAX_RECENT_MODELS = 10;

export function createId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createDefaultCharacterSessionState(): CharacterSessionState {
  return {
    classValue: 1,
    equipment: {
      helm: '',
      armor: '',
      pants: '',
      gloves: '',
      boots: '',
      leftWeapon: '',
      rightWeapon: '',
      wing: '',
    },
    animationIndex: null,
    autoRotate: false,
    speed: 0.2,
    scale: 1,
    itemLevel: 0,
    itemExcellent: false,
    itemAncient: false,
    itemExcellentIntensity: 1,
    showSkeleton: false,
    wireframe: false,
    showBoundingBox: false,
    showAxes: false,
    showNormals: false,
    backgroundColor: '#0b1322',
    brightness: 2,
  };
}

export function createDefaultTerrainSessionState(): TerrainSessionState {
  return {
    lastWorldNumber: null,
    availableWorldNumbers: [],
    cameraPosition: null,
    cameraTarget: null,
    selectedObject: null,
    wireframe: false,
    showObjects: true,
    brightness: 1.5,
    objectDistance: 6000,
  };
}

export function createDefaultBmdSessionState(): BmdSessionState {
  return {
    autoRotate: true,
    showSkeleton: false,
    wireframe: false,
    showBoundingBox: false,
    showAxes: false,
    showNormals: false,
    backgroundColor: '#0b1322',
    brightness: 2,
    lastModelName: null,
  };
}

export function createDefaultViewerSessionState(): ViewerSessionState {
  return {
    version: STATE_VERSION,
    activeView: 'bmd',
    presentationMode: false,
    bookmarks: [],
    recentWorlds: [],
    recentBookmarks: [],
    recentModels: [],
    characterPresets: [],
    terrain: createDefaultTerrainSessionState(),
    character: createDefaultCharacterSessionState(),
    bmd: createDefaultBmdSessionState(),
  };
}

function safeObject<T extends object>(value: unknown): Partial<T> {
  return value && typeof value === 'object' ? (value as Partial<T>) : {};
}

function coerceNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function coerceBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function coerceString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function mergeCharacterSessionState(raw: unknown): CharacterSessionState {
  const defaults = createDefaultCharacterSessionState();
  const input = safeObject<CharacterSessionState>(raw);
  const equipment = safeObject<CharacterSessionState['equipment']>(input.equipment);

  return {
    classValue: coerceNumber(input.classValue, defaults.classValue),
    equipment: {
      helm: coerceString(equipment.helm, defaults.equipment.helm),
      armor: coerceString(equipment.armor, defaults.equipment.armor),
      pants: coerceString(equipment.pants, defaults.equipment.pants),
      gloves: coerceString(equipment.gloves, defaults.equipment.gloves),
      boots: coerceString(equipment.boots, defaults.equipment.boots),
      leftWeapon: coerceString(equipment.leftWeapon, defaults.equipment.leftWeapon),
      rightWeapon: coerceString(equipment.rightWeapon, defaults.equipment.rightWeapon),
      wing: coerceString(equipment.wing, defaults.equipment.wing),
    },
    animationIndex: typeof input.animationIndex === 'number' ? input.animationIndex : null,
    autoRotate: coerceBoolean(input.autoRotate, defaults.autoRotate),
    speed: coerceNumber(input.speed, defaults.speed),
    scale: coerceNumber(input.scale, defaults.scale),
    itemLevel: coerceNumber(input.itemLevel, defaults.itemLevel),
    itemExcellent: coerceBoolean(input.itemExcellent, defaults.itemExcellent),
    itemAncient: coerceBoolean(input.itemAncient, defaults.itemAncient),
    itemExcellentIntensity: coerceNumber(input.itemExcellentIntensity, defaults.itemExcellentIntensity),
    showSkeleton: coerceBoolean(input.showSkeleton, defaults.showSkeleton),
    wireframe: coerceBoolean(input.wireframe, defaults.wireframe),
    showBoundingBox: coerceBoolean(input.showBoundingBox, defaults.showBoundingBox),
    showAxes: coerceBoolean(input.showAxes, defaults.showAxes),
    showNormals: coerceBoolean(input.showNormals, defaults.showNormals),
    backgroundColor: coerceString(input.backgroundColor, defaults.backgroundColor),
    brightness: coerceNumber(input.brightness, defaults.brightness),
  };
}

function mergeTerrainSessionState(raw: unknown): TerrainSessionState {
  const defaults = createDefaultTerrainSessionState();
  const input = safeObject<TerrainSessionState>(raw);

  return {
    lastWorldNumber: typeof input.lastWorldNumber === 'number' ? input.lastWorldNumber : null,
    availableWorldNumbers: Array.isArray(input.availableWorldNumbers)
      ? input.availableWorldNumbers.filter((value): value is number => typeof value === 'number')
      : defaults.availableWorldNumbers,
    cameraPosition: input.cameraPosition && typeof input.cameraPosition === 'object'
      ? {
          x: coerceNumber((input.cameraPosition as { x?: number }).x, 0),
          y: coerceNumber((input.cameraPosition as { y?: number }).y, 0),
          z: coerceNumber((input.cameraPosition as { z?: number }).z, 0),
        }
      : null,
    cameraTarget: input.cameraTarget && typeof input.cameraTarget === 'object'
      ? {
          x: coerceNumber((input.cameraTarget as { x?: number }).x, 0),
          y: coerceNumber((input.cameraTarget as { y?: number }).y, 0),
          z: coerceNumber((input.cameraTarget as { z?: number }).z, 0),
        }
      : null,
    selectedObject: input.selectedObject && typeof input.selectedObject === 'object'
      ? {
          objectId: coerceString((input.selectedObject as { objectId?: string }).objectId, ''),
          worldNumber: coerceNumber((input.selectedObject as { worldNumber?: number }).worldNumber, 0),
          type: coerceNumber((input.selectedObject as { type?: number }).type, 0),
          modelName: typeof (input.selectedObject as { modelName?: unknown }).modelName === 'string'
            ? (input.selectedObject as { modelName: string }).modelName
            : null,
          modelFileKey: typeof (input.selectedObject as { modelFileKey?: unknown }).modelFileKey === 'string'
            ? (input.selectedObject as { modelFileKey: string }).modelFileKey
            : null,
          displayName: coerceString((input.selectedObject as { displayName?: string }).displayName, 'Object'),
          position: {
            x: coerceNumber((input.selectedObject as { position?: { x?: number } }).position?.x, 0),
            y: coerceNumber((input.selectedObject as { position?: { y?: number } }).position?.y, 0),
            z: coerceNumber((input.selectedObject as { position?: { z?: number } }).position?.z, 0),
          },
          rotation: {
            x: coerceNumber((input.selectedObject as { rotation?: { x?: number } }).rotation?.x, 0),
            y: coerceNumber((input.selectedObject as { rotation?: { y?: number } }).rotation?.y, 0),
            z: coerceNumber((input.selectedObject as { rotation?: { z?: number } }).rotation?.z, 0),
          },
          scale: coerceNumber((input.selectedObject as { scale?: number }).scale, 1),
        }
      : null,
    wireframe: coerceBoolean(input.wireframe, defaults.wireframe),
    showObjects: coerceBoolean(input.showObjects, defaults.showObjects),
    brightness: coerceNumber(input.brightness, defaults.brightness),
    objectDistance: coerceNumber(input.objectDistance, defaults.objectDistance),
  };
}

function mergeBmdSessionState(raw: unknown): BmdSessionState {
  const defaults = createDefaultBmdSessionState();
  const input = safeObject<BmdSessionState>(raw);

  return {
    autoRotate: coerceBoolean(input.autoRotate, defaults.autoRotate),
    showSkeleton: coerceBoolean(input.showSkeleton, defaults.showSkeleton),
    wireframe: coerceBoolean(input.wireframe, defaults.wireframe),
    showBoundingBox: coerceBoolean(input.showBoundingBox, defaults.showBoundingBox),
    showAxes: coerceBoolean(input.showAxes, defaults.showAxes),
    showNormals: coerceBoolean(input.showNormals, defaults.showNormals),
    backgroundColor: coerceString(input.backgroundColor, defaults.backgroundColor),
    brightness: coerceNumber(input.brightness, defaults.brightness),
    lastModelName: typeof input.lastModelName === 'string' ? input.lastModelName : null,
  };
}

function mergeBookmark(raw: unknown): ExplorerBookmark | null {
  const input = safeObject<ExplorerBookmark>(raw);
  if (!input.id || !input.name || typeof input.worldNumber !== 'number') {
    return null;
  }

  return {
    id: input.id,
    name: input.name,
    worldNumber: input.worldNumber,
    cameraPosition: {
      x: coerceNumber(input.cameraPosition?.x, 0),
      y: coerceNumber(input.cameraPosition?.y, 0),
      z: coerceNumber(input.cameraPosition?.z, 0),
    },
    cameraTarget: {
      x: coerceNumber(input.cameraTarget?.x, 0),
      y: coerceNumber(input.cameraTarget?.y, 0),
      z: coerceNumber(input.cameraTarget?.z, 0),
    },
    selectedObject: input.selectedObject && typeof input.selectedObject === 'object'
      ? mergeTerrainSessionState({ selectedObject: input.selectedObject }).selectedObject
      : null,
    createdAt: coerceNumber(input.createdAt, Date.now()),
    updatedAt: coerceNumber(input.updatedAt, Date.now()),
  };
}

function mergeRecentWorldEntry(raw: unknown): RecentWorldEntry | null {
  const input = safeObject<RecentWorldEntry>(raw);
  if (typeof input.worldNumber !== 'number') return null;
  return {
    worldNumber: input.worldNumber,
    label: coerceString(input.label, `World ${input.worldNumber}`),
    timestamp: coerceNumber(input.timestamp, Date.now()),
  };
}

function mergeRecentBookmarkEntry(raw: unknown): RecentBookmarkEntry | null {
  const input = safeObject<RecentBookmarkEntry>(raw);
  if (!input.bookmarkId) return null;
  return {
    bookmarkId: input.bookmarkId,
    label: coerceString(input.label, 'Bookmark'),
    timestamp: coerceNumber(input.timestamp, Date.now()),
  };
}

function mergeRecentModelEntry(raw: unknown): RecentModelEntry | null {
  const input = safeObject<RecentModelEntry>(raw);
  if (!input.label) return null;
  return {
    label: input.label,
    timestamp: coerceNumber(input.timestamp, Date.now()),
    modelFileKey: typeof input.modelFileKey === 'string' ? input.modelFileKey : null,
    sourceWorldNumber: typeof input.sourceWorldNumber === 'number' ? input.sourceWorldNumber : null,
  };
}

function mergeCharacterPreset(raw: unknown): CharacterPreset | null {
  const input = safeObject<CharacterPreset>(raw);
  if (!input.id || !input.name) return null;
  const session = mergeCharacterSessionState(raw);
  return {
    ...session,
    id: input.id,
    name: input.name,
    pinned: coerceBoolean(input.pinned, false),
    createdAt: coerceNumber(input.createdAt, Date.now()),
    updatedAt: coerceNumber(input.updatedAt, Date.now()),
  };
}

export function mergeViewerSessionState(raw: unknown): ViewerSessionState {
  const defaults = createDefaultViewerSessionState();
  const input = safeObject<ViewerSessionState>(raw);

  return {
    version: STATE_VERSION,
    activeView: input.activeView === 'bmd' || input.activeView === 'character' || input.activeView === 'terrain'
      ? input.activeView
      : defaults.activeView,
    presentationMode: coerceBoolean(input.presentationMode, defaults.presentationMode),
    bookmarks: Array.isArray(input.bookmarks)
      ? input.bookmarks.map(mergeBookmark).filter((value): value is ExplorerBookmark => value !== null)
      : defaults.bookmarks,
    recentWorlds: Array.isArray(input.recentWorlds)
      ? input.recentWorlds.map(mergeRecentWorldEntry).filter((value): value is RecentWorldEntry => value !== null).slice(0, MAX_RECENT_WORLDS)
      : defaults.recentWorlds,
    recentBookmarks: Array.isArray(input.recentBookmarks)
      ? input.recentBookmarks.map(mergeRecentBookmarkEntry).filter((value): value is RecentBookmarkEntry => value !== null).slice(0, MAX_RECENT_BOOKMARKS)
      : defaults.recentBookmarks,
    recentModels: Array.isArray(input.recentModels)
      ? input.recentModels.map(mergeRecentModelEntry).filter((value): value is RecentModelEntry => value !== null).slice(0, MAX_RECENT_MODELS)
      : defaults.recentModels,
    characterPresets: Array.isArray(input.characterPresets)
      ? input.characterPresets.map(mergeCharacterPreset).filter((value): value is CharacterPreset => value !== null)
      : defaults.characterPresets,
    terrain: mergeTerrainSessionState(input.terrain),
    character: mergeCharacterSessionState(input.character),
    bmd: mergeBmdSessionState(input.bmd),
  };
}

function cloneState<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class ExplorerStateStore {
  private readonly key: string;
  private readonly storage: StorageLike | null;
  private state: ViewerSessionState;
  private readonly listeners = new Set<(state: ViewerSessionState) => void>();

  constructor(storage: StorageLike | null = typeof window !== 'undefined' ? window.localStorage : null, key = STORAGE_KEY) {
    this.storage = storage;
    this.key = key;
    this.state = this.load();
  }

  getState(): ViewerSessionState {
    return cloneState(this.state);
  }

  subscribe(listener: (state: ViewerSessionState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  setActiveView(activeView: ViewerTab): void {
    this.update(state => {
      state.activeView = activeView;
    });
  }

  setPresentationMode(enabled: boolean): void {
    this.update(state => {
      state.presentationMode = enabled;
    });
  }

  setTerrainState(terrain: TerrainSessionState): void {
    this.update(state => {
      state.terrain = cloneState(terrain);
    });
  }

  setCharacterState(character: CharacterSessionState): void {
    this.update(state => {
      state.character = cloneState(character);
    });
  }

  setBmdState(bmd: BmdSessionState): void {
    this.update(state => {
      state.bmd = cloneState(bmd);
    });
  }

  upsertBookmark(bookmark: ExplorerBookmark): void {
    this.update(state => {
      const index = state.bookmarks.findIndex(item => item.id === bookmark.id);
      if (index >= 0) {
        state.bookmarks[index] = cloneState(bookmark);
      } else {
        state.bookmarks.unshift(cloneState(bookmark));
      }
      state.bookmarks.sort((a, b) => b.updatedAt - a.updatedAt);
    });
  }

  renameBookmark(bookmarkId: string, name: string): void {
    this.update(state => {
      const bookmark = state.bookmarks.find(item => item.id === bookmarkId);
      if (!bookmark) return;
      bookmark.name = name;
      bookmark.updatedAt = Date.now();
      state.recentBookmarks.forEach(entry => {
        if (entry.bookmarkId === bookmarkId) {
          entry.label = name;
        }
      });
    });
  }

  deleteBookmark(bookmarkId: string): void {
    this.update(state => {
      state.bookmarks = state.bookmarks.filter(item => item.id !== bookmarkId);
      state.recentBookmarks = state.recentBookmarks.filter(item => item.bookmarkId !== bookmarkId);
    });
  }

  upsertCharacterPreset(preset: CharacterPreset): void {
    this.update(state => {
      const index = state.characterPresets.findIndex(item => item.id === preset.id);
      if (index >= 0) {
        state.characterPresets[index] = cloneState(preset);
      } else {
        state.characterPresets.push(cloneState(preset));
      }
      state.characterPresets.sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    });
  }

  toggleCharacterPresetPinned(presetId: string): void {
    this.update(state => {
      const preset = state.characterPresets.find(item => item.id === presetId);
      if (!preset) return;
      preset.pinned = !preset.pinned;
      preset.updatedAt = Date.now();
      state.characterPresets.sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    });
  }

  deleteCharacterPreset(presetId: string): void {
    this.update(state => {
      state.characterPresets = state.characterPresets.filter(item => item.id !== presetId);
    });
  }

  pushRecentWorld(entry: RecentWorldEntry): void {
    this.update(state => {
      state.recentWorlds = [entry, ...state.recentWorlds.filter(item => item.worldNumber !== entry.worldNumber)]
        .slice(0, MAX_RECENT_WORLDS);
    });
  }

  pushRecentBookmark(entry: RecentBookmarkEntry): void {
    this.update(state => {
      state.recentBookmarks = [entry, ...state.recentBookmarks.filter(item => item.bookmarkId !== entry.bookmarkId)]
        .slice(0, MAX_RECENT_BOOKMARKS);
    });
  }

  pushRecentModel(entry: RecentModelEntry): void {
    this.update(state => {
      state.recentModels = [entry, ...state.recentModels.filter(item =>
        item.label !== entry.label || item.modelFileKey !== entry.modelFileKey,
      )].slice(0, MAX_RECENT_MODELS);
    });
  }

  update(mutator: (state: ViewerSessionState) => void): void {
    const nextState = cloneState(this.state);
    mutator(nextState);
    this.state = mergeViewerSessionState(nextState);
    this.persist();
    this.emit();
  }

  private load(): ViewerSessionState {
    if (!this.storage) {
      return createDefaultViewerSessionState();
    }

    try {
      const raw = this.storage.getItem(this.key);
      if (!raw) {
        return createDefaultViewerSessionState();
      }
      return mergeViewerSessionState(JSON.parse(raw));
    } catch {
      return createDefaultViewerSessionState();
    }
  }

  private persist(): void {
    if (!this.storage) return;
    this.storage.setItem(this.key, JSON.stringify(this.state));
  }

  private emit(): void {
    const snapshot = this.getState();
    this.listeners.forEach(listener => listener(snapshot));
  }
}
