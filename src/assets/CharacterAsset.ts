import * as THREE from 'three';

export class CharacterAsset {
    public mesh: THREE.Group | null = null;
    public animations: Map<string, THREE.AnimationClip> = new Map();
    public mixer: THREE.AnimationMixer | null = null;
    private currentAction: THREE.AnimationAction | null = null;

    async loadFromGLB(url: string): Promise<void> {
        const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
        const loader = new GLTFLoader();
        return new Promise((resolve, reject) => {
            loader.load(url, (gltf) => {
                this.mesh = gltf.scene;
                this.mixer = new THREE.AnimationMixer(gltf.scene);
                for (const clip of gltf.animations) {
                    this.animations.set(clip.name, clip);
                }
                resolve();
            }, undefined, reject);
        });
    }

    playAnimation(name: string): boolean {
        const clip = this.animations.get(name);
        if (!clip || !this.mixer) return false;
        if (this.currentAction) this.currentAction.stop();
        this.currentAction = this.mixer.clipAction(clip);
        this.currentAction.play();
        return true;
    }

    setMeshVisible(visible: boolean): void {
        if (this.mesh) this.mesh.visible = visible;
    }

    update(delta: number): void {
        if (this.mixer) this.mixer.update(delta);
    }

    dispose(): void {
        this.mesh = null;
        this.animations.clear();
        this.mixer = null;
        this.currentAction = null;
    }
}