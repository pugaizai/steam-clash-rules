#!/usr/bin/env node
/**
 * 从六套规则集采集 Steam 相关域名，输出 data/collected.json 供 build.mjs 使用。
 *
 * 来源：v2fly/domain-list-community、ACL4SSR、MetaCubeX/meta-rules-dat、
 *       Kelee、Rabbit-Spec、Loyalsoldier/clash-rules
 *
 * 每个来源给出若干文件，文件带 kind 决定解析方式与归类（direct / proxy）。
 * 抓取顺序：raw.githubusercontent → jsDelivr → GitHub contents API。
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'data', 'collected.json');
const UA = 'steam-direct-collector/1.0 (+https://github.com)';

// 只保留与 Steam 相关的条目
const KEY = /steam|valvesoftware|valve\.net|dota2|csgo|wmsj|artifact|underlords|bscstorage|eccdnx|pinyuncloud|8686c|clngaa|ksyna|manlaxy|pphimalayanrt|tnkjmec|fanatical|humblebundle/;

const SOURCES = [
  {
    id: 'v2fly',
    repo: 'v2fly/domain-list-community',
    branch: 'master',
    files: [{ path: 'data/steam', kind: 'v2fly' }],
  },
  {
    id: 'acl4ssr',
    repo: 'ACL4SSR/ACL4SSR',
    branch: 'master',
    files: [
      { path: 'Clash/Ruleset/Steam.list', kind: 'clash-list', bucket: 'proxy' },
      { path: 'Clash/Ruleset/SteamCN.list', kind: 'clash-list', bucket: 'direct' },
      { path: 'Clash/Ruleset/GameDownload.list', kind: 'clash-list', bucket: 'proxy' },
    ],
  },
  {
    id: 'meta-rules-dat',
    repo: 'MetaCubeX/meta-rules-dat',
    branch: 'meta',
    files: [
      { path: 'geo/geosite/steam.yaml', kind: 'clash-yaml', bucket: 'proxy' },
      { path: 'geo/geosite/steam@cn.yaml', kind: 'clash-yaml', bucket: 'direct' },
    ],
  },
  {
    id: 'kelee',
    repo: 'mihoyo-typ/KeleeOne',
    branch: 'Loon',
    note: 'rule.kelee.one 有 Cloudflare 质询，改用镜像仓库',
    files: [
      { path: 'Rule/Steam.lsr', kind: 'loon', bucket: 'proxy' },
      { path: 'Rule/SteamCN.lsr', kind: 'loon', bucket: 'direct' },
      { path: 'Rule/Game.lsr', kind: 'loon', bucket: 'proxy' },
    ],
  },
  {
    id: 'rabbit-spec',
    repo: 'Rabbit-Spec/Clash',
    branch: 'Master',
    files: [{ path: 'Rules/Game.yaml', kind: 'clash-rules-yaml', bucket: 'proxy' }],
  },
  {
    id: 'loyalsoldier',
    repo: 'Loyalsoldier/clash-rules',
    branch: 'release',
    files: [
      { path: 'proxy.txt', kind: 'clash-txt', bucket: 'proxy' },
      { path: 'direct.txt', kind: 'clash-txt', bucket: 'direct' },
    ],
  },
];

async function fetchWith(url, headers = {}) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 30000);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, ...headers }, signal: ac.signal, redirect: 'follow' });
    return r.ok ? await r.text() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchFile(src, file) {
  const { repo, branch } = src;
  const p = file.path;
  const urls = [
    [`https://raw.githubusercontent.com/${repo}/${branch}/${p}`, {}],
    [`https://cdn.jsdelivr.net/gh/${repo}@${branch}/${p}`, {}],
    [`https://api.github.com/repos/${repo}/contents/${p}?ref=${branch}`, { Accept: 'application/vnd.github.raw' }],
  ];
  for (const [url, headers] of urls) {
    const text = await fetchWith(url, headers);
    if (text && text.length > 20) return text;
  }
  return null;
}

// ---- 解析器：返回 [{domain, bucket}] ----
const clean = (s) =>
  s.trim()
    .replace(/^[-+]\s*/, '')
    .replace(/^\+\./, '')
    .replace(/^full:/, '')
    .replace(/^@@\|\|?/, '')
    .replace(/\|$/, '')
    .replace(/^\./, '')
    .toLowerCase();

