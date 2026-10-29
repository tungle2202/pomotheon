import { marked } from 'marked';
import DOMPurify from 'dompurify';
import {
  getAppSummary,
  createPerson,
  updatePerson,
  deletePerson,
  payRespect,
  earnFocusPoints,
  updateSettings,
  getImageData,
  getPersonDetail,
} from './api';
import { PomodoroTimer, type TimerListenerState } from './timer';
import { playClickSound, playRespectPaidSound } from './sound';
import type { AppStateSummary, Person, Settings } from './types';

// Global state
let appSummary: AppStateSummary | null = null;
let personsMap = new Map<string, Person>();
let timer: PomodoroTimer | null = null;
let activePopupPersonId: string | null = null;

// Form image state
let formImageBase64: string | null = null;
let formImageExtension: string | null = null;
let formRemoveImage: boolean = false;

// DOM Elements - Shell
const balanceValEl = document.getElementById('global-balance-val') as HTMLElement;
const tabBtnPantheon = document.getElementById('tab-btn-pantheon') as HTMLButtonElement;
const tabBtnTimer = document.getElementById('tab-btn-timer') as HTMLButtonElement;
const panelPantheon = document.getElementById('panel-pantheon') as HTMLElement;
const panelTimer = document.getElementById('panel-timer') as HTMLElement;
const pantheonStripEl = document.getElementById('pantheon-strip') as HTMLElement;
const btnOpenSettings = document.getElementById('btn-open-settings') as HTMLButtonElement;

// Timer DOM Elements
const timerCountdownEl = document.getElementById('timer-countdown') as HTMLElement;
const timerCycleInfoEl = document.getElementById('timer-cycle-info') as HTMLElement;
const timerProgressFillEl = document.getElementById('timer-progress-fill') as HTMLElement;
const timerBtnToggleEl = document.getElementById('timer-btn-toggle') as HTMLButtonElement;
const timerPlayIcon = document.getElementById('timer-play-icon') as HTMLElement;
const timerPauseIcon = document.getElementById('timer-pause-icon') as HTMLElement;
const timerBtnResetEl = document.getElementById('timer-btn-reset') as HTMLButtonElement;
const timerBtnSkipEl = document.getElementById('timer-btn-skip') as HTMLButtonElement;
const timerRewardPointsEl = document.getElementById('timer-reward-points') as HTMLElement;
const timerCardEl = document.getElementById('timer-card') as HTMLElement;

// Person Popup Modal
const modalPersonPopup = document.getElementById('modal-person-popup') as HTMLElement;
const popupAvatarEl = document.getElementById('popup-avatar') as HTMLElement;
const popupNameEl = document.getElementById('popup-name') as HTMLElement;
const popupTitleEl = document.getElementById('popup-title') as HTMLElement;
const popupQuoteBlockEl = document.getElementById('popup-quote-block') as HTMLElement;
const popupQuoteEl = document.getElementById('popup-quote') as HTMLElement;
const popupMarkdownEl = document.getElementById('popup-markdown-content') as HTMLElement;
const popupRespectsCountEl = document.getElementById('popup-respects-count') as HTMLElement;
const popupBtnPayRespect = document.getElementById('popup-btn-pay-respect') as HTMLButtonElement;
const popupBtnEdit = document.getElementById('popup-btn-edit') as HTMLButtonElement;
const popupBtnDelete = document.getElementById('popup-btn-delete') as HTMLButtonElement;
const popupBtnClose = document.getElementById('popup-btn-close') as HTMLButtonElement;

