/**
 * Tournament Bracket Management Engine
 * Handles participant state, seeding, BYE slots, and match updates.
 */

window.BracketEngine = (function() {
  let participants = []; // { id, name, companyId, seed }
  let matches = [];       // { id, round, index, p1, p2, score1, score2, winner, isLocked, p1SourceMatchId, p2SourceMatchId, destMatchId, destParam, side }
  let isTournamentLocked = false;
  let showThirdPlaceMatch = true;

  // Generate unique ID
  function generateId() {
    return '_' + Math.random().toString(36).substr(2, 9);
  }

  // Get standard tournament seeding order for a given power of 2 size
  function getSeedingOrder(size) {
    let order = [1, 2];
    while (order.length < size) {
      let nextOrder = [];
      let target = order.length * 2 + 1;
      for (let x of order) {
        nextOrder.push(x);
        nextOrder.push(target - x);
      }
      order = nextOrder;
    }
    return order;
  }

  // Participant Management
  function getParticipants() {
    return participants;
  }

  function addParticipant(name, companyId, customSeed = null) {
    if (!name || !name.trim()) throw new Error("Name is required");
    if (!companyId || !companyId.trim()) throw new Error("Company ID is required");
    
    // Check uniqueness of Company ID
    if (participants.some(p => p.companyId.toLowerCase() === companyId.trim().toLowerCase())) {
      throw new Error(`Company ID "${companyId}" must be unique.`);
    }

    const newParticipant = {
      id: generateId(),
      name: name.trim(),
      companyId: companyId.trim(),
      seed: customSeed !== null ? parseInt(customSeed, 10) : (participants.length + 1)
    };

    participants.push(newParticipant);
    if (customSeed === null) {
      autoSeed();
    } else {
      resolveSeedDuplicates(newParticipant.id);
    }
    return newParticipant;
  }

  function editParticipant(id, name, companyId, customSeed = null) {
    const p = participants.find(part => part.id === id);
    if (!p) throw new Error("Participant not found");
    
    if (!name || !name.trim()) throw new Error("Name is required");
    if (!companyId || !companyId.trim()) throw new Error("Company ID is required");

    if (participants.some(part => part.id !== id && part.companyId.toLowerCase() === companyId.trim().toLowerCase())) {
      throw new Error(`Company ID "${companyId}" must be unique.`);
    }

    p.name = name.trim();
    p.companyId = companyId.trim();

    if (customSeed !== null) {
      p.seed = parseInt(customSeed, 10);
      resolveSeedDuplicates(id);
    } else {
      autoSeed();
    }
  }

  function deleteParticipant(id) {
    const index = participants.findIndex(p => p.id === id);
    if (index === -1) return false;
    participants.splice(index, 1);
    autoSeed();
    return true;
  }

  // Auto seeding: assign seeds 1..N based on current array position
  function autoSeed() {
    participants.forEach((p, idx) => {
      p.seed = idx + 1;
    });
  }

  // Randomize seeds
  function randomizeSeeds() {
    // Shuffle participants array
    for (let i = participants.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [participants[i], participants[j]] = [participants[j], participants[i]];
    }
    autoSeed();
  }

  // Resolve duplicate seeds when manually edited
  function resolveSeedDuplicates(editedId) {
    const editedP = participants.find(p => p.id === editedId);
    if (!editedP) return;

    // Ensure seed is within range
    if (editedP.seed < 1) editedP.seed = 1;
    if (editedP.seed > participants.length) editedP.seed = participants.length;

    // Sort other participants by seed, keeping edited participant in place
    let others = participants.filter(p => p.id !== editedId);
    others.sort((a, b) => a.seed - b.seed);

    // Reassign seeds to avoid duplicates
    let usedSeeds = new Set([editedP.seed]);
    let currentSeed = 1;

    others.forEach(p => {
      while (usedSeeds.has(currentSeed)) {
        currentSeed++;
      }
      p.seed = currentSeed;
      usedSeeds.add(currentSeed);
    });

    // Sort participants by seed
    participants.sort((a, b) => a.seed - b.seed);
  }

  // Import bulk CSV data
  function importBulk(csvText) {
    const lines = csvText.split('\n');
    let count = 0;
    
    // Clear current participants to start fresh, or add on? Start fresh as requested for import usually.
    participants = [];

    lines.forEach(line => {
      if (!line.trim()) return;
      // Split by comma or tab
      const parts = line.split(/[,\t]/);
      if (parts.length >= 2) {
        const name = parts[0].replace(/^["']|["']$/g, '').trim();
        const companyId = parts[1].replace(/^["']|["']$/g, '').trim();
        if (name && companyId) {
          try {
            addParticipant(name, companyId);
            count++;
          } catch (e) {
            // Log errors but continue import
            console.warn(`Skipping line due to error: ${e.message}`);
          }
        }
      }
    });

    autoSeed();
    return count;
  }

  // Bracket Generation
  function generateBracket() {
    matches = [];
    const N = participants.length;
    if (N < 2) return;

    // Calculate bracket size S (power of 2, minimum 4)
    let S = 4;
    while (S < N) {
      S *= 2;
    }

    const R = Math.log2(S); // Number of rounds
    const B = S - N;        // Number of BYEs

    // Sort participants by seed
    const sortedPlayers = [...participants].sort((a, b) => a.seed - b.seed);

    // Round 0 matchups setup
    const seedOrder = getSeedingOrder(S);
    const round0MatchesCount = S / 2;
    let rawRound0Matches = [];

    for (let i = 0; i < round0MatchesCount; i++) {
      const seed1 = seedOrder[2 * i];
      const seed2 = seedOrder[2 * i + 1];

      const p1 = sortedPlayers.find(p => p.seed === seed1) || { id: 'BYE', name: 'BYE' };
      const p2 = sortedPlayers.find(p => p.seed === seed2) || { id: 'BYE', name: 'BYE' };

      rawRound0Matches.push({
        id: `match_0_${i}`,
        round: 0,
        index: i,
        p1: p1,
        p2: p2,
        score1: null,
        score2: null,
        winner: null,
        isLocked: false,
        p1SourceMatchId: null,
        p2SourceMatchId: null,
        destMatchId: null,
        destParam: null
      });
    }

    // Sort Round 0 matches so that matches with BYEs (player-vs-BYE) are placed in the LAST matchups
    // Let's count active matches: those with 2 players (no BYEs).
    // Player vs Player matches go first, Player vs BYE go last.
    rawRound0Matches.sort((a, b) => {
      const aIsBye = (a.p1.id === 'BYE' || a.p2.id === 'BYE');
      const bIsBye = (b.p1.id === 'BYE' || b.p2.id === 'BYE');
      if (!aIsBye && bIsBye) return -1;
      if (aIsBye && !bIsBye) return 1;
      // If both are same, maintain seed order
      return a.index - b.index;
    });

    // Re-index Round 0 matches based on the new sorted order
    rawRound0Matches.forEach((m, idx) => {
      m.id = `match_0_${idx}`;
      m.index = idx;
    });

    matches = [...rawRound0Matches];

    // Generate matches for subsequent rounds
    for (let r = 1; r < R; r++) {
      const roundMatchesCount = S / (Math.pow(2, r + 1));
      for (let i = 0; i < roundMatchesCount; i++) {
        matches.push({
          id: `match_${r}_${i}`,
          round: r,
          index: i,
          p1: null,
          p2: null,
          score1: null,
          score2: null,
          winner: null,
          isLocked: false,
          p1SourceMatchId: `match_${r-1}_${2*i}`,
          p2SourceMatchId: `match_${r-1}_${2*i+1}`,
          destMatchId: null,
          destParam: null
        });
      }
    }

    // Link matches together
    for (let r = 0; r < R - 1; r++) {
      const roundMatchesCount = S / (Math.pow(2, r + 1));
      for (let i = 0; i < roundMatchesCount; i++) {
        const currentMatch = matches.find(m => m.id === `match_${r}_${i}`);
        const destIndex = Math.floor(i / 2);
        const destParam = (i % 2 === 0) ? 'p1' : 'p2';
        currentMatch.destMatchId = `match_${r+1}_${destIndex}`;
        currentMatch.destParam = destParam;
      }
    }

    // Add Third Place Match if S >= 4
    if (showThirdPlaceMatch && S >= 4) {
      const semiRoundIdx = R - 2;
      matches.push({
        id: 'match_3rd_place',
        round: R - 1, // Treat it as part of the final round visually
        index: 1,     // index 0 is the Final match, 1 is the 3rd place match
        p1: null,
        p2: null,
        score1: null,
        score2: null,
        winner: null,
        isLocked: false,
        p1SourceMatchId: `match_${semiRoundIdx}_0`, // loser of Semi 1
        p2SourceMatchId: `match_${semiRoundIdx}_1`, // loser of Semi 2
        destMatchId: null,
        destParam: null,
        isThirdPlace: true
      });
    }

    // Assign side parameters for double-sided view support
    // Left side: first half of matches in each round.
    // Right side: second half of matches in each round.
    // Final: center.
    matches.forEach(m => {
      if (m.isThirdPlace) {
        m.side = 'center';
        return;
      }
      if (m.round === R - 1) {
        m.side = 'center'; // Final is center
      } else {
        const roundCount = S / Math.pow(2, m.round + 1);
        if (m.index < roundCount / 2) {
          m.side = 'left';
        } else {
          m.side = 'right';
        }
      }
    });

    // Auto-advance players facing BYEs
    autoAdvanceBYEs();
  }

  // Auto-advance BYE slots
  function autoAdvanceBYEs() {
    matches.forEach(m => {
      if (m.round === 0) {
        if (m.p1.id === 'BYE' && m.p2.id !== 'BYE') {
          m.winner = m.p2;
          m.score1 = 0;
          m.score2 = 1; // dummy score to show win
          propagateWinner(m.id);
        } else if (m.p2.id === 'BYE' && m.p1.id !== 'BYE') {
          m.winner = m.p1;
          m.score1 = 1; // dummy score to show win
          m.score2 = 0;
          propagateWinner(m.id);
        }
      }
    });
  }

  // Propagate winner forward in the bracket
  function propagateWinner(matchId) {
    const match = matches.find(m => m.id === matchId);
    if (!match) return;

    const winner = match.winner;
    const destId = match.destMatchId;
    const destParam = match.destParam;

    if (destId) {
      const destMatch = matches.find(m => m.id === destId);
      if (destMatch) {
        const oldParticipant = destMatch[destParam];
        if (!oldParticipant || oldParticipant.id !== winner?.id) {
          destMatch[destParam] = winner;
          destMatch.score1 = null;
          destMatch.score2 = null;
          destMatch.winner = null;
          propagateWinner(destId);
        }
      }
    }

    // Propagate to Third Place Match if this is a semi-final match
    const S = getBracketSize();
    const R = Math.log2(S);
    if (showThirdPlaceMatch && S >= 4 && (match.round === R - 2)) {
      const isSemi0 = match.index === 0;
      const thirdPlaceMatch = matches.find(m => m.id === 'match_3rd_place');
      if (thirdPlaceMatch) {
        const loser = getLoser(match);
        const param = isSemi0 ? 'p1' : 'p2';
        const oldParticipant = thirdPlaceMatch[param];
        if (!oldParticipant || oldParticipant.id !== loser?.id) {
          thirdPlaceMatch[param] = loser;
          thirdPlaceMatch.score1 = null;
          thirdPlaceMatch.score2 = null;
          thirdPlaceMatch.winner = null;
          propagateWinner('match_3rd_place');
        }
      }
    }
  }

  // Get the loser of a completed match
  function getLoser(match) {
    if (!match || !match.winner) return null;
    if (match.p1 && match.winner.id === match.p1.id) return match.p2;
    if (match.p2 && match.winner.id === match.p2.id) return match.p1;
    return null;
  }

  // Edit Match Scores and Advance Winner
  function updateMatchScore(matchId, score1, score2) {
    const match = matches.find(m => m.id === matchId);
    if (!match) throw new Error("Match not found");
    if (match.isLocked || isTournamentLocked) throw new Error("Match is locked");

    // Clear scores if both are empty
    if (score1 === '' && score2 === '') {
      match.score1 = null;
      match.score2 = null;
      match.winner = null;
      propagateWinner(matchId);
      return;
    }

    const s1 = parseFloat(score1);
    const s2 = parseFloat(score2);
    if (isNaN(s1) || isNaN(s2)) {
      throw new Error("Scores must be valid numbers");
    }

    match.score1 = s1;
    match.score2 = s2;

    if (s1 > s2) {
      match.winner = match.p1;
    } else if (s2 > s1) {
      match.winner = match.p2;
    } else {
      // Tie: Do not auto-advance, requires manual intervention or tie-breaker score
      match.winner = null;
    }

    propagateWinner(matchId);
  }

  // Manually force a winner
  function forceMatchWinner(matchId, winnerId) {
    const match = matches.find(m => m.id === matchId);
    if (!match) throw new Error("Match not found");
    if (match.isLocked || isTournamentLocked) throw new Error("Match is locked");

    if (winnerId === 'p1' && match.p1 && match.p1.id !== 'BYE') {
      match.winner = match.p1;
    } else if (winnerId === 'p2' && match.p2 && match.p2.id !== 'BYE') {
      match.winner = match.p2;
    } else if (winnerId === null) {
      match.winner = null;
    } else {
      throw new Error("Invalid winner selection");
    }

    propagateWinner(matchId);
  }

  // Toggle individual match lock
  function toggleMatchLock(matchId) {
    const match = matches.find(m => m.id === matchId);
    if (!match) return;
    match.isLocked = !match.isLocked;
  }

  // Toggle global lock
  function setTournamentLock(locked) {
    isTournamentLocked = locked;
  }

  // Swap participants positions (Admin feature in Edit Mode)
  // Can swap participants between two match positions in Round 0
  function swapParticipants(match1Id, param1, match2Id, param2) {
    if (isTournamentLocked) throw new Error("Tournament is locked");

    const m1 = matches.find(m => m.id === match1Id);
    const m2 = matches.find(m => m.id === match2Id);
    if (!m1 || !m2) throw new Error("Matches not found");
    if (m1.isLocked || m2.isLocked) throw new Error("Matches are locked");

    // Swapping is only allowed in Round 0 (or if they are unplayed)
    if (m1.round !== 0 || m2.round !== 0) {
      throw new Error("Swapping is only supported in Round 0 matches");
    }

    const temp = m1[param1];
    m1[param1] = m2[param2];
    m2[param2] = temp;

    // Reset scores/winners of both matches and propagate
    m1.score1 = null; m1.score2 = null; m1.winner = null;
    m2.score1 = null; m2.score2 = null; m2.winner = null;

    propagateWinner(match1Id);
    propagateWinner(match2Id);
    autoAdvanceBYEs();
  }

  // Late registration logic
  function addLateParticipant(name, companyId) {
    if (isTournamentLocked) throw new Error("Tournament is locked");
    
    // First, add the participant to our list
    const newP = addParticipant(name, companyId);

    // Scenario A: Check if a BYE slot still exists in active Round 0 matches
    // An active BYE slot is a Round 0 match that contains a BYE, and whose destination match is NOT completed yet.
    const byeMatch = matches.find(m => 
      m.round === 0 && 
      (m.p1.id === 'BYE' || m.p2.id === 'BYE') &&
      !isMatchOrDescendantCompleted(m.destMatchId)
    );

    if (byeMatch) {
      // Replace BYE with the new participant
      if (byeMatch.p1.id === 'BYE') {
        byeMatch.p1 = newP;
      } else {
        byeMatch.p2 = newP;
      }

      // Reset score and winner since it's no longer an automatic BYE
      byeMatch.score1 = null;
      byeMatch.score2 = null;
      byeMatch.winner = null;
      propagateWinner(byeMatch.id);
      return { scenario: 'A', participant: newP };
    }

    // Scenario B: No BYE slots available -> Dynamic Expansion of bracket
    expandBracket(newP);
    return { scenario: 'B', participant: newP };
  }

  // Checks if a match or any of its descendants have completed scores/winners
  function isMatchOrDescendantCompleted(matchId) {
    if (!matchId) return false;
    const match = matches.find(m => m.id === matchId);
    if (!match) return false;
    
    // A match is completed if it has a winner that isn't a BYE auto-advance
    const isCompleted = match.winner !== null && 
                        match.p1.id !== 'BYE' && 
                        match.p2.id !== 'BYE';
    
    if (isCompleted) return true;
    return isMatchOrDescendantCompleted(match.destMatchId);
  }

  // Expand the bracket size: S -> 2S
  function expandBracket(newP) {
    const oldS = getBracketSize();
    const newS = oldS * 2;
    const oldR = Math.log2(oldS);
    const newR = Math.log2(newS);

    // Save old matches
    const oldMatches = [...matches];

    // Clear current matches array, we will rebuild
    matches = [];

    // The old Round r matches will now occupy Round r+1 in the new bracket structure.
    // Let's copy them over. We shift their round index by +1.
    // We keep their original participant states, scores, and lock statuses.
    oldMatches.forEach(m => {
      if (m.isThirdPlace) return; // We will recreate third place later
      
      const newRoundIdx = m.round + 1;
      const newIndex = m.index; // In double size, the old bracket forms either the top or bottom half, or left side
      // Actually, we can map the old matches directly as the top half (indices 0..oldS/2^r) of the new round matches.
      // E.g. old Round 0 Match i becomes new Round 1 Match i.
      // Let's create these matches in the matches array.
      matches.push({
        id: `match_${newRoundIdx}_${newIndex}`,
        round: newRoundIdx,
        index: newIndex,
        p1: m.p1,
        p2: m.p2,
        score1: m.score1,
        score2: m.score2,
        winner: m.winner,
        isLocked: m.isLocked,
        p1SourceMatchId: m.p1SourceMatchId ? shiftMatchIdRound(m.p1SourceMatchId) : null,
        p2SourceMatchId: m.p2SourceMatchId ? shiftMatchIdRound(m.p2SourceMatchId) : null,
        destMatchId: null, // will link below
        destParam: null    // will link below
      });
    });

    // Create the new Round 0 matches (count = newS / 2 = oldS)
    // The new participant (newP) needs to play in Round 0.
    // To preserve the matches, we pair the new participant with a player from the old bracket.
    // Which player? Let's take the lowest seed from the old bracket, e.g. the player with seed = oldS (say, P8).
    // P8 was playing in Round 0 of the old bracket (now Round 1).
    // We "split" P8's spot. Instead of P8 playing in Round 1 directly, P8 plays newP in Round 0.
    // The winner of P8 vs newP advances to Round 1 to fill P8's old spot!
    // The other (oldS - 1) slots in Round 1 will be fed by Round 0 matches that are Player vs BYE.
    // This means those players auto-advance from Round 0, preserving their exact old positions!
    
    // Find the lowest seed player whose match is not completed.
    // If all matches are completed, fallback to the lowest seed player overall.
    const playersSorted = participants
      .filter(p => p.id !== newP.id)
      .sort((a, b) => b.seed - a.seed);

    let targetPlayer = playersSorted.find(p => {
      const oldM = oldMatches.find(m => m.round === 0 && (m.p1?.id === p.id || m.p2?.id === p.id));
      return oldM && oldM.winner === null;
    });

    if (!targetPlayer) {
      targetPlayer = playersSorted[0];
    }

    // We search the new Round 1 matches to see where targetPlayer was situated as p1 or p2.
    const targetMatchInR1 = matches.find(m => 
      m.round === 1 && 
      (m.p1?.id === targetPlayer.id || m.p2?.id === targetPlayer.id)
    );

    const targetParamInR1 = targetMatchInR1.p1?.id === targetPlayer.id ? 'p1' : 'p2';

    // Clear that spot in Round 1 so it receives the winner from Round 0
    targetMatchInR1[targetParamInR1] = null;
    targetMatchInR1.score1 = null;
    targetMatchInR1.score2 = null;
    targetMatchInR1.winner = null;

    // Now let's build the new Round 0 matches (newS / 2 matches)
    const r0MatchesCount = newS / 2;
    for (let i = 0; i < r0MatchesCount; i++) {
      let p1 = { id: 'BYE', name: 'BYE' };
      let p2 = { id: 'BYE', name: 'BYE' };
      let p1Source = null;
      let p2Source = null;

      // Match i in Round 0 feeds into Match floor(i/2) in Round 1.
      // The destination slot in Round 1 is:
      const destR1MatchIdx = Math.floor(i / 2);
      const destR1Param = (i % 2 === 0) ? 'p1' : 'p2';
      const destR1Match = matches.find(m => m.round === 1 && m.index === destR1MatchIdx);

      // If this feeds the targetPlayer's slot in Round 1:
      if (destR1MatchIdx === targetMatchInR1.index && destR1Param === targetParamInR1) {
        // This is the active match! targetPlayer vs newP.
        p1 = targetPlayer;
        p2 = newP;
      } else {
        // Otherwise, it feeds an existing player's spot in Round 1.
        // We find who was supposed to be in that Round 1 slot, and place them here in Round 0.
        // They will face a BYE so they auto-advance!
        const existingPlayer = destR1Match[destR1Param];
        p1 = existingPlayer || { id: 'BYE', name: 'BYE' };
        p2 = { id: 'BYE', name: 'BYE' };
      }

      matches.push({
        id: `match_0_${i}`,
        round: 0,
        index: i,
        p1: p1,
        p2: p2,
        score1: null,
        score2: null,
        winner: null,
        isLocked: false,
        p1SourceMatchId: null,
        p2SourceMatchId: null,
        destMatchId: `match_1_${destR1MatchIdx}`,
        destParam: destR1Param
      });
      
      // Update Round 1 match source link
      if (destR1Param === 'p1') {
        destR1Match.p1SourceMatchId = `match_0_${i}`;
      } else {
        destR1Match.p2SourceMatchId = `match_0_${i}`;
      }
    }

    // Now, create the rest of the matches in subsequent rounds that were NOT in the old bracket.
    // Specifically, we need to create the new Finals round (Round newR - 1).
    // In the old bracket, Round oldR was the final. Now it is Round newR - 1.
    // Let's create matches for round r >= 2 up to newR - 1.
    // Wait, the old matches array already had rounds up to oldR (which was R-1, now shifted to R).
    // So we just need to create the final match at Round newR - 1.
    // Let's make sure all round matches are generated.
    for (let r = 2; r < newR; r++) {
      const roundCount = newS / Math.pow(2, r + 1);
      for (let i = 0; i < roundCount; i++) {
        // If this match already exists (copied from old shifted matches), skip.
        const exists = matches.some(m => m.round === r && m.index === i);
        if (!exists) {
          matches.push({
            id: `match_${r}_${i}`,
            round: r,
            index: i,
            p1: null,
            p2: null,
            score1: null,
            score2: null,
            winner: null,
            isLocked: false,
            p1SourceMatchId: `match_${r-1}_${2*i}`,
            p2SourceMatchId: `match_${r-1}_${2*i+1}`,
            destMatchId: null,
            destParam: null
          });
        }
      }
    }

    // Link the rest of the rounds
    for (let r = 1; r < newR - 1; r++) {
      const roundCount = newS / Math.pow(2, r + 1);
      for (let i = 0; i < roundCount; i++) {
        const m = matches.find(match => match.round === r && match.index === i);
        if (m) {
          const destIdx = Math.floor(i / 2);
          m.destMatchId = `match_${r+1}_${destIdx}`;
          m.destParam = (i % 2 === 0) ? 'p1' : 'p2';
        }
      }
    }

    // Recreate Third Place Match
    if (showThirdPlaceMatch && newS >= 4) {
      const semiRoundIdx = newR - 2;
      matches.push({
        id: 'match_3rd_place',
        round: newR - 1,
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
        isThirdPlace: true
      });
    }

    // Sort Round 0 matches so that matches with BYEs are at the end
    const rawRound0 = matches.filter(m => m.round === 0);
    rawRound0.sort((a, b) => {
      const aIsBye = (a.p1.id === 'BYE' || a.p2.id === 'BYE');
      const bIsBye = (b.p1.id === 'BYE' || b.p2.id === 'BYE');
      if (!aIsBye && bIsBye) return -1;
      if (aIsBye && !bIsBye) return 1;
      return a.index - b.index;
    });

    // Remove old Round 0 matches and insert sorted ones, updating their indices
    matches = matches.filter(m => m.round !== 0);
    rawRound0.forEach((m, idx) => {
      m.id = `match_0_${idx}`;
      m.index = idx;
      
      // Update destination link references
      const destMatch = matches.find(dm => dm.id === m.destMatchId);
      if (destMatch) {
        if (m.destParam === 'p1') {
          destMatch.p1SourceMatchId = m.id;
        } else {
          destMatch.p2SourceMatchId = m.id;
        }
      }
      matches.push(m);
    });

    // Reassign sides for double sided view
    matches.forEach(m => {
      if (m.isThirdPlace) {
        m.side = 'center';
        return;
      }
      if (m.round === newR - 1) {
        m.side = 'center';
      } else {
        const roundCount = newS / Math.pow(2, m.round + 1);
        if (m.index < roundCount / 2) {
          m.side = 'left';
        } else {
          m.side = 'right';
        }
      }
    });

    // Run auto-advance and propagation of winners for completed old matches
    autoAdvanceBYEs();

    // Since we copied old matches with winners and scores, we should propagate them to update the new rounds
    // We sort matches by round and index so we propagate chronologically
    const sortedToPropagate = [...matches].sort((a, b) => a.round - b.round);
    sortedToPropagate.forEach(m => {
      if (m.winner) {
        propagateWinner(m.id);
      }
    });
  }

  // Shifts a match ID's round, e.g. "match_0_2" -> "match_1_2"
  function shiftMatchIdRound(matchId) {
    if (!matchId || matchId === 'match_3rd_place') return matchId;
    const parts = matchId.split('_');
    const r = parseInt(parts[1], 10);
    const idx = parts[2];
    return `match_${r + 1}_${idx}`;
  }

  // Get current active bracket size (power of 2)
  function getBracketSize() {
    // Look at Round 0 matches count * 2
    const r0Count = matches.filter(m => m.round === 0).length;
    return r0Count * 2 || 4;
  }

  // Fetch match details
  function getMatches() {
    return matches;
  }

  function getTournamentLock() {
    return isTournamentLocked;
  }

  function setThirdPlaceMatchEnabled(enabled) {
    showThirdPlaceMatch = enabled;
  }

  function isThirdPlaceMatchEnabled() {
    return showThirdPlaceMatch;
  }

  // Reset all match states and clear bracket
  function resetBracket() {
    matches = [];
    isTournamentLocked = false;
  }

  // API exposure
  return {
    getParticipants,
    addParticipant,
    editParticipant,
    deleteParticipant,
    randomizeSeeds,
    importBulk,
    generateBracket,
    getMatches,
    updateMatchScore,
    forceMatchWinner,
    toggleMatchLock,
    setTournamentLock,
    getTournamentLock,
    swapParticipants,
    addLateParticipant,
    getBracketSize,
    setThirdPlaceMatchEnabled,
    isThirdPlaceMatchEnabled,
    resetBracket
  };
})();
