import { create } from 'zustand';

export interface Participant {
  id: string;
  name: string;
  companyId: string;
  seed: number;
}

export interface Match {
  id: string;
  round: number;
  index: number;
  p1: Participant | null;
  p2: Participant | null;
  score1: number | null;
  score2: number | null;
  winner: Participant | null;
  isLocked: boolean;
  p1SourceMatchId: string | null;
  p2SourceMatchId: string | null;
  destMatchId: string | null;
  destParam: 'p1' | 'p2' | null;
  side: 'left' | 'right' | 'center';
  isThirdPlace?: boolean;
}

export interface HistoryLog {
  timestamp: number;
  user: string;
  action: string;
  details: string;
  stateSnapshot: {
    participants: Participant[];
    matches: Match[];
    tournamentStatus: 'Draft' | 'Seeded' | 'Started' | 'Completed';
  };
}

interface TournamentState {
  participants: Participant[];
  matches: Match[];
  tournamentStatus: 'Draft' | 'Seeded' | 'Started' | 'Completed';
  historyLogs: HistoryLog[];
  historyIndex: number;
  highlightedParticipantId: string | null;
  zoomPercent: number;
  panOffset: { x: number; y: number };
  
  // Actions
  addParticipant: (name: string, companyId: string) => void;
  editParticipant: (id: string, name: string, companyId: string, customSeed?: number) => void;
  deleteParticipant: (id: string) => void;
  randomizeSeeds: () => void;
  importBulk: (csvText: string) => void;
  generateBracket: () => void;
  startTournament: () => void;
  updateMatchScore: (matchId: string, score1: number | null, score2: number | null, forceWinnerId?: 'p1' | 'p2' | null) => void;
  toggleMatchLock: (matchId: string) => void;
  swapParticipants: (match1Id: string, param1: 'p1' | 'p2', match2Id: string, param2: 'p1' | 'p2') => void;
  quickAddParticipant: (matchId: string, paramSlot: 'p1' | 'p2', name: string, companyId: string) => void;
  addLateParticipant: (name: string, companyId: string) => void;
  setHighlightedParticipantId: (id: string | null) => void;
  setZoomPercent: (zoom: number) => void;
  setPanOffset: (offset: { x: number; y: number }) => void;
  
  // History Control
  undo: () => void;
  redo: () => void;
  rewindTo: (index: number) => void;
  restartMatch: (matchId: string) => void;
  resetAll: () => void;
}

const generateId = () => '_' + Math.random().toString(36).substring(2, 11);

const getSeedingOrder = (size: number): number[] => {
  let order = [1, 2];
  while (order.length < size) {
    const nextOrder: number[] = [];
    const target = order.length * 2 + 1;
    for (const x of order) {
      nextOrder.push(x);
      nextOrder.push(target - x);
    }
    order = nextOrder;
  }
  return order;
};

// --- REALTIME WEBSOCKET & SYNC SETUP ---
const urlParams = new URLSearchParams(window.location.search);
const tournamentId = urlParams.get('tournamentId') || 'default-tournament';
const isAdminParam = urlParams.get('admin') === 'true' || !urlParams.has('tournamentId');
// In production, set VITE_BACKEND_WS_URL and VITE_BACKEND_API_URL in Vercel dashboard
// In development, these fall back to localhost:3000
const backendBase = import.meta.env.VITE_BACKEND_WS_URL || `ws://${window.location.hostname}:3000`;
const apiBase = import.meta.env.VITE_BACKEND_API_URL || `http://${window.location.hostname}:3000`;
const wsUrl = `${backendBase}?tournamentId=${tournamentId}${isAdminParam ? '&admin=true' : ''}`;
let ws: WebSocket | null = null;

// Initialize WebSocket connection
const initWebSocket = (storeSet: any) => {
  try {
    ws = new WebSocket(wsUrl);
    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'TOURNAMENT_UPDATE' && message.tournamentId === tournamentId) {
          const { participants, matches, status } = message.data;
          storeSet({
            participants,
            matches,
            tournamentStatus: status
          });
        }
      } catch (err) {
        console.error('Error parsing WS message:', err);
      }
    };
    ws.onclose = () => {
      // Reconnect in 3s
      setTimeout(() => initWebSocket(storeSet), 3000);
    };
    ws.onerror = (err) => {
      console.warn('WS error, closing connection...', err);
      ws?.close();
    };
  } catch (err) {
    console.error('Failed to initialize WebSocket:', err);
  }
};

