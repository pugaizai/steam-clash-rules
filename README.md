# steam-domains

Steam 相关域名的直连清单。每月自动从六套社区规则集采集候选域名、逐个探测，产出分类清单；Clash 规则集由本地探测生成。

- [`steam-domains.md`](steam-domains.md) — 分类清单，每行一个域名
- [`steam-domains.yaml`](steam-domains.yaml) — Clash `rule-provider`，本地运行 `scripts/build.mjs --yaml` 生成（CI 不生成、不提交）
- [`data/steam-domains.json`](data/steam-domains.json) — 人工维护的分类、备注与排除名单
- [`data/collected.json`](data/collected.json) — 上次采集结果（自动生成）

## 数据来源

`scripts/collect.mjs` 从下列六套规则集里抓取所有 Steam 相关条目：

| 来源 | 文件 | 归类 |
|---|---|---|
| [v2fly/domain-list-community](https://github.com/v2fly/domain-list-community) | `data/steam` | `@cn` 属性 → 直连，其余 → 代理 |
| [ACL4SSR](https://github.com/ACL4SSR/ACL4SSR) | `Clash/Ruleset/Steam*.list`、`GameDownload.list` | SteamCN → 直连，其余 → 代理 |
| [MetaCubeX/meta-rules-dat](https://github.com/MetaCubeX/meta-rules-dat) | `geo/geosite/steam.yaml`、`steam@cn.yaml` | `steam@cn` → 直连 |
| Kelee | `Rule/Steam.lsr`、`SteamCN.lsr`、`Game.lsr` | SteamCN → 直连 |
| [Rabbit-Spec](https://github.com/Rabbit-Spec/Clash) | `Rules/Game.yaml` | 一律代理 |
| [Loyalsoldier/clash-rules](https://github.com/Loyalsoldier/clash-rules) | `proxy.txt`、`direct.txt` | 按所在文件 |

Kelee 官方源 `rule.kelee.one` 有 Cloudflare 质询，抓取会 403，所以改用镜像仓库 [`mihoyo-typ/KeleeOne`](https://github.com/mihoyo-typ/KeleeOne)（同步于 2025-09-18）。抓取本身按 `raw.githubusercontent → GitHub API` 顺序重试。

采集到的域名会过滤掉已经被人工分类覆盖的（含后缀覆盖，比如 `cdn-qc.content.steamchina.com` 之于 `steamchina.com`），剩下的进入 md 的「自动发现」段 —— 只列出本次探测可达的，未通的只计数不列出，避免几十个死域名刷屏。

## 探测逻辑

`scripts/build.mjs` 对每个域名：

1. DNS 解析（优先 223.5.5.5 / 119.29.29.29，失败回落系统解析器）
2. 连接解析出的 IP 的 443，SNI 用域名，发 `GET /`
3. 443 不通退回 80/HTTP（部分 CDN 节点不配证书，如 `steamcontent.com` 子域）

判定：HTTPS 状态码 < 500、或 HTTP 状态码 < 400 即算可达。`403` / `404` 是这些 CDN 对根路径的正常响应。

后缀型域名（`steampowered.com`、`steamstatic.com`、`steamusercontent.com`、`steamcontent.com`、`steamchina.com`）根域没有 A 记录，探测时换用代表性子域，见脚本里的 `TARGETS`。

归类规则：

- DNS 完全解析不出来（`ENOTFOUND` / `ENODATA`）→ 「待观察」，域名多半已注销
- 解析得到但连不上 → 留在原分类，不搬动，避免 Akamai 节点抖动导致清单反复变动
- 自动发现的域名 → 只在可达时列出

## 自动化

[`.github/workflows/steam-domains.yml`](.github/workflows/steam-domains.yml) 每月 1 日 03:00 UTC 运行：采集 → 探测 → 重新生成 `steam-domains.md` → 有变化就提交。**它不生成、不提交 `steam-domains.yaml`。**

**为什么 yaml 不给 CI 生成**：GitHub 托管 runner 在境外，没有 GFW，探测只能证明「域名还活着」，不能证明国内能直连；把这种结论写进直连规则集会误伤。所以 `steam-domains.yaml` 必须在你实际使用这套规则的机器上（国内网络）生成，再手动提交。

**探测节点（md）**：CI 的探测只回答「域名还活着」，`steam-domains.md` 的可达统计仅作回归参考；直连结论以本地生成的 `steam-domains.yaml` 为准。偶尔也可以用 `workflow_dispatch` 把 `runner` 填成国内自托管 runner 的 label 去跑 md。

手动跑：

```bash
node scripts/collect.mjs        # 只采集候选域名
node scripts/build.mjs          # 探测 → 生成 steam-domains.md（CI 同款，不动 yaml）
node scripts/build.mjs --yaml   # 探测 → 生成 steam-domains.yaml（本地专用，不动 md）
```

两种输出分开写，互不覆盖；`--yaml` 在 `GITHUB_ACTIONS=true` 环境下会直接报错退出。本地生成后 `git add steam-domains.yaml` 提交即可。

零第三方依赖，Node ≥ 20.11（用到 `import.meta.dirname`）。

## 在 Clash Verge Rev 里用

[`clash-verge/steam-domains.js`](clash-verge/steam-domains.js) 是全局扩展脚本，作用是把 `steam-domains.yaml` 以 `RULE-SET` 形式插到规则最前面，命中即 `DIRECT`。

1. `PROVIDER_URL` 已指向 `pugaizai/steam-clash-rules`；fork 或换仓库时改成自己的（必须公开）
2. Clash Verge Rev → 设置 → 全局扩展脚本 → 编辑文件 → 粘贴 → 保存
3. 保存后 Verge 会重新生成配置，规则立即生效
4. `steam-domains.yaml` 不随 CI 自动刷新：改完域名或想更新可达性，本地跑 `node scripts/build.mjs --yaml` 后提交

脚本只做两件事：往 `config["rule-providers"]` 里塞一个 `behavior: classical` 的 provider，然后把 `RULE-SET,steam-domains,DIRECT` 放在 `config.rules[0]`。重复执行不会产生重复规则；`ONLY_PROFILES` 非空时只对指定订阅生效。

几个容易踩的点：

- 规则是**前插**的，所以订阅里原有的 Steam 代理规则会被盖过去 —— 这正是目的，但也意味着这些域名的广告拦截规则同样会被越过
- 全局模式（Global）不走规则表，脚本只在规则模式下有效
- 规则集地址是 `https://raw.githubusercontent.com/pugaizai/steam-clash-rules/main/steam-domains.yaml`，国内直连不一定稳；拉不动就把 provider 换成 `type: "file"`，把 `steam-domains.yaml` 放到 `./ruleset/` 下由本地读取

## 增删域名

- **长期维护**：改 `data/steam-domains.json` 的 `sections[].domains`，可带 `note`
- **临时补充**：直接往 `steam-domains.md` 的分类里加一行，构建脚本会解析旧 md 并回并到对应分类（「待观察」「自动发现」两段不会被回并）
- **自动发现转正**：把「自动发现」里的域名手工挪到上面某个分类，它就成了固定条目
- **更新规则集**：改完 `data/steam-domains.json` 后本地跑 `node scripts/build.mjs --yaml`，把生成的 `steam-domains.yaml` 一并提交

被判定 DNS 失效的域名会落到「待观察」，恢复解析后下次自动回到原分类。

`data/steam-domains.json` 的 `excluded` 字段记录实测不可用、因此不纳入的域名及原因（如 `steamcommunity.com` 国内 TLS 超时 + DNS 污染）。这些会以注释形式出现在 yaml 末尾，防止以后被误加回去，同时也挡在「自动发现」之外。

## 注意

- 探测是单点、瞬时的，CDN 调度和污染状态都会变。
- `403` / `404` 只证明「连接打通了」，不代表具体资源对象可取。
- 「自动发现」段里的第三方站点（`steamunlocked.net`、`steampp.net` 等）是 Loyalsoldier `direct.txt` 里的原始条目，只代表「可直连」，不代表推荐。
