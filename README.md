# steam-direct

Steam 相关域名的直连可用性清单，每月自动探测一次。

- [`steam-direct.md`](steam-direct.md) — 分类清单，每行一个域名，只保留本次探测可达的条目
- [`steam-direct.yaml`](steam-direct.yaml) — 由同一份数据生成的 Clash `rule-provider`，可直接被 mihomo / Clash 引用
- [`data/steam-domains.json`](data/steam-domains.json) — 种子数据：分类、备注、以及明确排除的域名

## 工作原理

`scripts/build.mjs` 对每个域名做三步判定：

1. DNS 解析（优先阿里 223.5.5.5 / 腾讯 119.29.29.29，失败回落系统解析器）
2. 连接解析出的 IP 的 443 端口，SNI 用域名，发 `GET /`
3. 443 失败则退回 80/HTTP —— 部分 CDN 节点（如 `steamcontent.com` 子域）不配证书，只开 HTTP

拿到任意 HTTP 状态码即视为可达，`403` / `404` 是这些 CDN 对根路径的正常响应。失败会重试，仍失败则归入「待观察」并从 yaml 中移除。

后缀型域名（`steampowered.com`、`steamstatic.com`、`steamusercontent.com`、`steamcontent.com`、`steamchina.com`）根域没有 A 记录，探测时会换用代表性子域，见脚本里的 `TARGETS`。

## 自动化

[`.github/workflows/steam-direct.yml`](.github/workflows/steam-direct.yml) 每月 1 日 03:00 UTC 运行一次，重新生成上面两个文件并在有变化时提交。

**关于探测节点**：GitHub 托管 runner 在境外，没有 GFW 干扰，所以它验证的是「域名还有没有活着」，不是「国内能不能直连」。想看后者，用 `workflow_dispatch` 触发并把 `runner` 填成自托管 runner 的 label（那台机器要在国内网络下）。

手动跑：

```bash
node scripts/build.mjs          # 生成 md + yaml
PROBE_NODE=my-vps node scripts/build.mjs
```

无第三方依赖，Node ≥ 20.11 即可（用到 `import.meta.dirname`）。

## 增删域名

改 `data/steam-domains.json` 里的 `sections[].domains`，提交后下次运行时生效。

也可以直接往 `steam-direct.md` 的分类里加一行 —— 构建脚本会解析旧 md，把新域名并入对应分类（放在 `## 待观察` 下的会被忽略，因为它下次要重新验证）。

被判定不可用的域名会落到「待观察」；等它恢复，下次运行会自动回到原分类，不需要手工搬。

## 明确排除

`data/steam-domains.json` 的 `excluded` 字段记录了实测不可用、因此没有纳入规则集的域名及原因，例如 `steamcommunity.com`（国内 TLS 超时 + DNS 污染，必须走代理）。这些会以注释形式出现在 yaml 末尾，防止以后被误加回去。

## 注意

- 探测结果是单点、瞬时的，CDN 调度和污染状态都会变。
- `403` / `404` 只证明「连接打通了」，不代表具体资源对象可取（图床可能按地理或 Referer 限制）。
- 规则集只放行资源类域名；`steampowered.com` 这类含登录/支付的站点是否直连，取决于你的网络环境，出问题就把对应行挪回代理。
