(() => {
  'use strict';

  const STORAGE_KEY = 'contacarga-state-v1';
  const defaultState = { currentCount: 0, history: [], total: 0 };
  let state = loadState();
  let wakeLock = null;
  let toastTimer;
  const pointers = new Map();
  let gesture = { active: false, initialDistance: 0, startCenterY: 0, hasCounted: false, blocked: false };

  const elements = {
    surface: document.querySelector('#counterSurface'),
    currentCount: document.querySelector('#currentCount'),
    undo: document.querySelector('#undoButton'),
    menu: document.querySelector('#openMenuButton'),
    sheet: document.querySelector('#bottomSheet'),
    backdrop: document.querySelector('#sheetBackdrop'),
    sheetCount: document.querySelector('#sheetCount'),
    cameraTime: document.querySelector('#cameraTime'),
    continue: document.querySelector('#continueButton'),
    reset: document.querySelector('#resetButton'),
    save: document.querySelector('#saveButton'),
    list: document.querySelector('#historyList'),
    total: document.querySelector('#totalCount'),
    stopCount: document.querySelector('#stopCount'),
    export: document.querySelector('#exportButton'),
    clear: document.querySelector('#clearButton'),
    toast: document.querySelector('#toast'),
    wake: document.querySelector('#wakeButton'),
    status: document.querySelector('#sessionStatus')
  };

  function loadState() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!stored || !Array.isArray(stored.history)) return { ...defaultState };
      return {
        currentCount: Number.isFinite(stored.currentCount) ? stored.currentCount : 0,
        history: stored.history,
        total: Number.isFinite(stored.total) ? stored.total : 0
      };
    } catch (error) {
      return { ...defaultState };
    }
  }

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function render() {
    elements.currentCount.textContent = state.currentCount;
    elements.total.textContent = state.total;
    elements.stopCount.textContent = state.history.length;
    elements.sheetCount.textContent = state.currentCount;
    elements.undo.disabled = state.currentCount === 0;
    elements.export.disabled = state.history.length === 0;
    elements.clear.disabled = state.history.length === 0;
    elements.status.textContent = state.currentCount > 0 ? 'Lote em andamento' : 'Pronto para contar';

    if (state.history.length === 0) {
      elements.list.innerHTML = '<div class="empty-state"><span class="empty-icon" aria-hidden="true">&#9678;</span><p>Nenhuma parada salva ainda.</p><small>Use a pinça com dois dedos ou toque em Opcoes.</small></div>';
      return;
    }

    elements.list.innerHTML = state.history.map((stop, index) => `
      <article class="history-row">
        <span class="index">#${index + 1}</span>
        <span><strong>${stop.current} SC</strong><small>Contagem atual</small></span>
        <span><strong>${stop.accumulated} SC</strong><small>Soma acumulada</small></span>
        <time>${stop.time}</time>
      </article>
    `).join('');
  }

  function vibrate(pattern = 12) {
    if ('vibrate' in navigator) navigator.vibrate(pattern);
  }

  function count() {
    state.currentCount += 1;
    persist();
    render();
    elements.surface.classList.remove('is-counting');
    void elements.surface.offsetWidth;
    elements.surface.classList.add('is-counting');
    vibrate();
    requestWakeLock();
  }

  function undo() {
    if (state.currentCount === 0) return;
    state.currentCount -= 1;
    persist();
    render();
    vibrate([10, 30, 10]);
    showToast('Ultimo toque desfeito.');
  }

  function openSheet() {
    elements.sheetCount.textContent = state.currentCount;
    elements.sheet.hidden = false;
    elements.backdrop.hidden = false;
    elements.continue.focus();
  }

  function closeSheet() {
    elements.sheet.hidden = true;
    elements.backdrop.hidden = true;
    elements.menu?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function resetCount() {
    if (state.currentCount === 0) {
      closeSheet();
      showToast('A contagem atual ja esta zerada.');
      return;
    }
    if (!window.confirm(`Zerar a contagem atual de ${state.currentCount} SC? Essa acao nao cria uma parada.`)) return;
    state.currentCount = 0;
    persist();
    render();
    closeSheet();
    vibrate([20, 40, 20]);
    showToast('Contagem atual zerada.');
  }

  function saveStop() {
    if (state.currentCount === 0) {
      showToast('Conte pelo menos 1 SC antes de salvar.');
      return;
    }
    const cameraTime = normalizeCameraTime(elements.cameraTime.value);
    if (!cameraTime) {
      elements.cameraTime.focus();
      showToast('Informe o horario da camera no formato HH:MM:SS.');
      return;
    }
    const stop = {
      current: state.currentCount,
      accumulated: state.total + state.currentCount,
      time: cameraTime
    };
    state.history.push(stop);
    state.total = stop.accumulated;
    state.currentCount = 0;
    elements.cameraTime.value = '';
    persist();
    render();
    closeSheet();
    vibrate([25, 50, 25]);
    showToast(`Parada #${state.history.length} salva.`);
  }

  function normalizeCameraTime(value) {
    let normalized = value.trim().replace(/[./-]/g, ':');
    if (/^\d{6}$/.test(normalized)) normalized = `${normalized.slice(0, 2)}:${normalized.slice(2, 4)}:${normalized.slice(4)}`;
    const match = normalized.match(/^(\d{2}):(\d{2}):(\d{2})$/);
    if (!match) return '';
    const [, hours, minutes, seconds] = match;
    if (Number(hours) > 23 || Number(minutes) > 59 || Number(seconds) > 59) return '';
    return `${hours}:${minutes}:${seconds}`;
  }

  function summaryText() {
    const lines = ['CONTA CARGA - RESUMO', `Total geral: ${state.total} SC`, ''];
    lines.push('# | Contagem atual | Soma acumulada | Horario');
    state.history.forEach((stop, index) => lines.push(`${index + 1} | ${stop.current} SC | ${stop.accumulated} SC | ${stop.time}`));
    return lines.join('\n');
  }

  async function exportSummary() {
    const text = summaryText();
    try {
      await navigator.clipboard.writeText(text);
      showToast('Resumo copiado para enviar no WhatsApp.');
    } catch (error) {
      window.prompt('Copie o resumo abaixo:', text);
    }
  }

  function clearHistory() {
    if (!state.history.length || !window.confirm('Limpar todo o historico e o total geral?')) return;
    state = { ...defaultState };
    persist();
    render();
    showToast('Historico limpo.');
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.add('is-visible');
    toastTimer = setTimeout(() => elements.toast.classList.remove('is-visible'), 2400);
  }

  async function requestWakeLock() {
    if (!('wakeLock' in navigator) || wakeLock) return;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
      elements.wake?.classList.add('is-active');
      elements.wake?.setAttribute('aria-label', 'Tela ligada');
    } catch (error) {
      showToast('Ative o bloqueio de tela do celular para manter a tela ligada.');
    }
  }

  function updatePointer(pointer) {
    pointers.set(pointer.pointerId, { x: pointer.clientX, y: pointer.clientY });
  }

  function pointerDistance() {
    const [first, second] = [...pointers.values()];
    return Math.hypot(second.x - first.x, second.y - first.y);
  }

  function isControlTarget(target) {
    return target instanceof Element && Boolean(target.closest('button, a, input, select, textarea, [role="dialog"], #sheetBackdrop'));
  }

  function pointerCenterY() {
    return [...pointers.values()].reduce((sum, pointer) => sum + pointer.y, 0) / pointers.size;
  }

  document.addEventListener('pointerdown', (event) => {
    updatePointer(event);
    if (pointers.size === 1) {
      gesture = {
        active: false,
        initialDistance: 0,
        startCenterY: event.clientY,
        hasCounted: false,
        blocked: !event.target.closest?.('#counterSurface') || isControlTarget(event.target)
      };
    } else if (pointers.size === 2) {
      gesture.initialDistance = pointerDistance();
      gesture.hasCounted = true;
      event.preventDefault();
    }
  });

  document.addEventListener('pointermove', (event) => {
    if (!pointers.has(event.pointerId)) return;
    updatePointer(event);
    if (pointers.size === 2 && gesture.initialDistance > 0) {
      const distance = pointerDistance();
      const movedDown = pointerCenterY() - gesture.startCenterY >= 45;
      if (gesture.initialDistance - distance >= 45 || movedDown) {
        gesture.active = true;
        openSheet();
        vibrate([15, 30, 15]);
        pointers.clear();
      }
      event.preventDefault();
    }
  });

  function endPointer(event) {
    const wasSingleTap = pointers.size === 1 && !gesture.active && !gesture.hasCounted && !gesture.blocked;
    pointers.delete(event.pointerId);
    if (wasSingleTap) count();
  }

  document.addEventListener('pointerup', endPointer);
  document.addEventListener('pointercancel', (event) => pointers.delete(event.pointerId));
  document.addEventListener('contextmenu', (event) => event.preventDefault());

  elements.undo.addEventListener('click', undo);
  elements.menu.addEventListener('click', openSheet);
  elements.continue.addEventListener('click', closeSheet);
  elements.reset.addEventListener('click', resetCount);
  elements.save.addEventListener('click', saveStop);
  elements.backdrop.addEventListener('click', closeSheet);
  elements.export.addEventListener('click', exportSummary);
  elements.clear.addEventListener('click', clearHistory);
  elements.wake?.addEventListener('click', requestWakeLock);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.currentCount > 0) requestWakeLock();
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }

  render();
})();
