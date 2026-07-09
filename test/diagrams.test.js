const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { listMmdFiles, resolveDiagramPath, decodeDiagramBuffer } = require('../lib/diagrams');

function makeTempDiagramsDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mermaid-viewer-test-'));
}

test('resolveDiagramPath', async (t) => {
  const root = makeTempDiagramsDir();
  fs.writeFileSync(path.join(root, 'example.mmd'), 'graph TD; A-->B');
  fs.mkdirSync(path.join(root, 'subfolder'));
  fs.writeFileSync(path.join(root, 'subfolder', 'nested.mmd'), 'graph TD; A-->B');

  await t.test('accepts a valid top-level .mmd path', () => {
    const resolved = resolveDiagramPath(root, 'example.mmd');
    assert.equal(resolved, path.resolve(root, 'example.mmd'));
  });

  await t.test('accepts a valid nested .mmd path', () => {
    const resolved = resolveDiagramPath(root, 'subfolder/nested.mmd');
    assert.equal(resolved, path.resolve(root, 'subfolder', 'nested.mmd'));
  });

  await t.test('rejects ../../ style traversal', () => {
    assert.equal(resolveDiagramPath(root, '../../etc/passwd.mmd'), null);
  });

  await t.test('rejects an absolute path outside the root', () => {
    const outside = path.resolve(os.tmpdir(), 'outside.mmd');
    assert.equal(resolveDiagramPath(root, outside), null);
  });

  await t.test('rejects a non-.mmd extension', () => {
    assert.equal(resolveDiagramPath(root, 'example.txt'), null);
  });

  await t.test('rejects a non-string / missing path', () => {
    assert.equal(resolveDiagramPath(root, undefined), null);
    assert.equal(resolveDiagramPath(root, null), null);
    assert.equal(resolveDiagramPath(root, ['example.mmd']), null);
  });
});

test('listMmdFiles', async (t) => {
  await t.test('finds .mmd files at root and in nested subfolders', () => {
    const root = makeTempDiagramsDir();
    fs.writeFileSync(path.join(root, 'a.mmd'), '');
    fs.writeFileSync(path.join(root, 'notes.txt'), '');
    fs.mkdirSync(path.join(root, 'sub'));
    fs.writeFileSync(path.join(root, 'sub', 'b.mmd'), '');

    const files = listMmdFiles(root).sort();
    assert.deepEqual(files, ['a.mmd', 'sub/b.mmd']);
  });

  await t.test('returns [] for a missing directory instead of throwing', () => {
    const missing = path.join(makeTempDiagramsDir(), 'does-not-exist');
    assert.deepEqual(listMmdFiles(missing), []);
  });
});

test('decodeDiagramBuffer', async (t) => {
  const sample = 'flowchart TD\n  A-->B';

  await t.test('plain UTF-8 (no BOM)', () => {
    const buf = Buffer.from(sample, 'utf8');
    assert.equal(decodeDiagramBuffer(buf), sample);
  });

  await t.test('UTF-8 with BOM', () => {
    const buf = Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from(sample, 'utf8')]);
    assert.equal(decodeDiagramBuffer(buf), sample);
  });

  await t.test('UTF-16 LE with BOM', () => {
    const buf = Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from(sample, 'utf16le')]);
    assert.equal(decodeDiagramBuffer(buf), sample);
  });

  await t.test('UTF-16 BE with BOM (regression test — used to throw)', () => {
    const le = Buffer.from(sample, 'utf16le');
    const be = Buffer.alloc(le.length);
    for (let i = 0; i + 1 < le.length; i += 2) {
      be[i] = le[i + 1];
      be[i + 1] = le[i];
    }
    const buf = Buffer.concat([Buffer.from([0xFE, 0xFF]), be]);
    assert.equal(decodeDiagramBuffer(buf), sample);
  });
});
