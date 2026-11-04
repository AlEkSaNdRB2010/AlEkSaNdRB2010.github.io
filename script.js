/* ============================================================
   script.js — вся логика тренажёра «Наброски»
   ------------------------------------------------------------
   Порядок чтения:
     1. Что мы храним (состояние)
     2. Мелкие помощники
     3. Экраны и вкладки
     4. Настройка сессии
     5. Запуск тренировки
     6. Показ картинки и таймер
     7. Кнопки управления
     8. Финиш и сохранение статистики
     9. Профиль: цифры, огоньки, календарь
   ============================================================ */

/* ------------------------------------------------------------
   1. СОСТОЯНИЕ
   Один объект, в котором лежит всё «текущее»: что выбрано,
   какая картинка показана, сколько времени осталось.
   ------------------------------------------------------------ */

const CATEGORY_NAMES = {
  people: 'Люди',
  animals: 'Животные',
  faces: 'Лица',
  hands: 'Кисти рук'
};

const state = {
  categories: new Set(['people', 'animals', 'faces', 'hands']),
  count: 5,               // сколько рисунков в сессии
  secondsPerImage: 30,    // время на один рисунок
  playlist: [],           // перемешанный список картинок на сессию
  history: [],            // какие картинки уже показаны
  remainingMs: 0,         // сколько осталось до смены
  drawnMs: 0,             // сколько реально рисовали
  lastTickAt: 0,          // когда таймер «тикал» в прошлый раз
  timerId: null,          // номер интервала (чтобы можно было остановить)
  paused: false,
  inTraining: false
};

/* ------------------------------------------------------------
   2. ПОМОЩНИКИ
   ------------------------------------------------------------ */

const $ = (id) => document.getElementById(id);

// Перемешивание Фишера — Йетса.
// Важно: sort(() => Math.random() - 0.5) перемешивает плохо,
// поэтому используем правильный алгоритм.
function shuffle(array) {
  const result = array.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// 95000 мс -> "01:35"
function formatTime(ms) {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
}

// Ключ дня для статистики: "2026-10-29"
function dateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function plural(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

/* ------------------------------------------------------------
   3. ЭКРАНЫ И ВКЛАДКИ
   ------------------------------------------------------------ */

const screens = {
  setup: $('screen-setup'),
  train: $('screen-train'),
  done: $('screen-done'),
  profile: $('screen-profile')
};

function showScreen(name) {
  Object.values(screens).forEach((el) => el.classList.remove('is-active'));
  screens[name].classList.add('is-active');

  const tabName = name === 'profile' ? 'profile' : 'setup';
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.classList.toggle('is-active', tab.dataset.screen === tabName);
  });

  window.scrollTo({ top: 0, behavior: 'instant' });
}

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    if (tab.dataset.screen === 'profile') {
      stopTimer();
      calMonth = currentMonth();
      renderProfile();
      showScreen('profile');
    } else {
      showScreen(state.inTraining ? 'train' : 'setup');
    }
  });
});

/* ------------------------------------------------------------
   4. НАСТРОЙКА СЕССИИ
   ------------------------------------------------------------ */

// Категории: чекбоксы
const categoryInputs = document.querySelectorAll('#category-filter input');

function readCategories() {
  state.categories = new Set();
  categoryInputs.forEach((input) => {
    if (input.checked) state.categories.add(input.value);
  });
  updateSetupHint();
}

categoryInputs.forEach((input) => input.addEventListener('change', readCategories));

// Режимы: кнопки
const modeButtons = document.querySelectorAll('.mode');
const customPanel = $('custom-panel');
const customCount = $('custom-count');
const customSeconds = $('custom-seconds');

function selectMode(button) {
  modeButtons.forEach((b) => b.classList.remove('is-active'));
  button.classList.add('is-active');

  if (button.id === 'mode-custom') {
    customPanel.hidden = false;
    state.count = Number(customCount.value);
    state.secondsPerImage = Number(customSeconds.value);
  } else {
    customPanel.hidden = true;
    state.count = Number(button.dataset.count);
    state.secondsPerImage = Number(button.dataset.seconds);
  }
  updateSetupHint();
}

