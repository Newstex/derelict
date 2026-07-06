export enum AssetType {
    Character = 'character',
    Prop = 'prop',
    Environment = 'environment',
    Animation = 'animation',
}

export enum PipelineStage {
    Constraints = 'constraints',
    ModelGeneration = 'model_generation',
    Rigging = 'rigging',
    Animation = 'animation',
    Retargeting = 'retargeting',
    WorldAssets = 'world_assets',
    Integration = 'integration',
    Complete = 'complete',
}

export interface AssetRecord {
    id: string;
    name: string;
    type: AssetType;
    stage: PipelineStage;
    filePath?: string;
    createdAt: Date;
    updatedAt: Date;
}

export class AssetManifest {
    private assets: Map<string, AssetRecord> = new Map();

    register(id: string, name: string, type: AssetType): AssetRecord {
        const record: AssetRecord = {
            id, name, type,
            stage: PipelineStage.Constraints,
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        this.assets.set(id, record);
        return record;
    }

    advanceStage(id: string): boolean {
        const record = this.assets.get(id);
        if (!record) return false;
        const stages = Object.values(PipelineStage);
        const currentIdx = stages.indexOf(record.stage);
        if (currentIdx < stages.length - 1) {
            record.stage = stages[currentIdx + 1];
            record.updatedAt = new Date();
            return true;
        }
        return false;
    }

    getAsset(id: string): AssetRecord | undefined {
        return this.assets.get(id);
    }

    getAllAssets(): AssetRecord[] {
        return Array.from(this.assets.values());
    }

    getByStage(stage: PipelineStage): AssetRecord[] {
        return Array.from(this.assets.values()).filter(a => a.stage === stage);
    }

    setFilePath(id: string, path: string): boolean {
        const record = this.assets.get(id);
        if (!record) return false;
        record.filePath = path;
        record.updatedAt = new Date();
        return true;
    }

    remove(id: string): boolean {
        return this.assets.delete(id);
    }

    count(): number {
        return this.assets.size;
    }
}