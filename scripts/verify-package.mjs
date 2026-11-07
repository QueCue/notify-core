import { readFileSync, readdirSync, appendFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

export function verifyPackage(packFile, directory, root = fileURLToPath(new URL('../', import.meta.url)), requestedVersion = process.env.RELEASE_VERSION) {
  const buffer = readFileSync(packFile);
  const text = buffer[0] === 0xff && buffer[1] === 0xfe ? buffer.subarray(2).toString('utf16le') : buffer.toString('utf8');
  const packs = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  if (!Array.isArray(packs) || packs.length !== 1) throw new Error('需要一个 npm pack 结果。');
  const [pack] = packs;
  const source = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(alpha|beta|rc)\.(0|[1-9]\d*))?$/.exec(source.version);
  if (source.name !== '@quecue/notify-core' || !match || source.version !== requestedVersion ||
      pack.name !== source.name || pack.version !== source.version) throw new Error('请求版本、源码及包版本必须一致。');
  if (typeof pack.filename !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*\.tgz$/.test(pack.filename)) throw new Error('候选包文件名无效。');
  const docs = ['package.json', 'README.md', 'README.en.md', 'SECURITY.md', 'SECURITY.en.md',
    'CONTRIBUTING.md', 'PUBLISHING.md', 'CHANGELOG.md', 'CHANGELOG.en.md', 'LICENSE'];
  const expected = [...docs, ...readdirSync(path.join(root, 'src')).filter(file => file.endsWith('.ts'))
    .flatMap(file => ['dist/' + file.replace(/\.ts$/, '.js'), 'dist/' + file.replace(/\.ts$/, '.d.ts')])].sort();
  const actual = pack.files?.map(file => file.path);
  if (!Array.isArray(actual) || actual.some(file => typeof file !== 'string') || new Set(actual).size !== actual.length ||
      JSON.stringify(actual.sort()) !== JSON.stringify(expected)) throw new Error('候选包文件清单与精确白名单不一致。');
  const archive = path.resolve(directory, pack.filename);
  const integrity = 'sha512-' + createHash('sha512').update(readFileSync(archive)).digest('base64');
  if (integrity !== pack.integrity) throw new Error('候选包完整性不一致。');
  const metadata = JSON.parse(execFileSync('tar', ['-xOf', path.basename(archive), 'package/package.json'],
    { cwd: path.dirname(archive), encoding: 'utf8', windowsHide: true, maxBuffer: 1024 * 1024 }));
  if (JSON.stringify(metadata) !== JSON.stringify(source) || metadata.private ||
      metadata.repository?.url !== 'git+https://github.com/QueCue/notify-core.git' ||
      metadata.publishConfig?.access !== 'public' || metadata.publishConfig?.registry !== 'https://registry.npmjs.org/') {
    throw new Error('归档元数据与源码或公开发行契约不一致。');
  }
  return { version: source.version, dist_tag: match[4] || 'latest', filename: pack.filename, integrity };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  if (process.argv.length !== 4) throw new Error('用法：node scripts/verify-package.mjs <pack.json> <候选目录>');
  const result = verifyPackage(process.argv[2], process.argv[3]);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT,
    Object.entries(result).map(([key, value]) => `${key}=${value}\n`).join(''));
  console.log(JSON.stringify(result));
}
