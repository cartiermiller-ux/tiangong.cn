# GitHub Actions 自动部署配置指南

本仓库已配置 GitHub Actions，每次 push 到 `main` 分支都会自动部署到阿里云服务器 `114.55.178.206:3000`。

## 前置条件

- 服务器已启用 **OpenSSH Server**（Windows Server 2019+ 自带，端口默认 22）
- 阿里云安全组已放行 **TCP 22** 入站（公网可 SSH）
- 服务器 `npx pm2`、`node`、`npm`、`curl`、`tar` 命令可用
- 部署目录：`C:\Users\Administrator\Desktop\tiangong.cn-main\`
- 服务由 PM2 管理，进程名 `tiangong`

## 第 1 步：生成 CI 专用部署密钥（在服务器或本机）

打开 PowerShell 或 Git Bash，运行：

```powershell
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/github_actions_deploy -N ""
```

会生成两个文件：
- `~/.ssh/github_actions_deploy` — 私钥（**不要泄露**）
- `~/.ssh/github_actions_deploy.pub` — 公钥（下一步要用）

打印公钥内容，复制整行：

```powershell
cat ~/.ssh/github_actions_deploy.pub
# 或 PowerShell: Get-Content $env:USERPROFILE\.ssh\github_actions_deploy.pub
```

## 第 2 步：把公钥加到服务器 authorized_keys

RDP 连到服务器，PowerShell 运行：

```powershell
# 以 Administrator 登录
mkdir -Force $env:USERPROFILE\.ssh | Out-Null
Add-Content -Path $env:USERPROFILE\.ssh\authorized_keys -Value "这里粘贴第 1 步的整行公钥"
# 收紧权限
icacls $env:USERPROFILE\.ssh\authorized_keys /inheritance:r /grant "${env:USERNAME}:(F)" /grant "SYSTEM:(F)"
```

验证 OpenSSH 已启动（如果未启动）：

```powershell
Get-Service sshd
# 若 Stopped：Start-Service sshd; Set-Service sshd -StartupType Automatic
```

测试本机能否用新密钥登录：

```powershell
ssh -i ~/.ssh/github_actions_deploy Administrator@114.55.178.206 "echo OK"
# 应返回 OK
```

## 第 3 步：在 GitHub 仓库添加 Secrets

打开 https://github.com/cartiermiller-ux/tiangong.cn/settings/secrets/actions

点 **New repository secret**，添加 3 个：

| Name | Value |
|---|---|
| `SSH_HOST` | `114.55.178.206` |
| `SSH_USERNAME` | `Administrator` |
| `SSH_PRIVATE_KEY` | 粘贴私钥**完整内容**（含 `-----BEGIN OPENSSH PRIVATE KEY-----` 和 `-----END OPENSSH PRIVATE KEY-----`） |

（可选）如果 OpenSSH 不在默认 22 端口，再加 `SSH_PORT`。

## 第 4 步：触发部署

两种方式：

**方式 A：推代码**（推荐）
```bash
git add .
git commit -m "..."
git push origin main
```
push 后 5-10 秒 Actions 自动开始跑。

**方式 B：手动触发**
打开 https://github.com/cartiermiller-ux/tiangong.cn/actions/workflows/deploy.yml
点右侧 **Run workflow** → **Run workflow**（用 `workflow_dispatch`）。

## 第 5 步：查看运行日志

https://github.com/cartiermiller-ux/tiangong.cn/actions

每次部署约 3-5 分钟，成功后页面顶部显示绿色 ✓。

失败时点进 job 看具体哪一步报错，常见问题见下方。

## 部署流程（workflow 做的事）

1. `actions/checkout` — 拉代码
2. `tar` 打包（排除 `.git`、`node_modules`、`server/data`、`examples` 等）
3. `scp` 上传 `tiangong.tar.gz` 到服务器 `%USERPROFILE%\`
4. SSH 到服务器执行 PowerShell 脚本：
   - 备份 `server/data` 数据库到 `..\tiangong-data-backup`
   - 解压新代码覆盖 `tiangong.cn-main`
   - 恢复数据库（**不丢数据**）
   - `npm install --omit=dev` 安装生产依赖
   - `node init-db.js` 跑迁移（已存在的列自动跳过）
   - `npx pm2 restart tiangong`
   - `Invoke-WebRequest http://localhost:3000/api/health` 健康检查
5. 清理服务器临时压缩包

## 常见问题

### `ssh: connect to host 114.55.178.206 port 22: Connection timed out`
阿里云安全组未放行 TCP 22。去阿里云 ECS 控制台 → 安全组 → 入方向 → 添加：协议 TCP，端口 22，源 0.0.0.0/0。

### `Permission denied (publickey,password)`
- 公钥未加到服务器 `authorized_keys`
- 私钥复制不完整（必须含 BEGIN/END 标记行）
- 用户名不对（Windows 下一般是 `Administrator`，小写 `administrator` 不行）

### `Health check failed`
服务启动失败。去服务器跑 `npx pm2 logs tiangong --lines 50` 看报错。

### `npm install` 失败（better-sqlite3 编译报错）
服务器缺 C++ 编译工具。装一次即可：
```powershell
npm install -g windows-build-tools
# 或装 Visual Studio Build Tools
```

### 部署成功但网站打不开
- 检查 PM2 进程：`npx pm2 status`
- 检查端口：`netstat -ano | findstr 3000`
- 查日志：`npx pm2 logs tiangong`

## 回滚

如果新版本出问题，回滚到上一个 commit：
```bash
git revert HEAD
git push origin main
```
Actions 会自动部署 revert 后的代码。

紧急回滚（跳过 Actions）：RDP 到服务器手动跑
```powershell
cd C:\Users\Administrator\Desktop\tiangong.cn-main\server
npx pm2 restart tiangong
```
