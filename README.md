# Athena - Meeting Notes with Gemini Chrome Extension

Athena is a Chrome extension that automatically detects when you're in an online meeting, uses Google's Gemini AI to take notes, and appends them to your existing Notion pages.

## Features

- 🔍 **Automatic Meeting Detection**: Works with Google Meet, Zoom, and Microsoft Teams
- 🤖 **Gemini AI Integration**: Uses Google's Gemini AI for intelligent note-taking and summarization
- 📝 **Smart Note Organization**: Appends meeting notes to existing Notion pages instead of creating separate notes
- 🎯 **Action Item Extraction**: Automatically identifies and formats action items and decisions
- 🔒 **Privacy Focused**: All processing happens through official APIs

## Prerequisites

Before installing the extension, you'll need:

1. **Gemini API Key**: Get one from [Google AI Studio](https://makersuite.google.com/app/apikey)
2. **Notion Integration Token**: Create one at [Notion Integrations](https://www.notion.so/my-integrations)
3. **Notion Database**: A database in your Notion workspace to store meeting notes

## Setup Instructions

### 1. Get Your API Keys

#### Gemini API Key
1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy the generated API key

#### Notion Integration Token
1. Go to [Notion Integrations](https://www.notion.so/my-integrations)
2. Click "New integration"
3. Give it a name (e.g., "Meeting Notes Bot")
4. Select the workspace where your database is located
5. Copy the "Internal Integration Token"

#### Notion Database ID
1. Open your Notion database in a web browser
2. Copy the database ID from the URL:
   - URL format: `https://www.notion.so/your-workspace/DATABASE_ID?v=...`
   - The database ID is the 32-character string before the `?v=`

### 2. Install the Extension

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension folder
5. The extension should now appear in your extensions list

### 3. Configure the Extension

1. Click the extension icon in your Chrome toolbar
2. Enter your API keys and database ID:
   - **Gemini API Key**: Paste your Gemini API key
   - **Notion Integration Token**: Paste your Notion integration token
   - **Notion Database ID**: Paste your Notion database ID
3. Click "Save Configuration"
4. Click "Test Connection" to verify everything is working

### 4. Set Up Your Notion Database

Your Notion database should have the following properties (you can add more as needed):

- **Title** (Title): The main title of the page
- **Date** (Date): Meeting date
- **Summary** (Rich Text): Meeting summary
- **Attendees** (Multi-select): List of attendees
- **Tags** (Multi-select): Meeting tags or categories

## How to Use

### Automatic Note Taking

1. **Join a Meeting**: The extension automatically detects when you're in a Google Meet, Zoom, or Teams meeting
2. **Prompt Appears**: A popup will ask if you want to take notes
3. **Start Recording**: Click "Yes, Start Taking Notes" to begin audio recording
4. **Recording Indicator**: You'll see a red recording indicator in the top-right corner
5. **End Meeting**: When the meeting ends, the extension will process the audio with Gemini AI
6. **Select Notion Page**: Choose which existing Notion page to append the notes to
7. **Notes Added**: The meeting notes will be appended to your selected page

### Manual Control

You can also manually start/stop note-taking using the extension popup:
1. Click the extension icon
2. Use the "Start Note Taking" or "Stop Note Taking" buttons

## Supported Meeting Platforms

- ✅ **Google Meet**: Full support with automatic detection
- ✅ **Zoom**: Full support with automatic detection  
- ✅ **Microsoft Teams**: Full support with automatic detection

## Note Structure

The extension creates structured notes with:

- **Meeting Summary**: Key points and discussion topics
- **Action Items**: Tasks identified during the meeting
- **Decisions Made**: Important decisions and outcomes
- **Full Transcript**: Complete meeting transcript
- **Attendees**: List of meeting participants
- **Date & Time**: When the meeting occurred

## Privacy & Security

- All audio processing is done through Google's official Gemini API
- No audio data is stored locally or on third-party servers
- API keys are stored securely in Chrome's sync storage
- The extension only accesses meeting pages and your configured Notion workspace

## Troubleshooting

### Common Issues

**"No active meeting detected"**
- Make sure you're actually in a meeting (not just on the meeting page)
- Try refreshing the page
- Check if the meeting platform is supported

**"Failed to start recording"**
- Check microphone permissions in Chrome
- Make sure no other application is using the microphone
- Try refreshing the page and starting again

**"Connection test failed"**
- Verify your API keys are correct
- Check that your Notion integration has access to the database
- Ensure your Gemini API key has the necessary permissions

**"Failed to append notes"**
- Check that your Notion integration token is valid
- Verify the database ID is correct
- Make sure the integration has write access to the database

### Getting Help

If you encounter issues:

1. Check the browser console for error messages
2. Verify all API keys and database settings
3. Test the connection using the "Test Connection" button
4. Make sure you have the latest version of the extension

## Development

### File Structure

```
├── manifest.json          # Extension configuration
├── popup.html            # Extension popup interface
├── popup.js              # Popup functionality
├── content.js            # Meeting detection and UI injection
├── background.js         # Audio processing and Notion integration
└── README.md            # This file
```

### Key Components

- **Content Script**: Detects meetings and handles user interactions
- **Background Script**: Processes audio with Gemini AI and manages Notion API calls
- **Popup Interface**: Configuration and manual controls

## License

This project is open source and available under the MIT License.

## Contributing

Contributions are welcome! Please feel free to submit issues, feature requests, or pull requests.

---

**Note**: This extension requires active microphone access and internet connectivity to function. Make sure to inform meeting participants that notes are being taken for transparency and compliance with your organization's policies.
