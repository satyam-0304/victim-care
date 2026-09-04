// ═══════════════════════════════════════════════════════════════
// server/index.js — Victim Care Express API Server
// ═══════════════════════════════════════════════════════════════

'use strict';

const express = require('express');
const path    = require('path');
const fs      = require('fs');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ─────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// ── Mock DB helpers ────────────────────────────────────────────
const DB_PATH = path.join(__dirname, 'data/mock-db.json');

function readDB() {
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
}

// ══════════════════════════════════════════════════════════════
// API ROUTES
// ══════════════════════════════════════════════════════════════

// ── GET /api/victims ── all victims summary (for dashboard)
app.get('/api/victims', (req, res) => {
  try {
    const db = readDB();
    const victims = db.victims.map(v => ({
      victim_id:             v.victim_id,
      name:                  v.name,
      age:                   v.age,
      gender:                v.gender,
      location:              v.location,
      crime_category:        v.crime_category,
      current_distress_score:v.current_distress_score,
      current_risk_level:    v.current_risk_level,
      case_status:           v.case_status,
      assigned_counselor:    v.assigned_counselor,
      last_interaction:      v.last_interaction,
      // Last 5 history entries for the trend sparkline
      recent_history: v.history.slice(-5).map(h => ({
        timestamp:    h.timestamp,
        distress_score: h.distress_score,
      })),
    }));
    res.json({ victims });
  } catch (err) {
    console.error('[GET /api/victims]', err.message);
    res.status(500).json({ error: 'Failed to load victims' });
  }
});

// ── GET /api/victims/:id ── full victim detail (for profile + drawer)
app.get('/api/victims/:id', (req, res) => {
  try {
    const db = readDB();
    const victim = db.victims.find(v => v.victim_id === req.params.id);
    if (!victim) return res.status(404).json({ error: 'Victim not found' });
    res.json(victim);
  } catch (err) {
    console.error('[GET /api/victims/:id]', err.message);
    res.status(500).json({ error: 'Failed to load victim' });
  }
});

// ── POST /api/victims/:id/action ── mark latest interaction as action taken
app.post('/api/victims/:id/action', (req, res) => {
  try {
    const db = readDB();
    const victim = db.victims.find(v => v.victim_id === req.params.id);
    if (!victim) return res.status(404).json({ error: 'Victim not found' });

    const latest = victim.history[victim.history.length - 1];
    if (!latest) return res.status(400).json({ error: 'No history found' });

    latest.action_taken    = true;
    latest.action_taken_at = new Date().toISOString();
    latest.action_taken_by = req.body.counselor_id || 'GOV-C-001';

    writeDB(db);
    res.json({ success: true, message: 'Action marked as taken', entry: latest });
  } catch (err) {
    console.error('[POST /api/victims/:id/action]', err.message);
    res.status(500).json({ error: 'Failed to mark action' });
  }
});

// ── POST /api/victims/:id/notes ── save case notes
app.post('/api/victims/:id/notes', (req, res) => {
  try {
    const db = readDB();
    const victim = db.victims.find(v => v.victim_id === req.params.id);
    if (!victim) return res.status(404).json({ error: 'Victim not found' });

    victim.case_notes        = req.body.notes || '';
    victim.notes_updated_at  = new Date().toISOString();
    victim.notes_updated_by  = req.body.counselor_id || 'GOV-C-001';

    writeDB(db);
    res.json({ success: true, message: 'Notes saved' });
  } catch (err) {
    console.error('[POST /api/victims/:id/notes]', err.message);
    res.status(500).json({ error: 'Failed to save notes' });
  }
});

// ── POST /api/auth/login ── placeholder (MVP uses client-side auth)
app.post('/api/auth/login', (req, res) => {
  // TODO: Implement real JWT auth here.
  // For MVP, client-side hardcoded validation is used (auth.js).
  res.status(501).json({ error: 'Server-side auth not implemented in MVP. Use client-side auth.' });
});

// ── Catch-all: serve login.html for unmatched routes ──────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/login.html'));
});

// ── Start Server ───────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('');
  console.log('  ██╗   ██╗██╗ ██████╗████████╗██╗███╗   ███╗ ██████╗ █████╗ ██████╗ ███████╗');
  console.log('  ██║   ██║██║██╔════╝╚══██╔══╝██║████╗ ████║██╔════╝██╔══██╗██╔══██╗██╔════╝');
  console.log('  ██║   ██║██║██║        ██║   ██║██╔████╔██║██║     ███████║██████╔╝█████╗  ');
  console.log('  ╚██╗ ██╔╝██║██║        ██║   ██║██║╚██╔╝██║██║     ██╔══██║██╔══██╗██╔══╝  ');
  console.log('   ╚████╔╝ ██║╚██████╗   ██║   ██║██║ ╚═╝ ██║╚██████╗██║  ██║██║  ██║███████╗');
  console.log('    ╚═══╝  ╚═╝ ╚═════╝   ╚═╝   ╚═╝╚═╝     ╚═╝ ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝');
  console.log('');
  console.log(`  🛡  Victim Care Admin Portal — http://localhost:${PORT}`);
  console.log(`  📁  Serving static files from: /public`);
  console.log(`  📊  Mock data: /server/data/mock-db.json`);
  console.log('');
});
