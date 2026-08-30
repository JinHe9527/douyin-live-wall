function createSlot(index) {
  return {
    index,
    title: '',
    query: '',
    roomUrl: '',
    phase: 'empty', // empty | browsing | live | ended | error | candidates | captcha
    health: 'unknown', // unknown | live | loading | paused | no-video | ended | captcha
    healthSince: 0, // 时间戳，用于自愈逻辑判断红灯时长
    candidateOpen: false,
    candidates: [],
    restorePending: false
  };
}

function createMonitorState(totalSlots) {
  return {
    viewMode: 'grid',
    activeSlotId: null,
    targetSlotId: null,
    slots: Array.from({ length: totalSlots }, (_, index) => createSlot(index))
  };
}

function setSlotQuery(state, index, query) {
  const slots = state.slots.slice();
  slots[index] = { ...slots[index], query };
  return { ...state, slots };
}

function setSlotPhase(state, index, phase) {
  const slots = state.slots.slice();
  slots[index] = { ...slots[index], phase };
  return { ...state, slots };
}

function setSlotHealth(state, index, health, now = Date.now()) {
  const slots = state.slots.slice();
  const prev = slots[index];
  if (!prev) return state;
  // 仅在状态变化时更新 healthSince，避免自愈窗口被频繁重置
  const next = prev.health === health
    ? { ...prev, health }
    : { ...prev, health, healthSince: now };
  slots[index] = next;
  return { ...state, slots };
}

function setSlotCandidates(state, index, candidates) {
  const slots = state.slots.slice();
  slots[index] = {
    ...slots[index],
    candidates,
    candidateOpen: true,
    phase: 'candidates'
  };
  return { ...state, slots };
}

function bindSlotPage(state, index, page) {
  const slots = state.slots.slice();
  slots[index] = {
    ...slots[index],
    title: page.title,
    roomUrl: page.roomUrl,
    restorePending: false,
    phase: page.phase || 'browsing'
  };
  return { ...state, slots };
}

function bindSlotRoom(state, index, room) {
  const nextState = bindSlotPage(state, index, {
    title: room.title,
    roomUrl: room.roomUrl,
    phase: 'live'
  });
  const slots = nextState.slots.slice();
  slots[index] = {
    ...slots[index],
    candidateOpen: false,
    candidates: []
  };
  return { ...nextState, slots };
}

function resetSlot(state, index) {
  const slots = state.slots.slice();
  slots[index] = createSlot(index);
  const clearedActive = state.activeSlotId === index;
  return {
    ...state,
    viewMode: clearedActive ? 'grid' : state.viewMode,
    activeSlotId: clearedActive ? null : state.activeSlotId,
    targetSlotId: state.targetSlotId === index ? null : state.targetSlotId,
    slots
  };
}

function setTargetSlot(state, index) {
  return { ...state, targetSlotId: index };
}

function clearTargetSlot(state) {
  return { ...state, targetSlotId: null };
}

function enterFullscreen(state, index) {
  return {
    ...state,
    viewMode: 'fullscreen',
    activeSlotId: index,
    targetSlotId: index
  };
}

function exitFullscreen(state) {
  return {
    ...state,
    viewMode: 'grid',
    activeSlotId: null,
    targetSlotId: state.activeSlotId,
    slots: state.slots.map((slot, index) => ({
      ...slot,
      restorePending: Boolean(slot.roomUrl) && index !== state.activeSlotId
    }))
  };
}

function clearRestorePending(state, index) {
  const slots = state.slots.slice();
  slots[index] = { ...slots[index], restorePending: false };
  return { ...state, slots };
}

module.exports = {
  createSlot,
  createMonitorState,
  setSlotQuery,
  setSlotPhase,
  setSlotHealth,
  setSlotCandidates,
  setTargetSlot,
  clearTargetSlot,
  bindSlotPage,
  bindSlotRoom,
  resetSlot,
  enterFullscreen,
  exitFullscreen,
  clearRestorePending
};
