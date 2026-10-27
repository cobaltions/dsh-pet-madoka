/* 小圆桌宠渲染层：Live2D + 拖拽 + 点击穿透 + 台词 / 口型 / 状态面板 / 右键菜单 / 设置 */
(function () {
  'use strict'

  const canvas = document.getElementById('stage')
  const bubble = document.getElementById('bubble')
  const bubbleText = document.getElementById('bubble-text')
  const bubbleEmoji = document.getElementById('bubble-emoji')
  const hud = document.getElementById('hud')
  const hudBody = document.getElementById('hud-body')
  const menu = document.getElementById('menu')
  const settings = document.getElementById('settings')
  const askBox = document.getElementById('ask')
  const approvalBox = document.getElementById('approval')
  const taskSheet = document.getElementById('task-sheet')
  const subtitle = document.getElementById('subtitle')

  const W = window.innerWidth
  const H = window.innerHeight

  /* 卡片模式：只保留审批 / 提问卡片，不加载立绘，给已经有自己形象的用户 */
  const CARD_ONLY = new URLSearchParams(window.location.search).get('ui') === 'card'
  if (CARD_ONLY) document.body.classList.add('card-only')

  let model = null
  let app = null
  let mouthOpen = false
  let speakingUntil = 0
  let dragging = false
  let pressAt = null
  let pressPoint = null
  let interactive = false
  let idleTimer = 0
  let settingsOpen = false
  let live = null
  let zoom = 1
  /* 本地刚调过大小后，宿主 live.json 里还可能是旧 scale；这段时间内不要被旧值弹回去 */
  let zoomHoldUntil = 0
  let hudCollapsed = false
  let simpleCollapsed = true
  let hudExpanded = false
  let emojiHoldUntil = 0
  let lastEmojiName = ''
  let lastAskId = 0
  let lastApprovalId = 0
  let askState = null
  let taskTimer = null
  let lastHudKey = ''

  const report = (payload) => {
    try {
      window.pet && window.pet.report(payload)
    } catch {
      /* 上报失败不影响渲染 */
    }
  }

  const sendCommand = (payload) => {
    try {
      window.pet && window.pet.command(payload)
    } catch {
      /* 命令失败不影响渲染 */
    }
  }

  window.addEventListener('error', (event) => {
    report({ error: String(event.message || event.error), stack: event.error && event.error.stack })
  })
  window.addEventListener('unhandledrejection', (event) => {
    report({ rejection: String(event.reason) })
  })

  report({ stage: 'booting', width: W, height: H, dpr: window.devicePixelRatio })

  if (!CARD_ONLY && (typeof PIXI === 'undefined' || typeof PIXI.live2d === 'undefined')) {
    report({ fatal: 'pixi-not-ready', hasPixi: typeof PIXI, hasLive2d: typeof PIXI !== 'undefined' && !!PIXI.live2d })
    return
  }

  if (!CARD_ONLY) {
    app = new PIXI.Application({
      view: canvas,
      width: W,
      height: H,
      transparent: true,
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
      powerPreference: 'high-performance',
    })

    report({ stage: 'pixi-ready', version: PIXI.VERSION })
  }

  const MODEL_URL = 'assets/live2d/madokatv/Madoka.model3.json'
  /* 表情别名：右值必须是 Madoka.model3.json 里登记的 Expressions 名字。
     22 个表情来自《魔法纪录》游戏，按参数差异归成 12 组情绪（010 微笑 / 011 弯眼笑 /
     030 难过 / 051 惊讶 / 060 困倦 …）。reset 是我们自己补的「回正」表情。 */
  const EXPRESSIONS = {
    reset: 'reset',
    smile: 'mtn_ex_010',
    happy: 'mtn_ex_011',
    sad: 'mtn_ex_030',
    worried: 'mtn_ex_020',
    surprised: 'mtn_ex_051',
    sleepy: 'mtn_ex_060',
    calm: 'mtn_ex_040',
    closed: 'mtn_ex_041',
    shy: 'mtn_ex_063',
    sadder: 'mtn_ex_031',
    puzzled: 'mtn_ex_064',
  }
  /* 动作组：这个模型自带 9 个动作（2 个待机循环 + 7 个互动手势） */
  const MOTION_IDLE = 'Idle'
  const MOTION_POSE = 'Pose'

  /* ------------------------------ 内容包 ------------------------------ */
  /* 台词 / 表情字 / 文案放在 assets/content/madoka-content.json；读不到就用内置兜底 */
  let content = null
  const EMOJI_TEXT = {
    HI: '👋',
    hello: '🙂',
    Gigglelots: '😄',
    Thumbsup: '👍',
    sonice: '👌',
    Airkiss: '😘',
    thinking: '🤔',
    poorwallet: '💸',
    shyshort: '☺️',
    Whatswrong: '😯',
    sleepynow: '😴',
    thanks: '🙏',
    Sobbinghard: '😭',
    PanincCrying: '😰',
    Madnow: '😤',
    hugtight: '🤗',
    goodnight: '🌙',
    goodmoring1: '🌞',
    teatime: '🍵',
    eating: '🍰',
    fighting: '💪',
    OK: '👌',
    Free: '🕊️',
    missme: '💗',
    blushhard: '😳',
    awkward: '😅',
    deadtired: '😵',
    Dramatic: '😲',
    Dreak: '💤',
    foryou: '🎁',
    giveup: '🙇',
    hellyeah: '🙌',
    hmph: '😤',
    Hurtcry: '😢',
    midmeh: '😐',
    putmd: '😠',
    sogood: '😊',
    sotired: '🥱',
    Vcayover: '✌️',
    weeploud: '😢',
    awesome: '🤩',
    Allset: '✅',
    copythat: '🫡',
    playful: '😜',
  }
  const CLICK_LINES_FALLBACK = [
    '我在这里哦。',
    '嗯？怎么啦？',
    '被摸头了呢…',
    '一起加油吧。',
    '有什么想说的吗？',
    '今天的你，很努力呢。',
    '轻轻的一下，我记住啦。',
    '我也想陪着你。',
  ]

  fetch('assets/content/madoka-content.json')
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      if (data !== null && typeof data === 'object') content = data
    })
    .catch(() => {
      /* 没有内容包时用内置兜底 */
    })

  function contentOf(key) {
    return content !== null && content[key] !== undefined ? content[key] : null
  }

  function bubbleLine(key, fallback) {
    const bubbles = contentOf('bubbles')
    const value = bubbles !== null && typeof bubbles[key] === 'string' ? bubbles[key] : ''
    return value === '' ? fallback : value
  }

  function emojiGlyph(name) {
    const map = contentOf('emoji')
    if (map !== null && typeof map[name] === 'string' && map[name] !== '') return map[name]
    return EMOJI_TEXT[name] || '✨'
  }

  function greetLine() {
    const table = contentOf('greetLines')
    if (table === null || typeof table !== 'object') return ''
    const hour = new Date().getHours()
    const slot = hour < 5 ? 'lateNight' : hour < 11 ? 'morning' : hour < 17 ? 'afternoon' : hour < 23 ? 'evening' : 'lateNight'
    const list = Array.isArray(table[slot]) ? table[slot] : []
    return list.length === 0 ? '' : list[Math.floor(Math.random() * list.length)]
  }

  /* 模型参数安全读写：不同模型未必有 ParamBreath 之类的参数，缺了就当没有 */
  function coreParamIndex(core, id) {
    try {
      if (core !== null && typeof core.getParameterIndex === 'function') return core.getParameterIndex(id)
      if (core !== null && core._parameterIds instanceof Map) return core._parameterIds.has(id) ? 0 : -1
    } catch {
      /* 拿不到索引就当参数不存在 */
    }
    return -1
  }

  function setCoreParam(core, id, value) {
    try {
      if (coreParamIndex(core, id) < 0) return
      core.setParameterValueById(id, value)
    } catch {
      /* 参数不存在时忽略 */
    }
  }

  function readCoreParam(core, id) {
    try {
      if (coreParamIndex(core, id) < 0) return null
      return Number(core.getParameterValueById(id))
    } catch {
      return null
    }
  }

  /* ------------------------------ 气泡 / 口型 / 语音 ------------------------------ */

  const sounds = {
    click: new Audio('assets/sound/click.wav'),
    talk: new Audio('assets/sound/talk.wav'),
    over: new Audio('assets/sound/over.wav'),
  }
  let lastTalkSoundAt = 0
  let lastPoseAt = 0
  let lastBalanceTotal = null
  let poseTimer = null
  let poseKey = ''
  let soundEnabled = true
  let soundVolume = 0.5
  /* 游戏语音 */
  let voiceIndex = null
  let voiceAudio = null
  let voiceLastPlayedAt = 0
  let voiceLastFile = ''
  let voiceActive = false
  let voiceLevel = 0.6

  fetch('assets/voice/voices.json')
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      if (data !== null && Array.isArray(data.entries) && data.entries.length > 0) voiceIndex = data
    })
    .catch(() => {
      /* 没有语音包就不播语音 */
    })

  function pickVoice(kind) {
    if (voiceIndex === null) return null
    const files = kind === 'greeting' && Array.isArray(voiceIndex.greeting) && voiceIndex.greeting.length > 0
      ? voiceIndex.greeting
      : voiceIndex.files
    if (!Array.isArray(files) || files.length === 0) return null
    const entries = (voiceIndex.entries || []).filter((item) => files.includes(item.file))
    if (entries.length === 0) return null
    let pick = entries[Math.floor(Math.random() * entries.length)]
    if (entries.length > 1 && pick.file === voiceLastFile) {
      pick = entries[(entries.indexOf(pick) + 1) % entries.length]
    }
    return pick
  }

  function subtitleBottom() {
    const hudHeight = hudHeightNow()
    const hudTop = window.innerHeight - HUD_EDGE - hudHeight
    return hudHeight > 0 ? window.innerHeight - hudTop + 8 : 10
  }

  function showSubtitle(text) {
    if (subtitle === null) return
    subtitle.textContent = text
    subtitle.style.bottom = `${subtitleBottom()}px`
    subtitle.classList.remove('hidden')
  }

  function hideSubtitle() {
    if (subtitle === null) return
    subtitle.classList.add('hidden')
  }

  /* 播放一条游戏语音（带中文字幕条）。返回是否真的开始播 */
  function playVoice(kind) {
    if (!soundEnabled || soundVolume <= 0) return false
    if (voiceLevel <= 0) return false
    const pick = pickVoice(kind)
    if (pick === null) return false
    try {
      if (voiceAudio === null) {
        voiceAudio = new Audio()
        voiceAudio.addEventListener('ended', () => {
          voiceActive = false
          hideSubtitle()
        })
      }
      voiceAudio.pause()
      voiceAudio.src = pick.file
      voiceAudio.volume = Math.min(1, Math.max(0, soundVolume) * 0.95)
      voiceAudio.currentTime = 0
      const result = voiceAudio.play()
      if (result !== undefined && typeof result.catch === 'function') {
        result.catch(() => {
          /* 自动播放被拦：不显示字幕，避免只有文字没有声音 */
          voiceActive = false
          hideSubtitle()
        })
      }
      voiceLastFile = pick.file
      voiceLastPlayedAt = Date.now()
      voiceActive = true
      showSubtitle(pick.text)
      return true
    } catch {
      return false
    }
  }

  /* DeepSeek 优惠时段：北京时间 00:30 - 08:30 */
  function rateLabel() {
    const now = new Date()
    const minutes = now.getHours() * 60 + now.getMinutes()
    const offPeak = minutes >= 30 && minutes < 510
    return offPeak ? { text: '谷价 · 半价', hot: true } : { text: '标准价', hot: false }
  }

  function playSound(name) {
    if (!soundEnabled) return
    const audio = sounds[name]
    if (!audio) return
    try {
      audio.volume = Math.min(1, Math.max(0, soundVolume))
      audio.currentTime = 0
      const result = audio.play()
      if (result && typeof result.catch === 'function') result.catch(() => {})
    } catch {
      /* 自动播放受限时静默 */
    }
  }

  function applyLook(data) {
    const width = Number(data.bubbleWidth) || 0
    bubble.style.width = width > 0 ? `${Math.min(width, window.innerWidth - 12)}px` : 'calc(100% - 12px)'
    bubble.style.fontSize = `${Number(data.bubbleFont) || 14.5}px`
    bubble.style.borderRadius = `${Math.max(0, Number(data.bubbleRadius) || 0)}px`

    const bubbleAlpha = Math.min(1, Math.max(0.5, Number(data.bubbleAlpha) || 0.97))
    bubble.style.setProperty('--bubble-a', String(bubbleAlpha))
    const hudAlpha = Math.min(1, Math.max(0.4, Number(data.hudAlpha) || 0.93))
    hud.style.setProperty('--hud-a', String(hudAlpha))

    const items = Array.isArray(data.hudItems) ? data.hudItems : null
    const show = (key) => items === null || items.includes(key)

    document.querySelectorAll('.hud-metric').forEach((el, index) => {
      el.classList.toggle('hidden', !show(['cpu', 'mem', 'gpu'][index]))
    })
    document.querySelector('.hud-grid').classList.toggle('hidden', !show('cpu') && !show('mem') && !show('gpu'))
    document.querySelector('.hud-line').classList.toggle('hidden', !show('net') && !show('bat'))
    document.getElementById('hud-net').classList.toggle('hidden', !show('net'))
    document.getElementById('hud-bat').classList.toggle('hidden', !show('bat'))
    document.querySelector('.hud-money').classList.toggle('hidden', !show('money'))
    document.querySelector('.hud-chips').classList.toggle('hidden', !show('chips'))
    document.querySelector('.hud-quota').classList.toggle('hidden', !show('quota'))

    soundEnabled = data.soundEnabled !== false
    soundVolume = Math.min(1, Math.max(0, Number(data.soundVolume) ?? 0.5))
    if (data.voiceLevel !== undefined) {
      voiceLevel = Math.min(1, Math.max(0, Number(data.voiceLevel) || 0))
    }

    const nextPoseKey = `${data.idlePose !== false}|${Math.max(30, Number(data.poseSeconds) || 60)}`
    if (nextPoseKey !== poseKey) {
      poseKey = nextPoseKey
      if (poseTimer !== null) {
        window.clearInterval(poseTimer)
        poseTimer = null
      }
      if (data.idlePose !== false) {
        const seconds = Math.max(30, Number(data.poseSeconds) || 60)
        poseTimer = window.setInterval(() => {
          if (document.hidden) return
          randomPose()
        }, seconds * 1000)
      }
    }
  }

  function setEmoji(name) {
    if (bubbleEmoji === null) return
    const glyph = emojiGlyph(name)
    if (bubbleEmoji.textContent === glyph) return
    bubbleEmoji.textContent = glyph
  }

  function renderQuota(quota) {
    const box = document.querySelector('.hud-quota')
    const fill = document.getElementById('hud-quota-fill')
    const text = document.getElementById('hud-quota-text')
    if (box === null || fill === null || text === null) return
    if (quota === null || !quota || !quota.limit) {
      box.classList.remove('warn', 'over')
      fill.style.width = '0%'
      text.textContent = '未设'
      return
    }
    const percent = Math.min(100, Math.round((Number(quota.ratio) || 0) * 100))
    fill.style.width = `${percent}%`
    text.textContent = `${Number(quota.spent).toFixed(2)} / ${Number(quota.limit).toFixed(0)}`
    box.classList.toggle('over', Boolean(quota.overBudget))
    box.classList.toggle('warn', !quota.overBudget && percent >= 80)
  }

  const FALLBACK_EMOJI = ['HI', 'hello', 'Gigglelots', 'Thumbsup', 'sonice', 'Airkiss', 'thinking']

  /* 表情驱动的姿势池（动作丢失时兜底用） */
  const POSE_EXPRESSIONS = ['smile', 'happy', 'worried', 'surprised', 'calm', 'closed', 'shy']

  function poseFace() {
    return POSE_EXPRESSIONS[Math.floor(Math.random() * POSE_EXPRESSIONS.length)]
  }

  function faceFor(ms) {
    try {
      model.expression(poseFace())
      window.clearTimeout(faceFor.timer)
      faceFor.timer = window.setTimeout(() => {
        try {
          model.expression(EXPRESSIONS.reset)
        } catch {
          /* 表情缺失时忽略 */
        }
      }, ms || 5600)
    } catch {
      /* 表情缺失时忽略 */
    }
  }

  function localQuota(data) {
    if (data.quota && typeof data.quota === 'object') return data.quota
    const limit = Number(data.dailyLimit) || 0
    if (limit <= 0) return null
    const spent = Number(data.balance && data.balance.spent) || 0
    const ratio = spent / limit
    return {
      limit,
      spent,
      ratio,
      overBudget: spent > limit,
      nearLimit: spent <= limit && ratio >= 0.8,
    }
  }

  function localEmoji(quota, speakNow) {
    if (quota && quota.overBudget) return 'poorwallet'
    if (quota && quota.nearLimit) return 'thinking'
    if (speakNow) return 'Gigglelots'
    return 'HI'
  }

  function randomPose() {
    if (model === null) return
    /* 优先播放模型自带手势动作（这个模型有 7 个） */
    try {
      const poses = model.internalModel.settings.motions?.[MOTION_POSE]
      if (Array.isArray(poses) && poses.length > 0) {
        model.motion(MOTION_POSE, Math.floor(Math.random() * poses.length), PIXI.live2d.MotionPriority.NORMAL)
        return
      }
    } catch {
      /* 动作缺失时退回表情 */
    }
    const expressions = Object.values(EXPRESSIONS).filter((name) => name !== EXPRESSIONS.reset)
    try {
      const name = expressions[Math.floor(Math.random() * expressions.length)]
      model.expression(name)
      window.clearTimeout(randomPose.timer)
      randomPose.timer = window.setTimeout(() => {
        try {
          model.expression(EXPRESSIONS.reset)
        } catch {
          /* 表情缺失时忽略 */
        }
      }, 6000)
    } catch {
      /* 表情缺失时忽略 */
    }
  }

  function showBubble(text, ms) {
    if (!text) return
    /* 正在播语音时用底部字幕条，不再叠气泡 */
    if (voiceActive) return
    /* 有提问/审批卡片时先让位，别和卡片叠在一起 */
    if (!CARD_ONLY && cardReserve() > 0) {
      bubble.classList.remove('show')
      return
    }
    bubbleText.textContent = text
    bubble.classList.add('show')
    window.clearTimeout(showBubble.timer)
    showBubble.timer = window.setTimeout(() => bubble.classList.remove('show'), ms || 2600)
  }

  function speak(text, ms) {
    showBubble(text, Math.max(1800, ms || 2600))
    speakingUntil = performance.now() + Math.max(1200, ms || 2600)
    mouthOpen = true
    const now = Date.now()
    if (now - lastTalkSoundAt > 28000) {
      lastTalkSoundAt = now
      playSound('talk')
    }
    if (model !== null) {
      try {
        model.expression(EXPRESSIONS.smile)
      } catch {
        /* 表情缺失时只做口型 */
      }
    }
  }

  function playIdle() {
    if (model === null) return
    /* 待机循环优先用模型自带的 2 个动作，没有才退回表情 */
    try {
      const idles = model.internalModel.settings.motions?.[MOTION_IDLE]
      if (Array.isArray(idles) && idles.length > 0) {
        model.motion(MOTION_IDLE, Math.floor(Math.random() * idles.length), PIXI.live2d.MotionPriority.IDLE)
        return
      }
    } catch {
      /* 动作缺失时退回表情 */
    }
    faceFor(5000)
  }

  /* ------------------------------ 命中与穿透 ------------------------------ */

  function rectOf(element) {
    if (element === null || element.classList.contains('hidden')) return null
    const rect = element.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return null
    return rect
  }

  function insideRect(x, y, rect) {
    return rect !== null && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
  }

  function onPanel(x, y) {
    return (
      insideRect(x, y, rectOf(hud)) ||
      insideRect(x, y, rectOf(menu)) ||
      insideRect(x, y, rectOf(settings)) ||
      insideRect(x, y, rectOf(askBox)) ||
      insideRect(x, y, rectOf(approvalBox)) ||
      insideRect(x, y, rectOf(taskSheet))
    )
  }

  function isPointOnPet(x, y) {
    if (model === null) return false
    const iw = model.internalModel.width
    const ih = model.internalModel.height
    if (!iw || !ih) return false
    const scale = model.scale.x
    const artW = iw * (1 - ART.left - ART.right) * scale
    const artH = ih * (1 - ART.top - ART.bottom) * scale
    if (artW <= 0 || artH <= 0) return false
    /* 椭圆按可见立绘框收窄一点，透明留白不抢鼠标 */
    const radiusX = artW * 0.44
    const radiusY = artH * 0.5
    const cx = model.x + (ART.left * iw + (iw * (1 - ART.left - ART.right)) / 2) * scale
    const cy = model.y + (ART.top * ih + (ih * (1 - ART.top - ART.bottom)) / 2) * scale
    const nx = (x - cx) / radiusX
    const ny = (y - cy) / radiusY
    return nx * nx + ny * ny <= 1
  }

  function updateInteractive(x, y) {
    const next = onPanel(x, y) || isPointOnPet(x, y)
    if (next === interactive) return
    interactive = next
    if (window.pet) window.pet.setInteractive(next)
  }

  /* ------------------------------ 状态面板 ------------------------------ */

  function setText(id, text) {
    const node = document.getElementById(id)
    if (node !== null) node.textContent = text
  }

  function formatPercent(value) {
    return typeof value === 'number' ? `${Math.round(value)}%` : '--'
  }

  function formatRate(value) {
    if (typeof value !== 'number') return '--'
    if (value >= 1024) return `${(value / 1024).toFixed(1)} MB/s`
    return `${value.toFixed(0)} KB/s`
  }

  function moodOf(quotaInfo) {
    if (quotaInfo && quotaInfo.overBudget) return '额度用完啦…'
    if (quotaInfo && quotaInfo.nearLimit) return '快到额度了'
    if (live !== null && live.balance && live.balance.overThreshold) return '余额有点少'
    const last = Number(live !== null ? live.lastSessionAt : 0) || 0
    if (last <= 0) return '在呢'
    const idle = Date.now() - last
    if (idle < 90 * 1000) return '正在想事情♪'
    if (idle < 10 * 60 * 1000) return '刚和你说过话'
    if (idle < 60 * 60 * 1000) return '等你回来呢'
    return '有点想你了'
  }

  function relTime(then) {
    if (!then) return '还没有记录'
    const diff = Date.now() - then
    if (diff < 60000) return '刚刚'
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
    return `${Math.floor(diff / 86400000)} 天前`
  }

  /* 提问气泡：对话里的 ask_user_question 由宿主推来；多题时逐题问，最后一起交回去 */
  function hideAsk() {
    askState = null
    if (askBox !== null) askBox.classList.add('hidden')
    if (!CARD_ONLY) layoutModel()
  }

  function askEl(id) {
    return document.getElementById(id)
  }

  function resetAskControls() {
    const tip = askEl('ask-tip')
    const confirm = askEl('ask-confirm')
    const skip = askEl('ask-skip')
    if (tip !== null) tip.classList.add('hidden')
    if (confirm !== null) {
      confirm.classList.add('hidden')
      confirm.disabled = true
      confirm.onclick = null
    }
    if (skip !== null) {
      skip.classList.add('hidden')
      skip.onclick = null
    }
  }

  function pulseAsk() {
    if (askBox === null) return
    askBox.classList.remove('hidden')
    askBox.classList.add('pulse')
    window.setTimeout(() => askBox.classList.remove('pulse'), 1200)
    if (!CARD_ONLY) layoutModel()
  }

  /* 桌宠自己的闲聊提问：点一下就算答完 */
  function paintPetQuestion(ask) {
    const head = askEl('ask-head')
    const text = askEl('ask-text')
    const choices = askEl('ask-choices')
    if (text === null || choices === null) return
    if (head !== null) head.textContent = bubbleLine('askHead', '小圆想问你一下')
    text.textContent = ask.text ?? ''
    resetAskControls()
    choices.innerHTML = ''
    for (const label of Array.isArray(ask.choices) ? ask.choices : []) {
      if (typeof label !== 'string' || label === '') continue
      const button = document.createElement('button')
      button.type = 'button'
      button.textContent = label
      button.addEventListener('click', () => {
        sendCommand({ action: 'answer', askId: Number(ask.id) || 0, question: ask.text, answer: label, selected: [label] })
        hideAsk()
        showBubble(`记下了♪ 「${label}」`, 2200)
      })
      choices.append(button)
    }
    pulseAsk()
  }

  function askBatchAnswers(ask) {
    return ask.questions.map((question) => ({
      id: question.id,
      selected: askState === null ? [] : (askState.answers.get(question.id) ?? []),
    }))
  }

  function finishConversationAsk(ask) {
    sendCommand({ action: 'answer', askId: Number(ask.id) || 0, answers: askBatchAnswers(ask) })
    const skipped = ask.questions.length - (askState === null ? 0 : askState.answers.size)
    hideAsk()
    showBubble(skipped > 0 ? `跳过 ${skipped} 题，回头再答也行♪` : '都记下啦♪', 2400)
  }

  function stepConversationAsk(ask, selected) {
    if (askState === null) return
    const question = ask.questions[askState.index]
    askState.answers.set(question.id, selected)
    if (askState.index + 1 < ask.questions.length) {
      askState.index += 1
      paintConversationQuestion(ask)
      return
    }
    finishConversationAsk(ask)
  }

  function paintConversationQuestion(ask) {
    const head = askEl('ask-head')
    const text = askEl('ask-text')
    const choices = askEl('ask-choices')
    const tip = askEl('ask-tip')
    const confirm = askEl('ask-confirm')
    const skip = askEl('ask-skip')
    if (text === null || choices === null || askState === null) return
    const total = ask.questions.length
    const index = Math.min(askState.index, total - 1)
    const question = ask.questions[index]
    const multi = question.multi === true
    const picked = new Set(askState.answers.get(question.id) ?? [])
    if (head !== null) head.textContent = total > 1 ? `对话里的问题 · ${index + 1}/${total}` : '对话里的问题'
    text.textContent = question.text ?? ''
    if (tip !== null) tip.classList.toggle('hidden', multi !== true)
    if (skip !== null) {
      skip.classList.remove('hidden')
      skip.textContent = total > 1 && index + 1 < total ? '跳过这题' : '跳过'
      skip.onclick = () => stepConversationAsk(ask, [])
    }
    if (confirm !== null) {
      confirm.classList.toggle('hidden', multi !== true)
      confirm.textContent = index + 1 < total ? '下一题♪' : '答好了♪'
      confirm.disabled = picked.size === 0
      confirm.onclick = () => {
        if (picked.size > 0) stepConversationAsk(ask, [...picked])
      }
    }
    choices.innerHTML = ''
    for (const label of Array.isArray(question.choices) ? question.choices : []) {
      if (typeof label !== 'string' || label === '') continue
      const button = document.createElement('button')
      button.type = 'button'
      button.textContent = label
      button.classList.toggle('picked', picked.has(label))
      button.addEventListener('click', () => {
        if (multi !== true) {
          stepConversationAsk(ask, [label])
          return
        }
        if (picked.has(label)) picked.delete(label)
        else picked.add(label)
        button.classList.toggle('picked', picked.has(label))
        if (confirm !== null) confirm.disabled = picked.size === 0
      })
      choices.append(button)
    }
    askBox.classList.remove('hidden')
    if (!CARD_ONLY) layoutModel()
  }

  function renderAsk() {
    if (askBox === null) return
    const ask = live !== null && live.ask && typeof live.ask === 'object' ? live.ask : null
    if (ask === null) {
      if (lastAskId !== 0) hideAsk()
      return
    }
    const fromConversation = ask.source === 'conversation' && Array.isArray(ask.questions)
    if (fromConversation !== true && live.askEnabled !== true) {
      hideAsk()
      return
    }
    const id = Number(ask.id) || 0
    if (id === lastAskId) return
    lastAskId = id
    askState = null
    if (fromConversation === true) {
      if (ask.questions.length === 0) {
        hideAsk()
        return
      }
      askState = { id, index: 0, answers: new Map() }
      paintConversationQuestion(ask)
      pulseAsk()
      if (!CARD_ONLY) speak(bubbleLine('askIntro', '有个问题想问问你，可以吗？'), 2600)
      return
    }
    paintPetQuestion(ask)
  }

  /* 风险审批：只给「允许一次 / 拒绝」两个决定 */
  function hideApproval() {
    if (approvalBox !== null) approvalBox.classList.add('hidden')
    if (!CARD_ONLY) layoutModel()
  }

  function answerApproval(approval, decision) {
    sendCommand({
      action: 'approval',
      approvalId: Number(approval.id) || 0,
      decision: decision === 'allowed-once' ? 'allowed-once' : 'rejected',
    })
    hideApproval()
    showBubble(decision === 'allowed-once' ? '允许这一次♪' : '拒绝了，保持原样。', 2400)
    playSound('click')
  }

  function renderApproval() {
    if (approvalBox === null) return
    const approval = live !== null && live.approval && typeof live.approval === 'object' ? live.approval : null
    if (approval === null) {
      hideApproval()
      return
    }
    const id = Number(approval.id) || 0
    if (id === lastApprovalId) return
    lastApprovalId = id
    const text = document.getElementById('approval-text')
    const allow = document.getElementById('approval-allow')
    const reject = document.getElementById('approval-reject')
    if (text === null || allow === null || reject === null) return
    const tool = typeof approval.tool === 'string' && approval.tool !== '' ? approval.tool : '工具'
    const reason = typeof approval.reason === 'string' ? approval.reason.trim() : ''
    text.textContent = reason === '' ? `「${tool}」想越权执行` : `「${tool}」想越权执行\n${reason}`
    allow.onclick = () => answerApproval(approval, 'allowed-once')
    reject.onclick = () => answerApproval(approval, 'rejected')
    approvalBox.classList.remove('hidden')
    approvalBox.classList.add('pulse')
    window.setTimeout(() => approvalBox.classList.remove('pulse'), 1200)
    if (!CARD_ONLY) layoutModel()
    if (!CARD_ONLY) speak(bubbleLine('approvalIntro', '有个操作想请你批准一下。'), 2600)
  }

  function todosOf(source) {
    return source !== null && source !== undefined && Array.isArray(source.todos) ? source.todos : []
  }

  function shorten(text, max) {
    const value = typeof text === 'string' ? text.trim() : ''
    return value.length > max ? `${value.slice(0, max - 1)}…` : value
  }

  function todoSpeech() {
    const todos = todosOf(live)
    let groupId = 'empty'
    let values = {}
    if (todos.length > 0) {
      const done = todos.filter((item) => item.status === 'completed').length
      const total = todos.length
      const remain = total - done
      const active = todos.find((item) => item.status === 'in_progress')
      const pending = todos.filter((item) => item.status === 'pending')
      const next = active !== undefined ? active : pending[0]
      if (done === total) groupId = 'done'
      else if (active !== undefined) groupId = 'progress'
      else groupId = 'pending'
      values = { done, total, remain, current: shorten(next === undefined ? '' : next.content, 14) }
    }

    const templates = contentOf('longPressTask')
    if (Array.isArray(templates)) {
      const group = templates.find((item) => item !== null && item.id === groupId)
      const list = Array.isArray(group && group.templates) ? group.templates : []
      if (list.length > 0) {
        const template = String(list[Math.floor(Math.random() * list.length)])
        return template.replace(/\{(\w+)\}/g, (match, key) => {
          return Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match
        })
      }
    }

    if (todos.length === 0) return '现在手上还没有任务卡呢。'
    const done = todos.filter((item) => item.status === 'completed').length
    if (done === todos.length) return `刚才那批任务都完成啦，一共 ${todos.length} 项♪`
    const active = todos.find((item) => item.status === 'in_progress')
    const pending = todos.filter((item) => item.status === 'pending')
    const parts = [`任务 ${done}/${todos.length} 完成`]
    if (active !== undefined) parts.push(`正在做「${shorten(active.content, 14)}」`)
    if (pending.length > 0) parts.push(`还排着 ${pending.length} 件，下一件是「${shorten(pending[0].content, 14)}」`)
    return `${parts.join('，')}♪`
  }

  function taskLines() {
    const list = []
    const source = live || {}
    const balance = source.balance && typeof source.balance === 'object' ? source.balance : null
    list.push(['最近对话', relTime(Number(source.lastSessionAt) || 0)])
    const todos = todosOf(source)
    if (todos.length > 0) {
      const done = todos.filter((item) => item.status === 'completed').length
      list.push(['任务进程', `${done}/${todos.length} 完成`])
      const active = todos.find((item) => item.status === 'in_progress')
      if (active !== undefined) list.push(['正在做', shorten(active.content, 14)])
    }
    if (balance !== null) {
      list.push(['今日消耗', `${Number(balance.spent || 0).toFixed(2)} 元`])
      list.push(['账户余额', `${Number(balance.total || 0).toFixed(2)} 元`])
    }
    const quota = localQuota(source)
    if (quota && Number(quota.limit) > 0) {
      list.push(['今日额度', `${Number(quota.spent || 0).toFixed(2)} / ${Number(quota.limit).toFixed(0)}`])
    }
    const asks = Array.isArray(source.asks) ? source.asks : []
    list.push(['已答问题', `${asks.length} 条`])
    const info = source.hud && typeof source.hud === 'object' ? source.hud : {}
    if (typeof info.cpu === 'number') list.push(['CPU', `${Math.round(info.cpu)}%`])
    if (typeof info.mem === 'number') list.push(['内存', `${Math.round(info.mem)}%`])
    return list
  }

  function renderTaskSheet() {
    const body = document.getElementById('task-list')
    const note = document.getElementById('task-note')
    if (body === null) return
    body.innerHTML = ''
    for (const [key, value] of taskLines()) {
      const row = document.createElement('div')
      row.className = 'task-row'
      const name = document.createElement('span')
      name.textContent = key
      const val = document.createElement('b')
      val.textContent = value
      row.append(name, val)
      body.append(row)
    }
    if (note !== null) {
      const asks = live !== null && Array.isArray(live.asks) ? live.asks : []
      const last = asks.length > 0 ? asks[asks.length - 1] : null
      note.textContent = last ? `上次回答：${last.question} → ${last.answer}` : '还没有回答过问题呢。'
    }
    renderTodoList()
  }

  /* 任务进程：从 live.todos 渲染当前任务的进度 */
  function renderTodoList() {
    const box = document.getElementById('task-todos')
    if (box === null) return
    box.innerHTML = ''
    const todos = todosOf(live)
    if (todos.length === 0) {
      const empty = document.createElement('p')
      empty.className = 'task-todo-empty'
      empty.textContent = '还没有任务卡呢。'
      box.append(empty)
      return
    }
    const marks = { completed: '✓', in_progress: '▶', pending: '·' }
    for (const item of todos.slice(0, 6)) {
      const row = document.createElement('div')
      row.className = `task-todo ${item.status || 'pending'}`
      const mark = document.createElement('i')
      mark.textContent = marks[item.status] ?? '·'
      const text = document.createElement('span')
      text.textContent = item.content
      row.append(mark, text)
      box.append(row)
    }
    if (todos.length > 6) {
      const more = document.createElement('div')
      more.className = 'task-todo more'
      more.textContent = `…还有 ${todos.length - 6} 项`
      box.append(more)
    }
  }

  function toggleTaskSheet(force) {
    if (taskSheet === null) return
    const open = force === undefined ? taskSheet.classList.contains('hidden') : force === true
    taskSheet.classList.toggle('hidden', open === false)
    window.clearTimeout(taskTimer)
    if (open) {
      renderTaskSheet()
      taskTimer = window.setTimeout(() => taskSheet.classList.add('hidden'), 14000)
    }
  }

  function renderHud() {
    if (live === null) return
    const detail = live.hudDetail || 'full'
    hud.classList.toggle('hidden', live.showHud !== true)
    hud.classList.toggle('mode-full', detail === 'full')
    hud.classList.toggle('mode-simple', detail === 'simple')
    hud.classList.toggle('mode-simple2', detail === 'simple2')
    hud.classList.toggle('expanded', detail === 'simple2' && hudExpanded)
    const collapsedNow =
      detail === 'full' ? hudCollapsed : detail === 'simple' ? simpleCollapsed : false
    hud.classList.toggle('collapsed', collapsedNow)
    report({
      stage: 'hud',
      hudClass: hud.className,
      hudHeight: Math.round(hud.getBoundingClientRect().height),
      compact: document.getElementById('hud-compact').textContent,
    })

    setText('hud-nickname', live.nickname || '柒柒')
    const quotaInfo = localQuota(live)
    setText('hud-mood', moodOf(quotaInfo))

    const info = live.hud || {}
    setText('hud-cpu', formatPercent(info.cpu))
    setText('hud-mem', formatPercent(info.mem))
    setText('hud-gpu', formatPercent(info.gpu))
    setText('hud-net', `↓ ${formatRate(info.netDown)} · ↑ ${formatRate(info.netUp)}`)
    setText(
      'hud-bat',
      typeof info.battery === 'number' ? `电量 ${info.battery}%${info.charging ? ' ⚡' : ''}` : '电量 --',
    )
    setText(
      'hud-compact',
      `CPU ${formatPercent(info.cpu)} · 内存 ${formatPercent(info.mem)} · GPU ${formatPercent(info.gpu)} · ↓ ${formatRate(info.netDown)}`,
    )

    const balance = live.balance
    if (balance === null || balance === undefined) {
      setText('hud-total', '--')
      setText('hud-spent', '今日 --')
      setText('hud-recharge', '充值 --')
      setText('hud-delta', '±0.00')
      document.getElementById('hud-delta').className = ''
    } else {
      const total = Number(balance.total) || 0
      setText('hud-total', total.toFixed(2))
      setText('hud-spent', `今日 ${Number(balance.spent || 0).toFixed(2)}`)
      setText('hud-recharge', `充值 ${Number(balance.recharge || 0).toFixed(2)}`)

      const delta = document.getElementById('hud-delta')
      if (lastBalanceTotal === null) {
        delta.textContent = '±0.00'
        delta.className = ''
      } else if (Math.abs(total - lastBalanceTotal) >= 0.005) {
        const diff = total - lastBalanceTotal
        delta.textContent = `${diff > 0 ? '+' : ''}${diff.toFixed(2)}`
        delta.className = diff > 0 ? 'up' : 'down'
      }
      lastBalanceTotal = total
    }

    const rate = rateLabel()
    const rateEl = document.getElementById('hud-rate')
    setText('hud-rate', rate.text)
    rateEl.classList.toggle('hot', rate.hot)

    const stamp = Number(live.at) || Date.now()
    const clock = new Date(stamp)
    setText('hud-updated', `${String(clock.getHours()).padStart(2, '0')}:${String(clock.getMinutes()).padStart(2, '0')}`)

    const rect = hud.getBoundingClientRect()
    const layoutKey = `${detail}|${live.showHud}|${hudCollapsed}|${hudExpanded}|${window.innerWidth}x${window.innerHeight}`
    if (layoutKey !== lastHudKey) {
      lastHudKey = layoutKey
      window.requestAnimationFrame(() => layoutModel())
    }
    /* 文案已经写完，这时量到的状态栏高度才是真的；窗口按它长高 / 收回 */
    syncWindowHeight()
    report({
      stage: 'hud-rendered',
      hudClass: hud.className,
      hudVisible: !hud.classList.contains('hidden'),
      hudRect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
      hudText: {
        cpu: document.getElementById('hud-cpu').textContent,
        mem: document.getElementById('hud-mem').textContent,
        gpu: document.getElementById('hud-gpu').textContent,
        net: document.getElementById('hud-net').textContent,
        bat: document.getElementById('hud-bat').textContent,
        total: document.getElementById('hud-total').textContent,
        recharge: document.getElementById('hud-recharge').textContent,
        rate: document.getElementById('hud-rate').textContent,
        delta: document.getElementById('hud-delta').textContent,
        quota: document.getElementById('hud-quota-text').textContent,
        quotaWidth: document.getElementById('hud-quota-fill').style.width,
        emoji: bubbleEmoji === null ? '' : bubbleEmoji.getAttribute('src'),
        alert: bubble.classList.contains('alert'),
      },
    })
  }

  /* ------------------------------ 菜单 ------------------------------ */

  function closeMenu() {
    menu.classList.add('hidden')
  }

  function openMenu(x, y) {
    menu.classList.remove('hidden')
    const rect = menu.getBoundingClientRect()
    /* 窗口大小会随缩放变化，这里必须用当前尺寸，不能用加载时的 W/H */
    const winW = window.innerWidth
    const winH = window.innerHeight
    const left = Math.max(4, Math.min(x, winW - rect.width - 4))
    const top = Math.max(4, Math.min(y, winH - rect.height - 4))
    menu.style.left = `${left}px`
    menu.style.top = `${top}px`
    markMenuState()
  }

  function markMenuState() {
    for (const button of menu.querySelectorAll('[data-bubble]')) {
      button.classList.toggle('active', live !== null && button.dataset.bubble === live.bubbleMode)
    }
    const currentScale = live !== null && typeof live.scale === 'number' ? live.scale : 1
    for (const button of menu.querySelectorAll('[data-scale]')) {
      const value = Number(button.dataset.scale)
      button.classList.toggle('active', Math.abs(value - currentScale) < 0.04)
    }
  }

  menu.addEventListener('click', (event) => {
    const button = event.target.closest('button')
    if (button === null) return
    event.stopPropagation()
    if (button.dataset.bubble) {
      sendCommand({ action: 'state', patch: { bubbleMode: button.dataset.bubble } })
    } else if (button.dataset.scale) {
      const scale = Number(button.dataset.scale)
      if (Number.isFinite(scale)) {
        previewZoom(scale)
        sendCommand({ action: 'state', patch: { scale } })
        showBubble(`大小调成 ${Math.round(scale * 100)}% 啦。`, 1800)
        playSound('click')
      }
    } else if (button.dataset.action === 'toggle-hud') {
      sendCommand({ action: 'state', patch: { showHud: !(live !== null && live.showHud) } })
    } else if (button.dataset.action === 'say') {
      /* 交给宿主强制说话；宿主回包带 force，渲染层优先用游戏语音 + 字幕 */
      sendCommand({ action: 'say' })
      playSound('click')
    } else if (button.dataset.action === 'task') {
      toggleTaskSheet(true)
      playSound('click')
    } else if (button.dataset.action === 'pose') {
      sendCommand({ action: 'pose' })
      randomPose()
      playSound('click')
    } else if (button.dataset.action === 'refresh') {
      sendCommand({ action: 'refresh' })
      showBubble('我去看看余额哦……', 1800)
    } else if (button.dataset.action === 'settings') {
      openSettings()
    } else if (button.dataset.action === 'hide') {
      if (window.pet) window.pet.hide()
    }
    closeMenu()
  })

  document.addEventListener('pointerdown', (event) => {
    if (!menu.classList.contains('hidden') && !menu.contains(event.target)) closeMenu()
  })

  /* ------------------------------ 设置 ------------------------------ */

  /* 从候选值里挑一个最接近的设置值：旧 state.json 的越界值、菜单档位不在下拉里时都不会把下拉框弄空 */
  function pickOption(id, value, options, fallback) {
    const node = document.getElementById(id)
    if (node === null) return
    const number = Number(value)
    if (!Number.isFinite(number) || options.length === 0) {
      node.value = String(fallback)
      return
    }
    let best = options[0]
    for (const option of options) {
      if (Math.abs(option - number) < Math.abs(best - number)) best = option
    }
    node.value = String(best)
  }

  function openSettings() {
    settingsOpen = true
    settings.classList.remove('hidden')
    closeMenu()
    if (CARD_ONLY && window.pet && window.pet.setPanel) window.pet.setPanel('settings')
    if (live !== null) {
      document.getElementById('set-nickname').value = live.nickname || ''
      document.getElementById('set-threshold').value = String(live.balanceThreshold ?? 20)
      document.getElementById('set-limit').value = String(live.dailyLimit ?? 0)
      pickOption('set-scale', live.scale, [0.6, 0.65, 0.7, 0.75, 0.8, 0.9, 1, 1.1, 1.2, 1.25, 1.5, 1.8], 0.8)
      const uiSelect = document.getElementById('set-ui')
      if (uiSelect !== null) uiSelect.value = live.ui === 'card' ? 'card' : 'pet'
      pickOption('set-font', live.bubbleFont, [12, 14.5, 18], 14.5)
      pickOption('set-bubble-radius', live.bubbleRadius, [0, 10, 18], 0)

      document.getElementById('set-bubble-alpha').value = String(live.bubbleAlpha ?? 0.97)
      document.getElementById('set-show-hud').checked = live.showHud !== false
      document.getElementById('set-hud-detail').value = live.hudDetail || 'full'
      document.getElementById('set-hud-alpha').value = String(live.hudAlpha ?? 0.93)

      pickOption('set-ask-every', live.askEveryMinutes, [0, 15, 30, 45, 60, 120], 45)
      const handling = document.getElementById('set-ask-handling')
      if (handling !== null) handling.value = live.askHandling || 'pet-all'
      pickOption('set-pose-every', live.poseSeconds, [0, 30, 60, 120, 300], 60)
      pickOption('set-sound-level', live.soundVolume, [0, 0.5, 0.8, 1], 0.5)
      pickOption('set-bubble-every', live.bubbleEverySeconds, [0, 30, 60, 120, 300], 60)
      pickOption('set-voice-level', live.voiceLevel, [0, 0.35, 0.6, 0.9], 0.6)

      const asks = Array.isArray(live.asks) ? live.asks : []
      const lastAsk = asks.length > 0 ? asks[asks.length - 1] : null
      setText(
        'set-ask-note',
        lastAsk
          ? `上次回答：${lastAsk.question} → ${lastAsk.answer}`
          : '对话提问和风险审批都按这里选的方式出现在桌宠或网页卡片上。',
      )

      const keyInput = document.getElementById('set-key')
      keyInput.value = ''
      keyInput.placeholder = live.hasKey ? '已保存，留空表示不修改' : '粘贴 DeepSeek API Key'
    }
    if (window.pet) window.pet.setInteractive(true)
  }

  function closeSettings() {
    settingsOpen = false
    settings.classList.add('hidden')
    if (CARD_ONLY && window.pet && window.pet.setPanel) window.pet.setPanel('normal')
  }

  document.getElementById('settings-close').addEventListener('click', closeSettings)

  const taskClose = document.getElementById('task-close')
  if (taskClose !== null) taskClose.addEventListener('click', () => toggleTaskSheet(false))

  document.getElementById('settings-save').addEventListener('click', () => {
    const uiSelect = document.getElementById('set-ui')
    const ui = uiSelect !== null && uiSelect.value === 'card' ? 'card' : 'pet'
    const uiBefore = live !== null && live.ui === 'card' ? 'card' : 'pet'
    const patch = {
      nickname: document.getElementById('set-nickname').value,
      ui,
      balanceThreshold: Number(document.getElementById('set-threshold').value),
      dailyLimit: Number(document.getElementById('set-limit').value),
      scale: Number(document.getElementById('set-scale').value),
      bubbleFont: Number(document.getElementById('set-font').value),
      bubbleRadius: Number(document.getElementById('set-bubble-radius').value),
      bubbleAlpha: Number(document.getElementById('set-bubble-alpha').value),
      showHud: document.getElementById('set-show-hud').checked,
      hudDetail: document.getElementById('set-hud-detail').value,
      hudAlpha: Number(document.getElementById('set-hud-alpha').value),
      askEveryMinutes: Number(document.getElementById('set-ask-every').value),
      askHandling: document.getElementById('set-ask-handling').value,
      poseSeconds: Number(document.getElementById('set-pose-every').value),
      soundVolume: Number(document.getElementById('set-sound-level').value),
      bubbleEverySeconds: Number(document.getElementById('set-bubble-every').value),
      voiceLevel: Number(document.getElementById('set-voice-level').value),
    }
    const key = document.getElementById('set-key').value.trim()
    if (key !== '') patch.apiKey = key
    sendCommand({ action: 'state', patch })
    if (ui !== uiBefore) {
      setText('settings-hint', '界面模式换好了，重开一下桌宠……')
      window.setTimeout(() => sendCommand({ action: 'restartPet' }), 800)
      window.setTimeout(closeSettings, 900)
    } else {
      setText('settings-hint', '已经记住啦♪')
      window.setTimeout(closeSettings, 700)
    }
  })

  const petRestart = document.getElementById('pet-restart')
  if (petRestart !== null) {
    petRestart.addEventListener('click', () => {
      sendCommand({ action: 'restartPet' })
      setText('settings-hint', '马上重开一下……')
      window.setTimeout(closeSettings, 400)
    })
  }

  const petStop = document.getElementById('pet-stop')
  if (petStop !== null) {
    petStop.addEventListener('click', () => {
      sendCommand({ action: 'stopPet' })
      if (window.pet) window.pet.hide()
    })
  }

  document.getElementById('hud-toggle').addEventListener('click', (event) => {
    event.stopPropagation()
    const detail = live !== null ? live.hudDetail : 'full'
    if (detail === 'simple2') hudExpanded = !hudExpanded
    else if (detail === 'simple') simpleCollapsed = !simpleCollapsed
    else hudCollapsed = !hudCollapsed
    renderHud()
  })

  /* ------------------------------ 模型 ------------------------------ */

  function applyZoom(next) {
    if (typeof next !== 'number' || Math.abs(next - zoom) < 0.01) return
    /* 菜单 / 滚轮 / 托盘刚改过大小，等宿主回包，别被 4 秒内的旧 scale 弹回去 */
    if (Date.now() < zoomHoldUntil) return
    zoom = next
    if (window.pet) window.pet.setZoom(next)
  }

  /* 立刻生效的缩放：先改窗口，再把大小写回宿主状态 */
  function previewZoom(next) {
    const value = Math.min(1.8, Math.max(0.6, Math.round(next * 100) / 100))
    if (Math.abs(value - zoom) < 0.001) return
    zoom = value
    zoomHoldUntil = Date.now() + 4000
    if (window.pet) window.pet.setZoom(value)
  }

  function hudHeightNow() {
    if (live === null || live.showHud !== true) return 0
    const rect = hud.getBoundingClientRect()
    return rect.height > 0 ? Math.round(rect.height) : 0
  }

  function hudSpace() {
    const height = hudHeightNow()
    return height > 0 ? height + 10 : 10
  }

  /* 立绘大小按「状态栏收起」时的底部预留算，位置锚在状态栏上沿：
     状态栏贴在窗口底边，人物就永远贴着状态栏 —— 窗口拉高拉矮、面板展开收起都不会把两者分开 */
  const BASE_RESERVE = 52
  const HUD_EDGE = 5
  const HUD_OVERLAP = 6
  const COLLAPSED_HUD = 53
  const MAX_EXTRA = 360
  let lastExtra = -1

  /* 这个模型画布 2400x3100，立绘四周留白（实测归一化值）：
     按画布布局会偏、会悬空，所以按「可见立绘框」布局；
     量出来立绘中心比窗口中心略偏左，补 0.018 画布宽（400 左右窗口下约 6px） */
  const ART = { left: 0.228, right: 0.226, top: 0.079, bottom: 0.01 }
  const ART_OFFSET_X = 0.018
  const ART_FILL = 0.94

  /* 顶部卡片（提问 / 审批）出现时给立绘让出高度，别让卡片压住小圆的头 */
  function cardReserve() {
    let height = 0
    for (const box of [askBox, approvalBox]) {
      if (box === null || box.classList.contains('hidden')) continue
      const rect = box.getBoundingClientRect()
      if (rect.height > 0) height = Math.max(height, rect.height + 8)
    }
    return height
  }

  function layoutModel() {
    if (model === null) return
    const w = window.innerWidth
    const h = window.innerHeight
    if (app !== null) app.renderer.resize(w, h)
    const iw = model.internalModel.width
    const ih = model.internalModel.height
    if (!iw || !ih) return
    const hudHeight = hudHeightNow()
    /* 状态栏占掉的底部高度；收起时等于 BASE_RESERVE，保持原来的站位 */
    const band = hudHeight > 0 ? hudHeight + HUD_EDGE - HUD_OVERLAP : BASE_RESERVE
    /* 顶部预留给气泡：TV 版小圆是全身立绘，画布顶部留白小，气泡必须单独让出高度，
       否则会压住头顶；96 = 气泡高 + 边距 */
    const topSpace = 96 + (CARD_ONLY ? 0 : cardReserve())
    const availH = Math.max(80, h - band - topSpace)
    const artW = Math.max(1, iw * (1 - ART.left - ART.right))
    const artH = Math.max(1, ih * (1 - ART.top - ART.bottom))
    const scale = Math.min((w * ART_FILL) / artW, availH / artH)
    model.scale.set(scale)
    /* 立绘框水平居中、底边贴状态栏上沿；ART_OFFSET_X 补掉量出来的几像素左偏 */
    model.x = w / 2 - (ART.left * iw + artW / 2) * scale + ART_OFFSET_X * iw * scale
    model.y = h - band - ih * (1 - ART.bottom) * scale

    const artTop = model.y + ART.top * ih * scale
    const cardH = CARD_ONLY ? 0 : cardReserve()
    const bubbleBox = document.getElementById('bubble')
    if (bubbleBox !== null) {
      /* 卡片展开时气泡先收起来，避免和卡片重叠 */
      if (cardH > 0) bubbleBox.classList.remove('show')
      const bubbleH = bubbleBox.offsetHeight || 40
      bubbleBox.style.top = `${Math.max(4, Math.round(artTop - bubbleH - 4))}px`
    }

    const modelBottom = Math.round(model.y + ih * (1 - ART.bottom) * scale)
    const hudTop = hudHeight > 0 ? Math.round(h - HUD_EDGE - hudHeight) : null
    report({
      stage: 'layout',
      win: `${w}x${h}`,
      hudSpace: Math.round(hudSpace()),
      hudHeight,
      band,
      scale,
      modelY: Math.round(model.y),
      artTop: Math.round(artTop),
      modelBottom,
      hudTop,
      gap: hudTop === null ? null : hudTop - modelBottom,
    })
  }

  /* 状态栏比收起态多出来的高度让窗口一起往上长：人物大小和站位都不变，面板不会越跑越远 */
  function syncWindowHeight() {
    if (window.pet === undefined || typeof window.pet.setExtraHeight !== 'function') return
    const hudHeight = hudHeightNow()
    if (hudHeight <= 0) {
      if (lastExtra !== 0) {
        lastExtra = 0
        void window.pet.setExtraHeight(0)
      }
      return
    }
    const extra = Math.min(MAX_EXTRA, Math.max(0, hudHeight - COLLAPSED_HUD))
    if (Math.abs(extra - lastExtra) < 1) return
    lastExtra = extra
    void window.pet.setExtraHeight(extra)
  }

  window.addEventListener('resize', () => {
    layoutModel()
    window.setTimeout(syncWindowHeight, 0)
  })

  /* 托盘里的「打开设置」：卡片模式没有右键菜单，这是切回立绘模式的入口 */
  if (window.pet && typeof window.pet.onOpenSettings === 'function') {
    window.pet.onOpenSettings(() => openSettings())
  }

  /* ------------------------------ 卡片模式 ------------------------------ */

  /* 卡片模式没有立绘，可点区域只剩审批 / 提问卡片；卡片收起时整窗穿透 */
  let cardInteractive = false

  function syncCardInteractive() {
    if (!CARD_ONLY) return
    const active = rectOf(approvalBox) !== null || rectOf(askBox) !== null
    if (active === cardInteractive) return
    cardInteractive = active
    if (window.pet && window.pet.setInteractive) window.pet.setInteractive(active)
  }

  /* 卡片模式：把卡片真实高度报给主进程，窗口跟着收放 */
  function syncCardHeight() {
    if (!CARD_ONLY) return
    if (window.pet === undefined || typeof window.pet.cardHeight !== 'function') return
    let height = 0
    let kind = 'none'
    const askRect = rectOf(askBox)
    const approvalRect = rectOf(approvalBox)
    if (askRect !== null) {
      height = Math.max(height, askRect.height)
      kind = 'ask'
    }
    if (approvalRect !== null) {
      height = Math.max(height, approvalRect.height)
      kind = kind === 'none' ? 'approval' : kind
    }
    void window.pet.cardHeight(height <= 0 ? 132 : Math.ceil(height + 14))
    report({ stage: 'card-live', card: kind, cardHeight: Math.round(height) })
  }

  if (CARD_ONLY && window.pet) {
    window.pet.onLive((data) => {
      if (!data || typeof data !== 'object') return
      live = data
      renderAsk()
      renderApproval()
      syncCardInteractive()
      syncCardHeight()
    })

    window.addEventListener('pointermove', syncCardInteractive)
    renderApproval()
  }

  if (!CARD_ONLY) {
    PIXI.live2d.Live2DModel.from(MODEL_URL, { autoInteract: false })
    .then((loaded) => {
      model = loaded
      app.stage.addChild(model)
      layoutModel()

      report({ stage: 'model-loaded', modelWidth: model.internalModel.width, modelHeight: model.internalModel.height, scale: model.scale.x, x: model.x, y: model.y })

      try {
        model.expression(EXPRESSIONS.smile)
      } catch (error) {
        report({ expressionError: String(error) })
      }

      try {
        model.internalModel.on('beforeModelUpdate', () => {
          const core = model.internalModel.coreModel
          const now = performance.now() / 1000
          setCoreParam(core, 'ParamBreath', 0.5 + 0.5 * Math.sin(now * 1.7))
          setCoreParam(core, 'ParamBodyAngleZ', Math.sin(now * 0.8) * 2)

          if (speakingUntil > performance.now()) {
            const value = 0.32 + 0.3 * Math.sin(now * 16) + Math.random() * 0.18
            setCoreParam(core, 'ParamMouthOpenY', Math.max(0, Math.min(1, value)))
          } else if (mouthOpen) {
            mouthOpen = false
            setCoreParam(core, 'ParamMouthOpenY', 0)
          }
        })
      } catch (error) {
        report({ lipSyncError: String(error) })
      }

      window.clearInterval(idleTimer)
      idleTimer = window.setInterval(playIdle, 11000)
      window.setTimeout(playIdle, 2200)
      /* 起来先打个招呼 */
      window.setTimeout(() => {
        const greet = greetLine()
        if (greet !== '') speak(greet, 3600)
      }, 1500)

      window.setInterval(() => {
        try {
          const core = model.internalModel.coreModel
          const manager = model.internalModel.motionManager
          const current = manager && manager.currentMotion
          report({
            stage: 'anim',
            eyeL: readCoreParam(core, 'ParamEyeLOpen'),
            eyeR: readCoreParam(core, 'ParamEyeROpen'),
            angleX: readCoreParam(core, 'ParamAngleX'),
            angleY: readCoreParam(core, 'ParamAngleY'),
            breath: readCoreParam(core, 'ParamBreath'),
            mouth: readCoreParam(core, 'ParamMouthOpenY'),
            motion: current && current.motion ? `${current.group}:${current.motion.name || current.motion.Name || ''}` : null,
            motionCount: manager && manager.motionGroups ? Object.keys(manager.motionGroups).length : null,
          })
        } catch (error) {
          report({ animError: String(error) })
        }
      }, 4000)

      model.on('hit', (areas) => {
        const list = areas || []
        const area = list[0]
        if (area && area.Motion) {
          const [group, motionName] = String(area.Motion).split(':')
          try {
            const motions = model.internalModel.settings.motions[group] || []
            const index = motions.findIndex((item) => item.Name === motionName || item.File === motionName)
            if (index >= 0) model.motion(group, index)
          } catch {
            /* 命中动作缺失时忽略 */
          }
        }
        showBubble(list.length > 0 ? '我在这里哦。' : '嗯？', 1800)
      })

      /* 指针 */
      window.addEventListener('pointermove', (event) => {
        updateInteractive(event.clientX, event.clientY)
        if (dragging) {
          if (pressPoint !== null && Math.hypot(event.clientX - pressPoint.x, event.clientY - pressPoint.y) >= 6) {
            clearPressTimer()
          }
          return
        }
        try {
          model.focus(event.clientX, event.clientY)
        } catch {
          /* 跟随失败不影响渲染 */
        }
      })

      window.addEventListener('pointerdown', (event) => {
        if (event.button === 2) return
        if (!isPointOnPet(event.clientX, event.clientY)) return
        if (onPanel(event.clientX, event.clientY)) return
        /* 抓住指针：松手在窗口外也能收到 pointerup，拖动不会一直粘着鼠标跑 */
        try {
          canvas.setPointerCapture(event.pointerId)
        } catch {
          /* 拿不到捕获时退回旧行为 */
        }
        pressPoint = { x: event.clientX, y: event.clientY }
        pressAt = performance.now()
        pressConsumed = false
        dragging = true
        if (window.pet) window.pet.dragStart()
        clearPressTimer()
        pressTimer = window.setTimeout(() => {
          pressTimer = null
          pressConsumed = true
          onLongPress()
        }, 620)
      })

      window.addEventListener('pointerup', (event) => {
        try {
          if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
        } catch {
          /* 没有捕获时忽略 */
        }
        if (!dragging) return
        dragging = false
        clearPressTimer()
        if (window.pet) window.pet.dragEnd()
        const moved = pressPoint === null ? 0 : Math.hypot(event.clientX - pressPoint.x, event.clientY - pressPoint.y)
        const held = pressAt === null ? 0 : performance.now() - pressAt
        if (!pressConsumed && moved < 6 && held < 620) registerClick()
        pressPoint = null
        pressAt = null
        pressConsumed = false
      })

      window.addEventListener('pointercancel', () => {
        if (!dragging) return
        dragging = false
        clearPressTimer()
        if (window.pet) window.pet.dragEnd()
      })

      /* Ctrl + 滚轮：当场放大 / 缩小，松手后把大小写回设置 */
      window.addEventListener(
        'wheel',
        (event) => {
          if (!event.ctrlKey) return
          event.preventDefault()
          /* 用本地 zoom 做步进基准：宿主 live.scale 在回包前是旧值，连续滚轮会丢步/跳步 */
          const current = zoom
          const next = Math.min(1.8, Math.max(0.6, Math.round((current + (event.deltaY > 0 ? -0.05 : 0.05)) * 100) / 100))
          if (Math.abs(next - current) < 0.001) return
          previewZoom(next)
          sendCommand({ action: 'state', patch: { scale: next } })
          showBubble(`大小 ${Math.round(next * 100)}%`, 1200)
        },
        { passive: false },
      )

      window.addEventListener('contextmenu', (event) => {
        event.preventDefault()
        if (!onPanel(event.clientX, event.clientY) && !isPointOnPet(event.clientX, event.clientY)) return
        openMenu(event.clientX, event.clientY)
      })

      /* 手势：单击说话 / 双击报余额 / 三击刷新 / 长按摊开速览 */
      let pressTimer = null
      let pressConsumed = false
      let clickCount = 0
      let clickTimer = null

      function clearPressTimer() {
        if (pressTimer !== null) {
          window.clearTimeout(pressTimer)
          pressTimer = null
        }
      }

      function registerClick() {
        clickCount += 1
        if (clickTimer !== null) window.clearTimeout(clickTimer)
        if (clickCount >= 3) {
          clickCount = 0
          clickTimer = null
          onGesture(3)
          return
        }
        clickTimer = window.setTimeout(() => {
          const count = clickCount
          clickCount = 0
          clickTimer = null
          onGesture(count)
        }, 320)
      }

      function onGesture(count) {
        if (settingsOpen) return
        if (count === 2) {
          const total = live && live.balance ? Number(live.balance.total) : null
          const spent = live && live.balance ? Number(live.balance.spent) : null
          showBubble(
            total === null
              ? '还没连上余额呢。'
              : `余额 ${total.toFixed(2)} 元\n今日 ${Number(spent || 0).toFixed(2)} 元♪`,
            2800,
          )
          playSound('click')
          return
        }
        if (count >= 3) {
          sendCommand({ action: 'refresh' })
          showBubble('我去把余额问清楚哦……', 1800)
          playSound('click')
          return
        }
        onClick()
      }

      function onLongPress() {
        if (settingsOpen) return
        playSound('click')
        /* 长按：说一遍当前任务进程（任务面板在右键菜单里看） */
        speak(todoSpeech(), 4200)
      }

      function sheetText() {
        const balance = live && live.balance ? live.balance : null
        if (balance === null) return '手上还没有余额数据呢。'
        const lines = [
          `余额 ${Number(balance.total || 0).toFixed(2)} 元（阈值 ${Number(live.balanceThreshold ?? 20).toFixed(2)}）`,
          `今日 ${Number(balance.spent || 0).toFixed(2)} 元 · 充值 ${Number(balance.recharge || 0).toFixed(2)} 元`,
        ]
        const quota = localQuota(live)
        if (quota && Number(quota.limit) > 0) {
          lines.push(`额度 ${Number(quota.spent || 0).toFixed(2)} / ${Number(quota.limit).toFixed(2)}`)
        }
        lines.push(`时段 ${rateLabel()}`)
        return lines.join('\n')
      }

      function onClick() {
        if (settingsOpen) return
        const pool =
          live !== null && Array.isArray(live.emojiList) && live.emojiList.length > 0
            ? live.emojiList
            : FALLBACK_EMOJI
        if (pool.length > 0) {
          let name = pool[Math.floor(Math.random() * pool.length)]
          if (name === lastEmojiName && pool.length > 1) {
            name = pool[(pool.indexOf(name) + 1) % pool.length]
          }
          lastEmojiName = name
          emojiHoldUntil = Date.now() + 12000
          setEmoji(name)
        }
        const clickPool = contentOf('clickLines')
        const lines = Array.isArray(clickPool) && clickPool.length > 0 ? clickPool : CLICK_LINES_FALLBACK
        /* 语音冷却 30 秒，避免连着点一直播长语音；没播语音时退回短台词 */
        const voiceReady = Date.now() - voiceLastPlayedAt > 30000
        const useVoice = voiceReady && voiceLevel > 0 && Math.random() < voiceLevel
        if (!(useVoice && playVoice('talk'))) {
          speak(lines[Math.floor(Math.random() * lines.length)], 2600)
          playSound('click')
        }
        randomPose()
        const faces = Object.values(EXPRESSIONS).filter((name) => name !== EXPRESSIONS.reset)
        try {
          model.expression(faces[Math.floor(Math.random() * faces.length)])
          window.clearTimeout(onClick.faceTimer)
          onClick.faceTimer = window.setTimeout(() => {
            try {
              model.expression(EXPRESSIONS.reset)
            } catch {
              /* 表情缺失时忽略 */
            }
          }, 8000)
        } catch {
          /* 表情缺失时忽略 */
        }
      }

      /* 插件推送 */
      if (window.pet) {
        window.pet.onLive((data) => {
          if (!data || typeof data !== 'object') return
          live = data
          renderHud()
          applyLook(data)
          if (typeof data.scale === 'number') applyZoom(data.scale)
          const quota = localQuota(data)
          if (Date.now() >= emojiHoldUntil) {
            setEmoji(typeof data.emoji === 'string' ? data.emoji : localEmoji(quota, data.speak === true))
          }
          renderQuota(quota)
          renderAsk()
          renderApproval()
          if (taskSheet !== null && taskSheet.classList.contains('hidden') === false) renderTaskSheet()

          const alert = Boolean(quota && (quota.overBudget || quota.nearLimit))
          bubble.classList.toggle('alert', alert)
          if (alert && quota.overBudget) playSound('over')

          if (typeof data.poseAt === 'number' && data.poseAt !== lastPoseAt) {
            lastPoseAt = data.poseAt
            randomPose()
          }

          if (typeof data.line === 'string' && data.line.trim() !== '') {
            /* 主动触发（右键「说句话」/宿主强制）优先播游戏语音 + 字幕，没有语音包再退回文字气泡 */
            const voiced = data.force === true && playVoice('talk')
            if (!voiced) {
              if (data.speak === true) speak(data.line, data.ms || 3000)
              else showBubble(data.line, data.ms || 3000)
            }
          }
          if (typeof data.expression === 'string' && EXPRESSIONS[data.expression]) {
            try {
              model.expression(EXPRESSIONS[data.expression])
            } catch {
              /* 表情缺失时忽略 */
            }
          }
          if (typeof data.expressionName === 'string') {
            try {
              model.expression(data.expressionName)
            } catch {
              /* 表情缺失时忽略 */
            }
          }
          if (data.motion && typeof data.motion.group === 'string') {
            try {
              model.motion(data.motion.group, Number(data.motion.index) || 0)
            } catch {
              /* 动作缺失时忽略 */
            }
          }
        })

        window.pet.onZoom((payload) => {
          const state = payload !== null && typeof payload === 'object' ? payload : null
          if (state !== null && typeof state.zoom === 'number') zoom = state.zoom
          else zoom = Number(payload) || zoom
          /* 托盘菜单是先改窗口再写宿主 state，这里也压一下旧 scale，避免闪回一次 */
          zoomHoldUntil = Date.now() + 4000
          /* 缩放后窗口回到基准高度，状态栏要重新把窗口撑起来 */
          lastExtra = -1
          window.setTimeout(() => {
            layoutModel()
            syncWindowHeight()
          }, 80)
        })

        window.pet.onCursor((point) => {
          if (point === null || typeof point.x !== 'number') return
          try {
            model.focus(point.x, point.y)
          } catch {
            /* 跟随失败不影响渲染 */
          }
        })
      }
    })
    .catch((error) => {
      report({ fatal: 'model-load-failed', message: String(error), stack: error && error.stack })
      /* 公开版仓库不带模型：没有素材时给一句提示，桌宠其余功能照常 */
      showBubble('还没有导入小圆的模型…… 看一下 README 的「导入素材」吧。', 9000)
      if (bubbleEmoji !== null) bubbleEmoji.textContent = '📦'
    })
  }

  /* 公开版可能没有头像图：加载失败就不要显示破图 */
  const hudAvatar = document.getElementById('hud-avatar')
  if (hudAvatar !== null) {
    hudAvatar.addEventListener('error', () => {
      hudAvatar.style.display = 'none'
    })
  }
})()
