#!/usr/bin/env node
/**
 * 探测 Steam 相关域名的直连可用性，生成 steam-direct.md 与 steam-direct.yaml。
 *
 * 判定方式：DNS 解析（AliDNS 优先）→ 连接 IP:443（SNI 用域名）→ GET /
 *           443 失败再退回 80/HTTP（部分 CDN 节点不配证书）
 * 通过标准：拿到任意 HTTP 状态码即算可达；403/404 属正常响应。
 */
import fs from 'node:fs';
import path from 'node:path';
import dns from 'node:dns';
import net from 'node:net';
import tls from 'node:tls';

const ROOT = path.resolve(import.meta.dirname, '..');
const DATA = path.join(ROOT, 'data', 'steam-domains.json');
const COLLECTED = path.join(ROOT, 'data', 'collected.json');
const MD = path.join(ROOT, 'steam-direct.md');
const YAML = path.join(ROOT, 'steam-direct.yaml');

const TIMEOUT = Number(process.env.PROBE_TIMEOUT_MS || 8000);
const CONCURRENCY = Number(process.env.PROBE_CONCURRENCY || 8);
const RETRIES = Number(process.env.PROBE_RETRIES || 2);

// 后缀型域名：根域没有 A 记录，用代表性子域探测
const TARGETS = {
  'steampowered.com': ['store.steampowered.com', 'api.steampowered.com', 'login.steampowered.com'],
  'steamstatic.com': ['cdn.akamai.steamstatic.com', 'shared.akamai.steamstatic.com', 'avatars.steamstatic.com'],
  'steamusercontent.com': ['images.steamusercontent.com', 'cdn.steamusercontent.com'],
  'steamcontent.com': ['alibaba.cdn.steampipe.steamcontent.com', 'steampipe.steamcontent.com'],
  'steamchina.com': ['cdn-qc.content.steamchina.com', 'cdn-ws.content.steamchina.com'],
};

const resolver = new dns.promises.Resolver({ timeout: 4000, tries: 2 });
try { resolver.setServers(['223.5.5.5', '119.29.29.29']); } catch { /* 用系统 DNS */ }

const resolve4 = async (host) => {
  try {
    const ips = await resolver.resolve4(host);
    if (ips.length) return ips;
  } catch { /* 落到系统解析 */ }
  return dns.promises.resolve4(host);
};

const httpGet = (host, ip, port, secure) => new Promise((resolve) => {
  const t0 = Date.now();
  const opts = secure
    ? { host: ip, port, servername: host, rejectUnauthorized: false, timeout: TIMEOUT }
    : { host: ip, port, timeout: TIMEOUT };
  const socket = secure ? tls.connect(opts) : net.connect(opts);
  let done = false;
  const fin = (o) => { if (!done) { done = true; resolve({ ...o, ms: Date.now() - t0 }); try { socket.destroy(); } catch {} } };
  socket.once(secure ? 'secureConnect' : 'connect', () => {
    socket.write(`GET / HTTP/1.1\r\nHost: ${host}\r\nConnection: close\r\nUser-Agent: steam-direct-probe\r\n\r\n`);
  });
  let buf = '';
  socket.on('data', (d) => {
    buf += d.toString('latin1');
    const m = buf.match(/^HTTP\/1\.[01] (\d{3})/);
    if (m) fin({ ok: true, status: Number(m[1]) });
  });
  socket.once('timeout', () => fin({ ok: false, err: secure ? 'TLS_TIMEOUT' : 'HTTP_TIMEOUT' }));
  socket.once('error', (e) => fin({ ok: false, err: (e.code || e.message).slice(0, 40) }));
  socket.once('close', () => fin({ ok: false, err: buf ? 'CLOSED' : 'NO_DATA' }));
});

async function probeHost(host) {
  let ips;
  try { ips = await resolve4(host); }
  catch (e) { return { host, ok: false, err: 'DNS_' + (e.code || 'FAIL') }; }

  let lastErr = 'FAIL';
  for (const ip of ips.slice(0, 4)) {
    const https = await httpGet(host, ip, 443, true);
    if (https.ok && https.status < 500) return { host, ip, via: 'https', ...https };
    const http = await httpGet(host, ip, 80, false);
    if (http.ok && http.status < 400) return { host, ip, via: 'http', ...http };
    lastErr = https.ok ? `HTTP_${https.status}` : (https.err || http.err || 'FAIL');
  }
  return { host, ip: ips[0], ok: false, err: lastErr };
}

