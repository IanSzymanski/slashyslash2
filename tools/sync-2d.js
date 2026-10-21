#!/usr/bin/env node
// Lists what the 2D game has changed since the 3D copies last caught up (the commit in SYNCED_FROM),
// and which 3D file each change points at. Port what you want by hand, then record the new commit.
// Usage: node tools/sync-2d.js [ref] [--diff] [--mark]
//   ref     2D commit or branch to compare against (default: 2d/main)
//   --diff  print the full diff of the 2D game's code
//   --mark  write ref's commit to SYNCED_FROM once you've ported what you want
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const REMOTE = '2d', URL_2D = 'https://github.com/IanSzymanski/slashyslash.git';
const PATHS = ['js/', 'css/', 'index.html'];
// 2D files whose 3D counterpart has a different name or is split
const MIRROR = { 'js/main.js': 'js/core.js (game core), js/main.js (loop)' };
const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });

const args = process.argv.slice(2);
const ref = args.find((a) => !a.startsWith('--')) || `${REMOTE}/main`;
if (!git('remote').split('\n').includes(REMOTE)) git('remote', 'add', REMOTE, URL_2D);
git('fetch', '--quiet', REMOTE);
const from = fs.readFileSync(path.join(root, 'SYNCED_FROM'), 'utf8').trim();
const to = git('rev-parse', ref).trim();

console.log(`2D changes from ${from.slice(0, 7)} (SYNCED_FROM) to ${to.slice(0, 7)} (${ref})\n`);
const log = git('log', '--oneline', '--no-merges', `${from}..${to}`, '--', ...PATHS).trim();
console.log(log ? log + '\n' : 'No commits touch the 2D code.\n');
const files = git('diff', '--numstat', from, to, '--', ...PATHS).trim();
for (const line of files ? files.split('\n') : []) {
  const [add, del, file] = line.split('\t');
  const mirror = MIRROR[file] || (fs.existsSync(path.join(root, file)) ? file : 'no 3D file yet');
  console.log(`  ${file.padEnd(20)} +${add} -${del}`.padEnd(40) + `-> ${mirror}`);
}
if (args.includes('--diff')) process.stdout.write('\n' + git('diff', from, to, '--', ...PATHS));
if (args.includes('--mark')) {
  fs.writeFileSync(path.join(root, 'SYNCED_FROM'), to + '\n');
  console.log(`\nSYNCED_FROM is now ${to.slice(0, 7)}`);
}
