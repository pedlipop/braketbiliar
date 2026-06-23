import React, { useState } from 'react';
import { Match } from '../store/useTournamentStore';

interface MatchCardProps {
  match: Match;
  isAdmin: boolean;
  status: 'Draft' | 'Seeded' | 'Started' | 'Completed';
  highlightedParticipantId: string | null;
  onClick: () => void;
  onSwap: (m1: string, p1: 'p1' | 'p2', m2: string, p2: 'p1' | 'p2') => void;
  onQuickAdd: (mId: string, param: 'p1' | 'p2', name: string, company: string) => void;
}

export const MatchCard: React.FC<MatchCardProps> = ({
  match,
  isAdmin,
  status,
  highlightedParticipantId,
  onClick,
  onSwap,
  onQuickAdd,
}) => {
  const [showQuickAddP1, setShowQuickAddP1] = useState(false);
  const [showQuickAddP2, setShowQuickAddP2] = useState(false);
  const [quickName, setQuickName] = useState('');
  const [quickCompany, setQuickCompany] = useState('');

  const hasP1 = match.p1 !== null;
  const hasP2 = match.p2 !== null;

  const p1IsWinner = match.winner?.id === match.p1?.id && match.winner !== null;
  const p2IsWinner = match.winner?.id === match.p2?.id && match.winner !== null;

  const p1Highlighted = match.p1?.id === highlightedParticipantId;
  const p2Highlighted = match.p2?.id === highlightedParticipantId;

  // HTML5 Drag and Drop Handlers
  const handleDragStart = (e: React.DragEvent, param: 'p1' | 'p2') => {
    if (status !== 'Draft' && status !== 'Seeded') return;
    e.dataTransfer.setData("sourceMatchId", match.id);
    e.dataTransfer.setData("sourceParam", param);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, targetParam: 'p1' | 'p2') => {
    e.preventDefault();
    const srcId = e.dataTransfer.getData("sourceMatchId");
    const srcParam = e.dataTransfer.getData("sourceParam") as 'p1' | 'p2';
    if (srcId && srcParam) {
      onSwap(srcId, srcParam, match.id, targetParam);
    }
  };

  const handleQuickSubmit = (e: React.FormEvent, param: 'p1' | 'p2') => {
    e.preventDefault();
    if (quickName.trim() && quickCompany.trim()) {
      onQuickAdd(match.id, param, quickName.trim(), quickCompany.trim());
      setQuickName('');
      setQuickCompany('');
      setShowQuickAddP1(false);
      setShowQuickAddP2(false);
    }
  };

  return (
    <div 
      onClick={onClick}
      className={`match-card bg-white rounded-xl border border-border shadow-sm flex flex-col text-xs transition duration-150 relative overflow-hidden ${
        match.isLocked ? 'border-dashed border-gray-300 bg-gray-50' : 'hover:shadow-md cursor-pointer'
      } ${
        (p1Highlighted || p2Highlighted) ? 'ring-2 ring-accent border-accent bg-accent/[0.02]' : ''
      }`}
    >
      {/* Header Status Tag */}
      <div className="px-2.5 py-1.5 border-b border-border bg-surface flex items-center justify-between font-mono text-[9px] text-textSecondary uppercase tracking-wider select-none">
        <span>
          {match.isThirdPlace ? 'Third Place Playoff' : `Match Index: ${match.index}`}
        </span>
        {match.isLocked && <span title="Match is locked" className="text-[10px]">🔒</span>}
      </div>

      <div className="flex flex-col relative divide-y divide-border">
        
        {/* Player 1 Row */}
        <div 
          className={`p-2.5 flex items-center justify-between relative transition-colors ${
            p1Highlighted ? 'bg-accent/10' : ''
          }`}
          draggable={isAdmin && (status === 'Draft' || status === 'Seeded') && hasP1 && !match.isLocked}
          onDragStart={e => handleDragStart(e, 'p1')}
          onDragOver={handleDragOver}
          onDrop={e => handleDrop(e, 'p1')}
        >
          {hasP1 ? (
            <div className="flex flex-col min-w-0 pr-4">
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-bold text-accent font-mono uppercase bg-accent/10 px-1 rounded select-none">
                  #{match.p1!.seed}
                </span>
                <span className={`font-semibold truncate ${p1IsWinner ? 'text-success font-bold' : 'text-textPrimary'}`}>
                  {match.p1!.name}
                </span>
              </div>
              <span className="text-[9px] text-textSecondary truncate ml-0.5 select-none">{match.p1!.companyId}</span>
            </div>
          ) : (
            <div className="w-full">
              {isAdmin && !match.isLocked ? (
                showQuickAddP1 ? (
                  <form onSubmit={e => handleQuickSubmit(e, 'p1')} onClick={e => e.stopPropagation()} className="flex gap-1">
                    <input 
                      required 
                      type="text" 
                      placeholder="Name" 
                      value={quickName} 
                      onChange={e => setQuickName(e.target.value)} 
                      className="border border-border text-[9px] p-0.5 rounded w-16 outline-none focus:border-accent" 
                    />
                    <input 
                      required 
                      type="text" 
                      placeholder="Comp ID" 
                      value={quickCompany} 
                      onChange={e => setQuickCompany(e.target.value)} 
                      className="border border-border text-[9px] p-0.5 rounded w-16 outline-none focus:border-accent" 
                    />
                    <button type="submit" className="bg-accent text-white px-1.5 rounded text-[9px] font-bold">Add</button>
                  </form>
                ) : (
                  <button 
                    onClick={(e) => { e.stopPropagation(); setShowQuickAddP1(true); }}
                    className="text-accent hover:underline font-semibold text-[10px]"
                  >
                    + Add Participant
                  </button>
                )
              ) : (
                <span className="text-textSecondary italic select-none">BYE Slot</span>
              )}
            </div>
          )}
          {hasP1 && match.score1 !== null && (
            <span className={`font-mono font-bold text-sm select-none ${p1IsWinner ? 'text-success' : 'text-textSecondary'}`}>
              {match.score1}
            </span>
          )}
        </div>

        {/* Player 2 Row */}
        <div 
          className={`p-2.5 flex items-center justify-between relative transition-colors ${
            p2Highlighted ? 'bg-accent/10' : ''
          }`}
          draggable={isAdmin && (status === 'Draft' || status === 'Seeded') && hasP2 && !match.isLocked}
          onDragStart={e => handleDragStart(e, 'p2')}
          onDragOver={handleDragOver}
          onDrop={e => handleDrop(e, 'p2')}
        >
          {hasP2 ? (
            <div className="flex flex-col min-w-0 pr-4">
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-bold text-accent font-mono uppercase bg-accent/10 px-1 rounded select-none">
                  #{match.p2!.seed}
                </span>
                <span className={`font-semibold truncate ${p2IsWinner ? 'text-success font-bold' : 'text-textPrimary'}`}>
                  {match.p2!.name}
                </span>
              </div>
              <span className="text-[9px] text-textSecondary truncate ml-0.5 select-none">{match.p2!.companyId}</span>
            </div>
          ) : (
            <div className="w-full">
              {isAdmin && !match.isLocked ? (
                showQuickAddP2 ? (
                  <form onSubmit={e => handleQuickSubmit(e, 'p2')} onClick={e => e.stopPropagation()} className="flex gap-1">
                    <input 
                      required 
                      type="text" 
                      placeholder="Name" 
                      value={quickName} 
                      onChange={e => setQuickName(e.target.value)} 
                      className="border border-border text-[9px] p-0.5 rounded w-16 outline-none focus:border-accent" 
                    />
                    <input 
                      required 
                      type="text" 
                      placeholder="Comp ID" 
                      value={quickCompany} 
                      onChange={e => setQuickCompany(e.target.value)} 
                      className="border border-border text-[9px] p-0.5 rounded w-16 outline-none focus:border-accent" 
                    />
                    <button type="submit" className="bg-accent text-white px-1.5 rounded text-[9px] font-bold">Add</button>
                  </form>
                ) : (
                  <button 
                    onClick={(e) => { e.stopPropagation(); setShowQuickAddP2(true); }}
                    className="text-accent hover:underline font-semibold text-[10px]"
                  >
                    + Add Participant
                  </button>
                )
              ) : (
                <span className="text-textSecondary italic select-none">BYE Slot</span>
              )}
            </div>
          )}
          {hasP2 && match.score2 !== null && (
            <span className={`font-mono font-bold text-sm select-none ${p2IsWinner ? 'text-success' : 'text-textSecondary'}`}>
              {match.score2}
            </span>
          )}
        </div>

      </div>
    </div>
  );
};
