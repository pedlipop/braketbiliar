/**
 * Dynamic Tournament Bracket Layout Engine
 * Calculates pixel coordinates for matches, supporting single-sided and double-sided layouts.
 */

window.LayoutEngine = (function() {
  const CARD_WIDTH = 240;
  const CARD_HEIGHT = 90;
  const ROUND_SPACING = 80;
  const BASE_SPACING = 140;

  function calculateLayout(matches, isDoubleSided, showThirdPlace) {
    if (!matches || matches.length === 0) {
      return { coordinates: {}, width: 600, height: 400 };
    }

    // Get bracket configuration
    const r0Count = matches.filter(m => m.round === 0 && !m.isThirdPlace).length;
    const S = r0Count * 2;
    const R = Math.log2(S);

    if (isDoubleSided && S >= 4) {
      return calculateDoubleSided(matches, S, R, showThirdPlace);
    } else {
      return calculateSingleSided(matches, S, R, showThirdPlace);
    }
  }

  function calculateSingleSided(matches, S, R, showThirdPlace) {
    const coords = {};
    const round0Count = S / 2;

    // Phase 1: Calculate coordinates round-by-round
    for (let r = 0; r < R; r++) {
      const x = r * (CARD_WIDTH + ROUND_SPACING) + 30; // 30px left padding
      const roundMatches = matches.filter(m => m.round === r && !m.isThirdPlace);

      roundMatches.forEach(m => {
        let y;
        if (r === 0) {
          // Round 0: Stack matches vertically
          y = m.index * BASE_SPACING + 40; // 40px top padding
        } else {
          // Subsequent rounds: Center parent between children
          const child1Id = `match_${r-1}_${2 * m.index}`;
          const child2Id = `match_${r-1}_${2 * m.index + 1}`;
          
          const child1Y = coords[child1Id]?.y ?? 0;
          const child2Y = coords[child2Id]?.y ?? 0;
          
          y = (child1Y + child2Y) / 2;
        }

        coords[m.id] = {
          id: m.id,
          x: x,
          y: y,
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
          side: 'left'
        };
      });
    }

    // Phase 2: Position Third Place Match if enabled
    const finalMatch = matches.find(m => m.round === R - 1 && !m.isThirdPlace);
    const thirdPlaceMatch = matches.find(m => m.isThirdPlace);

    if (thirdPlaceMatch && finalMatch && coords[finalMatch.id]) {
      const finalCoords = coords[finalMatch.id];
      coords[thirdPlaceMatch.id] = {
        id: thirdPlaceMatch.id,
        x: finalCoords.x,
        y: finalCoords.y + BASE_SPACING,
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        side: 'left'
      };
    }

    // Phase 3: Compute boundaries
    const totalWidth = R * (CARD_WIDTH + ROUND_SPACING) - ROUND_SPACING + 100;
    const totalHeight = round0Count * BASE_SPACING + 100;

    return { coordinates: coords, width: totalWidth, height: totalHeight };
  }

  function calculateDoubleSided(matches, S, R, showThirdPlace) {
    const coords = {};
    const R_prime = R - 1; // Rounds on each side
    const halfRound0Count = S / 4;

    // Calculate dimensions
    const sideWidth = R_prime * (CARD_WIDTH + ROUND_SPACING);
    const totalWidth = 2 * sideWidth + CARD_WIDTH + 160; // Left side + Right side + Center Final + Padding
    const xCenter = totalWidth / 2;

    // Phase 1: Left Side Layout (converges to center)
    for (let r = 0; r < R_prime; r++) {
      const x = r * (CARD_WIDTH + ROUND_SPACING) + 40;
      const leftRoundMatches = matches.filter(m => m.round === r && m.side === 'left');

      leftRoundMatches.forEach(m => {
        let y;
        if (r === 0) {
          y = m.index * BASE_SPACING + 40;
        } else {
          const child1Id = `match_${r-1}_${2 * m.index}`;
          const child2Id = `match_${r-1}_${2 * m.index + 1}`;
          
          const child1Y = coords[child1Id]?.y ?? 0;
          const child2Y = coords[child2Id]?.y ?? 0;
          
          y = (child1Y + child2Y) / 2;
        }

        coords[m.id] = {
          id: m.id,
          x: x,
          y: y,
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
          side: 'left'
        };
      });
    }

    // Phase 2: Right Side Layout (converges to center)
    for (let r = 0; r < R_prime; r++) {
      const x = totalWidth - 40 - CARD_WIDTH - r * (CARD_WIDTH + ROUND_SPACING);
      const rightRoundMatches = matches.filter(m => m.round === r && m.side === 'right');

      rightRoundMatches.forEach(m => {
        let y;
        const mappedIdx = m.index - (S / Math.pow(2, r + 2)); // Offset index to align with top
        
        if (r === 0) {
          y = mappedIdx * BASE_SPACING + 40;
        } else {
          const child1Id = `match_${r-1}_${2 * m.index}`;
          const child2Id = `match_${r-1}_${2 * m.index + 1}`;
          
          const child1Y = coords[child1Id]?.y ?? 0;
          const child2Y = coords[child2Id]?.y ?? 0;
          
          y = (child1Y + child2Y) / 2;
        }

        coords[m.id] = {
          id: m.id,
          x: x,
          y: y,
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
          side: 'right'
        };
      });
    }

    // Phase 3: Center Final Match Layout
    const finalMatch = matches.find(m => m.round === R - 1 && !m.isThirdPlace);
    if (finalMatch) {
      // It is fed by Left Semifinal (round R-2, index 0) and Right Semifinal (round R-2, index 1)
      const leftSemiId = `match_${R-2}_0`;
      const rightSemiId = `match_${R-2}_1`;

      const leftSemiY = coords[leftSemiId]?.y ?? (halfRound0Count - 0.5) * BASE_SPACING + 40;
      const rightSemiY = coords[rightSemiId]?.y ?? (halfRound0Count - 0.5) * BASE_SPACING + 40;

      const y = (leftSemiY + rightSemiY) / 2;
      const x = xCenter - CARD_WIDTH / 2;

      coords[finalMatch.id] = {
        id: finalMatch.id,
        x: x,
        y: y,
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        side: 'center'
      };

      // Phase 4: Position Third Place Match if enabled
      const thirdPlaceMatch = matches.find(m => m.isThirdPlace);
      if (thirdPlaceMatch) {
        coords[thirdPlaceMatch.id] = {
          id: thirdPlaceMatch.id,
          x: x,
          y: y + BASE_SPACING,
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
          side: 'center'
        };
      }
    }

    const totalHeight = Math.max(
      halfRound0Count * BASE_SPACING + 100,
      showThirdPlace ? (halfRound0Count * BASE_SPACING + 240) : 0
    );

    return { coordinates: coords, width: totalWidth, height: totalHeight };
  }

  return {
    calculateLayout,
    CARD_WIDTH,
    CARD_HEIGHT
  };
})();
