import * as THREE from 'three';

export interface TerrainObjectDrawRangeSphere {
    center: THREE.Vector3;
    radius: number;
}

export function getTerrainObjectCullingChunkKeys(
    worldX: number,
    worldZ: number,
    range: number,
    chunkSize: number,
): string[] {
    const safeRange = Math.max(0, range);
    const startX = Math.floor((worldX - safeRange) / chunkSize);
    const endX = Math.floor((worldX + safeRange) / chunkSize);
    const startZ = Math.floor((worldZ - safeRange) / chunkSize);
    const endZ = Math.floor((worldZ + safeRange) / chunkSize);
    const keys: string[] = [];

    for (let z = startZ; z <= endZ; z++) {
        for (let x = startX; x <= endX; x++) {
            keys.push(`${x}:${z}`);
        }
    }

    return keys;
}

export function getTerrainObjectDrawRangeSphere(
    object: THREE.Object3D,
    targetCenter: THREE.Vector3,
    targetScale: THREE.Vector3,
): TerrainObjectDrawRangeSphere {
    const precomputed = object.userData.cullBoundingSphere as THREE.Sphere | undefined;
    if (precomputed) {
        targetCenter.copy(precomputed.center);
        return { center: targetCenter, radius: precomputed.radius };
    }

    const instancedMesh = object as THREE.InstancedMesh;
    if (instancedMesh.isInstancedMesh) {
        if (!instancedMesh.boundingSphere) {
            instancedMesh.computeBoundingSphere();
        }
        if (instancedMesh.boundingSphere) {
            targetCenter.copy(instancedMesh.boundingSphere.center).applyMatrix4(object.matrixWorld);
            targetScale.setFromMatrixScale(object.matrixWorld);
            return {
                center: targetCenter,
                radius: instancedMesh.boundingSphere.radius * Math.max(targetScale.x, targetScale.y, targetScale.z),
            };
        }
    }

    const geometry = (object as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
    if (geometry) {
        if (!geometry.boundingSphere) {
            geometry.computeBoundingSphere();
        }
        if (geometry.boundingSphere) {
            targetCenter.copy(geometry.boundingSphere.center).applyMatrix4(object.matrixWorld);
            targetScale.setFromMatrixScale(object.matrixWorld);
            return {
                center: targetCenter,
                radius: geometry.boundingSphere.radius * Math.max(targetScale.x, targetScale.y, targetScale.z),
            };
        }
    }

    object.getWorldPosition(targetCenter);
    return { center: targetCenter, radius: 0 };
}