async function probeDomain(domain) {
  const targets = TARGETS[domain] || [domain];
  const attempts = [];
  for (const host of targets) {
    let r;
    for (let i = 0; i < RETRIES; i++) {
      r = await probeHost(host);
      if (r.ok) break;
      await new Promise((res) => setTimeout(res, 400));
    }
    attempts.push(r);
    if (r.ok) return { domain, ...r, attempts };
  }
  return { domain, ok: false, err: attempts[0]?.err || 'FAIL', host: attempts[0]?.host, attempts };
}

// ---- 读取种子数据，并合并已生成 md 里手工添加的域名 ----
const data = JSON.parse(fs.readFileSync(DATA, 'utf8'));
const sections = data.sections.map((s) => ({ ...s, domains: s.domains.map((d) => (typeof d === 'string' ? { domain: d } : d)) }));

if (fs.existsSync(MD)) {
  const known = new Set(sections.flatMap((s) => s.domains.map((d) => d.domain)));
  const extra = [];
  let current = null;
  let skip = false;
  for (const line of fs.readFileSync(MD, 'utf8').split(/\r?\n/)) {
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      const title = heading[1].replace(/\s*\(\d+\)\s*$/, '').trim();
      skip = title.startsWith('待观察') || title.startsWith('自动发现');
      current = skip ? null : sections.find((s) => s.title === title) || null;
      continue;
    }
    if (skip) continue;
    const d = line.trim().match(/^([a-z0-9][a-z0-9.-]*\.[a-z]{2,})$/i);
    if (!d || known.has(d[1])) continue;
    known.add(d[1]);
    if (current) current.domains.push({ domain: d[1] });
    else extra.push({ domain: d[1] });
  }
  if (extra.length) sections.push({ id: 'manual', title: '手动添加', desc: '从旧版 md 中保留的域名', domains: extra });
}

// ---- 合并规则集采集结果 ----
const curated = new Set(sections.flatMap((s) => s.domains.map((d) => d.domain)));
const excludedSet = new Set((data.excluded || []).map((e) => e.domain));
let collectedMap = new Map();
if (fs.existsSync(COLLECTED)) {
  const c = JSON.parse(fs.readFileSync(COLLECTED, 'utf8'));
  collectedMap = new Map(Object.entries(c.domains || {}));
}
const autoDomains = [...collectedMap.keys()]
  .filter((d) => !curated.has(d) && !excludedSet.has(d))
  // 已被手工分类里的后缀覆盖（如 cdn-qc.content.steamchina.com 之于 steamchina.com）就不重复列出
  .filter((d) => ![...curated].some((c) => d === c || d.endsWith('.' + c)));
if (autoDomains.length) {
  sections.push({
    id: 'auto',
    title: '自动发现',
    desc: '从 v2fly / ACL4SSR / meta-rules-dat / Kelee / Rabbit-Spec / Loyalsoldier 采集，尚未归入上面的分类；只列出本次可达的',
    domains: autoDomains.map((domain) => ({ domain })),
    dropUnreachable: true,
  });
}

