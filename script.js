// 줄넘기 주사위 - 순수 JavaScript (외부 라이브러리, 외부 전송, 저장 기능 없음)

// ===== 바꾸기 쉬운 설정값 =====
const GOAL_SUM = 30;            // 숫자 주사위: 성공 목표 (이 숫자 이상이면 성공)
const TIME_LIMIT_SEC = 180;     // 숫자 주사위: 제한 시간 (초) = 3분
const MISSION_COUNT = 30;       // 미션 주사위: 채울 횟수
const MISSIONS = [
  "왼발로만 뛰기",
  "오른발로만 뛰기",
  "거꾸로 뛰기",
  "좌우 벌려 뛰기",
  "앞뒤 벌려 뛰기",
  "그냥 뛰기",
];
const MISSION_POPUP_MS = 3000;  // 미션 안내 팝업이 떠 있는 시간 (3초)
const ROLL_MS = 900;            // 주사위가 굴러가는 시간

// ===== 공통 도우미 =====
const $ = (id) => document.getElementById(id);
const randomInt = (n) => Math.floor(Math.random() * n);

// 화면 안 확인 창 (브라우저 confirm 대신)
function askConfirm(message) {
  return new Promise((resolve) => {
    $("confirm-text").textContent = message;
    $("confirm").hidden = false;
    const done = (answer) => {
      $("confirm").hidden = true;
      $("confirm-yes").onclick = null;
      $("confirm-no").onclick = null;
      resolve(answer);
    };
    $("confirm-yes").onclick = () => done(true);
    $("confirm-no").onclick = () => done(false);
  });
}

// 팝업: autoCloseMs가 있으면 그 시간 뒤 자동으로 닫힘, 없으면 확인 버튼으로 닫음
let popupTimer = null;
function showPopup({ title = "", text = "", kind = "", autoCloseMs = 0 }) {
  clearTimeout(popupTimer);
  const box = $("popup-box");
  box.className = "popup-box" + (kind ? " is-" + kind : "");
  $("popup-title").textContent = title;
  $("popup-title").hidden = !title;
  $("popup-text").textContent = text;
  $("popup-close").hidden = autoCloseMs > 0;
  $("popup").hidden = false;
  if (autoCloseMs > 0) popupTimer = setTimeout(hidePopup, autoCloseMs);
}
function hidePopup() {
  clearTimeout(popupTimer);
  $("popup").hidden = true;
}
$("popup-close").addEventListener("click", hidePopup);

// ===== 효과음 (Web Audio API로 코드에서 직접 만든 소리, 외부 음원 파일 없음) =====
const Sound = {
  ctx: null,
  on: true,
  // 브라우저는 사용자가 버튼을 누른 뒤에만 소리를 낼 수 있어서, 첫 클릭 때 준비함
  get() {
    if (!this.on) return null;
    try {
      if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state === "suspended") this.ctx.resume();
      return this.ctx;
    } catch (e) {
      return null;
    }
  },
  // 짧은 음 하나: 주파수(Hz), 시작 지연(초), 길이(초), 크기, 파형
  tone(freq, delay = 0, dur = 0.15, vol = 0.2, type = "sine") {
    const ctx = this.get();
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  },
  // 주사위가 구르는 '딸깍' 소리 (짧은 잡음)
  rollClick() {
    const ctx = this.get();
    if (!ctx) return;
    const len = Math.floor(ctx.sampleRate * 0.03);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1800 + Math.random() * 1200;
    const gain = ctx.createGain();
    gain.gain.value = 0.5;
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start();
  },
  // 주사위 결과가 정해졌을 때 '딩동' 당첨 소리
  result() {
    this.tone(784, 0, 0.18, 0.22, "triangle");   // 솔
    this.tone(1047, 0.12, 0.35, 0.22, "triangle"); // 높은 도
  },
  // 성공 소리 (도-미-솔-도 올라가는 음)
  success() {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, i * 0.13, 0.3, 0.22, "triangle"));
    this.tone(1047, 0.55, 0.7, 0.18, "sine");
  },
  // 실패·시간 종료 소리 (낮게 내려가는 두 음)
  fail() {
    this.tone(392, 0, 0.3, 0.2, "triangle");
    this.tone(294, 0.25, 0.5, 0.2, "triangle");
  },
  // 시계 '똑딱' 소리: 마지막 10초는 더 높은 소리
  tick(urgent) {
    this.tone(urgent ? 1500 : 1000, 0, 0.05, urgent ? 0.25 : 0.12, "square");
  },
};