// Add / Edit Form Modal
const modalForm = document.getElementById('modal-form') as HTMLElement;
const formModalTitle = document.getElementById('form-modal-title') as HTMLElement;
const formEl = document.getElementById('person-form') as HTMLFormElement;
const formPersonId = document.getElementById('form-person-id') as HTMLInputElement;
const formName = document.getElementById('form-name') as HTMLInputElement;
const formTitle = document.getElementById('form-title') as HTMLInputElement;
const formQuote = document.getElementById('form-quote') as HTMLInputElement;
const formDetail = document.getElementById('form-detail') as HTMLTextAreaElement;
const formNameError = document.getElementById('form-name-error') as HTMLElement;
const formFileInput = document.getElementById('form-file-input') as HTMLInputElement;
const formBtnBrowseImage = document.getElementById('form-btn-browse-image') as HTMLButtonElement;
const formBtnRemoveImage = document.getElementById('form-btn-remove-image') as HTMLButtonElement;
const formImagePreview = document.getElementById('form-image-preview') as HTMLElement;
const formBtnClose = document.getElementById('form-btn-close') as HTMLButtonElement;
const formBtnCancel = document.getElementById('form-btn-cancel') as HTMLButtonElement;

// Settings Modal
const modalSettings = document.getElementById('modal-settings') as HTMLElement;
const settingsForm = document.getElementById('settings-form') as HTMLFormElement;
const settingThemeEl = document.getElementById('setting-theme') as HTMLSelectElement;
const settingFocusEl = document.getElementById('setting-focus-duration') as HTMLInputElement;
const settingShortBreakEl = document.getElementById('setting-short-break-duration') as HTMLInputElement;
const settingLongBreakEl = document.getElementById('setting-long-break-duration') as HTMLInputElement;
const settingCycleEl = document.getElementById('setting-sessions-cycle') as HTMLInputElement;
const settingPointsPerMinEl = document.getElementById('setting-points-per-minute') as HTMLInputElement;
const settingRespectCostEl = document.getElementById('setting-respect-cost') as HTMLInputElement;
const settingsBtnClose = document.getElementById('settings-btn-close') as HTMLButtonElement;
const settingsBtnReset = document.getElementById('settings-btn-reset') as HTMLButtonElement;

// Toast Container
const toastContainer = document.getElementById('toast-container') as HTMLElement;

// --- INITIALIZATION ---
async function initApp() {
  try {
    appSummary = await getAppSummary();
    rebuildPersonsMap();

    // 1. Apply Theme
    applyTheme(appSummary.settings.theme);
    watchSystemTheme();

    // 2. Initialize Balance & Timer
    updateBalanceDisplay();
    timer = new PomodoroTimer(appSummary.settings);
    timer.subscribe(onTimerTick, onFocusCompleted, onBreakCompleted);

    // 3. Setup Listeners
    setupNavigation();
    setupStripScroll();
    setupPopupEvents();
    setupFormEvents();
    setupSettingsEvents();
    setupGlobalKeyboard();

    // 4. Render Playing Cards
    renderPantheonStrip();
  } catch (err) {
    console.error('Failed to initialize:', err);
    showToast(`Initialization error: ${String(err)}`, 'error');
  }
}

function rebuildPersonsMap() {
  personsMap.clear();
  if (appSummary) {
    for (const p of appSummary.persons) {
      personsMap.set(p.id, p);
    }
  }
}

// --- 1. THEMING ---
function applyTheme(themeChoice: 'system' | 'light' | 'dark') {
  if (themeChoice === 'system') {
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  } else {
    document.documentElement.setAttribute('data-theme', themeChoice);
  }
}

function watchSystemTheme() {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (appSummary?.settings.theme === 'system') {
      document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
    }
  });
}

// --- 2. BALANCE DISPLAY ---
function updateBalanceDisplay() {
  if (!appSummary) return;
  balanceValEl.textContent = appSummary.balance.toString();

  const cost = appSummary.settings.respect_cost;
  const canAfford = appSummary.balance >= cost;
  popupBtnPayRespect.disabled = !canAfford;
}

// --- 3. NAVIGATION (PANTHEON & TIMER) ---
function setupNavigation() {
  tabBtnPantheon.addEventListener('click', () => {
    playClickSound();
    tabBtnPantheon.classList.add('active');
    tabBtnTimer.classList.remove('active');
    panelPantheon.classList.add('active');
    panelTimer.classList.remove('active');
  });

  tabBtnTimer.addEventListener('click', () => {
    playClickSound();
    tabBtnTimer.classList.add('active');
    tabBtnPantheon.classList.remove('active');
    panelTimer.classList.add('active');
    panelPantheon.classList.remove('active');
  });

  btnOpenSettings.addEventListener('click', () => {
    playClickSound();
    openSettingsModal();
  });
}

