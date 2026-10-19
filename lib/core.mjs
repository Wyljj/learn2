export class AppError extends Error {
  constructor(code, message, status=422) { super(message); this.code=code; this.status=status; }
}
export function requireValue(value, code, message, status=422) {
  if (!value) throw new AppError(code,message,status);
}
export function text(value, label, max=2000, min=1) {
  requireValue(typeof value==='string','INVALID_TEXT',`${label}必须是文本`);
  const out=value.trim();
  requireValue(out.length>=min && out.length<=max,'INVALID_LENGTH',`${label}需为${min}至${max}个字符`);
  return out;
}
export function validateQuestion(raw, material) {
  requireValue(raw && typeof raw==='object' && !Array.isArray(raw),'INVALID_QUESTION','题目格式不正确');
  requireValue(material && raw.materialId===material.id,'INVALID_MATERIAL','题目必须关联有效资料');
  const type=raw.type;
  requireValue(['single','multi','truefalse','fill'].includes(type),'INVALID_TYPE','请选择有效题型');
  const stem=text(raw.stem,'题干',2000);
  const explanation=text(raw.explanation,'解析',4000);
  const sourceExcerpt=text(raw.sourceExcerpt,'原文依据',1500,4);
  requireValue(material.content.includes(sourceExcerpt),'SOURCE_MISMATCH','原文依据必须完整出现在所选资料中');
  requireValue(Array.isArray(raw.answers) && raw.answers.length>0 && raw.answers.length<=10,'INVALID_ANSWERS','请填写有效答案');
  const answers=raw.answers.map(a=>text(a,'答案',500));
  requireValue(new Set(answers).size===answers.length,'DUPLICATE_ANSWERS','答案不能重复');
  let options=[];
  if(type==='fill') {
    requireValue(!raw.options || (Array.isArray(raw.options)&&raw.options.length===0),'INVALID_OPTIONS','填空题无需选项');
  } else {
    options=type==='truefalse'?['正确','错误']:raw.options;
    requireValue(Array.isArray(options)&&options.length>=2&&options.length<=6,'INVALID_OPTIONS','选择题需有2至6个选项');
    options=options.map(v=>text(v,'选项',500));
    requireValue(new Set(options).size===options.length,'DUPLICATE_OPTIONS','选项不能重复');
    const labels=options.map((_,i)=>String.fromCharCode(65+i));
    requireValue(answers.every(a=>labels.includes(a)),'INVALID_ANSWERS','答案必须是对应选项的大写字母');
    requireValue(type==='multi'?answers.length>=2:answers.length===1,'INVALID_ANSWERS','单选和判断题需要一个答案，多选题至少两个答案');
  }
  return {materialId:material.id,type,stem,options,answers,explanation,sourceExcerpt};
}
const normal=value=>String(value).normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
export function gradeQuestion(question, supplied) {
  if(!Array.isArray(supplied)||supplied.some(a=>typeof a!=='string')) return false;
  if(question.type==='fill') return supplied.length===1&&normal(supplied[0])!==''&&question.answers.some(a=>normal(a)===normal(supplied[0]));
  if(supplied.length!==new Set(supplied).size) return false;
  return supplied.length===question.answers.length&&question.answers.every(a=>supplied.includes(a));
}
export function aggregate(attempts,users=[],materials=[],questions=[]) {
  const items=attempts.flatMap(a=>a.items||[]);
  const correctCount=items.filter(i=>i.correct===true).length;
  const byType=['single','multi','truefalse','fill'].map(type=>{
    const filtered=items.filter(i=>i.type===type),correct=filtered.filter(i=>i.correct===true).length;
    return {type,total:filtered.length,correct,accuracy:filtered.length?Math.round(correct/filtered.length*100):0};
  });
  return {attemptCount:attempts.length,answerCount:items.length,correctCount,accuracy:items.length?Math.round(correctCount/items.length*100):0,byType,learnerCount:users.filter(u=>u.role==='learner').length,materialCount:materials.length,publishedCount:questions.filter(q=>q.status==='published').length};
}
export function csvCell(value) {
  let s=String(value??''); if(/^[\s]*[=+@\-\t\r]/.test(s)) s="'"+s;
  return '"'+s.replaceAll('"','""')+'"';
}
export function safeQuestion(q) {
  const {answers,explanation,sourceExcerpt,createdBy,...safe}=q;
  return safe;
}
