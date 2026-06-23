/**
 * Viewport Interactive Pan and Zoom Controller
 * Handles 60fps dragging, mouse wheel zoom, touch pinching, and smooth target centering.
 */

window.PanZoom = (function() {
  let viewport = null;
  let workspace = null;
  
  let zoom = 1.0;
  let panX = 0;
  let panY = 0;
  
  let isDragging = false;
  let startX = 0;
  let startY = 0;
  
  // Touch Pinch state
  let initialPinchDist = 0;
  let initialZoom = 1.0;
  let initialCentroid = { x: 0, y: 0 };
  let initialPan = { x: 0, y: 0 };
  let lastTouchTime = 0;

  function init(viewportEl, workspaceEl) {
    viewport = viewportEl;
    workspace = workspaceEl;

    // Mouse events
    viewport.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    viewport.addEventListener('wheel', onWheel, { passive: false });

    // Touch events
    viewport.addEventListener('touchstart', onTouchStart, { passive: false });
    viewport.addEventListener('touchmove', onTouchMove, { passive: false });
    viewport.addEventListener('touchend', onTouchEnd);

    // Double click to zoom reset/focus
    viewport.addEventListener('dblclick', onDblClick);

    // Initial center layout
    setTimeout(recenter, 100);
  }

  function updateTransform() {
    if (!workspace) return;
    workspace.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
  }

  // Mouse drag handlers
  function onMouseDown(e) {
    // Check if clicking inside cards, buttons or inputs
    if (e.target.closest('.match-card') || 
        e.target.closest('button') || 
        e.target.closest('input') || 
        e.target.closest('select')) {
      return;
    }
    
    isDragging = true;
    startX = e.clientX - panX;
    startY = e.clientY - panY;
    viewport.style.cursor = 'grabbing';
  }

  function onMouseMove(e) {
    if (!isDragging) return;
    panX = e.clientX - startX;
    panY = e.clientY - startY;
    updateTransform();
  }

  function onMouseUp() {
    if (!isDragging) return;
    isDragging = false;
    viewport.style.cursor = 'grab';
  }

  // Wheel zoom centered on cursor
  function onWheel(e) {
    e.preventDefault();
    const rect = viewport.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Current workspace coordinates under the mouse
    const wsX = (mouseX - panX) / zoom;
    const wsY = (mouseY - panY) / zoom;

    // Calculate new zoom
    const zoomFactor = 1.1;
    let newZoom;
    if (e.deltaY < 0) {
      newZoom = zoom * zoomFactor;
    } else {
      newZoom = zoom / zoomFactor;
    }

    // Constraints
    newZoom = Math.max(0.2, Math.min(3.0, newZoom));

    // Update pan values to keep same workspace point under the mouse
    panX = mouseX - wsX * newZoom;
    panY = mouseY - wsY * newZoom;
    zoom = newZoom;

    updateTransform();
  }

  // Touch handlers
  function onTouchStart(e) {
    const rect = viewport.getBoundingClientRect();
    
    if (e.touches.length === 1) {
      // Prevent drag conflicts when clicking on cards/inputs
      if (e.target.closest('.match-card') || e.target.closest('button') || e.target.closest('input')) {
        return;
      }
      
      const now = Date.now();
      if (now - lastTouchTime < 300) {
        // Double tap zoom
        e.preventDefault();
        const touchX = e.touches[0].clientX - rect.left;
        const touchY = e.touches[0].clientY - rect.top;
        zoomToPoint(touchX, touchY, zoom > 1.0 ? 1.0 : 1.5);
        lastTouchTime = 0;
        return;
      }
      lastTouchTime = now;

      isDragging = true;
      startX = e.touches[0].clientX - panX;
      startY = e.touches[0].clientY - panY;
    } else if (e.touches.length === 2) {
      isDragging = false; // Disable single finger drag during pinch
      e.preventDefault();

      const t1 = e.touches[0];
      const t2 = e.touches[1];

      initialPinchDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      initialZoom = zoom;

      // Centroid of pinch relative to viewport
      initialCentroid = {
        x: ((t1.clientX + t2.clientX) / 2) - rect.left,
        y: ((t1.clientY + t2.clientY) / 2) - rect.top
      };

      initialPan = { x: panX, y: panY };
    }
  }

  function onTouchMove(e) {
    if (e.touches.length === 1 && isDragging) {
      panX = e.touches[0].clientX - startX;
      panY = e.touches[0].clientY - startY;
      updateTransform();
    } else if (e.touches.length === 2) {
      e.preventDefault();
      const rect = viewport.getBoundingClientRect();
      const t1 = e.touches[0];
      const t2 = e.touches[1];

      const currentDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      if (initialPinchDist === 0) return;

      const scaleRatio = currentDist / initialPinchDist;
      let newZoom = initialZoom * scaleRatio;
      newZoom = Math.max(0.2, Math.min(3.0, newZoom));

      const centroid = {
        x: ((t1.clientX + t2.clientX) / 2) - rect.left,
        y: ((t1.clientY + t2.clientY) / 2) - rect.top
      };

      // Workspace points under original centroid
      const wsX = (initialCentroid.x - initialPan.x) / initialZoom;
      const wsY = (initialCentroid.y - initialPan.y) / initialZoom;

      // Update positions
      zoom = newZoom;
      panX = centroid.x - wsX * zoom;
      panY = centroid.y - wsY * zoom;

      updateTransform();
    }
  }

  function onTouchEnd() {
    isDragging = false;
    initialPinchDist = 0;
  }

  function onDblClick(e) {
    if (e.target.closest('.match-card') || e.target.closest('button')) return;
    const rect = viewport.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    zoomToPoint(mouseX, mouseY, zoom > 1.0 ? 1.0 : 1.5);
  }

  function zoomToPoint(vx, vy, targetZoom) {
    const wsX = (vx - panX) / zoom;
    const wsY = (vy - panY) / zoom;

    zoom = targetZoom;
    panX = vx - wsX * zoom;
    panY = vy - wsY * zoom;

    applySmoothTransition();
  }

  // Smooth animation to focus on a particular match coordinate
  function focusOnMatch(x, y, cardWidth, cardHeight) {
    if (!viewport || !workspace) return;
    const vRect = viewport.getBoundingClientRect();
    
    // Viewport center
    const vCenterX = vRect.width / 2;
    const vCenterY = vRect.height / 2;

    // Card center
    const cardCenterX = x + cardWidth / 2;
    const cardCenterY = y + cardHeight / 2;

    // Set focal zoom
    zoom = Math.max(1.0, zoom); // Keep current zoom if zoomed in, otherwise set to 1.0

    // Coordinates pan positioning
    panX = vCenterX - cardCenterX * zoom;
    panY = vCenterY - cardCenterY * zoom;

    applySmoothTransition();
  }

  function applySmoothTransition() {
    // Add temporary CSS transition class for smooth motion
    workspace.style.transition = 'transform 0.4s cubic-bezier(0.25, 1, 0.5, 1)';
    updateTransform();
    
    // Remove transition after animation ends so drag remains real-time and responsive
    setTimeout(() => {
      if (workspace) workspace.style.transition = '';
    }, 400);
  }

  // Center/re-center the entire workspace
  function recenter() {
    if (!viewport || !workspace) return;
    const vRect = viewport.getBoundingClientRect();
    const wWidth = parseInt(workspace.style.width) || 2000;
    const wHeight = parseInt(workspace.style.height) || 1200;

    zoom = 0.85; // Fit-to-screen scale
    if (vRect.width < 600) zoom = 0.45; // mobile zoom
    
    panX = (vRect.width - wWidth * zoom) / 2;
    panY = (vRect.height - wHeight * zoom) / 2;

    applySmoothTransition();
  }

  function getZoom() { return zoom; }
  function setZoom(val) { zoom = Math.max(0.2, Math.min(3.0, val)); updateTransform(); }

  return {
    init,
    focusOnMatch,
    recenter,
    getZoom,
    setZoom
  };
})();
