import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import db from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '../')));

// Add CORS headers for local development if needed
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE");
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

const server = createServer(app);
const wss = new WebSocketServer({ noServer: true });

const PORT = process.env.PORT || 3000;

// Track active WebSocket clients grouped by tournament ID
const clients = new Map();

wss.on('connection', (ws, req) => {
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const tournamentId = url.searchParams.get('tournamentId');
  const isAdmin = url.searchParams.get('admin') === 'true';

  if (!tournamentId) {
    ws.close(4000, "Missing tournamentId");
    return;
  }

  ws.isAdmin = isAdmin;

  if (!clients.has(tournamentId)) {
    clients.set(tournamentId, new Set());
  }
  clients.get(tournamentId).add(ws);

  ws.on('close', () => {
    const list = clients.get(tournamentId);
    if (list) {
      list.delete(ws);
      if (list.size === 0) clients.delete(tournamentId);
    }
  });

  // Handle incoming WebSocket updates for zero-delay synchronization
  ws.on('message', async (message) => {
    try {
      const msg = JSON.parse(message);
      if (msg.type === 'STATE_UPDATE') {
        const { tournamentId: tId, data } = msg;

        // Security check: Only allow updates if user is admin, OR if it is a participant registration during Draft phase
        let isDraft = true;
        try {
          const currentTour = await db.query('SELECT status FROM tournaments WHERE id = $1', [tId]);
          isDraft = currentTour.rows.length === 0 || currentTour.rows[0].status === 'Draft';
        } catch (dbErr) {
          console.warn('DB query for tournament status failed, assuming draft:', dbErr);
        }

        const isRegistration = data.action === 'Participant Added';

        if (!ws.isAdmin && (!isDraft || !isRegistration)) {
          console.warn(`Unauthorized state update attempt on tournament ${tId} (Action: ${data.action})`);
          return;
        }
        
        // 1. Broadcast update to other viewers immediately (excluding sender ws)
        broadcastToTournament(tId, {
          type: 'TOURNAMENT_UPDATE',
          tournamentId: tId,
          data: {
            participants: data.participants,
            matches: data.matches,
            status: data.status
          }
        }, ws);

        // 2. Save in background
        saveStateToDb(tId, data).catch(err => {
          console.error(`[BG SAVE ERROR] Tournament ${tId}:`, err);
        });
      }
    } catch (err) {
      console.error('Error processing WebSocket message:', err);
    }
  });

  ws.on('error', console.error);
});

// Upgrade HTTP to WS
server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

// Helper: Broadcast to all clients viewing a tournament
const broadcastToTournament = (tournamentId, message, senderWs = null) => {
  const list = clients.get(tournamentId);
  if (!list) return;
  const dataString = JSON.stringify(message);
  list.forEach(client => {
    if (client !== senderWs && client.readyState === WebSocket.OPEN) {
      client.send(dataString);
    }
  });
};

