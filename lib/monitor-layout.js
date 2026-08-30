function hideRect() {
  return { x: -9999, y: 0, width: 0, height: 0 };
}

function computeSlotBounds({
  activeTab,
  viewMode,
  activeSlotId,
  navWidth,
  totalSlots,
  gridRects,
  stageRect,
  slots
}) {
  return Array.from({ length: totalSlots }, (_, index) => {
    const slotState = slots ? slots[index] : null;

    if (activeTab !== 'custom' && activeTab !== 'monitor' && activeTab !== 'competitor') {
      return hideRect();
    }

    // WebContentsView 在真实页面承载阶段保持可见，包括停播页。
    if (!slotState || !['live', 'browsing', 'ended'].includes(slotState.phase)) {
      return hideRect();
    }

    if (viewMode === 'fullscreen') {
      if (!stageRect || index !== activeSlotId) {
        return hideRect();
      }

      return {
        x: navWidth + stageRect.x,
        y: stageRect.y,
        width: stageRect.w,
        height: stageRect.h
      };
    }

    const rect = gridRects[index];
    if (!rect) {
      return hideRect();
    }

    return {
      x: Math.round(navWidth + rect.x),
      y: Math.round(rect.y),
      width: Math.max(0, Math.round(rect.w)),
      height: Math.max(0, Math.round(rect.h))
    };
  });
}

module.exports = {
  computeSlotBounds
};