// --- 4. MAIN SCREEN: PANTHEON PLAYING CARD STRIP ---
function renderPantheonStrip() {
  if (!appSummary) return;

  pantheonStripEl.innerHTML = '';

  // Render each person as playing card
  appSummary.persons.forEach((person) => {
    const card = document.createElement('div');
    card.className = 'playing-card';
    card.setAttribute('tabindex', '0');
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', person.name);
    card.setAttribute('data-id', person.id);

    const initials = person.name.slice(0, 2);

    card.innerHTML = `
      <div class="card-image-box" id="card-img-${person.id}">
        <span class="card-initials">${escapeHtml(initials)}</span>
      </div>
      <div class="card-body">
        <div class="card-name" title="${escapeHtml(person.name)}">${escapeHtml(person.name)}</div>
        ${
          person.title
            ? `<div class="card-title" title="${escapeHtml(person.title)}">${escapeHtml(person.title)}</div>`
            : ''
        }
        ${
          person.quote
            ? `<div class="card-quote">${escapeHtml(person.quote)}</div>`
            : ''
        }
      </div>
      <div class="card-footer">
        <span class="card-respect-badge">✦ ${person.respect_count}</span>
        ${person.has_detail ? `<span class="card-detail-indicator">✦</span>` : ''}
      </div>
    `;

    // Load image asynchronously if path exists
    if (person.image_path) {
      getImageData(person.image_path).then((dataUrl) => {
        if (dataUrl) {
          const imgBox = card.querySelector(`#card-img-${person.id}`);
          if (imgBox) {
            imgBox.innerHTML = `<img src="${dataUrl}" class="card-img" alt="${escapeHtml(person.name)}" />`;
          }
        }
      });
    }

    // Clicking card opens person popup
    card.addEventListener('click', () => {
      openPersonPopup(person.id);
    });

    // Enter / Space key opens card
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openPersonPopup(person.id);
      }
    });

    pantheonStripEl.appendChild(card);
  });

  // Last card is the "+" Add Person card
  const addCard = document.createElement('div');
  addCard.className = 'playing-card card-add';
  addCard.setAttribute('tabindex', '0');
  addCard.setAttribute('role', 'button');
  addCard.setAttribute('aria-label', 'Add Person');
  addCard.setAttribute('title', 'Add Person');
  addCard.innerHTML = `
    <div class="add-icon-wrapper">
      <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2.5">
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    </div>
  `;

  addCard.addEventListener('click', () => {
    openFormModal();
  });

  addCard.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openFormModal();
    }
  });

  pantheonStripEl.appendChild(addCard);
}

// Map vertical mouse wheel to horizontal scroll & support arrow navigation
function setupStripScroll() {
  pantheonStripEl.addEventListener(
    'wheel',
    (e: WheelEvent) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        pantheonStripEl.scrollLeft += e.deltaY;
      }
    },
    { passive: false }
  );

  // Arrow key navigation when strip or container is focused
  pantheonStripEl.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') {
      pantheonStripEl.scrollBy({ left: 260, behavior: 'smooth' });
    } else if (e.key === 'ArrowLeft') {
      pantheonStripEl.scrollBy({ left: -260, behavior: 'smooth' });
    }
  });
}

