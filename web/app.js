/* ============ 설정 ============ */
// Apps Script 웹앱 배포 후 발급되는 URL을 여기에 넣으세요.
// (형식: https://script.google.com/macros/s/XXXXXXXX/exec)
const CONFIG = {
  GAS_URL: 'https://script.google.com/macros/s/AKfycbzZgy7yzgBx_HMiAcINlf1U_NJKA7pGkW_eAh31cQkX-3n6AG8iqOQqzKBvtC2pj0UjHg/exec'
};
const MOCK = !CONFIG.GAS_URL || CONFIG.GAS_URL.indexOf('YOUR_GAS_WEB_APP_URL_HERE') !== -1;
const MILESTONES = [1, 7, 21, 66, 100];

/* ============ API 레이어 ============ */
function apiReal_(action, payload) {
  // GAS 는 OPTIONS 프리플라이트를 처리하지 못하므로 text/plain 으로 보내
  // 단순 요청(preflight 없음)으로 유지한다.
  return fetch(CONFIG.GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, payload })
  }).then(r => r.json());
}

function api(action, payload) {
  const auth = getAuth();
  const withAuth = Object.assign({}, payload || {}, auth ? { userId: auth.userId, token: auth.token } : {});
  if (MOCK) return mockApi(action, withAuth);
  return apiReal_(action, withAuth).catch(() => ({ ok: false, error: '서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.' }));
}

