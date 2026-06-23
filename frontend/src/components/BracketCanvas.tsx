import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useTournamentStore, Match } from '../store/useTournamentStore';
import { MatchCard } from './MatchCard';

interface BracketCanvasProps {
  isAdmin: boolean;
  onCardClick: (match: Match) => void;
}

export const BracketCanvas: React.FC<BracketCanvasProps> = ({
  isAdmin,
  onCardClick
}) => {
  const { 
    matches, 
    zoomPercent, 
    setZoomPercent, 
    panOffset, 
    setPanOffset, 
    highlightedParticipantId,
    tournamentStatus,
    swapParticipants,
    quickAddParticipant
  } = useTournamentStore();

  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const [viewportSize, setViewportSize] = useState({ width: 1000, height: 600 });
  const [layoutMode, setLayoutMode] = useState<'Single' | 'Double'>('Double');

  // Dynamic canvas sizes
  const canvasWidth = 3000;

  // Track viewport size on resize
  useEffect(() => {
    if (viewportRef.current) {
      setViewportSize({
        width: viewportRef.current.clientWidth || 1000,
        height: viewportRef.current.clientHeight || 600
      });
      
      const resizeObserver = new ResizeObserver(entries => {
        for (let entry of entries) {
          setViewportSize({
            width: entry.contentRect.width,
            height: entry.contentRect.height
          });
        }
      });
      resizeObserver.observe(viewportRef.current);
      return () => resizeObserver.disconnect();
    }
  }, []);


  const handleMouseDown = (e: React.MouseEvent) => {
    // If user clicks interactive items, don't drag canvas
    if ((e.target as HTMLElement).closest('.match-card') || 
        (e.target as HTMLElement).closest('button') || 
        (e.target as HTMLElement).closest('select') || 
        (e.target as HTMLElement).closest('input')) {
      return;
    }
    setIsDragging(true);
    dragStart.current = { x: e.clientX - panOffset.x, y: e.clientY - panOffset.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPanOffset({
      x: e.clientX - dragStart.current.x,
      y: e.clientY - dragStart.current.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    const factor = e.deltaY < 0 ? 1.05 : 0.95;
    let nextZoom = Math.round(zoomPercent * factor);
    if (nextZoom < 25) nextZoom = 25;
    if (nextZoom > 300) nextZoom = 300;
    setZoomPercent(nextZoom);
  };

  const handleFit = () => {
    if (viewportRef.current && canvasRef.current) {
      const vW = viewportSize.width;
      const vH = viewportSize.height;
      
      // Calculate bounding box of all matches to fit them
      if (matches.length === 0) return;
      
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;

      matches.forEach(m => {
        const pos = getPosition(m);
        if (pos.x < minX) minX = pos.x;
        if (pos.x + 240 > maxX) maxX = pos.x + 240;
        if (pos.y < minY) minY = pos.y;
        if (pos.y + 120 > maxY) maxY = pos.y + 120;
      });

      const contentWidth = maxX - minX;
      const contentHeight = maxY - minY;

      const scaleX = vW / (contentWidth + 100);
      const scaleY = vH / (contentHeight + 100);
      const scale = Math.min(scaleX, scaleY, 2);

      setZoomPercent(Math.round(Math.max(scale, 0.25) * 100));
      setPanOffset({
        x: (vW - (minX + contentWidth / 2) * scale) - (vW / 2 - (minX + contentWidth / 2) * scale),
        y: (vH - (minY + contentHeight / 2) * scale) - (vH / 2 - (minY + contentHeight / 2) * scale)
      });
      
      // Center pan offset on content
      setPanOffset({
        x: (vW - contentWidth * scale) / 2 - minX * scale,
        y: (vH - contentHeight * scale) / 2 - minY * scale
      });
    }
  };

  const handleCenter = () => {
    setZoomPercent(100);
    const vW = viewportSize.width;
    const vH = viewportSize.height;
    setPanOffset({
      x: (vW - canvasWidth) / 2,
      y: (vH - 600) / 2
    });
  };

  // Pre-calculated centered match coordinates for both Double and Single sided layouts
  const matchPositions = useMemo(() => {
    const posMap = new Map<string, { x: number; y: number }>();
    if (matches.length === 0) return posMap;

    const cardWidth = 240;
    const colWidth = 280;
    const rowHeight = 150; // Perfect vertical spacing for cards
    const topOffset = 80;

    // 1. Position Round 0 matches
    const r0Matches = matches.filter(m => m.round === 0).sort((a, b) => a.index - b.index);

    if (layoutMode === 'Double') {
      const leftR0 = r0Matches.filter(m => m.side === 'left');
      const rightR0 = r0Matches.filter(m => m.side === 'right');

      leftR0.forEach((m, idx) => {
        posMap.set(m.id, {
          x: 100,
          y: idx * rowHeight + topOffset
        });
      });

      rightR0.forEach((m, idx) => {
        posMap.set(m.id, {
          x: canvasWidth - 100 - cardWidth,
          y: idx * rowHeight + topOffset
        });
      });
    } else {
      // Single Sided Column
      r0Matches.forEach((m, idx) => {
        posMap.set(m.id, {
          x: 100,
          y: idx * rowHeight + topOffset
        });
      });
    }

    // 2. Position subsequent rounds (r > 0)
    // Find the max round index
    const maxRound = Math.max(...matches.map(m => m.round));

    for (let r = 1; r <= maxRound; r++) {
      const roundMatches = matches.filter(m => m.round === r && !m.isThirdPlace);
      roundMatches.forEach(m => {
        const src1 = matches.find(s => s.id === m.p1SourceMatchId);
        const src2 = matches.find(s => s.id === m.p2SourceMatchId);

        let y = 0;
        if (src1 && src2) {
          const y1 = posMap.get(src1.id)?.y ?? 0;
          const y2 = posMap.get(src2.id)?.y ?? 0;
          y = (y1 + y2) / 2;
        } else if (src1) {
          y = posMap.get(src1.id)?.y ?? 0;
        } else if (src2) {
          y = posMap.get(src2.id)?.y ?? 0;
        } else {
          // Fallback
          y = m.index * rowHeight * Math.pow(2, r) + topOffset;
        }

        let x = 0;
        if (layoutMode === 'Double') {
          if (m.side === 'center') {
            x = canvasWidth / 2 - cardWidth / 2;
          } else if (m.side === 'left') {
            x = r * colWidth + 100;
          } else {
            x = canvasWidth - (r * colWidth) - 100 - cardWidth;
          }
        } else {
          // Single Sided Column
          if (m.side === 'center') {
            x = r * colWidth + 100;
          } else {
            x = r * colWidth + 100;
          }
        }

        posMap.set(m.id, { x, y });
      });
    }

    // 3. Position Third Place Playoff Match
    const thirdMatch = matches.find(m => m.isThirdPlace);
    if (thirdMatch) {
      const finalMatch = matches.find(m => m.round === maxRound && !m.isThirdPlace);
      if (finalMatch) {
        const finalPos = posMap.get(finalMatch.id);
        if (finalPos) {
          posMap.set(thirdMatch.id, {
            x: finalPos.x,
            y: finalPos.y + 180
          });
        }
      } else {
        posMap.set(thirdMatch.id, {
          x: canvasWidth / 2 - cardWidth / 2,
          y: 500
        });
      }
    }

    return posMap;
  }, [matches, layoutMode, canvasWidth]);

  // Calculate coordinates in the virtual canvas
  const getPosition = (match: Match) => {
    return matchPositions.get(match.id) || { x: 0, y: 0 };
  };

  // --- VIRTUALIZATION CALCULATION ---
  const scale = zoomPercent / 100;
  const padding = 150; // Rendering buffer zone around viewport
  const visibleMinX = (-panOffset.x - padding) / scale;
  const visibleMaxX = (-panOffset.x + viewportSize.width + padding) / scale;
  const visibleMinY = (-panOffset.y - padding) / scale;
  const visibleMaxY = (-panOffset.y + viewportSize.height + padding) / scale;

  const visibleMatches = useMemo(() => {
    return matches.filter(m => {
      const pos = getPosition(m);
      const cardWidth = 240;
      const cardHeight = 100;
      
      const overlapsX = pos.x + cardWidth >= visibleMinX && pos.x <= visibleMaxX;
      const overlapsY = pos.y + cardHeight >= visibleMinY && pos.y <= visibleMaxY;
      return overlapsX && overlapsY;
    });
  }, [matches, layoutMode, visibleMinX, visibleMaxX, visibleMinY, visibleMaxY]);

  // Track highlighted progression path
  const pathHighlightMatches = useMemo(() => {
    if (!highlightedParticipantId) return new Set<string>();
    const ids = new Set<string>();
    matches.forEach(m => {
      if (m.p1?.id === highlightedParticipantId || m.p2?.id === highlightedParticipantId) {
        ids.add(m.id);
      }
    });
    return ids;
  }, [highlightedParticipantId, matches]);

  return (
    <div className="flex-grow flex flex-col overflow-hidden relative bg-surface">
      
      {/* Canvas control header */}
      <div className="bg-white border-b border-border px-4 py-2 flex items-center justify-between shrink-0 z-10 select-none">
        <div className="flex items-center gap-2">
          <span className="text-xs text-textSecondary font-semibold">Interactive Bracket Board</span>
          
          {matches.length > 0 && (
            <div className="flex border border-border rounded-lg bg-surface p-0.5 ml-2">
              <button 
                onClick={() => { setLayoutMode('Single'); }} 
                className={`px-3 py-1 text-xs font-semibold rounded-md transition ${layoutMode === 'Single' ? 'bg-white shadow text-textPrimary' : 'text-textSecondary hover:text-textPrimary'}`}
              >
                Single Sided
              </button>
              <button 
                onClick={() => { setLayoutMode('Double'); }} 
                className={`px-3 py-1 text-xs font-semibold rounded-md transition ${layoutMode === 'Double' ? 'bg-white shadow text-textPrimary' : 'text-textSecondary hover:text-textPrimary'}`}
              >
                Double Sided
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <select 
            value={zoomPercent}
            onChange={(e) => {
              const val = e.target.value;
              if (val === 'fit') handleFit();
              else if (val === 'center') handleCenter();
              else setZoomPercent(parseInt(val));
            }}
            className="border border-border rounded-lg px-2.5 py-1.5 text-xs font-semibold bg-white outline-none focus:border-accent"
          >
            <option value="fit">Fit Screen</option>
            <option value="center">Center view</option>
            <option value="25">25%</option>
            <option value="50">50%</option>
            <option value="75">75%</option>
            <option value="100">100%</option>
            <option value="125">125%</option>
            <option value="150">150%</option>
            <option value="200">200%</option>
            <option value="300">300%</option>
          </select>
          <button onClick={handleCenter} className="p-2 border border-border rounded-lg hover:bg-surface text-xs" title="Recenter">🎯</button>
        </div>
      </div>

      {/* Main Viewport */}
      <div 
        ref={viewportRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        className="flex-grow overflow-hidden relative cursor-grab active:cursor-grabbing outline-none"
      >
        <div 
          ref={canvasRef}
          style={{
            transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${scale})`,
            transformOrigin: '0 0',
          }}
          className="absolute w-[3000px] h-[4000px] pointer-events-none select-none transition-transform duration-75"
        >
          {/* Render Connections */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none">
            {matches.map(m => {
              if (!m.destMatchId) return null;
              
              const start = getPosition(m);
              const dest = matches.find(d => d.id === m.destMatchId);
              if (!dest) return null;
              const end = getPosition(dest);

              const isLeft = m.side === 'left';
              let startX = 0;
              let endX = 0;

              if (layoutMode === 'Double') {
                startX = isLeft ? (start.x + 240) : start.x;
                endX = isLeft ? end.x : (end.x + 240);
              } else {
                startX = start.x + 240;
                endX = end.x;
              }

              const startY = start.y + 40;
              const endY = m.destParam === 'p1' ? (end.y + 20) : (end.y + 60);

              const midX = (startX + endX) / 2;
              
              // Highlight path if both matches in player trajectory path
              const isHighlighted = pathHighlightMatches.has(m.id) && pathHighlightMatches.has(dest.id);

              return (
                <path 
                  key={m.id}
                  d={`M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`}
                  fill="none" 
                  stroke={isHighlighted ? '#2563EB' : '#E5E7EB'} 
                  strokeWidth={isHighlighted ? '3' : '2'}
                  className={isHighlighted ? 'connector-path' : ''}
                  strokeLinecap="round"
                />
              );
            })}
          </svg>

          {/* Render Virtualized Nodes */}
          <div className="absolute inset-0 pointer-events-auto">
            {visibleMatches.map(m => {
              const pos = getPosition(m);
              return (
                <div 
                  key={m.id}
                  style={{ left: `${pos.x}px`, top: `${pos.y}px` }}
                  className="absolute w-[240px]"
                >
                  <MatchCard 
                    match={m} 
                    isAdmin={isAdmin}
                    status={tournamentStatus}
                    highlightedParticipantId={highlightedParticipantId}
                    onClick={() => onCardClick(m)}
                    onSwap={swapParticipants}
                    onQuickAdd={quickAddParticipant}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