function updateSoundButton() {
  const btn = $("btn-sound");
  btn.textContent = Sound.on ? "소리 켜짐" : "소리 꺼짐";
  btn.setAttribute("aria-pressed", Sound.on ? "true" : "false");
  btn.classList.toggle("is-off", !Sound.on);
}
$("btn-sound").addEventListener("click", () => {
  Sound.on = !Sound.on;
  updateSoundButton();
});
updateSoundButton();

// ===== 탭 전환 =====
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    const name = tab.dataset.tab;
    document.querySelectorAll(".tab").forEach((t) => {
      const on = t === tab;
      t.classList.toggle("is-active", on);
      t.setAttribute("aria-selected", on ? "true" : "false");
    });
    // 패널은 숨기기만 하므로 다른 탭의 기록과 타이머는 그대로 유지됨
    $("panel-number").hidden = name !== "number";
    $("panel-mission").hidden = name !== "mission";
  });
});

// ===== 탭 1: 숫자 주사위 =====
// 주사위 눈 위치 (3x3 칸 중 0~8번 칸)
const PIP_LAYOUT = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

const numberState = {
  running: false,
  finished: false,
  rolling: false,
  sum: 0,
  endAt: 0,
  tickId: null,
  lastTickSec: null,
  history: [],
};

function drawDie(value) {
  const die = $("number-die");
  die.innerHTML = "";
  const on = PIP_LAYOUT[value] || [];
  for (let i = 0; i < 9; i++) {
    const pip = document.createElement("span");
    pip.className = "pip" + (on.includes(i) ? "" : " is-off");
    die.appendChild(pip);
  }
  die.setAttribute("aria-label", value ? "주사위 " + value : "주사위");
}

function formatTime(sec) {
  const s = Math.max(0, Math.ceil(sec));
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}

function renderNumber() {
  $("sum").textContent = numberState.sum;
  $("goal").textContent = GOAL_SUM;
  const ratio = Math.min(1, numberState.sum / GOAL_SUM);
  $("progress-bar").style.width = ratio * 100 + "%";
  $("progress-bar").classList.toggle("is-done", numberState.sum >= GOAL_SUM);

  $("btn-start").disabled = numberState.running || numberState.finished;
  // 목표에 도달하면 굴리기 버튼은 끄고 정지 버튼만 남김
  const reachedGoal = numberState.sum >= GOAL_SUM;
  $("btn-roll").disabled = !numberState.running || numberState.rolling || reachedGoal;
  $("btn-stop").disabled = !numberState.running || numberState.rolling;

  const list = $("history");
  list.innerHTML = "";
  numberState.history.forEach((h) => {
    const li = document.createElement("li");
    li.textContent = h;
    list.appendChild(li);
  });
}

function updateTimer() {
  const left = numberState.running
    ? (numberState.endAt - Date.now()) / 1000
    : (numberState.finished ? 0 : TIME_LIMIT_SEC);
  $("timer").textContent = formatTime(left);
  // 1초가 지날 때마다 시계 소리
  if (numberState.running && left > 0) {
    const sec = Math.ceil(left);
    if (numberState.lastTickSec !== null && sec !== numberState.lastTickSec) Sound.tick(sec <= 10);
    numberState.lastTickSec = sec;
  }
  $("timer").classList.toggle("is-warning", numberState.running && left <= 30);
  if (numberState.running && left <= 0) finishNumber("timeout");
}

function startNumber() {
  if (numberState.running || numberState.finished) return;
  numberState.running = true;
  numberState.endAt = Date.now() + TIME_LIMIT_SEC * 1000;
  numberState.lastTickSec = null;
  Sound.get(); // 첫 클릭에서 소리 준비
  numberState.tickId = setInterval(updateTimer, 200);
  $("last-roll").textContent = "주사위를 굴리세요";
  $("last-roll").classList.remove("is-goal");
  updateTimer();
  renderNumber();
}

function rollNumber() {
  if (!numberState.running || numberState.rolling || numberState.sum >= GOAL_SUM) return;
  numberState.rolling = true;
  renderNumber();
  const die = $("number-die");
  die.classList.add("is-rolling");
  const spin = setInterval(() => { drawDie(randomInt(6) + 1); Sound.rollClick(); }, 90);

  setTimeout(() => {
    clearInterval(spin);
    die.classList.remove("is-rolling");
    numberState.rolling = false;
    if (!numberState.running) { renderNumber(); return; } // 굴리는 도중 시간이 끝난 경우

    const value = randomInt(6) + 1;
    drawDie(value);
    Sound.result();
    numberState.sum += value;
    numberState.history.push(value);

    const msg = $("last-roll");
    if (numberState.sum >= GOAL_SUM) {
      msg.textContent = value + "번! 목표 달성. 돌아오면 정지를 누르세요";
      msg.classList.add("is-goal");
    } else {
      msg.textContent = value + "번 뛰고 오세요";
      msg.classList.remove("is-goal");
    }
    renderNumber();
  }, ROLL_MS);
}

