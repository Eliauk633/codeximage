# 项目知识

## 开源素材边界

已核实：本地原型的部分图标来源于原应用提取样本，未确认再分发许可。本开源版本统一以已安装 lucide-react 生成的 SVG 替换 src/assets，保留其 Lucide/Feather 许可证，不包含提取样本。依据：THIRD_PARTY_NOTICES.md 与 src/assets/ASSET_SOURCES.json。

## 验证边界

模拟上游和网关健康检查不能证明真实供应商可用；源码测试通过不代表 Windows 安装包或 AWS 部署成功。现有网关共享凭证不能替代服务端按用户认证。

## Electron入口测试模拟

已验证：主进程加载应用图标后，入口测试需模拟nativeImage.createFromPath和macOS dock.setIcon，否则入口在创建窗口前中断。补齐模拟后235项测试通过；没有移除账号或流式生命周期断言。