// --- 5. PERSON POPUP MODAL (MARKDOWN PREVIEW & ACTIONS) ---
function setupPopupEvents() {
  popupBtnClose.addEventListener('click', closePersonPopup);

  modalPersonPopup.addEventListener('click', (e) => {
    if (e.target === modalPersonPopup) closePersonPopup();
  });

  popupBtnPayRespect.addEventListener('click', async () => {
    if (!activePopupPersonId || !appSummary) return;

    const cost = appSummary.settings.respect_cost;
    if (appSummary.balance < cost) {
      showToast(`Need ${cost} points to pay respect.`, 'error');
      return;
    }

    try {
      const [newCount, newBalance] = await payRespect(activePopupPersonId);
      playRespectPaidSound();

      // Trigger floating feedback
      triggerFloatingFeedback(popupBtnPayRespect, `+1`);

      // Update state
      const person = personsMap.get(activePopupPersonId);
      if (person) person.respect_count = newCount;
      appSummary.balance = newBalance;
      appSummary.total_spent += cost;

      popupRespectsCountEl.textContent = newCount.toString();
      updateBalanceDisplay();
      renderPantheonStrip();
      showToast(`+1 Respect`, 'gold');
    } catch (err) {
      showToast(`Error: ${String(err)}`, 'error');
    }
  });

  popupBtnEdit.addEventListener('click', async () => {
    if (!activePopupPersonId) return;
    const personId = activePopupPersonId;
    closePersonPopup();
    await openFormModal(personId);
  });

  popupBtnDelete.addEventListener('click', async () => {
    if (!activePopupPersonId) return;
    const person = personsMap.get(activePopupPersonId);
    if (!person) return;

    const confirmed = window.confirm(`Delete "${person.name}"?`);
    if (!confirmed) return;

    try {
      await deletePerson(person.id);
      closePersonPopup();

      appSummary = await getAppSummary();
      rebuildPersonsMap();
      updateBalanceDisplay();
      renderPantheonStrip();
      showToast(`Deleted "${person.name}"`, 'success');
    } catch (err) {
      showToast(`Failed to delete: ${String(err)}`, 'error');
    }
  });
}

async function openPersonPopup(personId: string) {
  const person = personsMap.get(personId);
  if (!person) return;

  activePopupPersonId = person.id;
  popupNameEl.textContent = person.name;
  popupTitleEl.textContent = person.title || '';
  popupRespectsCountEl.textContent = person.respect_count.toString();

  // Quote
  if (person.quote) {
    popupQuoteEl.textContent = person.quote;
    popupQuoteBlockEl.style.display = 'block';
  } else {
    popupQuoteBlockEl.style.display = 'none';
  }

  // Avatar
  if (person.image_path) {
    popupAvatarEl.innerHTML = '...';
    getImageData(person.image_path).then((dataUrl) => {
      if (dataUrl) {
        popupAvatarEl.innerHTML = `<img src="${dataUrl}" alt="${escapeHtml(person.name)}" />`;
      } else {
        popupAvatarEl.innerHTML = person.name.slice(0, 2);
      }
    });
  } else {
    popupAvatarEl.innerHTML = person.name.slice(0, 2);
  }

  // Detail Markdown file
  if (person.has_detail) {
    popupMarkdownEl.style.display = 'block';
    popupMarkdownEl.innerHTML = 'Loading...';
    try {
      const markdownRaw = await getPersonDetail(person.id);
      if (markdownRaw && markdownRaw.trim()) {
        const rawHtml = await marked.parse(markdownRaw);
        const cleanHtml = DOMPurify.sanitize(rawHtml, {
          ALLOWED_TAGS: [
            'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'a', 'ul', 'ol', 'li',
            'b', 'i', 'strong', 'em', 'code', 'pre', 'blockquote', 'hr', 'br', 'span'
          ],
          ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
        });
        popupMarkdownEl.innerHTML = cleanHtml;
        popupMarkdownEl.style.display = 'block';
      } else {
        popupMarkdownEl.style.display = 'none';
      }
    } catch (e) {
      console.error('Failed to load markdown detail:', e);
      popupMarkdownEl.style.display = 'none';
    }
  } else {
    popupMarkdownEl.style.display = 'none';
  }

  updateBalanceDisplay();
  modalPersonPopup.classList.add('open');
  popupBtnClose.focus();
}

function closePersonPopup() {
  modalPersonPopup.classList.remove('open');
  activePopupPersonId = null;
}

