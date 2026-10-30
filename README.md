# steam-domains

Steam 相关域名的直连清单。每月自动从六套社区规则集采集候选域名、逐个探测，产出分类清单。

- [`steam-domains.md`](steam-domains.md) — 分类清单，每行一个域名
- [`steam-domains.yaml`](steam-domains.yaml) — 由同一份数据生成的 Clash `rule-provider`
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

Kelee 官方源 `rule.kelee.one` 有 Cloudflare 质询，抓取会 403，所以改用镜像仓库 [`mihoyo-typ/KeleeOne`](https://github.com/mihoyo-typ/KeleeOne)（同步于 2025-09-18）。抓取本身按 `raw.githubusercontent → jsDelivr → GitHub API` 顺序重试。

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

[`.github/workflows/steam-domains.yml`](.github/workflows/steam-domains.yml) 每月 1 日 03:00 UTC 运行：采集 → 探测 → 重新生成 md/yaml → 有变化就提交。

**探测节点**：GitHub 托管 runner 在境外，没有 GFW 干扰，验证的是「域名还活着」，不是「国内能不能直连」。要看后者，用 `workflow_dispatch` 触发并把 `runner` 填成自托管 runner 的 label（那台机器要在国内网络下）。

手动跑：

```bash
node scripts/collect.mjs        # 只采集
node scripts/build.mjs          # 采集结果 + 人工清单 → 探测 → 生成
```

零第三方依赖，Node ≥ 20.11（用到 `import.meta.dirname`）。

## 增删域名

- **长期维护**：改 `data/steam-domains.json` 的 `sections[].domains`，可带 `note`
- **临时补充**：直接往 `steam-domains.md` 的分类里加一行，构建脚本会解析旧 md 并回并到对应分类（「待观察」「自动发现」两段不会被回并）
- **自动发现转正**：把「自动发现」里的域名手工挪到上面某个分类，它就成了固定条目

被判定 DNS 失效的域名会落到「待观察」，恢复解析后下次自动回到原分类。

`data/steam-domains.json` 的 `excluded` 字段记录实测不可用、因此不纳入的域名及原因（如 `steamcommunity.com` 国内 TLS 超时 + DNS 污染）。这些会以注释形式出现在 yaml 末尾，防止以后被误加回去，同时也挡在「自动发现」之外。

## 注意

- 探测是单点、瞬时的，CDN 调度和污染状态都会变。
- `403` / `404` 只证明「连接打通了」，不代表具体资源对象可取。
- 「自动发现」段里的第三方站点（`steamunlocked.net`、`steampp.net` 等）是 Loyalsoldier `direct.txt` 里的原始条目，只代表「可直连」，不代表推荐。
