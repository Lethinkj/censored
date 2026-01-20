#!/usr/bin/env node
/**
 * Auto-commit script for daily automated commits
 * Commits to a SEPARATE target repo (not the deployment repo)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

// Target repo for auto-commits (separate from deployment repo)
const TARGET_REPO = 'Lethinkj/Loophole';

async function main() {
  console.log('🤖 Starting auto-commit process...');
  
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.error('❌ GITHUB_TOKEN environment variable not set');
    process.exit(1);
  }

  // Create temp directory for the target repo
  const tempDir = path.join(os.tmpdir(), 'auto-commit-' + Date.now());
  
  try {
    // Clone the target repo to temp directory
    console.log(`📥 Cloning ${TARGET_REPO}...`);
    const repoUrl = `https://${token}@github.com/${TARGET_REPO}.git`;
    execSync(`git clone ${repoUrl} "${tempDir}"`, { stdio: 'pipe' });
    console.log('✓ Cloned target repo');

    // Configure git in the cloned repo
    execSync('git config user.name "Lethinkj"', { cwd: tempDir, stdio: 'pipe' });
    execSync('git config user.email "kjlethin24@gmail.com"', { cwd: tempDir, stdio: 'pipe' });
    console.log('✓ Git configured');

    // Create timestamp entry
    const now = new Date();
    const timestamp = now.toISOString().split('T')[0] + ' ' + 
                      now.toTimeString().split(' ')[0];
    const line = `[${timestamp}] auto-commit by lethin\n`;
    
    // Append to commits.txt in the target repo
    const commitsFile = path.join(tempDir, 'commits.txt');
    fs.appendFileSync(commitsFile, line);
    console.log(`✓ Added: ${line.trim()}`);

    // Commit and push
    const commitMsg = `Auto-commit - ${timestamp}`;
    execSync('git add commits.txt', { cwd: tempDir, stdio: 'pipe' });
    execSync(`git commit -m "${commitMsg}"`, { cwd: tempDir, stdio: 'pipe' });
    execSync('git push origin main', { cwd: tempDir, stdio: 'pipe' });
    
    console.log(`✅ Commit successful: ${commitMsg}`);
    console.log('✅ Auto-commit completed successfully!');

    // Cleanup temp directory
    fs.rmSync(tempDir, { recursive: true, force: true });
    
    process.exit(0);
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    // Cleanup on error
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {}
    process.exit(1);
  }
}

main();
