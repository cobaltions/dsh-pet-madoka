# -*- coding: utf-8 -*-
"""把解包目录里的游戏语音 + 官方中文台本整理成插件语音包。

用法：
  python tools/import-voices.py --src "<含 model0.json 的目录>" --out "pet/assets/voice"

输出：
  voice_00.mp3 ...（19 条左右） + voices.json（每条语音的 id / 文件 / 中文台本）
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
    raise SystemExit('没有在 --src 下找到 model0.json')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--src', required=True, help='LpkUnpacker 解包输出目录（含 model0.json）')
    parser.add_argument('--out', required=True, help='语音输出目录，例如 pet/assets/voice')
    args = parser.parse_args()

    model_path = find_model_json(args.src)
    base = os.path.dirname(model_path)
    model = json.load(open(model_path, encoding='utf-8'))
    voices = (model.get('FileReferences', {}).get('Motions') or {}).get('Voice#3') or []

    if os.path.isdir(args.out):
        shutil.rmtree(args.out)
    os.makedirs(args.out, exist_ok=True)

    entries = []
    for index, voice in enumerate(voices):
        sound = voice.get('Sound')
        text = (voice.get('Text') or '').strip()
        if not sound or not text:
            continue
        source = os.path.join(base, sound)
        if not os.path.exists(source):
            continue
        name = 'voice_%02d.mp3' % index
        shutil.copyfile(source, os.path.join(args.out, name))
        entries.append({'file': 'assets/voice/' + name, 'id': voice.get('Name', ''), 'text': text})

    greetings = [e['file'] for e in entries if any(k in e['text'] for k in ('早上好', '找到你了', '我叫鹿目圆'))]
    index = {
        'note': '游戏语音；台本为官方中文文本，仅限个人使用',
        'greeting': greetings,
        'files': [e['file'] for e in entries],
        'entries': entries,
    }
    json.dump(index, open(os.path.join(args.out, 'voices.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    print('语音已生成到', args.out, '| 条数:', len(entries), '| 问候类:', len(greetings))


if __name__ == '__main__':
    main()
