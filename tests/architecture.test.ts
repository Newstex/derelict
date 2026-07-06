/**
 * Architecture tests — guard sim/render separation and determinism invariants.
 *
 * These tests ensure the core architectural rules are never violated:
 * - src/sim/ has zero Three.js/DOM/render imports
 * - No Math.random in src/sim/ (except seed generation in world.ts)
 * - No DOM types in src/sim/
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const SIM_DIR = path.resolve(__dirname, '../src/sim');

function getSimFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getSimFiles(fullPath));
    } else if (entry.name.endsWith('.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

const simFiles = getSimFiles(SIM_DIR);

/** Strip comments and strings from TS source for invariant checks. */
function stripComments(src: string): string {
  // Remove block comments
  let out = src.replace(/\/\*[\s\S]*?\*\//g, '');
  // Remove line comments
  out = out.replace(/\/\/.*$/gm, '');
  return out;
}

const simFilesCode = simFiles.map(f => ({
  path: f,
  code: stripComments(fs.readFileSync(f, 'utf-8')),
}));

describe('Architecture — sim isolation', () => {
  it('src/sim/ has TypeScript files', () => {
    expect(simFiles.length).toBeGreaterThan(0);
  });

  it('no file in src/sim/ imports three', () => {
    for (const { path: file, code } of simFilesCode) {
      expect(
        code,
        `${file} should not import three`
      ).not.toMatch(/from\s+['"]three['"]/);
    }
  });

  it('no file in src/sim/ imports from render/', () => {
    for (const { path: file, code } of simFilesCode) {
      expect(
        code,
        `${file} should not import from render/`
      ).not.toMatch(/from\s+['"]\.\.\/render\//);
      expect(
        code,
        `${file} should not import from render/`
      ).not.toMatch(/from\s+['"]\.\.\/\.\.\/render\//);
    }
  });

  it('no file in src/sim/ imports from game/', () => {
    for (const { path: file, code } of simFilesCode) {
      expect(
        code,
        `${file} should not import from game/`
      ).not.toMatch(/from\s+['"]\.\.\/game\//);
      expect(
        code,
        `${file} should not import from game/`
      ).not.toMatch(/from\s+['"]\.\.\/\.\.\/game\//);
    }
  });

  it('no file in src/sim/ imports from ui/', () => {
    for (const { path: file, code } of simFilesCode) {
      expect(
        code,
        `${file} should not import from ui/`
      ).not.toMatch(/from\s+['"]\.\.\/ui\//);
      expect(
        code,
        `${file} should not import from ui/`
      ).not.toMatch(/from\s+['"]\.\.\/\.\.\/ui\//);
    }
  });

  it('no DOM API usage (document, window, navigator) in src/sim/', () => {
    for (const { path: file, code } of simFilesCode) {
      expect(
        code,
        `${file} should not use document`
      ).not.toMatch(/\bdocument\b/);
      expect(
        code,
        `${file} should not use window`
      ).not.toMatch(/\bwindow\b/);
      expect(
        code,
        `${file} should not use navigator`
      ).not.toMatch(/\bnavigator\b/);
    }
  });

  it('Math.random only in world.ts for seed generation', () => {
    for (const { path: file, code } of simFilesCode) {
      const basename = path.basename(file);

      if (basename === 'world.ts') {
        const matches = code.match(/Math\.random/g);
        if (matches) {
          expect(
            matches.length,
            `${file} should use Math.random sparingly (only for seed/crit)`
          ).toBeLessThanOrEqual(1);
        }
      } else {
        expect(
          code,
          `${file} should not use Math.random`
        ).not.toMatch(/Math\.random/);
      }
    }
  });

  it('no Date.now() in src/sim/', () => {
    for (const { path: file, code } of simFilesCode) {
      expect(
        code,
        `${file} should not use Date.now()`
      ).not.toMatch(/Date\.now/);
    }
  });

  it('no performance.now() in src/sim/', () => {
    for (const { path: file, code } of simFilesCode) {
      expect(
        code,
        `${file} should not use performance.now()`
      ).not.toMatch(/performance\.now/);
    }
  });
});