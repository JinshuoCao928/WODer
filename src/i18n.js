// UI strings. Chinese when the browser language is Chinese, English otherwise.

const STRINGS = {
  en: {
    tabToday: 'Today', tabLog: 'Log', tabHistory: 'History',
    styleWod: 'WOD', styleStrength: 'Strength', styleConditioning: 'Conditioning', styleMobility: 'Mobility', styleOther: 'Other',
    requestLabel: 'How are you feeling, and what do you want today?',
    requestPh: 'e.g. Did front squats yesterday, legs are sore. Want a back focus. 45 min, full gym.',
    generate: 'Design my workout', generating: 'Designing…',
    example: 'Example', exampleNote: 'This is an example. Your workout will use your own history.',
    changeLabel: 'Change something', changePh: 'e.g. swap pull-ups, my grip is shot', revise: 'Update workout',
    markDone: 'Mark done', resultLabel: 'How did it go?', resultPh: 'e.g. rows felt easy, metcon 12:34', saveResult: 'Save to history', cancel: 'Cancel',
    estimates: 'Loads are estimates. Log a few sessions for suggestions based on your numbers.',
    logLabel: 'What did you do?', logPh: 'e.g. Yesterday: front squat 5x3 @ 100kg, then 21-15-9 thrusters 40kg and pull-ups in 8:12. Legs felt heavy.',
    preview: 'Read it', reading: 'Reading…', save: 'Save', edit: 'Edit text', saved: 'Saved to history.',
    checkPreview: 'Check this before saving.',
    historyEmpty: 'Your sessions will show up here. Add your first one in Log, or mark a designed workout as done.',
    deleteSession: 'Delete', confirmDelete: 'Tap again to delete',
    profile: 'Your profile', unit: 'Unit', level: 'Level', about: 'About you',
    aboutPh: 'e.g. Back squat 1RM 120kg. Left shoulder is cranky. Train at a CrossFit box.',
    levelBeginner: 'Beginner', levelIntermediate: 'Intermediate', levelAdvanced: 'Advanced', saveProfile: 'Save profile', profileSaved: 'Profile saved.',
    signIn: 'Sign in to claude.ai to save your history. You can still design workouts.',
    noAi: 'Workout design is off because Claude access was not allowed on this page. Your history is still here.',
    historyFailed: "Couldn't load your history. Workouts will be designed without it.",
    busy: 'Claude is busy. Try again in a moment.',
    rephraseWorkout: "Couldn't build a workout from that. Try rephrasing.",
    rephraseLog: "Couldn't read that. Try rephrasing, e.g. \"Back squat 5x5 @ 100kg\".",
    saveFailed: "Couldn't save. Your text is still here.", retry: 'Retry',
    failed: 'Something went wrong: ',
    lastSessions: (n) => `${n} session${n === 1 ? '' : 's'} logged`,
  },
  zh: {
    tabToday: '今天', tabLog: '记录', tabHistory: '历史',
    styleWod: 'WOD', styleStrength: '力量', styleConditioning: '体能', styleMobility: '灵活性', styleOther: '其他',
    requestLabel: '今天感觉怎么样？想练什么？',
    requestPh: '例如：昨天做了前蹲，腿很酸。今天想练背。45 分钟，器械齐全。',
    generate: '设计今天的训练', generating: '设计中…',
    example: '示例', exampleNote: '这是示例。你的训练会根据你的历史记录来设计。',
    changeLabel: '修改', changePh: '例如：换掉引体向上，握力不行了', revise: '更新训练',
    markDone: '完成', resultLabel: '练得怎么样？', resultPh: '例如：划船很轻松，metcon 12:34', saveResult: '保存到历史', cancel: '取消',
    estimates: '重量是估计值。多记录几次训练，建议会更贴合你的实际水平。',
    logLabel: '你练了什么？', logPh: '例如：昨天 前蹲 5组x3次 100kg，然后 21-15-9 推举蹲 40kg 和引体向上，用时 8:12。腿很沉。',
    preview: '识别', reading: '识别中…', save: '保存', edit: '修改文字', saved: '已保存到历史。',
    checkPreview: '保存前请检查一下。',
    historyEmpty: '你的训练记录会显示在这里。去「记录」添加第一条，或把设计好的训练标记为完成。',
    deleteSession: '删除', confirmDelete: '再点一次删除',
    profile: '个人资料', unit: '单位', level: '水平', about: '关于你',
    aboutPh: '例如：后蹲 1RM 120kg。左肩不太舒服。在 CrossFit 馆训练。',
    levelBeginner: '初级', levelIntermediate: '中级', levelAdvanced: '高级', saveProfile: '保存资料', profileSaved: '资料已保存。',
    signIn: '登录 claude.ai 才能保存历史记录。不登录也可以设计训练。',
    noAi: '这个页面没有获得调用 Claude 的许可，所以无法设计训练。历史记录仍可查看。',
    historyFailed: '历史记录加载失败。本次训练将不参考历史来设计。',
    busy: 'Claude 正忙，请稍后再试。',
    rephraseWorkout: '没能生成训练，换个说法试试。',
    rephraseLog: '没能识别，换个说法试试，例如「后蹲 5x5 100kg」。',
    saveFailed: '保存失败，你输入的内容还在。', retry: '重试',
    failed: '出错了：',
    lastSessions: (n) => `已记录 ${n} 次训练`,
  },
};

export const LANG = /^zh/i.test(globalThis.navigator?.language ?? '') ? 'zh' : 'en';

export function t(key, ...args) {
  const v = STRINGS[LANG][key] ?? STRINGS.en[key] ?? key;
  return typeof v === 'function' ? v(...args) : v;
}
