/**
 * SVG Connector Lines Renderer
 * Draws connector paths linking child matches to parent slots.
 */

window.ConnectorRenderer = (function() {
  
  function drawConnectors(svgElement, matches, coordinates, highlightedPlayerId) {
    if (!svgElement) return;
    
    // Clear previous SVG content
    svgElement.innerHTML = '';
    
    const cardWidth = window.LayoutEngine.CARD_WIDTH;
    const cardHeight = window.LayoutEngine.CARD_HEIGHT;

    matches.forEach(m => {
      // Hide connector if child match was a BYE match in Round 0
      if (m.round === 0 && (m.p1?.id === 'BYE' || m.p2?.id === 'BYE')) {
        return;
      }

      // We only draw paths from child to parent (so if match has destMatchId)
      if (!m.destMatchId) return;

      const destMatch = matches.find(dm => dm.id === m.destMatchId);
      if (!destMatch) return;

      const startCoord = coordinates[m.id];
      const endCoord = coordinates[destMatch.id];
      
      if (!startCoord || !endCoord) return;

      let xStart, yStart, xEnd, yEnd;
      const isLeft = startCoord.side === 'left';

      // Y positioning: feed directly into the target slot of the parent
      const destSlotYOffset = m.destParam === 'p1' ? (cardHeight / 4) : (3 * cardHeight / 4);

      if (isLeft) {
        xStart = startCoord.x + cardWidth;
        yStart = startCoord.y + cardHeight / 2;
        xEnd = endCoord.x;
        yEnd = endCoord.y + destSlotYOffset;
      } else {
        // Right side feeds from left of child to right of parent
        xStart = startCoord.x;
        yStart = startCoord.y + cardHeight / 2;
        xEnd = endCoord.x + cardWidth;
        yEnd = endCoord.y + destSlotYOffset;
      }

      // Calculate shoulder point
      const xMid = (xStart + xEnd) / 2;

      // Draw SVG Path: horizontal -> vertical -> horizontal
      const pathData = `M ${xStart} ${yStart} L ${xMid} ${yStart} L ${xMid} ${yEnd} L ${xEnd} ${yEnd}`;

      // Create SVG Path element
      const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      pathEl.setAttribute('d', pathData);
      pathEl.setAttribute('class', 'connector-path');
      pathEl.setAttribute('data-source', m.id);
      pathEl.setAttribute('data-target', destMatch.id);

      // Classes for visual states
      let isWinnerPath = false;
      let isHighlightedPath = false;

      // If match has a winner and that winner advanced to destination
      if (m.winner && (destMatch.p1?.id === m.winner.id || destMatch.p2?.id === m.winner.id)) {
        isWinnerPath = true;
        pathEl.classList.add('winner-path');
      }

      // If we are tracking a highlighted participant
      if (highlightedPlayerId) {
        const isPlayerInSource = (m.p1 && m.p1.id === highlightedPlayerId) || 
                                 (m.p2 && m.p2.id === highlightedPlayerId);
        
        const isPlayerWinner = m.winner && m.winner.id === highlightedPlayerId;

        // The path is highlighted if the player is in the source match AND either:
        // - They won and advanced (isPlayerWinner)
        // - Or this is their entry round match (so it's the start of their path)
        if (isPlayerInSource && (isPlayerWinner || m.round === 0)) {
          isHighlightedPath = true;
          pathEl.classList.add('highlighted');
        }
      }

      svgElement.appendChild(pathEl);
    });
  }

  return {
    drawConnectors
  };
})();
