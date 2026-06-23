import React, { useState, useMemo, useRef } from 'react';
import { useTournamentStore, Match, Participant } from './store/useTournamentStore';
import { SidebarLeft } from './components/SidebarLeft';
import { BracketCanvas } from './components/BracketCanvas';

export default function App() {
  const tournamentId = useMemo(() => {
    return new URLSearchParams(window.location.search).get('tournamentId') || 'default-tournament';
  }, []);

  const isRegistrationMode = useMemo(() => {
    return new URLSearchParams(window.location.search).get('mode') === 'register';
  }, []);

  const {
    participants,
    matches,
    tournamentStatus,
    historyLogs,
    historyIndex,
    highlightedParticipantId,
    setHighlightedParticipantId,
    addParticipant,
    editParticipant,
    importBulk,
    generateBracket,
    startTournament,
    updateMatchScore,
    toggleMatchLock,
    addLateParticipant,
    undo,
    redo,
    rewindTo,
    restartMatch,
    resetAll,
    setZoomPercent,
    setPanOffset
  } = useTournamentStore();

  // Local UI States
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [editingPart, setEditingPart] = useState<Participant | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAdmin, setIsAdmin] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const hasTournamentId = params.has('tournamentId');
    const isAdminParam = params.get('admin') === 'true';
    return !hasTournamentId || isAdminParam;
  });
  const hasAdminQuery = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('admin') === 'true' || !params.has('tournamentId');
  }, []);
  const [sidebarRightOpen, setSidebarRightOpen] = useState(true);
  const [rightSidebarTab, setRightSidebarTab] = useState<'tracking' | 'progress' | 'history'>('tracking');

  // Mobile Views
  const [activeMobileTab, setActiveMobileTab] = useState<'bracket' | 'participants' | 'search' | 'history'>('bracket');

  // Modal Triggers
  const [showAddPartModal, setShowAddPartModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  // Reference for viewport lookup
  const viewportRef = useRef<HTMLDivElement>(null);

  // Sync selectedMatch to receive updates when lock state or scores change from other clients/WS
  const liveSelectedMatch = useMemo(() => {
    if (!selectedMatch) return null;
    return matches.find(m => m.id === selectedMatch.id) || selectedMatch;
  }, [selectedMatch, matches]);

  // Search filter directory
  const filteredParticipants = useMemo(() => {
    if (!searchQuery.trim()) return participants;
    return participants.filter(p => 
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.companyId.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [participants, searchQuery]);

  // Player locator pathway tracking
  const participantTrackingLogs = useMemo(() => {
    if (!highlightedParticipantId) return null;
    const p = participants.find(part => part.id === highlightedParticipantId);
    if (!p) return null;

    const playerMatches = matches.filter(m => m.p1?.id === p.id || m.p2?.id === p.id);
    const history = playerMatches.map(m => {
      const opponent = m.p1?.id === p.id ? m.p2 : m.p1;
      let statusStr = "Scheduled";
      if (m.winner) {
        statusStr = m.winner.id === p.id ? "Won" : "Lost";
      }
      return {
        roundName: m.isThirdPlace ? "Third Place Playoff" : `Round ${m.round + 1}`,
        opponent: opponent ? `${opponent.name} (${opponent.companyId})` : 'BYE',
        score: m.score1 !== null ? `${m.score1} - ${m.score2}` : 'Not played',
        status: statusStr
      };
    });

    let standing = "Active";
    const lostMatch = playerMatches.find(m => m.winner && m.winner.id !== p.id);
    if (lostMatch) {
      standing = lostMatch.isThirdPlace ? "4th Place" : "Eliminated";
    }
    const finalRoundIdx = matches.length > 0 ? Math.log2(matches.filter(mx => mx.round === 0).length * 2) - 1 : 0;
    const finalMatch = matches.find(m => m.round === finalRoundIdx && !m.isThirdPlace);
    if (finalMatch?.winner?.id === p.id) {
      standing = "🥇 Champion";
    }
    const thirdPlaceMatch = matches.find(m => m.isThirdPlace);
    if (thirdPlaceMatch?.winner?.id === p.id) {
      standing = "🥉 3rd Place";
    }

    return {
      participant: p,
      standing,
      history
    };
  }, [highlightedParticipantId, matches, participants]);

  // Helper to compute participant standings dynamically
  const participantStandings = useMemo(() => {
    if (matches.length === 0) {
      return participants.map(p => ({ participant: p, standing: 'Active', rank: 10 }));
    }
    const r0Count = matches.filter(m => m.round === 0).length;
    const S = r0Count * 2;
    const R = Math.log2(S);
    const finalMatch = matches.find(m => m.round === R - 1 && !m.isThirdPlace);
    const thirdMatch = matches.find(m => m.isThirdPlace);

    return participants.map(p => {
      const pMatches = matches.filter(m => m.p1?.id === p.id || m.p2?.id === p.id);
      const lostMatch = pMatches.find(m => m.winner && m.winner.id !== p.id);
      
      let standing = 'Active';
      let rank = 999;

      if (finalMatch?.winner?.id === p.id) {
        standing = '🏆 Champion';
        rank = 1;
      } else if (thirdMatch?.winner?.id === p.id) {
        standing = '🥉 3rd Place';
        rank = 3;
      } else if (thirdMatch && (thirdMatch.p1?.id === p.id || thirdMatch.p2?.id === p.id) && thirdMatch.winner && thirdMatch.winner.id !== p.id) {
        standing = '4th Place';
        rank = 4;
      } else if (lostMatch) {
        if (lostMatch.round === R - 1) {
          standing = '🥈 Finalist';
          rank = 2;
        } else if (lostMatch.round === R - 2) {
          standing = 'Semifinalist';
          rank = 5;
        } else {
          standing = `Round ${lostMatch.round + 1} Out`;
          rank = 10 + (R - lostMatch.round);
        }
      } else {
        standing = 'Active';
        rank = 10;
      }

      return {
        participant: p,
        standing,
        rank
      };
    }).sort((a, b) => a.rank - b.rank || a.participant.seed - b.participant.seed);
  }, [participants, matches]);

  // Highlight and auto-locate match coordinates on click
  const handleLocateParticipant = (partId: string | null) => {
    setHighlightedParticipantId(partId);
    if (!partId) return;

    const playerMatch = matches.find(m => 
      (m.p1?.id === partId || m.p2?.id === partId) && m.winner === null
    ) || matches.find(m => 
      (m.p1?.id === partId || m.p2?.id === partId)
    );

    if (playerMatch) {
      const isLeft = playerMatch.side === 'left';
      const isCenter = playerMatch.side === 'center';

      let posX = 0;
      if (isCenter) {
        posX = 1500 - 120; // Center of canvasWidth 3000
      } else if (isLeft) {
        posX = playerMatch.round * 280 + 100;
      } else {
        posX = 3000 - (playerMatch.round * 280) - 340;
      }

      let posY = playerMatch.index * 120 + 100;
      if (playerMatch.isThirdPlace) posY += 150;

      // Pan to place matchup card center screen
      setZoomPercent(100);
      setPanOffset({
        x: (window.innerWidth / 2) - posX - 120,
        y: (window.innerHeight / 2) - posY - 40
      });
    }
  };

  const handleExportCSV = () => {
    let csvContent = "data:text/csv;charset=utf-8,Seed,Participant Name,Company ID\n";
    participants.forEach(p => {
      csvContent += `${p.seed},"${p.name}","${p.companyId}"\n`;
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `bracket_participants_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (isRegistrationMode) {
    return <SelfRegistrationView tournamentId={tournamentId} addParticipant={addParticipant} />;
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-white overflow-hidden text-textPrimary">
      
      {/* HEADER SECTION */}
      <header className="bg-white border-b border-border px-6 py-4 flex flex-wrap items-center justify-between z-10 shrink-0 select-none">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🏆</span>
          <h1 className="text-xl font-bold tracking-tight">BracketPro</h1>
          <span className={`ml-3 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
            tournamentStatus === 'Draft' ? 'bg-gray-100 text-gray-800' :
            tournamentStatus === 'Seeded' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
            tournamentStatus === 'Started' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
            'bg-amber-50 text-amber-700 border border-amber-200'
          }`}>
            {tournamentStatus}
          </span>
        </div>

        {/* HEADER CONTROLS */}
        <div className="flex items-center gap-3 mt-2 sm:mt-0">
          
          {/* Admin / View-only selector */}
          {hasAdminQuery && (
            <div className="flex items-center bg-surface border border-border p-1 rounded-lg">
              <button 
                onClick={() => setIsAdmin(false)} 
                className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${!isAdmin ? 'bg-white shadow text-accent' : 'text-textSecondary hover:text-textPrimary'}`}
              >
                Viewer Mode
              </button>
              <button 
                onClick={() => setIsAdmin(true)} 
                className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${isAdmin ? 'bg-white shadow text-accent' : 'text-textSecondary hover:text-textPrimary'}`}
              >
                Admin Edit
              </button>
            </div>
          )}

          {/* Undo / Redo controls */}
          {isAdmin && (
            <div className="flex items-center border border-border rounded-lg bg-surface">
              <button 
                disabled={historyIndex <= 0} 
                onClick={undo} 
                className="p-2 hover:bg-white rounded-l-lg disabled:opacity-40 disabled:hover:bg-transparent"
                title="Undo"
              >
                ↩️
              </button>
              <div className="w-px h-5 bg-border"></div>
              <button 
                disabled={historyIndex >= historyLogs.length - 1} 
                onClick={redo} 
                className="p-2 hover:bg-white rounded-r-lg disabled:opacity-40 disabled:hover:bg-transparent"
                title="Redo"
              >
                ↪️
              </button>
            </div>
          )}

          {/* Reset */}
          {isAdmin && (
            <button 
              onClick={() => {
                if (window.confirm("Reset entire tournament state? This cannot be undone.")) resetAll();
              }}
              className="px-3 py-2 text-xs font-semibold border border-error/20 text-error hover:bg-error/5 rounded-lg transition"
            >
              Reset
            </button>
          )}

          {/* Shareable Links */}
          <button 
            onClick={() => {
              const url = `${window.location.origin}${window.location.pathname}?tournamentId=${tournamentId}`;
              navigator.clipboard.writeText(url);
              alert("Viewer Link (Read-only) copied to clipboard!");
            }}
            className="px-3 py-2 text-xs font-semibold border border-border text-textPrimary hover:bg-surface rounded-lg flex items-center gap-1.5"
            title="Copy link for viewers (does not allow edits)"
          >
            🔗 Copy Viewer Link
          </button>
          
          {isAdmin && (
            <button 
              onClick={() => {
                const url = `${window.location.origin}${window.location.pathname}?tournamentId=${tournamentId}&admin=true`;
                navigator.clipboard.writeText(url);
                alert("Admin Link (With edit access) copied to clipboard!");
              }}
              className="px-3 py-2 text-xs font-semibold border border-border text-accent bg-accent/5 hover:bg-accent/10 rounded-lg flex items-center gap-1.5"
              title="Copy link for admins (allows scoring and editing)"
            >
              ⚙️ Copy Admin Link
            </button>
          )}

          {/* Toggle Right Sidebar */}
          <button 
            onClick={() => setSidebarRightOpen(prev => !prev)}
            className="px-3 py-2 text-xs font-semibold border border-border text-textPrimary hover:bg-surface rounded-lg flex items-center gap-1.5"
            title="Toggle Details Panel"
          >
            {sidebarRightOpen ? '📖 Hide Sidebar' : '📘 Show Sidebar'}
          </button>

          {/* Export CSV */}
          <button 
            onClick={handleExportCSV}
            className="px-3 py-2 text-xs font-semibold border border-border text-textPrimary hover:bg-surface rounded-lg flex items-center gap-1.5"
          >
            📥 Export CSV
          </button>
        </div>
      </header>

      {/* CORE WORKSPACE GRID */}
      <div className="flex-grow flex overflow-hidden relative">
        
        {/* LEFT SIDEBAR (Player directory / CSV import / manual seeds) */}
        <SidebarLeft 
          isAdmin={isAdmin}
          onAddClick={() => setShowAddPartModal(true)}
          onImportClick={() => setShowImportModal(true)}
        />

        {/* BRACKET canvas board or Draft Registration Board */}
        <main className="flex-grow flex flex-col overflow-hidden relative bg-surface" ref={viewportRef}>
          {tournamentStatus === 'Draft' ? (
            <DraftWelcomeView 
              tournamentId={tournamentId}
              participants={participants}
              generateBracket={generateBracket}
              isAdmin={isAdmin}
            />
          ) : (
            <BracketCanvas 
              isAdmin={isAdmin}
              onCardClick={(m) => {
                if (isAdmin && tournamentStatus === 'Started') setSelectedMatch(m);
                else if (m.p1 || m.p2) {
                  if (m.p1) handleLocateParticipant(m.p1.id);
                  else if (m.p2) handleLocateParticipant(m.p2.id);
                }
              }}
            />
          )}
          
          {/* MOBILE NAVIGATION TAB DRAWER BAR */}
          <div className="md:hidden border-t border-border bg-white grid grid-cols-4 shrink-0 z-10 text-center select-none">
            {[
              { id: 'bracket', name: 'Bracket', icon: '🏆' },
              { id: 'participants', name: 'Directory', icon: '👥' },
              { id: 'search', name: 'Locator', icon: '🔍' },
              { id: 'history', name: 'Timeline', icon: '📜' }
            ].map(tab => (
              <button 
                key={tab.id}
                onClick={() => setActiveMobileTab(tab.id as any)}
                className={`py-3 flex flex-col items-center text-xs font-semibold ${
                  activeMobileTab === tab.id ? 'text-accent border-t-2 border-accent' : 'text-textSecondary'
                }`}
              >
                <span>{tab.icon}</span>
                <span className="mt-0.5">{tab.name}</span>
              </button>
            ))}
          </div>

          {/* FLOATING ACTION BUTTON (MOBILE DRAWER MODE) */}
          {isAdmin && tournamentStatus === 'Draft' && (
            <button 
              onClick={() => setShowAddPartModal(true)}
              className="md:hidden fixed right-6 bottom-16 bg-accent text-white p-4 rounded-full shadow-lg z-20 flex items-center justify-center font-bold text-xl hover:scale-105 active:scale-95 transition"
            >
              ➕
            </button>
          )}
        </main>

        {/* Floating Reopen Button for Right Sidebar when collapsed */}
        {!sidebarRightOpen && (
          <button 
            onClick={() => setSidebarRightOpen(true)}
            className="absolute right-0 top-1/2 -translate-y-1/2 bg-white border border-r-0 border-border p-2.5 rounded-l-xl shadow-md hover:bg-surface hover:translate-x-[-2px] transition duration-150 z-30 hidden md:flex items-center justify-center font-bold text-xs select-none cursor-pointer"
            title="Open Details Panel"
          >
            ◀ Details
          </button>
        )}

        {/* RIGHT SIDEBAR (Match details, player tracking, standings, audit histories) */}
        <aside className={`bg-white border-l border-border flex flex-col shrink-0 transition-all duration-300 ${
          sidebarRightOpen ? 'w-80' : 'w-0 overflow-hidden border-none'
        } hidden md:flex`}>
          
          {/* Tab Selector */}
          <div className="flex border-b border-border bg-surface p-1 shrink-0 select-none">
            <button 
              onClick={() => setRightSidebarTab('tracking')}
              className={`flex-1 py-2 text-center text-[10px] font-bold rounded-md transition ${rightSidebarTab === 'tracking' ? 'bg-white shadow text-textPrimary' : 'text-textSecondary hover:text-textPrimary'}`}
            >
              🎯 Path
            </button>
            <button 
              onClick={() => setRightSidebarTab('progress')}
              className={`flex-1 py-2 text-center text-[10px] font-bold rounded-md transition ${rightSidebarTab === 'progress' ? 'bg-white shadow text-textPrimary' : 'text-textSecondary hover:text-textPrimary'}`}
            >
              📊 Progress
            </button>
            <button 
              onClick={() => setRightSidebarTab('history')}
              className={`flex-1 py-2 text-center text-[10px] font-bold rounded-md transition ${rightSidebarTab === 'history' ? 'bg-white shadow text-textPrimary' : 'text-textSecondary hover:text-textPrimary'}`}
            >
              📜 History
            </button>
          </div>

          <div className="flex-grow flex flex-col divide-y divide-border overflow-y-auto">
            
            {/* 1. Path Tracking Tab */}
            {rightSidebarTab === 'tracking' && (
              <div className="p-5 flex flex-col gap-4 flex-grow overflow-y-auto">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-xs text-textPrimary tracking-wide uppercase select-none">Participant Path Tracking</h3>
                  {highlightedParticipantId && (
                    <button 
                      onClick={() => handleLocateParticipant(null)} 
                      className="text-xs text-textSecondary hover:text-accent font-semibold"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {!participantTrackingLogs ? (
                  <div className="text-xs text-textSecondary py-4 bg-surface rounded-lg px-4 border border-dashed border-border text-center select-none">
                    Select a player in the directory or card to track their matchup path and stand.
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="bg-accent/5 border border-accent/20 rounded-lg p-4">
                      <h4 className="font-bold text-textPrimary text-base">{participantTrackingLogs.participant.name}</h4>
                      <p className="text-xs text-textSecondary font-mono mt-0.5">{participantTrackingLogs.participant.companyId}</p>
                      
                      <div className="mt-3 flex justify-between items-center text-xs select-none">
                        <span className="text-textSecondary">Seed: <b>#{participantTrackingLogs.participant.seed}</b></span>
                        <span className={`px-2 py-0.5 rounded-full font-bold uppercase ${
                          participantTrackingLogs.standing.includes('Champion') ? 'bg-yellow-100 text-yellow-800' :
                          participantTrackingLogs.standing.includes('3rd') ? 'bg-amber-100 text-amber-800' :
                          participantTrackingLogs.standing === 'Active' ? 'bg-emerald-100 text-emerald-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {participantTrackingLogs.standing}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <h5 className="text-xs font-bold text-textSecondary uppercase select-none">Match Log Pathway</h5>
                      <div className="space-y-1.5">
                        {participantTrackingLogs.history.map((h, i) => (
                          <div key={i} className="p-2 border border-border rounded bg-surface flex justify-between text-xs items-center">
                            <div>
                              <div className="font-semibold text-textPrimary">{h.roundName}</div>
                              <div className="text-textSecondary text-[10px]">Opponent: {h.opponent}</div>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="font-mono text-textPrimary font-semibold">{h.score}</div>
                              <span className={`text-[10px] font-bold ${
                                h.status === 'Won' ? 'text-success' :
                                h.status === 'Lost' ? 'text-error' :
                                'text-textSecondary'
                              }`}>{h.status}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Late Register Add inside Started */}
                {isAdmin && tournamentStatus === 'Started' && (
                  <div className="border-t border-border pt-4">
                    <h4 className="text-xs font-bold text-textSecondary uppercase mb-2 select-none">Late Registration</h4>
                    <LateRegisterForm onLateAdd={addLateParticipant} />
                  </div>
                )}
              </div>
            )}

            {/* 2. Standings/Leaderboard Tab */}
            {rightSidebarTab === 'progress' && (
              <div className="p-5 flex-grow flex flex-col overflow-hidden">
                <div className="flex items-center justify-between mb-3 select-none">
                  <h3 className="font-bold text-xs text-textPrimary tracking-wide uppercase">Participant Leaderboard</h3>
                  <span className="text-[10px] text-textSecondary bg-surface px-2 py-0.5 rounded font-mono">Total: {participants.length}</span>
                </div>
                <div className="flex-grow overflow-y-auto space-y-2 pr-1">
                  {participantStandings.map(({ participant: p, standing }) => (
                    <div 
                      key={p.id}
                      onClick={() => handleLocateParticipant(p.id)}
                      className={`p-3 border rounded-lg text-left transition cursor-pointer flex justify-between items-center ${
                        highlightedParticipantId === p.id ? 'border-accent bg-accent/5 ring-1 ring-accent' : 'border-border hover:bg-surface'
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <div className="text-xs font-bold text-textPrimary truncate">{p.name}</div>
                        <div className="text-[10px] text-textSecondary font-mono truncate">{p.companyId}</div>
                      </div>
                      <div className="shrink-0 text-right">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full select-none ${
                          standing.includes('🏆') ? 'bg-yellow-100 text-yellow-800' :
                          standing.includes('🥈') ? 'bg-gray-100 text-gray-800' :
                          standing.includes('🥉') ? 'bg-amber-100 text-amber-800' :
                          standing === 'Active' ? 'bg-emerald-100 text-emerald-800 font-bold' :
                          'bg-red-50 text-red-600 border border-red-100'
                        }`}>
                          {standing}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 3. History Timeline Tab */}
            {rightSidebarTab === 'history' && (
              <div className="p-5 flex-grow flex flex-col overflow-hidden">
                <div className="flex items-center justify-between mb-3 select-none">
                  <h3 className="font-bold text-xs text-textPrimary tracking-wide uppercase">Audit History Rewind</h3>
                  <span className="text-[10px] text-textSecondary bg-surface px-2 py-0.5 rounded font-mono">Events: {historyLogs.length}</span>
                </div>

                <div className="flex-grow overflow-y-auto pr-1 space-y-3">
                  {historyLogs.map((log, idx) => (
                    <div 
                      key={idx}
                      onClick={() => isAdmin && rewindTo(idx)}
                      className={`p-3 border rounded-lg text-left transition relative cursor-pointer ${
                        idx === historyIndex 
                          ? 'border-accent bg-accent/5 ring-1 ring-accent' 
                          : 'border-border hover:bg-surface'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1 select-none">
                        <span className="text-xs font-bold text-textPrimary">{log.action}</span>
                        <span className="text-[9px] text-textSecondary font-mono">
                          {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-xs text-textSecondary leading-snug">{log.details}</p>
                      
                      {idx === historyIndex && (
                        <span className="absolute top-2 right-2 text-[8px] bg-accent text-white px-1 rounded uppercase font-bold select-none">
                          Live
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
          
          <div className="p-4 border-t border-border bg-surface shrink-0">
            <button 
              onClick={() => setSidebarRightOpen(false)}
              className="py-2 border border-border bg-white rounded-lg hover:bg-surface text-xs w-full text-center font-bold"
            >
              Collapse Side Panel
            </button>
          </div>
        </aside>
      </div>

      {/* MOBILE DRAWER PORTALS */}
      {activeMobileTab !== 'bracket' && (
        <div className="fixed inset-0 bg-black/40 z-30 md:hidden flex justify-end">
          <div className="w-4/5 max-w-sm bg-white h-full flex flex-col p-5 animate-slide-in relative">
            <button 
              onClick={() => setActiveMobileTab('bracket')}
              className="absolute top-4 right-4 text-gray-400 hover:text-black font-bold text-lg"
            >
              ❌
            </button>

            {/* Participants tab drawer */}
            {activeMobileTab === 'participants' && (
              <div className="flex flex-col h-full overflow-hidden">
                <h3 className="font-bold text-base mb-4 uppercase text-textPrimary tracking-wide select-none">Directory List</h3>
                <input 
                  type="text" 
                  placeholder="Filter directory by name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="text-sm border border-border rounded-lg px-3 py-2 outline-none focus:border-accent bg-surface mb-3"
                />

                {isAdmin && tournamentStatus === 'Draft' && (
                  <div className="grid grid-cols-2 gap-2 mb-3 select-none">
                    <button onClick={() => { setShowAddPartModal(true); setActiveMobileTab('bracket'); }} className="py-2 text-xs font-semibold bg-accent text-white rounded">Add Player</button>
                    <button onClick={() => { setShowImportModal(true); setActiveMobileTab('bracket'); }} className="py-2 text-xs font-semibold border border-border rounded">Bulk CSV</button>
                  </div>
                )}

                <div className="flex-grow overflow-y-auto space-y-1.5">
                  {filteredParticipants.map(p => (
                    <div 
                      key={p.id} 
                      onClick={() => { handleLocateParticipant(p.id); setActiveMobileTab('bracket'); }}
                      className="p-3 border border-border rounded-lg bg-surface flex justify-between items-center cursor-pointer"
                    >
                      <div>
                        <div className="text-sm font-semibold text-textPrimary">#{p.seed} {p.name}</div>
                        <div className="text-xs text-textSecondary font-mono">{p.companyId}</div>
                      </div>
                    </div>
                  ))}
                </div>

                {isAdmin && (
                  <div className="mt-4 pt-3 border-t border-border select-none">
                    {tournamentStatus === 'Draft' ? (
                      <button onClick={() => { generateBracket(); setActiveMobileTab('bracket'); }} className="w-full py-2.5 bg-accent text-white text-xs font-bold rounded shadow">Generate Bracket</button>
                    ) : tournamentStatus === 'Seeded' ? (
                      <button onClick={() => { startTournament(); setActiveMobileTab('bracket'); }} className="w-full py-2.5 bg-success text-white text-xs font-bold rounded uppercase shadow tracking-wider">Start Tournament</button>
                    ) : null}
                  </div>
                )}
              </div>
            )}

            {/* Search Locator drawer */}
            {activeMobileTab === 'search' && (
              <div className="flex flex-col h-full overflow-hidden">
                <h3 className="font-bold text-base mb-4 uppercase text-textPrimary select-none">Path Locator</h3>
                {!participantTrackingLogs ? (
                  <div className="space-y-4 flex-grow overflow-hidden flex flex-col">
                    <p className="text-xs text-textSecondary select-none">Select a player from the list to view their progression path:</p>
                    <div className="space-y-1.5 overflow-y-auto flex-grow">
                      {participants.map(p => (
                        <button 
                          key={p.id} 
                          onClick={() => handleLocateParticipant(p.id)}
                          className="w-full p-2.5 border border-border rounded bg-surface hover:bg-accent/5 text-left text-xs font-semibold truncate flex items-center justify-between"
                        >
                          <span>{p.name}</span>
                          <span className="font-mono text-[10px] text-accent">#{p.seed}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4 overflow-y-auto h-full pr-1">
                    <div className="bg-accent/5 border border-accent/20 rounded p-3 text-xs">
                      <h4 className="font-bold text-textPrimary text-sm">{participantTrackingLogs.participant.name}</h4>
                      <span className="font-mono text-textSecondary">{participantTrackingLogs.participant.companyId}</span>
                      <div className="flex justify-between items-center mt-2 select-none">
                        <span>Seed: #{participantTrackingLogs.participant.seed}</span>
                        <span className="font-bold text-accent uppercase">{participantTrackingLogs.standing}</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <h5 className="text-xs font-bold uppercase text-textSecondary select-none">Match list Opponents</h5>
                      {participantTrackingLogs.history.map((h, idx) => (
                        <div key={idx} className="p-2.5 border border-border rounded bg-surface flex justify-between text-xs items-center">
                          <div>
                            <div className="font-bold text-textPrimary">{h.roundName}</div>
                            <div className="text-textSecondary text-[10px]">Opponent: {h.opponent}</div>
                          </div>
                          <div className="text-right">
                            <div className="font-mono font-bold text-textPrimary">{h.score}</div>
                            <span className="text-[10px] text-accent font-semibold">{h.status}</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    <button 
                      onClick={() => handleLocateParticipant(null)}
                      className="w-full py-2 border border-border text-xs rounded hover:bg-surface font-semibold select-none"
                    >
                      Clear Selection
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Timeline history log drawer */}
            {activeMobileTab === 'history' && (
              <div className="flex flex-col h-full overflow-hidden">
                <h3 className="font-bold text-base mb-4 uppercase text-textPrimary select-none">Timeline Logs</h3>
                <div className="flex-grow overflow-y-auto space-y-2">
                  {historyLogs.map((log, idx) => (
                    <div 
                      key={idx}
                      onClick={() => { if (isAdmin) { rewindTo(idx); setActiveMobileTab('bracket'); } }}
                      className={`p-3 border rounded-lg text-left text-xs cursor-pointer ${
                        idx === historyIndex ? 'border-accent bg-accent/5 ring-1 ring-accent' : 'border-border'
                      }`}
                    >
                      <div className="flex justify-between font-bold mb-1">
                        <span>{log.action}</span>
                        <span className="text-textSecondary font-mono">{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <p className="text-[11px] text-textSecondary">{log.details}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* MODAL: SCORING DIALOG */}
      {liveSelectedMatch && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 border border-border animate-scale-up">
            <div className="flex items-center justify-between border-b border-border pb-4 mb-4 select-none">
              <h3 className="font-bold text-base text-textPrimary flex items-center gap-1.5">
                Match Details 
                <span className="text-xs font-mono bg-surface border border-border px-2 py-0.5 rounded font-normal text-textSecondary">
                  {liveSelectedMatch.isThirdPlace ? 'Third Place Match' : `Round ${liveSelectedMatch.round + 1}`}
                </span>
              </h3>
              <button onClick={() => setSelectedMatch(null)} className="text-gray-400 hover:text-black font-bold">❌</button>
            </div>

            <MatchScoreForm 
              match={liveSelectedMatch} 
              onSave={(s1, s2, forceWin) => {
                updateMatchScore(liveSelectedMatch.id, s1, s2, forceWin);
                setSelectedMatch(null);
              }}
              onCancel={() => setSelectedMatch(null)}
              onLockToggle={() => toggleMatchLock(liveSelectedMatch.id)}
              onRestart={() => {
                if (window.confirm("Restart this match? This will clear scores and unlock the matchup.")) {
                  restartMatch(liveSelectedMatch.id);
                  setSelectedMatch(null);
                }
              }}
            />
          </div>
        </div>
      )}

      {/* MODAL: ADD PARTICIPANT */}
      {showAddPartModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 border border-border animate-scale-up">
            <div className="flex items-center justify-between border-b border-border pb-3 mb-4 select-none">
              <h3 className="font-bold text-base text-textPrimary">Add Participant</h3>
              <button onClick={() => setShowAddPartModal(false)} className="text-gray-400 hover:text-black font-bold">❌</button>
            </div>
            <ParticipantForm 
              onSave={(name, comp) => {
                addParticipant(name, comp);
                setShowAddPartModal(false);
              }} 
              onCancel={() => setShowAddPartModal(false)} 
            />
          </div>
        </div>
      )}

      {/* MODAL: BULK CSV IMPORT */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 border border-border animate-scale-up">
            <div className="flex items-center justify-between border-b border-border pb-3 mb-4 select-none">
              <h3 className="font-bold text-base text-textPrimary">Bulk Import Participants</h3>
              <button onClick={() => setShowImportModal(false)} className="text-gray-400 hover:text-black font-bold">❌</button>
            </div>
            
            <p className="text-xs text-textSecondary mb-3">
              Paste values below, formatted as: <strong>Participant Name, Company ID</strong>
            </p>
            <pre className="bg-surface text-[10px] p-2 rounded-lg font-mono text-textSecondary mb-4 select-all">
John Doe, COMP001
Jane Smith, COMP002
Alice Cooper, COMP003
            </pre>

            <BulkImportForm 
              onImport={(txt) => {
                importBulk(txt);
                setShowImportModal(false);
              }} 
              onCancel={() => setShowImportModal(false)} 
            />
          </div>
        </div>
      )}

      {/* MODAL: EDIT SEED FROM LIST */}
      {editingPart && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 border border-border animate-scale-up">
            <div className="flex items-center justify-between border-b border-border pb-3 mb-4 select-none">
              <h3 className="font-bold text-base text-textPrimary">Edit Participant</h3>
              <button onClick={() => setEditingPart(null)} className="text-gray-400 hover:text-black font-bold">❌</button>
            </div>
            <ParticipantForm 
              participant={editingPart}
              onSave={(name, comp, seed) => {
                editParticipant(editingPart.id, name, comp, seed);
                setEditingPart(null);
              }} 
              onCancel={() => setEditingPart(null)} 
            />
          </div>
        </div>
      )}

    </div>
  );
}

// --- SUB-COMPONENTS ---

function LateRegisterForm({ onLateAdd }: { onLateAdd: (name: string, comp: string) => void }) {
  const [name, setName] = useState('');
  const [companyId, setCompanyId] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !companyId.trim()) return;
    onLateAdd(name.trim(), companyId.trim());
    setName('');
    setCompanyId('');
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <input 
        type="text" 
        placeholder="Player Name" 
        value={name} 
        onChange={e => setName(e.target.value)}
        required
        className="w-full text-xs border border-border rounded px-2.5 py-1.5 outline-none bg-surface"
      />
      <input 
        type="text" 
        placeholder="Company ID" 
        value={companyId} 
        onChange={e => setCompanyId(e.target.value)}
        required
        className="w-full text-xs border border-border rounded px-2.5 py-1.5 outline-none bg-surface"
      />
      <button 
        type="submit" 
        className="w-full py-1.5 bg-accent text-white font-bold rounded text-xs transition hover:bg-accent/90"
      >
        Add Late Registration
      </button>
    </form>
  );
}

interface ParticipantFormProps {
  participant?: Participant;
  onSave: (name: string, comp: string, seed?: number) => void;
  onCancel: () => void;
}

function ParticipantForm({ participant, onSave, onCancel }: ParticipantFormProps) {
  const [name, setName] = useState(participant?.name || '');
  const [companyId, setCompanyId] = useState(participant?.companyId || '');
  const [seed, setSeed] = useState(participant?.seed?.toString() || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(name.trim(), companyId.trim(), participant ? parseInt(seed) : undefined);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <label className="text-xs font-semibold text-textSecondary uppercase">Player Name</label>
        <input 
          type="text" 
          required 
          value={name} 
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Alice Cooper"
          className="w-full text-sm border border-border rounded-lg px-3 py-2 outline-none focus:border-accent bg-surface"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-semibold text-textSecondary uppercase">Company ID (Unique)</label>
        <input 
          type="text" 
          required 
          value={companyId} 
          onChange={e => setCompanyId(e.target.value)}
          placeholder="e.g. COMP103"
          className="w-full text-sm border border-border rounded-lg px-3 py-2 outline-none focus:border-accent bg-surface"
        />
      </div>

      {participant && (
        <div className="space-y-1">
          <label className="text-xs font-semibold text-textSecondary uppercase">Seed Placement</label>
          <input 
            type="number" 
            required 
            min="1"
            value={seed} 
            onChange={e => setSeed(e.target.value)}
            className="w-full text-sm border border-border rounded-lg px-3 py-2 outline-none focus:border-accent bg-surface font-mono"
          />
        </div>
      )}

      <div className="flex items-center justify-end gap-2 border-t border-border pt-4 mt-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 border border-border rounded-lg hover:bg-surface text-xs font-bold">Cancel</button>
        <button type="submit" className="px-4 py-2 bg-success text-white rounded-lg hover:bg-success/90 text-xs font-bold shadow">Save Player</button>
      </div>
    </form>
  );
}

function BulkImportForm({ onImport, onCancel }: { onImport: (csvText: string) => void; onCancel: () => void }) {
  const [csvText, setCsvText] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onImport(csvText);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <textarea 
        rows={8}
        required
        value={csvText}
        onChange={e => setCsvText(e.target.value)}
        placeholder="Paste player data here..."
        className="w-full text-sm border border-border rounded-lg px-3 py-2 outline-none font-mono bg-surface"
      ></textarea>

      <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
        <button type="button" onClick={onCancel} className="px-4 py-2 border border-border rounded-lg hover:bg-surface text-xs font-bold">Cancel</button>
        <button type="submit" className="px-4 py-2 bg-success text-white rounded-lg hover:bg-success/90 text-xs font-bold shadow">Start Import</button>
      </div>
    </form>
  );
}

interface MatchScoreFormProps {
  match: Match;
  onSave: (s1: number | null, s2: number | null, forceWin: 'p1' | 'p2' | null) => void;
  onCancel: () => void;
  onLockToggle: () => void;
  onRestart: () => void;
}

function MatchScoreForm({ match, onSave, onCancel, onLockToggle, onRestart }: MatchScoreFormProps) {
  const [score1, setScore1] = useState(match.score1 !== null ? match.score1.toString() : '');
  const [score2, setScore2] = useState(match.score2 !== null ? match.score2.toString() : '');
  const [forceWinner, setForceWinner] = useState<'p1' | 'p2' | ''>(match.winner ? (match.winner.id === match.p1?.id ? 'p1' : 'p2') : '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (score1 === '' && score2 === '' && !forceWinner) {
      onSave(null, null, null);
      return;
    }

    const s1 = score1 !== '' ? parseFloat(score1) : 0;
    const s2 = score2 !== '' ? parseFloat(score2) : 0;
    onSave(s1, s2, forceWinner || null);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      
      <div className="flex justify-between items-center bg-surface border border-border p-4 rounded-xl">
        <div className="flex flex-col items-center flex-1">
          <span className="text-[10px] font-bold text-accent font-mono uppercase bg-accent/10 px-1.5 py-0.5 rounded mb-1">
            Seed #{match.p1?.seed || 'BYE'}
          </span>
          <span className="text-sm font-bold text-textPrimary text-center truncate w-full">
            {match.p1?.name || 'BYE Slot'}
          </span>
          <span className="text-[10px] text-textSecondary font-mono">{match.p1?.companyId || '-'}</span>
          
          {match.p1 && (
            <div className="mt-3 w-16">
              <input 
                type="number" 
                min="0"
                placeholder="Score"
                value={score1}
                onChange={e => setScore1(e.target.value)}
                disabled={match.isLocked}
                className="w-full text-center text-sm border border-border rounded p-1 outline-none bg-white font-mono font-bold disabled:bg-gray-100"
              />
            </div>
          )}
        </div>

        <div className="px-3 font-mono font-bold text-textSecondary text-xs">VS</div>

        <div className="flex flex-col items-center flex-1">
          <span className="text-[10px] font-bold text-accent font-mono uppercase bg-accent/10 px-1.5 py-0.5 rounded mb-1">
            Seed #{match.p2?.seed || 'BYE'}
          </span>
          <span className="text-sm font-bold text-textPrimary text-center truncate w-full">
            {match.p2?.name || 'BYE Slot'}
          </span>
          <span className="text-[10px] text-textSecondary font-mono">{match.p2?.companyId || '-'}</span>
          
          {match.p2 && (
            <div className="mt-3 w-16">
              <input 
                type="number" 
                min="0"
                placeholder="Score"
                value={score2}
                disabled={match.isLocked}
                onChange={e => setScore2(e.target.value)}
                className="w-full text-center text-sm border border-border rounded p-1 outline-none bg-white font-mono font-bold disabled:bg-gray-100"
              />
            </div>
          )}
        </div>
      </div>

      {match.p1 && match.p2 && (
        <div className="space-y-1">
          <label className="text-xs font-semibold text-textSecondary uppercase">Force Winner Selection</label>
          <select 
            value={forceWinner}
            onChange={e => setForceWinner(e.target.value as any)}
            disabled={match.isLocked}
            className="w-full border border-border rounded-lg px-2.5 py-2 text-xs font-semibold outline-none focus:border-accent bg-white disabled:bg-gray-100"
          >
            <option value="">Decide by high score value</option>
            <option value="p1">Force Win: {match.p1.name}</option>
            <option value="p2">Force Win: {match.p2.name}</option>
          </select>
        </div>
      )}

      <div className="flex items-center gap-2 py-1 select-none">
        <input 
          type="checkbox" 
          id="lock-box"
          checked={match.isLocked}
          onChange={onLockToggle}
          className="w-4 h-4 text-accent border-border rounded outline-none cursor-pointer"
        />
        <label htmlFor="lock-box" className="text-xs font-medium text-textPrimary cursor-pointer">
          🔒 Lock Matchup (prevents score changes or reseeds)
        </label>
      </div>

      <div className="flex items-center justify-between border-t border-border pt-4">
        <button 
          type="button" 
          onClick={onRestart}
          className="px-3.5 py-2 text-xs font-bold text-error border border-error/20 hover:bg-error/5 rounded-lg transition"
        >
          🔄 Restart Match
        </button>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onCancel} className="px-4 py-2 border border-border rounded-lg hover:bg-surface text-xs font-bold">Cancel</button>
          <button 
            type="submit" 
            disabled={match.isLocked}
            className="px-4 py-2 bg-success text-white rounded-lg hover:bg-success/90 text-xs font-bold shadow disabled:opacity-40"
          >
            Save Result
          </button>
        </div>
      </div>
    </form>
  );
}

interface SelfRegistrationViewProps {
  tournamentId: string;
  addParticipant: (name: string, companyId: string) => void;
}

export function SelfRegistrationView({ tournamentId, addParticipant }: SelfRegistrationViewProps) {
  const [name, setName] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      addParticipant(name, companyId);
      setSuccess(true);
      setName('');
      setCompanyId('');
    } catch (err: any) {
      setError(err.message || 'An error occurred during registration.');
    }
  };

  return (
    <div className="min-h-screen bg-surface flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md bg-white border border-border rounded-2xl shadow-xl p-8 space-y-6">
        <div className="text-center select-none">
          <span className="text-4xl">🏆</span>
          <h1 className="text-2xl font-bold text-textPrimary mt-2">Player Self-Registration</h1>
          <p className="text-xs text-textSecondary mt-1">Tournament ID: <span className="font-mono text-accent font-semibold">{tournamentId}</span></p>
        </div>

        {success ? (
          <div className="space-y-4 text-center animate-scale-up">
            <div className="text-success text-5xl">✅</div>
            <h2 className="text-lg font-bold text-textPrimary">Registration Successful!</h2>
            <p className="text-xs text-textSecondary">You are now entered into the tournament seeding list. Good luck!</p>
            <button 
              onClick={() => setSuccess(false)}
              className="mt-2 text-xs font-bold text-accent hover:underline"
            >
              Register another player
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 bg-error/10 border border-error/20 text-error rounded-lg text-xs font-semibold">
                ⚠️ {error}
              </div>
            )}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-textSecondary uppercase">Player Name</label>
              <input 
                type="text" 
                required 
                value={name} 
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Alice Cooper"
                className="w-full text-sm border border-border rounded-lg px-3 py-2 outline-none focus:border-accent bg-surface"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-textSecondary uppercase">Company ID (Unique)</label>
              <input 
                type="text" 
                required 
                value={companyId} 
                onChange={e => setCompanyId(e.target.value)}
                placeholder="e.g. COMP103"
                className="w-full text-sm border border-border rounded-lg px-3 py-2 outline-none focus:border-accent bg-surface"
              />
            </div>

            <button 
              type="submit" 
              className="w-full py-2.5 bg-accent text-white font-bold rounded-lg text-xs tracking-wide uppercase transition hover:bg-accent/90 shadow mt-2"
            >
              Submit Registration
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

interface DraftWelcomeViewProps {
  tournamentId: string;
  participants: Participant[];
  generateBracket: () => void;
  isAdmin: boolean;
}

export function DraftWelcomeView({ tournamentId, participants, generateBracket, isAdmin }: DraftWelcomeViewProps) {
  const registrationUrl = useMemo(() => {
    return `${window.location.origin}${window.location.pathname}?tournamentId=${tournamentId}&mode=register`;
  }, [tournamentId]);

  const qrCodeUrl = useMemo(() => {
    return `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(registrationUrl)}`;
  }, [registrationUrl]);

  const [copied, setCopied] = useState(false);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(registrationUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex-grow flex flex-col items-center justify-center p-6 bg-surface overflow-y-auto max-h-full">
      <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch select-none">
        
        {/* Left Card: QR Registration Invitation */}
        <div className="bg-white border border-border rounded-2xl p-6 shadow-md flex flex-col items-center justify-between text-center">
          <div className="w-full space-y-4">
            <div className="flex items-center justify-center gap-2">
              <span className="text-2xl">📱</span>
              <h2 className="font-bold text-lg text-textPrimary">Player Self-Registration</h2>
            </div>
            <p className="text-xs text-textSecondary leading-relaxed">
              Share the QR code or link below. Registrants can scan it and register their name and Company ID directly on their mobile device or desktop.
            </p>
            
            <div className="flex justify-center bg-surface border border-border rounded-xl p-4 w-48 h-48 mx-auto items-center">
              <img 
                src={qrCodeUrl} 
                alt="Registration QR Code" 
                className="w-full h-full object-contain"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            </div>

            <div className="flex items-center gap-2 bg-surface border border-border p-2 rounded-lg text-xs font-mono w-full select-all">
              <span className="truncate flex-grow text-left">{registrationUrl}</span>
              <button 
                onClick={handleCopyLink} 
                className="px-2.5 py-1 bg-white border border-border rounded-md hover:bg-surface font-sans font-semibold text-[10px] shrink-0"
              >
                {copied ? 'Copied! ✅' : 'Copy'}
              </button>
            </div>
          </div>
          
          <div className="w-full border-t border-border pt-4 mt-6">
            <p className="text-[10px] text-textSecondary font-medium">
              Tournament ID: <span className="font-mono text-accent">{tournamentId}</span>
            </p>
          </div>
        </div>

        {/* Right Card: Participants Review */}
        <div className="bg-white border border-border rounded-2xl p-6 shadow-md flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4 border-b border-border pb-3">
              <h2 className="font-bold text-lg text-textPrimary flex items-center gap-2">
                <span>👥</span> Registrant List
              </h2>
              <span className="text-xs font-bold bg-accent/10 text-accent px-2.5 py-0.5 rounded-full">
                {participants.length} Joined
              </span>
            </div>

            {participants.length === 0 ? (
              <div className="text-center py-12 text-textSecondary space-y-2">
                <p className="text-sm font-semibold">No participants registered yet.</p>
                <p className="text-xs">Scan the QR code to add the first player.</p>
              </div>
            ) : (
              <div className="space-y-2 overflow-y-auto max-h-[280px] pr-1">
                {participants.map((p, idx) => (
                  <div key={p.id} className="p-3 border border-border rounded-lg bg-surface flex justify-between items-center text-xs">
                    <div>
                      <span className="font-bold text-textSecondary mr-2 font-mono">#{idx + 1}</span>
                      <span className="font-bold text-textPrimary">{p.name}</span>
                      <div className="text-[10px] text-textSecondary font-mono mt-0.5 ml-6">{p.companyId}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-border pt-4 mt-6">
            {isAdmin ? (
              <div className="space-y-2">
                <button 
                  disabled={participants.length < 2}
                  onClick={generateBracket}
                  className="w-full py-3 bg-accent text-white font-bold rounded-lg text-xs uppercase tracking-wider shadow disabled:opacity-40 disabled:cursor-not-allowed hover:bg-accent/90 transition"
                >
                  Generate Bracket Matchups
                </button>
                {participants.length < 2 && (
                  <p className="text-[10px] text-error font-semibold text-center mt-1">
                    ⚠️ Need at least 2 participants to generate matchups.
                  </p>
                )}
              </div>
            ) : (
              <div className="text-center py-2 text-xs font-semibold text-textSecondary uppercase tracking-widest bg-surface border border-dashed border-border rounded-lg">
                ⌛ Waiting for organizer to generate matchups...
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

