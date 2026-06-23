import React, { useState } from 'react';
import { useTournamentStore } from '../store/useTournamentStore';

interface SidebarLeftProps {
  isAdmin: boolean;
  onAddClick: () => void;
  onImportClick: () => void;
}

export const SidebarLeft: React.FC<SidebarLeftProps> = ({
  isAdmin,
  onAddClick,
  onImportClick
}) => {
  const { participants, tournamentStatus, deleteParticipant, randomizeSeeds, generateBracket, startTournament } = useTournamentStore();
  const [search, setSearch] = useState('');

  const filtered = participants.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase()) || 
    p.companyId.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <aside className="w-80 border-r border-border flex flex-col shrink-0 bg-white">
      <div className="p-5 border-b border-border flex flex-col gap-4">
        <h2 className="font-bold text-sm text-textPrimary uppercase tracking-wider">Participants</h2>
        <input 
          type="text" 
          placeholder="Filter players..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="text-sm border border-border rounded-lg px-3 py-2 outline-none focus:border-accent bg-surface"
        />

        {isAdmin && tournamentStatus === 'Draft' && (
          <div className="grid grid-cols-2 gap-2">
            <button onClick={onAddClick} className="py-2 text-xs font-bold bg-accent text-white rounded-lg shadow hover:bg-accent/90">Add Player</button>
            <button onClick={onImportClick} className="py-2 text-xs font-bold border border-border hover:bg-surface rounded-lg">Bulk CSV</button>
          </div>
        )}
      </div>

      <div className="flex-grow overflow-y-auto p-4 space-y-1.5">
        {filtered.map(p => (
          <div key={p.id} className="p-3 border border-border rounded-lg bg-surface flex justify-between items-center hover:bg-surface/50">
            <div>
              <div className="text-sm font-semibold">#{p.seed} {p.name}</div>
              <div className="text-xs text-textSecondary font-mono">{p.companyId}</div>
            </div>
            {isAdmin && tournamentStatus === 'Draft' && (
              <button onClick={() => deleteParticipant(p.id)} className="text-xs text-error hover:underline font-bold">Delete</button>
            )}
          </div>
        ))}
      </div>

      {isAdmin && (
        <div className="p-4 border-t border-border bg-surface flex flex-col gap-2 shrink-0">
          {tournamentStatus === 'Draft' ? (
            <>
              <button onClick={randomizeSeeds} className="py-2 text-xs font-bold border border-border hover:bg-white bg-transparent rounded-lg">Randomize Seeds</button>
              <button onClick={generateBracket} className="py-2.5 text-xs font-bold text-white bg-accent hover:bg-accent/90 rounded-lg shadow">Generate Bracket</button>
            </>
          ) : tournamentStatus === 'Seeded' ? (
            <button onClick={startTournament} className="py-3 text-xs font-bold text-white bg-success hover:bg-success/90 rounded-lg shadow tracking-wider uppercase">Start Tournament</button>
          ) : (
            <div className="text-center py-2 text-xs font-bold text-textSecondary uppercase tracking-widest">Active Tournament</div>
          )}
        </div>
      )}
    </aside>
  );
};
