/**
 * UI Manager Module
 * Coordinates event bindings, rendering layers, modals, drawer sliding, and leaderboard sorting.
 */

window.UI = (function() {
  let isAdminMode = false;
  let highlightedPlayerId = null;
  let isDoubleSided = false;

  // Swap participant state
  let swapSource = null; // { matchId, param }

  // Sorting state for Leaderboard
  let sortColumn = 'rank';
  let sortDirection = 'asc'; // 'asc' or 'desc'

  function init() {
    bindEvents();
    renderAll();
  }

  function bindEvents() {
    // 1. Tab Switching
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        const targetTab = e.target.getAttribute('data-tab');
        
        // Toggle tab activation buttons
        document.querySelectorAll('.nav-tab').forEach(t => {
          t.classList.remove('active');
          t.setAttribute('aria-selected', 'false');
        });
        e.target.classList.add('active');
        e.target.setAttribute('aria-selected', 'true');

        // Toggle panels
        document.querySelectorAll('.tab-panel').forEach(panel => {
          panel.classList.remove('active');
        });
        document.getElementById(`tab-${targetTab}`).classList.add('active');

        // Re-render target panel data if necessary
        if (targetTab === 'leaderboard') renderLeaderboard();
        if (targetTab === 'progress') renderProgressTracker();
        if (targetTab === 'participants') renderParticipantsTab();
        if (targetTab === 'bracket') {
          renderBracket();
          setTimeout(() => window.PanZoom.recenter(), 50);
        }
      });
    });

    // 2. View/Edit Mode switch
    const viewModeCheckbox = document.getElementById('view-mode-checkbox');
    viewModeCheckbox.addEventListener('change', (e) => {
      isAdminMode = e.target.checked;
      
      const badgeEdit = document.getElementById('badge-edit-mode');
      const adminElements = document.querySelectorAll('.admin-only');

      if (isAdminMode) {
        badgeEdit.classList.remove('hide');
        adminElements.forEach(el => el.classList.remove('hide'));
      } else {
        badgeEdit.classList.add('hide');
        adminElements.forEach(el => el.classList.add('hide'));
        // Cancel swap if active
        clearSwapSource();
      }

      // Refresh rendering to toggle edit capabilities
      renderBracket();
      renderParticipantsTab();
    });

    // 3. High Contrast Mode Toggle
    document.getElementById('btn-contrast').addEventListener('click', () => {
      document.body.classList.toggle('high-contrast');
    });

    // 4. Bracket View Modes
    document.getElementById('btn-single-side').addEventListener('click', (e) => {
      document.getElementById('btn-double-side').classList.remove('active');
      e.target.classList.add('active');
      isDoubleSided = false;
      renderBracket();
    });

    document.getElementById('btn-double-side').addEventListener('click', (e) => {
      document.getElementById('btn-single-side').classList.remove('active');
      e.target.classList.add('active');
      isDoubleSided = true;
      renderBracket();
    });

    // 5. Zoom actions
    document.getElementById('btn-zoom-in').addEventListener('click', () => {
      const z = window.PanZoom.getZoom();
      window.PanZoom.setZoom(z * 1.15);
    });

    document.getElementById('btn-zoom-out').addEventListener('click', () => {
      const z = window.PanZoom.getZoom();
      window.PanZoom.setZoom(z / 1.15);
    });

    document.getElementById('btn-zoom-reset').addEventListener('click', () => {
      window.PanZoom.recenter();
    });

    // 6. Search Locator
    const searchInput = document.getElementById('bracket-player-search');
    const suggestionsBox = document.getElementById('search-suggestions');

    searchInput.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      if (!q) {
        suggestionsBox.classList.add('hide');
        return;
      }

      const players = window.BracketEngine.getParticipants().filter(p => 
        p.name.toLowerCase().includes(q) || p.companyId.toLowerCase().includes(q)
      );

      if (players.length === 0) {
        suggestionsBox.innerHTML = '<div class="suggestion-item">No player found</div>';
      } else {
        suggestionsBox.innerHTML = players.map(p => `
          <div class="suggestion-item" data-id="${p.id}">
            <strong>${p.name}</strong> <span class="slot-company">(${p.companyId})</span>
          </div>
        `).join('');
      }
      suggestionsBox.classList.remove('hide');
    });

    // Click suggestion item
    suggestionsBox.addEventListener('click', (e) => {
      const suggestionItem = e.target.closest('.suggestion-item');
      if (!suggestionItem) return;

      const pId = suggestionItem.getAttribute('data-id');
      if (pId) {
        locatePlayer(pId);
        searchInput.value = '';
      }
      suggestionsBox.classList.add('hide');
    });

    // Hide suggestions when clicking outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.search-locator-container')) {
        suggestionsBox.classList.add('hide');
      }
    });

    // 7. Lock Tournament
    const lockTournamentBtn = document.getElementById('btn-lock-tournament');
    lockTournamentBtn.addEventListener('click', () => {
      const isLocked = window.BracketEngine.getTournamentLock();
      window.BracketEngine.setTournamentLock(!isLocked);
      
      const badgeLocked = document.getElementById('badge-locked');
      if (!isLocked) {
        lockTournamentBtn.textContent = '🔓 Unlock Bracket';
        lockTournamentBtn.classList.remove('danger-outline');
        lockTournamentBtn.classList.add('success');
        badgeLocked.classList.remove('hide');
      } else {
        lockTournamentBtn.textContent = '🔒 Lock Bracket';
        lockTournamentBtn.classList.remove('success');
        lockTournamentBtn.classList.add('danger-outline');
        badgeLocked.classList.add('hide');
      }
      renderBracket();
    });

    // 8. Drawer: Player details closing
    document.getElementById('btn-close-drawer').addEventListener('click', closePlayerDrawer);

    // 9. Drawer: Save/Edit Participant form
    document.getElementById('edit-player-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const id = document.getElementById('edit-player-id').value;
      const name = document.getElementById('edit-player-name').value;
      const companyId = document.getElementById('edit-player-company').value;
      const seed = document.getElementById('edit-player-seed').value;

      try {
        window.BracketEngine.editParticipant(id, name, companyId, seed);
        closePlayerDrawer();
        renderAll();
      } catch (err) {
        alert(err.message);
      }
    });

    // Drawer: Delete participant
    document.getElementById('btn-delete-player-drawer').addEventListener('click', () => {
      const id = document.getElementById('edit-player-id').value;
      if (confirm("Are you sure you want to delete this participant? This will clear current bracket matches.")) {
        window.BracketEngine.deleteParticipant(id);
        closePlayerDrawer();
        window.BracketEngine.resetBracket(); // Force regeneration
        renderAll();
      }
    });

    // 10. Match Modal Form Score Save
    document.getElementById('match-editor-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const matchId = document.getElementById('match-edit-id').value;
      const s1 = document.getElementById('match-p1-score').value;
      const s2 = document.getElementById('match-p2-score').value;
      const isLocked = document.getElementById('match-lock-checkbox').checked;

      try {
        // First check lock state
        const match = window.BracketEngine.getMatches().find(m => m.id === matchId);
        if (match.isLocked !== isLocked) {
          window.BracketEngine.toggleMatchLock(matchId);
        }
        
        window.BracketEngine.updateMatchScore(matchId, s1, s2);
        closeMatchModal();
        renderBracket();
      } catch (err) {
        alert(err.message);
      }
    });

    // Force Winner buttons inside modal
    document.getElementById('btn-force-p1').addEventListener('click', () => {
      const matchId = document.getElementById('match-edit-id').value;
      try {
        window.BracketEngine.forceMatchWinner(matchId, 'p1');
        const match = window.BracketEngine.getMatches().find(m => m.id === matchId);
        document.getElementById('match-p1-score').value = match.score1 || 1;
        document.getElementById('match-p2-score').value = match.score2 || 0;
      } catch (e) { alert(e.message); }
    });

    document.getElementById('btn-force-p2').addEventListener('click', () => {
      const matchId = document.getElementById('match-edit-id').value;
      try {
        window.BracketEngine.forceMatchWinner(matchId, 'p2');
        const match = window.BracketEngine.getMatches().find(m => m.id === matchId);
        document.getElementById('match-p1-score').value = match.score1 || 0;
        document.getElementById('match-p2-score').value = match.score2 || 1;
      } catch (e) { alert(e.message); }
    });

    document.getElementById('btn-clear-match').addEventListener('click', () => {
      const matchId = document.getElementById('match-edit-id').value;
      try {
        window.BracketEngine.updateMatchScore(matchId, '', '');
        document.getElementById('match-p1-score').value = '';
        document.getElementById('match-p2-score').value = '';
      } catch (e) { alert(e.message); }
    });

    document.getElementById('btn-cancel-match').addEventListener('click', closeMatchModal);
    document.getElementById('btn-close-match-modal').addEventListener('click', closeMatchModal);

    // 11. Modal: Bulk Import
    document.getElementById('btn-import-bulk').addEventListener('click', () => {
      document.getElementById('import-csv-text').value = '';
      openModal('import-modal');
    });

    document.getElementById('btn-cancel-import').addEventListener('click', () => closeModal('import-modal'));
    document.getElementById('btn-close-import-modal').addEventListener('click', () => closeModal('import-modal'));

    document.getElementById('bulk-import-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const csvText = document.getElementById('import-csv-text').value;
      const count = window.BracketEngine.importBulk(csvText);
      alert(`Successfully imported ${count} participants.`);
      closeModal('import-modal');
      window.BracketEngine.resetBracket(); // force regeneration
      renderAll();
    });

    // 12. Modal: Add Participant
    document.getElementById('btn-add-player').addEventListener('click', () => {
      document.getElementById('part-id').value = '';
      document.getElementById('part-name').value = '';
      document.getElementById('part-company').value = '';
      openModal('participant-modal');
    });

    document.getElementById('btn-cancel-part').addEventListener('click', () => closeModal('participant-modal'));
    document.getElementById('btn-close-part-modal').addEventListener('click', () => closeModal('participant-modal'));

    document.getElementById('participant-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('part-name').value;
      const company = document.getElementById('part-company').value;
      
      try {
        window.BracketEngine.addParticipant(name, company);
        closeModal('participant-modal');
        renderAll();
      } catch (err) {
        alert(err.message);
      }
    });

    // 13. Random Seeding
    document.getElementById('btn-random-seed').addEventListener('click', () => {
      if (confirm("Shuffling seeds will clear current match results. Proceed?")) {
        window.BracketEngine.randomizeSeeds();
        window.BracketEngine.resetBracket();
        renderAll();
      }
    });

    // 14. Generate Bracket
    document.getElementById('btn-generate-bracket').addEventListener('click', () => {
      if (window.BracketEngine.getParticipants().length < 2) {
        alert("Please add at least 2 participants.");
        return;
      }
      window.BracketEngine.generateBracket();
      alert("Bracket generated successfully!");
      renderAll();
      // Switch to bracket tab
      document.querySelector('.nav-tab[data-tab="bracket"]').click();
    });

    // 15. Export progression table
    document.getElementById('btn-export-progress').addEventListener('click', () => {
      exportProgressCSV();
    });

    // 16. Sort Standings Table
    document.querySelectorAll('.leaderboard-table th.sortable').forEach(th => {
      th.addEventListener('click', () => {
        const col = th.getAttribute('data-sort');
        if (sortColumn === col) {
          sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
          sortColumn = col;
          sortDirection = 'asc';
        }
        renderLeaderboard();
      });
    });

    // Search and filter standings
    document.getElementById('leaderboard-search').addEventListener('input', renderLeaderboard);
    document.getElementById('leaderboard-status-filter').addEventListener('change', renderLeaderboard);

    // Keyboard support: Escape closes modals/drawers
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closePlayerDrawer();
        closeMatchModal();
        closeModal('import-modal');
        closeModal('participant-modal');
      }
    });
  }

  // ------------------------------------------------------------------------
  // Visual Renders
  // ------------------------------------------------------------------------
  function renderAll() {
    renderBracket();
    renderLeaderboard();
    renderProgressTracker();
    renderParticipantsTab();
  }

  // Render main tournament tree matches
  function renderBracket() {
    const matches = window.BracketEngine.getMatches();
    const showThirdPlace = window.BracketEngine.isThirdPlaceMatchEnabled();
    
    const workspace = document.getElementById('bracket-workspace');
    const container = document.getElementById('match-cards-container');
    const svgElement = document.getElementById('svg-connectors-layer');

    // If no matches, show empty state
    if (matches.length === 0) {
      container.innerHTML = `
        <div class="empty-state-bracket">
          <h3>No Bracket Generated</h3>
          <p>Please populate participants and click "Generate Bracket" in the Participants tab.</p>
        </div>
      `;
      svgElement.innerHTML = '';
      workspace.style.width = '1000px';
      workspace.style.height = '600px';
      return;
    }

    // Run custom coordinates engine
    const layout = window.LayoutEngine.calculateLayout(matches, isDoubleSided, showThirdPlace);

    // Apply dimensions to layout
    workspace.style.width = `${layout.width}px`;
    workspace.style.height = `${layout.height}px`;

    // Render cards
    container.innerHTML = '';
    const isGlobalLocked = window.BracketEngine.getTournamentLock();

    matches.forEach(m => {
      // Hide Round 0 matches containing a BYE to maintain play-in layouts
      if (m.round === 0 && (m.p1?.id === 'BYE' || m.p2?.id === 'BYE')) {
        return;
      }

      const coord = layout.coordinates[m.id];
      if (!coord) return;

      const isLocked = m.isLocked || isGlobalLocked;

      // Card Node
      const card = document.createElement('div');
      card.id = `card_${m.id}`;
      card.className = 'match-card';
      if (m.isThirdPlace) card.classList.add('third-place-card');
      
      // Determine if this card is active swap target
      if (swapSource && swapSource.matchId === m.id) {
        card.classList.add('swap-source-highlight'); // pulsing border style
      }

      // Check highlighted player
      if (highlightedPlayerId) {
        const hasHighlightedPlayer = (m.p1 && m.p1.id === highlightedPlayerId) || 
                                     (m.p2 && m.p2.id === highlightedPlayerId);
        if (hasHighlightedPlayer) {
          card.classList.add('highlighted');
        }
      }

      // Position
      card.style.left = `${coord.x}px`;
      card.style.top = `${coord.y}px`;
      
      // Slots layout helper
      const buildSlotHTML = (player, score, competitor, isP1) => {
        if (!player) return `<div class="match-slot empty-slot">TBD</div>`;
        if (player.id === 'BYE') return `<div class="match-slot bye-slot"><span class="slot-name">BYE</span></div>`;

        const isWinner = m.winner && m.winner.id === player.id;
        const isLoser = m.winner && m.winner.id !== player.id;

        let slotClass = '';
        if (isWinner) slotClass = 'winner-slot';
        if (isLoser) slotClass = 'loser-slot';

        const isSwapSourceSlot = swapSource && swapSource.matchId === m.id && swapSource.param === (isP1 ? 'p1' : 'p2');
        if (isSwapSourceSlot) slotClass += ' swap-slot-selected';

        return `
          <div class="match-slot ${slotClass}" data-player-id="${player.id}" data-param="${isP1 ? 'p1' : 'p2'}">
            <div class="slot-player-info">
              <span class="slot-seed">#${player.seed}</span>
              <span class="slot-name">${player.name}</span>
              <span class="slot-company">${player.companyId}</span>
            </div>
            <span class="slot-score">${score !== null ? score : '-'}</span>
          </div>
        `;
      };

      card.innerHTML = `
        ${buildSlotHTML(m.p1, m.score1, m.p2, true)}
        ${buildSlotHTML(m.p2, m.score2, m.p1, false)}
        <div class="match-header-indicator">
          ${isLocked ? '<span>🔒</span>' : ''}
        </div>
      `;

      // Event click inside match card
      card.addEventListener('click', (e) => {
        e.stopPropagation();
        
        // Check if clicking specifically on the player details (name/company/seed)
        const playerInfoEl = e.target.closest('.slot-player-info');
        const slotEl = e.target.closest('.match-slot');
        
        if (playerInfoEl && slotEl && !slotEl.classList.contains('empty-slot') && !slotEl.classList.contains('bye-slot')) {
          const playerId = slotEl.getAttribute('data-player-id');
          const slotParam = slotEl.getAttribute('data-param');

          if (isAdminMode && !isLocked) {
            // Click to Swap Mode
            if (e.shiftKey || swapSource !== null) {
              handleSwapClick(m.id, slotParam);
              return;
            }
          }
          
          // Default: select player and open details panel
          selectPlayer(playerId);
          return;
        }

        // If clicking match score, empty slots, or background in Edit Mode, open Match Editor
        if (isAdminMode) {
          openMatchEditor(m.id);
        }
      });

      container.appendChild(card);
    });

    // Render connectors
    window.ConnectorRenderer.drawConnectors(svgElement, matches, layout.coordinates, highlightedPlayerId);
  }

  // Swap clicking logic
  function handleSwapClick(matchId, param) {
    if (!swapSource) {
      swapSource = { matchId, param };
      // visually highlight
      renderBracket();
      console.log("Swap source selected: ", swapSource);
    } else {
      if (swapSource.matchId === matchId && swapSource.param === param) {
        // Cancel swap
        clearSwapSource();
      } else {
        // Execute swap
        try {
          window.BracketEngine.swapParticipants(swapSource.matchId, swapSource.param, matchId, param);
          clearSwapSource();
          renderBracket();
        } catch (e) {
          alert(e.message);
          clearSwapSource();
        }
      }
    }
  }

  function clearSwapSource() {
    swapSource = null;
    renderBracket();
  }

  // Locate player in bracket and zoom/focus
  function locatePlayer(playerId) {
    highlightedPlayerId = playerId;
    
    // Find the first match containing this player in Round 0 (or nearest round)
    const matches = window.BracketEngine.getMatches();
    const playerMatches = matches.filter(m => 
      (m.p1 && m.p1.id === playerId) || (m.p2 && m.p2.id === playerId)
    );

    if (playerMatches.length > 0) {
      // Find coordinates of that match card
      const showThirdPlace = window.BracketEngine.isThirdPlaceMatchEnabled();
      const layout = window.LayoutEngine.calculateLayout(matches, isDoubleSided, showThirdPlace);
      
      // Filter out hidden BYE matches in Round 0
      const visibleMatches = playerMatches.filter(m => 
        !(m.round === 0 && (m.p1?.id === 'BYE' || m.p2?.id === 'BYE'))
      );

      if (visibleMatches.length > 0) {
        visibleMatches.sort((a, b) => a.round - b.round);
        const match = visibleMatches[0];
        const coord = layout.coordinates[match.id];

        if (coord) {
          window.PanZoom.focusOnMatch(coord.x, coord.y, coord.width, coord.height);
        }
      }
    }

    renderBracket();
    selectPlayer(playerId);
  }

  // Open drawer and compile participant details
  function selectPlayer(playerId) {
    const participants = window.BracketEngine.getParticipants();
    const p = participants.find(part => part.id === playerId);
    if (!p) return;

    // View Fields
    document.getElementById('info-player-name').textContent = p.name;
    document.getElementById('info-player-company').textContent = p.companyId;
    document.getElementById('info-player-seed').textContent = `Seed ${p.seed}`;

    // Edit Fields
    document.getElementById('edit-player-id').value = p.id;
    document.getElementById('edit-player-name').value = p.name;
    document.getElementById('edit-player-company').value = p.companyId;
    document.getElementById('edit-player-seed').value = p.seed;

    // History Compilation
    const historyList = document.getElementById('info-player-history');
    historyList.innerHTML = '';

    const matches = window.BracketEngine.getMatches();
    const playerMatches = matches.filter(m => 
      ((m.p1 && m.p1.id === playerId) || (m.p2 && m.p2.id === playerId)) &&
      m.p1.id !== 'BYE' && m.p2.id !== 'BYE'
    );

    playerMatches.sort((a, b) => a.round - b.round);

    if (playerMatches.length === 0) {
      historyList.innerHTML = '<li>No matches played yet.</li>';
    } else {
      playerMatches.forEach(m => {
        const isP1 = m.p1.id === playerId;
        const opponent = isP1 ? m.p2 : m.p1;
        const playerScore = isP1 ? m.score1 : m.score2;
        const oppScore = isP1 ? m.score2 : m.score1;

        let resultText = '';
        let resultClass = '';
        if (m.winner) {
          if (m.winner.id === playerId) {
            resultText = 'Win';
            resultClass = 'win';
          } else {
            resultText = 'Loss';
            resultClass = 'loss';
          }
        } else {
          resultText = 'Pending';
        }

        const scoreString = playerScore !== null && oppScore !== null ? `(${playerScore} - ${oppScore})` : '';
        const roundName = m.isThirdPlace ? '3rd Place' : `Round ${m.round + 1}`;

        const li = document.createElement('li');
        li.className = 'history-item';
        li.innerHTML = `
          <span class="history-round">${roundName}</span>
          <span>vs ${opponent.name} ${scoreString}</span>
          <span class="history-result ${resultClass}">${resultText}</span>
        `;
        historyList.appendChild(li);
      });
    }

    // Determine status tag color
    const statusValEl = document.getElementById('info-player-status');
    const standings = getStandingsData();
    const standingObj = standings.find(s => s.participant.id === playerId);
    const status = standingObj ? standingObj.status : 'Active';
    
    statusValEl.textContent = status;
    statusValEl.className = 'info-value status-tag ' + status.toLowerCase().replace(' ', '-');

    // Toggle forms based on Admin/View mode
    const viewContainer = document.getElementById('drawer-view-mode');
    const editContainer = document.getElementById('drawer-edit-mode');

    if (isAdminMode) {
      viewContainer.classList.add('hide');
      editContainer.classList.remove('hide');
    } else {
      viewContainer.classList.remove('hide');
      editContainer.classList.add('hide');
    }

    // Slide in
    const drawer = document.getElementById('player-drawer');
    drawer.classList.remove('hide');
    drawer.setAttribute('aria-hidden', 'false');
  }

  function closePlayerDrawer() {
    const drawer = document.getElementById('player-drawer');
    drawer.classList.add('hide');
    drawer.setAttribute('aria-hidden', 'true');
    
    // Clear selections
    highlightedPlayerId = null;
    renderBracket();
  }

  // ------------------------------------------------------------------------
  // Match Editor Dialog Modal
  // ------------------------------------------------------------------------
  function openMatchEditor(matchId) {
    const matches = window.BracketEngine.getMatches();
    const match = matches.find(m => m.id === matchId);
    if (!match) return;

    const isGlobalLocked = window.BracketEngine.getTournamentLock();
    if (match.isLocked || isGlobalLocked) {
      alert("This match is locked and cannot be edited.");
      return;
    }

    document.getElementById('match-edit-id').value = match.id;

    // Player 1
    const p1 = match.p1;
    if (p1 && p1.id !== 'BYE') {
      document.getElementById('match-p1-name').textContent = p1.name;
      document.getElementById('match-p1-company').textContent = p1.companyId;
      document.getElementById('match-p1-seed').textContent = `Seed ${p1.seed}`;
      document.getElementById('match-p1-score').disabled = false;
      document.getElementById('btn-force-p1').disabled = false;
    } else {
      document.getElementById('match-p1-name').textContent = p1 ? 'BYE' : 'TBD';
      document.getElementById('match-p1-company').textContent = '';
      document.getElementById('match-p1-seed').textContent = '';
      document.getElementById('match-p1-score').disabled = true;
      document.getElementById('btn-force-p1').disabled = true;
    }
    document.getElementById('match-p1-score').value = match.score1 !== null ? match.score1 : '';

    // Player 2
    const p2 = match.p2;
    if (p2 && p2.id !== 'BYE') {
      document.getElementById('match-p2-name').textContent = p2.name;
      document.getElementById('match-p2-company').textContent = p2.companyId;
      document.getElementById('match-p2-seed').textContent = `Seed ${p2.seed}`;
      document.getElementById('match-p2-score').disabled = false;
      document.getElementById('btn-force-p2').disabled = false;
    } else {
      document.getElementById('match-p2-name').textContent = p2 ? 'BYE' : 'TBD';
      document.getElementById('match-p2-company').textContent = '';
      document.getElementById('match-p2-seed').textContent = '';
      document.getElementById('match-p2-score').disabled = true;
      document.getElementById('btn-force-p2').disabled = true;
    }
    document.getElementById('match-p2-score').value = match.score2 !== null ? match.score2 : '';

    // Lock check
    document.getElementById('match-lock-checkbox').checked = match.isLocked;

    openModal('match-modal');
  }

  function closeMatchModal() {
    closeModal('match-modal');
  }

  // ------------------------------------------------------------------------
  // Standings / Leaderboard Tab
  // ------------------------------------------------------------------------
  function getStandingsData() {
    const participants = window.BracketEngine.getParticipants();
    const matches = window.BracketEngine.getMatches();

    const standings = [];
    participants.forEach(p => {
      let wins = 0;
      let losses = 0;
      let isEliminated = false;
      let isChampion = false;
      let isRunnerUp = false;
      let isThirdPlaceWinner = false;

      // Scan matches played (exclude BYE auto-advances)
      const playedMatches = matches.filter(m => 
        (m.p1?.id === p.id || m.p2?.id === p.id) &&
        m.p1?.id !== 'BYE' && m.p2?.id !== 'BYE'
      );

      playedMatches.forEach(m => {
        if (m.winner) {
          if (m.winner.id === p.id) {
            wins++;
          } else {
            losses++;
            isEliminated = true;
          }
        }
      });

      // Find current round/highest round they reached
      const allPlayerMatches = matches.filter(m => (m.p1?.id === p.id || m.p2?.id === p.id));
      let highestRound = 0;
      allPlayerMatches.forEach(m => {
        if (m.round > highestRound && !m.isThirdPlace) {
          highestRound = m.round;
        }
      });

      // Specific checks for final round outcomes
      const S = window.BracketEngine.getBracketSize();
      const R = Math.log2(S);
      const finalMatch = matches.find(m => m.round === R - 1 && !m.isThirdPlace);
      
      if (finalMatch && finalMatch.winner) {
        if (finalMatch.winner.id === p.id) {
          isChampion = true;
        } else if (finalMatch.p1?.id === p.id || finalMatch.p2?.id === p.id) {
          isRunnerUp = true;
        }
      }

      const thirdPlaceMatch = matches.find(m => m.isThirdPlace);
      if (thirdPlaceMatch && thirdPlaceMatch.winner && thirdPlaceMatch.winner.id === p.id) {
        isThirdPlaceWinner = true;
      }

      let status = 'Active';
      if (isChampion) status = 'Champion';
      else if (isRunnerUp) status = 'Runner-up';
      else if (isThirdPlaceWinner) status = 'Third Place';
      else if (isEliminated) status = 'Eliminated';

      standings.push({
        participant: p,
        wins,
        losses,
        highestRound: highestRound + 1,
        status
      });
    });

    // Calculate Rank dynamically based on status and wins
    // Priority: Champion -> Runner-up -> Third Place -> Remaining players sorted by wins (desc) and losses (asc)
    standings.sort((a, b) => {
      const getPriority = (status) => {
        if (status === 'Champion') return 0;
        if (status === 'Runner-up') return 1;
        if (status === 'Third Place') return 2;
        return 3;
      };
      const prioA = getPriority(a.status);
      const prioB = getPriority(b.status);
      
      if (prioA !== prioB) return prioA - prioB;
      
      // Sort by wins (desc)
      if (b.wins !== a.wins) return b.wins - a.wins;
      // Sort by losses (asc)
      return a.losses - b.losses;
    });

    standings.forEach((s, idx) => {
      s.rank = idx + 1;
    });

    return standings;
  }

  function renderLeaderboard() {
    let standings = getStandingsData();
    const searchVal = document.getElementById('leaderboard-search').value.toLowerCase().trim();
    const statusVal = document.getElementById('leaderboard-status-filter').value;

    // Filter
    if (searchVal) {
      standings = standings.filter(s => 
        s.participant.name.toLowerCase().includes(searchVal) || 
        s.participant.companyId.toLowerCase().includes(searchVal)
      );
    }

    if (statusVal !== 'all') {
      if (statusVal === 'active') {
        standings = standings.filter(s => s.status === 'Active' || s.status === 'Champion');
      } else if (statusVal === 'eliminated') {
        standings = standings.filter(s => s.status === 'Eliminated' || s.status === 'Runner-up' || s.status === 'Third Place');
      } else if (statusVal === 'champion') {
        standings = standings.filter(s => s.status === 'Champion');
      }
    }

    // Sort
    standings.sort((a, b) => {
      let valA, valB;
      
      if (sortColumn === 'rank') {
        valA = a.rank;
        valB = b.rank;
      } else if (sortColumn === 'name') {
        valA = a.participant.name.toLowerCase();
        valB = b.participant.name.toLowerCase();
      } else if (sortColumn === 'companyId') {
        valA = a.participant.companyId.toLowerCase();
        valB = b.participant.companyId.toLowerCase();
      } else if (sortColumn === 'wins') {
        valA = a.wins;
        valB = b.wins;
      } else if (sortColumn === 'losses') {
        valA = a.losses;
        valB = b.losses;
      } else if (sortColumn === 'rate') {
        valA = (a.wins + a.losses) > 0 ? (a.wins / (a.wins + a.losses)) : 0;
        valB = (b.wins + b.losses) > 0 ? (b.wins / (b.wins + b.losses)) : 0;
      } else if (sortColumn === 'round') {
        valA = a.highestRound;
        valB = b.highestRound;
      } else if (sortColumn === 'status') {
        valA = a.status;
        valB = b.status;
      }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    const tbody = document.getElementById('leaderboard-body');
    tbody.innerHTML = '';

    if (standings.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center;">No standings matches</td></tr>`;
      return;
    }

    standings.forEach(s => {
      const winRatePercent = (s.wins + s.losses) > 0 
        ? ((s.wins / (s.wins + s.losses)) * 100).toFixed(1) + '%' 
        : '0.0%';

      const statusTag = `<span class="status-tag ${s.status.toLowerCase().replace(' ', '-')}">${s.status}</span>`;

      let medal = s.rank;
      if (s.status === 'Champion') medal = '🥇 Champion';
      else if (s.status === 'Runner-up') medal = '🥈 Runner-up';
      else if (s.status === 'Third Place') medal = '🥉 Third';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${medal}</strong></td>
        <td>${s.participant.name}</td>
        <td>${s.participant.companyId}</td>
        <td>${s.wins}</td>
        <td>${s.losses}</td>
        <td>${winRatePercent}</td>
        <td>Round ${s.highestRound}</td>
        <td>${statusTag}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  // ------------------------------------------------------------------------
  // Progress Tracker Tab
  // ------------------------------------------------------------------------
  function renderProgressTracker() {
    const participants = window.BracketEngine.getParticipants();
    const matches = window.BracketEngine.getMatches();

    const headerRow = document.getElementById('progress-table-headers');
    const tbody = document.getElementById('progress-table-body');

    headerRow.innerHTML = '';
    tbody.innerHTML = '';

    if (participants.length === 0 || matches.length === 0) {
      headerRow.innerHTML = `<th>Participant</th><th>Status</th>`;
      tbody.innerHTML = `<tr><td colspan="2" style="text-align: center;">No bracket records</td></tr>`;
      return;
    }

    const S = window.BracketEngine.getBracketSize();
    const R = Math.log2(S);

    // Build Round header columns
    headerRow.appendChild(createHeaderCell("Participant"));
    for (let r = 0; r < R; r++) {
      let roundName = `Round ${r + 1}`;
      if (r === R - 2 && S >= 4) roundName = "Semi Final";
      if (r === R - 1) roundName = "Finals";
      headerRow.appendChild(createHeaderCell(roundName));
    }
    headerRow.appendChild(createHeaderCell("Champion"));

    // Build Rows
    const standings = getStandingsData();
    standings.forEach(s => {
      const p = s.participant;
      const tr = document.createElement('tr');
      
      // Cell 1: Player Name
      tr.appendChild(createTableCell(`${p.name} <span class="slot-company">(${p.companyId})</span>`));

      // Columns for each round advancement
      for (let r = 0; r < R; r++) {
        // Did player reach Round r+1?
        // They reached Round 0 automatically.
        // They reached Round r (r > 0) if they are in the participants list of any match in Round r.
        let reached = false;
        if (r === 0) {
          reached = true; // everyone enters round 1
        } else {
          reached = matches.some(m => m.round === r && (m.p1?.id === p.id || m.p2?.id === p.id));
        }

        const cellText = reached ? '<span class="progress-check">✓</span>' : '<span class="text-muted">-</span>';
        tr.appendChild(createTableCell(cellText));
      }

      // Champion Trophy Column
      const isChampion = s.status === 'Champion';
      const cellChamp = isChampion ? '<span class="progress-trophy">🏆</span>' : '';
      tr.appendChild(createTableCell(cellChamp));

      tbody.appendChild(tr);
    });
  }

  function createHeaderCell(text) {
    const th = document.createElement('th');
    th.innerHTML = text;
    return th;
  }

  function createTableCell(html) {
    const td = document.createElement('td');
    td.innerHTML = html;
    return td;
  }

  // Export Matrix progression to CSV file download
  function exportProgressCSV() {
    const participants = window.BracketEngine.getParticipants();
    const matches = window.BracketEngine.getMatches();

    if (participants.length === 0 || matches.length === 0) {
      alert("No data available to export.");
      return;
    }

    const S = window.BracketEngine.getBracketSize();
    const R = Math.log2(S);

    // Build Headers
    let csv = "Participant Name,Company ID";
    for (let r = 0; r < R; r++) {
      let rName = `Round ${r + 1}`;
      if (r === R - 2 && S >= 4) rName = "Semifinals";
      if (r === R - 1) rName = "Finals";
      csv += `,${rName}`;
    }
    csv += ",Champion\n";

    // Standings row compilation
    const standings = getStandingsData();
    standings.forEach(s => {
      const p = s.participant;
      let row = `"${p.name}","${p.companyId}"`;

      for (let r = 0; r < R; r++) {
        let reached = false;
        if (r === 0) reached = true;
        else reached = matches.some(m => m.round === r && (m.p1?.id === p.id || m.p2?.id === p.id));
        
        row += reached ? ",Reached" : ",-";
      }

      const isChampion = s.status === 'Champion';
      row += isChampion ? ",🏆 Winner\n" : ",\n";
      csv += row;
    });

    // File download
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `tournament_progress_${Date.now()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // ------------------------------------------------------------------------
  // Participants Directory Tab
  // ------------------------------------------------------------------------
  function renderParticipantsTab() {
    const participants = [...window.BracketEngine.getParticipants()].sort((a, b) => a.seed - b.seed);
    const searchVal = document.getElementById('participants-search').value.toLowerCase().trim();

    const tbody = document.getElementById('participants-body');
    tbody.innerHTML = '';

    // Calculate directory summary stats
    const totalP = participants.length;
    let S = 4;
    while (S < totalP) S *= 2;
    const byeCount = Math.max(0, S - totalP);

    document.getElementById('stat-total-players').textContent = totalP;
    document.getElementById('stat-bracket-size').textContent = totalP >= 2 ? S : '-';
    document.getElementById('stat-bye-count').textContent = totalP >= 2 ? byeCount : '-';

    let filtered = participants;
    if (searchVal) {
      filtered = participants.filter(p => 
        p.name.toLowerCase().includes(searchVal) || p.companyId.toLowerCase().includes(searchVal)
      );
    }

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align: center;">No participants found</td></tr>`;
      return;
    }

    filtered.forEach(p => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>Seed ${p.seed}</td>
        <td><strong>${p.name}</strong></td>
        <td>${p.companyId}</td>
        <td>
          <button class="action-btn secondary small btn-edit-player-dir" data-id="${p.id}">Edit</button>
          <button class="action-btn danger-outline small btn-del-player-dir" data-id="${p.id}">Delete</button>
        </td>
      `;

      // actions
      tr.querySelector('.btn-edit-player-dir').addEventListener('click', () => {
        document.getElementById('part-id').value = p.id;
        document.getElementById('part-name').value = p.name;
        document.getElementById('part-company').value = p.companyId;
        document.getElementById('modal-part-title').textContent = "Edit Participant";
        openModal('participant-modal');
      });

      tr.querySelector('.btn-del-player-dir').addEventListener('click', () => {
        if (confirm(`Delete participant ${p.name}? This will clear match results.`)) {
          window.BracketEngine.deleteParticipant(p.id);
          window.BracketEngine.resetBracket(); // force regeneration
          renderAll();
        }
      });

      tbody.appendChild(tr);
    });

    // Directory Search filter
    document.getElementById('participants-search').addEventListener('input', renderParticipantsTab);
  }

  // ------------------------------------------------------------------------
  // Dialog Modals Helpers
  // ------------------------------------------------------------------------
  function openModal(modalId) {
    const m = document.getElementById(modalId);
    if (!m) return;
    m.classList.remove('hide');
    m.setAttribute('aria-hidden', 'false');
  }

  function closeModal(modalId) {
    const m = document.getElementById(modalId);
    if (!m) return;
    m.classList.add('hide');
    m.setAttribute('aria-hidden', 'true');
  }

  return {
    init,
    renderAll,
    renderBracket,
    locatePlayer,
    isAdminMode: () => isAdminMode
  };
})();
