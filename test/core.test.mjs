import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateQuestion, gradeQuestion, aggregate, csvCell } from '../lib/core.mjs';

const material = { id:'m1', content:'设备使用前必须检查状态，发现异常应立即停止使用并报告负责人。' };
const question = {materialId:'m1',type:'single',stem:'发现异常如何处理？',options:['继续使用','停止并报告'],answers:['B'],explanation:'按操作要求处理。',sourceExcerpt:'发现异常应立即停止使用并报告负责人'};
test('题目必须关联资料中实际存在的原文依据', () => {
  assert.equal(validateQuestion(question, material).answers[0], 'B');
  assert.throws(() => validateQuestion({...question,sourceExcerpt:'这个依据没有出现在原文里'},material), /原文/);
  assert.throws(() => validateQuestion({...question,materialId:'m2'},material), /资料/);
  assert.throws(() => validateQuestion({...question,answers:['F']},material), /答案/);
});
test('多选精确匹配选项集合，重复选项和超范围选项无效', () => {
  const q={...question,type:'multi',answers:['A','B']};
  assert.equal(gradeQuestion(q,['B','A']), true);
  assert.equal(gradeQuestion(q,['A']), false);
  assert.equal(gradeQuestion(q,['A','B','C']), false);
  assert.throws(()=>validateQuestion({...q,options:['相同','相同']},material), /重复/);
});
test('填空按完整规范化文本比较，不能用包含关系猜对', () => {
  const q={...question,type:'fill',options:[],answers:['立即停止使用','Stop work']};
  assert.equal(gradeQuestion(q,['停止']), false);
  assert.equal(gradeQuestion(q,[' 立即停止使用 ']), true);
  assert.equal(gradeQuestion(q,['stop work']), true);
  assert.equal(gradeQuestion(q,['']), false);
  assert.equal(gradeQuestion(q,['立即停止使用并进行其他操作']), false);
});
test('空历史各项真实为零，题型正确率仅来自真实答题', () => {
  const empty=aggregate([],[],[],[]);
  assert.equal(empty.attemptCount,0); assert.equal(empty.accuracy,0);
  assert.ok(empty.byType.every(t=>t.total===0&&t.accuracy===0));
  const s=aggregate([{items:[{type:'single',correct:true},{type:'fill',correct:false}]}],[],[],[]);
  assert.equal(s.answerCount,2); assert.equal(s.accuracy,50);
  assert.equal(s.byType.find(t=>t.type==='single').accuracy,100);
  assert.equal(s.byType.find(t=>t.type==='fill').accuracy,0);
});
test('CSV 单元格不执行表格公式并正确转义', () => {
  assert.equal(csvCell('=SUM(A1)'), '"\'=SUM(A1)"');
  assert.equal(csvCell('a"b'), '"a""b"');
});