modeButtons.forEach((button) => {
  button.addEventListener('click', () => selectMode(button));
});

function readCustom() {
  state.count = Math.max(1, Math.min(50, Number(customCount.value) || 1));
  state.secondsPerImage = Number(customSeconds.value);
  updateSetupHint();
}

customCount.addEventListener('input', readCustom);
customSeconds.addEventListener('change', readCustom);

// Подсказка под кнопкой «Начать»
function updateSetupHint() {
  const hint = $('setup-hint');
  const pool = PHOTOS.filter((p) => state.categories.has(p.category));

  if (pool.length === 0) {
    hint.textContent = 'Выбери хотя бы одну категорию — иначе рисовать нечего.';
    $('start-btn').disabled = true;
    return;
  }

  $('start-btn').disabled = false;

  if (pool.length < state.count) {
    hint.textContent =
      `В выбранных категориях ${pool.length} ` +
      plural(pool.length, 'картинка', 'картинки', 'картинок') +
      `, а рисунков ${state.count} — картинки будут повторяться.`;
  } else {
    hint.textContent = '';
  }
}

/* ------------------------------------------------------------
   5. ЗАПУСК ТРЕНИРОВКИ
   ------------------------------------------------------------ */

// Собираем список на сессию: фильтруем по категориям и перемешиваем.
function buildPlaylist() {
  const pool = PHOTOS.filter((p) => state.categories.has(p.category));
  const mixed = shuffle(pool);
  const playlist = [];

  for (let i = 0; i < state.count; i++) {
    // Если картинок меньше, чем рисунков, берём по кругу.
    playlist.push(mixed[i % mixed.length]);
  }
  return playlist;
}

$('start-btn').addEventListener('click', () => {
  state.playlist = buildPlaylist();
  state.history = [];
  state.drawnMs = 0;
  state.inTraining = true;
  state.paused = false;

  showScreen('train');
  showNextPhoto();
});

/* ------------------------------------------------------------
   6. ПОКАЗ КАРТИНКИ И ТАЙМЕР
   ------------------------------------------------------------ */

const stageImg = $('stage-img');
const stageTags = $('stage-tags');
const stage = document.querySelector('.stage');
const progressFill = $('progress-fill');
const timerLabel = $('timer-label');

function showNextPhoto() {
  if (state.history.length >= state.count) {
    finishSession();
    return;
  }

  const photo = state.playlist[state.history.length];
  state.history.push(photo);
  renderPhoto(photo);
  startTimer();
}

function renderPhoto(photo) {
  stageImg.src = photo.src;
  stageImg.alt =
    'Референс: ' + (CATEGORY_NAMES[photo.category] || '') +
    (photo.tags && photo.tags.length ? ' — ' + photo.tags.join(', ') : '');

  stageTags.innerHTML = '';
  (photo.tags || []).forEach((tag) => {
    const chip = document.createElement('span');
    chip.className = 'stage-tag';
    chip.textContent = tag;
    stageTags.appendChild(chip);
  });

  // Плавная смена картинки
  stage.classList.remove('is-switching');
  void stage.offsetWidth; // хитрость, чтобы анимация запустилась заново
  stage.classList.add('is-switching');

  $('photo-index').textContent = state.history.length;
  $('photo-total').textContent = state.count;

  // Заранее загружаем следующую картинку — чтобы смена была мгновенной
  const nextPhoto = state.playlist[state.history.length];
  if (nextPhoto) {
    const img = new Image();
    img.src = nextPhoto.src;
  }
}

function startTimer() {
  stopTimer();
  state.remainingMs = state.secondsPerImage * 1000;
  state.lastTickAt = performance.now();
  state.paused = false;
  state.timerId = setInterval(tick, 100);
  updatePauseButton();
  renderTimer();
}

