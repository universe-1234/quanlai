# 1.0.6-rc.1 验证记录

基于 main `d32cfb88b5350b20b28b26ae0f66f414cb93d51f`。自动测试使用模拟上游、隔离数据和专用任务，不发送真实短信。

## 已验证

- Windows `npm test`：28 项通过。覆盖开关/改时/失败回滚、当天补领、跨日、失败不自动重试、手动成功抑制自动、并发及真实子进程崩溃恢复、历史上限、损坏文件、升级任务修复、隐私和 HTTP 接口。
- `npm run build`：通过。
- Edge 实际浏览器预览：5 项通过。覆盖首次设置、恢复管理页、执行中防止重复领取、领取过程中关闭自动任务、失效登录关闭、重试、空记录、375px 窄窗口、横屏和 200% 字号。截图已检查，模拟数据在 README 标注。
- Windows 专用任务测试：daily/logon/resume 三触发器注册、含空格路径执行、任务查询与删除通过。
- 候选 NSIS 包已构建，版本 1.0.6-rc.1。独立 QA 应用安装在含空格路径后正常打开；关闭窗口后，系统任务成功执行模拟领取；禁用后再启动后台入口未增加请求；卸载后配置禁用、任务删除、应用文件移除均通过。证据由 `scripts/test-windows-install.mjs` 写入 `output/windows/install-validation.json`。

## 构建来源

ClawHub 固定 Skill 版本返回 `Skill not found or unavailable to this account`。使用公开 v1.0.5 安装包内未修改的 Python/Skill 运行时完成候选构建，未读取个人凭证。

源文件：`https://github.com/universe-1234/quanlai/releases/download/v1.0.5/QuanLai-Setup-1.0.5-x64.exe`

已核对 SHA-256：`99f9a19d5517d3037a18b50ee0428ca8cd42cf666c2815c774d8ac4954b5a189`。仓库包含显式恢复脚本，Windows CI 使用同一固定校验。Linux/Windows CI 的测试、生产构建以 PR checks 为准。

## 尚未验证 / 限制

- 未发送真实短信、未进行真人验证码登录或实际领取；面额/有效期只验证了真实组件字段协议与模拟返回。
- 未让使用者电脑实际休眠、注销或跨午夜等待；已检查系统触发器并通过可控本地日期测试补领规则。
- QA 安装验证不等于对个人既有安装做覆盖升级；保留凭证和旧配置通过自动测试及路径兼容检查验证。
- 无代码签名证书；未合并 PR、未创建发布标签或正式 Release。
- 本地 Edge 首次启动曾发生一次浏览器进程退出，单独重跑及完整 5 项复跑均通过，没有设置自动重试来隐藏失败。