/* ============ 목업 API (백엔드 미연결 시 화면 확인용) ============ */
const MOCK_SAMPLE_MISSIONS = [
  '요즘 나는 무엇에 가장 많은 시간을 쓰고 있는지', '요즘을 자주 하는 생각은?', '오늘 내 기분을 한 단어로 표현한다면?',
  '요즘 천천히 해도 될 일은?', '최근 나도 모르게 웃었던 순간은?', '계속 미루고 있는 일은 무엇이고, 왜 손이 가지 않을까?',
  '지금 나에게 "그래도 괜찮아" 말해 주고 싶은 일이 있다면?', '100일 뒤, 지금과 달라져 있으면 좋겠는 한 가지는?',
  '하루 중 내가 가장 좋아하는 시간은?', '요즘 자꾸 눈길이 가는 색이나 물건은?'
];
function mockStore_() {
  const raw = localStorage.getItem('chal_mock_db');
  return raw ? JSON.parse(raw) : { users: {}, missions: {}, answers: {}, letters: {} };
}
function mockSave_(db) { localStorage.setItem('chal_mock_db', JSON.stringify(db)); }
function mockDayIndex_(startDate) {
  const start = new Date(startDate + 'T00:00:00');
  const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00');
  return Math.round((today - start) / 86400000) + 1;
}
function mockApi(action, p) {
  const db = mockStore_();
  const delay = (v) => new Promise(res => setTimeout(() => res(v), 260));

  if (action === 'signup') {
    if (db.users[p.username]) return delay({ ok: false, error: '이미 사용 중인 아이디입니다.' });
    const userId = 'u_' + Date.now();
    const token = 'tok_' + Math.random().toString(36).slice(2);
    db.users[p.username] = { userId, token, name: p.name, username: p.username, password: p.password, challengeTitle: '', startDate: '' };
    mockSave_(db);
    return delay({ ok: true, userId, token, name: p.name });
  }
  if (action === 'login') {
    const u = db.users[p.username];
    if (!u || u.password !== p.password) return delay({ ok: false, error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
    return delay({ ok: true, userId: u.userId, token: u.token, name: u.name });
  }

  const user = Object.values(db.users).find(u => u.userId === p.userId && u.token === p.token);
  if (!user) return delay({ ok: false, error: '로그인이 필요합니다.' });

  if (action === 'me') {
    return delay({ ok: true, name: user.name, challengeTitle: user.challengeTitle, startDate: user.startDate, hasMissions: !!(db.missions[user.userId] && db.missions[user.userId].length === 100) });
  }
  if (action === 'extractMissions') {
    const missions = Array.from({ length: 100 }, (_, i) => MOCK_SAMPLE_MISSIONS[i % MOCK_SAMPLE_MISSIONS.length]);
    return delay({ ok: true, title: '2026. 100 Q&A Countdown', missions });
  }
  if (action === 'saveMissions') {
    db.missions[user.userId] = p.missions;
    user.challengeTitle = p.title;
    user.startDate = p.startDate;
    mockSave_(db);
    return delay({ ok: true });
  }
  if (action === 'getToday') {
    let day = mockDayIndex_(user.startDate);
    if (day < 1) day = 1;
    if (day > 100) day = 100;
    const missionText = (db.missions[user.userId] || [])[day - 1] || '';
    db.answers[user.userId] = db.answers[user.userId] || {};
    let rec = db.answers[user.userId][day];
    if (!rec) {
      // "생각할 거리"는 업로드한 카드의 그날 문항을 그대로 사용한다(AI로 새로 생성하지 않음).
      rec = { day, missionText, question: missionText, answer: '' };
      db.answers[user.userId][day] = rec;
      mockSave_(db);
    }
    return delay({ ok: true, day, totalDays: 100, missionText, question: rec.question, answered: !!rec.answer, answer: rec.answer, isMilestone: MILESTONES.indexOf(day) !== -1, challengeTitle: user.challengeTitle });
  }
  if (action === 'submitAnswer') {
    const rec = db.answers[user.userId] && db.answers[user.userId][p.day];
    if (!rec) return delay({ ok: false, error: '오늘의 질문을 먼저 불러와 주세요.' });
    rec.answer = p.answer;
    let letter = null;
    if (MILESTONES.indexOf(p.day) !== -1) {
      db.letters[user.userId] = db.letters[user.userId] || [];
      const text = `${user.name}에게,\n\nDay ${p.day}까지의 기록을 쭉 읽어봤어. "${p.answer.slice(0, 40)}" 같은 문장들을 보면서, 그때그때의 내가 참 솔직했다는 걸 느꼈어.\n\n앞으로 남은 날들도 지금처럼 하루씩 적어가 보길. 2027년의 내가 다시 편지할게.\n\n2027년의 나로부터`;
      letter = { day: p.day, text, createdAt: new Date().toISOString() };
      db.letters[user.userId].push(letter);
    }
    mockSave_(db);
    return delay({ ok: true, letterGenerated: !!letter, letter });
  }
  if (action === 'getLetters') {
    return delay({ ok: true, letters: db.letters[user.userId] || [], milestones: MILESTONES });
  }
  if (action === 'getProgress') {
    const answers = db.answers[user.userId] || {};
    const currentDay = user.startDate ? mockDayIndex_(user.startDate) : 0;
    const days = [];
    for (let d = 1; d <= 100; d++) {
      days.push({ day: d, done: !!(answers[d] && answers[d].answer), milestone: MILESTONES.indexOf(d) !== -1, isToday: d === currentDay });
    }
    const completedCount = Object.values(answers).filter(a => a.answer).length;
    return delay({ ok: true, days, currentDay, completedCount });
  }
  return delay({ ok: false, error: '알 수 없는 요청입니다.' });
}

/* ============ 공통 유틸 ============ */
const $ = id => document.getElementById(id);
function showToast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(showToast._tm);
  showToast._tm = setTimeout(() => t.classList.remove('show'), 2400);
}
function showLoading(text) { $('loadingText').textContent = text || '불러오는 중…'; $('loadingOverlay').classList.remove('hidden'); }
function hideLoading() { $('loadingOverlay').classList.add('hidden'); }

function getAuth() { try { return JSON.parse(localStorage.getItem('chal_auth') || 'null'); } catch (e) { return null; } }
function setAuth(a) { localStorage.setItem('chal_auth', JSON.stringify(a)); }
function clearAuth() { localStorage.removeItem('chal_auth'); }

function todayLabel() {
  const d = new Date();
  const dow = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${dow})`;
}

/* ============ 라우팅 ============ */
const SCREENS = ['auth', 'onboard-upload', 'onboard-edit', 'home', 'letters', 'progress'];
function showScreen(name) {
  SCREENS.forEach(s => $('screen-' + s).classList.toggle('active', s === name));
  const navRoutes = ['home', 'letters', 'progress'];
  $('bottomNav').classList.toggle('hidden', navRoutes.indexOf(name) === -1);
  if (navRoutes.indexOf(name) !== -1) {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.route === name));
  }
  window.scrollTo(0, 0);
}

async function boot() {
  const auth = getAuth();
  if (!auth) { showScreen('auth'); return; }
  showLoading('불러오는 중…');
  const res = await api('me', {});
  hideLoading();
  if (!res.ok) { clearAuth(); showScreen('auth'); return; }
  if (!res.hasMissions) { showScreen('onboard-upload'); return; }
  await enterHome();
}

/* ============ 인증 화면 ============ */
$('tabLogin').addEventListener('click', () => switchAuthTab('login'));
$('tabSignup').addEventListener('click', () => switchAuthTab('signup'));
function switchAuthTab(which) {
  $('tabLogin').classList.toggle('active', which === 'login');
  $('tabSignup').classList.toggle('active', which === 'signup');
  $('formLogin').classList.toggle('hidden', which !== 'login');
  $('formSignup').classList.toggle('hidden', which !== 'signup');
  $('authMsg').textContent = '';
}

$('formLogin').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = $('loginUsername').value.trim();
  const password = $('loginPassword').value;
  showLoading('로그인 중…');
  const res = await api('login', { username, password });
  hideLoading();
  if (!res.ok) { $('authMsg').textContent = res.error || '로그인에 실패했습니다.'; return; }
  setAuth({ userId: res.userId, token: res.token, name: res.name });
  await boot();
});

$('formSignup').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('signupName').value.trim();
  const username = $('signupUsername').value.trim();
  const password = $('signupPassword').value;
  showLoading('가입 중…');
  const res = await api('signup', { name, username, password });
  hideLoading();
  if (!res.ok) { $('authMsg').textContent = res.error || '가입에 실패했습니다.'; return; }
  setAuth({ userId: res.userId, token: res.token, name: res.name });
  await boot();
});

/* ============ 온보딩: 업로드 ============ */
let uploadedImage = null; // { base64, mimeType }

$('uploadBox').addEventListener('click', (e) => {});
$('fileInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  $('uploadLabel').textContent = '이미지 처리 중…';
  try {
    uploadedImage = await resizeImageToBase64(file);
    $('uploadPreview').src = 'data:' + uploadedImage.mimeType + ';base64,' + uploadedImage.base64;
    $('uploadPreview').classList.remove('hidden');
    $('uploadLabel').textContent = '다른 이미지 선택하기';
    $('btnExtract').disabled = false;
  } catch (err) {
    $('onboardUploadMsg').textContent = '이미지를 읽는 중 문제가 생겼어요. 다른 이미지를 시도해 주세요.';
    $('uploadLabel').textContent = '이미지 선택하기';
  }
});

function resizeImageToBase64(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      img.onerror = reject;
      img.onload = () => {
        const MAX = 1600;
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          const ratio = Math.min(MAX / width, MAX / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        resolve({ base64: dataUrl.split(',')[1], mimeType: 'image/jpeg' });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

let editMissions = [];
$('btnExtract').addEventListener('click', async () => {
  if (!uploadedImage) return;
  $('onboardUploadMsg').textContent = '';
  showLoading('카드 속 미션 100개를 읽는 중…');
  const res = await api('extractMissions', uploadedImage);
  hideLoading();
  if (!res.ok) { $('onboardUploadMsg').textContent = res.error || '인식에 실패했습니다. 다시 시도해 주세요.'; return; }
  editMissions = res.missions.slice(0, 100);
  while (editMissions.length < 100) editMissions.push('');
  $('editTitle').value = res.title || '100일 챌린지';
  $('editStartDate').value = new Date().toISOString().slice(0, 10);
  renderMissionList();
  showScreen('onboard-edit');
});

$('btnBackToUpload').addEventListener('click', () => showScreen('onboard-upload'));

function renderMissionList() {
  const wrap = $('missionList');
  wrap.innerHTML = '';
  editMissions.forEach((text, idx) => {
    const row = document.createElement('div');
    row.className = 'mission-row';
    row.innerHTML = `<span class="mission-day">Day ${idx + 1}</span><input type="text" value="${escapeAttr_(text)}">`;
    const input = row.querySelector('input');
    input.addEventListener('input', () => {
      editMissions[idx] = input.value;
      input.classList.toggle('empty', !input.value.trim());
    });
    if (!text.trim()) input.classList.add('empty');
    wrap.appendChild(row);
  });
}
function escapeAttr_(s) { return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

$('btnSaveMissions').addEventListener('click', async () => {
  const title = $('editTitle').value.trim() || '100일 챌린지';
  const startDate = $('editStartDate').value;
  if (!startDate) { $('onboardEditMsg').textContent = '시작일을 선택해 주세요.'; return; }
  const emptyIdx = editMissions.findIndex(m => !m.trim());
  if (emptyIdx !== -1) {
    $('onboardEditMsg').textContent = `Day ${emptyIdx + 1} 미션이 비어 있어요. 모두 채워 주세요.`;
    document.querySelectorAll('.mission-row input')[emptyIdx].scrollIntoView({ block: 'center' });
    return;
  }
  showLoading('저장하는 중…');
  const res = await api('saveMissions', { title, startDate, missions: editMissions });
  hideLoading();
  if (!res.ok) { $('onboardEditMsg').textContent = res.error || '저장에 실패했습니다.'; return; }
  showToast('챌린지가 시작되었어요');
  await enterHome();
});

/* ============ 홈 ============ */
async function enterHome() {
  showScreen('home');
  showLoading('오늘의 기록을 불러오는 중…');
  const res = await api('getToday', {});
  hideLoading();
  if (!res.ok) { showToast(res.error || '불러오지 못했습니다.'); return; }
  $('homeChallengeTitle').textContent = res.challengeTitle || '챌린지';
  $('homeDate').textContent = todayLabel();
  $('homeDayBadge').innerHTML = `Day ${res.day}<span>/${res.totalDays}</span>`;
  $('homeQuestionText').textContent = res.question || res.missionText || '';
  $('letterArrived').classList.add('hidden');

  if (res.answered) {
    $('answerForm').classList.add('hidden');
    $('answerDone').classList.remove('hidden');
    $('answerDoneText').textContent = res.answer;
  } else {
    $('answerForm').classList.remove('hidden');
    $('answerDone').classList.add('hidden');
    $('answerInput').value = '';
  }
  window._homeDay = res.day;
}

$('btnSubmitAnswer').addEventListener('click', async () => {
  const answer = $('answerInput').value.trim();
  if (!answer) { showToast('내용을 입력해 주세요.'); return; }
  showLoading('기록을 저장하는 중…');
  const res = await api('submitAnswer', { day: window._homeDay, answer });
  hideLoading();
  if (!res.ok) { showToast(res.error || '저장에 실패했습니다.'); return; }
  $('answerForm').classList.add('hidden');
  $('answerDone').classList.remove('hidden');
  $('answerDoneText').textContent = answer;
  if (res.letterGenerated) $('letterArrived').classList.remove('hidden');
  showToast('오늘의 기록이 저장되었어요');
});

$('btnGoLetter').addEventListener('click', () => navigate('letters'));

/* ============ 편지함 ============ */
async function enterLetters() {
  showScreen('letters');
  showLoading('편지함을 여는 중…');
  const [lettersRes, progressRes] = await Promise.all([api('getLetters', {}), api('getProgress', {})]);
  hideLoading();
  if (!lettersRes.ok) { showToast(lettersRes.error || '불러오지 못했습니다.'); return; }
  const currentDay = progressRes.ok ? progressRes.currentDay : 0;
  const byDay = {};
  lettersRes.letters.forEach(l => { byDay[l.day] = l; });

  const wrap = $('lettersWrap');
  wrap.innerHTML = '';
  MILESTONES.forEach(day => {
    const letter = byDay[day];
    const unlocked = day <= currentDay;
    const card = document.createElement('div');
    card.className = 'letter-card' + (unlocked && letter ? '' : ' locked');
    card.innerHTML = `
      <svg class="letter-icon">${unlocked && letter ? '<use href="#ic-mail"/>' : '<use href="#ic-lock"/>'}</svg>
      <div class="letter-card-body">
        <p class="letter-card-day">Day ${day}${day === 100 ? ' · 완주' : ''}</p>
        <p class="letter-card-title">${unlocked && letter ? '2027년의 나로부터' : '아직 열리지 않은 편지'}</p>
        ${unlocked && letter ? `<p class="letter-card-snippet">${escapeAttr_(letter.text.slice(0, 32))}…</p>` : ''}
      </div>`;
    if (unlocked && letter) card.addEventListener('click', () => openLetter(day, letter.text));
    wrap.appendChild(card);
  });
}

function openLetter(day, text) {
  $('letterSheetDay').textContent = `Day ${day}의 편지`;
  $('letterSheetBody').textContent = text;
  $('letterModal').classList.remove('hidden');
}
$('letterModalClose').addEventListener('click', () => $('letterModal').classList.add('hidden'));
$('letterModalBackdrop').addEventListener('click', () => $('letterModal').classList.add('hidden'));

/* ============ 진행현황 ============ */
async function enterProgress() {
  showScreen('progress');
  showLoading('진행현황을 불러오는 중…');
  const res = await api('getProgress', {});
  hideLoading();
  if (!res.ok) { showToast(res.error || '불러오지 못했습니다.'); return; }
  $('progressSummary').innerHTML = `<b>${res.completedCount}</b> / 100일 기록 완료`;
  const grid = $('progressGrid');
  grid.innerHTML = '';
  res.days.forEach(d => {
    const cell = document.createElement('div');
    cell.className = 'p-cell' + (d.done ? ' done' : '') + (d.isToday ? ' today' : '');
    cell.textContent = d.day;
    if (d.milestone) cell.insertAdjacentHTML('beforeend', '<svg class="m-icon"><use href="#ic-clover"/></svg>');
    grid.appendChild(cell);
  });
}

/* ============ 내비게이션 ============ */
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => navigate(btn.dataset.route));
});
function navigate(route) {
  if (route === 'home') return enterHome();
  if (route === 'letters') return enterLetters();
  if (route === 'progress') return enterProgress();
}

boot();
