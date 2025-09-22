# Athena - Quick Installation Guide

## Step 1: Download the Extension

1. Download all files from this repository to a folder on your computer
2. Make sure you have these files:
   - `manifest.json`
   - `popup.html`
   - `popup.js`
   - `content.js`
   - `background.js`

## Step 2: Install in Chrome

1. Open Chrome and go to `chrome://extensions/`
2. Turn on "Developer mode" (toggle in top-right corner)
3. Click "Load unpacked"
4. Select the folder containing the extension files
5. The extension should now appear in your extensions list

## Step 3: Get Your API Keys

### Gemini API Key
1. Go to https://makersuite.google.com/app/apikey
2. Sign in with Google
3. Click "Create API Key"
4. Copy the key

### Notion Setup
1. Go to https://www.notion.so/my-integrations
2. Click "New integration"
3. Name it "Meeting Notes Bot"
4. Select your workspace
5. Copy the "Internal Integration Token"
6. Create a database in Notion with these properties:
   - Title (Title)
   - Date (Date) 
   - Summary (Rich Text)
   - Attendees (Multi-select)
   - Tags (Multi-select)
7. Share the database with your integration
8. Copy the Database ID from the URL

## Step 4: Configure the Extension

1. Click the extension icon in Chrome toolbar
2. Enter your API keys and database ID
3. Click "Save Configuration"
4. Click "Test Connection"

## Step 5: Test It

1. Join a Google Meet, Zoom, or Teams meeting
2. You should see a popup asking to take notes
3. Click "Yes, Start Taking Notes"
4. You'll see a red recording indicator
5. When the meeting ends, select a Notion page to append notes to

That's it! Athena will now automatically detect meetings and help you take notes.
