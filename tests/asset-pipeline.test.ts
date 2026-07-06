import { describe, it, expect } from 'vitest';
import { AssetManifest, AssetType, PipelineStage } from '../src/assets/AssetPipeline';

describe('AssetManifest', () => {
    it('should register a new asset', () => {
        const manifest = new AssetManifest();
        const record = manifest.register('char-001', 'Scientist', AssetType.Character);
        expect(record.id).toBe('char-001');
        expect(record.name).toBe('Scientist');
        expect(record.type).toBe(AssetType.Character);
        expect(record.stage).toBe(PipelineStage.Constraints);
    });

    it('should advance through pipeline stages', () => {
        const manifest = new AssetManifest();
        manifest.register('char-002', 'Engineer', AssetType.Character);
        expect(manifest.advanceStage('char-002')).toBe(true);
        const record = manifest.getAsset('char-002');
        expect(record!.stage).toBe(PipelineStage.ModelGeneration);
    });

    it('should not advance past complete', () => {
        const manifest = new AssetManifest();
        manifest.register('char-003', 'Marine', AssetType.Character);
        const stages = Object.values(PipelineStage);
        for (let i = 0; i < stages.length - 1; i++) {
            manifest.advanceStage('char-003');
        }
        expect(manifest.advanceStage('char-003')).toBe(false);
    });

    it('should get assets by stage', () => {
        const manifest = new AssetManifest();
        manifest.register('a1', 'Asset1', AssetType.Character);
        manifest.register('a2', 'Asset2', AssetType.Prop);
        manifest.advanceStage('a1');
        const atModelGen = manifest.getByStage(PipelineStage.ModelGeneration);
        expect(atModelGen.length).toBe(1);
        expect(atModelGen[0].id).toBe('a1');
    });

    it('should set file path', () => {
        const manifest = new AssetManifest();
        manifest.register('a1', 'Asset1', AssetType.Environment);
        expect(manifest.setFilePath('a1', '/assets/env/station.glb')).toBe(true);
        expect(manifest.getAsset('a1')!.filePath).toBe('/assets/env/station.glb');
    });

    it('should remove assets', () => {
        const manifest = new AssetManifest();
        manifest.register('a1', 'Asset1', AssetType.Character);
        expect(manifest.count()).toBe(1);
        manifest.remove('a1');
        expect(manifest.count()).toBe(0);
    });

    it('should return false for unknown asset operations', () => {
        const manifest = new AssetManifest();
        expect(manifest.advanceStage('unknown')).toBe(false);
        expect(manifest.setFilePath('unknown', '/path')).toBe(false);
        expect(manifest.getAsset('unknown')).toBeUndefined();
    });
});