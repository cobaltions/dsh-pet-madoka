# -*- coding: utf-8 -*-
"""把解包出来的 Live2D 模型整理成插件可用的标准 Cubism 3 目录。

用法：
  python tools/import-model.py --src "<含 model0.json 的目录>" --out "pet/assets/live2d/madokatv"

做三件事：
  1. 按 model0.json 的引用把 moc3 / 贴图 / 物理 / pose / 动作 / 表情改名重排；
  2. 写一份干净的 model3.json（去掉 Live2DViewerEX 专有字段，动作归到 Idle / Pose 两组）；
  3. 补一个 reset 表情（把默认表情的腮红归零），用于情绪回正。
"""
import argparse
import json
import os
import shutil


def find_model_json(src):
    direct = os.path.join(src, 'model0.json')
    if os.path.exists(direct):
        return direct
    for name in os.listdir(src):
        sub = os.path.join(src, name)
        if os.path.isdir(sub) and os.path.exists(os.path.join(sub, 'model0.json')):
            return os.path.join(sub, 'model0.json')
    raise SystemExit('没有在 --src 下找到 model0.json，请检查解包输出目录')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--src', required=True, help='LpkUnpacker 解包输出目录（含 model0.json）')
    parser.add_argument('--out', required=True, help='插件模型目录，例如 pet/assets/live2d/madokatv')
    args = parser.parse_args()

    model_path = find_model_json(args.src)
    base = os.path.dirname(model_path)
    model = json.load(open(model_path, encoding='utf-8'))
    files = model['FileReferences']
    out = args.out

    if os.path.isdir(out):
        shutil.rmtree(out)
    os.makedirs(os.path.join(out, 'Madoka.1024'), exist_ok=True)
    os.makedirs(os.path.join(out, 'motions'), exist_ok=True)
    os.makedirs(os.path.join(out, 'expressions'), exist_ok=True)

    def copy(rel, target):
        shutil.copyfile(os.path.join(base, rel), os.path.join(out, target))
        return target

    copy(files['Moc'], 'Madoka.moc3')
    textures = []
    for index, texture in enumerate(files.get('Textures') or []):
        rel = 'Madoka.1024/texture_%02d.png' % index
        copy(texture, rel)
        textures.append(rel)
    if files.get('Physics'):
        copy(files['Physics'], 'Madoka.physics3.json')
    pose = None
    if files.get('Pose'):
        pose = copy(files['Pose'], 'Madoka.pose3.json')

    # 动作：Motion 组的 Name 是语义名（motion_000 ...），Motion#2 里是游戏逻辑用的短名
    motions = files.get('Motions') or {}
    file_names = {}
    for entry in motions.get('Motion') or []:
        if isinstance(entry, dict) and entry.get('File') and entry.get('Name'):
            file_names[entry['File']] = entry['Name']
    for group, entries in motions.items():
        if group in ('Start', 'Tap', 'Face#4', 'Voice#3', 'Story#1'):
            continue
        for entry in entries:
            if not isinstance(entry, dict) or not entry.get('File'):
                continue
            rel = entry['File']
            name = file_names.get(rel)
            if name is None:
                parts = os.path.splitext(os.path.basename(rel))[0].split('_')
                name = 'motion_%s' % parts[-2] if len(parts) >= 3 else 'motion'
            target = 'motions/%s.motion3.json' % name
            copy(rel, target)

    idle = [
        {'File': 'motions/%s.motion3.json' % name}
        for name in ('motion_000', 'motion_001')
        if os.path.exists(os.path.join(out, 'motions/%s.motion3.json' % name))
    ]
    poses = [
        {'File': 'motions/%s.motion3.json' % name}
        for name in ('motion_100', 'motion_101', 'motion_102', 'motion_200', 'motion_201', 'motion_300', 'motion_400')
        if os.path.exists(os.path.join(out, 'motions/%s.motion3.json' % name))
    ]

    expressions = []
    for entry in files.get('Expressions') or []:
        name = entry.get('Name', '')
        if name.endswith('.exp3.json'):
            name = name[: -len('.exp3.json')]
        if not name or not entry.get('File'):
            continue
        target = 'expressions/%s.exp3.json' % name
        copy(entry['File'], target)
        expressions.append({'Name': name, 'File': target})

    clean = {
        'Version': 3,
        'Type': 0,
        'FileReferences': {
            'Moc': 'Madoka.moc3',
            'Textures': textures,
            'Physics': 'Madoka.physics3.json',
            'Motions': {'Idle': idle, 'Pose': poses},
            'Expressions': expressions,
        },
        'Groups': [
            {'Target': 'Parameter', 'Name': 'EyeBlink', 'Ids': ['ParamEyeLOpen', 'ParamEyeROpen']},
            {'Target': 'Parameter', 'Name': 'LipSync', 'Ids': ['ParamMouthOpenY']},
        ],
    }
    if pose:
        clean['FileReferences']['Pose'] = pose

    # 补一个 reset 表情：复制默认表情、把腮红归零
    default_expr = None
    for candidate in expressions:
        if candidate['Name'] in ('mtn_ex_010', 'mtn_ex_110'):
            default_expr = candidate['File']
            break
    if default_expr is None and expressions:
        default_expr = expressions[0]['File']
    if default_expr:
        source = json.load(open(os.path.join(out, default_expr), encoding='utf-8'))
        reset = {
            'Type': 'Live2D Expression',
            'FadeInTime': 0.35,
            'FadeOutTime': 0.35,
            'Parameters': [],
        }
        for param in source.get('Parameters', []):
            item = dict(param)
            if item.get('Id') == 'ParamCheek':
                item['Value'] = 0
            reset['Parameters'].append(item)
        json.dump(reset, open(os.path.join(out, 'expressions', 'reset.exp3.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
        clean['FileReferences']['Expressions'].insert(0, {'Name': 'reset', 'File': 'expressions/reset.exp3.json'})

    json.dump(clean, open(os.path.join(out, 'Madoka.model3.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=2)

    print('模型已生成到', out)
    print('  贴图:', len(textures), '| 待机动作:', len(idle), '| 互动动作:', len(poses), '| 表情:', len(clean['FileReferences']['Expressions']))


if __name__ == '__main__':
    main()