// --- 6. ADD / EDIT PERSON FORM MODAL ---
function setupFormEvents() {
  formBtnClose.addEventListener('click', closeFormModal);
  formBtnCancel.addEventListener('click', closeFormModal);

  modalForm.addEventListener('click', (e) => {
    if (e.target === modalForm) closeFormModal();
  });

  formBtnBrowseImage.addEventListener('click', () => {
    formFileInput.click();
  });

  formFileInput.addEventListener('change', handleFormImageSelect);

  formBtnRemoveImage.addEventListener('click', () => {
    formImageBase64 = null;
    formImageExtension = null;
    formRemoveImage = true;
    formFileInput.value = '';
    formImagePreview.innerHTML = '';
    formBtnRemoveImage.style.display = 'none';
  });

  formEl.addEventListener('submit', handleFormSubmit);
}

async function openFormModal(editPersonId?: string) {
  formNameError.style.display = 'none';
  formImageBase64 = null;
  formImageExtension = null;
  formRemoveImage = false;
  formFileInput.value = '';

  if (editPersonId) {
    const person = personsMap.get(editPersonId);
    if (!person) return;

    formModalTitle.textContent = person.name;
    formPersonId.value = person.id;
    formName.value = person.name;
    formTitle.value = person.title || '';
    formQuote.value = person.quote || '';

    // Load markdown detail from file into textarea
    if (person.has_detail) {
      try {
        const detailText = await getPersonDetail(person.id);
        formDetail.value = detailText;
      } catch {
        formDetail.value = '';
      }
    } else {
      formDetail.value = '';
    }

    if (person.image_path) {
      formImagePreview.innerHTML = '...';
      getImageData(person.image_path).then((dataUrl) => {
        if (dataUrl) {
          formImagePreview.innerHTML = `<img src="${dataUrl}" alt="Preview" />`;
          formBtnRemoveImage.style.display = 'inline-flex';
        } else {
          formImagePreview.innerHTML = '';
          formBtnRemoveImage.style.display = 'none';
        }
      });
    } else {
      formImagePreview.innerHTML = '';
      formBtnRemoveImage.style.display = 'none';
    }
  } else {
    formModalTitle.textContent = 'Add Person';
    formPersonId.value = '';
    formName.value = '';
    formTitle.value = '';
    formQuote.value = '';
    formDetail.value = '';
    formImagePreview.innerHTML = '';
    formBtnRemoveImage.style.display = 'none';
  }

  modalForm.classList.add('open');
  formName.focus();
}

function closeFormModal() {
  modalForm.classList.remove('open');
}

function handleFormImageSelect(e: Event) {
  const target = e.target as HTMLInputElement;
  if (!target.files || target.files.length === 0) return;

  const file = target.files[0];
  if (file.size > 5 * 1024 * 1024) {
    showToast('Image size exceeds 5MB limit.', 'error');
    target.value = '';
    return;
  }

  const ext = file.name.split('.').pop() || 'png';
  formImageExtension = ext.toLowerCase();

  const reader = new FileReader();
  reader.onload = (loadEvt) => {
    const b64 = loadEvt.target?.result as string;
    formImageBase64 = b64;
    formRemoveImage = false;
    formImagePreview.innerHTML = `<img src="${b64}" alt="Preview" />`;
    formBtnRemoveImage.style.display = 'inline-flex';
  };
  reader.readAsDataURL(file);
}

async function handleFormSubmit(e: Event) {
  e.preventDefault();

  const name = formName.value.trim();
  if (!name) {
    formNameError.textContent = 'Name is required.';
    formNameError.style.display = 'block';
    return;
  }
  formNameError.style.display = 'none';

  const title = formTitle.value.trim() || null;
  const quote = formQuote.value.trim() || null;
  const detail = formDetail.value.trim() || null;
  const editId = formPersonId.value;

  try {
    if (editId) {
      await updatePerson({
        id: editId,
        name,
        title,
        quote,
        detail,
        image_base64: formImageBase64,
        image_extension: formImageExtension,
        remove_image: formRemoveImage,
      });
      showToast(`Updated "${name}"`, 'success');
    } else {
      await createPerson({
        name,
        title,
        quote,
        detail,
        image_base64: formImageBase64,
        image_extension: formImageExtension,
      });
      showToast(`Added "${name}"`, 'success');
    }

    closeFormModal();
    appSummary = await getAppSummary();
    rebuildPersonsMap();
    updateBalanceDisplay();
    renderPantheonStrip();
  } catch (err) {
    showToast(`Error: ${String(err)}`, 'error');
  }
}

