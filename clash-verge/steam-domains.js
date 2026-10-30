// ============================================================================
// Clash Verge Rev 全局扩展脚本：让 steam-domains.yaml 走直连
//
// 配套文件：本仓库根目录的 steam-domains.yaml（Clash rule-provider，classical）
// 安装：Clash Verge Rev → 设置 → 全局扩展脚本 → 编辑文件 → 粘贴本文件 → 保存
//       （保存后 Verge 会重新生成配置，规则立即生效，无需重启订阅）
//
// 原理：把一条 RULE-SET 规则插到 config.rules 的最前面，
//       匹配到的域名命中 DIRECT，不再落到订阅里 Steam 的代理规则上。
// ============================================================================

// ⚠️ 改成你自己的仓库（必须公开，否则内核拉不到规则）
// 若 raw 地址在你的网络下不稳定，可以把下面的 provider 换成 type: "file"，
// 由 Verge 本地读取 ./ruleset/steam-domains.yaml（需自己把文件放进该目录）。
var PROVIDER_URL = "https://raw.githubusercontent.com/<owner>/<repo>/main/steam-domains.yaml";

// 规则集在配置里的名字，也是 RULE-SET 引用的名字
var PROVIDER_NAME = "steam-domains";

// 只对指定订阅生效（填订阅名，可写多个）；留空数组表示全部订阅
var ONLY_PROFILES = [];

function main(config, profileName) {
  // 0) 按订阅名过滤
  if (ONLY_PROFILES.length > 0 && ONLY_PROFILES.indexOf(profileName) === -1) {
    return config;
  }

  if (PROVIDER_URL.indexOf("<owner>") !== -1) {
    console.log("[steam-domains] 还没填仓库地址，规则集不会生效：" + PROVIDER_URL);
    return config;
  }

  // 1) 注入 rule-provider
  var providers = config["rule-providers"] || {};
  providers[PROVIDER_NAME] = {
    type: "http",
    behavior: "classical",
    format: "yaml",
    url: PROVIDER_URL,
    path: "./ruleset/steam-domains.yaml",
    interval: 86400
  };
  config["rule-providers"] = providers;

  // 2) 规则前置，并剔除旧版本留下的同名规则，避免重复注入
  var rules = config["rules"] || [];
  var prefix = "RULE-SET," + PROVIDER_NAME + ",";
  var kept = [];
  for (var i = 0; i < rules.length; i++) {
    var line = String(rules[i]);
    if (line.indexOf(prefix) === 0) continue;
    kept.push(rules[i]);
  }
  config["rules"] = [prefix + "DIRECT"].concat(kept);

  return config;
}
