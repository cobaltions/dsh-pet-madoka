# 导入模型素材（把解包出来的模型整理成插件可用的标准 Cubism 3 目录）

本插件**不随仓库分发模型/贴图/语音**（版权原因）。你需要自己准备素材，再运行本目录的脚本。

## 1. 准备素材来源

合法获取方式举例（任选其一）：

1. **Live2DViewerEX 创意工坊**：订阅包含鹿目圆模型的工坊物品，下载到
   `Steam/steamapps/common/Live2DViewerEX/shared/workshop/<id>/`（里面有 `<id>.lpk` 和 `config.json`）。
   本插件作者使用的是工坊物品 `3023707198`（作者：浩劫者12345，模型来自《魔法纪录》）。
2. 任何符合 Cubism 3（`model3.json` + `.moc3`）的鹿目圆模型目录。

## 2. 解包 `.lpk`（只有第 1 种方式需要）

`.lpk` 是 Live2DViewerEX 的打包格式，用开源工具 [LpkUnpacker](https://github.com/ihopenot/LpkUnpacker) 解包：

```bash
git clone https://github.com/ihopenot/LpkUnpacker
python -m pip install filetype   # 命令行版只缺这一个依赖
python LpkUnpacker/LpkUnpacker.py -v \
  -c "<工坊目录>/config.json" \
  "<工坊目录>/<id>.lpk" \
  "<解包输出目录>"
```

解包后得到一个包含 `model0.json`、`Moc_*.moc3`、`Textures_*.png`、`Expressions_*.json`、
`Motions_*.json` 的目录。

## 3. 整理成插件模型目录

```bash
python tools/import-model.py --src "<解包输出目录>" --out "pet/assets/live2d/madokatv"
python tools/import-voices.py --src "<解包输出目录>" --out "pet/assets/voice"
```

脚本会：文件改名 / 重写干净的 `model3.json` / 归好 `Idle` 与 `Pose` 动作组 / 补一个 `reset` 表情；
语音脚本会拷出 mp3 并生成带官方中文台本的 `voices.json`。

## 4. 图标与预览（可选）

托盘图标、状态栏头像、README 预览图不在仓库里。你可以自己放：

- `pet/assets/icon.png`（48×48 透明）
- `pet/assets/avatar.png`（96×96 透明）
- `pet/assets/preview.png`（README 用）

缺图标时托盘会自动跳过，不影响桌宠本体。

## 5. 重启桌宠

右键桌宠 →「设置」→「重启桌宠」（或在托盘里重启）。模型加载成功后就能看到立绘；
没有模型时桌宠仍可运行（气泡 / 状态面板 / 审批卡片），只是不显示立绘。