// --- 7. SETTINGS MODAL ---
function setupSettingsEvents() {
  settingsBtnClose.addEventListener('click', closeSettingsModal);

  modalSettings.addEventListener('click', (e) => {
    if (e.target === modalSettings) closeSettingsModal();
  });

  settingsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!appSummary) return;

    const theme = settingThemeEl.value as 'system' | 'light' | 'dark';
    const focusMin = parseInt(settingFocusEl.value, 10);
    const shortBreakMin = parseInt(settingShortBreakEl.value, 10);
    const longBreakMin = parseInt(settingLongBreakEl.value, 10);
    const cycle = parseInt(settingCycleEl.value, 10);
    const pointsPerMin = parseInt(settingPointsPerMinEl.value, 10);
    const respectCost = parseInt(settingRespectCostEl.value, 10);

    const newSettings: Settings = {
      focus_duration_minutes: focusMin,
      short_break_duration_minutes: shortBreakMin,
      long_break_duration_minutes: longBreakMin,
      sessions_before_long_break: cycle,
      points_per_focus_minute: pointsPerMin,
      respect_cost: respectCost,
      theme,
    };

    try {
      const updated = await updateSettings(newSettings);
      appSummary.settings = updated;
      applyTheme(updated.theme);
      if (timer) timer.updateSettings(updated);

      updateBalanceDisplay();
      closeSettingsModal();
      showToast('Settings saved', 'success');
    } catch (err) {
      showToast(`Error: ${String(err)}`, 'error');
    }
  });

  settingsBtnReset.addEventListener('click', async () => {
    const defaults: Settings = {
      focus_duration_minutes: 25,
      short_break_duration_minutes: 5,
      long_break_duration_minutes: 15,
      sessions_before_long_break: 4,
      points_per_focus_minute: 1,
      respect_cost: 5,
      theme: 'system',
    };

    populateSettingsForm(defaults);

    try {
      const updated = await updateSettings(defaults);
      if (appSummary) appSummary.settings = updated;
      applyTheme(updated.theme);
      if (timer) timer.updateSettings(updated);
      updateBalanceDisplay();
      closeSettingsModal();
      showToast('Defaults restored', 'success');
    } catch (err) {
      showToast(`Error: ${String(err)}`, 'error');
    }
  });
}

function openSettingsModal() {
  if (appSummary) {
    populateSettingsForm(appSummary.settings);
  }
  modalSettings.classList.add('open');
}

function closeSettingsModal() {
  modalSettings.classList.remove('open');
}

function populateSettingsForm(s: Settings) {
  settingThemeEl.value = s.theme || 'system';
  settingFocusEl.value = s.focus_duration_minutes.toString();
  settingShortBreakEl.value = s.short_break_duration_minutes.toString();
  settingLongBreakEl.value = s.long_break_duration_minutes.toString();
  settingCycleEl.value = s.sessions_before_long_break.toString();
  settingPointsPerMinEl.value = s.points_per_focus_minute.toString();
  settingRespectCostEl.value = s.respect_cost.toString();
}