// ---- 并发探测 ----
const queue = sections.flatMap((s) => s.domains.map((d) => d.domain));
const results = new Map();
let cursor = 0;
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (cursor < queue.length) {
    const domain = queue[cursor++];
    const r = await probeDomain(domain);
    results.set(domain, r);
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${domain.padEnd(44)} ${r.ok ? `${r.via} ${r.status} ${r.ms}ms` : r.err}`);
  }
}));

// ---- 生成 markdown ----
const now = new Date();
const stamp = now.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
const node = process.env.PROBE_NODE || 'local';

// ---- 归类 ----
// DNS 解析不出来 = 域名已注销，进「待观察」；解析得到但连不上 = 暂时不通，保留在分类里
const dnsDead = (r) => !r?.ok && /^DNS_(ENOTFOUND|ENODATA)/.test(r?.err || '');
// dropUnreachable 的分组（自动发现）只保留可达条目，其余直接丢弃，不污染「待观察」
const listed = sections.map((s) => s.domains
  .filter((d) => !dnsDead(results.get(d.domain)))
  .filter((d) => !s.dropUnreachable || results.get(d.domain)?.ok));
const dead = sections
  .filter((s) => !s.dropUnreachable)
  .flatMap((s) => s.domains.filter((d) => dnsDead(results.get(d.domain))).map((d) => ({ ...d, err: results.get(d.domain).err })));
const total = queue.length;
const okCount = listed.reduce((n, list) => n + list.filter((d) => results.get(d.domain)?.ok).length, 0);
const viaHttp = listed.flat().filter((d) => results.get(d.domain)?.via === 'http').length;
const unreachable = sections
  .filter((s) => !s.dropUnreachable)
  .reduce((n, s, i) => n + listed[i].filter((d) => !results.get(d.domain)?.ok).length, 0);
const autoSection = sections.find((s) => s.dropUnreachable);
const autoFound = autoSection ? listed[sections.indexOf(autoSection)].length : 0;
const autoDropped = autoSection ? autoSection.domains.length - autoFound : 0;

const md = [];
md.push('# Steam 直连域名\n');
md.push('> 本文件由 `scripts/build.mjs` 自动生成，GitHub Actions 每月 1 日刷新，请勿手工修改。\n');
md.push(`> 最近更新：${stamp}　探测节点：\`${node}\``);
md.push(`> 共 ${total} 个域名　可达 ${okCount}（其中 ${viaHttp} 个仅 HTTP）　未连通 ${unreachable}　待观察 ${dead.length}`);
if (autoSection) md.push(`> 自动发现：采集命中 ${autoFound + autoDropped} 个，本次可达 ${autoFound} 个，未通的 ${autoDropped} 个未列出\n`);
else md.push('');
md.push('> 注意：GitHub 托管 runner 位于境外，不含 GFW 干扰；「国内能否直连」请用自托管 runner 复核。\n');

for (let i = 0; i < sections.length; i++) {
  const s = sections[i];
  const list = listed[i];
  if (!list.length) continue;
  md.push(`## ${s.title} (${list.length})\n`);
  if (s.desc) md.push(`<!-- ${s.desc} -->\n`);
  for (const d of list) {
    if (d.note) md.push(`<!-- ${d.note} -->`);
    md.push(`${d.domain}  `);
  }
  md.push('');
}

if (dead.length) {
  md.push(`## 待观察 (${dead.length})\n`);
  md.push('<!-- DNS 已解析不出来；恢复解析后会自动回到上面的分类 -->\n');
  for (const d of dead) md.push(`${d.domain}  `);
  md.push('');
}

fs.writeFileSync(MD, md.join('\n'));

// ---- 生成 Clash rule-provider ----
const y = [];
y.push('# Steam 直连规则集');
y.push('# 由 scripts/build.mjs 自动生成，GitHub Actions 每月 1 日刷新，请勿手工修改。');
y.push(`# 最近更新：${stamp}　探测节点：${node}`);
y.push(`# 共 ${okCount} 个域名，全部为本次探测可达的条目。`);
y.push(`# 未连通 ${unreachable} 个（仍在 md 中保留，暂不写入本文件）；DNS 已失效 ${dead.length} 个。`);
y.push('#');
y.push('# 用法：');
y.push('#   rule-providers:');
y.push('#     steam-direct: { type: http, behavior: classical, format: yaml,');
y.push('#                      url: "<raw 地址>", path: ./ruleset/steam-direct.yaml, interval: 86400 }');
y.push('#   rules:');
y.push('#     - RULE-SET,steam-direct,DIRECT   # 必须放在 Steam 代理规则之前');
y.push('payload:');
for (let i = 0; i < sections.length; i++) {
  const list = listed[i].filter((d) => results.get(d.domain)?.ok);
  if (!list.length) continue;
  y.push(`  # ---- ${sections[i].title}（${list.length}）----`);
  for (const d of list) y.push(`  - DOMAIN-SUFFIX,${d.domain}`);
  y.push('');
}
y.push('  # 明确不要加进直连（国内实测不通，加了社区会打不开）：');
for (const e of data.excluded || []) y.push(`  # - DOMAIN-SUFFIX,${e.domain}   # ${e.reason}`);

fs.writeFileSync(YAML, y.join('\n'));
console.log(`\n生成 ${path.basename(MD)}（${okCount}/${total} 通过）与 ${path.basename(YAML)}`);