// Broadcast state helper
const sendStateUpdate = (participants: Participant[], matches: Match[], tournamentStatus: string, action: string, details: string) => {
  const snapshot = {
    participants: JSON.parse(JSON.stringify(participants)),
    matches: JSON.parse(JSON.stringify(matches)),
    tournamentStatus: tournamentStatus as any
  };

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'STATE_UPDATE',
      tournamentId,
      data: {
        name: 'Tournament',
        participants,
        matches,
        status: tournamentStatus,
        action,
        details,
        stateSnapshot: snapshot
      }
    }));
  } else {
    // REST API fallback
    fetch(`${apiBase}/api/tournament/${tournamentId}/save?admin=${isAdminParam}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        participants,
        matches,
        status: tournamentStatus,
        action,
        details,
        stateSnapshot: snapshot
      })
    }).catch(err => console.error('REST sync fallback failed:', err));
  }
};

// Push history snapshot helper
const recordHistory = (
  state: { participants: Participant[]; matches: Match[]; tournamentStatus: any; historyLogs: HistoryLog[]; historyIndex: number },
  action: string,
  details: string
) => {
  const currentSnapshot = {
    participants: JSON.parse(JSON.stringify(state.participants)),
    matches: JSON.parse(JSON.stringify(state.matches)),
    tournamentStatus: state.tournamentStatus,
  };

  const newLog: HistoryLog = {
    timestamp: Date.now(),
    user: "Admin",
    action,
    details,
    stateSnapshot: currentSnapshot,
  };

  const activeLogs = state.historyLogs.slice(0, state.historyIndex + 1);
  return {
    historyLogs: [...activeLogs, newLog],
    historyIndex: activeLogs.length,
  };
};

// --- UNIFIED PROPAGATION ENGINE ---
const propagateState = (nextMatches: Match[]) => {
  // Clear non-round-0 matches p1/p2 (except third place which is set from semi-finals)
  nextMatches.forEach(m => {
    if (m.round > 0 && !m.isThirdPlace) {
      m.p1 = null;
      m.p2 = null;
    }
  });

  // Run auto-advances for matches facing BYEs
  nextMatches.forEach(m => {
    if (m.round === 0) {
      if (m.p1 === null && m.p2 !== null) {
        m.winner = m.p2;
        m.score1 = 0;
        m.score2 = 1;
      } else if (m.p2 === null && m.p1 !== null) {
        m.winner = m.p1;
        m.score1 = 1;
        m.score2 = 0;
      } else if (m.p1 === null && m.p2 === null) {
        m.winner = null;
        m.score1 = null;
        m.score2 = null;
      }
    }
  });

  // Calculate bracket size S (power of 2)
  const r0Count = nextMatches.filter(m => m.round === 0).length;
  const S = r0Count * 2;
  const R = Math.log2(S);

  // Propagate winners forward chronologically
  const sorted = [...nextMatches].sort((a, b) => a.round - b.round);
  sorted.forEach(m => {
    if (m.winner && m.destMatchId) {
      const dest = nextMatches.find(d => d.id === m.destMatchId);
      if (dest && m.destParam) {
        dest[m.destParam] = m.winner;
        // Reset winner if it's no longer matching either player
        if (dest.winner && dest.winner.id !== dest.p1?.id && dest.winner.id !== dest.p2?.id) {
          dest.score1 = null;
          dest.score2 = null;
          dest.winner = null;
        }
      }
    }

    // Propagate losers to third place if semi-final
    if (!m.isThirdPlace && S >= 4 && m.round === R - 2) {
      const isSemi0 = m.index === 0;
      const thirdMatch = nextMatches.find(t => t.isThirdPlace);
      if (thirdMatch) {
        const loser = m.winner ? (m.winner.id === m.p1?.id ? m.p2 : m.p1) : null;
        const param = isSemi0 ? 'p1' : 'p2';
        thirdMatch[param] = loser;
        if (thirdMatch.winner && thirdMatch.winner.id !== thirdMatch.p1?.id && thirdMatch.winner.id !== thirdMatch.p2?.id) {
          thirdMatch.score1 = null;
          thirdMatch.score2 = null;
          thirdMatch.winner = null;
        }
      }
    }
  });
};

export const useTournamentStore = create<TournamentState>((set, get) => {
  // Initialize WS
  initWebSocket(set);

  // Fetch initial state from server
  fetch(`${apiBase}/api/tournament/${tournamentId}`)
    .then(res => {
      if (res.ok) return res.json();
      throw new Error('Tournament not found');
    })
    .then(data => {
      set({
        participants: data.participants,
        matches: data.matches,
        tournamentStatus: data.tournament.status,
        historyLogs: data.history || [],
        historyIndex: (data.history?.length || 0) - 1
      });
    })
    .catch(err => {
      console.log('No existing tournament found on server, using empty state.', err);
    });

  return {
    participants: [],
    matches: [],
    tournamentStatus: 'Draft',
    historyLogs: [],
    historyIndex: -1,
    highlightedParticipantId: null,
    zoomPercent: 100,
    panOffset: { x: 0, y: 0 },

    addParticipant: (name, companyId) => {
      const { participants, tournamentStatus } = get();
      if (tournamentStatus !== 'Draft') return;
      if (participants.some(p => p.companyId.toLowerCase() === companyId.toLowerCase())) {
        throw new Error(`Company ID "${companyId}" must be unique.`);
      }

      const newP: Participant = {
        id: generateId(),
        name: name.trim(),
        companyId: companyId.trim(),
        seed: participants.length + 1,
      };

      const nextParts = [...participants, newP];
      set(state => {
        const nextState = { ...state, participants: nextParts };
        const historyUpdate = recordHistory(nextState, "Participant Added", `Added "${newP.name}" (${newP.companyId})`);
        const finalState = { ...nextState, ...historyUpdate };
        sendStateUpdate(finalState.participants, finalState.matches, finalState.tournamentStatus, "Participant Added", `Added "${newP.name}" (${newP.companyId})`);
        return finalState;
      });
    },

    editParticipant: (id, name, companyId, customSeed) => {
      const { participants, tournamentStatus } = get();
      if (tournamentStatus !== 'Draft') return;
      if (participants.some(p => p.id !== id && p.companyId.toLowerCase() === companyId.toLowerCase())) {
        throw new Error(`Company ID "${companyId}" must be unique.`);
      }

      const nextParts = participants.map(p => {
        if (p.id === id) {
          return {
            ...p,
            name: name.trim(),
            companyId: companyId.trim(),
            seed: customSeed !== undefined ? customSeed : p.seed,
          };
        }
        return p;
      });

      if (customSeed !== undefined) {
        const targetIndex = nextParts.findIndex(p => p.id === id);
        const target = nextParts[targetIndex];
        if (target.seed < 1) target.seed = 1;
        if (target.seed > participants.length) target.seed = participants.length;

        const others = nextParts.filter(p => p.id !== id).sort((a, b) => a.seed - b.seed);
        const usedSeeds = new Set([target.seed]);
        let currentSeed = 1;
        
        others.forEach(o => {
          while (usedSeeds.has(currentSeed)) {
            currentSeed++;
          }
          o.seed = currentSeed;
          usedSeeds.add(currentSeed);
        });
        nextParts.sort((a, b) => a.seed - b.seed);
      }

      set(state => {
        const nextState = { ...state, participants: nextParts };
        const historyUpdate = recordHistory(nextState, "Participant Edited", `Edited "${name}"`);
        const finalState = { ...nextState, ...historyUpdate };
        sendStateUpdate(finalState.participants, finalState.matches, finalState.tournamentStatus, "Participant Edited", `Edited "${name}"`);
        return finalState;
      });
    },

    deleteParticipant: (id) => {
      const { participants, tournamentStatus } = get();
      if (tournamentStatus !== 'Draft') return;
      const nextParts = participants.filter(p => p.id !== id);
      nextParts.forEach((p, idx) => {
        p.seed = idx + 1;
      });

      set(state => {
        const nextState = { ...state, participants: nextParts };
        const historyUpdate = recordHistory(nextState, "Participant Removed", "Removed participant");
        const finalState = { ...nextState, ...historyUpdate };
        sendStateUpdate(finalState.participants, finalState.matches, finalState.tournamentStatus, "Participant Removed", "Removed participant");
        return finalState;
      });
    },

    randomizeSeeds: () => {
      const { participants, tournamentStatus } = get();
      if (tournamentStatus !== 'Draft') return;
      const shuffled = [...participants];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      shuffled.forEach((p, idx) => {
        p.seed = idx + 1;
      });

      set(state => {
        const nextState = { ...state, participants: shuffled };
        const historyUpdate = recordHistory(nextState, "Randomized Seeds", "Randomized participant seeds");
        const finalState = { ...nextState, ...historyUpdate };
        sendStateUpdate(finalState.participants, finalState.matches, finalState.tournamentStatus, "Randomized Seeds", "Randomized participant seeds");
        return finalState;
      });
    },

    importBulk: (csvText) => {
      const { tournamentStatus } = get();
      if (tournamentStatus !== 'Draft') return;

      const lines = csvText.split('\n');
      const newParticipants: Participant[] = [];
      let seedCount = 1;

      lines.forEach(line => {
        if (!line.trim()) return;
        const parts = line.split(/[,\t]/);
        if (parts.length >= 2) {
          const name = parts[0].replace(/^["']|["']$/g, '').trim();
          const companyId = parts[1].replace(/^["']|["']$/g, '').trim();
          if (name && companyId && !newParticipants.some(p => p.companyId.toLowerCase() === companyId.toLowerCase())) {
            newParticipants.push({
              id: generateId(),
              name,
              companyId,
              seed: seedCount++,
            });
          }
        }
      });

      set(state => {
        const nextState = { ...state, participants: newParticipants };
        const historyUpdate = recordHistory(nextState, "Bulk Import", `Imported ${newParticipants.length} participants`);
        const finalState = { ...nextState, ...historyUpdate };
        sendStateUpdate(finalState.participants, finalState.matches, finalState.tournamentStatus, "Bulk Import", `Imported ${newParticipants.length} participants`);
        return finalState;
      });
    },

    generateBracket: () => {
      const { participants, tournamentStatus } = get();
      if (tournamentStatus !== 'Draft' && tournamentStatus !== 'Seeded') return;
      if (participants.length < 2) return;

      let S = 4;
      while (S < participants.length) {
        S *= 2;
      }

      const R = Math.log2(S);
      const sortedPlayers = [...participants].sort((a, b) => a.seed - b.seed);
      const seedOrder = getSeedingOrder(S);
      const round0MatchesCount = S / 2;
      const rawRound0: Match[] = [];

      for (let i = 0; i < round0MatchesCount; i++) {
        const s1 = seedOrder[2 * i];
        const s2 = seedOrder[2 * i + 1];

        const p1 = sortedPlayers.find(p => p.seed === s1) || { id: 'BYE', name: 'BYE', companyId: 'BYE', seed: s2 };
        const p2 = sortedPlayers.find(p => p.seed === s2) || { id: 'BYE', name: 'BYE', companyId: 'BYE', seed: s1 };

        rawRound0.push({
          id: `match_0_${i}`,
          round: 0,
          index: i,
          p1: p1.id === 'BYE' ? null : p1,
          p2: p2.id === 'BYE' ? null : p2,
          score1: null,
          score2: null,
          winner: null,
          isLocked: false,
          p1SourceMatchId: null,
          p2SourceMatchId: null,
          destMatchId: null,
          destParam: null,
          side: 'left',
        });
      }

      // Sort Round 0 matches so that matches with BYEs are at the end
      rawRound0.sort((a, b) => {
        const aHasBye = (a.p1 === null || a.p2 === null);
        const bHasBye = (b.p1 === null || b.p2 === null);
        if (!aHasBye && bHasBye) return -1;
        if (aHasBye && !bHasBye) return 1;
        return a.index - b.index;
      });

      // Re-index Round 0
      rawRound0.forEach((m, idx) => {
        m.id = `match_0_${idx}`;
        m.index = idx;
      });

      let newMatches = [...rawRound0];

      // Create subsequent round matches
      for (let r = 1; r < R; r++) {
        const roundMatchesCount = S / Math.pow(2, r + 1);
        for (let i = 0; i < roundMatchesCount; i++) {
          newMatches.push({
            id: `match_${r}_${i}`,
            round: r,
            index: i,
            p1: null,
            p2: null,
            score1: null,
            score2: null,
            winner: null,
            isLocked: false,
            p1SourceMatchId: `match_${r - 1}_${2 * i}`,
            p2SourceMatchId: `match_${r - 1}_${2 * i + 1}`,
            destMatchId: null,
            destParam: null,
            side: 'left',
          });
        }
      }

      // Link matches together
      for (let r = 0; r < R - 1; r++) {
        const roundMatchesCount = S / Math.pow(2, r + 1);
        for (let i = 0; i < roundMatchesCount; i++) {
          const currentMatch = newMatches.find(m => m.id === `match_${r}_${i}`);
          if (currentMatch) {
            const destIdx = Math.floor(i / 2);
            const destParam = (i % 2 === 0) ? 'p1' : 'p2';
            currentMatch.destMatchId = `match_${r + 1}_${destIdx}`;
            currentMatch.destParam = destParam;
          }
        }
      }

      // Add Third Place Match
      if (S >= 4) {
        const semiRoundIdx = R - 2;
        newMatches.push({
          id: 'match_3rd_place',
          round: R - 1,
          index: 1,
          p1: null,
          p2: null,
          score1: null,
          score2: null,
          winner: null,
          isLocked: false,
          p1SourceMatchId: `match_${semiRoundIdx}_0`,
          p2SourceMatchId: `match_${semiRoundIdx}_1`,
          destMatchId: null,
          destParam: null,
          side: 'center',
          isThirdPlace: true,
        });
      }

      // Assign Sides
      newMatches.forEach(m => {
        if (m.isThirdPlace) {
          m.side = 'center';
          return;
        }
        if (m.round === R - 1) {
          m.side = 'center';
        } else {
          const roundCount = S / Math.pow(2, m.round + 1);
          m.side = m.index < roundCount / 2 ? 'left' : 'right';
        }
      });

      // Run unified propagation
      propagateState(newMatches);

      set(state => {
        const nextState = {
          ...state,
          matches: newMatches,
          tournamentStatus: 'Seeded' as const,
        };
        const historyUpdate = recordHistory(nextState, "Generate Bracket", `Generated bracket structure size ${S}`);
        const finalState = { ...nextState, ...historyUpdate };
        sendStateUpdate(finalState.participants, finalState.matches, finalState.tournamentStatus, "Generate Bracket", `Generated bracket structure size ${S}`);
        return finalState;
      });
    },

    startTournament: () => {
      const { tournamentStatus } = get();
      if (tournamentStatus !== 'Seeded') return;
      set(state => {
        const nextState = { ...state, tournamentStatus: 'Started' as const };
        const historyUpdate = recordHistory(nextState, "Start Tournament", "Tournament active, match scoring enabled");
        const finalState = { ...nextState, ...historyUpdate };
        sendStateUpdate(finalState.participants, finalState.matches, finalState.tournamentStatus, "Start Tournament", "Tournament active, match scoring enabled");
        return finalState;
      });
    },

    updateMatchScore: (matchId, score1, score2, forceWinnerId) => {
      const { matches, tournamentStatus } = get();
      if (tournamentStatus !== 'Started') return;

      const targetIndex = matches.findIndex(m => m.id === matchId);
      if (targetIndex === -1) return;
      if (matches[targetIndex].isLocked) return;

      const nextMatches = JSON.parse(JSON.stringify(matches)) as Match[];
      const match = nextMatches[targetIndex];

      match.score1 = score1;
      match.score2 = score2;

      if (forceWinnerId) {
        match.winner = forceWinnerId === 'p1' ? match.p1 : match.p2;
      } else if (score1 !== null && score2 !== null) {
        if (score1 > score2) {
          match.winner = match.p1;
        } else if (score2 > score1) {
          match.winner = match.p2;
        } else {
          match.winner = null;
        }
      } else {
        match.winner = null;
      }

      propagateState(nextMatches);

      // Check if tournament is Completed
      const finalMatch = nextMatches.find(m => m.round === Math.log2(nextMatches.filter(mx => mx.round === 0).length * 2) - 1 && !m.isThirdPlace);
      const thirdMatch = nextMatches.find(m => m.isThirdPlace);
      
      let isFinished = finalMatch?.winner !== null;
      if (thirdMatch && thirdMatch.winner === null && (thirdMatch.p1 !== null || thirdMatch.p2 !== null)) {
        isFinished = false;
      }

      const nextStatus = isFinished ? 'Completed' as const : 'Started' as const;

      set(state => {
        const nextState = {
          ...state,
          matches: nextMatches,
          tournamentStatus: nextStatus,
        };
        const detail = match.winner 
          ? `Match "${match.p1?.name} vs ${match.p2?.name}": score ${score1}-${score2}, winner: ${match.winner.name}`
          : `Match "${match.p1?.name} vs ${match.p2?.name}": scores cleared`;
        const historyUpdate = recordHistory(nextState, "Score Updated", detail);
        const finalState = { ...nextState, ...historyUpdate };
        sendStateUpdate(finalState.participants, finalState.matches, finalState.tournamentStatus, "Score Updated", detail);
        return finalState;
      });
    },

    toggleMatchLock: (matchId) => {
      const { matches } = get();
      const targetIdx = matches.findIndex(m => m.id === matchId);
      if (targetIdx === -1) return;

      const nextMatches = [...matches];
      nextMatches[targetIdx] = {
        ...nextMatches[targetIdx],
        isLocked: !nextMatches[targetIdx].isLocked,
      };

      set(state => {
        const nextState = { ...state, matches: nextMatches };
        const log = nextMatches[targetIdx].isLocked ? "Match Locked" : "Match Unlocked";
        const detail = `Match "${nextMatches[targetIdx].p1?.name} vs ${nextMatches[targetIdx].p2?.name}" status updated`;
        const historyUpdate = recordHistory(nextState, log, detail);
        const finalState = { ...nextState, ...historyUpdate };
        sendStateUpdate(finalState.participants, finalState.matches, finalState.tournamentStatus, log, detail);
        return finalState;
      });
    },

    swapParticipants: (match1Id, param1, match2Id, param2) => {
      const { matches, tournamentStatus } = get();
      if (tournamentStatus !== 'Seeded' && tournamentStatus !== 'Draft') return;

      const m1Idx = matches.findIndex(m => m.id === match1Id);
      const m2Idx = matches.findIndex(m => m.id === match2Id);
      if (m1Idx === -1 || m2Idx === -1) return;

      const nextMatches = JSON.parse(JSON.stringify(matches)) as Match[];
      const m1 = nextMatches[m1Idx];
      const m2 = nextMatches[m2Idx];

      if (m1.isLocked || m2.isLocked) return;

      const temp = m1[param1];
      m1[param1] = m2[param2];
      m2[param2] = temp;

      m1.score1 = null; m1.score2 = null; m1.winner = null;
      m2.score1 = null; m2.score2 = null; m2.winner = null;

      propagateState(nextMatches);

      set(state => {
        const nextState = { ...state, matches: nextMatches };
        const historyUpdate = recordHistory(nextState, "Swapped Seeds", "Swapped participant seed placements");
        const finalState = { ...nextState, ...historyUpdate };
        sendStateUpdate(finalState.participants, finalState.matches, finalState.tournamentStatus, "Swapped Seeds", "Swapped participant seed placements");
        return finalState;
      });
    },

    quickAddParticipant: (matchId, paramSlot, name, companyId) => {
      const { participants, matches } = get();
      if (participants.some(p => p.companyId.toLowerCase() === companyId.trim().toLowerCase())) {
        throw new Error(`Company ID "${companyId}" must be unique.`);
      }

      const newP: Participant = {
        id: generateId(),
        name: name.trim(),
        companyId: companyId.trim(),
        seed: participants.length + 1
      };

      const nextParts = [...participants, newP];
      const nextMatches = JSON.parse(JSON.stringify(matches)) as Match[];
      const match = nextMatches.find(m => m.id === matchId);

      if (match) {
        match[paramSlot] = newP;
        if (match.p1 !== null && match.p2 !== null) {
          match.score1 = null;
          match.score2 = null;
          match.winner = null;
        }
      }

      propagateState(nextMatches);

      set(state => {
        const nextState = { ...state, participants: nextParts, matches: nextMatches };
        const historyUpdate = recordHistory(nextState, "Quick Added Player", `Quick-added "${newP.name}" directly to bracket`);
        const finalState = { ...nextState, ...historyUpdate };
        sendStateUpdate(finalState.participants, finalState.matches, finalState.tournamentStatus, "Quick Added Player", `Quick-added "${newP.name}" directly to bracket`);
        return finalState;
      });
    },

    addLateParticipant: (name, companyId) => {
      const { participants, matches, tournamentStatus } = get();
      if (tournamentStatus !== 'Started') return;

      if (participants.some(p => p.companyId.toLowerCase() === companyId.toLowerCase())) {
        throw new Error(`Company ID "${companyId}" must be unique.`);
      }

      const newP: Participant = {
        id: generateId(),
        name: name.trim(),
        companyId: companyId.trim(),
        seed: participants.length + 1,
      };

      const nextParts = [...participants, newP];
      const nextMatches = JSON.parse(JSON.stringify(matches)) as Match[];

      const isDescendantCompleted = (mId: string | null): boolean => {
        if (!mId) return false;
        const current = nextMatches.find(m => m.id === mId);
        if (!current) return false;
        if (current.winner !== null && current.p1 !== null && current.p2 !== null) return true;
        return isDescendantCompleted(current.destMatchId);
      };

      const byeMatch = nextMatches.find(m => 
        m.round === 0 &&
        (m.p1 === null || m.p2 === null) &&
        !isDescendantCompleted(m.destMatchId)
      );

      if (byeMatch) {
        if (byeMatch.p1 === null) {
          byeMatch.p1 = newP;
        } else {
          byeMatch.p2 = newP;
        }
        byeMatch.score1 = null;
        byeMatch.score2 = null;
        byeMatch.winner = null;

        propagateState(nextMatches);

        set(state => {
          const nextState = {
            ...state,
            participants: nextParts,
            matches: nextMatches,
          };
          const historyUpdate = recordHistory(nextState, "Late Registration (BYE)", `Late added "${newP.name}" to empty BYE slot`);
          const finalState = { ...nextState, ...historyUpdate };
          sendStateUpdate(finalState.participants, finalState.matches, finalState.tournamentStatus, "Late Registration (BYE)", `Late added "${newP.name}" to empty BYE slot`);
          return finalState;
        });
        return;
      }

      // Scenario B: Bracket Expansion
      const oldS = nextMatches.filter(m => m.round === 0).length * 2;
      const newS = oldS * 2;
      const newR = Math.log2(newS);

      const oldMatches = [...nextMatches];
      const rebuiltMatches: Match[] = [];

      oldMatches.forEach(m => {
        if (m.isThirdPlace) return;
        const shiftMatchId = (id: string | null) => {
          if (!id || id === 'match_3rd_place') return id;
          const pts = id.split('_');
          return `match_${parseInt(pts[1]) + 1}_${pts[2]}`;
        };

        rebuiltMatches.push({
          id: `match_${m.round + 1}_${m.index}`,
          round: m.round + 1,
          index: m.index,
          p1: m.p1,
          p2: m.p2,
          score1: m.score1,
          score2: m.score2,
          winner: m.winner,
          isLocked: m.isLocked,
          p1SourceMatchId: m.p1SourceMatchId ? shiftMatchId(m.p1SourceMatchId) : null,
          p2SourceMatchId: m.p2SourceMatchId ? shiftMatchId(m.p2SourceMatchId) : null,
          destMatchId: null,
          destParam: null,
          side: m.side,
        });
      });

      const playersSorted = [...participants]
        .filter(p => p.id !== newP.id)
        .sort((a, b) => b.seed - a.seed);

      let targetPlayer = playersSorted.find(p => {
        const oldM = oldMatches.find(m => m.round === 0 && (m.p1?.id === p.id || m.p2?.id === p.id));
        return oldM && oldM.winner === null;
      });

      if (!targetPlayer) {
        targetPlayer = playersSorted[0];
      }

      const targetMatchInR1 = rebuiltMatches.find(m => 
        m.round === 1 && (m.p1?.id === targetPlayer.id || m.p2?.id === targetPlayer.id)
      );

      if (targetMatchInR1) {
        const targetParam = targetMatchInR1.p1?.id === targetPlayer.id ? 'p1' as const : 'p2' as const;
        targetMatchInR1[targetParam] = null;
        targetMatchInR1.score1 = null; targetMatchInR1.score2 = null; targetMatchInR1.winner = null;

        const r0Count = newS / 2;
        for (let i = 0; i < r0Count; i++) {
          const destR1Idx = Math.floor(i / 2);
          const destParam = (i % 2 === 0) ? 'p1' as const : 'p2' as const;
          const destR1Match = rebuiltMatches.find(m => m.round === 1 && m.index === destR1Idx);

          let p1: Participant | null = null;
          let p2: Participant | null = null;

          if (destR1Idx === targetMatchInR1.index && destParam === targetParam) {
            p1 = targetPlayer;
            p2 = newP;
          } else if (destR1Match) {
            p1 = destR1Match[destParam];
            p2 = null;
          }

          rebuiltMatches.push({
            id: `match_0_${i}`,
            round: 0,
            index: i,
            p1,
            p2,
            score1: null,
            score2: null,
            winner: null,
            isLocked: false,
            p1SourceMatchId: null,
            p2SourceMatchId: null,
            destMatchId: `match_1_${destR1Idx}`,
            destParam,
            side: 'left',
          });
        }
      }

      for (let r = 2; r < newR; r++) {
        const roundCount = newS / Math.pow(2, r + 1);
        for (let i = 0; i < roundCount; i++) {
          const exists = rebuiltMatches.some(m => m.round === r && m.index === i);
          if (!exists) {
            rebuiltMatches.push({
              id: `match_${r}_${i}`,
              round: r,
              index: i,
              p1: null,
              p2: null,
              score1: null,
              score2: null,
              winner: null,
              isLocked: false,
              p1SourceMatchId: `match_${r - 1}_${2 * i}`,
              p2SourceMatchId: `match_${r - 1}_${2 * i + 1}`,
              destMatchId: null,
              destParam: null,
              side: 'left',
            });
          }
        }
      }

      for (let r = 1; r < newR - 1; r++) {
        const roundCount = newS / Math.pow(2, r + 1);
        for (let i = 0; i < roundCount; i++) {
          const m = rebuiltMatches.find(match => match.round === r && match.index === i);
          if (m) {
            const destIdx = Math.floor(i / 2);
            m.destMatchId = `match_${r + 1}_${destIdx}`;
            m.destParam = (i % 2 === 0) ? 'p1' : 'p2';
          }
        }
      }

      if (newS >= 4) {
        rebuiltMatches.push({
          id: 'match_3rd_place',
          round: newR - 1,
          index: 1,
          p1: null,
          p2: null,
          score1: null,
          score2: null,
          winner: null,
          isLocked: false,
          p1SourceMatchId: `match_${newR - 2}_0`,
          p2SourceMatchId: `match_${newR - 2}_1`,
          destMatchId: null,
          destParam: null,
          side: 'center',
          isThirdPlace: true,
        });
      }

      const finalRound0 = rebuiltMatches.filter(m => m.round === 0);
      finalRound0.sort((a, b) => {
        const aHasBye = (a.p1 === null || a.p2 === null);
        const bHasBye = (b.p1 === null || b.p2 === null);
        if (!aHasBye && bHasBye) return -1;
        if (aHasBye && !bHasBye) return 1;
        return a.index - b.index;
      });

      const activeRoundMatches = rebuiltMatches.filter(m => m.round !== 0);
      finalRound0.forEach((m, idx) => {
        m.id = `match_0_${idx}`;
        m.index = idx;
        
        const destIdx = Math.floor(idx / 2);
        m.destMatchId = `match_1_${destIdx}`;
        m.destParam = (idx % 2 === 0) ? 'p1' : 'p2';

        const dest = activeRoundMatches.find(d => d.id === m.destMatchId);
        if (dest) {
          if (m.destParam === 'p1') {
            dest.p1SourceMatchId = m.id;
          } else {
            dest.p2SourceMatchId = m.id;
          }
        }
        activeRoundMatches.push(m);
      });

      activeRoundMatches.forEach(m => {
        if (m.isThirdPlace || m.round === newR - 1) {
          m.side = 'center';
        } else {
          const roundCount = newS / Math.pow(2, m.round + 1);
          m.side = m.index < roundCount / 2 ? 'left' : 'right';
        }
      });

      propagateState(activeRoundMatches);

      set(state => {
        const nextState = {
          ...state,
          participants: nextParts,
          matches: activeRoundMatches,
        };
        const historyUpdate = recordHistory(nextState, "Bracket Expanded", `Late added "${newP.name}" & expanded bracket to size ${newS}`);
        const finalState = { ...nextState, ...historyUpdate };
        sendStateUpdate(finalState.participants, finalState.matches, finalState.tournamentStatus, "Bracket Expanded", `Late added "${newP.name}" & expanded bracket to size ${newS}`);
        return finalState;
      });
    },

    setHighlightedParticipantId: (id) => set({ highlightedParticipantId: id }),
    setZoomPercent: (zoom) => set({ zoomPercent: zoom }),
    setPanOffset: (offset) => set({ panOffset: offset }),

    undo: () => {
      const { historyLogs, historyIndex } = get();
      if (historyIndex <= 0) return;
      const targetIdx = historyIndex - 1;
      const snapshot = historyLogs[targetIdx].stateSnapshot;

      set({
        participants: JSON.parse(JSON.stringify(snapshot.participants)),
        matches: JSON.parse(JSON.stringify(snapshot.matches)),
        tournamentStatus: snapshot.tournamentStatus,
        historyIndex: targetIdx,
      });

      sendStateUpdate(snapshot.participants, snapshot.matches, snapshot.tournamentStatus, "Undo Action", `Undo to event: ${historyLogs[targetIdx].action}`);
    },

    redo: () => {
      const { historyLogs, historyIndex } = get();
      if (historyIndex >= historyLogs.length - 1) return;
      const targetIdx = historyIndex + 1;
      const snapshot = historyLogs[targetIdx].stateSnapshot;

      set({
        participants: JSON.parse(JSON.stringify(snapshot.participants)),
        matches: JSON.parse(JSON.stringify(snapshot.matches)),
        tournamentStatus: snapshot.tournamentStatus,
        historyIndex: targetIdx,
      });

      sendStateUpdate(snapshot.participants, snapshot.matches, snapshot.tournamentStatus, "Redo Action", `Redo to event: ${historyLogs[targetIdx].action}`);
    },

    rewindTo: (index) => {
      const { historyLogs } = get();
      if (index < 0 || index >= historyLogs.length) return;
      const snapshot = historyLogs[index].stateSnapshot;

      set({
        participants: JSON.parse(JSON.stringify(snapshot.participants)),
        matches: JSON.parse(JSON.stringify(snapshot.matches)),
        tournamentStatus: snapshot.tournamentStatus,
        historyIndex: index,
      });

      sendStateUpdate(snapshot.participants, snapshot.matches, snapshot.tournamentStatus, "Rewind Audit Trail", `Rewound to event: ${historyLogs[index].action}`);
    },

    restartMatch: (matchId) => {
      const { matches, tournamentStatus } = get();
      if (tournamentStatus !== 'Started' && tournamentStatus !== 'Completed') return;

      const targetIndex = matches.findIndex(m => m.id === matchId);
      if (targetIndex === -1) return;

      const nextMatches = JSON.parse(JSON.stringify(matches)) as Match[];
      const match = nextMatches[targetIndex];

      match.isLocked = false;
      match.score1 = null;
      match.score2 = null;
      match.winner = null;

      propagateState(nextMatches);

      // Recalculate if tournament status should go back to Started
      const r0Count = nextMatches.filter(m => m.round === 0).length;
      const S = r0Count * 2;
      const R = S > 0 ? Math.log2(S) : 0;
      const finalMatch = nextMatches.find(m => m.round === R - 1 && !m.isThirdPlace);
      const thirdMatch = nextMatches.find(m => m.isThirdPlace);
      
      let isFinished = finalMatch?.winner !== null;
      if (thirdMatch && thirdMatch.winner === null && (thirdMatch.p1 !== null || thirdMatch.p2 !== null)) {
        isFinished = false;
      }
      const nextStatus = isFinished ? 'Completed' as const : 'Started' as const;

      set(state => {
        const nextState = {
          ...state,
          matches: nextMatches,
          tournamentStatus: nextStatus,
        };
        const detail = `Match "${match.p1?.name} vs ${match.p2?.name}" was restarted (scores cleared & unlocked)`;
        const historyUpdate = recordHistory(nextState, "Match Restarted", detail);
        const finalState = { ...nextState, ...historyUpdate };
        sendStateUpdate(finalState.participants, finalState.matches, finalState.tournamentStatus, "Match Restarted", detail);
        return finalState;
      });
    },

    resetAll: () => {
      console.log('Reset All called: clearing tournament state');
      set({
        participants: [],
        matches: [],
        tournamentStatus: 'Draft',
        historyLogs: [],
        historyIndex: -1,
        highlightedParticipantId: null,
        zoomPercent: 100,
        panOffset: { x: 0, y: 0 },
      });
      sendStateUpdate([], [], 'Draft', 'Reset Tournament', 'Cleared all tournament data.');
    },
  };
});
