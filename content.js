// Content script for meeting detection and note-taking
class MeetingDetector {
  constructor() {
    this.isInMeeting = false;
    this.isNoteTaking = false;
    this.audioRecorder = null;
    this.audioChunks = [];
    this.mediaRecorder = null;
    this.meetingPlatform = this.detectPlatform();
    this.setupMeetingDetection();
    this.setupMessageListener();
    this.log('info', 'Content script initialized', { platform: this.meetingPlatform });
  }

  detectPlatform() {
    const url = window.location.href;
    if (url.includes('meet.google.com')) return 'google-meet';
    if (url.includes('zoom.us')) return 'zoom';
    if (url.includes('teams.microsoft.com') || url.includes('teams.live.com')) return 'teams';
    return 'unknown';
  }

  setupMeetingDetection() {
    // Check initial state
    this.checkMeetingState();
    
    // Set up observers for dynamic content changes
    const observer = new MutationObserver(() => {
      this.checkMeetingState();
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Periodic check as backup
    setInterval(() => {
      this.checkMeetingState();
    }, 5000);
  }

  checkMeetingState() {
    const wasInMeeting = this.isInMeeting;
    this.isInMeeting = this.detectMeetingState();
    
    if (this.isInMeeting && !wasInMeeting) {
      this.onMeetingStarted();
    } else if (!this.isInMeeting && wasInMeeting) {
      this.onMeetingEnded();
    }
  }

  detectMeetingState() {
    switch (this.meetingPlatform) {
      case 'google-meet':
        return this.detectGoogleMeet();
      case 'zoom':
        return this.detectZoom();
      case 'teams':
        return this.detectTeams();
      default:
        return false;
    }
  }

  detectGoogleMeet() {
    // Check for meeting indicators in Google Meet
    const meetingIndicators = [
      '[data-is-muted]', // Mute button indicates active meeting
      '[data-call-ended="false"]', // Call not ended
      '.crqnQb', // Meeting controls container
      '[jsname="BOHaEe"]', // Meeting toolbar
      '.VfPpkd-Bz112c-LgbsSe' // Join button (not present when in meeting)
    ];
    
    const hasMeetingControls = meetingIndicators.some(selector => 
      document.querySelector(selector)
    );
    
    const hasJoinButton = document.querySelector('[jsname="BOHaEe"]');
    
    return hasMeetingControls && !hasJoinButton;
  }

  detectZoom() {
    // Check for Zoom meeting indicators
    const meetingIndicators = [
      '.meeting-client-view', // Main meeting view
      '.meeting-control-bar', // Control bar
      '.meeting-client-in-meeting' // In-meeting indicator
    ];
    
    return meetingIndicators.some(selector => 
      document.querySelector(selector)
    );
  }

  detectTeams() {
    // Check for Teams meeting indicators
    const meetingIndicators = [
      '[data-tid="meeting-control-bar"]', // Meeting control bar
      '.calling-screen', // Calling screen
      '[data-tid="calling-screen"]' // Alternative calling screen selector
    ];
    
    return meetingIndicators.some(selector => 
      document.querySelector(selector)
    );
  }

  onMeetingStarted() {
    console.log('Meeting started detected');
    this.log('info', 'Meeting started detected');
    this.showNoteTakingPrompt();
  }

  onMeetingEnded() {
    console.log('Meeting ended detected');
    this.log('info', 'Meeting ended detected');
    if (this.isNoteTaking) {
      this.stopNoteTaking();
    }
  }

  showNoteTakingPrompt() {
    // Create banner for note-taking prompt
    const banner = document.createElement('div');
    banner.id = 'meeting-notes-banner';
    banner.innerHTML = `
      <div class="meeting-notes-banner">
        <div class="banner-content">
          <div class="banner-text">
            <strong>Meeting Detected!</strong> Would you like to take notes using Gemini AI?
          </div>
          <div class="banner-actions">
            <button id="start-notes" class="btn btn-primary">Yes, Start Taking Notes</button>
            <button id="dismiss-notes" class="btn btn-secondary">No, Thanks</button>
          </div>
          <button id="close-banner" class="close-btn" title="Close">×</button>
        </div>
      </div>
    `;
    
    // Add styles
    const style = document.createElement('style');
    style.textContent = `
      .meeting-notes-banner {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        background: #007bff;
        color: white;
        z-index: 10000;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }
      .banner-content {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 20px;
        max-width: 1200px;
        margin: 0 auto;
      }
      .banner-text {
        flex: 1;
        font-size: 14px;
        margin-right: 20px;
      }
      .banner-actions {
        display: flex;
        gap: 10px;
        align-items: center;
      }
      .close-btn {
        background: none;
        border: none;
        color: white;
        font-size: 20px;
        cursor: pointer;
        padding: 0;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        margin-left: 10px;
      }
      .close-btn:hover {
        background: rgba(255, 255, 255, 0.2);
      }
      .btn {
        padding: 8px 16px;
        border: 1px solid rgba(255, 255, 255, 0.3);
        border-radius: 4px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 500;
      }
      .btn-primary {
        background: rgba(255, 255, 255, 0.2);
        color: white;
      }
      .btn-primary:hover {
        background: rgba(255, 255, 255, 0.3);
      }
      .btn-secondary {
        background: transparent;
        color: white;
      }
      .btn-secondary:hover {
        background: rgba(255, 255, 255, 0.1);
      }
    `;
    
    document.head.appendChild(style);
    document.body.appendChild(banner);
    
    // Add event listeners
    document.getElementById('start-notes').addEventListener('click', () => {
      this.showPageSelection();
    });
    
    document.getElementById('dismiss-notes').addEventListener('click', () => {
      this.removeBanner();
    });

    document.getElementById('close-banner').addEventListener('click', () => {
      this.removeBanner();
    });
  }

  removeBanner() {
    const banner = document.getElementById('meeting-notes-banner');
    if (banner) {
      banner.remove();
    }
  }

  async showPageSelection() {
    try {
      // Get Notion pages from background script
      const response = await chrome.runtime.sendMessage({ action: 'getNotionPages' });
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to fetch Notion pages');
      }

      // Update banner to show page selection
      const banner = document.getElementById('meeting-notes-banner');
      if (banner) {
        banner.innerHTML = `
          <div class="meeting-notes-banner">
            <div class="banner-content">
              <div class="banner-text">
                <strong>Select Notion Page:</strong> Choose which page to append the meeting notes to
              </div>
              <div class="banner-actions">
                <select id="notion-page-select" style="padding: 6px 10px; border: 1px solid rgba(255,255,255,0.3); border-radius: 4px; background: rgba(255,255,255,0.1); color: white; font-size: 13px; min-width: 200px;">
                  <option value="">Select a page...</option>
                  ${response.pages.map(page => {
                    // Find the property whose type is 'title' regardless of its name
                    let title = 'Untitled';
                    try {
                      const properties = page.properties || {};
                      const titleProp = Object.values(properties).find(p => p && p.type === 'title');
                      if (titleProp && Array.isArray(titleProp.title) && titleProp.title.length > 0) {
                        title = titleProp.title[0]?.text?.content || titleProp.title[0]?.plain_text || 'Untitled';
                      }
                    } catch {}
                    return `<option value="${page.id}">${title}</option>`;
                  }).join('')}
                </select>
                <button id="add-new-note-banner" class="btn btn-secondary" title="Create new note">+ New</button>
                <button id="confirm-notes" class="btn btn-primary" disabled>Start Recording</button>
                <button id="back-to-prompt" class="btn btn-secondary">Back</button>
                <button id="cancel-notes" class="btn btn-secondary">Cancel</button>
              </div>
              <button id="close-banner" class="close-btn" title="Close">×</button>
            </div>
          </div>
        `;

        // Add event listeners for the new buttons
        const pageSelect = document.getElementById('notion-page-select');
        const confirmBtn = document.getElementById('confirm-notes');
        const backBtn = document.getElementById('back-to-prompt');
        const cancelBtn = document.getElementById('cancel-notes');
        const addNewBtn = document.getElementById('add-new-note-banner');

        pageSelect.addEventListener('change', () => {
          confirmBtn.disabled = !pageSelect.value;
        });

        confirmBtn.addEventListener('click', () => {
          const selectedPageId = pageSelect.value;
          if (selectedPageId) {
            // Store the selected page ID for later use
            this.selectedPageId = selectedPageId;
            this.startNoteTaking();
            this.removeBanner();
          }
        });

        backBtn.addEventListener('click', () => {
          this.showNoteTakingPrompt();
        });

        cancelBtn.addEventListener('click', () => {
          this.removeBanner();
        });

        document.getElementById('close-banner').addEventListener('click', () => {
          this.removeBanner();
        });

        addNewBtn.addEventListener('click', async () => {
          try {
            const title = prompt('New note title');
            if (!title) return;
            const resp = await chrome.runtime.sendMessage({ action: 'createNotionPage', title });
            if (!resp || !resp.success) throw new Error(resp?.error || 'Failed to create page');
            const page = resp.page;
            const properties = page.properties || {};
            const titleProp = Object.values(properties).find(p => p && p.type === 'title');
            let extractedTitle = title;
            if (titleProp && Array.isArray(titleProp.title) && titleProp.title.length > 0) {
              extractedTitle = titleProp.title[0]?.text?.content || titleProp.title[0]?.plain_text || title;
            }
            const opt = document.createElement('option');
            opt.value = page.id;
            opt.textContent = extractedTitle;
            pageSelect.appendChild(opt);
            pageSelect.value = page.id;
            confirmBtn.disabled = false;
          } catch (e) {
            this.showError('Failed to create note: ' + e.message);
          }
        });
      }
    } catch (error) {
      console.error('Error showing page selection:', error);
      this.showError('Failed to load Notion pages. Please try again.');
    }
  }

  async startNoteTaking() {
    try {
      this.isNoteTaking = true;
      console.log('Starting note taking...');
      this.log('info', 'Starting note taking');
      
      // Request microphone permission and start recording
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioRecorder = new MediaRecorder(stream);
      this.audioChunks = [];
      
      this.audioRecorder.ondataavailable = (event) => {
        this.audioChunks.push(event.data);
      };
      
      this.audioRecorder.onstop = () => {
        this.processAudio();
      };
      
      this.audioRecorder.start();
      
      // Show recording indicator
      this.showRecordingIndicator();
      
    } catch (error) {
      console.error('Error starting note taking:', error);
      this.log('error', 'Error starting note taking', { error: String(error) });
      this.showError('Failed to start recording. Please check microphone permissions.');
    }
  }

  stopNoteTaking() {
    if (this.audioRecorder && this.audioRecorder.state === 'recording') {
      this.audioRecorder.stop();
      this.audioRecorder.stream.getTracks().forEach(track => track.stop());
    }
    this.isNoteTaking = false;
    this.log('info', 'Stopped note taking');
    this.hideRecordingIndicator();
  }

  showRecordingIndicator() {
    const indicator = document.createElement('div');
    indicator.id = 'recording-indicator';
    indicator.innerHTML = `
      <div style="
        position: fixed;
        top: 20px;
        right: 20px;
        background: #dc3545;
        color: white;
        padding: 10px 15px;
        border-radius: 4px;
        z-index: 10001;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
      ">
        🔴 Recording Meeting Notes...
      </div>
    `;
    document.body.appendChild(indicator);
  }

  hideRecordingIndicator() {
    const indicator = document.getElementById('recording-indicator');
    if (indicator) {
      indicator.remove();
    }
  }

  async processAudio() {
    try {
      const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
      const audioData = await this.blobToBase64(audioBlob);
      this.log('info', 'Processed audio blob', { size: audioData?.length });
      
      // Send to background script for processing
      chrome.runtime.sendMessage({
        action: 'processAudio',
        audioData: audioData,
        platform: this.meetingPlatform,
        selectedPageId: this.selectedPageId
      });
      
    } catch (error) {
      console.error('Error processing audio:', error);
      this.log('error', 'Error processing audio', { error: String(error) });
      this.showError('Failed to process audio recording.');
    }
  }

  blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: #dc3545;
      color: white;
      padding: 15px 20px;
      border-radius: 4px;
      z-index: 10001;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
    `;
    errorDiv.textContent = message;
    document.body.appendChild(errorDiv);
    
    setTimeout(() => {
      errorDiv.remove();
    }, 5000);
  }

  setupMessageListener() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      switch (request.action) {
        case 'startNoteTaking':
          this.startNoteTaking();
          sendResponse({ success: true });
          break;
        case 'stopNoteTaking':
          this.stopNoteTaking();
          sendResponse({ success: true });
          break;
        case 'getMeetingStatus':
          sendResponse({ isInMeeting: this.isInMeeting });
          break;
        default:
          sendResponse({ success: false });
      }
    });
  }

  log(level, msg, meta) {
    try {
      chrome.runtime.sendMessage({ action: 'log', level, msg, meta });
    } catch (e) {
      // ignore
    }
  }
}

// Initialize the meeting detector
const meetingDetector = new MeetingDetector();
