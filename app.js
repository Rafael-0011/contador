(() => {
  'use strict';

  const APP_VERSION = '1.0.4';
  const APP_VERSION_KEY = 'contacarga-app-version';
  const STORAGE_KEY = 'contacarga-state-v1';
  const createDefaultState = () => ({ currentCount: 0, history: [], total: 0, session: null });
  let state = loadState();
  let wakeLock = null;
  let toastTimer;
  let appReloading = false;
  const pointers = new Map();
  let gesture = { active: false, initialDistance: 0, startCenterY: 0, hasCounted: false, blocked: false };

  const elements = {
    surface: document.querySelector('#counterSurface'),
    currentCount: document.querySelector('#currentCount'),
    undo: document.querySelector('#undoButton'),
    menu: document.querySelector('#openMenuButton'),
    viewHistory: document.querySelector('#viewHistoryButton'),
    sheet: document.querySelector('#bottomSheet'),
    backdrop: document.querySelector('#sheetBackdrop'),
    sheetCount: document.querySelector('#sheetCount'),
    cameraTime: document.querySelector('#cameraTime'),
    continue: document.querySelector('#continueButton'),
    reset: document.querySelector('#resetButton'),
    save: document.querySelector('#saveButton'),
    clearCache: document.querySelector('#clearCacheButton'),
    historySection: document.querySelector('.history-section'),
    list: document.querySelector('#historyList'),
    total: document.querySelector('#totalCount'),
    stopCount: document.querySelector('#stopCount'),
    sessionMeta: document.querySelector('#sessionMeta'),
    report: document.querySelector('#reportButton'),
    export: document.querySelector('#exportButton'),
    excel: document.querySelector('#excelButton'),
    word: document.querySelector('#wordButton'),
    reportModal: document.querySelector('#reportModal'),
    closeReport: document.querySelector('#closeReportButton'),
    clear: document.querySelector('#clearButton'),
    toast: document.querySelector('#toast'),
    wake: document.querySelector('#wakeButton'),
    status: document.querySelector('#sessionStatus'),
    modalBackdrop: document.querySelector('#modalBackdrop'),
    setupModal: document.querySelector('#setupModal'),
    operationDate: document.querySelector('#operationDate'),
    romaneioNumber: document.querySelector('#romaneioNumber'),
    startCount: document.querySelector('#startCountButton'),
    confirmModal: document.querySelector('#confirmModal'),
    confirmMessage: document.querySelector('#confirmMessage'),
    cancelConfirm: document.querySelector('#cancelConfirmButton'),
    acceptConfirm: document.querySelector('#acceptConfirmButton')
  };
  let pendingConfirmation = null;

  async function clearRuntimeCaches(unregisterServiceWorkers = false) {
    if ('caches' in window) {
      const cacheKeys = await caches.keys();
      await Promise.all(cacheKeys.map((cacheKey) => caches.delete(cacheKey)));
    }
    if (unregisterServiceWorkers && 'serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
  }

  async function updateServiceWorkers() {
    if (!('serviceWorker' in navigator)) return;
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.update().catch(() => {})));
  }

  function checkAppVersion() {
    const storedVersion = localStorage.getItem(APP_VERSION_KEY);
    if (storedVersion === APP_VERSION) return;
    localStorage.setItem(APP_VERSION_KEY, APP_VERSION);
    appReloading = true;
    Promise.all([clearRuntimeCaches(), updateServiceWorkers()]).finally(() => {
      window.location.reload();
    });
  }

  checkAppVersion();

  function loadState() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!stored || !Array.isArray(stored.history)) return createDefaultState();
      return {
        currentCount: Number.isFinite(stored.currentCount) ? stored.currentCount : 0,
        history: stored.history,
        total: Number.isFinite(stored.total) ? stored.total : 0,
        session: stored.session || null
      };
    } catch (error) {
      return createDefaultState();
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
    elements.status.textContent = state.session
      ? (state.currentCount > 0 ? `Romaneio ${state.session.romaneio}` : 'Pronto para contar')
      : 'Informe os dados para iniciar';
    elements.sessionMeta.textContent = state.session
      ? `Data: ${state.session.date} | Romaneio: ${state.session.romaneio}`
      : 'Nova contagem';

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
    if (!state.session) {
      openSetupModal();
      return;
    }
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
    restoreCounterPosition();
  }

  function restoreCounterPosition() {
    const resetScroll = () => {
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      window.scrollTo(0, 0);
    };
    resetScroll();
    requestAnimationFrame(resetScroll);
  }

  function showHistory() {
    closeSheet();
    requestAnimationFrame(() => elements.historySection.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  async function refreshApplication() {
    requestConfirmation('Atualizar o aplicativo e limpar o cache antigo? Seus dados serao preservados.', async () => {
      if (appReloading) return;
      if (!navigator.onLine) {
        showToast('Conecte-se a internet para atualizar o aplicativo.');
        return;
      }
      appReloading = true;
      try {
        await clearRuntimeCaches(true);
        window.location.reload();
      } catch (error) {
        appReloading = false;
        showToast('Nao foi possivel limpar o cache agora.');
      }
    });
  }

  function resetCount() {
    if (state.currentCount === 0) {
      closeSheet();
      showToast('A contagem atual ja esta zerada.');
      return;
    }
    requestConfirmation(`Zerar a contagem atual de ${state.currentCount} SC? Essa acao nao cria uma parada.`, () => {
      state.currentCount = 0;
      persist();
      render();
      closeSheet();
      vibrate([20, 40, 20]);
      showToast('Contagem atual zerada.');
    });
  }

  function saveStop() {
    if (state.currentCount === 0) {
      showToast('Conte pelo menos 1 SC antes de salvar.');
      return;
    }
    const timeResult = parseCameraTime(elements.cameraTime.value);
    if (timeResult.message) {
      elements.cameraTime.focus();
      showToast(timeResult.message);
      return;
    }
    const cameraTime = timeResult.normalized;
    const stop = {
      current: state.currentCount,
      accumulated: state.total + state.currentCount,
      time: cameraTime
    };
    state.history.push(stop);
    state.total = stop.accumulated;
    state.currentCount = 0;
    elements.cameraTime.value = '';
    elements.cameraTime.setCustomValidity('');
    elements.cameraTime.setAttribute('aria-invalid', 'false');
    persist();
    render();
    closeSheet();
    vibrate([25, 50, 25]);
    showToast(`Parada #${state.history.length} salva.`);
  }

  function parseCameraTime(value) {
    let normalized = value.trim().replace(/\s/g, '').toLowerCase();
    if (/^\d{6}$/.test(normalized)) normalized = `${normalized.slice(0, 2)}:${normalized.slice(2, 4)}:${normalized.slice(4)}`;
    const displayMatch = normalized.match(/^(\d{2})h(\d{2})m(\d{2})s$/);
    if (displayMatch) normalized = `${displayMatch[1]}:${displayMatch[2]}:${displayMatch[3]}`;
    normalized = normalized.replace(/[./-]/g, ':');
    const match = normalized.match(/^(\d{2}):(\d{2}):(\d{2})$/);
    if (!match) return { normalized: '', message: 'Use o formato HHhMMmSSs.' };
    const [, hours, minutes, seconds] = match;
    if (Number(hours) > 23) return { normalized: '', message: 'A hora deve estar entre 00 e 23.' };
    if (Number(minutes) > 59) return { normalized: '', message: 'Os minutos devem estar entre 00 e 59.' };
    if (Number(seconds) > 59) return { normalized: '', message: 'Os segundos devem estar entre 00 e 59.' };
    return { normalized: `${hours}:${minutes}:${seconds}`, message: '' };
  }

  function formatCameraTimeInput() {
    const digits = elements.cameraTime.value.replace(/\D/g, '').slice(0, 6);
    const parts = [];
    if (digits.length > 0) parts.push(digits.slice(0, 2));
    if (digits.length > 2) parts.push(`${digits.slice(2, 4)}`);
    if (digits.length > 4) parts.push(`${digits.slice(4, 6)}`);
    const suffixes = ['h', 'm', 's'];
    elements.cameraTime.value = parts.map((part, index) => `${part}${suffixes[index]}`).join('');
    updateCameraTimeValidity();
  }

  function updateCameraTimeValidity() {
    const result = parseCameraTime(elements.cameraTime.value);
    elements.cameraTime.setCustomValidity(result.message);
    elements.cameraTime.setAttribute('aria-invalid', result.message ? 'true' : 'false');
  }

  function summaryText() {
    const lines = ['CONTA CARGA - RESUMO', `Data: ${state.session?.date || '-'}`, `Romaneio: ${state.session?.romaneio || '-'}`, `Total geral: ${state.total} SC`, '', 'PARADAS:'];
    state.history.forEach((stop, index) => {
      lines.push(`\nParada #${index + 1}`);
      lines.push(`Contagem atual: ${stop.current} SC`);
      lines.push(`Soma acumulada: ${stop.accumulated} SC`);
      lines.push(`Horario: ${stop.time}`);
    });
    return lines.join('\n');
  }

  async function exportSummary() {
    const text = summaryText();
    try {
      await navigator.clipboard.writeText(text);
      closeModal(elements.reportModal);
      showToast('Resumo copiado para enviar no WhatsApp.');
    } catch (error) {
      showToast('Nao foi possivel copiar o resumo neste navegador.');
    }
  }

  function downloadFile(content, fileName, type) {
    const file = new Blob([content], { type });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(file);
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function reportFileName(extension) {
    const romaneio = (state.session?.romaneio || 'contagem').replace(/[^a-z0-9_-]/gi, '_');
    return `relatorio-romaneio-${romaneio}.${extension}`;
  }

  function exportExcel() {
    const rows = [
      ['CONTA CARGA - RELATORIO'],
      ['Data', state.session?.date || '-'],
      ['Romaneio', state.session?.romaneio || '-'],
      ['Total geral', `${state.total} SC`],
      [],
      ['Parada', 'Contagem atual', 'Soma acumulada', 'Horario'],
      ...state.history.map((stop, index) => [`Parada #${index + 1}`, `${stop.current} SC`, `${stop.accumulated} SC`, stop.time])
    ];
    const table = rows.map((row) => `<tr>${row.map((cell) => `<td>${String(cell ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')}</td>`).join('')}</tr>`).join('');
    const content = `<html><meta charset="utf-8"><table>${table}</table></html>`;
    downloadFile(content, reportFileName('xls'), 'application/vnd.ms-excel;charset=utf-8');
    closeModal(elements.reportModal);
    showToast('Relatorio Excel baixado.');
  }

  function exportWord() {
    const content = `<html><meta charset="utf-8"><body><h1>ContaCarga - Relatorio</h1><p><strong>Data:</strong> ${state.session?.date || '-'}</p><p><strong>Romaneio:</strong> ${state.session?.romaneio || '-'}</p><p><strong>Total geral:</strong> ${state.total} SC</p><h2>Paradas</h2><pre>${summaryText().replace(/</g, '&lt;')}</pre></body></html>`;
    downloadFile(content, reportFileName('doc'), 'application/msword;charset=utf-8');
    closeModal(elements.reportModal);
    showToast('Relatorio Word baixado.');
  }

  function openReportModal() {
    elements.modalBackdrop.hidden = false;
    elements.reportModal.hidden = false;
    elements.export.focus();
  }

  function clearHistory() {
    if (!state.history.length) return;
    requestConfirmation('O historico sera apagado e uma nova contagem sera iniciada. Deseja continuar?', () => {
      state = createDefaultState();
      persist();
      render();
      closeSheet();
      openSetupModal();
    });
  }

  function openSetupModal() {
    elements.modalBackdrop.hidden = false;
    elements.setupModal.hidden = false;
    elements.operationDate.value = state.session?.date || new Date().toISOString().slice(0, 10);
    elements.romaneioNumber.value = state.session?.romaneio || '';
    elements.romaneioNumber.focus();
  }

  function closeModal(modal) {
    modal.hidden = true;
    if (elements.setupModal.hidden && elements.confirmModal.hidden && elements.reportModal.hidden) elements.modalBackdrop.hidden = true;
  }

  function startCount() {
    if (!elements.operationDate.value || !elements.romaneioNumber.value.trim()) {
      showToast('Informe a data e o numero do romaneio.');
      return;
    }
    state.session = { date: elements.operationDate.value, romaneio: elements.romaneioNumber.value.trim() };
    persist();
    render();
    closeModal(elements.setupModal);
    showToast('Contagem iniciada.');
  }

  function requestConfirmation(message, onConfirm) {
    pendingConfirmation = onConfirm;
    elements.confirmMessage.textContent = message;
    elements.modalBackdrop.hidden = false;
    elements.confirmModal.hidden = false;
    elements.acceptConfirm.focus();
  }

  function acceptConfirmation() {
    const action = pendingConfirmation;
    pendingConfirmation = null;
    closeModal(elements.confirmModal);
    action?.();
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
  elements.viewHistory.addEventListener('click', showHistory);
  elements.clearCache.addEventListener('click', refreshApplication);
  elements.export.addEventListener('click', exportSummary);
  elements.clear.addEventListener('click', clearHistory);
  elements.wake?.addEventListener('click', requestWakeLock);
  elements.cameraTime.addEventListener('input', formatCameraTimeInput);
  elements.report.addEventListener('click', openReportModal);
  elements.excel.addEventListener('click', exportExcel);
  elements.word.addEventListener('click', exportWord);
  elements.closeReport.addEventListener('click', () => closeModal(elements.reportModal));
  elements.startCount.addEventListener('click', startCount);
  elements.cancelConfirm.addEventListener('click', () => { pendingConfirmation = null; closeModal(elements.confirmModal); });
  elements.acceptConfirm.addEventListener('click', acceptConfirmation);
  elements.modalBackdrop.addEventListener('click', () => {
    if (!elements.confirmModal.hidden) {
      pendingConfirmation = null;
      closeModal(elements.confirmModal);
    } else if (!elements.reportModal.hidden) {
      closeModal(elements.reportModal);
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.currentCount > 0) requestWakeLock();
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (appReloading) return;
      appReloading = true;
      window.location.reload();
    });
    window.addEventListener('load', async () => {
      const registration = await navigator.serviceWorker.register('sw.js').catch(() => null);
      registration?.update();
    });
  }

  render();
  if (!state.session) openSetupModal();
})();