function finishNumber(reason) {
  if (!numberState.running) return;
  numberState.running = false;
  numberState.finished = true;
  clearInterval(numberState.tickId);
  const success = reason === "stop" && numberState.sum >= GOAL_SUM;
  updateTimer();
  renderNumber();

  if (success) {
    const leftSec = Math.max(0, Math.ceil((numberState.endAt - Date.now()) / 1000));
    showPopup({
      title: "성공",
      text: "누적 " + numberState.sum + "번, " + formatTime(leftSec) + " 남기고 들어왔어요",
      kind: "success",
    });
    Sound.success();
  } else if (reason === "timeout") {
    showPopup({ title: "시간 종료", text: "3분이 지났어요. 다시 도전해 봐요", kind: "fail" });
    Sound.fail();
  } else {
    showPopup({
      title: "아쉬워요",
      text: "누적 " + numberState.sum + "번. 목표 " + GOAL_SUM + "번까지 " + (GOAL_SUM - numberState.sum) + "번 남았어요",
      kind: "fail",
    });
    Sound.fail();
  }
  $("last-roll").textContent = "처음부터 다시를 누르면 새로 도전할 수 있어요";
  $("last-roll").classList.remove("is-goal");
}

function resetNumber() {
  clearInterval(numberState.tickId);
  Object.assign(numberState, {
    running: false, finished: false, rolling: false,
    sum: 0, endAt: 0, tickId: null, history: [],
  });
  drawDie(1);
  $("last-roll").textContent = "시작 버튼을 누르세요";
  $("last-roll").classList.remove("is-goal");
  updateTimer();
  renderNumber();
}

$("btn-start").addEventListener("click", startNumber);
$("btn-roll").addEventListener("click", rollNumber);
$("btn-stop").addEventListener("click", async () => {
  if (numberState.sum < GOAL_SUM) {
    const ok = await askConfirm("아직 " + GOAL_SUM + "번이 안 됐어요. 그래도 정지할까요?");
    if (!ok) return;
  }
  finishNumber("stop");
});
$("btn-reset").addEventListener("click", async () => {
  const busy = numberState.running || numberState.history.length > 0;
  if (busy && !(await askConfirm("지금 기록을 지우고 처음부터 다시 할까요?"))) return;
  resetNumber();
});

// ===== 탭 2: 미션 주사위 =====
const missionState = { rolling: false, picked: -1 };

function renderMissionList() {
  const list = $("mission-list");
  list.innerHTML = "";
  MISSIONS.forEach((m, i) => {
    const li = document.createElement("li");
    li.textContent = m;
    if (i === missionState.picked) li.classList.add("is-picked");
    list.appendChild(li);
  });
}

function rollMission() {
  if (missionState.rolling) return;
  missionState.rolling = true;
  $("btn-mission-roll").disabled = true;
  const die = $("mission-die");
  die.classList.remove("is-picked");
  die.classList.add("is-rolling");
  $("mission-hint").textContent = "주사위를 굴리는 중...";
  let shown = randomInt(MISSIONS.length);
  const spin = setInterval(() => {
    shown = (shown + 1 + randomInt(MISSIONS.length - 1)) % MISSIONS.length;
    $("mission-text").textContent = MISSIONS[shown];
    Sound.rollClick();
  }, 110);

  setTimeout(() => {
    clearInterval(spin);
    die.classList.remove("is-rolling");
    const pick = randomInt(MISSIONS.length);
    missionState.picked = pick;
    const mission = MISSIONS[pick];
    $("mission-text").textContent = mission;
    die.classList.add("is-picked");
    Sound.result();
    $("mission-hint").textContent = mission + "로 " + MISSION_COUNT + "회를 채우고 선생님께 확인받으세요";
    renderMissionList();

    showPopup({
      text: mission + "로 " + MISSION_COUNT + "회를 채우고 선생님께 확인받으세요",
      kind: "mission",
      autoCloseMs: MISSION_POPUP_MS,
    });
    setTimeout(() => {
      missionState.rolling = false;
      $("btn-mission-roll").disabled = false;
    }, MISSION_POPUP_MS);
  }, ROLL_MS);
}

$("btn-mission-roll").addEventListener("click", rollMission);

// 예전 버전에서 저장했던 학생 이름이 브라우저에 남아 있다면 지움
try { localStorage.removeItem("jumpRopeDice.names"); } catch (e) { /* 저장소를 쓸 수 없는 환경 */ }

// ===== 처음 화면 그리기 =====
drawDie(1);
updateTimer();
renderNumber();
renderMissionList();
