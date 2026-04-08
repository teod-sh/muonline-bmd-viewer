import {
  ExplorerStateStore,
  createDefaultViewerSessionState,
  mergeViewerSessionState,
} from '../src/explorer-store';

class MemoryStorage {
  private readonly store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

describe('mergeViewerSessionState', () => {
  it('fills defaults for missing and invalid values', () => {
    const merged = mergeViewerSessionState({
      activeView: 'terrain',
      presentationMode: true,
      terrain: {
        lastWorldNumber: 7,
        availableWorldNumbers: [7, 'bad', 8],
        selectedObject: {
          objectId: 'obj-1',
          worldNumber: 7,
          type: 12,
          displayName: 'Tree',
          position: { x: 10, z: 20 },
          rotation: { y: 45 },
        },
      },
      character: {
        classValue: 203,
        equipment: { helm: '7:12' },
      },
      bmd: {
        lastModelName: 'Tree01.bmd',
      },
    });

    expect(merged.activeView).toBe('terrain');
    expect(merged.presentationMode).toBe(true);
    expect(merged.terrain.lastWorldNumber).toBe(7);
    expect(merged.terrain.availableWorldNumbers).toEqual([7, 8]);
    expect(merged.terrain.selectedObject).toEqual({
      objectId: 'obj-1',
      worldNumber: 7,
      type: 12,
      modelName: null,
      modelFileKey: null,
      displayName: 'Tree',
      position: { x: 10, y: 0, z: 20 },
      rotation: { x: 0, y: 45, z: 0 },
      scale: 1,
    });
    expect(merged.character.classValue).toBe(203);
    expect(merged.character.equipment.helm).toBe('7:12');
    expect(merged.character.equipment.armor).toBe('');
    expect(merged.bmd.lastModelName).toBe('Tree01.bmd');
  });

  it('drops malformed collections instead of crashing', () => {
    const merged = mergeViewerSessionState({
      bookmarks: [{ broken: true }],
      recentWorlds: [{ label: 'bad' }],
      recentBookmarks: [{ label: 'bad' }],
      recentModels: [{ timestamp: 1 }],
      characterPresets: [{ id: 'preset-1' }],
    });

    const defaults = createDefaultViewerSessionState();
    expect(merged.bookmarks).toEqual(defaults.bookmarks);
    expect(merged.recentWorlds).toEqual(defaults.recentWorlds);
    expect(merged.recentBookmarks).toEqual(defaults.recentBookmarks);
    expect(merged.recentModels).toEqual(defaults.recentModels);
    expect(merged.characterPresets).toEqual(defaults.characterPresets);
  });
});

describe('ExplorerStateStore', () => {
  it('deduplicates recents and persists bookmark renames', () => {
    const storage = new MemoryStorage();
    const store = new ExplorerStateStore(storage);

    store.upsertBookmark({
      id: 'bookmark-1',
      name: 'Lorencia Gate',
      worldNumber: 0,
      cameraPosition: { x: 10, y: 20, z: 30 },
      cameraTarget: { x: 12, y: 0, z: 18 },
      selectedObject: null,
      createdAt: 1,
      updatedAt: 1,
    });
    store.pushRecentBookmark({
      bookmarkId: 'bookmark-1',
      label: 'Lorencia Gate',
      timestamp: 100,
    });
    store.pushRecentBookmark({
      bookmarkId: 'bookmark-1',
      label: 'Lorencia Gate',
      timestamp: 150,
    });
    store.pushRecentWorld({
      worldNumber: 0,
      label: 'World 0',
      timestamp: 10,
    });
    store.pushRecentWorld({
      worldNumber: 0,
      label: 'World 0',
      timestamp: 20,
    });
    store.renameBookmark('bookmark-1', 'Lorencia Spawn');

    const snapshot = store.getState();
    expect(snapshot.recentBookmarks).toHaveLength(1);
    expect(snapshot.recentBookmarks[0]).toEqual({
      bookmarkId: 'bookmark-1',
      label: 'Lorencia Spawn',
      timestamp: 150,
    });
    expect(snapshot.recentWorlds).toHaveLength(1);
    expect(snapshot.recentWorlds[0].timestamp).toBe(20);
    expect(snapshot.bookmarks[0].name).toBe('Lorencia Spawn');

    const restored = new ExplorerStateStore(storage).getState();
    expect(restored.bookmarks[0].name).toBe('Lorencia Spawn');
    expect(restored.recentBookmarks[0].label).toBe('Lorencia Spawn');
  });
});
