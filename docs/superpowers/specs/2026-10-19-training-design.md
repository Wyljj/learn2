# 职工岗位培训系统设计

## 目标与范围

把现有单页演示改为可供本机试用的资料驱动岗位培训工具。保留资料、出题、练习、复习、统计主线。由培训管理员建立人员与资料、审核题目，再由学员练习。所有统计来自实际提交，首次运行无示例用户、题目或成绩。申报材料如实写“已完成本轮开发优化，待真实试用和单位认定”。

## 架构

Node.js 22+ 内置 HTTP、crypto、文件系统，不引入运行依赖。数据以单一 JSON 文件原子写入本地 data/，写入串行化，服务默认监听 127.0.0.1。适用于单机及受控试用，不宣称已有跨机构大规模服务能力。管理员与学员用服务端账号登录，口令 scrypt 加盐保存，随机 HttpOnly SameSite=Strict 会话 Cookie，写操作验证同源。AI 凭据仅来自服务端环境变量，不写浏览器、仓库、导出或日志。

## 工作流程

首次设置管理员 → 创建学员 → 上传或粘贴 TXT/Markdown 资料 → 人工录题或调用已配置的 AI 服务 → 审核发布 → 选择已发布题目练习 → 服务端判分 → 错题回顾及再练习 → 真实统计与导出。

所有题目必须关联资料，并提供原文中能精确找到的依据片段。AI 题目默认草稿，失败明确报错，不生成示例题。正式练习不下发答案，提交后返回解析、依据和判分。填空题规范化后精确匹配，禁止包含关系判分。成绩与原题快照保持关联，题目撤回不改变既有成绩。

## 数据与接口契约

响应成功返回对象，错误统一 `{error:中文文案,code:稳定代码}`。前端 api() 直接得到对象，无 data 包装。

- `GET /api/session` → `{user:null|{id,name,email,role},setupRequired,aiConfigured}`。
- `POST /api/setup`、`POST /api/login`，请求 `{name?,email,password}`，返回 `{user}`；setup 仅空用户库可用。
- `POST /api/logout` → `{ok:true}`。
- `GET /api/state` → `{user,aiConfigured,materials,questions,attempts,users,stats}`。学员只能看到已发布题目（移除 answers、explanation、sourceExcerpt）及本人成绩；管理员可看全部。统计结构由前端从真实 attempts 计算，stats 为服务端聚合 `{attemptCount,answerCount,correctCount,accuracy,byType:[{type,total,correct,accuracy}],learnerCount,materialCount,publishedCount}`。
- `POST /api/users` `{name,email,password}` → `{user}`，管理员建立学员。
- `POST /api/materials` `{title,category,content}` → `{material}`，资料只允许受限长度文本。material: `{id,title,category,content,createdAt,createdBy}`。
- `POST /api/questions` `{materialId,type,stem,options,answers,explanation,sourceExcerpt}` → `{question}`，仅管理员。type: single,multi,truefalse,fill；单选和判断 answers 为一个字母的数组，多选为多个字母；填空 answers 为可接受文本答案数组；判断选项固定 `[正确,错误]`，答案仍为 A 或 B。选择题 options 不带 A. 前缀。
- `POST /api/questions/import` `{materialId,questions:[上述题目字段]}` → `{questions}`。整批校验，失败不写入。
- `PATCH /api/questions/:id` `{status:published|draft|rejected}` → `{question}`，只切换状态，发布前按相同规则再次校验。
- `POST /api/generate` `{materialId,count}` → `{questions}`。count 1—10，生成草稿；未配置返回明确 503，失败不写数据。使用 OpenAI 兼容 Chat Completions，环境 `AI_BASE_URL`（以 /v1 结尾）、`AI_API_KEY`、`AI_MODEL`；服务器不允许前端传任意 URL 或凭据。
- `POST /api/sessions` `{questionIds:[id]}` → `{session:{id,questions:[无答案题目],startedAt}}`，题目须已发布，1—50且不重复。
- `POST /api/sessions/:id/submit` `{answers:{questionId:[回答]}}` → `{attempt}`。attempt `{id,userId,userName,submittedAt,durationSeconds,score,total,accuracy,items:[{questionId,materialId,type,stem,options,answers,userAnswers,correct,explanation,sourceExcerpt}]}`。同一会话只能提交一次，不接受其他用户会话。
- `GET /api/export?format=json|csv` 管理员，下载脱敏于口令的业务数据，CSV 防公式注入。

## 界面设计

应用名“职学”，保留“智学 AI”项目来源说明。石板蓝 #203A56、纸白 #F5F7FA、墨黑 #182432、青绿 #137C73、浅线 #DCE3EA、提示琥珀 #9B6711。中文系统字体，标题 26—34px，正文 14—16px。左侧窄导航，右侧当前流程工作区；题目审核用宽阅读区与依据片段，练习模式集中展示单题与进度。空数据展示下一步行动，不放假示例。响应式至 360px，键盘焦点、表单 label、可读错误反馈；无外部字体或 CDN 运行依赖。

## 验证与交付

用 node:test 验证资料依据、精确判分、真实统计、权限、会话所有权、防重复提交、AI 失败及审核、持久化与导出。浏览器覆盖设置、资料、题目审核、建学员、练习、报表、移动端。文档包含申报准备稿与试用成效记录表，待补信息明确标识，不把软件测试当成实际应用。

## 限制

AI 在线生成因未提供真实服务凭据，只能通过隔离测试验证请求与失败处理。实际生成效果由配置服务后试用核验。默认本机 HTTP；正式联网使用需部署 HTTPS、备份和运行监控。业务数据导出不包含账户口令或有效登录会话，备份恢复本地数据文件时须妥善保护该文件。
