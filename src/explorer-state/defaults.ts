import type {
  BmdSessionState,
  CharacterSessionState,
  TerrainSessionState,
  ViewerSessionState,
} from '../explorer-types';
import { STATE_VERSION } from './constants';

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
    rendererBackend: 'auto',
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
    rendererBackend: 'auto',
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
