(() => {
  'use strict';

  const APP_VERSION = '1.0.15';
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
    stopTimeError: document.querySelector('#stopTimeError'),
    stopError: document.querySelector('#stopError'),
    continue: document.querySelector('#continueButton'),
    reset: document.querySelector('#resetButton'),
    adjust: document.querySelector('#adjustButton'),
    save: document.querySelector('#saveButton'),
    clearCache: document.querySelector('#clearCacheButton'),
    historySection: document.querySelector('.history-section'),
    list: document.querySelector('#historyList'),
    total: document.querySelector('#totalCount'),
    liveTotal: document.querySelector('#liveTotalCount'),
    divergenceCount: document.querySelector('#divergenceCount'),
    divergenceList: document.querySelector('#divergenceList'),
    stopCount: document.querySelector('#stopCount'),
    sessionMeta: document.querySelector('#sessionMeta'),
    report: document.querySelector('#reportButton'),
    export: document.querySelector('#exportButton'),
    excel: document.querySelector('#excelButton'),
    word: document.querySelector('#wordButton'),
    reportModal: document.querySelector('#reportModal'),
    closeReport: document.querySelector('#closeReportButton'),
    clear: document.querySelector('#clearButton'),
    divergence: document.querySelector('#divergenceButton'),
    toast: document.querySelector('#toast'),
    wake: document.querySelector('#wakeButton'),
    status: document.querySelector('#sessionStatus'),
    modalBackdrop: document.querySelector('#modalBackdrop'),
    setupModal: document.querySelector('#setupModal'),
    operationDate: document.querySelector('#operationDate'),
    romaneioNumber: document.querySelector('#romaneioNumber'),
    handlingStartDate: document.querySelector('#handlingStartDate'),
    handlingEndDate: document.querySelector('#handlingEndDate'),
    cameraStartTime: document.querySelector('#cameraStartTime'),
    cameraEndTime: document.querySelector('#cameraEndTime'),
    truckPlate: document.querySelector('#truckPlate'),
    romaneioTotal: document.querySelector('#romaneioTotal'),
    conveyor: document.querySelector('#conveyor'),
    startCount: document.querySelector('#startCountButton'),
    stopModal: document.querySelector('#stopModal'),
    subtractCount: document.querySelector('#subtractCount'),
    cancelStop: document.querySelector('#cancelStopButton'),
    confirmStop: document.querySelector('#confirmStopButton'),
    adjustModal: document.querySelector('#adjustModal'),
    adjustValue: document.querySelector('#adjustValue'),
    cancelAdjust: document.querySelector('#cancelAdjustButton'),
    confirmAdjust: document.querySelector('#confirmAdjustButton'),
    editModal: document.querySelector('#editModal'),
    editCount: document.querySelector('#editCount'),
    editSubtraction: document.querySelector('#editSubtraction'),
    editTime: document.querySelector('#editTime'),
    editError: document.querySelector('#editError'),
    cancelEdit: document.querySelector('#cancelEditButton'),
    confirmEdit: document.querySelector('#confirmEditButton'),
    divergenceModal: document.querySelector('#divergenceModal'),
    divergenceStartTime: document.querySelector('#divergenceStartTime'),
    divergenceEndTime: document.querySelector('#divergenceEndTime'),
    divergenceText: document.querySelector('#divergenceText'),
    divergenceError: document.querySelector('#divergenceError'),
    setupError: document.querySelector('#setupError'),
    cancelDivergence: document.querySelector('#cancelDivergenceButton'),
    saveDivergence: document.querySelector('#saveDivergenceButton'),
    confirmModal: document.querySelector('#confirmModal'),
    confirmMessage: document.querySelector('#confirmMessage'),
    cancelConfirm: document.querySelector('#cancelConfirmButton'),
    acceptConfirm: document.querySelector('#acceptConfirmButton')
  };
  let pendingConfirmation = null;
  let editingStopIndex = -1;
  let editingDivergenceIndex = -1;

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
    elements.liveTotal.textContent = state.total + state.currentCount;
    elements.stopCount.textContent = state.history.length;
    elements.sheetCount.textContent = state.currentCount;
    const divergences = state.session?.divergences || [];
    elements.divergenceCount.textContent = divergences.length;
    elements.divergenceList.innerHTML = divergences.length
      ? divergences.map((divergence, index) => `
        <article class="divergence-row">
          <span class="index">#${index + 1}</span>
          <span><strong>${divergence.start} a ${divergence.end}</strong><small>${divergence.text}</small><span class="row-actions"><button class="edit-divergence-button" type="button" data-divergence-index="${index}">Editar</button><button class="delete-divergence-button" type="button" data-divergence-index="${index}">Excluir</button></span></span>
        </article>
      `).join('')
      : '<div class="empty-state"><p>Nenhuma divergencia registrada.</p></div>';
    elements.undo.disabled = state.currentCount === 0;
    elements.export.disabled = state.history.length === 0;
    elements.clear.disabled = state.history.length === 0;
    elements.status.textContent = state.session
      ? (state.currentCount > 0 ? `Romaneio ${state.session.romaneio}` : 'Pronto para contar')
      : 'Informe os dados para iniciar';
    elements.sessionMeta.textContent = state.session
      ? `Data: ${state.session.date} | Romaneio: ${state.session.romaneio} | Placa: ${state.session.plate || '-'}`
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
        <span><strong>${stop.subtraction || 0} SC</strong><small>Saco subtraido</small></span>
        <span><time>${stop.time}</time><span class="row-actions"><button class="edit-stop-button" type="button" data-stop-index="${index}">Editar</button><button class="delete-stop-button" type="button" data-stop-index="${index}">Excluir</button></span></span>
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

  function openAdjustModal() {
    elements.adjustValue.value = '';
    elements.modalBackdrop.hidden = false;
    elements.adjustModal.hidden = false;
    elements.adjustValue.focus();
  }

  function applyAdjust() {
    const adjustment = Number(elements.adjustValue.value);
    if (!Number.isInteger(adjustment) || adjustment === 0) {
      showToast('Informe um valor inteiro diferente de zero.');
      return;
    }
    if (state.currentCount + adjustment < 0) {
      showToast('O ajuste nao pode deixar a contagem negativa.');
      return;
    }
    state.currentCount += adjustment;
    persist();
    render();
    closeModal(elements.adjustModal);
    closeSheet();
    showToast(`Contagem ajustada em ${adjustment > 0 ? '+' : ''}${adjustment} SC.`);
  }

  function saveStop() {
    if (state.currentCount === 0) {
      showToast('Conte pelo menos 1 SC antes de salvar.');
      return;
    }
    const timeResult = parseCameraTime(elements.cameraTime.value);
    if (timeResult.message) {
      setStopTimeError(timeResult.message);
      elements.cameraTime.focus();
      return;
    }
    setStopTimeError('');
    setStopError('');
    elements.subtractCount.value = '0';
    elements.modalBackdrop.hidden = false;
    elements.stopModal.hidden = false;
    elements.subtractCount.focus();
  }

  function confirmSaveStop() {
    const subtraction = Number(elements.subtractCount.value);
    if (!Number.isInteger(subtraction) || subtraction < 0 || subtraction > state.currentCount) {
      setStopError(`A subtracao deve estar entre 0 e ${state.currentCount} SC.`);
      return;
    }
    const timeResult = parseCameraTime(elements.cameraTime.value);
    if (timeResult.message) {
      setStopTimeError(timeResult.message);
      elements.cameraTime.focus();
      return;
    }
    const stop = {
      current: state.currentCount,
      subtraction,
      net: state.currentCount - subtraction,
      accumulated: state.total + state.currentCount - subtraction,
      time: timeResult.normalized
    };
    state.history.push(stop);
    state.total = stop.accumulated;
    state.currentCount = 0;
    elements.cameraTime.value = '';
    elements.cameraTime.setCustomValidity('');
    elements.cameraTime.setAttribute('aria-invalid', 'false');
    setStopError('');
    setStopTimeError('');
    persist();
    render();
    closeModal(elements.stopModal);
    closeSheet();
    vibrate([25, 50, 25]);
    showToast(`Parada #${state.history.length} salva.`);
  }

  function openEditStop(index) {
    const stop = state.history[index];
    if (!stop) return;
    editingStopIndex = index;
    setEditError('');
    elements.editCount.value = stop.current;
    elements.editSubtraction.value = stop.subtraction || 0;
    elements.editTime.value = parseCameraTime(stop.time).normalized;
    elements.modalBackdrop.hidden = false;
    elements.editModal.hidden = false;
    elements.editCount.focus();
  }

  function saveEditedStop() {
    const stop = state.history[editingStopIndex];
    const count = Number(elements.editCount.value);
    const subtraction = Number(elements.editSubtraction.value);
    const timeResult = parseCameraTime(elements.editTime.value);
    if (!stop || !Number.isInteger(count) || count < 0 || !Number.isInteger(subtraction) || subtraction < 0) {
      setEditError('Informe quantidades validas.');
      return;
    }
    if (subtraction > count) {
      setEditError(`A subtracao nao pode ser maior que a quantidade da parada (${count} SC).`);
      return;
    }
    if (timeResult.message) {
      setEditError(timeResult.message);
      return;
    }
    setEditError('');
    closeModal(elements.editModal);
    requestConfirmation('A parada sera alterada. Deseja confirmar?', () => {
      stop.current = count;
      stop.subtraction = subtraction;
      stop.net = count - subtraction;
      stop.time = timeResult.normalized;
      recalculateHistoryTotals();
      persist();
      render();
      editingStopIndex = -1;
      showToast('Parada alterada.');
    });
  }

  function deleteStop(index) {
    const stop = state.history[index];
    if (!stop) return;
    requestConfirmation(`Excluir a parada #${index + 1}? Essa acao nao pode ser desfeita.`, () => {
      state.history.splice(index, 1);
      recalculateHistoryTotals();
      persist();
      render();
      showToast('Parada excluida.');
    });
  }

  function stopNetValue(stop) {
    return Number.isFinite(stop.net) ? stop.net : stop.current;
  }

  function recalculateHistoryTotals() {
    let accumulated = 0;
    state.history.forEach((item) => {
      accumulated += stopNetValue(item);
      item.accumulated = accumulated;
    });
    state.total = accumulated;
  }

  function parseCameraTime(value) {
    let normalized = value.trim().replace(/\s/g, '').toLowerCase();
    if (/^\d{6}$/.test(normalized)) normalized = `${normalized.slice(0, 2)}:${normalized.slice(2, 4)}:${normalized.slice(4)}`;
    const legacyDisplayMatch = normalized.match(/^(\d{2})h(\d{2})m(\d{2})s$/);
    if (legacyDisplayMatch) normalized = `${legacyDisplayMatch[1]}:${legacyDisplayMatch[2]}:${legacyDisplayMatch[3]}`;
    normalized = normalized.replace(/[./-]/g, ':');
    if (/^\d{2}:\d{2}$/.test(normalized)) normalized = `${normalized}:00`;
    const match = normalized.match(/^(\d{2}):(\d{2}):(\d{2})$/);
    if (!match) return { normalized: '', message: 'Use o formato 24h HH:MM:SS.' };
    const [, hours, minutes, seconds] = match;
    if (Number(hours) > 23) return { normalized: '', message: 'A hora deve estar entre 00 e 23.' };
    if (Number(minutes) > 59) return { normalized: '', message: 'Os minutos devem estar entre 00 e 59.' };
    if (Number(seconds) > 59) return { normalized: '', message: 'Os segundos devem estar entre 00 e 59.' };
    return { normalized: `${hours}:${minutes}:${seconds}`, message: '' };
  }

  function formatCameraTimeInput(event) {
    formatTimeInput(event);
    updateCameraTimeValidity();
  }

  function formatEditTimeInput(event) {
    formatTimeInput(event);
    updateTimeInputValidity(elements.editTime);
  }

  function formatTimeInput(event) {
    const input = event.target;
    const caret = input.selectionStart ?? input.value.length;
    const digitsBeforeCaret = input.value.slice(0, caret).replace(/\D/g, '').length;
    input.value = formatCameraTime(input.value);
    let nextCaret = 0;
    let digitCount = 0;
    while (nextCaret < input.value.length && digitCount < digitsBeforeCaret) {
      if (input.value[nextCaret] !== ':') digitCount += 1;
      nextCaret += 1;
    }
    if (document.activeElement === input) input.setSelectionRange(nextCaret, nextCaret);
  }

  function formatCameraTime(value) {
    const digits = value.replace(/\D/g, '').slice(0, 6);
    const parts = [];
    if (digits.length > 0) parts.push(digits.slice(0, 2));
    if (digits.length > 2) parts.push(digits.slice(2, 4));
    if (digits.length > 4) parts.push(digits.slice(4, 6));
    return parts.join(':');
  }

  function updateCameraTimeValidity() {
    const result = parseCameraTime(elements.cameraTime.value);
    elements.cameraTime.setCustomValidity(result.message);
    elements.cameraTime.setAttribute('aria-invalid', result.message ? 'true' : 'false');
  }

  function summaryText() {
    const session = state.session || {};
    const lines = ['CONTA CARGA - RESUMO', `Data: ${session.date || '-'}`, `Manuseio: ${session.handlingStartDate || '-'} a ${session.handlingEndDate || '-'}`, `Romaneio: ${session.romaneio || '-'}`, `Horario da camera: ${session.cameraStartTime || '-'} a ${session.cameraEndTime || '-'}`, `Placa: ${session.plate || '-'}`, `Total do romaneio: ${session.romaneioTotal ?? '-'} SC`, `Esteira: ${session.conveyor || '-'}`, `Total geral: ${state.total} SC`, '', 'PARADAS:'];
    state.history.forEach((stop, index) => {
      lines.push(`\nParada #${index + 1}`);
      lines.push(`Contagem atual: ${stop.current} SC`);
      lines.push(`Soma acumulada: ${stop.accumulated} SC`);
      lines.push(`Saco subtraido: ${stop.subtraction || 0} SC`);
      lines.push(`Horario: ${stop.time}`);
    });
    if (session.divergences?.length) {
      lines.push('', 'DIVERGENCIAS:');
      session.divergences.forEach((divergence) => lines.push(`${divergence.start} a ${divergence.end}: ${divergence.text}`));
    }
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
    const session = state.session || {};
    const rows = [
      ['CONTA CARGA - RELATORIO'],
      ['Data', session.date || '-'],
      ['Manuseio', `${session.handlingStartDate || '-'} a ${session.handlingEndDate || '-'}`],
      ['Romaneio', session.romaneio || '-'],
      ['Horario da camera', `${session.cameraStartTime || '-'} a ${session.cameraEndTime || '-'}`],
      ['Placa', session.plate || '-'],
      ['Total do romaneio', `${session.romaneioTotal ?? '-'} SC`],
      ['Esteira', session.conveyor || '-'],
      ['Total geral', `${state.total} SC`],
      [],
      ['Parada', 'Contagem atual', 'Soma acumulada', 'Horario', 'Saco subtraido'],
      ...state.history.map((stop, index) => [`Parada #${index + 1}`, `${stop.current} SC`, `${stop.accumulated} SC`, stop.time, `${stop.subtraction || 0} SC`]),
      [],
      ['DIVERGENCIAS'],
      ['Divergencia', 'Hora inicial', 'Hora final', 'Descricao'],
      ...(session.divergences?.length
        ? session.divergences.map((divergence, index) => [`Divergencia #${index + 1}`, divergence.start, divergence.end, divergence.text])
        : [['Nenhuma divergencia registrada.', '-', '-', '-']])
    ];
    const table = rows.map((row) => `<tr>${row.map((cell) => `<td>${String(cell ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')}</td>`).join('')}</tr>`).join('');
    const content = `<html><meta charset="utf-8"><table>${table}</table></html>`;
    downloadFile(content, reportFileName('xls'), 'application/vnd.ms-excel;charset=utf-8');
    closeModal(elements.reportModal);
    showToast('Relatorio Excel baixado.');
  }

  function exportWord() {
    const content = `<html><meta charset="utf-8"><body><h1>ContaCarga - Relatorio</h1><pre>${summaryText().replace(/</g, '&lt;')}</pre></body></html>`;
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
    const defaultDate = new Date().toISOString().slice(0, 10);
    elements.operationDate.value = formatDateForInput(state.session?.date || defaultDate);
    elements.romaneioNumber.value = state.session?.romaneio || '';
    elements.handlingStartDate.value = formatDateForInput(state.session?.handlingStartDate || defaultDate);
    elements.handlingEndDate.value = formatDateForInput(state.session?.handlingEndDate || defaultDate);
    elements.cameraStartTime.value = state.session?.cameraStartTime || '';
    elements.cameraEndTime.value = state.session?.cameraEndTime || '';
    elements.truckPlate.value = state.session?.plate || '';
    elements.romaneioTotal.value = state.session?.romaneioTotal ?? '';
    elements.conveyor.value = state.session?.conveyor || '';
    setSetupError('');
    elements.romaneioNumber.focus();
  }

  function closeModal(modal) {
    modal.hidden = true;
    if (elements.setupModal.hidden && elements.confirmModal.hidden && elements.reportModal.hidden && elements.stopModal.hidden && elements.adjustModal.hidden && elements.editModal.hidden && elements.divergenceModal.hidden) elements.modalBackdrop.hidden = true;
  }

  function startCount() {
    const romaneioTotal = Number(elements.romaneioTotal.value);
    const operationDate = parseDateInput(elements.operationDate.value);
    const handlingStartDate = parseDateInput(elements.handlingStartDate.value);
    const handlingEndDate = parseDateInput(elements.handlingEndDate.value);
    const cameraStartTime = parseCameraTime(elements.cameraStartTime.value);
    const cameraEndTime = parseCameraTime(elements.cameraEndTime.value);
    if (!elements.operationDate.value || !elements.romaneioNumber.value.trim() || !elements.handlingStartDate.value || !elements.handlingEndDate.value || !elements.cameraStartTime.value || !elements.cameraEndTime.value || !elements.truckPlate.value.trim() || !Number.isInteger(romaneioTotal) || romaneioTotal < 0 || !elements.conveyor.value.trim()) {
      setSetupError('Preencha todos os dados do romaneio.');
      return;
    }
    if (operationDate.message || handlingStartDate.message || handlingEndDate.message) {
      setSetupError(operationDate.message || handlingStartDate.message || handlingEndDate.message);
      return;
    }
    if (cameraStartTime.message || cameraEndTime.message) {
      setSetupError(cameraStartTime.message || cameraEndTime.message);
      return;
    }
    state.session = { ...state.session, date: operationDate.normalized, handlingStartDate: handlingStartDate.normalized, handlingEndDate: handlingEndDate.normalized, romaneio: elements.romaneioNumber.value.trim(), cameraStartTime: cameraStartTime.normalized, cameraEndTime: cameraEndTime.normalized, plate: elements.truckPlate.value.trim().toUpperCase(), romaneioTotal, conveyor: elements.conveyor.value.trim(), divergences: state.session?.divergences || [] };
    persist();
    render();
    closeModal(elements.setupModal);
    showToast('Contagem iniciada.');
  }

  function openDivergenceModal() {
    if (!state.session) {
      openSetupModal();
      showToast('Inicie o romaneio antes de registrar uma divergencia.');
      return;
    }
    editingDivergenceIndex = -1;
    elements.divergenceStartTime.value = '';
    elements.divergenceEndTime.value = '';
    elements.divergenceText.value = '';
    setDivergenceError('');
    elements.modalBackdrop.hidden = false;
    elements.divergenceModal.hidden = false;
    elements.divergenceStartTime.focus();
  }

  function saveDivergence() {
    if (editingDivergenceIndex >= 0) {
      saveEditedDivergence();
      return;
    }
    const startTime = parseCameraTime(elements.divergenceStartTime.value);
    const endTime = parseCameraTime(elements.divergenceEndTime.value);
    if (startTime.message || endTime.message || !elements.divergenceText.value.trim()) {
      setDivergenceError(startTime.message || endTime.message || 'Informe o texto da divergencia.');
      return;
    }
    state.session.divergences = state.session.divergences || [];
    state.session.divergences.push({ start: startTime.normalized, end: endTime.normalized, text: elements.divergenceText.value.trim() });
    persist();
    render();
    closeModal(elements.divergenceModal);
    showToast('Divergencia salva.');
  }

  function openEditDivergence(index) {
    const divergence = state.session?.divergences?.[index];
    if (!divergence) return;
    editingDivergenceIndex = index;
    elements.divergenceStartTime.value = parseCameraTime(divergence.start).normalized;
    elements.divergenceEndTime.value = parseCameraTime(divergence.end).normalized;
    elements.divergenceText.value = divergence.text;
    elements.modalBackdrop.hidden = false;
    elements.divergenceModal.hidden = false;
    elements.divergenceStartTime.focus();
  }

  function saveEditedDivergence() {
    const divergence = state.session?.divergences?.[editingDivergenceIndex];
    const startTime = parseCameraTime(elements.divergenceStartTime.value);
    const endTime = parseCameraTime(elements.divergenceEndTime.value);
    const text = elements.divergenceText.value.trim();
    if (!divergence || startTime.message || endTime.message || !text) {
      setDivergenceError(startTime.message || endTime.message || 'Informe o texto da divergencia.');
      return;
    }
    closeModal(elements.divergenceModal);
    requestConfirmation('A divergencia sera alterada. Deseja confirmar?', () => {
      divergence.start = startTime.normalized;
      divergence.end = endTime.normalized;
      divergence.text = text;
      persist();
      render();
      editingDivergenceIndex = -1;
      showToast('Divergencia alterada.');
    });
  }

  function setDivergenceError(message) {
    elements.divergenceError.textContent = message;
    elements.divergenceError.hidden = !message;
  }

  function setStopTimeError(message) {
    elements.stopTimeError.textContent = message;
    elements.stopTimeError.hidden = !message;
  }

  function setStopError(message) {
    elements.stopError.textContent = message;
    elements.stopError.hidden = !message;
  }

  function setEditError(message) {
    elements.editError.textContent = message;
    elements.editError.hidden = !message;
  }

  function setSetupError(message) {
    elements.setupError.textContent = message;
    elements.setupError.hidden = !message;
  }

  function formatDateForInput(value) {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match ? `${match[3]}/${match[2]}/${match[1]}` : '';
  }

  function formatDateInput(event) {
    const digits = event.target.value.replace(/\D/g, '').slice(0, 8);
    const parts = [];
    if (digits.length > 0) parts.push(digits.slice(0, 2));
    if (digits.length > 2) parts.push(digits.slice(2, 4));
    if (digits.length > 4) parts.push(digits.slice(4, 8));
    event.target.value = parts.join('/');
    setSetupError('');
  }

  function parseDateInput(value) {
    const normalized = value.trim();
    const match = normalized.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) return { normalized: '', message: 'Use o formato DD/MM/AAAA.' };
    const [, day, month, year] = match;
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day)) {
      return { normalized: '', message: 'Informe uma data valida.' };
    }
    return { normalized: `${year}-${month}-${day}`, message: '' };
  }

  function deleteDivergence(index) {
    const divergence = state.session?.divergences?.[index];
    if (!divergence) return;
    requestConfirmation(`Excluir a divergencia #${index + 1}? Essa acao nao pode ser desfeita.`, () => {
      state.session.divergences.splice(index, 1);
      persist();
      render();
      showToast('Divergencia excluida.');
    });
  }

  function formatHourMinuteInput(event) {
    formatTimeInput(event);
    updateTimeInputValidity(event.target);
  }

  function updateTimeInputValidity(input) {
    const result = parseCameraTime(input.value);
    input.setCustomValidity(result.message);
    input.setAttribute('aria-invalid', result.message ? 'true' : 'false');
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
  elements.adjust.addEventListener('click', openAdjustModal);
  elements.save.addEventListener('click', saveStop);
  elements.confirmStop.addEventListener('click', confirmSaveStop);
  elements.cancelStop.addEventListener('click', () => closeModal(elements.stopModal));
  elements.cancelAdjust.addEventListener('click', () => closeModal(elements.adjustModal));
  elements.confirmAdjust.addEventListener('click', applyAdjust);
  elements.backdrop.addEventListener('click', closeSheet);
  elements.viewHistory.addEventListener('click', showHistory);
  elements.clearCache.addEventListener('click', refreshApplication);
  elements.export.addEventListener('click', exportSummary);
  elements.clear.addEventListener('click', clearHistory);
  elements.divergence.addEventListener('click', openDivergenceModal);
  elements.cancelEdit.addEventListener('click', () => closeModal(elements.editModal));
  elements.confirmEdit.addEventListener('click', saveEditedStop);
  elements.cancelDivergence.addEventListener('click', () => {
    editingDivergenceIndex = -1;
    closeModal(elements.divergenceModal);
  });
  elements.saveDivergence.addEventListener('click', saveDivergence);
  elements.divergenceStartTime.addEventListener('input', formatHourMinuteInput);
  elements.divergenceEndTime.addEventListener('input', formatHourMinuteInput);
  elements.divergenceText.addEventListener('input', () => setDivergenceError(''));
  elements.list.addEventListener('click', (event) => {
    const editButton = event.target.closest('.edit-stop-button');
    const deleteButton = event.target.closest('.delete-stop-button');
    if (editButton) openEditStop(Number(editButton.dataset.stopIndex));
    if (deleteButton) deleteStop(Number(deleteButton.dataset.stopIndex));
  });
  elements.divergenceList.addEventListener('click', (event) => {
    const editButton = event.target.closest('.edit-divergence-button');
    const deleteButton = event.target.closest('.delete-divergence-button');
    if (editButton) openEditDivergence(Number(editButton.dataset.divergenceIndex));
    if (deleteButton) deleteDivergence(Number(deleteButton.dataset.divergenceIndex));
  });
  elements.wake?.addEventListener('click', requestWakeLock);
  elements.cameraTime.addEventListener('input', formatCameraTimeInput);
  elements.cameraStartTime.addEventListener('input', formatHourMinuteInput);
  elements.cameraEndTime.addEventListener('input', formatHourMinuteInput);
  elements.operationDate.addEventListener('input', formatDateInput);
  elements.handlingStartDate.addEventListener('input', formatDateInput);
  elements.handlingEndDate.addEventListener('input', formatDateInput);
  elements.editTime.addEventListener('input', formatEditTimeInput);
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
    } else if (!elements.stopModal.hidden) {
      closeModal(elements.stopModal);
    } else if (!elements.adjustModal.hidden) {
      closeModal(elements.adjustModal);
    } else if (!elements.editModal.hidden) {
      closeModal(elements.editModal);
    } else if (!elements.divergenceModal.hidden) {
      closeModal(elements.divergenceModal);
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
