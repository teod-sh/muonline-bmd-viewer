import type { ViewerTab } from './explorer-types';

const CONTROL_MENU_STORAGE_KEY = 'bmd-viewer-control-menu-state';

const VIEW_BADGE: Record<ViewerTab, string> = {
  bmd: 'Model',
  character: 'Character',
  terrain: 'World',
};

export const DEFAULT_CONTROL_MENU_SECTIONS = {
  'bmd-import-section': false,
  'bmd-animation-section': false,
  'bmd-viewport-section': false,
  'blending-controls': false,
  'bmd-attachment-section': false,
  'diagnostics-panel': false,
  'export-controls': false,
  'character-data-section': false,
  'character-profile-section': true,
  'character-equipment-section': false,
  'character-effects-section': false,
  'character-presets-section': false,
  'character-animation-section': false,
  'character-viewport-section': false,
  'character-blending-controls': false,
  'character-export-controls': false,
  'terrain-world-data-section': false,
  'terrain-navigation-section': false,
  'terrain-viewport-section': false,
  'terrain-object-section': false,
  'terrain-stats': false,
} as const;

export type ControlMenuSectionId = keyof typeof DEFAULT_CONTROL_MENU_SECTIONS;

export interface ControlMenuState {
  sidebarCollapsed: boolean;
  sections: Record<ControlMenuSectionId, boolean>;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface InitControlMenuOptions {
  storage?: StorageLike;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function createDefaultControlMenuState(): ControlMenuState {
  return {
    sidebarCollapsed: false,
    sections: { ...DEFAULT_CONTROL_MENU_SECTIONS },
  };
}

export function mergeControlMenuState(value: unknown): ControlMenuState {
  const defaults = createDefaultControlMenuState();
  if (!isRecord(value)) {
    return defaults;
  }

  const mergedSections = { ...defaults.sections };
  const rawSections = isRecord(value.sections) ? value.sections : null;
  if (rawSections) {
    (Object.keys(DEFAULT_CONTROL_MENU_SECTIONS) as ControlMenuSectionId[]).forEach(sectionId => {
      if (typeof rawSections[sectionId] === 'boolean') {
        mergedSections[sectionId] = rawSections[sectionId] as boolean;
      }
    });
  }

  return {
    sidebarCollapsed: typeof value.sidebarCollapsed === 'boolean'
      ? value.sidebarCollapsed
      : defaults.sidebarCollapsed,
    sections: mergedSections,
  };
}

export function setControlMenuSectionExpanded(
  state: ControlMenuState,
  sectionId: string,
  expanded: boolean,
): ControlMenuState {
  if (!(sectionId in DEFAULT_CONTROL_MENU_SECTIONS)) {
    return state;
  }

  const typedSectionId = sectionId as ControlMenuSectionId;
  if (state.sections[typedSectionId] === expanded) {
    return state;
  }

  return {
    ...state,
    sections: {
      ...state.sections,
      [typedSectionId]: expanded,
    },
  };
}

export function toggleControlMenuSection(state: ControlMenuState, sectionId: string): ControlMenuState {
  if (!(sectionId in DEFAULT_CONTROL_MENU_SECTIONS)) {
    return state;
  }

  const typedSectionId = sectionId as ControlMenuSectionId;
  return setControlMenuSectionExpanded(state, typedSectionId, !state.sections[typedSectionId]);
}

export function setControlMenuSidebarCollapsed(state: ControlMenuState, collapsed: boolean): ControlMenuState {
  if (state.sidebarCollapsed === collapsed) {
    return state;
  }

  return {
    ...state,
    sidebarCollapsed: collapsed,
  };
}

function readControlMenuState(storage: StorageLike): ControlMenuState {
  try {
    const rawValue = storage.getItem(CONTROL_MENU_STORAGE_KEY);
    if (!rawValue) {
      return createDefaultControlMenuState();
    }

    return mergeControlMenuState(JSON.parse(rawValue));
  } catch {
    return createDefaultControlMenuState();
  }
}

function writeControlMenuState(storage: StorageLike, state: ControlMenuState): void {
  storage.setItem(CONTROL_MENU_STORAGE_KEY, JSON.stringify(state));
}

function updateSectionUi(section: HTMLElement, expanded: boolean): void {
  section.classList.toggle('is-collapsed', !expanded);
  section.setAttribute('data-expanded', expanded ? 'true' : 'false');

  const toggle = section.querySelector<HTMLButtonElement>(':scope > .control-section-toggle');
  const body = section.querySelector<HTMLElement>(':scope > .control-section-body');
  toggle?.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  if (body) {
    body.hidden = !expanded;
  }
}

function createSectionToggle(section: HTMLElement, title: string): HTMLButtonElement {
  const badge = section.dataset.menuBadge?.trim() ?? '';

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'control-section-toggle';

  const titleRow = document.createElement('span');
  titleRow.className = 'control-section-title-row';

  const titleLabel = document.createElement('span');
  titleLabel.className = 'control-section-title';
  titleLabel.textContent = title;
  titleRow.appendChild(titleLabel);

  if (badge) {
    const badgeEl = document.createElement('span');
    badgeEl.className = 'control-section-badge';
    badgeEl.textContent = badge;
    titleRow.appendChild(badgeEl);
  }

  const chevron = document.createElement('span');
  chevron.className = 'control-section-chevron';
  chevron.setAttribute('aria-hidden', 'true');
  chevron.textContent = '▾';

  toggle.append(titleRow, chevron);
  return toggle;
}

function decorateSection(section: HTMLElement): void {
  if (section.dataset.menuEnhanced === 'true') {
    return;
  }

  const heading = section.querySelector<HTMLHeadingElement>(':scope > h3');
  if (!heading) {
    return;
  }

  const title = heading.textContent?.trim() || section.id;
  const body = document.createElement('div');
  body.className = 'control-section-body';

  let sibling = heading.nextSibling;
  while (sibling) {
    const next = sibling.nextSibling;
    body.appendChild(sibling);
    sibling = next;
  }

  const toggle = createSectionToggle(section, title);
  heading.remove();
  section.prepend(toggle);
  section.appendChild(body);
  section.dataset.menuEnhanced = 'true';
}

function notifyViewportResize(): void {
  window.dispatchEvent(new Event('resize'));
}

function updateViewBadge(view: ViewerTab): void {
  const badge = document.getElementById('sidebar-view-badge');
  if (badge) {
    badge.textContent = VIEW_BADGE[view];
  }
}

function scheduleViewportResize(resizeTimeoutRef: { current: number | null }): void {
  notifyViewportResize();
  window.requestAnimationFrame(notifyViewportResize);

  if (resizeTimeoutRef.current !== null) {
    window.clearTimeout(resizeTimeoutRef.current);
  }
  resizeTimeoutRef.current = window.setTimeout(notifyViewportResize, 320);
}

function setActiveView(target: ViewerTab): void {
  const tabButtons = document.querySelectorAll<HTMLButtonElement>('.tab-btn');
  const sidebarViews: Record<ViewerTab, HTMLElement | null> = {
    bmd: document.getElementById('sidebar-bmd'),
    character: document.getElementById('sidebar-character'),
    terrain: document.getElementById('sidebar-terrain'),
  };
  const mainViews: Record<ViewerTab, HTMLElement | null> = {
    bmd: document.getElementById('view-bmd'),
    character: document.getElementById('view-character'),
    terrain: document.getElementById('view-terrain'),
  };
  const statusElements: Record<ViewerTab, HTMLElement | null> = {
    bmd: document.getElementById('status'),
    character: document.getElementById('character-status'),
    terrain: document.getElementById('terrain-status-bar'),
  };

  tabButtons.forEach(button => {
    button.classList.toggle('active', button.dataset.view === target);
  });

  (Object.keys(sidebarViews) as ViewerTab[]).forEach(view => {
    sidebarViews[view]?.classList.toggle('hidden', view !== target);
    mainViews[view]?.classList.toggle('hidden', view !== target);
    statusElements[view]?.classList.toggle('hidden', view !== target);
  });

  updateViewBadge(target);
}

export function initControlMenu(options: InitControlMenuOptions = {}): void {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) {
    return;
  }

  const storage = options.storage ?? window.localStorage;
  let state = readControlMenuState(storage);
  const resizeTimeoutRef: { current: number | null } = { current: null };

  const persist = (): void => {
    writeControlMenuState(storage, state);
  };

  const applySidebarState = (): void => {
    sidebar.classList.toggle('closed', state.sidebarCollapsed);
  };

  const applySectionState = (sectionId: ControlMenuSectionId): void => {
    const section = document.getElementById(sectionId);
    if (!section) {
      return;
    }

    decorateSection(section);
    updateSectionUi(section, state.sections[sectionId]);
  };

  const allSectionIds = Object.keys(DEFAULT_CONTROL_MENU_SECTIONS) as ControlMenuSectionId[];
  allSectionIds.forEach(sectionId => applySectionState(sectionId));
  applySidebarState();

  allSectionIds.forEach(sectionId => {
    const section = document.getElementById(sectionId);
    const toggle = section?.querySelector<HTMLButtonElement>(':scope > .control-section-toggle');
    toggle?.addEventListener('click', () => {
      state = toggleControlMenuSection(state, sectionId);
      applySectionState(sectionId);
      persist();
    });
  });

  const sidebarToggles = [
    document.getElementById('sidebar-toggle'),
    document.getElementById('character-sidebar-toggle'),
    document.getElementById('terrain-sidebar-toggle'),
  ].filter((value): value is HTMLElement => value instanceof HTMLElement);

  sidebarToggles.forEach(button => {
    button.addEventListener('click', () => {
      state = setControlMenuSidebarCollapsed(state, !state.sidebarCollapsed);
      applySidebarState();
      persist();
      scheduleViewportResize(resizeTimeoutRef);
    });
  });

  sidebar.addEventListener('transitionend', event => {
    if (event.target !== sidebar) {
      return;
    }

    if (event.propertyName !== 'transform' && event.propertyName !== 'margin-right') {
      return;
    }

    notifyViewportResize();
  });

  const tabButtons = document.querySelectorAll<HTMLButtonElement>('.tab-btn');
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const target = (button.dataset.view || 'bmd') as ViewerTab;
      setActiveView(target);
      scheduleViewportResize(resizeTimeoutRef);
    });
  });

  setActiveView('bmd');
}
