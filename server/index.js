// ═══════════════════════════════════════════════════════════════
// server/index.js — Victim Care Express API Server (Firebase Integrated)
// ═══════════════════════════════════════════════════════════════

import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// ── Initialize Firebase Admin ───────────────────────────────────
let serviceAccount;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  } catch (e) {
    console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT environment variable.");
  }
} else {
  try {
    serviceAccount = require('./hackathon-ram-bharose-firebase-adminsdk-fbsvc-6387197f58.json');
  } catch (e) {
    console.error("Firebase Service Account key missing. Make sure it's in the server folder or the FIREBASE_SERVICE_ACCOUNT env var is set.");
  }
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
    const interventionsSnap = await db.collection('interventions').get();
    let dashboardList = [];
    
    for (const doc of interventionsSnap.docs) {
      const interData = doc.data();
      const sessionId = doc.id;
      const victimId = interData.victim_id;
      
      let chatData = {};
      const chatDoc = await db.collection('chats').doc(sessionId).get();
      if (chatDoc.exists) {
         chatData = chatDoc.data();
      }
      
      const chatHistory = chatData.chatHistory || [];
      let lastUserMsg = "";
      let lastAiReply = "";
      
      for (let i = chatHistory.length - 1; i >= 0; i--) {
        const msg = chatHistory[i];
        if (!lastAiReply && msg.role === 'assistant') lastAiReply = msg.text;
        if (!lastUserMsg && msg.role === 'user') lastUserMsg = msg.text;
        if (lastUserMsg && lastAiReply) break;
      }
      
      let victimName = "Unknown";
      let crimeCategory = "N/A";
      let caseStatus = "Unknown";
      let age = null;
      let gender = null;
      let location = null;
      let assignedCounselor = null;
      
      if (victimId) {
        const victimDoc = await db.collection('victims').doc(victimId).get();
        if (victimDoc.exists) {
          const vDict = victimDoc.data();
          victimName = vDict.name || "Unknown";
          crimeCategory = vDict.crime_category || "N/A";
          caseStatus = vDict.case_status || "Active";
          age = vDict.age;
          gender = vDict.gender;
          location = vDict.location;
          assignedCounselor = vDict.assigned_counselor;
        }
      }
      
      dashboardList.push({
        victim_id: victimId || sessionId,
        session_id: sessionId,
        name: victimName,
        age: age,
        gender: gender,
        location: location,
        crime_category: crimeCategory,
        case_status: caseStatus,
        assigned_counselor: assignedCounselor,
        victimProfile: chatData.victimProfile || "",
        message_transcript: lastUserMsg,
        ai_reply: lastAiReply,
        current_distress_score: interData.latestDistressScore || 0,
        current_risk_level: interData.latestRiskLevel || "Low",
        primary_emotion: interData.latestEmotion || "Unknown",
        immediate_escalation: interData.needsEscalation || false,
        recommended_intervention: interData.recommendedIntervention || "None",
        actionable_link: interData.actionableLink || "",
        last_interaction: interData.lastUpdated && interData.lastUpdated.toDate ? interData.lastUpdated.toDate().toISOString() : null,
        recent_history: []
      });
    }
    
    dashboardList.sort((a, b) => b.current_distress_score - a.current_distress_score);
    res.json({ victims: dashboardList });
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

    // Fetch chat history from the chats collection
    const chatsSnap = await db.collection('chats').where('victim_id', '==', req.params.id).limit(1).get();

    let history = [];
    if (!chatsSnap.empty) {
      const chatDoc = chatsSnap.docs[0].data();
      const chatHistory = chatDoc.chatHistory || [];
      
      let currentUserMsg = null;
      let currentAiMsg = null;
      let lastTime = chatDoc.lastUpdated && chatDoc.lastUpdated.toDate ? chatDoc.lastUpdated.toDate().toISOString() : new Date().toISOString();

      chatHistory.forEach((msg) => {
        if (msg.role === 'user') {
          if (currentUserMsg) {
            history.push({ timestamp: lastTime, user_message: currentUserMsg, ai_reply: currentAiMsg });
          }
          currentUserMsg = msg.text;
          currentAiMsg = null;
        } else if (msg.role === 'assistant') {
          currentAiMsg = msg.text;
          history.push({ timestamp: lastTime, user_message: currentUserMsg || '', ai_reply: currentAiMsg });
          currentUserMsg = null;
          currentAiMsg = null;
        }
      });
      if (currentUserMsg || currentAiMsg) {
         history.push({ timestamp: lastTime, user_message: currentUserMsg || '', ai_reply: currentAiMsg || '' });
      }
    }

    // Also fetch the last intervention state
    const interventionSnap = await db.collection('interventions').where('victim_id', '==', req.params.id).limit(1).get();
    if (history.length > 0 && !interventionSnap.empty) {
      const inv = interventionSnap.docs[0].data();
      const lastHist = history[history.length - 1];
      
      lastHist.latestDistressScore = inv.latestDistressScore;
      lastHist.latestRiskLevel = inv.latestRiskLevel;
      lastHist.needsEscalation = inv.needsEscalation;
      lastHist.recommendedIntervention = inv.recommendedIntervention;
      lastHist.actionableLink = inv.actionableLink || '';
      lastHist.action_taken = inv.action_taken;
      lastHist.action_taken_by = inv.action_taken_by;
      lastHist.action_taken_at = inv.lastUpdated && inv.lastUpdated.toDate ? inv.lastUpdated.toDate().toISOString() : inv.lastUpdated;
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
    
    const interventionSnap = await db.collection('interventions').where('victim_id', '==', req.params.id).limit(1).get();
    if (!interventionSnap.empty) {
      await db.collection('interventions').doc(interventionSnap.docs[0].id).set({
        action_taken: true,
        action_taken_by: counselorId,
        action_taken_at: FieldValue.serverTimestamp(),
      }, { merge: true });
    }

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
if (process.env.NODE_ENV !== 'production') {
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
}

export default app;