const isDomain = (d) => /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(d) && !d.includes('..');
const keep = (d) => isDomain(d) && (d === 's.team' || KEY.test(d));

const parsers = {
  // v2fly: "domain @cn"
  v2fly: (text) => {
    const out = [];
    for (const line of text.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const [raw, ...attrs] = t.split(/\s+/);
      out.push({ domain: clean(raw), bucket: attrs.includes('@cn') ? 'direct' : 'proxy' });
    }
    return out;
  },
  // ACL4SSR: DOMAIN,x / DOMAIN-SUFFIX,x
  'clash-list': (text, file) => {
    const out = [];
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*(?:DOMAIN|DOMAIN-SUFFIX|HOST|HOST-SUFFIX),\s*([^\s,]+)/i);
      if (m) out.push({ domain: clean(m[1]), bucket: file.bucket });
    }
    return out;
  },
  // meta-rules-dat: payload: - +.domain
  'clash-yaml': (text, file) => {
    const out = [];
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*-\s*'?"?([^\s'"]+)'?"?\s*$/);
      if (m) out.push({ domain: clean(m[1]), bucket: file.bucket });
    }
    return out;
  },
  // Rabbit-Spec: - DOMAIN-SUFFIX,x
  'clash-rules-yaml': (text, file) => {
    const out = [];
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/DOMAIN(?:-SUFFIX)?,\s*([^,\s#]+)/i);
      if (m) out.push({ domain: clean(m[1]), bucket: file.bucket });
    }
    return out;
  },
  // Kelee: DOMAIN, x  /  DOMAIN-SUFFIX, x
  loon: (text, file) => {
    const out = [];
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*(?:DOMAIN|DOMAIN-SUFFIX|HOST|HOST-SUFFIX),?\s+([^\s,]+)/i);
      if (m) out.push({ domain: clean(m[1]), bucket: file.bucket });
    }
    return out;
  },
  // Loyalsoldier: - 'domain'
  'clash-txt': (text, file) => {
    const out = [];
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*-\s*'?"?([^\s'"]+)'?"?\s*$/);
      if (m) out.push({ domain: clean(m[1]), bucket: file.bucket });
    }
    return out;
  },
};

// ---- 采集 ----
const domains = new Map(); // domain -> Set(tag)
const report = [];

for (const src of SOURCES) {
  const entry = { id: src.id, repo: `${src.repo}@${src.branch}`, files: [], ok: false, count: 0, note: src.note };
  for (const file of src.files) {
    const text = await fetchFile(src, file);
    if (!text) {
      entry.files.push({ path: file.path, ok: false });
      continue;
    }
    const hits = parsers[file.kind](text, file).filter((h) => keep(h.domain));
    entry.files.push({ path: file.path, ok: true, count: hits.length });
    entry.ok = true;
    for (const h of hits) {
      if (!domains.has(h.domain)) domains.set(h.domain, new Set());
      domains.get(h.domain).add(`${src.id}:${h.bucket}`);
    }
  }
  entry.count = [...domains.values()].filter((tags) => [...tags].some((t) => t.startsWith(src.id + ':'))).length;
  report.push(entry);
  console.log(`${entry.ok ? 'OK  ' : 'FAIL'} ${src.id.padEnd(16)} files=${entry.files.filter((f) => f.ok).length}/${src.files.length} domains=${entry.count}`);
}

const result = {
  generated: new Date().toISOString(),
  sources: report,
  domains: Object.fromEntries([...domains].sort(([a], [b]) => a.localeCompare(b)).map(([d, tags]) => [d, [...tags].sort()])),
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(result, null, 1) + '\n');
console.log(`\n共采集 ${domains.size} 个 Steam 相关域名 -> ${path.relative(ROOT, OUT)}`);

if (!report.some((s) => s.ok)) {
  console.error('所有来源都抓取失败');
  process.exit(1);
}
