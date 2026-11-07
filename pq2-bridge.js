(function () {
  'use strict';

  const ADMIN_LOGIN = '9ноября';
  const ADMIN_PASSWORD = '9ноября';

  const MODE_KEY = 'pq2_mode';
  const PROG_KEY = 'pq2_progress_v1';
  const AUTH_KEY = 'pq2_auth_session';

  const GAME_FILE = 'pokemon-test/index.html';
  const MEDIA = 'media/';

  const FRAGMENT_IDS = ['47', '08', '93', '22', '61', '15', '84', '03'];

  const TARGETS = {
    start: {
      kind: 'intro',
      name: 'Старт',
      video: MEDIA + 'start.mp4'
    },

    '47': {
      kind: 'fragment',
      name: 'Фрагмент 47',
      video: MEDIA + 'c1.mp4',
      difficulty: 'easy'
    },

    '08': {
      kind: 'fragment',
      name: 'Фрагмент 08',
      video: MEDIA + 'c2.mp4',
      difficulty: 'easy'
    },

    '93': {
      kind: 'fragment',
      name: 'Фрагмент 93',
      video: MEDIA + 'c3.mp4',
      difficulty: 'normal'
    },

    '22': {
      kind: 'fragment',
      name: 'Фрагмент 22',
      video: MEDIA + 'c4.mp4',
      difficulty: 'normal'
    },

    '61': {
      kind: 'fragment',
      name: 'Фрагмент 61',
      video: MEDIA + 'c5.mp4',
      difficulty: 'normal'
    },

    '15': {
      kind: 'fragment',
      name: 'Фрагмент 15',
      video: MEDIA + 'c6.mp4',
      difficulty: 'normal'
    },

    '84': {
      kind: 'fragment',
      name: 'Фрагмент 84',
      video: MEDIA + 'c7.mp4',
      difficulty: 'hard'
    },

    '03': {
      kind: 'fragment',
      name: 'Фрагмент 03',
      video: MEDIA + 'c8.mp4',
      difficulty: 'hard'
    },

    alexey: {
      kind: 'child',
      name: 'Лёша',
      locked: MEDIA + 'alexey-locked.mp4',
      unlocked: MEDIA + 'alexey-unlocked.mp4',
      difficulty: 'normal'
    },

    polina: {
      kind: 'child',
      name: 'Полина',
      locked: MEDIA + 'polina-locked.mp4',
      unlocked: MEDIA + 'polina-unlocked.mp4',
      difficulty: 'hard'
    },

    pillow: {
      kind: 'checkpoint',
      name: 'Подушка'
    },

    love: {
      kind: 'boss',
      name: 'Главный сюрприз',
      video: MEDIA + 'love.mp4',
      difficulty: 'legendary'
    }
  };

  let activeCode = null;
  let gameOverlay = null;
  let videoCallback = null;
  let modalCallback = null;
  let guardTimer = null;
  let mutationObserver = null;

  function $(id) {
    return document.getElementById(id);
  }

  function normAuth(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/ё/g, 'е');
  }

  function isGameMode() {
    try {
      return localStorage.getItem(MODE_KEY) === 'game';
    } catch (e) {
      return false;
    }
  }

  function defaultProgress() {
    return {
      started: false,
      caught: {},
      puzzleDone: false,
      mapSeen: false,
      alexeyDone: false,
      polinaDone: false,
      pillowChecked: false,
      loveDone: false
    };
  }

  function loadProgress() {
    try {
      const raw = localStorage.getItem(PROG_KEY);
      if (!raw) return defaultProgress();

      const parsed = JSON.parse(raw);
      const d = defaultProgress();

      return {
        ...d,
        ...parsed,
        caught: { ...(parsed.caught || {}) }
      };
    } catch (e) {
      return defaultProgress();
    }
  }

  function saveProgress(progress) {
    try {
      localStorage.setItem(PROG_KEY, JSON.stringify(progress));
    } catch (e) {}
  }

  function allFragmentsCaught(progress) {
    return FRAGMENT_IDS.every(function (id) {
      return !!progress.caught[id];
    });
  }

  function isDone(progress, code) {
    if (code === 'start') return !!progress.started;

    const target = TARGETS[code];
    if (!target) return false;

    if (target.kind === 'fragment') return !!progress.caught[code];
    if (code === 'alexey') return !!progress.alexeyDone;
    if (code === 'polina') return !!progress.polinaDone;
    if (code === 'pillow') return !!progress.pillowChecked;
    if (code === 'love') return !!progress.loveDone;

    return false;
  }

  function isUnlocked(progress, code) {
    if (code === 'start') return true;

    const target = TARGETS[code];
    if (!target) return false;

    if (target.kind === 'fragment') return true;

    if (code === 'alexey') return !!progress.puzzleDone;
    if (code === 'polina') return !!progress.alexeyDone;
    if (code === 'pillow') return !!progress.polinaDone;
    if (code === 'love') return !!progress.pillowChecked;

    return false;
  }

  function markDone(progress, code) {
    if (code === 'start') {
      progress.started = true;
      return;
    }

    const target = TARGETS[code];
    if (!target) return;

    if (target.kind === 'fragment') {
      progress.caught[code] = true;
    }

    if (code === 'alexey') progress.alexeyDone = true;
    if (code === 'polina') progress.polinaDone = true;
    if (code === 'pillow') progress.pillowChecked = true;
    if (code === 'love') progress.loveDone = true;
  }

  function normalizeCode(value) {
    const s = String(value || '').trim().toLowerCase();
    if (!s) return '';

    if (/^[0-9]{1,2}$/.test(s)) return s.padStart(2, '0');
    if (/^[0-9]{3,}$/.test(s)) return s.slice(-2);

    return s;
  }

  function getCodeFromUrl() {
    const u = new URL(location.href);

    let code =
      u.searchParams.get('code') ||
      u.searchParams.get('c') ||
      u.searchParams.get('id') ||
      u.searchParams.get('fragment') ||
      u.searchParams.get('target');

    const hash = decodeURIComponent(u.hash.replace(/^#/, ''));

    if (!code) {
      const m = hash.match(/(?:^|[&#])(?:code|c|fragment|target)=([0-9a-z]+)/i);
      if (m) code = m[1];
    }

    if (!code && hash) {
      code = hash;
    }

    return normalizeCode(code);
  }

  function ensureStyles() {
    if ($('pq2-bridge-style')) return;

    const style = document.createElement('style');
    style.id = 'pq2-bridge-style';
    style.textContent = `
      #pq2-game-overlay {
        position: fixed;
        inset: 0;
        z-index: 2147483646;
        background: #030814;
      }

      #pq2-game-frame {
        width: 100%;
        height: 100%;
        border: 0;
        display: block;
      }

      #pq2-video-layer {
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        display: none;
        align-items: center;
        justify-content: center;
        padding: 12px;
        background: rgba(0,0,0,.95);
        color: #fff;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      }

      #pq2-video-layer.open {
        display: flex;
      }

      #pq2-video-shell {
        width: min(960px, 100%);
      }

      #pq2-video-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 10px;
      }

      #pq2-video-title {
        font-size: 18px;
        font-weight: 900;
      }

      #pq2-video-close {
        border: none;
        border-radius: 14px;
        padding: 12px 16px;
        font-weight: 900;
        cursor: pointer;
        background: #4a90e2;
        color: #fff;
      }

      #pq2-video-player {
        width: 100%;
        max-height: 72vh;
        background: #000;
        border-radius: 16px;
        display: block;
      }

      #pq2-video-note {
        margin-top: 10px;
        opacity: .75;
        font-size: 14px;
        display: none;
      }

      #pq2-modal-layer {
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 14px;
        background: rgba(2,6,15,.88);
        backdrop-filter: blur(14px);
        color: #fff;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      }

      #pq2-modal-sheet {
        width: min(560px, 100%);
        border-radius: 24px;
        border: 1px solid rgba(255,255,255,.16);
        background: linear-gradient(160deg, rgba(20,35,70,.97), rgba(8,14,28,.99));
        padding: 18px;
        box-shadow: 0 24px 80px rgba(0,0,0,.48);
        max-height: 90vh;
        overflow: auto;
      }

      #pq2-modal-title {
        margin: 0 0 12px;
        font-size: 20px;
      }

      #pq2-modal-body {
        opacity: .9;
        line-height: 1.45;
      }

      #pq2-modal-actions {
        margin-top: 16px;
        display: flex;
        gap: 10px;
        justify-content: flex-end;
        flex-wrap: wrap;
      }

      .pq2-modal-btn {
        border: none;
        border-radius: 14px;
        padding: 12px 16px;
        font-weight: 900;
        cursor: pointer;
        color: #fff;
        background: rgba(255,255,255,.12);
      }

      .pq2-modal-btn.primary {
        background: #4a90e2;
      }

      .pq2-admin-input {
        width: 100%;
        border-radius: 14px;
        border: 1px solid rgba(255,255,255,.18);
        background: rgba(255,255,255,.08);
        color: #fff;
        padding: 12px 14px;
        outline: none;
        font: inherit;
        margin-bottom: 10px;
      }

      .pq2-admin-error {
        color: #ff8fa3;
        font-weight: 900;
        min-height: 20px;
        margin-bottom: 10px;
      }
    `;

    document.head.appendChild(style);
  }

  function closeModal() {
    const layer = $('pq2-modal-layer');
    if (layer) layer.remove();
    modalCallback = null;
  }

  function showModal(title, bodyHtml, confirmText, onConfirm) {
    ensureStyles();
    closeModal();

    const layer = document.createElement('div');
    layer.id = 'pq2-modal-layer';

    layer.innerHTML = `
      <div id="pq2-modal-sheet">
        <h3 id="pq2-modal-title">${title || ''}</h3>
        <div id="pq2-modal-body">${bodyHtml || ''}</div>
        <div id="pq2-modal-actions">
          <button id="pq2-modal-close" class="pq2-modal-btn">Закрыть</button>
          ${confirmText ? `<button id="pq2-modal-confirm" class="pq2-modal-btn primary">${confirmText}</button>` : ''}
        </div>
      </div>
    `;

    document.body.appendChild(layer);

    layer.addEventListener('click', function (e) {
      if (e.target === layer) closeModal();
    });

    $('pq2-modal-close').addEventListener('click', closeModal);

    if (confirmText) {
      modalCallback = onConfirm || null;
      $('pq2-modal-confirm').addEventListener('click', function () {
        const cb = modalCallback;
        closeModal();
        if (cb) cb();
      });
    } else {
      const confirmBtn = $('pq2-modal-confirm');
      if (confirmBtn) confirmBtn.style.display = 'none';
    }
  }

  function openLogin() {
    try {
      if (sessionStorage.getItem(AUTH_KEY) === '1') {
        openPanel();
        return;
      }
    } catch (e) {}

    ensureStyles();
    closeModal();

    const layer = document.createElement('div');
    layer.id = 'pq2-modal-layer';

    layer.innerHTML = `
      <div id="pq2-modal-sheet">
        <h3 id="pq2-modal-title">Вход в админ-панель</h3>
        <div id="pq2-modal-body">
          <form id="pq2-login-form">
            <input id="pq2-login-user" class="pq2-admin-input" placeholder="Логин" autocomplete="off">
            <input id="pq2-login-pass" class="pq2-admin-input" type="password" placeholder="Пароль" autocomplete="off">
            <div id="pq2-login-error" class="pq2-admin-error"></div>
            <div id="pq2-modal-actions">
              <button type="button" id="pq2-login-close" class="pq2-modal-btn">Закрыть</button>
              <button type="submit" class="pq2-modal-btn primary">Войти</button>
            </div>
          </form>
        </div>
      </div>
    `;

    document.body.appendChild(layer);

    layer.addEventListener('click', function (e) {
      if (e.target === layer) closeModal();
    });

    $('pq2-login-close').addEventListener('click', closeModal);

    $('pq2-login-form').addEventListener('submit', function (e) {
      e.preventDefault();

      const login = normAuth($('pq2-login-user').value);
      const pass = normAuth($('pq2-login-pass').value);

      if (login === normAuth(ADMIN_LOGIN) && pass === normAuth(ADMIN_PASSWORD)) {
        try {
          sessionStorage.setItem(AUTH_KEY, '1');
        } catch (err) {}

        closeModal();
        openPanel();
      } else {
        $('pq2-login-error').textContent = 'Неверный логин или пароль';
      }
    });

    setTimeout(function () {
      const first = $('pq2-login-user');
      if (first) first.focus();
    }, 80);
  }

  function openPanel() {
    const progress = loadProgress();
    const modeOn = isGameMode();
    const caughtCount = Object.keys(progress.caught || {}).length;

    const body = `
      <p>Текущий режим: <b>${modeOn ? 'Pokémon GO' : 'обычный квест'}</b></p>
      <p>Фрагментов собрано: <b>${caughtCount}/8</b></p>
      <p>Пазл: <b>${progress.puzzleDone ? 'собран' : 'не собран'}</b></p>
      <p>Лёша: <b>${progress.alexeyDone ? 'пройден' : 'не пройден'}</b></p>
      <p>Полина: <b>${progress.polinaDone ? 'пройдена' : 'не пройдена'}</b></p>
      <p>Подушка: <b>${progress.pillowChecked ? 'проверена' : 'не проверена'}</b></p>
      <p>Финал: <b>${progress.loveDone ? 'пройден' : 'не пройден'}</b></p>

      <div style="display:grid;gap:8px;margin-top:12px;">
        <button class="pq2-modal-btn primary" data-act="enable">Включить Pokémon GO</button>
        <button class="pq2-modal-btn" data-act="disable">Выключить / обычный режим</button>
        <button class="pq2-modal-btn" data-act="reset">Сбросить прогресс игры</button>
        <button class="pq2-modal-btn" data-act="test">Тест: открыть игру отдельно</button>
      </div>
    `;

    showModal('Админ-панель квеста', body, null, null);

    const layer = $('pq2-modal-layer');
    if (!layer) return;

    layer.querySelectorAll('[data-act]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        handleAdminAction(btn.dataset.act);
      });
    });
  }

  function handleAdminAction(action) {
    if (action === 'enable') {
      localStorage.setItem(MODE_KEY, 'game');
      location.reload();
      return;
    }

    if (action === 'disable') {
      localStorage.removeItem(MODE_KEY);
      location.reload();
      return;
    }

    if (action === 'reset') {
      localStorage.removeItem(PROG_KEY);
      alert('Игровой прогресс сброшен.');
      location.reload();
      return;
    }

    if (action === 'test') {
      closeModal();
      const url =
        GAME_FILE +
        '?target=47' +
        '&difficulty=easy' +
        '&embed=1' +
        '&origin=' + encodeURIComponent(location.origin);

      window.open(url, '_blank');
    }
  }

  function ensureVideoLayer() {
    if ($('pq2-video-layer')) return;

    ensureStyles();

    const layer = document.createElement('div');
    layer.id = 'pq2-video-layer';

    layer.innerHTML = `
      <div id="pq2-video-shell">
        <div id="pq2-video-head">
          <b id="pq2-video-title"></b>
          <button id="pq2-video-close">Закрыть</button>
        </div>
        <video id="pq2-video-player" controls playsinline data-pq2="bridge"></video>
        <div id="pq2-video-note"></div>
      </div>
    `;

    document.body.appendChild(layer);

    $('pq2-video-close').addEventListener('click', closeVideo);
  }

  function playBridgeVideo(src, title, onClose) {
    if (!src) {
      if (onClose) onClose();
      return;
    }

    ensureVideoLayer();

    const layer = $('pq2-video-layer');
    const player = $('pq2-video-player');
    const titleEl = $('pq2-video-title');
    const noteEl = $('pq2-video-note');

    videoCallback = onClose || null;

    titleEl.textContent = title || '';
    noteEl.style.display = 'none';
    noteEl.textContent = '';

    player.src = src;
    player.currentTime = 0;
    player.load();

    layer.classList.add('open');

    player.play().catch(function () {});

    player.onerror = function () {
      noteEl.style.display = 'block';
      noteEl.textContent = 'Не удалось загрузить видео: ' + src;
    };

    player.onended = function () {
      setTimeout(closeVideo, 500);
    };
  }

  function closeVideo() {
    const layer = $('pq2-video-layer');
    const player = $('pq2-video-player');

    if (player) {
      player.pause();
      player.onended = null;
      player.onerror = null;
      player.removeAttribute('src');
      player.load();
    }

    if (layer) {
      layer.classList.remove('open');
    }

    const cb = videoCallback;
    videoCallback = null;

    if (cb) cb();
  }

  function closeGame() {
    if (gameOverlay) {
      gameOverlay.remove();
      gameOverlay = null;
    }

    activeCode = null;
  }

  function openGame(code) {
    const target = TARGETS[code];
    if (!target) return;

    ensureStyles();
    closeGame();

    activeCode = code;

    const src =
      GAME_FILE +
      '?target=' + encodeURIComponent(code) +
      '&difficulty=' + encodeURIComponent(target.difficulty || 'normal') +
      '&embed=1' +
      '&origin=' + encodeURIComponent(location.origin);

    gameOverlay = document.createElement('div');
    gameOverlay.id = 'pq2-game-overlay';

    gameOverlay.innerHTML =
      '<iframe id="pq2-game-frame" src="' + src + '" allow="autoplay; encrypted-media; fullscreen; vibrate"></iframe>';

    document.body.appendChild(gameOverlay);
  }

  function afterStep(code) {
    const progress = loadProgress();

    if (allFragmentsCaught(progress) && !progress.puzzleDone) {
      progress.puzzleDone = true;
      saveProgress(progress);

      playBridgeVideo(MEDIA + 'map.mp4', 'Радар активирован', function () {
        progress.mapSeen = true;
        saveProgress(progress);

        showModal(
          'Дети на связи',
          'Пазл собран!<br>Теперь нужно найти Лёшу.<br><br>Отсканируй его QR или открой: <b>#alexey</b>'
        );
      });

      return;
    }

    if (code === 'alexey') {
      showModal(
        'Лёша пройден',
        'Теперь доступна Полина.<br>Отсканируй её QR или открой: <b>#polina</b>'
      );
      return;
    }

    if (code === 'polina') {
      showModal(
        'Полина пройдена',
        'Теперь проверь подушку.<br>Открой: <b>#pillow</b>'
      );
      return;
    }

    if (code === 'love') {
      showModal(
        '🏆 Тренировка завершена',
        '<div style="text-align:center;">' +
          '<div style="font-size:72px;line-height:1;">❤️</div>' +
          '<p style="margin-top:12px;">Ты прошла весь квест. Главный сюрприз открыт.</p>' +
        '</div>'
      );
      return;
    }

    if (TARGETS[code] && TARGETS[code].kind === 'fragment') {
      showModal(
        'Фрагмент получен',
        'Отлично! Продолжай искать следующие подарки.'
      );
    }
  }

  function completeTarget(code, perfect) {
    const progress = loadProgress();
    markDone(progress, code);
    saveProgress(progress);

    closeGame();

    const oldVideo = $('pq2-video-layer');
    if (oldVideo && oldVideo.classList.contains('open')) {
      videoCallback = null;
      closeVideo();
    }

    const target = TARGETS[code];
    const src = target.unlocked || target.video;

    if (src) {
      playBridgeVideo(src, target.name, function () {
        afterStep(code);
      });
    } else {
      afterStep(code);
    }
  }

  function replayTarget(code) {
    const target = TARGETS[code];
    if (!target) return;

    const src = target.unlocked || target.video;

    if (src) {
      playBridgeVideo(src, target.name, function () {
        showModal(target.name, 'Этот шаг уже пройден.');
      });
    } else {
      showModal(target.name, 'Этот шаг уже пройден.');
    }
  }

  function lockedTarget(code) {
    const target = TARGETS[code];
    if (!target) return;

    if (target.locked) {
      playBridgeVideo(target.locked, target.name + ' — пока закрыто', function () {
        showModal(
          'Закрыто',
          'Сначала нужно выполнить предыдущие шаги квеста.'
        );
      });
    } else {
      showModal(
        'Закрыто',
        'Этот шаг ещё недоступен. Сначала собери нужные фрагменты.'
      );
    }
  }

  function route() {
    if (!isGameMode()) {
      closeGame();
      return;
    }

    const videoLayer = $('pq2-video-layer');
    if (videoLayer && videoLayer.classList.contains('open')) return;

    const code = getCodeFromUrl();

    if (!code) {
      closeGame();
      return;
    }

    if (!TARGETS[code]) return;

    if (activeCode === code && gameOverlay) return;

    const progress = loadProgress();

    if (isDone(progress, code)) {
      replayTarget(code);
      return;
    }

    if (!isUnlocked(progress, code)) {
      lockedTarget(code);
      return;
    }

    if (code === 'start') {
      playBridgeVideo(TARGETS.start.video, 'Старт', function () {
        const p = loadProgress();
        p.started = true;
        saveProgress(p);

        showModal(
          'Правила квеста',
          'Сканируй QR-коды внутри подарков.<br><br>' +
          'Сначала нужно поймать фрагмент шаром, после этого откроется видео с подсказкой, где искать следующий сюрприз.'
        );
      });

      return;
    }

    if (code === 'pillow') {
      showModal(
        'Подушка',
        'Аккуратно приподними подушку.<br>Там должен лежать следующий след.',
        'Я посмотрела',
        function () {
          const p = loadProgress();
          p.pillowChecked = true;
          saveProgress(p);

          showModal(
            'Финал разблокирован',
            'Теперь можно отсканировать финальный QR у серёжек:<br><b>#love</b>'
          );
        }
      );

      return;
    }

    openGame(code);
  }

  function pauseForeignMedia() {
    document.querySelectorAll('video:not([data-pq2="bridge"]), audio:not([data-pq2="bridge"])').forEach(function (el) {
      try {
        el.pause();
        el.muted = true;
      } catch (e) {}
    });
  }

  function startGuard() {
    if (guardTimer) return;

    pauseForeignMedia();

    guardTimer = setInterval(function () {
      if (!isGameMode()) return;
      pauseForeignMedia();
    }, 700);

    if (!mutationObserver && window.MutationObserver) {
      mutationObserver = new MutationObserver(function () {
        if (isGameMode()) pauseForeignMedia();
      });

      mutationObserver.observe(document.body, {
        childList: true,
        subtree: true
      });
    }
  }

  function bindSecretAdmin() {
    const regex = /Романтический QR-квест|семейная карта сокровищ|Моя карта/i;

    const candidates = Array.from(document.querySelectorAll('h1,h2,h3,header,div,span'))
      .filter(function (el) {
        const text = (el.textContent || '').trim();
        return text.length > 0 && text.length < 160 && regex.test(text);
      })
      .slice(0, 8);

    let taps = 0;
    let timer = null;

    function tap() {
      clearTimeout(timer);
      taps++;

      timer = setTimeout(function () {
        taps = 0;
      }, 1200);

      if (taps >= 7) {
        taps = 0;
        openLogin();
      }
    }

    candidates.forEach(function (el) {
      el.addEventListener('click', tap);

      let longPressTimer = null;

      el.addEventListener('pointerdown', function () {
        longPressTimer = setTimeout(openLogin, 1500);
      });

      ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (eventName) {
        el.addEventListener(eventName, function () {
          if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
          }
        });
      });

      el.style.userSelect = 'none';
    });
  }

  function onMessage(event) {
    if (location.origin && event.origin !== location.origin) return;

    const data = event.data || {};

    if (data.type === 'pq2_success' && data.id === activeCode) {
      completeTarget(String(data.id), !!data.perfect);
    }
  }

  function handleEmergencyUrl() {
    const qs = new URLSearchParams(location.search);

    if (normAuth(qs.get('pq2_disable')) === normAuth(ADMIN_PASSWORD)) {
      localStorage.removeItem(MODE_KEY);
      history.replaceState({}, '', location.pathname + location.hash);
      location.reload();
      return true;
    }

    if (normAuth(qs.get('pq2_reset')) === normAuth(ADMIN_PASSWORD)) {
      localStorage.removeItem(PROG_KEY);
      history.replaceState({}, '', location.pathname + location.hash);
      location.reload();
      return true;
    }

    return false;
  }

  function init() {
    ensureStyles();

    if (handleEmergencyUrl()) return;

    bindSecretAdmin();

    const qs = new URLSearchParams(location.search);
    if (qs.get('pq2_admin') === '1') {
      openLogin();
    }

    if (isGameMode()) {
      startGuard();
    }

    route();

    window.addEventListener('hashchange', function () {
      setTimeout(route, 50);
    });

    window.addEventListener('popstate', function () {
      setTimeout(route, 50);
    });

    window.addEventListener('message', onMessage);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();