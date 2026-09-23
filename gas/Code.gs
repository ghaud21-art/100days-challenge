/**
 * 100일 챌린지 — 미래의 편지 · 백엔드 (Google Apps Script)
 * Google Sheets를 데이터베이스로, Gemini API를 통해 미션 이미지 인식 /
 * 매일 질문 생성 / 이정표 편지 생성을 수행하는 JSON API.
 *
 * 배포 전 설정:
 *  1) 확장프로그램 > Apps Script 속성 (프로젝트 설정 > 스크립트 속성) 에 GEMINI_API_KEY 추가
 *  2) 배포 > 새 배포 > 웹 앱 (액세스 권한: 전체) 으로 배포 후 웹앱 URL을 web/app.js 의 GAS_URL 에 입력
 */

var MILESTONES = [1, 7, 21, 66, 100];
var GEMINI_MODEL = 'gemini-2.5-flash';

// "오늘의 생각할 거리"는 업로드한 챌린지 카드(미션)와 별개로, 이 고정된 100개
// 질문 목록(2026. 100 Q&A Countdown)을 Day 순서대로 사용한다.
var THOUGHT_QUESTIONS = [
  '요즘 나는 무엇에 가장 많은 시간을 쓰고 있는지',
  '요즘 가장 자주 하는 생각은?',
  '오늘 내 기분을 한 단어로 표현한다면?',
  '요즘 천천히 해도 될 일은?',
  '최근 나도 모르게 웃었던 순간은?',
  '계속 미루고 있는 일은 무엇이고, 왜 손이 가지 않을까?',
  '지금 나에게 "그래도 괜찮아" 말해 주고 싶은 일이 있다면?',
  '100일 뒤, 지금과 달라져 있으면 좋겠는 한 가지는?',
  '하루 중 내가 가장 좋아하는 시간은?',
  '요즘 자꾸 눈길이 가는 색이나 물건은?',
  '아무 일정도 없는 날, 가장 먼저 하고 싶은 일은?',
  '싫다고 말하고 싶었지만, 그러지 못했던 일이 있었나?',
  '어느 정도면 나에게 "이만하면 잘했다"고 해 줄 수 있을까?',
  '가기만 해도 마음이 편안해지는 장소는?',
  '지금 가지고 있는 것 중 오래 간직하고 싶은 것은?',
  '하루가 덜 정신없어지는 나만의 습관은?',
  '최근 나를 위해 잘했다고 생각하는 선택은?',
  '하루를 조금 편안하게 만들어 주는 습관은?',
  '지쳤을 때 나에게 가장 먼저 나타나는 모습은?',
  '쉬는 날에도 자꾸 신경 쓰이는 일은?',
  '오늘의 나에게 한마디를 건넨다면?',
  '지금 더 솔직하게 이야기하고 싶은 사람과 내용은?',
  '최근 누군가가 내 마음을 알아 줬다고 느낀 순간은?',
  '가까운 사람에게 받고 싶은 작은 배려는?',
  '사람을 대할 때 나도 모르게 반복하는 행동은?',
  '누구와 어떤 이야기를 나눴을 때 기분이 좋아지는가?',
  '오늘 문득 안부가 궁금해진 사람은?',
  '앞으로는 싫다고 말해야 할 것 같은 상황은?',
  '다른 사람에게 맞추느라 바꾸고 싶지 않은 내 모습은?',
  '최근 누군가가 부러웠다면, 그 사람의 어떤 점이 부러웠나?',
  '누구의 눈치도 보지 않아도 된다면 무엇을 선택하고 싶은가?',
  '일상에서 더 자주 보고 싶은 풍경은?',
  '요즘 하루에 하나씩 더하고 싶은 작은 즐거움은?',
  '이제는 더 참지 않아도 될 것 같은 불편함은?',
  '물건을 사기 전에 꼭 확인하고 싶은 나만의 기준은?',
  '요즘 시간을 가장 아깝게 쓰고 있다고 느끼는 순간은?',
  '준비가 덜 되었어도 일단 시작해보고 싶은 것은?',
  '내 방이나 책상에서 가장 마음에 드는 물건은?',
  '나의 10월을 한 단어로 표현한다면?',
  '올해가 가기 전에 꼭 끝내고 싶은 일 하나는?',
  '매일 15분씩 해보고 싶은 일은?',
  '연말이 오기 전에 미리 정리하고 싶은 것은?',
  '생활 속에서 반복되는 불편함 하나를 어떻게 바꿀 수 있을까?',
  '물건의 위치나 주변 환경을 바꾸면 더 쉬워질 일은?',
  '미뤄둔 일을 시작하기 위해 내일 할 수 있는 첫 단계는?',
  '중간에 그만뒀지만 다시 해보고 싶은 것은?',
  '올해 세웠던 계획 중 지금 상황에 맞게 고치고 싶은 것은?',
  '혼자 하지 않고 도움을 받아도 될 일은?',
  '피곤한 날에도 이것만은 하고 싶다고 생각하는 것은?',
  '당장 눈에 보이는 결과가 없어도 계속하고 싶은 일은?',
  '해보지 않으면 나중에 더 아쉬울 것 같은 일은?',
  '내가 잘하는 것 중 앞으로 더 자주 써보고 싶은 능력은?',
  '무언가에 집중하려 할 때 가장 자주 방해되는 것은?',
  '일이나 공부를 시작할 때 잠시 치워두면 좋을 것은?',
  '요즘 자주 하는 핑계는 무엇이며, 사실 무엇이 걱정되는 걸까?',
  '최근 조금 용기를 내서 해본 일은?',
  '이미 알고 있지만 자꾸 외면하고 있는 조언은?',
  '실수하더라도 포기하고 싶지 않은 일은?',
  '잘해야 한다는 생각을 내려놓으면 어떻게 해보고 싶은가?',
  '계획과 다르게 흘러갔지만 지나고 보니 괜찮았던 일은?',
  '쉬는 날에 무엇을 해야 정말 쉬었다는 느낌이 드나?',
  '잠들기 전에 반복하고 나서 후회하는 습관은?',
  '내일 아침을 편하게 만들기 위해 오늘 준비할 것은?',
  '이번 겨울, 나를 잘 돌보기 위해 꼭 지키고 싶은 것은?',
  '바쁜 연말에도 놓치고 싶지 않은 것은?',
  '올해가 가기 전에 꼭 만나고 싶은 사람은?',
  '올해가 끝나기 전에 고맙다고 말하고 싶은 사람은?',
  '12월을 보내며 가장 중요하게 생각하고 싶은 것은?',
  '이번 달의 나에게 "잘했다"고 말해주고 싶은 일은?',
  '올해를 대표하는 사진 한 장을 고른다면?',
  '올해 가장 기억에 남는 날의 날씨는 어땠나?',
  '올해 가장 많은 시간을 보낸 장소에는 어떤 기억이 남아 있나?',
  '올해 예상하지 못하게 벌어진 일은?',
  '계획대로 되지 않았지만 오히려 잘됐다고 생각하는 일은?',
  '올해 가장 많이 웃었던 일은?',
  '올해 가장 자주 들은 노래와 그 이유는?',
  '올해 먹은 것 중 가장 기억에 남는 음식은?',
  '올해 가장 자주, 잘 사용한 물건은?',
  '올해 새롭게 알게 된 유용한 생활 방법은?',
  '올해 돈이 아깝지 않았던 소비는?',
  '그만두거나 내려놓은 뒤 마음이 편해진 것은?',
  '처음에는 어려웠지만 이제는 익숙해진 일은?',
  '지난해보다 덜 무서워진 것은?',
  '올해 나를 위해 잘했다고 생각하는 선택은?',
  '올해 스스로 가장 대견했던 순간은?',
  '다른 사람은 잘 모르지만 나만 알고 있는 노력은?',
  '올해 내 몸이나 건강에 대해 새롭게 알게 된 것은?',
  '올해 가장 힘들었던 날, 나를 버티게 해준 것은?',
  '올해 가장 오래 했던 고민은 지금 어떻게 되었나?',
  '올해 사람들과 지내며 새롭게 알게 된 것은?',
  '아직 고맙다는 말을 충분히 하지 못한 사람은?',
  '지금은 멀어졌지만 좋은 기억으로 남은 사람은?',
  '올해 나에게 가장 다정했던 사람은?',
  '한 해를 보낸 나에게 해주고 싶은 말은?',
  '이제 그만 미안해해도 될 일은?',
  '내년에도 계속하고 싶은 습관은?',
  '내년에는 어떤 순간을 더 자주 만들고 싶은가?',
  '1월에 가장 먼저 실천하고 싶은 일은?',
  '1년 뒤의 나에게 꼭 물어보고 싶은 것은?',
  '2026년을 마치며 마지막으로 남기고 싶은 한 문장은?'
];

