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
    ['사용자ID', '아이디', '비밀번호해시', '솔트', '이름', '챌린지제목', '시작일', '세션토큰']
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
  var username = String(p.username || '').trim();
  var pw = String(p.password || '');
  var name = String(p.name || '').trim();
  if (!username || !pw || !name) return { ok: false, error: '아이디, 비밀번호, 이름을 모두 입력해 주세요.' };
  if (pw.length < 4) return { ok: false, error: '비밀번호는 4자 이상이어야 합니다.' };

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var users = readRows_('사용자');
    var dup = users.some(function (u) { return u['아이디'] === username; });
    if (dup) return { ok: false, error: '이미 사용 중인 아이디입니다.' };

    var salt = Utilities.getUuid();
    var hash = hashPw_(pw, salt);
    var userId = newId_();
    var token = Utilities.getUuid();
    var s = sh_('사용자');
    s.appendRow([userId, username, hash, salt, name, '', '', token]);
    return { ok: true, userId: userId, token: token, name: name };
  } finally {
    lock.releaseLock();
  }
}

function apiLogin_(p) {
  var username = String(p.username || '').trim();
  var pw = String(p.password || '');
  var users = readRows_('사용자');
  var row = users.find(function (u) { return u['아이디'] === username; });
  if (!row) return { ok: false, error: '아이디 또는 비밀번호가 올바르지 않습니다.' };
  var hash = hashPw_(pw, row['솔트']);
  if (hash !== row['비밀번호해시']) return { ok: false, error: '아이디 또는 비밀번호가 올바르지 않습니다.' };

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
    // "생각할 거리"는 업로드한 챌린지 카드의 그날 문항을 그대로 사용한다(AI로 새로 생성하지 않음).
    question = missionText;
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
