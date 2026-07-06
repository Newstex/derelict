import { describe, it, expect } from 'vitest';
import { AssetManifest, AssetType, PipelineStage } from '../src/assets/AssetPipeline';

describe('AssetManifest', () => {
  it('should register a new asset', () => {
    const manifest = new AssetManifest();
    const entry = manifest.register('Scientist', AssetType.Character);
    expect(entry.name).toBe('Scientist');
    expect(entry.type).toBe(AssetType.Character);
    expect(entry.stage).toBe(PipelineStage.ImageSheet);
  });

  it('should advance through pipeline stages', () => {
    const manifest = new AssetManifest();
    const entry = manifest.register('Engineer', AssetType.Character);
    manifest.advance(entry.id, PipelineStage.ModelGenerated);
    const updated = manifest.get(entry.id);
    expect(updated!.stage).toBe(PipelineStage.ModelGenerated);
  });

  it('should not regress to an earlier stage', () => {
    const manifest = new AssetManifest();
    const entry = manifest.register('Marine', AssetType.Character);
    manifest.advance(entry.id, PipelineStage.Rigged);
    expect(() => manifest.advance(entry.id, PipelineStage.ImageSheet)).toThrow();
  });

  it('should get assets by stage', () => {
    const manifest = new AssetManifest();
    const e1 = manifest.register('Asset1', AssetType.Character);
    manifest.register('Asset2', AssetType.Prop);
    manifest.advance(e1.id, PipelineStage.ModelGenerated);
    const atModelGen = manifest.byStage(PipelineStage.ModelGenerated);
    expect(atModelGen.length).toBe(1);
    expect(atModelGen[0].id).toBe(e1.id);
  });

  it('should get assets by type', () => {
    const manifest = new AssetManifest();
    manifest.register('Char1', AssetType.Character);
    manifest.register('Prop1', AssetType.Prop);
    manifest.register('Char2', AssetType.Character);
    const chars = manifest.byType(AssetType.Character);
    expect(chars.length).toBe(2);
  });

  it('should remove assets', () => {
    const manifest = new AssetManifest();
    const entry = manifest.register('Asset1', AssetType.Character);
    expect(manifest.size).toBe(1);
    manifest.remove(entry.id);
    expect(manifest.size).toBe(0);
  });

  it('should return undefined for unknown asset lookups', () => {
    const manifest = new AssetManifest();
    expect(manifest.get('unknown')).toBeUndefined();
  });

  it('should support toJSON serialization', () => {
    const manifest = new AssetManifest();
    manifest.register('Asset1', AssetType.Character);
    const json = manifest.toJSON();
    expect(json.length).toBe(1);
    expect(json[0].name).toBe('Asset1');
  });
});