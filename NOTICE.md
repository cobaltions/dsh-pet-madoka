# NOTICE — 素材来源与第三方组件

本仓库（dsh-pet-Madoka）的**代码**按 MIT 发布。以下内容不属于代码授权范围。

## 1. 角色与素材版权

- 《魔法少女小圆》角色「鹿目圆（鹿目まどか）」及相关名称、形象的著作权归
  **Magica Quartet / Aniplex** 等原权利人所有。
- 本仓库**不包含**任何模型、贴图、语音或角色立绘。使用者需自行从合法渠道获取素材并导入
  （见 `tools/IMPORT-ASSETS.md`），导入素材仅限个人使用，不得再分发或商用。
- 开发时参考的素材来源（仅供说明，仓库不附带）：
  - TV 画风战斗服模型：《魔法纪录 魔法少女小圆外传》游戏内鹿目圆（角色 ID 200100），
    经 Steam 创意工坊 Live2DViewerEX 物品 `3023707198`（作者 **浩劫者12345**）解包整理；
    动作导入工具 [mgrcd-live2d](https://github.com/reosablo/mgrcd-live2d)
  - 圆神 Q 版备用模型：画师 **Twi棱镜**（B 站 space/25894873），著作财产权由 小城子 买断，
    经 [madoka-deskpet](https://github.com/xiaochengzina/madoka-deskpet) 引入
  - 游戏语音中文台本：[segfault-bilibili/magireco_cn_char_text](https://github.com/segfault-bilibili/magireco_cn_char_text)
  - 解包工具：[ihopenot/LpkUnpacker](https://github.com/ihopenot/LpkUnpacker)（仅调用，未内嵌其代码）

## 2. 第三方运行时库（仓库内包含）

| 文件 | 许可 |
| --- | --- |
| `pet/assets/live2d/pixi.min.js` | PixiJS v6.5.10 — MIT，Copyright (c) 2013-2023 Mathew Groves, Chad Engler and PixiJS contributors |
| `pet/assets/live2d/cubism4.min.js` | pixi-live2d-display — MIT，Copyright (c) 2020 Guan |
| `pet/assets/live2d/live2dcubismcore.min.js` | Live2D Cubism Core © Live2D Inc. — 专有软件，属许可协议中的「可再分发代码」，仅可原样随本应用附带；不得单独提取、修改、反向工程或再分发。协议：<https://www.live2d.com/eula/live2d-proprietary-software-license-agreement_en.html> |

## 3. 本项目原创内容

- 源代码（`lib/`、`pet/*.js`、`pet/index.html`、`pet/style.css`、`tools/*.py`）：MIT
- 音效 `pet/assets/sound/*.wav`：Python + numpy 合成（正弦分音 + 指数衰减包络），随代码 MIT
- 台词 / 提问 / 文案内容包 `pet/assets/content/madoka-content.json`：随代码 MIT

## 4. 上游代码

本项目基于 [bestlike093/dsh-cyrene-balance](https://github.com/bestlike093/dsh-cyrene-balance)
的 `dsh-cyrene-pet`（MIT，作者 柒柒 / bestlike093）改造，保留其 MIT 许可与署名。