/* ============================ 진입점 ============================ */

function doGet(e) {
  return json_({ ok: true, msg: '100일 챌린지 API' });
}

function doPost(e) {
  var action = '';
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    action = body.action;
    var payload = body.payload || {};
    ensureSetup_();
    var result = route_(action, payload);
    return json_(result);
  } catch (err) {
    return json_({ ok: false, error: '서버 오류: ' + err + (action ? ' (action=' + action + ')' : '') });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function route_(action, p) {
  switch (action) {
    case 'signup': return apiSignup_(p);
    case 'login': return apiLogin_(p);
    case 'me': return withAuth_(p, apiMe_);
    case 'extractMissions': return withAuth_(p, apiExtractMissions_);
    case 'saveMissions': return withAuth_(p, apiSaveMissions_);
    case 'getToday': return withAuth_(p, apiGetToday_);
    case 'submitAnswer': return withAuth_(p, apiSubmitAnswer_);
    case 'getLetters': return withAuth_(p, apiGetLetters_);
    case 'getProgress': return withAuth_(p, apiGetProgress_);
    default: return { ok: false, error: '알 수 없는 요청입니다.' };
  }
}

/* ============================ 설치 / 시트 스키마 ============================ */

function setup() {
  var ss = SpreadsheetApp.getActive();
  ensureUsersSheet_(ss);
  ensureMissionsSheet_(ss);
  ensureAnswersSheet_(ss);
  ensureLettersSheet_(ss);
}

function ensureSetup_() {
  var ss = SpreadsheetApp.getActive();
  if (!ss.getSheetByName('사용자')) setup();
}

function ensureUsersSheet_(ss) {
  if (ss.getSheetByName('사용자')) return;
  var sh = ss.insertSheet('사용자');
  sh.getRange(1, 1, 1, 8).setValues([
    ['사용자ID', '학번', 'PIN해시', '솔트', '이름', '챌린지제목', '시작일', '세션토큰']
  ]);
  sh.setColumnWidths(1, 8, 140);
}

function ensureMissionsSheet_(ss) {
  if (ss.getSheetByName('미션')) return;
  var sh = ss.insertSheet('미션');
  sh.getRange(1, 1, 1, 3).setValues([['사용자ID', 'Day', '미션내용']]);
  sh.setColumnWidths(1, 3, 160);
}

function ensureAnswersSheet_(ss) {
  if (ss.getSheetByName('답변')) return;
  var sh = ss.insertSheet('답변');
  sh.getRange(1, 1, 1, 6).setValues([['사용자ID', 'Day', '미션내용', '질문', '답변', '제출시각']]);
  sh.setColumnWidths(1, 6, 160);
}

function ensureLettersSheet_(ss) {
  if (ss.getSheetByName('편지')) return;
  var sh = ss.insertSheet('편지');
  sh.getRange(1, 1, 1, 4).setValues([['사용자ID', 'Day', '편지내용', '생성시각']]);
  sh.setColumnWidths(1, 4, 160);
}

/* ============================ 공용 유틸 ============================ */

function sh_(name) { return SpreadsheetApp.getActive().getSheetByName(name); }

function readRows_(name) {
  var s = sh_(name);
  var vals = s.getDataRange().getDisplayValues();
  var headers = vals[0];
  var out = [];
  for (var i = 1; i < vals.length; i++) {
    var r = vals[i];
    if (r.join('') === '') continue;
    var o = {};
    for (var j = 0; j < headers.length; j++) o[headers[j]] = r[j];
    out.push(o);
  }
  return out;
}

function nowStr_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
}

