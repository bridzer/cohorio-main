function confidenceLevelFromScore(score){ if(score>=0.75) return 'high'; if(score>=0.45) return 'medium'; return 'low'; }
function scoreConfidence(input){
  let base;
  if(input.isExplicit) base=0.85; else if(input.evidenceCount>=5) base=0.75; else if(input.evidenceCount>=3) base=0.58; else if(input.evidenceCount>=2) base=0.42; else base=0.22;
  base+=(input.consistency-0.5)*0.24;
  base+=(input.recencyScore-0.5)*0.12;
  if(input.conflictingCount>=2) base-=0.18; else if(input.conflictingCount===1) base-=0.08;
  const score=Math.max(0.05,Math.min(0.95,Math.round(base*100)/100));
  const isPersistent=input.isExplicit||(input.evidenceCount>=3&&input.consistency>=0.7&&input.conflictingCount===0)||(input.evidenceCount>=5&&input.consistency>=0.5&&input.conflictingCount<=1);
  return {score,isPersistent};
}
function levenshteinRatio(a,b){
  if(a===b) return 0; if(!a.length||!b.length) return 1;
  const m=a.length,n=b.length;
  const dp=Array.from({length:m+1},()=>Array(n+1).fill(0));
  for(let i=0;i<=m;i++) dp[i][0]=i; for(let j=0;j<=n;j++) dp[0][j]=j;
  for(let i=1;i<=m;i++) for(let j=1;j<=n;j++){
    const cost=a[i-1]===b[j-1]?0:1; dp[i][j]=Math.min(dp[i-1][j]+1,dp[i][j-1]+1,dp[i-1][j-1]+cost);
  }
  return (dp[m][n]??0)/Math.max(m,n);
}
function isMeaningfulEdit(input){
  const a=(input.originalText||'').trim(); const b=(input.finalText||'').trim();
  if(!a||!b) return false; if(a===b) return false;
  const ratio=levenshteinRatio(a.slice(0,6000),b.slice(0,6000));
  if(ratio<0.06){
    const normalize=s=>s.replace(/[\s_.,;:!?-]+/g,'').toLowerCase();
    return normalize(a)!==normalize(b);
  }
  return ratio>=0.06;
}
let ok=true;
function assert(cond,msg){ if(!cond){ console.error('FAIL:',msg); ok=false; } else console.log('PASS:',msg); }
let r1=scoreConfidence({isExplicit:false,evidenceCount:1,consistency:0.5,recencyScore:0.8,conflictingCount:0});
assert(r1.score<0.45 && !r1.isPersistent,'isolated stylistic stays low + non-persistent');
let r2=scoreConfidence({isExplicit:false,evidenceCount:4,consistency:0.8,recencyScore:0.9,conflictingCount:0});
assert(r2.score>=0.5 && r2.isPersistent,'repeated consistent becomes persistent');
let r3=scoreConfidence({isExplicit:true,evidenceCount:1,consistency:0.5,recencyScore:0.8,conflictingCount:0});
assert(r3.score>=0.75 && r3.isPersistent,'explicit immediate high');
assert(confidenceLevelFromScore(0.85)==='high','confidence high');
assert(confidenceLevelFromScore(0.55)==='medium','confidence medium');
assert(confidenceLevelFromScore(0.2)==='low','confidence low');
assert(!isMeaningfulEdit({originalText:'Hello, world!',finalText:'Hello world'}),'trivial formatting ignored');
assert(isMeaningfulEdit({originalText:'Our revolutionary world-class unparalleled solution transforms your workflow!',finalText:'We help small shops cut picking time in half.'}),'substantial rewrite meaningful');
assert(!isMeaningfulEdit({originalText:'Same',finalText:'Same'}),'identical not meaningful');
console.log(ok?'ALL CHECKS PASSED':'SOME CHECKS FAILED');
if(!ok) process.exit(1);
