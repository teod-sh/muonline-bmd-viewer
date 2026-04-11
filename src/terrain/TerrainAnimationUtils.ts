import * as THREE from 'three';

export interface TerrainInstancingEligibility {
    meshCount: number;
    hasSkinnedMeshes: boolean;
    animationCount: number;
}

export function canUseInstancedStaticObjects(eligibility: TerrainInstancingEligibility): boolean {
    return eligibility.meshCount > 0
        && !eligibility.hasSkinnedMeshes
        && eligibility.animationCount === 0;
}

export function isObjectVisibleInHierarchy(object: THREE.Object3D | null): boolean {
    if (!object) {
        return false;
    }

    let current: THREE.Object3D | null = object;
    while (current) {
        if (!current.visible) {
            return false;
        }
        current = current.parent;
    }

    return true;
}
