#!/usr/bin/env node
/**
 * Express web service with node-cron scheduler for auto-commits
 * Runs on Render's free tier without needing paid cron jobs
 * Makes initial commit on startup
 */

require('dotenv').config();
const express = require('express');
const cron = require('node-cron');
const { execSync } = require('child_process');
const app = express();

const PORT = process.env.PORT || 10000;

/**
 * Run the auto-commit script
 */
function runAutoCommit() {
  try {
    const timestamp = new Date().toISOString();
    console.log(`\n[${timestamp}] Running auto-commit...`);
    
    execSync('node auto-commit.js', { 
      stdio: 'inherit',
      cwd: process.cwd()
    });
    
    console.log(`✅ Auto-commit task completed\n`);
  } catch (error) {
    console.error(`⚠️  Auto-commit error: ${error.message}\n`);
  }
}

/**
 * Setup background scheduler for auto-commits
 */
function setupScheduler() {
  // 12 AM UTC
  cron.schedule('0 0 * * *', () => {
    console.log('⏰ Scheduled task: Midnight (12 AM UTC)');
    runAutoCommit();
  });
  
  // 9 AM UTC
  cron.schedule('0 9 * * *', () => {
    console.log('⏰ Scheduled task: Morning (9 AM UTC)');
    runAutoCommit();
  });
  
  // 12 PM UTC
  cron.schedule('0 12 * * *', () => {
    console.log('⏰ Scheduled task: Noon (12 PM UTC)');
    runAutoCommit();
  });
  
  // 9 PM UTC
  cron.schedule('0 21 * * *', () => {
    console.log('⏰ Scheduled task: Evening (9 PM UTC)');
    runAutoCommit();
  });
  
  console.log('✅ Scheduler started - auto-commits scheduled 4x daily (UTC)');
}

/**
 * Health check endpoint
 */
app.get('/', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'auto-commit',
    timestamp: new Date().toISOString(),
    nextSchedules: [
      '0:00 (midnight)',
      '9:00 (morning)',
      '12:00 (noon)',
      '21:00 (evening)'
    ]
  });
});

/**
 * Manual commit trigger endpoint
 */
app.post('/commit-now', (req, res) => {
  console.log('📌 Manual commit triggered via API');
  runAutoCommit();
  res.json({ status: 'commit initiated' });
});

/**
 * Start the server and scheduler
 */
function startServer() {
  // Make initial commit on service startup
  console.log('🚀 Service starting - making initial startup commit...');
  runAutoCommit();
  
  setupScheduler();
  
  app.listen(PORT, () => {
    console.log(`\n🚀 Server running on port ${PORT}`);
    console.log(`📍 Service URL: http://localhost:${PORT}`);
    console.log(`💾 Commits log: commits.txt`);
    console.log(`🔐 GitHub: https://github.com/Lethinkj/censored\n`);
  });
}

startServer();