// Database background save helper
const saveStateToDb = async (id, data) => {
  const { name, participants, matches, status, action, details, stateSnapshot } = data;
  console.log('Saving tournament state', { id, action });
  
  await db.query('BEGIN');
  try {
    // Save tournament
    await db.query(
      'INSERT INTO tournaments (id, name, status, updated_at) VALUES ($1, $2, $3, NOW()) ON CONFLICT (id) DO UPDATE SET status = $3, updated_at = NOW()',
      [id, name || 'Tournament', status]
    );

    // Save participants
    await db.query('DELETE FROM participants WHERE tournament_id = $1', [id]);
    for (const p of participants) {
      await db.query(
        'INSERT INTO participants (id, tournament_id, name, company_id, seed) VALUES ($1, $2, $3, $4, $5)',
        [p.id, id, p.name, p.companyId || p.company_id, p.seed]
      );
    }

    // Save matches
    await db.query('DELETE FROM matches WHERE tournament_id = $1', [id]);
    for (const m of matches) {
      await db.query(
        `INSERT INTO matches (
          id, tournament_id, round, match_index, p1_id, p2_id, score1, score2, winner_id, 
          is_locked, p1_source_match_id, p2_source_match_id, dest_match_id, dest_param, side, is_third_place
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
        [
          m.id, id, m.round, m.index, 
          m.p1?.id || null, m.p2?.id || null, 
          m.score1, m.score2, m.winner?.id || null, 
          m.isLocked || m.is_locked || false, 
          m.p1SourceMatchId || m.p1_source_match_id || null, 
          m.p2SourceMatchId || m.p2_source_match_id || null, 
          m.destMatchId || m.dest_match_id || null, 
          m.destParam || m.dest_param || null, 
          m.side || null, 
          m.isThirdPlace || m.is_third_place || false
        ]
      );
    }

    // Add History log
    if (action) {
      if (action === 'Reset Tournament') {
        console.log('Reset Tournament action received: deleting history logs for tournament', id);
        await db.query('DELETE FROM history_logs WHERE tournament_id = $1', [id]);
        // No history log inserted for reset to avoid empty snapshot errors
      } else {
        console.log('Inserting history log for action', action);
        await db.query(
          'INSERT INTO history_logs (tournament_id, action_type, details, state_snapshot) VALUES ($1, $2, $3, $4)',
          [id, action, details, JSON.stringify(stateSnapshot)]
        );
      }
    }

    await db.query('COMMIT');
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  }
};

// REST API endpoints

// Get a tournament state
app.get('/api/tournament/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const tourResult = await db.query('SELECT * FROM tournaments WHERE id = $1', [id]);
    if (tourResult.rows.length === 0) {
      return res.status(404).json({ error: "Tournament not found" });
    }

    const partResult = await db.query('SELECT * FROM participants WHERE tournament_id = $1 ORDER BY seed', [id]);
    const matchResult = await db.query('SELECT * FROM matches WHERE tournament_id = $1 ORDER BY round, match_index', [id]);
    const histResult = await db.query('SELECT * FROM history_logs WHERE tournament_id = $1 ORDER BY created_at', [id]);

    // Format DB response keys to camelCase for the frontend store expectations
    const formattedParticipants = partResult.rows.map(p => ({
      id: p.id,
      name: p.name,
      companyId: p.company_id || p.companyId,
      seed: p.seed
    }));

    const formattedMatches = matchResult.rows.map(m => {
      // Find player objects
      const p1 = formattedParticipants.find(p => p.id === m.p1_id) || null;
      const p2 = formattedParticipants.find(p => p.id === m.p2_id) || null;
      const winner = formattedParticipants.find(p => p.id === m.winner_id) || null;

      return {
        id: m.id,
        round: m.round,
        index: m.match_index,
        p1,
        p2,
        score1: m.score1 !== null ? parseFloat(m.score1) : null,
        score2: m.score2 !== null ? parseFloat(m.score2) : null,
        winner,
        isLocked: m.is_locked,
        p1SourceMatchId: m.p1_source_match_id,
        p2SourceMatchId: m.p2_source_match_id,
        destMatchId: m.dest_match_id,
        destParam: m.dest_param,
        side: m.side,
        isThirdPlace: m.is_third_place
      };
    });

    const formattedHistory = histResult.rows.map(h => ({
      timestamp: new Date(h.created_at).getTime(),
      user: "Admin",
      action: h.action_type,
      details: h.details,
      stateSnapshot: typeof h.state_snapshot === 'string' ? JSON.parse(h.state_snapshot) : h.state_snapshot
    }));

    res.json({
      tournament: tourResult.rows[0],
      participants: formattedParticipants,
      matches: formattedMatches,
      history: formattedHistory
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update/Save tournament state (REST fallback)
app.post('/api/tournament/:id/save', async (req, res) => {
  const { id } = req.params;
  try {
    const isAdmin = req.query.admin === 'true' || req.body.admin === 'true';
    
    let isDraft = true;
    try {
      const currentTour = await db.query('SELECT status FROM tournaments WHERE id = $1', [id]);
      isDraft = currentTour.rows.length === 0 || currentTour.rows[0].status === 'Draft';
    } catch (dbErr) {
      console.warn('DB query for tournament status failed, assuming draft:', dbErr);
    }

    const isRegistration = req.body.action === 'Participant Added';

    if (!isAdmin && (!isDraft || !isRegistration)) {
      return res.status(403).json({ error: "Unauthorized state modification attempt" });
    }

    await saveStateToDb(id, req.body);

    // Notify connected viewer clients about update
    broadcastToTournament(id, {
      type: 'TOURNAMENT_UPDATE',
      tournamentId: id,
      data: { 
        participants: req.body.participants, 
        matches: req.body.matches, 
        status: req.body.status 
      }
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
