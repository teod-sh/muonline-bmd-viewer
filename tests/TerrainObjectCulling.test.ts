import * as THREE from 'three';
import {
    getTerrainObjectCullingChunkKeys,
    getTerrainObjectDrawRangeSphere,
} from '../src/terrain/TerrainObjectCulling';

describe('TerrainObjectCulling', () => {
    it('uses InstancedMesh bounds instead of the source geometry bounds', () => {
        const geometry = new THREE.BoxGeometry(2, 2, 2);
        const instancedMesh = new THREE.InstancedMesh(geometry, new THREE.MeshBasicMaterial(), 1);
        instancedMesh.setMatrixAt(0, new THREE.Matrix4().makeTranslation(100, 0, 0));
        instancedMesh.instanceMatrix.needsUpdate = true;
        instancedMesh.computeBoundingSphere();
        instancedMesh.updateMatrixWorld(true);

        const sphere = getTerrainObjectDrawRangeSphere(
            instancedMesh,
            new THREE.Vector3(),
            new THREE.Vector3(),
        );

        expect(sphere.center.x).toBeCloseTo(100);
        expect(sphere.center.y).toBeCloseTo(0);
        expect(sphere.center.z).toBeCloseTo(0);
        expect(sphere.radius).toBeGreaterThan(1);
    });

    it('returns only chunk keys intersecting a culling range', () => {
        expect(getTerrainObjectCullingChunkKeys(1500, 2500, 600, 1000)).toEqual([
            '0:1', '1:1', '2:1',
            '0:2', '1:2', '2:2',
            '0:3', '1:3', '2:3',
        ]);
    });
});