function todayStr_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Seoul', 'yyyy-MM-dd');
}

function dayIndexFromStart_(startDate) {
  // startDate: 'yyyy-MM-dd' → 오늘이 Day 몇인지 (시작일 = Day 1)
  var tz = Session.getScriptTimeZone() || 'Asia/Seoul';
  var start = new Date(startDate + 'T00:00:00');
  var today = new Date(todayStr_() + 'T00:00:00');
  var diffDays = Math.round((today - start) / 86400000);
  return diffDays + 1;
}

function newId_() { return Utilities.getUuid(); }

function hashPw_(pw, salt) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, pw + ':' + salt);
  return bytes.map(function (b) { return (b < 0 ? b + 256 : b).toString(16).padStart(2, '0'); }).join('');
}

/* ============================ 인증 ============================ */

function apiSignup_(p) {
  var sid = String(p.sid || '').trim();
  var name = String(p.name || '').trim();
  var pin = String(p.pin || '').trim();
  if (!sid || !name || !pin) return { ok: false, error: '학번, 이름, PIN 번호를 모두 입력해 주세요.' };
  if (!/^\d{4,}$/.test(pin)) return { ok: false, error: 'PIN 번호는 숫자 4자리 이상이어야 합니다.' };

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var users = readRows_('사용자');
    var dup = users.some(function (u) { return u['학번'] === sid; });
    if (dup) return { ok: false, error: '이미 등록된 학번입니다. 로그인해 주세요.' };

    var salt = Utilities.getUuid();
    var hash = hashPw_(pin, salt);
    var userId = newId_();
    var token = Utilities.getUuid();
    var s = sh_('사용자');
    s.appendRow([userId, sid, hash, salt, name, '', '', token]);
    return { ok: true, userId: userId, token: token, name: name };
  } finally {
    lock.releaseLock();
  }
}

