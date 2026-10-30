# Steam 直连域名

> 本文件由 `scripts/build.mjs` 自动生成，GitHub Actions 每月 1 日刷新，请勿手工修改。

> 最近更新：2026-10-30 10:45 UTC　探测节点：`local`
> 共 96 个域名　可达 63（其中 6 个仅 HTTP）　未连通 0　待观察 0
> 自动发现：采集命中 56 个，本次可达 23 个，未通的 33 个未列出

> 注意：可达判定来自探测节点（本地机器）；直连规则集 steam-domains.yaml 由本地网络探测生成，以它为准。

## 国内 CDN (9)

<!-- 蒸汽平台与各加速器 CDN，实测延迟 50–200ms -->

steamchina.com  
csgo.com.cn  
dota2.com.cn  
dl.steam.clngaa.com  
st.dl.bscstorage.net  
st.dl.eccdnx.com  
xz.pphimalayanrt.com  
gstore.val.manlaxy.com  
client-update.queniuqe.com  

## Steam 官方 CDN 与图床 (15)

<!-- 商店图片、游戏下载、直播；Akamai / Azure Blob -->

steamcdn-a.akamaihd.net  
steampipe.akamaized.net  
steampipe-kr.akamaized.net  
steamuserimages-a.akamaihd.net  
steamusercontent-a.akamaihd.net  
steambroadcast.akamaized.net  
steammobile.akamaized.net  
steamstore-a.akamaihd.net  
steamcommunity-a.akamaihd.net  
steamcommunity-a.akamaihd.net.edgesuite.net  
<!-- 根域无 A 记录，images. / cdn. 子域可用（Akamai，CNAME 到 -v1.edgesuite.net） -->
steamusercontent.com  
<!-- 根域无 A 记录；子域是阿里 CDN 节点，只开 80/HTTP，443 无证书 -->
steamcontent.com  
<!-- 根域无 A 记录；子域是 Valve 各地内容缓存（cmp1-hkg1 / cmp1-fra2 等），用代表性子域探测 -->
steamserver.net  
steamcloudsweden.blob.core.windows.net  
steamugcquincy.blob.core.windows.net  

## 商店与官方站点 (12)

<!-- steampowered.com 覆盖 store./api./login./checkout./help.；steamstatic.com 覆盖 cdn.akamai./shared.akamai./avatars. -->

steampowered.com  
steamstatic.com  
steamgames.com  
steam.tv  
s.team  
dota2.com  
valvesoftware.com  
playartifact.com  
underlords.com  
steam-chat.com  
steamconnecttest.com  
steamdeck.com  

## 第三方 Steam 站点 (4)

<!-- 非 Valve 资产，按需保留 -->

steamdb.info  
steamstat.us  
fanatical.com  
humblebundle.com  

## 自动发现 (23)

<!-- 从 v2fly / ACL4SSR / meta-rules-dat / Kelee / Rabbit-Spec / Loyalsoldier 采集，尚未归入上面的分类；只列出本次可达的 -->

b5csgo.plus  
bricsgo.com  
bscstorage.com  
bscstorage.net  
cetsteam.com  
clngaa.com  
csgongshui.com  
csgozbt.com  
eccdnx.com  
steam-run.com  
steambig.com  
steamdd.com  
steamdt.com  
steamgift.site  
steamhost.info  
steaminventoryhelper.com  
steammm.com  
steampp.net  
steamproxy.net  
steampy.com  
steamrepcn.com  
steamunlocked.net  
steamygamer.com  