function stopTimer() {
  if (state.timerId !== null) {
    clearInterval(state.timerId);
    state.timerId = null;
  }
}

function tick() {
  const now = performance.now();
  // Ограничиваем шаг: если вкладка «спала», не отнимаем сразу всё время.
  const delta = Math.min(now - state.lastTickAt, 250);
  state.lastTickAt = now;

  state.remainingMs = Math.max(0, state.remainingMs - delta);
  state.drawnMs += delta;

  renderTimer();

  if (state.remainingMs === 0) {
    stopTimer();
    showNextPhoto();
  }
}

function renderTimer() {
  const left = state.remainingMs;
  timerLabel.textContent = formatTime(left);

  const percent = (left / (state.secondsPerImage * 1000)) * 100;
  progressFill.style.width = percent + '%';

  const low = left <= 5000;
  progressFill.classList.toggle('is-low', low);
  timerLabel.classList.toggle('is-low', low);
}

function updatePauseButton() {
  $('pause-btn').textContent = state.paused ? 'Продолжить' : 'Пауза';
}

/* ------------------------------------------------------------
   7. КНОПКИ УПРАВЛЕНИЯ
   ------------------------------------------------------------ */

// Пауза / продолжить
$('pause-btn').addEventListener('click', () => {
  if (state.paused) {
    state.paused = false;
    state.lastTickAt = performance.now();
    state.timerId = setInterval(tick, 100);
  } else {
    state.paused = true;
    stopTimer();
  }
  updatePauseButton();
});

// Пропустить — сразу к следующей картинке
$('next-btn').addEventListener('click', () => {
  stopTimer();
  showNextPhoto();
});

// Назад — вернуться к предыдущей картинке из истории
$('back-btn').addEventListener('click', () => {
  if (state.history.length <= 1) return;

  stopTimer();
  state.history.pop();                 // убираем текущую
  const previous = state.history[state.history.length - 1];
  renderPhoto(previous);
  startTimer();
});

// Закончить сессию досрочно
$('stop-btn').addEventListener('click', () => {
  if (confirm('Закончить тренировку?')) {
    finishSession();
  }
});

// Горячие клавиши
document.addEventListener('keydown', (event) => {
  if (!screens.train.classList.contains('is-active')) return;
  if (event.target.tagName === 'INPUT' || event.target.tagName === 'SELECT') return;

  if (event.code === 'Space') {
    event.preventDefault();
    $('pause-btn').click();
  } else if (event.code === 'ArrowRight') {
    event.preventDefault();
    $('next-btn').click();
  } else if (event.code === 'ArrowLeft') {
    event.preventDefault();
    $('back-btn').click();
  }
});

/* ------------------------------------------------------------
   8. ФИНИШ И СТАТИСТИКА
   ------------------------------------------------------------ */

const STATS_KEY = 'nabroski-stats-v1';

function loadStats() {
  try {
    const saved = JSON.parse(localStorage.getItem(STATS_KEY));
    if (saved && typeof saved === 'object') {
      return {
        sketches: saved.sketches || 0,
        ms: saved.ms || 0,
        days: saved.days || {}
      };
    }
  } catch (error) {
    // если данные битые — начинаем с чистого листа
  }
  return { sketches: 0, ms: 0, days: {} };
}

function saveStats(stats) {
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
}

function finishSession() {
  stopTimer();
  state.inTraining = false;

  const sketches = state.history.length;
  const minutes = Math.round((state.drawnMs / 60000) * 10) / 10;

  // Сохраняем в статистику
  const stats = loadStats();
  stats.sketches += sketches;
  stats.ms += state.drawnMs;

  const today = dateKey(new Date());
  stats.days[today] = (stats.days[today] || 0) + sketches;
  saveStats(stats);

  // Показываем итоги
  $('done-sketches').textContent = sketches;
  $('done-minutes').textContent = String(minutes).replace('.', ',');

  const streak = calcStreak(stats.days);
  $('done-sub').textContent = streak > 1
    ? `Ты рисуешь ${streak} ${plural(streak, 'день', 'дня', 'дней')} подряд. Так держать!`
    : 'Отличная работа. Дальше — только чаще.';

  showScreen('done');
}