function apiLogin_(p) {
  var sid = String(p.sid || '').trim();
  var name = String(p.name || '').trim();
  var pin = String(p.pin || '').trim();
  var users = readRows_('사용자');
  var row = users.find(function (u) { return u['학번'] === sid && u['이름'] === name; });
  if (!row) return { ok: false, error: '학번 또는 이름을 확인해 주세요.' };
  var hash = hashPw_(pin, row['솔트']);
  if (hash !== row['PIN해시']) return { ok: false, error: 'PIN 번호가 올바르지 않습니다.' };

  var token = Utilities.getUuid();
  var s = sh_('사용자');
  var vals = s.getDataRange().getValues();
  for (var i = 1; i < vals.length; i++) {
    if (vals[i][0] === row['사용자ID']) { s.getRange(i + 1, 8).setValue(token); break; }
  }
  return { ok: true, userId: row['사용자ID'], token: token, name: row['이름'] };
}

function withAuth_(p, fn) {
  var userId = String(p.userId || '');
  var token = String(p.token || '');
  if (!userId || !token) return { ok: false, error: '로그인이 필요합니다.' };
  var users = readRows_('사용자');
  var row = users.find(function (u) { return u['사용자ID'] === userId; });
  if (!row || row['세션토큰'] !== token) return { ok: false, error: '세션이 만료되었습니다. 다시 로그인해 주세요.' };
  return fn(p, row);
}

function apiMe_(p, userRow) {
  var hasMissions = readRows_('미션').some(function (m) { return m['사용자ID'] === userRow['사용자ID']; });
  return {
    ok: true,
    name: userRow['이름'],
    challengeTitle: userRow['챌린지제목'],
    startDate: userRow['시작일'],
    hasMissions: hasMissions
  };
}

/* ============================ Gemini 연동 ============================ */

function geminiApiKey_() {
  var key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!key) throw new Error('GEMINI_API_KEY 스크립트 속성이 설정되어 있지 않습니다.');
  return key;
}

function callGemini_(parts, generationConfig) {
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL + ':generateContent?key=' + geminiApiKey_();
  var payload = {
    contents: [{ role: 'user', parts: parts }],
    generationConfig: generationConfig || {}
  };
  var res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  var text = res.getContentText();
  if (code < 200 || code >= 300) throw new Error('Gemini API 오류(' + code + '): ' + text);
  var data = JSON.parse(text);
  var cand = data.candidates && data.candidates[0];
  var out = cand && cand.content && cand.content.parts && cand.content.parts.map(function (pt) { return pt.text || ''; }).join('') || '';
  if (!out) throw new Error('Gemini 응답이 비어 있습니다.');
  return out;
}

function callGeminiJSON_(parts, schema) {
  var out = callGemini_(parts, { responseMimeType: 'application/json', responseSchema: schema });
  return JSON.parse(out);
}

/* ============================ 온보딩: 이미지 인식 ============================ */

