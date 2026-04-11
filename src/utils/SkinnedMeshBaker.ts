import * as THREE from 'three';

const tempPosition = new THREE.Vector3();
const tempNormal = new THREE.Vector3();
const tempMatrix = new THREE.Matrix4();
const objectToRootMatrix = new THREE.Matrix4();
const rootWorldInverseMatrix = new THREE.Matrix4();
const normalMatrix = new THREE.Matrix3();
const skinMatrix = new THREE.Matrix4();
const boneMatrix = new THREE.Matrix4();

function addScaledMatrix(target: THREE.Matrix4, source: THREE.Matrix4, scale: number): void {
    const targetElements = target.elements;
    const sourceElements = source.elements;

    for (let i = 0; i < 16; i++) {
        targetElements[i] += sourceElements[i] * scale;
    }
}

function applySkinnedNormalTransform(
    skinnedMesh: THREE.SkinnedMesh,
    vertexIndex: number,
    normal: THREE.Vector3,
): void {
    const skinIndex = skinnedMesh.geometry.getAttribute('skinIndex');
    const skinWeight = skinnedMesh.geometry.getAttribute('skinWeight');

    if (!skinIndex || !skinWeight) {
        return;
    }

    const boneMatrices = skinnedMesh.skeleton.boneMatrices;
    if (!boneMatrices) {
        return;
    }

    skinMatrix.elements.fill(0);

    for (let i = 0; i < 4; i++) {
        const weight = skinWeight.getComponent(vertexIndex, i);
        if (weight === 0) continue;

        const boneIndex = skinIndex.getComponent(vertexIndex, i);
        boneMatrix.fromArray(boneMatrices, boneIndex * 16);
        addScaledMatrix(skinMatrix, boneMatrix, weight);
    }

    tempMatrix
        .multiplyMatrices(skinnedMesh.bindMatrixInverse, skinMatrix)
        .multiply(skinnedMesh.bindMatrix);
    normal.applyMatrix4(tempMatrix).normalize();
}

function copyRootTransform(source: THREE.Group, target: THREE.Group): void {
    target.name = source.name;
    target.position.copy(source.position);
    target.quaternion.copy(source.quaternion);
    target.scale.copy(source.scale);
    target.matrixAutoUpdate = source.matrixAutoUpdate;

    if (!source.matrixAutoUpdate) {
        target.matrix.copy(source.matrix);
    }
}

function bakeMeshGeometryToRootSpace(mesh: THREE.Mesh, rootWorldInverse: THREE.Matrix4): THREE.BufferGeometry {
    const sourceGeometry = mesh.geometry as THREE.BufferGeometry;
    const bakedGeometry = sourceGeometry.clone();
    const positionAttribute = sourceGeometry.getAttribute('position');
    const normalAttribute = sourceGeometry.getAttribute('normal');
    const bakedPositions = new Float32Array(positionAttribute.count * 3);
    const bakedNormals = normalAttribute ? new Float32Array(normalAttribute.count * 3) : null;
    const skinnedMesh = (mesh as THREE.SkinnedMesh).isSkinnedMesh
        ? mesh as THREE.SkinnedMesh
        : null;

    objectToRootMatrix.multiplyMatrices(rootWorldInverse, mesh.matrixWorld);
    normalMatrix.getNormalMatrix(objectToRootMatrix);

    if (skinnedMesh) {
        skinnedMesh.skeleton.update();
    }

    for (let i = 0; i < positionAttribute.count; i++) {
        tempPosition.fromBufferAttribute(positionAttribute, i);

        if (skinnedMesh) {
            skinnedMesh.applyBoneTransform(i, tempPosition);
        }

        tempPosition.applyMatrix4(objectToRootMatrix);
        bakedPositions[i * 3] = tempPosition.x;
        bakedPositions[i * 3 + 1] = tempPosition.y;
        bakedPositions[i * 3 + 2] = tempPosition.z;

        if (!normalAttribute || !bakedNormals) continue;

        tempNormal.fromBufferAttribute(normalAttribute, i);

        if (skinnedMesh) {
            applySkinnedNormalTransform(skinnedMesh, i, tempNormal);
        }

        tempNormal.applyMatrix3(normalMatrix).normalize();
        bakedNormals[i * 3] = tempNormal.x;
        bakedNormals[i * 3 + 1] = tempNormal.y;
        bakedNormals[i * 3 + 2] = tempNormal.z;
    }

    bakedGeometry.setAttribute('position', new THREE.Float32BufferAttribute(bakedPositions, 3));

    if (bakedNormals) {
        bakedGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(bakedNormals, 3));
    } else {
        bakedGeometry.computeVertexNormals();
    }

    bakedGeometry.deleteAttribute('skinIndex');
    bakedGeometry.deleteAttribute('skinWeight');
    bakedGeometry.computeBoundingBox();
    bakedGeometry.computeBoundingSphere();

    return bakedGeometry;
}

export function bakeSkinnedModelForExport(source: THREE.Group): THREE.Group {
    source.updateMatrixWorld(true);
    rootWorldInverseMatrix.copy(source.matrixWorld).invert();

    const bakedRoot = new THREE.Group();
    copyRootTransform(source, bakedRoot);

    source.traverse(object => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        if (!mesh.visible) return;

        const bakedMesh = new THREE.Mesh(
            bakeMeshGeometryToRootSpace(mesh, rootWorldInverseMatrix),
            mesh.material,
        );
        bakedMesh.name = mesh.name;
        bakedMesh.userData = { ...mesh.userData };
        bakedRoot.add(bakedMesh);
    });

    return bakedRoot;
}
