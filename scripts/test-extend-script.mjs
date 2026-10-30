import fs from 'node:fs';

const src0 = fs.readFileSync('clash-verge/steam-domains.js', 'utf8');
const load = (src) => new Function(src + '\nreturn main;')();

// 把 PROVIDER_URL 换成给定值，避免测试依赖脚本里当前的地址
const withUrl = (url) => src0.replace(/var PROVIDER_URL = ".*";/, `var PROVIDER_URL = "${url}";`);
const src = withUrl('https://example.com/steam-domains.yaml');

const main = load(src);
let cfg = { rules: ['RULE-SET,Steam,节点选择', 'MATCH,漏网之鱼'] };
const out = main(cfg, 'sub-A');

console.log('rules:', JSON.stringify(out.rules, null, 0));
console.log('providers:', JSON.stringify(out['rule-providers']));
console.log('order ok:', out.rules[0] === 'RULE-SET,steam-domains,DIRECT');
console.log('steam proxy rule kept:', out.rules.includes('RULE-SET,Steam,节点选择'));

// 幂等：再跑一次不应重复
const out2 = main(out, 'sub-A');
const count = out2.rules.filter((r) => String(r).startsWith('RULE-SET,steam-domains,')).length;
console.log('idempotent count:', count);

// 占位符未替换时不应改动配置
const mainPlaceholder = load(withUrl('https://raw.githubusercontent.com/<owner>/<repo>/main/steam-domains.yaml'));
const untouched = mainPlaceholder({ rules: ['MATCH,x'] }, 'sub-A');
console.log('placeholder untouched:', JSON.stringify(untouched));

// ONLY_PROFILES 过滤
const mainFiltered = load(src.replace('var ONLY_PROFILES = [];', 'var ONLY_PROFILES = ["sub-B"];'));
const other = mainFiltered({ rules: ['MATCH,x'] }, 'sub-A');
console.log('profile filter:', JSON.stringify(other.rules));

// 空 rules / 无 rule-providers 的配置
const empty = main({}, 'sub-A');
console.log('empty config rules:', JSON.stringify(empty.rules), 'providers ok:', !!empty['rule-providers']['steam-domains']);