function apiExtractMissions_(p, userRow) {
  var base64 = String(p.imageBase64 || '');
  var mimeType = String(p.mimeType || 'image/jpeg');
  if (!base64) return { ok: false, error: '이미지 데이터가 없습니다.' };

  var schema = {
    type: 'OBJECT',
    properties: {
      title: { type: 'STRING' },
      missions: { type: 'ARRAY', items: { type: 'STRING' } }
    },
    required: ['title', 'missions']
  };

  var prompt = '이 이미지는 100일 챌린지 카드/표이다. 이미지 속 챌린지 제목과, 하루하루 실천할 100개의 미션(또는 질문) 텍스트를 날짜/Day 순서대로 정확히 추출하라. ' +
    '각 항목은 이미지에 적힌 문구를 최대한 그대로 옮기고, Day 번호나 날짜 텍스트는 제외하고 미션 본문만 담아라. ' +
    '정확히 100개를 추출하되, 이미지에서 명확히 읽히지 않는 항목은 빈 문자열로 채워 개수를 100개로 맞춰라. title 이 보이지 않으면 "100일 챌린지"로 채워라.';

  var parts = [
    { text: prompt },
    { inlineData: { mimeType: mimeType, data: base64 } }
  ];

  var result = callGeminiJSON_(parts, schema);
  var missions = (result.missions || []).slice(0, 100);
  while (missions.length < 100) missions.push('');
  return { ok: true, title: result.title || '100일 챌린지', missions: missions };
}

