# 职工岗位培训系统实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Tasks follow the adjacent approved design and API contract.

**Goal:** 交付真实数据驱动的本机培训系统，以及与实际阶段一致的申报准备材料。

**Architecture:** Node 内置模块服务与原子 JSON 持久化；独立静态界面；AI 可选配置、先审后用。

**Tech Stack:** Node.js 22+、HTML/CSS/JavaScript、node:test、python-docx。

## 任务一 领域规则与服务端

- [x] 创建 `test/core.test.mjs`、`test/server.test.mjs`，运行 `node --test` 确认尚无实现时失败。
- [x] 在 `lib/core.mjs` 实现 validateQuestion、gradeQuestion、aggregate；在 `server.mjs` 实现设计文档中的路由、持久化、口令和会话控制。
- [x] 运行 `node --test`，检查精确判分、多选、原文依据、权限、原子导入、重复提交、旧题快照、AI 错误、Cookie 和数据重启持久化。

## 任务二 培训界面

- [x] 将原页面保存 `legacy/index.html` 作为改造前参考，创建 `public/index.html`、`public/styles.css`、`public/app.js`。
- [x] 按接口契约连接首次设置、登录、资料、出题审核、练习、错题回顾、人员、报表与导出；学员不展示管理操作。
- [x] 运行 `node --check public/app.js`，用浏览器完整试用并检查窄屏，修复操作或排版缺陷。

## 任务三 申报材料与试用文件

- [x] 根据设计与最终源码生成 `output/申报材料/职学岗位培训系统申报准备稿.docx`、`职学岗位培训系统试用与成效记录表.docx`。
- [x] 写清实际开发与测试、尚未实际使用、待单位认定及待统计指标；实际使用和获奖、金额不得编造。
- [x] 将 Word 导出至 QA PDF、检查全部页图，不交付 QA 中间件。

## 任务四 验证及交付

- [x] 补充 README、环境示例、Windows 启动脚本、ignore 本地数据和密钥。
- [x] 完整运行测试及浏览器工作流，记录真实验证结果和 AI 未做在线验证的限制。
- [x] 检查 git diff，提交本地分支；不推送、不部署、不正式报送申报材料。
