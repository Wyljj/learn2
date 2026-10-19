'use strict';

const app = document.getElementById('app');
const notice = document.getElementById('notice');
const types = { single: '单选题', multi: '多选题', truefalse: '判断题', fill: '填空题' };
const statuses = { draft: '待审核', published: '已发布', rejected: '未采用' };
const model = { user: null, setupRequired: false, aiConfigured: false, data: null, view: 'home', questionTab: 'review', questionStatus: 'draft', questionMaterial: '', practiceMaterial: '', practiceType: '', selected: new Set(), session: null, answers: {}, index: 0, result: null };
const busyActions = new Set();
let noticeTimer;

function esc(value = '') {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}
function date(value, full = false) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '时间未记录';
  return parsed.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', ...(full ? { hour: '2-digit', minute: '2-digit' } : {}) });
}
function percent(value) { return `${Math.round(Number(value) || 0)}%`; }
function isAdmin() { return model.user?.role === 'trainer'; }
function published() { return model.data.questions.filter(question => question.status === 'published'); }
function materialTitle(id) { return model.data.materials.find(material => material.id === id)?.title || '原资料'; }
function newestAttempts() { return [...model.data.attempts].sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt)); }
function toast(message, error = false) {
  clearTimeout(noticeTimer);
  notice.textContent = message;
  notice.classList.toggle('error', error);
  notice.hidden = false;
  noticeTimer = setTimeout(() => { notice.hidden = true; }, error ? 8000 : 4500);
}
async function api(path, body, method = 'POST') {
  const response = await fetch(path, body === undefined ? { credentials: 'same-origin' } : { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  let result;
  try { result = await response.json(); } catch { throw new Error('服务暂时无法响应，请稍后重试。'); }
  if (!response.ok) {
    const error = new Error(result.error || '操作未完成，请稍后重试。');
    error.status = response.status;
    throw error;
  }
  return result;
}
async function refresh() {
  model.data = await api('/api/state');
  model.user = model.data.user;
  model.aiConfigured = model.data.aiConfigured;
  const available = new Set(published().map(question => question.id));
  model.selected = new Set([...model.selected].filter(id => available.has(id)));
}
function errorBox() { return '<div class="form-error" role="alert" tabindex="-1"></div>'; }
function reportError(error, form) {
  const box = form?.querySelector('.form-error');
  if (box) { box.textContent = error.message; box.focus(); }
  else toast(error.message, true);
  if (error.status === 401 && model.user) bootstrap();
}
function button(label, action, extra = '', variant = '') { return `<button type="button" class="btn ${variant}" data-action="${action}" ${extra}>${label}</button>`; }
function navButton(label, view, symbol) { return `<button type="button" data-nav="${view}" class="${model.view === view ? 'active' : ''}" ${model.view === view ? 'aria-current="page"' : ''}><span class="nav-icon" aria-hidden="true">${symbol}</span>${label}</button>`; }
function empty(title, description, action = '', label = '') { return `<div class="empty"><div class="empty-symbol" aria-hidden="true">▤</div><h3>${esc(title)}</h3><p>${esc(description)}</p>${action ? button(esc(label), action, '', 'primary') : ''}</div>`; }
function heading(title, description, actions = '') { return `<header class="page-heading"><div><h1>${title}</h1><p>${description}</p></div>${actions ? `<div class="heading-actions">${actions}</div>` : ''}</header>`; }
function tag(text, color = '') { return `<span class="tag ${color}">${esc(text)}</span>`; }
function materialOptions(selected = '', includeAll = false) {
  return `${includeAll ? '<option value="">全部资料</option>' : '<option value="">请选择一份培训资料</option>'}${model.data.materials.map(material => `<option value="${esc(material.id)}" ${selected === material.id ? 'selected' : ''}>${esc(material.title)}</option>`).join('')}`;
}
function typeOptions(selected = '', includeAll = false) { return `${includeAll ? '<option value="">全部题型</option>' : ''}${Object.entries(types).map(([key, label]) => `<option value="${key}" ${selected === key ? 'selected' : ''}>${label}</option>`).join('')}`; }
function answerText(item, answers) {
  if (!answers?.length) return '未作答';
  if (item.type === 'fill') return answers.join(' / ');
  return answers.map(answer => `${answer}${item.options?.[answer.charCodeAt(0) - 65] != null ? `．${item.options[answer.charCodeAt(0) - 65]}` : ''}`).join('；');
}
function statCards(stats, report = false) {
  const metrics = report ? [
    ['完成练习', stats.attemptCount || 0, '次', '已提交的练习记录'],
    ['累计作答', stats.answerCount || 0, '题', '每次提交均计入'],
    ['答对题目', stats.correctCount || 0, '题', '按提交时题目判分'],
    ['作答正确率', stats.answerCount ? Math.round(stats.accuracy || 0) : '—', stats.answerCount ? '%' : '', stats.answerCount ? '答对题数 / 累计作答' : '完成练习后生成']
  ] : isAdmin() ? [
    ['培训资料', model.data.materials.length, '份', '岗位知识的出题依据'],
    ['已发布题目', published().length, '题', '学员可以开始练习'],
    ['完成练习', stats.attemptCount || 0, '次', '来自实际提交'],
    ['作答正确率', stats.answerCount ? Math.round(stats.accuracy || 0) : '—', stats.answerCount ? '%' : '', stats.answerCount ? '全体学员累计作答' : '等待第一份学习记录']
  ] : [
    ['可练习题目', published().length, '题', '管理员审核发布'],
    ['我的练习', model.data.attempts.length, '次', '每一次进步都有记录'],
    ['待复习错题', mistakes().length, '题', '以最近一次作答为准'],
    ['作答正确率', stats.answerCount ? Math.round(stats.accuracy || 0) : '—', stats.answerCount ? '%' : '', stats.answerCount ? '我的累计作答' : '完成练习后生成']
  ];
  return `<div class="stat-grid">${metrics.map(([label, value, unit, note]) => `<div class="stat"><div class="stat-label">${label}</div><div class="stat-value">${value}<small>${unit}</small></div><div class="stat-note">${note}</div></div>`).join('')}</div>`;
}
function renderAuth() {
  const setup = model.setupRequired;
  app.innerHTML = `<div class="auth"><section class="auth-intro"><div class="brand"><div class="brand-mark" aria-hidden="true">学</div><div><div class="brand-name">职学</div><div class="brand-caption">岗位培训工作台</div></div></div><h1>把岗位知识，<br>变成工作中的底气。</h1><p>从一份培训资料开始，让出题有依据、学习有反馈、进步有记录。</p><p class="auth-foot">源自「智学 AI」项目 · 资料驱动的职工岗位培训</p></section><main class="auth-form" id="main"><div class="auth-form-inner"><h2>${setup ? '开启培训工作台' : '欢迎回到职学'}</h2><p class="subtitle">${setup ? '首次使用，请建立培训管理员账号。' : '使用管理员为你建立的账号登录。'}</p><form id="auth-form">${setup ? '<div class="field"><label for="auth-name">管理员姓名</label><input id="auth-name" name="name" required maxlength="60" autocomplete="name" placeholder="请输入姓名"></div>' : ''}<div class="field"><label for="auth-email">邮箱</label><input id="auth-email" name="email" type="email" required autocomplete="username" placeholder="请输入账号邮箱" maxlength="254"></div><div class="field"><label for="auth-password">密码</label><input id="auth-password" name="password" type="password" required ${setup ? 'minlength="10"' : ''} maxlength="128" autocomplete="${setup ? 'new-password' : 'current-password'}" placeholder="${setup ? '至少 10 位字符' : '请输入密码'}"></div>${errorBox()}<button class="btn primary" type="submit">${setup ? '建立账号并进入' : '登录工作台'}</button></form><p class="auth-hint">${setup ? '建立账号后，可添加岗位资料、审核题目和创建学员。系统首次运行没有预置学习数据。' : '尚无账号或忘记密码，请联系本单位培训管理员。'}</p></div></main></div>`;
}
function render() {
  if (!model.user) { renderAuth(); return; }
  const titles = { home: '工作台', materials: '培训资料', questions: '题目管理', practice: '岗位练习', mistakes: '错题复习', reports: '学习统计', users: '学员管理', result: '练习结果' };
  if (!isAdmin() && ['questions', 'users'].includes(model.view)) model.view = 'home';
  const renderers = { home: renderHome, materials: renderMaterials, questions: renderQuestions, practice: renderPractice, mistakes: renderMistakes, reports: renderReports, users: renderUsers, result: renderResult };
  app.innerHTML = `<div class="shell"><aside class="sidebar" aria-label="主要导航"><div class="brand"><div class="brand-mark" aria-hidden="true">学</div><div><div class="brand-name">职学</div><div class="brand-caption">岗位培训工作台</div></div></div><div class="nav-label">学习与成长</div><nav class="nav">${navButton('工作台', 'home', '◫')}${navButton('培训资料', 'materials', '▤')}${isAdmin() ? navButton('题目管理', 'questions', '▧') : ''}${navButton('岗位练习', 'practice', '▷')}${navButton('错题复习', 'mistakes', '↻')}${navButton('学习统计', 'reports', '▥')}${isAdmin() ? navButton('学员管理', 'users', '♙') : ''}</nav><div class="side-bottom"><div class="account"><div class="avatar" aria-hidden="true">${esc(model.user.name?.slice(0, 1) || '学')}</div><div><div class="account-name" title="${esc(model.user.name)}">${esc(model.user.name)}</div><div class="account-role">${isAdmin() ? '培训管理员' : '学习账号'}</div></div><button class="logout" type="button" data-action="logout">退出</button></div><div class="side-note">源自「智学 AI」项目<br>让学习与岗位共同成长</div></div></aside><div class="workspace"><div class="topbar"><div class="breadcrumb">培训工作台 <span aria-hidden="true"> / </span> <strong>${titles[model.view] || '工作台'}</strong></div><div class="environment"><span class="dot" aria-hidden="true"></span>资料驱动 · 真实记录</div></div><main id="main" class="content">${(renderers[model.view] || renderHome)()}</main></div></div>`;
}
function renderHome() {
  const admin = isAdmin();
  const hasMaterials = model.data.materials.length > 0;
  const hasQuestions = model.data.questions.length > 0;
  const hasPublished = published().length > 0;
  const actions = button('刷新数据', 'refresh', '', 'small');
  const welcome = admin ? '每一次扎实培训，都从岗位出发。' : '学会岗位知识，做好每一步。';
  const description = admin ? '把资料整理成可练习的知识，让培训过程清晰可见。' : '依据培训资料练习，在每一次反馈中巩固岗位知识。';
  const steps = admin ? [
    [hasMaterials, '准备岗位资料', '上传或粘贴岗位规范、操作规程与培训文档。', 'materials', '整理资料'],
    [hasQuestions, '建立并审核题目', '每道题关联原文依据，审核通过后向学员发布。', 'questions', '管理题目'],
    [model.data.users.some(user => user.role === 'learner'), '邀请学员开始学习', '建立学员账号，练习与复习记录自动汇总。', 'users', '添加学员']
  ] : [
    [model.data.attempts.length > 0, '完成一次岗位练习', '选择已发布题目，按自己的节奏完成作答。', 'practice', '开始练习'],
    [model.data.attempts.length > 0 && mistakes().length === 0, '回顾需要巩固的知识', '对照原文依据复习，再次练习检验学习效果。', 'mistakes', '查看错题'],
    [model.data.attempts.length > 0, '查看自己的学习记录', '从真实练习中了解题型表现与学习进展。', 'reports', '查看记录']
  ];
  return `${heading(admin ? '培训工作台' : '我的学习工作台', `你好，${esc(model.user.name)}。${admin ? '这里是本单位的岗位知识与学习记录。' : '今天也为工作多积累一点底气。'}`, actions)}<section class="hero"><div class="hero-text"><div class="hero-label">${admin ? '让培训落在实际工作上' : '把知识用在每一天'}</div><h2>${welcome}</h2><p>${description}</p>${button(admin ? (hasMaterials ? '前往题目管理' : '添加第一份资料') : '开始岗位练习', admin ? (hasMaterials ? 'go-questions' : 'go-materials') : 'go-practice')}</div><div class="hero-art" aria-hidden="true"><div class="book">岗位<br>知识</div></div></section>${statCards(model.data.stats)}<div class="two-col"><section class="panel"><div class="panel-head"><h2>${admin ? '培训准备' : '学习安排'}</h2>${tag(admin ? '资料 → 题目 → 学习' : '练习 → 反馈 → 巩固')}</div><div class="panel-body step-list">${steps.map(([done, title, note, view, label], index) => `<div class="step ${done ? 'done' : ''}"><div class="step-number">${done ? '✓' : index + 1}</div><div><h3>${title}</h3><p>${note}</p></div><button type="button" class="btn small ghost" data-nav="${view}">${label}</button></div>`).join('')}</div></section><section class="panel"><div class="panel-head"><h2>最近练习</h2><button type="button" class="btn small ghost" data-nav="reports">全部记录</button></div>${newestAttempts().length ? newestAttempts().slice(0, 4).map(attempt => `<div class="list-row"><div><div class="row-title">${esc(admin ? attempt.userName : '岗位知识练习')}</div><div class="row-meta"><span>${date(attempt.submittedAt, true)}</span><span>${attempt.total} 道题</span></div></div><div><strong class="correct-text">${percent(attempt.accuracy)}</strong><div class="small muted">正确率</div></div></div>`).join('') : empty('第一份学习记录，等你开启', admin ? (hasPublished ? '题目已经准备好，学员提交练习后即可在这里查看。' : '先准备资料、发布题目，完成练习后这里会留下记录。') : '完成并提交一次练习，你的学习记录就会出现在这里。', admin ? '' : 'go-practice', '开始练习')}</section></div>`;
}
function renderMaterials() {
  return `${heading('培训资料', '把岗位规范、操作规程与培训内容整理在一起。', isAdmin() ? `<span class="tag">共 ${model.data.materials.length} 份资料</span>` : '')}<div class="${isAdmin() ? 'two-col' : 'stack'}"><section class="panel"><div class="panel-head"><h2>资料库</h2>${tag(`${model.data.materials.length} 份`)}</div>${model.data.materials.length ? model.data.materials.map(material => `<article><div class="list-row"><div><div class="row-title">${esc(material.title)}</div><div class="row-meta"><span>${esc(material.category || '未分类')}</span><span>${date(material.createdAt)}</span><span>${String(material.content || '').length.toLocaleString()} 字符</span></div></div>${tag('文本资料')}</div><details class="material-details"><summary>阅读资料内容</summary><div class="material-content">${esc(material.content)}</div></details></article>`).join('') : empty('还没有培训资料', isAdmin() ? '在右侧添加第一份岗位资料，题目将以它为依据。' : '管理员添加培训资料后，你可以在这里阅读。')}</section>${isAdmin() ? `<section class="panel"><div class="panel-head"><h2>添加资料</h2></div><div class="panel-body"><form id="material-form"><div class="form-grid"><div class="field full"><label for="material-file">导入文本文件 <span class="muted">（可选）</span></label><input id="material-file" type="file" accept=".txt,.md,text/plain,text/markdown"><p class="hint">支持 UTF-8 编码的 .txt、.md 文件，也可以直接粘贴下方内容。</p></div><div class="field full"><label for="material-title">资料名称</label><input id="material-title" name="title" required maxlength="120" placeholder="如：岗位操作规程"></div><div class="field full"><label for="material-category">所属类别</label><input id="material-category" name="category" maxlength="60" placeholder="如：安全生产、服务规范"></div><div class="field full"><label for="material-content">资料正文</label><textarea id="material-content" name="content" required rows="10" placeholder="粘贴完整原文，录题时需要引用其中的依据片段。"></textarea></div></div>${errorBox()}<div class="form-actions"><button class="btn primary" type="submit">保存培训资料</button><span class="hint">保存后可用于录题与审核</span></div></form></div></section>` : ''}</div>`;
}
function renderQuestions() {
  const tabs = [['review', '题目审核'], ['manual', '人工录题'], ['import', '批量导入'], ['ai', 'AI 辅助出题']];
  return `${heading('题目管理', '以原文为依据，审核后再向学员发布。')}<div class="tabs" role="tablist" aria-label="题目管理方式">${tabs.map(([key, label]) => `<button type="button" class="tab ${model.questionTab === key ? 'active' : ''}" role="tab" aria-selected="${model.questionTab === key}" data-question-tab="${key}">${label}${key === 'review' ? `<span class="count-badge">${model.data.questions.filter(question => question.status === 'draft').length}</span>` : ''}</button>`).join('')}</div>${model.questionTab === 'manual' ? renderQuestionForm() : model.questionTab === 'import' ? renderImport() : model.questionTab === 'ai' ? renderAI() : renderReview()}`;
}
function renderReview() {
  const questions = model.data.questions.filter(question => (!model.questionStatus || question.status === model.questionStatus) && (!model.questionMaterial || question.materialId === model.questionMaterial));
  return `<div class="filter-bar"><label class="small muted" for="question-status">题目状态</label><select class="control" id="question-status"><option value="">全部状态</option>${Object.entries(statuses).map(([key, label]) => `<option value="${key}" ${key === model.questionStatus ? 'selected' : ''}>${label}</option>`).join('')}</select><select class="control" id="question-material" aria-label="按资料筛选题目">${materialOptions(model.questionMaterial, true)}</select><span class="filter-count">共 ${questions.length} 道题</span></div><section class="panel">${questions.length ? questions.map(question => `<article class="question-card"><div class="question-meta">${tag(types[question.type])}${tag(statuses[question.status], question.status === 'published' ? 'green' : question.status === 'draft' ? 'amber' : '')}<span class="small muted">${esc(materialTitle(question.materialId))}</span></div><div class="question-stem">${esc(question.stem)}</div>${question.options?.length ? `<div class="options-preview">${question.options.map((option, index) => `<div>${String.fromCharCode(65 + index)}．${esc(option)}</div>`).join('')}</div>` : ''}<div class="answer-block"><strong>参考答案：${esc(answerText(question, question.answers))}</strong><p class="muted">${esc(question.explanation || '未填写补充解析，请对照原文依据审核。')}</p></div><blockquote class="source"><span class="source-label">原文依据</span>${esc(question.sourceExcerpt)}</blockquote><div class="question-actions">${question.status !== 'published' ? button('审核通过并发布', 'question-status', `data-id="${esc(question.id)}" data-status="published"`, 'primary small') : button('撤回为草稿', 'question-status', `data-id="${esc(question.id)}" data-status="draft"`, 'small')}${question.status === 'draft' ? button('标记未采用', 'question-status', `data-id="${esc(question.id)}" data-status="rejected"`, 'ghost small') : question.status === 'rejected' ? button('重新审核', 'question-status', `data-id="${esc(question.id)}" data-status="draft"`, 'ghost small') : ''}<span class="muted">发布前请核对答案和原文依据</span></div></article>`).join('') : empty('当前没有符合条件的题目', model.data.materials.length ? '切换筛选条件，或录入新题目后在这里审核。' : '先添加培训资料，再为岗位知识建立题目。', model.data.materials.length ? 'new-question' : 'go-materials', model.data.materials.length ? '录入题目' : '添加培训资料')}</section>`;
}
function renderQuestionForm() {
  if (!model.data.materials.length) return `<section class="panel">${empty('先准备一份培训资料', '题目必须关联资料，并引用能在原文中找到的依据。', 'go-materials', '添加培训资料')}</section>`;
  return `<section class="panel"><div class="panel-head"><h2>录入新题目</h2>${tag('保存为待审核草稿', 'amber')}</div><div class="panel-body"><div class="inline-note">依据片段请直接从资料原文复制。保存后需在“题目审核”中检查并发布，学员才可以练习。</div><form id="question-form"><div class="form-grid"><div class="field"><label for="q-material">关联资料</label><select id="q-material" name="materialId" required>${materialOptions()}</select></div><div class="field"><label for="q-type">题型</label><select id="q-type" name="type">${typeOptions('single')}</select></div><div id="source-preview" class="field full" hidden></div><div class="field full"><label for="q-stem">题目内容</label><textarea id="q-stem" name="stem" required maxlength="2000" rows="3" placeholder="请写清问题；填空位置可用 ____ 标记。"></textarea></div><div class="field full" id="options-field"><label for="q-options">选项</label><textarea id="q-options" name="options" rows="4" placeholder="每行填写一个选项，不需要 A、B 等前缀。"></textarea><p class="hint">按顺序对应 A、B、C…，请至少填写两个选项。</p></div><div class="field full"><label for="q-answers">参考答案</label><input id="q-answers" name="answers" required placeholder="填写选项字母，如 A；多选用逗号分隔，如 A,C"><p class="hint" id="answer-hint">单选题填写一个字母；多选题填写多个字母。判断题 A 为正确，B 为错误。</p></div><div class="field full"><label for="q-excerpt">原文依据片段</label><textarea id="q-excerpt" name="sourceExcerpt" required rows="3" placeholder="从所关联资料中复制能直接支持答案的原文。"></textarea><p class="hint">必须与原文完全一致，不要改写或添加省略号。</p></div><div class="field full"><label for="q-explanation">答案解析</label><textarea id="q-explanation" name="explanation" required rows="3" maxlength="4000" placeholder="说明关键知识与易错之处。"></textarea></div></div>${errorBox()}<div class="form-actions"><button class="btn primary" type="submit">保存为待审核</button></div></form></div></section>`;
}
function renderImport() {
  if (!model.data.materials.length) return `<section class="panel">${empty('先准备一份培训资料', '同一批导入题目会关联同一份资料。', 'go-materials', '添加培训资料')}</section>`;
  return `<section class="panel"><div class="panel-head"><h2>批量导入题目</h2>${tag('JSON 文件')}</div><div class="panel-body"><div class="inline-note">选择资料后，导入 JSON 题目数组。每题包含 type、stem、options、answers、explanation、sourceExcerpt。题型可用 single、multi、truefalse、fill；答案是字符串数组，依据必须引用资料原文。整批验证通过后保存为草稿。</div><form id="import-form"><div class="form-grid"><div class="field full"><label for="import-material">关联资料</label><select id="import-material" name="materialId" required>${materialOptions()}</select></div><div class="field full"><label for="import-file">选择 JSON 文件 <span class="muted">（可选）</span></label><input id="import-file" type="file" accept=".json,application/json"></div><div class="field full"><label for="import-content">题目 JSON</label><textarea id="import-content" name="questions" required rows="13" spellcheck="false" placeholder='[{"type":"single","stem":"题目内容","options":["选项一","选项二"],"answers":["A"],"explanation":"解析","sourceExcerpt":"资料原文片段"}]'></textarea><p class="hint">可粘贴数组，或包含 questions 数组的对象。填空题 options 使用空数组；多个可接受文本答案分别填写在 answers 中。</p></div></div>${errorBox()}<div class="form-actions"><button class="btn primary" type="submit">校验并导入草稿</button></div></form></div></section>`;
}
function renderAI() {
  return `<section class="panel"><div class="panel-head"><h2>根据资料辅助出题</h2>${tag(model.aiConfigured ? '服务已配置' : '服务未配置', model.aiConfigured ? 'green' : 'amber')}</div><div class="panel-body"><div class="inline-note ${model.aiConfigured ? '' : 'amber'}">${model.aiConfigured ? '生成时会将所选资料发送至已配置的 AI 服务，请先确认资料允许外发。生成题目会保存为草稿，请核对答案、解析和依据后再发布。' : '当前尚未配置 AI 服务。请由部署负责人在服务端完成配置后使用；你仍可以人工录题或批量导入。'}</div>${model.data.materials.length ? `<form id="ai-form"><div class="form-grid"><div class="field"><label for="ai-material">关联资料</label><select id="ai-material" name="materialId" required>${materialOptions()}</select></div><div class="field"><label for="ai-count">生成题数</label><input id="ai-count" name="count" type="number" value="5" min="1" max="10" required></div></div>${errorBox()}<div class="form-actions"><button class="btn primary" type="submit" ${model.aiConfigured ? '' : 'disabled'}>生成待审核题目</button><span class="hint">每次 1—10 题，生成可能需要一些时间</span></div></form>` : empty('请先添加培训资料', 'AI 会根据所选资料生成题目。', 'go-materials', '添加培训资料')}</div></section>`;
}
function filteredPracticeQuestions() { return published().filter(question => (!model.practiceMaterial || question.materialId === model.practiceMaterial) && (!model.practiceType || question.type === model.practiceType)); }
function renderPractice() {
  if (model.session) return renderActivePractice();
  const questions = filteredPracticeQuestions();
  return `${heading('岗位练习', '选择想要巩固的岗位知识，完成后查看答案与原文依据。')}<div class="filter-bar"><select id="practice-material" class="control" aria-label="按资料筛选练习">${materialOptions(model.practiceMaterial, true)}</select><select id="practice-type" class="control" aria-label="按题型筛选练习">${typeOptions(model.practiceType, true)}</select><span class="filter-count">当前 ${questions.length} 道可练习题目</span></div><section class="panel"><div class="panel-head"><h2>选择练习题目</h2>${button('选择当前全部', 'select-all', '', 'ghost small')}</div>${questions.length ? questions.map(question => `<label class="select-question"><input type="checkbox" data-select-question="${esc(question.id)}" ${model.selected.has(question.id) ? 'checked' : ''}><div><div class="question-meta">${tag(types[question.type])}<span class="small muted">${esc(materialTitle(question.materialId))}</span></div><div class="question-stem">${esc(question.stem)}</div></div></label>`).join('') : empty('还没有可以练习的题目', isAdmin() ? '完成题目审核并发布后，就可以在这里练习。' : '请等待管理员发布题目，或切换其他资料与题型。', isAdmin() ? 'go-questions' : '', '审核题目')}</section><div class="practice-toolbar"><span>已选 <strong id="selection-count" class="correct-text">${model.selected.size}</strong> 道题 <span class="small muted"> / 每次最多 50 题</span></span>${button('开始练习', 'start-practice', '', 'primary')}</div>`;
}
function renderActivePractice() {
  const questions = model.session.questions;
  const question = questions[model.index];
  const answers = model.answers[question.id] || [];
  const answered = questions.filter(item => model.answers[item.id]?.length && model.answers[item.id].some(answer => answer.trim())).length;
  const response = question.type === 'fill' ? `<div class="field"><label for="practice-fill">填写答案</label><input id="practice-fill" type="text" maxlength="500" data-fill-answer="${esc(question.id)}" value="${esc(answers[0] || '')}" autocomplete="off" placeholder="请输入你的答案"><p class="hint">请填写完整、准确的内容。</p></div>` : question.options.map((option, index) => { const letter = String.fromCharCode(65 + index); return `<label class="answer-option"><input type="${question.type === 'multi' ? 'checkbox' : 'radio'}" name="practice-answer" data-answer="${letter}" data-question="${esc(question.id)}" ${answers.includes(letter) ? 'checked' : ''}><b>${letter}</b><span>${esc(option)}</span></label>`; }).join('');
  return `${heading('专注当前这一题', '作答完成后统一提交，答案与解析将在提交后显示。', button('结束本次练习', 'discard-practice', '', 'small ghost'))}<div class="practice-layout"><section class="panel practice-card"><div class="question-meta">${tag(types[question.type], 'green')}<span class="small muted">第 ${model.index + 1} / ${questions.length} 题</span>${question.type === 'multi' ? '<span class="small muted">请选择所有正确选项</span>' : ''}</div><div class="question-stem">${esc(question.stem)}</div>${response}<div class="practice-toolbar">${button('上一题', 'previous-question', model.index === 0 ? 'disabled' : '')}${model.index < questions.length - 1 ? button('下一题', 'next-question', '', 'primary') : button('完成并提交', 'submit-practice', '', 'primary')}</div></section><aside class="panel practice-sidebar"><div class="panel-body"><h3>本次作答</h3><progress class="practice-progress" id="practice-progress" max="100" value="${answered / questions.length * 100}" aria-label="作答进度"></progress><p class="small muted" id="practice-answered">已完成 ${answered} / ${questions.length} 题</p><div class="question-map" aria-label="题目导航">${questions.map((item, index) => `<button type="button" data-question-index="${index}" class="${model.answers[item.id]?.some(answer => answer.trim()) ? 'answered' : ''} ${index === model.index ? 'current' : ''}" aria-label="第 ${index + 1} 题${model.answers[item.id]?.some(answer => answer.trim()) ? '，已作答' : '，未作答'}" ${index === model.index ? 'aria-current="step"' : ''}>${index + 1}</button>`).join('')}</div><p class="hint">绿色表示已作答。提交后无法修改本次记录。</p>${button('提交本次练习', 'submit-practice', '', 'primary small')}</div></aside></div>`;
}
function mistakes() {
  const latest = new Map();
  const own = [...model.data.attempts].filter(attempt => attempt.userId === model.user.id).sort((a, b) => new Date(a.submittedAt) - new Date(b.submittedAt));
  for (const attempt of own) for (const item of attempt.items || []) latest.set(item.questionId, { ...item, submittedAt: attempt.submittedAt });
  return [...latest.values()].filter(item => !item.correct);
}
function resultItem(item, index) {
  return `<article class="result-item"><div class="question-meta">${tag(item.correct ? '回答正确' : '需要巩固', item.correct ? 'green' : 'red')}${tag(types[item.type])}<span class="small muted">${esc(materialTitle(item.materialId))}</span></div><div class="question-stem">${index + 1}．${esc(item.stem)}</div>${item.options?.length ? `<div class="options-preview">${item.options.map((option, optionIndex) => `<div>${String.fromCharCode(65 + optionIndex)}．${esc(option)}</div>`).join('')}</div>` : ''}<div class="result-answers"><div><span class="muted">你的答案</span><br><strong class="${item.correct ? 'correct-text' : 'wrong-text'}">${esc(answerText(item, item.userAnswers))}</strong></div><div><span class="muted">参考答案${item.type === 'fill' && item.answers?.length > 1 ? '（任一答案均可）' : ''}</span><br><strong class="correct-text">${esc(answerText(item, item.answers))}</strong></div></div>${item.explanation ? `<div class="answer-block"><strong>知识解析</strong><p>${esc(item.explanation)}</p></div>` : ''}<blockquote class="source"><span class="source-label">原文依据</span>${esc(item.sourceExcerpt || '未记录原文依据')}</blockquote></article>`;
}
function renderMistakes() {
  const items = mistakes();
  const available = new Set(published().map(question => question.id));
  const count = items.filter(item => available.has(item.questionId)).length;
  return `${heading('错题复习', '以你最近一次作答为准，答对后将移出待复习列表。', count ? button(`再练这 ${count} 道错题`, 'retry-mistakes', '', 'primary') : '')}${items.length ? `<div class="inline-note">先回顾知识依据，再检验掌握情况。已撤回的题目保留历史解析，暂不参与再次练习。每次最多练习 50 题。</div><section class="panel">${items.map((item, index) => `${resultItem(item, index)}${!available.has(item.questionId) ? '<p class="inline-note amber">这道题目前未发布，暂时无法再次练习。</p>' : ''}`).join('')}</section>` : `<section class="panel">${empty(model.data.attempts.some(attempt => attempt.userId === model.user.id) ? '当前没有待复习错题' : '练习后，在这里巩固知识', model.data.attempts.some(attempt => attempt.userId === model.user.id) ? '保持练习，把掌握的知识用到实际岗位中。' : '完成一次练习后，答错的题目会自动整理到这里。', 'go-practice', '前往岗位练习')}</section>`}`;
}
function renderResult() {
  const attempt = model.result;
  if (!attempt) { model.view = 'reports'; return renderReports(); }
  const wrongCount = attempt.items.filter(item => !item.correct).length;
  return `${heading('每一次反馈，都是进步的起点', '对照答案与原文依据，理解每一道题背后的岗位知识。')}<section class="result-hero"><div class="score-circle"><b>${Math.round(attempt.accuracy || 0)}<small>%</small></b><span>作答正确率</span></div><div class="result-details"><h2>${wrongCount ? '练习已完成，继续巩固薄弱知识' : '练习已完成，本次全部答对'}</h2><p>共 ${attempt.total} 题 · 答对 ${attempt.score} 题 · 用时 ${Math.max(0, Number(attempt.durationSeconds) || 0)} 秒</p><p>${esc(attempt.userName)} · ${date(attempt.submittedAt, true)}</p></div><div class="result-actions">${wrongCount ? button('再练本次错题', 'retry-result', '', 'primary') : ''}<button type="button" class="btn" data-nav="practice">返回练习</button></div></section><section class="panel"><div class="panel-head"><h2>答案与知识依据</h2>${tag(`${attempt.total} 道题`)}</div>${attempt.items.map(resultItem).join('')}</section>`;
}
function renderReports() {
  const stats = model.data.stats;
  const attempts = newestAttempts();
  return `${heading('学习统计', isAdmin() ? '每一项统计都来自实际提交，帮助了解培训开展情况。' : '回看练习记录，找到需要继续巩固的知识。', isAdmin() ? `<a class="btn small" href="/api/export?format=csv" download>导出 CSV</a><a class="btn small" href="/api/export?format=json" download>导出 JSON</a>` : '')}${statCards(stats, true)}<div class="two-col"><section class="panel"><div class="panel-head"><h2>各题型表现</h2>${tag('累计作答')}</div>${stats.answerCount ? `<div class="panel-body type-stats">${Object.entries(types).map(([type, label]) => { const row = stats.byType?.find(item => item.type === type) || { total: 0, correct: 0, accuracy: 0 }; return `<div><div class="type-stat-head"><span>${label} <small> · ${row.total} 次作答</small></span><strong>${row.total ? percent(row.accuracy) : '—'}</strong></div><progress class="type-progress" max="100" value="${Math.min(100, Math.max(0, Number(row.accuracy) || 0))}" aria-label="${esc(label)}正确率"></progress><p class="small muted gap-small">答对 ${row.correct} / ${row.total} 题</p></div>`; }).join('')}</div>` : empty('尚未生成题型表现', '完成练习后，各题型的作答次数和正确率会显示在这里。')}</section><section class="panel"><div class="panel-head"><h2>${isAdmin() ? '培训概况' : '学习建议'}</h2></div><div class="panel-body step-list">${isAdmin() ? `<div class="step"><div><h3>${stats.learnerCount || 0} 位学员</h3><p>已由管理员建立的学习账号</p></div></div><div class="step"><div><h3>${stats.materialCount || 0} 份资料 / ${stats.publishedCount || 0} 道已发布题目</h3><p>围绕实际岗位逐步完善培训内容</p></div></div><div class="step"><div><h3>保留每一次真实反馈</h3><p>导出包含业务记录，不包含账号口令及登录凭据。</p></div></div>` : `<div class="step"><div><h3>先理解，再记忆</h3><p>练习提交后，结合资料原文回看答案的依据。</p></div></div><div class="step"><div><h3>错题再练，确认掌握</h3><p>错题复习以你的最近作答为准，答对即可移出待复习列表。</p></div></div>`}</div></section></div><section class="panel gap-section"><div class="panel-head"><h2>练习记录</h2>${tag(`${attempts.length} 次`)}</div>${attempts.length ? `<div class="table-wrap"><table><thead><tr>${isAdmin() ? '<th>学员</th>' : ''}<th>提交时间</th><th>答对 / 题数</th><th>正确率</th><th>用时</th><th>操作</th></tr></thead><tbody>${attempts.map(attempt => `<tr>${isAdmin() ? `<td>${esc(attempt.userName)}</td>` : ''}<td>${date(attempt.submittedAt, true)}</td><td class="mono">${attempt.score} / ${attempt.total}</td><td class="correct-text mono">${percent(attempt.accuracy)}</td><td>${Number(attempt.durationSeconds) || 0} 秒</td><td>${button('查看详情', 'view-result', `data-id="${esc(attempt.id)}"`, 'small ghost')}</td></tr>`).join('')}</tbody></table></div>` : empty('还没有完成的练习', '学习统计只记录已提交的练习，开始第一份岗位练习吧。', 'go-practice', '前往岗位练习')}</section><p class="data-footnote">同一题多次练习会分别计入累计作答。历史记录保留提交时的题目、答案和依据，不受后续撤回影响。</p>`;
}
function renderUsers() {
  const learners = model.data.users.filter(user => user.role === 'learner');
  return `${heading('学员管理', '为参与岗位培训的职工建立学习账号。')}<div class="two-col"><section class="panel"><div class="panel-head"><h2>学员名单</h2>${tag(`${learners.length} 人`)}</div>${learners.length ? learners.map(user => `<div class="list-row"><div><div class="row-title">${esc(user.name)}</div><div class="row-meta"><span>${esc(user.email)}</span></div></div>${tag('学员', 'green')}</div>`).join('') : empty('准备好第一位学习伙伴', '建立学员账号后，请将账号信息告知本人，便可登录开始练习。')}</section><section class="panel"><div class="panel-head"><h2>添加学员</h2></div><div class="panel-body"><form id="user-form"><div class="form-grid"><div class="field full"><label for="user-name">学员姓名</label><input id="user-name" name="name" required maxlength="60" autocomplete="off" placeholder="请输入姓名"></div><div class="field full"><label for="user-email">登录邮箱</label><input id="user-email" name="email" type="email" required maxlength="254" autocomplete="off" placeholder="作为该学员的登录账号"></div><div class="field full"><label for="user-password">登录密码</label><input id="user-password" name="password" type="password" required minlength="10" maxlength="128" autocomplete="new-password" placeholder="至少 10 位字符"><p class="hint">请妥善告知学员本人，系统不会在名单中显示密码。</p></div></div>${errorBox()}<div class="form-actions"><button type="submit" class="btn primary">建立学员账号</button></div></form></div></section></div>`;
}

function navigate(view) {
  model.view = view;
  render();
  window.scrollTo(0, 0);
  document.getElementById('main')?.setAttribute('tabindex', '-1');
  document.getElementById('main')?.focus({ preventScroll: true });
}
function persistPractice() {
  try {
    if (model.session) sessionStorage.setItem('zhixue-practice', JSON.stringify({ userId: model.user.id, session: model.session, answers: model.answers, index: model.index }));
    else sessionStorage.removeItem('zhixue-practice');
  } catch { /* Private browsing and full storage must not prevent practice. */ }
}
function restorePractice() {
  try {
    const saved = JSON.parse(sessionStorage.getItem('zhixue-practice') || 'null');
    if (saved?.userId === model.user.id && saved.session?.id && Array.isArray(saved.session.questions) && saved.session.questions.length) {
      model.session = saved.session;
      model.answers = saved.answers || {};
      model.index = Math.min(saved.session.questions.length - 1, Math.max(0, Number(saved.index) || 0));
      model.view = 'practice';
    } else sessionStorage.removeItem('zhixue-practice');
  } catch { sessionStorage.removeItem('zhixue-practice'); }
}
async function startPractice(ids) {
  if (model.session) { navigate('practice'); return; }
  if (!ids.length) throw new Error('请至少选择一道已发布的题目。');
  if (ids.length > 50) throw new Error('每次最多练习 50 道题，请减少选择后重试。');
  const result = await api('/api/sessions', { questionIds: ids });
  model.session = result.session;
  model.answers = {};
  model.index = 0;
  model.result = null;
  persistPractice();
  navigate('practice');
}
async function submitPractice() {
  if (!model.session) return;
  const missingIndex = model.session.questions.findIndex(question => !model.answers[question.id]?.some(answer => answer.trim()));
  if (missingIndex >= 0) {
    model.index = missingIndex;
    persistPractice();
    render();
    throw new Error(`第 ${missingIndex + 1} 题还未作答，请完成所有题目后提交。`);
  }
  const result = await api(`/api/sessions/${encodeURIComponent(model.session.id)}/submit`, { answers: model.answers });
  model.session = null;
  model.answers = {};
  persistPractice();
  model.result = result.attempt;
  // The saved attempt remains reviewable even if refreshing statistics fails.
  try { await refresh(); } catch (error) { toast(`练习已提交。统计刷新失败：${error.message}`, true); }
  navigate('result');
}
async function performAction(action, element) {
  if (action.startsWith('go-')) { navigate(action.slice(3)); return; }
  switch (action) {
    case 'refresh': await refresh(); render(); toast('数据已更新'); break;
    case 'retry-bootstrap': await bootstrap(); break;
    case 'logout':
      await api('/api/logout', {});
      model.session = null; model.answers = {}; model.result = null; model.selected.clear(); model.user = null; model.data = null; model.view = 'home';
      persistPractice();
      await bootstrap();
      break;
    case 'new-question': model.questionTab = 'manual'; navigate('questions'); break;
    case 'question-status':
      await api(`/api/questions/${encodeURIComponent(element.dataset.id)}`, { status: element.dataset.status }, 'PATCH');
      await refresh(); render(); toast(element.dataset.status === 'published' ? '题目已发布，学员可以开始练习' : element.dataset.status === 'draft' ? '题目已转为待审核草稿' : '题目已标记为未采用');
      break;
    case 'select-all': {
      const questions = filteredPracticeQuestions();
      if (questions.length && questions.every(question => model.selected.has(question.id))) questions.forEach(question => model.selected.delete(question.id));
      else {
        for (const question of questions) { if (model.selected.size >= 50) break; model.selected.add(question.id); }
        if (questions.some(question => !model.selected.has(question.id))) toast('每次最多选择 50 道题，已选入前 50 道可用题目');
      }
      render(); break;
    }
    case 'start-practice': await startPractice([...model.selected]); break;
    case 'previous-question': model.index = Math.max(0, model.index - 1); persistPractice(); render(); break;
    case 'next-question': model.index = Math.min(model.session.questions.length - 1, model.index + 1); persistPractice(); render(); break;
    case 'submit-practice': await submitPractice(); break;
    case 'discard-practice':
      if (window.confirm('结束本次练习？未提交的作答不会计入学习记录。')) { model.session = null; model.answers = {}; persistPractice(); render(); }
      break;
    case 'view-result': model.result = model.data.attempts.find(attempt => attempt.id === element.dataset.id); navigate('result'); break;
    case 'retry-mistakes': {
      const available = new Set(published().map(question => question.id));
      await startPractice(mistakes().filter(item => available.has(item.questionId)).map(item => item.questionId).slice(0, 50)); break;
    }
    case 'retry-result': {
      const available = new Set(published().map(question => question.id));
      const ids = model.result.items.filter(item => !item.correct && available.has(item.questionId)).map(item => item.questionId);
      if (!ids.length) throw new Error('本次错题已被撤回，暂时无法再次练习。你仍可以查看历史解析。');
      await startPractice(ids); break;
    }
  }
}
app.addEventListener('click', async event => {
  const nav = event.target.closest('[data-nav]');
  if (nav) { navigate(nav.dataset.nav); return; }
  const tab = event.target.closest('[data-question-tab]');
  if (tab) { model.questionTab = tab.dataset.questionTab; render(); return; }
  const index = event.target.closest('[data-question-index]');
  if (index && model.session) { model.index = Number(index.dataset.questionIndex); persistPractice(); render(); return; }
  const element = event.target.closest('[data-action]');
  if (!element || element.disabled) return;
  const action = element.dataset.action;
  if (busyActions.has(action)) return;
  busyActions.add(action);
  const label = element.textContent;
  element.disabled = true;
  try { await performAction(action, element); }
  catch (error) { reportError(error); }
  finally { busyActions.delete(action); if (element.isConnected) { element.disabled = false; element.textContent = label; } }
});
app.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.target;
  if (form.dataset.busy) return;
  form.dataset.busy = 'true';
  const submit = form.querySelector('[type=submit]');
  const previousLabel = submit.textContent;
  submit.disabled = true;
  submit.textContent = form.id === 'ai-form' ? '正在生成，请稍候…' : '正在保存…';
  form.querySelector('.form-error').textContent = '';
  const values = Object.fromEntries(new FormData(form));
  try {
    if (form.id === 'auth-form') {
      const result = await api(model.setupRequired ? '/api/setup' : '/api/login', values);
      model.user = result.user;
      model.setupRequired = false;
      model.view = 'home';
      await refresh();
      restorePractice();
      render();
      return;
    }
    let message = '';
    if (form.id === 'material-form') { await api('/api/materials', values); message = '培训资料已保存，可以开始录题'; }
    if (form.id === 'user-form') { await api('/api/users', values); message = '学员账号已建立'; }
    if (form.id === 'question-form') {
      const question = { ...values, options: values.type === 'truefalse' ? ['正确', '错误'] : values.type === 'fill' ? [] : values.options.split(/\r?\n/).map(value => value.trim()).filter(Boolean), answers: values.type === 'fill' ? values.answers.split(/\r?\n|[|｜]/).map(value => value.trim()).filter(Boolean) : values.answers.toUpperCase().split(/[,，、\s]+/).filter(Boolean) };
      await api('/api/questions', question);
      message = '题目已保存为草稿，请审核后发布';
      model.questionTab = 'review'; model.questionStatus = 'draft';
    }
    if (form.id === 'import-form') {
      let parsed;
      try { parsed = JSON.parse(values.questions); } catch { throw new Error('JSON 格式有误，请检查引号、逗号与括号后重试。'); }
      const questions = Array.isArray(parsed) ? parsed : parsed.questions;
      if (!Array.isArray(questions) || !questions.length) throw new Error('请提供非空题目数组，或包含 questions 数组的对象。');
      const result = await api('/api/questions/import', { materialId: values.materialId, questions });
      message = `已导入 ${result.questions.length} 道待审核题目`;
      model.questionTab = 'review'; model.questionStatus = 'draft';
    }
    if (form.id === 'ai-form') {
      const result = await api('/api/generate', { materialId: values.materialId, count: Number(values.count) });
      message = `已生成 ${result.questions.length} 道草稿，请逐题核对后发布`;
      model.questionTab = 'review'; model.questionStatus = 'draft';
    }
    await refresh();
    render();
    toast(message);
  } catch (error) { reportError(error, form); }
  finally { delete form.dataset.busy; if (submit.isConnected) { submit.disabled = false; submit.textContent = previousLabel; } }
});
function updatePracticeProgress() {
  if (!model.session) return;
  const questions = model.session.questions;
  const answered = questions.filter(question => model.answers[question.id]?.some(answer => answer.trim())).length;
  const progress = document.getElementById('practice-progress');
  const label = document.getElementById('practice-answered');
  if (progress) progress.value = answered / questions.length * 100;
  if (label) label.textContent = `已完成 ${answered} / ${questions.length} 题`;
  app.querySelectorAll('[data-question-index]').forEach(button => {
    const index = Number(button.dataset.questionIndex);
    const done = model.answers[questions[index].id]?.some(answer => answer.trim());
    button.classList.toggle('answered', !!done);
    button.setAttribute('aria-label', `第 ${index + 1} 题，${done ? '已作答' : '未作答'}`);
  });
  persistPractice();
}
app.addEventListener('input', event => {
  const input = event.target;
  if (input.dataset.fillAnswer && model.session) {
    model.answers[input.dataset.fillAnswer] = input.value ? [input.value] : [];
    updatePracticeProgress();
  }
});
app.addEventListener('change', async event => {
  const input = event.target;
  const filters = { 'question-status': 'questionStatus', 'question-material': 'questionMaterial', 'practice-material': 'practiceMaterial', 'practice-type': 'practiceType' };
  if (filters[input.id]) { model[filters[input.id]] = input.value; render(); return; }
  if (input.dataset.selectQuestion) {
    if (input.checked && model.selected.size >= 50) { input.checked = false; toast('每次最多选择 50 道题', true); return; }
    if (input.checked) model.selected.add(input.dataset.selectQuestion); else model.selected.delete(input.dataset.selectQuestion);
    document.getElementById('selection-count').textContent = model.selected.size;
    return;
  }
  if (input.dataset.answer && model.session) {
    const questionId = input.dataset.question;
    const question = model.session.questions.find(item => item.id === questionId);
    if (question.type === 'multi') {
      const answers = new Set(model.answers[questionId] || []);
      if (input.checked) answers.add(input.dataset.answer); else answers.delete(input.dataset.answer);
      model.answers[questionId] = [...answers].sort();
    } else model.answers[questionId] = [input.dataset.answer];
    updatePracticeProgress();
    return;
  }
  if (input.id === 'q-type') {
    document.getElementById('options-field').hidden = ['fill', 'truefalse'].includes(input.value);
    const answers = document.getElementById('q-answers');
    answers.placeholder = input.value === 'fill' ? '填写可接受答案，多个答案用 | 分隔' : input.value === 'truefalse' ? 'A 表示正确，B 表示错误' : '填写选项字母，多选用逗号分隔';
    document.getElementById('answer-hint').textContent = input.value === 'fill' ? '多个可接受文本答案用 | 分隔；作答需规范化后与其中一个答案完全相同。' : input.value === 'truefalse' ? '判断题固定选项：A．正确；B．错误。' : '单选题填写一个字母；多选题填写多个字母，用逗号分隔。';
    return;
  }
  if (input.id === 'q-material') {
    const preview = document.getElementById('source-preview');
    const material = model.data.materials.find(item => item.id === input.value);
    preview.hidden = !material;
    preview.innerHTML = material ? `<details class="material-preview"><summary>展开原文，复制出题依据</summary><div class="material-content">${esc(material.content)}</div></details>` : '';
    return;
  }
  if (input.id === 'material-file' || input.id === 'import-file') {
    const file = input.files?.[0];
    if (!file) return;
    const form = input.closest('form');
    try {
      if (file.size > 1024 * 1024) throw new Error('文件超过 1 MB，请精简后再导入。');
      const material = input.id === 'material-file';
      if (!(material ? /\.(txt|md)$/i : /\.json$/i).test(file.name)) throw new Error(material ? '请选择 .txt 或 .md 文本文件。' : '请选择 .json 文件。');
      const content = await file.text();
      const target = document.getElementById(material ? 'material-content' : 'import-content');
      // A navigation change can remove the target while the file is being read.
      if (!target || !form.isConnected) return;
      target.value = content.replace(/^\uFEFF/, '');
      if (material && !document.getElementById('material-title').value) document.getElementById('material-title').value = file.name.replace(/\.(txt|md)$/i, '').slice(0, 160);
      form.querySelector('.form-error').textContent = '';
      toast('文件已读取，请核对内容后保存');
    } catch (error) { reportError(error, form); input.value = ''; }
  }
});
async function bootstrap() {
  try {
    const session = await api('/api/session');
    model.user = session.user;
    model.setupRequired = session.setupRequired;
    model.aiConfigured = session.aiConfigured;
    if (model.user) { await refresh(); restorePractice(); }
    render();
  } catch (error) {
    app.innerHTML = `<main id="main" class="screen-error panel"><h1>工作台暂时无法打开</h1><p class="muted gap-message">${esc(error.message)}</p>${button('重新连接', 'retry-bootstrap', '', 'primary')}</main>`;
  }
}
bootstrap();