function apiSaveMissions_(p, userRow) {
  var title = String(p.title || '100일 챌린지').trim();
  var startDate = String(p.startDate || todayStr_()).trim();
  var missions = p.missions || [];
  if (missions.length !== 100) return { ok: false, error: '미션은 100개여야 합니다.' };
  if (missions.some(function (m) { return !String(m || '').trim(); })) {
    return { ok: false, error: '빈 미션이 있습니다. 모든 Day의 미션을 채워 주세요.' };
  }

  var userId = userRow['사용자ID'];
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var ms = sh_('미션');
    var vals = ms.getDataRange().getValues();
    for (var i = vals.length - 1; i >= 1; i--) {
      if (vals[i][0] === userId) ms.deleteRow(i + 1);
    }
    var rows = missions.map(function (m, idx) { return [userId, idx + 1, String(m).trim()]; });
    var startRow = ms.getLastRow() + 1;
    ms.getRange(startRow, 1, rows.length, 3).setValues(rows);

    var us = sh_('사용자');
    var uvals = us.getDataRange().getValues();
    for (var j = 1; j < uvals.length; j++) {
      if (uvals[j][0] === userId) {
        us.getRange(j + 1, 6).setValue(title);
        us.getRange(j + 1, 7).setValue(startDate);
        break;
      }
    }
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/* ============================ 데일리 화면 ============================ */

function apiGetToday_(p, userRow) {
  var startDate = userRow['시작일'];
  if (!startDate) return { ok: false, error: '아직 챌린지를 설정하지 않았습니다.' };
  var userId = userRow['사용자ID'];
  var day = dayIndexFromStart_(startDate);
  if (day < 1) return { ok: false, error: '챌린지 시작 전입니다.' };
  if (day > 100) day = 100;

  var missions = readRows_('미션').filter(function (m) { return m['사용자ID'] === userId; });
  var missionRow = missions.find(function (m) { return Number(m['Day']) === day; });
  var missionText = missionRow ? missionRow['미션내용'] : '';

  var answers = readRows_('답변').filter(function (a) { return a['사용자ID'] === userId; });
  var todayAnswer = answers.find(function (a) { return Number(a['Day']) === day; });

  var question;
  if (todayAnswer) {
    question = todayAnswer['질문'];
  } else {
    // "생각할 거리"는 업로드한 챌린지 카드(미션)와 별개로 고정된 100개 질문 목록을 사용한다.
    question = THOUGHT_QUESTIONS[day - 1] || '';
    appendAnswerRow_(userId, day, missionText, question, '', '');
  }

  return {
    ok: true,
    day: day,
    totalDays: 100,
    missionText: missionText,
    question: question,
    answered: !!(todayAnswer && todayAnswer['답변']),
    answer: todayAnswer ? todayAnswer['답변'] : '',
    isMilestone: MILESTONES.indexOf(day) !== -1,
    challengeTitle: userRow['챌린지제목']
  };
}

function appendAnswerRow_(userId, day, missionText, question, answer, submittedAt) {
  var s = sh_('답변');
  s.appendRow([userId, day, missionText, question, answer, submittedAt]);
}

function apiSubmitAnswer_(p, userRow) {
  var day = Number(p.day);
  var answer = String(p.answer || '').trim();
  if (!day || !answer) return { ok: false, error: '답변을 입력해 주세요.' };
  var userId = userRow['사용자ID'];

  var s = sh_('답변');
  var vals = s.getDataRange().getValues();
  var found = false;
  for (var i = 1; i < vals.length; i++) {
    if (vals[i][0] === userId && Number(vals[i][1]) === day) {
      s.getRange(i + 1, 5).setValue(answer);
      s.getRange(i + 1, 6).setValue(nowStr_());
      found = true;
      break;
    }
  }
  if (!found) return { ok: false, error: '오늘의 질문을 먼저 불러와 주세요.' };

  var letter = null;
  if (MILESTONES.indexOf(day) !== -1) {
    letter = generateAndSaveLetter_(userId, day, userRow);
  }
  return { ok: true, letterGenerated: !!letter, letter: letter };
}

/* ============================ 이정표 편지 ============================ */

function generateAndSaveLetter_(userId, day, userRow) {
  var answers = readRows_('답변')
    .filter(function (a) { return a['사용자ID'] === userId && a['답변'] && Number(a['Day']) <= day; })
    .sort(function (a, b) { return Number(a['Day']) - Number(b['Day']); });

  var body = answers.map(function (a) {
    return 'Day ' + a['Day'] + ' 미션: ' + a['미션내용'] + '\nDay ' + a['Day'] + ' 질문: ' + a['질문'] + '\nDay ' + a['Day'] + ' 답변: ' + a['답변'];
  }).join('\n\n');

  var stageLabel = day === 1 ? '1일째, 챌린지를 막 시작한 시점' :
    day === 100 ? '100일째, 챌린지를 완주한 시점' :
    day + '일째';

  var prompt = '너는 "2027년의 미래 나"이다. 지금은 챌린지 ' + stageLabel + '이고, 이름은 "' + (userRow['이름'] || '나') + '"이다. ' +
    '아래는 챌린지를 시작한 이후 지금까지의 미션과 질문, 그리고 본인이 직접 쓴 답변 기록이다.\n\n' + body + '\n\n' +
    '이 기록을 꼼꼼히 읽고, 2027년의 미래의 나로서 지금의 나에게 편지를 써라.\n' +
    '- 톤: 다정하지만 관찰자적으로. 막연한 응원 문구("힘내!", "잘 하고 있어!" 같은 상투적 표현)는 쓰지 말 것.\n' +
    '- 실제 답변 내용 중 구체적인 문장이나 표현을 직접 인용하며, 그 사이에서 읽히는 변화나 패턴을 짚어줄 것. ' +
    '예: "1일차엔 확신이 없다고 했는데, ' + day + '일째 답변에서는 스스로 우선순위를 정하고 있더라" 처럼.\n' +
    '- 분량은 6~10문장 정도의 편지글. 인사말과 마무리 인사를 포함할 것.\n' +
    '- 한국어로, 편지 본문만 출력하라. 제목이나 설명은 붙이지 말 것.';

  var text = callGemini_([{ text: prompt }], { temperature: 0.8 }).trim();

  var s = sh_('편지');
  s.appendRow([userId, day, text, nowStr_()]);
  return { day: day, text: text, createdAt: nowStr_() };
}

function apiGetLetters_(p, userRow) {
  var userId = userRow['사용자ID'];
  var letters = readRows_('편지')
    .filter(function (l) { return l['사용자ID'] === userId; })
    .map(function (l) { return { day: Number(l['Day']), text: l['편지내용'], createdAt: l['생성시각'] }; })
    .sort(function (a, b) { return a.day - b.day; });
  return { ok: true, letters: letters, milestones: MILESTONES };
}

/* ============================ 진행 대시보드 ============================ */

function apiGetProgress_(p, userRow) {
  var userId = userRow['사용자ID'];
  var answers = readRows_('답변').filter(function (a) { return a['사용자ID'] === userId && a['답변']; });
  var doneDays = {};
  answers.forEach(function (a) { doneDays[Number(a['Day'])] = true; });

  var currentDay = userRow['시작일'] ? dayIndexFromStart_(userRow['시작일']) : 0;
  var days = [];
  for (var d = 1; d <= 100; d++) {
    days.push({
      day: d,
      done: !!doneDays[d],
      milestone: MILESTONES.indexOf(d) !== -1,
      isToday: d === currentDay
    });
  }
  return { ok: true, days: days, currentDay: currentDay, completedCount: Object.keys(doneDays).length };
}
