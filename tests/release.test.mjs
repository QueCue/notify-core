import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { verifyPackage } from '../scripts/verify-package.mjs';

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'notify-core-release-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'src'));
  await writeFile(path.join(root, 'src/index.ts'), '');
  await mkdir(path.join(root, 'package'));
  const metadata = { name: '@quecue/notify-core', version: '0.1.0',
    repository: { url: 'git+https://github.com/QueCue/notify-core.git' },
    publishConfig: { access: 'public', registry: 'https://registry.npmjs.org/' } };
  await writeFile(path.join(root, 'package.json'), JSON.stringify(metadata));
  const pack = { name: metadata.name, version: metadata.version, filename: 'notify-core-0.1.0.tgz',
    files: ['package.json', 'README.md', 'README.en.md', 'SECURITY.md', 'SECURITY.en.md',
      'CONTRIBUTING.md', 'PUBLISHING.md', 'CHANGELOG.md', 'CHANGELOG.en.md', 'LICENSE',
      'dist/index.js', 'dist/index.d.ts'].map(path => ({ path })) };
  const repack = async () => {
    await writeFile(path.join(root, 'package/package.json'), JSON.stringify(metadata));
    execFileSync('tar', ['-czf', pack.filename, 'package/package.json'], { cwd: root, windowsHide: true });
    pack.integrity = 'sha512-' + createHash('sha512').update(await readFile(path.join(root, pack.filename))).digest('base64');
  };
  await repack();
  const run = async (version = '0.1.0') => {
    await writeFile(path.join(root, 'pack.json'), JSON.stringify([pack]));
    return verifyPackage(path.join(root, 'pack.json'), root, root, version);
  };
  return { root, metadata, pack, run, repack };
}

test('发行校验接受精确版本、白名单和完整性', async t => {
  const f = await fixture(t);
  assert.deepEqual(await f.run(), { version: '0.1.0', dist_tag: 'latest', filename: f.pack.filename, integrity: f.pack.integrity });
});
test('发行校验拒绝请求版本与源码不符', async t => {
  const f = await fixture(t);
  await assert.rejects(f.run('0.2.0'), /版本/);
});
test('发行校验拒绝额外文件及缺失声明', async t => {
  const f = await fixture(t);
  f.pack.files.push({ path: '.env' });
  await assert.rejects(f.run(), /白名单/);
  f.pack.files.pop();
  f.pack.files = f.pack.files.filter(file => file.path !== 'dist/index.d.ts');
  await assert.rejects(f.run(), /白名单/);
});
test('发行校验拒绝重复清单路径', async t => {
  const f = await fixture(t);
  f.pack.files.push({ path: 'LICENSE' });
  await assert.rejects(f.run(), /白名单/);
});
test('发行校验拒绝越界文件名', async t => {
  const f = await fixture(t);
  f.pack.filename = '../outside.tgz';
  await assert.rejects(f.run(), /文件名/);
});
test('发行校验拒绝篡改 tarball', async t => {
  const f = await fixture(t);
  await writeFile(path.join(f.root, f.pack.filename), '测试篡改');
  await assert.rejects(f.run(), /完整性/);
});
test('发行校验读取实际归档，拒绝 private 或错误仓库', async t => {
  const f = await fixture(t);
  f.metadata.private = true;
  await f.repack();
  await assert.rejects(f.run(), /元数据/);
  delete f.metadata.private;
  f.metadata.repository.url = 'git+https://github.com/other/other.git';
  await f.repack();
  await assert.rejects(f.run(), /元数据/);
});
test('发行校验按 alpha/beta/rc 版本选择独立 dist-tag', async t => {
  const f = await fixture(t);
  for (const tag of ['alpha', 'beta', 'rc']) {
    f.metadata.version = f.pack.version = '0.1.0-' + tag + '.1';
    await writeFile(path.join(f.root, 'package.json'), JSON.stringify(f.metadata));
    await f.repack();
    assert.equal((await f.run(f.metadata.version)).dist_tag, tag);
  }
});