// --- 8. POMODORO TIMER CONTROLS ---
function onTimerTick(state: TimerListenerState) {
  timerCountdownEl.textContent = state.formattedTime;
  timerProgressFillEl.style.width = `${state.percentage}%`;
  timerProgressFillEl.className = `progress-fill mode-${state.mode.replace('_', '-')}`;
  timerCardEl.className = `timer-card ${state.mode.replace('_', '-')}-active`;

  // Toggle button icons
  if (state.status === 'running') {
    timerPlayIcon.style.display = 'none';
    timerPauseIcon.style.display = 'block';
  } else {
    timerPlayIcon.style.display = 'block';
    timerPauseIcon.style.display = 'none';
  }

  // Mode icon buttons
  document.querySelectorAll('.timer-mode-icon-btn').forEach((btn) => {
    if (btn.getAttribute('data-mode') === state.mode) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Cycle indicator
  if (state.mode === 'focus') {
    const cur = (state.completedFocusSessions % state.sessionsBeforeLongBreak) + 1;
    timerCycleInfoEl.textContent = `${cur} / ${state.sessionsBeforeLongBreak}`;
    if (appSummary) {
      const award = appSummary.settings.focus_duration_minutes * appSummary.settings.points_per_focus_minute;
      timerRewardPointsEl.textContent = `+${award}`;
    }
  } else {
    timerCycleInfoEl.textContent = state.mode === 'short_break' ? 'Short Break' : 'Long Break';
    timerRewardPointsEl.textContent = '0';
  }
}

async function onFocusCompleted(completedMinutes: number) {
  try {
    const [pointsEarned, newBalance] = await earnFocusPoints(completedMinutes);
    if (appSummary) {
      appSummary.balance = newBalance;
      appSummary.total_earned += pointsEarned;
    }
    updateBalanceDisplay();
    showToast(`+${pointsEarned} pts`, 'gold');
  } catch (err) {
    showToast(`Error: ${String(err)}`, 'error');
  }
}

function onBreakCompleted() {
  showToast('Break finished', 'success');
}

// Timer control buttons
timerBtnToggleEl.addEventListener('click', () => {
  if (!timer) return;
  const state = timer.getState();
  if (state.status === 'running') {
    timer.pause();
  } else {
    timer.start();
  }
});

timerBtnResetEl.addEventListener('click', () => {
  if (!timer) return;
  timer.reset();
});

timerBtnSkipEl.addEventListener('click', () => {
  if (!timer) return;
  timer.skip();
});

// Mode buttons
document.getElementById('timer-btn-focus')?.addEventListener('click', () => {
  timer?.setMode('focus', false);
});
document.getElementById('timer-btn-short-break')?.addEventListener('click', () => {
  timer?.setMode('short_break', false);
});
document.getElementById('timer-btn-long-break')?.addEventListener('click', () => {
  timer?.setMode('long_break', false);
});

// --- KEYBOARD SHORTCUTS ---
function setupGlobalKeyboard() {
  window.addEventListener('keydown', (e) => {
    const tag = document.activeElement?.tagName.toLowerCase();
    const isTyping = tag === 'input' || tag === 'textarea' || tag === 'select';

    if (e.key === 'Escape') {
      if (modalPersonPopup.classList.contains('open')) closePersonPopup();
      if (modalForm.classList.contains('open')) closeFormModal();
      if (modalSettings.classList.contains('open')) closeSettingsModal();
      return;
    }

    if (e.code === 'Space' && !isTyping) {
      const anyModalOpen =
        modalPersonPopup.classList.contains('open') ||
        modalForm.classList.contains('open') ||
        modalSettings.classList.contains('open');

      if (!anyModalOpen && panelTimer.classList.contains('active')) {
        e.preventDefault();
        timerBtnToggleEl.click();
      }
    }
  });
}

// --- UTILS ---
function showToast(msg: string, type: 'gold' | 'success' | 'error' = 'gold') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = msg;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.2s';
    setTimeout(() => toast.remove(), 200);
  }, 2500);
}

function triggerFloatingFeedback(parentEl: HTMLElement, text: string) {
  const floater = document.createElement('div');
  floater.className = 'respect-feedback-floater';
  floater.textContent = text;

  const rect = parentEl.getBoundingClientRect();
  floater.style.left = `${rect.left + rect.width / 2 - 10}px`;
  floater.style.top = `${rect.top - 12}px`;

  document.body.appendChild(floater);
  setTimeout(() => floater.remove(), 800);
}

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Launch
window.addEventListener('DOMContentLoaded', initApp);
