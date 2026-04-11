import * as THREE from 'three';
import {
  canUseInstancedStaticObjects,
  isObjectVisibleInHierarchy,
} from '../src/terrain/TerrainAnimationUtils';

describe('TerrainAnimationUtils', () => {
  it('allows instancing only for static non-skinned templates', () => {
    expect(canUseInstancedStaticObjects({
      meshCount: 2,
      hasSkinnedMeshes: false,
      animationCount: 0,
    })).toBe(true);

    expect(canUseInstancedStaticObjects({
      meshCount: 2,
      hasSkinnedMeshes: false,
      animationCount: 1,
    })).toBe(false);

    expect(canUseInstancedStaticObjects({
      meshCount: 2,
      hasSkinnedMeshes: true,
      animationCount: 0,
    })).toBe(false);

    expect(canUseInstancedStaticObjects({
      meshCount: 0,
      hasSkinnedMeshes: false,
      animationCount: 0,
    })).toBe(false);
  });

  it('treats objects as visible only when the full parent chain is visible', () => {
    const root = new THREE.Group();
    const child = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());

    root.add(child);
    child.add(mesh);

    expect(isObjectVisibleInHierarchy(mesh)).toBe(true);

    child.visible = false;
    expect(isObjectVisibleInHierarchy(mesh)).toBe(false);

    child.visible = true;
    root.visible = false;
    expect(isObjectVisibleInHierarchy(mesh)).toBe(false);
  });
});