$('again-btn').addEventListener('click', () => {
  showScreen('setup');
});

$('done-profile-btn').addEventListener('click', () => {
  calMonth = currentMonth();
  renderProfile();
  showScreen('profile');
});

/* ------------------------------------------------------------
   9. ПРОФИЛЬ
   ------------------------------------------------------------ */

function calcStreak(days) {
  let streak = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);

  // Если сегодня ещё не рисовали — считаем серию со вчерашнего дня
  if (!days[dateKey(cursor)]) {
    cursor.setDate(cursor.getDate() - 1);
  }

  while (days[dateKey(cursor)]) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function renderProfile() {
  const stats = loadStats();

  $('stat-sketches').textContent = stats.sketches;

  const hours = stats.ms / 3600000;
  if (stats.ms === 0) {
    $('stat-hours').textContent = '0 мин';
  } else if (stats.ms < 60000) {
    $('stat-hours').textContent = '< 1 мин';
  } else {
    $('stat-hours').textContent =
      hours >= 1 ? hours.toFixed(1).replace('.', ',') + ' ч' : Math.round(stats.ms / 60000) + ' мин';
  }

  $('stat-streak').textContent = calcStreak(stats.days);

  renderCalendar(stats.days);
}

const MONTH_NAMES = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
];

// Какой месяц сейчас открыт в календаре (первое число месяца)
function currentMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

let calMonth = currentMonth();

function renderCalendar(days) {
  const calendar = $('calendar');
  calendar.innerHTML = '';

  const year = calMonth.getFullYear();
  const month = calMonth.getMonth();

  $('cal-title').textContent = MONTH_NAMES[month] + ' ' + year;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Сколько пустых клеток перед первым числом.
  // Неделя начинается с понедельника, а getDay() считает с воскресенья.
  const firstDay = new Date(year, month, 1);
  const offset = (firstDay.getDay() + 6) % 7;

  for (let i = 0; i < offset; i++) {
    const blank = document.createElement('div');
    blank.className = 'cal-cell is-blank';
    calendar.appendChild(blank);
  }

  // День 0 следующего месяца — это последний день текущего
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  for (let d = 1; d <= daysInMonth; d++) {
    const day = new Date(year, month, d);
    const count = days[dateKey(day)] || 0;

    let level = 0;
    if (count >= 6) level = 3;
    else if (count >= 3) level = 2;
    else if (count >= 1) level = 1;

    const cell = document.createElement('div');
    cell.className = 'cal-cell lvl-' + level;
    cell.textContent = d;
    if (day.getTime() === today.getTime()) cell.classList.add('is-today');
    if (day > today) cell.classList.add('is-future');

    cell.title = count > 0
      ? `${d}.${month + 1}.${year}: ${count} ${plural(count, 'набросок', 'наброска', 'набросков')}`
      : `${d}.${month + 1}.${year}: тренировки не было`;

    calendar.appendChild(cell);
  }

  // Дальше текущего месяца листать незачем
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth();
  $('cal-next').disabled = isCurrentMonth;
  $('cal-today').disabled = isCurrentMonth;
}

$('cal-prev').addEventListener('click', () => {
  calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1);
  renderCalendar(loadStats().days);
});

$('cal-next').addEventListener('click', () => {
  calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1);
  renderCalendar(loadStats().days);
});

$('cal-today').addEventListener('click', () => {
  calMonth = currentMonth();
  renderCalendar(loadStats().days);
});

// Сброс прогресса
$('reset-btn').addEventListener('click', () => {
  if (confirm('Удалить всю статистику? Это нельзя отменить.')) {
    localStorage.removeItem(STATS_KEY);
    renderProfile();
  }
});

/* ------------------------------------------------------------
   СТАРТ: показываем настройку и подсказку
   ------------------------------------------------------------ */
readCategories();
renderProfile();
