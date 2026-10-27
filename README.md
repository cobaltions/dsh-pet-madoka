# dsh-pet-Madoka

<p align="center"><img src="docs/banner.png" alt="dsh-pet-Madoka" width="720"></p>

[DeepSeek Harness（DSH）](https://github.com/deepseek-ai/deepseek-harness) 的《魔法少女小圆》鹿目圆桌面桌宠：
透明置顶窗口 + Live2D 立绘 + 气泡台词 + 状态面板，并接管对话提问、风险审批和任务进程。

> 代码基于 [bestlike093/dsh-cyrene-balance](https://github.com/bestlike093/dsh-cyrene-balance) 的
> `dsh-cyrene-pet`（MIT）改造而来，把形象、台词、配色换成了小圆，并加了大小控制、游戏语音和气泡降频。

## 功能

- 透明无边框置顶窗口，非立绘区域点击穿透，拖拽移动 / 松手贴边、位置与大小记忆
- Live2D 立绘（Cubism 3/4，`.moc3`）：表情、动作、眨眼、呼吸、视线跟随
- 右键菜单 / 托盘菜单 / 设置浮层：状态面板、气泡模式、大小（65%–180%）、语音档、气泡间隔
- 状态面板：CPU / 内存 / GPU / 网速 / 电量 / DeepSeek 余额 / 今日消费 / 额度
- **接管对话提问**：`ask_user_question` 的题逐题弹在桌宠上，答完一次性交回（四种模式）
- **接管风险审批**：`approval/request` 里点「允许一次 / 拒绝」
- **任务进程**：读 `todos` 投影，长按立绘播报进度
- **卡片模式**：不加载立绘，只保留审批 / 提问小卡片
- **游戏语音**（可选，需自备语音包）：点击按概率播、右键「说句话」必播，状态栏上方显示中文字幕条
- 周期气泡默认 1 分钟一条，可调 30 秒 / 2 分钟 / 5 分钟 / 关闭

## 安装

### 从源码目录

```bash
git clone https://github.com/cobaltions/dsh-pet-madoka.git
dsh plugin --profile desktop add "<仓库目录>"
```

装好后重启 DSH（或在插件管理里重新加载），桌面上会出现桌宠窗口。

> 只支持 Windows：透明置顶、点击穿透、贴边贴靠都依赖 Windows 窗口行为。

## 导入模型素材（必做）

**本仓库不包含模型、贴图、语音**（它们属于原著作权人，不适合随代码分发）。
请按 [tools/IMPORT-ASSETS.md](tools/IMPORT-ASSETS.md) 的说明，用你自己合法获得的
Live2DViewerEX 工坊包（或任意 Cubism 3 模型）解包后运行：

```bash
python tools/import-model.py --src "<解包目录>" --out "pet/assets/live2d/madokatv"
python tools/import-voices.py --src "<解包目录>" --out "pet/assets/voice"
```

没有导入模型时桌宠仍能运行（状态面板、气泡、审批 / 提问卡片都可用），只是不显示立绘；
导入后右键 →「设置」→「重启桌宠」即可看到小圆。

素材的版权说明见 [NOTICE.md](NOTICE.md)。

## 设置一览

| 分组 | 项目 |
| --- | --- |
| 形象与气泡 | 昵称、缩放（60%–180%）、气泡字号/形状/不透明度、气泡间隔、语音档 |
| 状态栏 | 显示、详细度、不透明度 |
| 提问 | 闲聊提问间隔、对话与审批的处理方式 |
| 互动 | 自动换姿势间隔、音效音量 |
| 桌宠进程 | 重启 / 关掉桌宠 |
| 余额 | API Key、余额提醒阈值、今日额度 |

余额优先用设置里的 API Key，其次环境变量 `DEEPSEEK_API_KEY` 和 DSH 凭据服务；
都没有时会走 DSH 账号登录态（`deepseekAccount.getBalance()`），只登录 DSH 也能看到余额。

## 宿主接口

桌宠进程通过 `%USERPROFILE%\.dsh\storages\madoka-pet\` 下的文件与宿主半通信，
宿主半在 DSH webServer 上暴露：`/madoka-pet/state`、`/madoka-pet/control`、
`/madoka-pet/balance`、`/madoka-pet/hud`、`/madoka-pet/asset/:name`。

## 目录

```text
dsh-pet-Madoka/
├─ lib/
│  ├─ index.js       宿主半：设置、余额、系统状态、提问、审批、任务、桌宠进程管理
│  └─ client.js      DSH 设置页卡片
├─ pet/              Electron 渲染半
│  ├─ main.js        透明窗口、拖拽、贴边、托盘、诊断截图
│  ├─ renderer.js    Live2D、命中检测、交互、语音/字幕
│  ├─ index.html / style.css
│  └─ assets/        渲染库、内容包、音效（模型与语音由你自己导入）
├─ tools/            模型/语音导入脚本与说明
├─ cordis.patch.yml
├─ LICENSE           MIT（代码）
└─ NOTICE.md         素材来源与版权说明
```

## 许可

- **代码**：MIT，见 [LICENSE](LICENSE)
- **素材**：模型、贴图、语音、角色形象的著作权归原权利人（Magica Quartet / Aniplex、
  Magia Record Partners、模型作者等）。本仓库不包含这些素材，也不对它们授权。
  自行导入素材仅限个人使用，请勿再分发或商用。
- 开发与测试中使用到的第三方组件（PixiJS、pixi-live2d-display、Live2D Cubism Core 等）
  许可见 [NOTICE.md](NOTICE.md)。

## 免责声明

本项目是个人制作的第三方插件，与 DeepSeek、Live2D Inc.、Magica Quartet / Aniplex
均无隶属、授权或合作关系。使用风险自负：桌宠会创建透明置顶窗口、启动独立 Electron 进程，
并在首次启动时把 DSH 自带的 Electron 运行时复制/链接到 `~/.dsh/storages/madoka-pet/runtime/`。
