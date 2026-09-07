// ═══════════════════════════════════════════════════════════════
// server/index.js — Victim Care Express API Server (Firebase Integrated)
// ═══════════════════════════════════════════════════════════════

'use strict';

const express = require('express');
const path    = require('path');
const fs      = require('fs');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');

// ── Initialize Firebase Admin ───────────────────────────────────
let serviceAccount;
try {
  serviceAccount = require('./hackathon-ram-bharose-firebase-adminsdk-fbsvc-6387197f58.json');
} catch (e) {
  console.error("Firebase Service Account key missing. Make sure it's in the server folder.");
  process.exit(1);
}

const appAdmin = initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore(appAdmin);
const auth = getAuth(appAdmin);

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ─────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// ── Authentication Middleware ────────────────────────────────────
// Verifies Firebase JWT sent from frontend
async function verifyAuthToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }
  const token = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await auth.verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (err) {
    console.error('[Auth Error]', err.message);
    return res.status(403).json({ error: 'Unauthorized: Invalid token' });
  }
}

// ══════════════════════════════════════════════════════════════
// API ROUTES
// ══════════════════════════════════════════════════════════════

// ── GET /api/victims ── all victims summary (for dashboard)
app.get('/api/victims', verifyAuthToken, async (req, res) => {
  try {
    const snapshot = await db.collection('victims')
                             .orderBy('current_distress_score', 'desc')
                             .get();
    
    const victims = snapshot.docs.map(doc => {
      const v = doc.data();
      return {
        victim_id:             v.victim_id || doc.id,
        name:                  v.name || 'Unknown',
        age:                   v.age,
        gender:                v.gender,
        location:              v.location,
        crime_category:        v.crime_category,
        current_distress_score:v.current_distress_score,
        current_risk_level:    v.current_risk_level,
        case_status:           v.case_status || 'Active',
        assigned_counselor:    v.assigned_counselor,
        last_interaction:      v.last_interaction && v.last_interaction.toDate ? v.last_interaction.toDate().toISOString() : v.last_interaction,
        recent_history: [] // Mock recent history to prevent breaking the sparkline chart. For real data, we'd query the subcollection.
      };
    });
    res.json({ victims });
  } catch (err) {
    console.error('[GET /api/victims]', err.message);
    res.status(500).json({ error: 'Failed to load victims' });
  }
});

// ── GET /api/victims/:id ── full victim detail (for profile + drawer)
app.get('/api/victims/:id', verifyAuthToken, async (req, res) => {
  try {
    const docSnap = await db.collection('victims').doc(req.params.id).get();
    
    if (!docSnap.exists) return res.status(404).json({ error: 'Victim not found' });
    
    const victim = docSnap.data();
    victim.victim_id = victim.victim_id || docSnap.id;
    if (victim.last_interaction && victim.last_interaction.toDate) {
      victim.last_interaction = victim.last_interaction.toDate().toISOString();
    }

    // Fetch chat history from the chats subcollection
    const chatsSnap = await db.collection('chats').doc(req.params.id).collection('messages')
                              .orderBy('timestamp', 'asc')
                              .get();

    // Map messages into a format the UI expects for history.
    // The UI currently expects { timestamp, user_message, ai_reply, distress_score, recommended_action }
    // Since the new schema uses separate documents per message with {role, text}, we can group them by pairs or just format them.
    // We will group consecutive user and assistant messages for the drawer UI, or just send raw.
    // Based on the AI Team migration plan, role is "user" or "assistant".
    
    let history = [];
    let currentUserMsg = null;
    let currentAiMsg = null;
    let lastTime = null;

    chatsSnap.docs.forEach((d) => {
      const msg = d.data();
      const timeStr = msg.timestamp && msg.timestamp.toDate ? msg.timestamp.toDate().toISOString() : new Date().toISOString();
      
      if (msg.role === 'user') {
        if (currentUserMsg) {
          // Push previous unpaired user msg
          history.push({ timestamp: lastTime, user_message: currentUserMsg, ai_reply: currentAiMsg });
        }
        currentUserMsg = msg.text;
        currentAiMsg = null; // reset for next pair
        lastTime = timeStr;
      } else if (msg.role === 'assistant') {
        currentAiMsg = msg.text;
        lastTime = timeStr;
        history.push({ timestamp: lastTime, user_message: currentUserMsg || '', ai_reply: currentAiMsg });
        currentUserMsg = null;
        currentAiMsg = null;
      }
    });
    
    // push any trailing unmatched message
    if (currentUserMsg || currentAiMsg) {
       history.push({ timestamp: lastTime, user_message: currentUserMsg || '', ai_reply: currentAiMsg || '' });
    }

    // Also fetch the last intervention state
    const interventionSnap = await db.collection('interventions').doc(req.params.id).get();
    if (history.length > 0 && interventionSnap.exists) {
      const inv = interventionSnap.data();
      const lastHist = history[history.length - 1];
      lastHist.action_taken = inv.action_taken;
      lastHist.action_taken_by = inv.action_taken_by;
      lastHist.action_taken_at = inv.action_taken_at && inv.action_taken_at.toDate ? inv.action_taken_at.toDate().toISOString() : inv.action_taken_at;
    }

    victim.history = history;
    res.json(victim);
  } catch (err) {
    console.error('[GET /api/victims/:id]', err.message);
    res.status(500).json({ error: 'Failed to load victim' });
  }
});

// ── POST /api/victims/:id/action ── mark latest interaction as action taken
app.post('/api/victims/:id/action', verifyAuthToken, async (req, res) => {
  try {
    const counselorId = req.user.email || 'Counselor';
    
    await db.collection('interventions').doc(req.params.id).set({
      action_taken: true,
      action_taken_by: counselorId,
      action_taken_at: FieldValue.serverTimestamp(),
    }, { merge: true });

    res.json({ success: true, message: 'Action marked as taken' });
  } catch (err) {
    console.error('[POST /api/victims/:id/action]', err.message);
    res.status(500).json({ error: 'Failed to mark action' });
  }
});

// ── POST /api/victims/:id/notes ── save case notes
app.post('/api/victims/:id/notes', verifyAuthToken, async (req, res) => {
  try {
    const counselorId = req.user.email || 'Counselor';
    
    await db.collection('victims').doc(req.params.id).set({
      case_notes: req.body.notes || '',
      notes_updated_at: FieldValue.serverTimestamp(),
      notes_updated_by: counselorId
    }, { merge: true });

    res.json({ success: true, message: 'Notes saved' });
  } catch (err) {
    console.error('[POST /api/victims/:id/notes]', err.message);
    res.status(500).json({ error: 'Failed to save notes' });
  }
});

// ── POST /api/auth/login ── placeholder (Firebase Client SDK handles real login)
app.post('/api/auth/login', (req, res) => {
  res.status(501).json({ error: 'Server-side auth not implemented. Use Firebase client SDK to login, then pass the token as a Bearer token.' });
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
  console.log(`  🔥  Connected to Firebase Live DB`);
  console.log(`  📁  Serving static files from: /public`);
  console.log('');
});
