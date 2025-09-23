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
    // Ensure Material Icons font is available on the page
    try {
      const existingIcons = document.querySelector('link[href*="fonts.googleapis.com/icon?family=Material+Icons"]');
      if (!existingIcons) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://fonts.googleapis.com/icon?family=Material+Icons';
        document.head.appendChild(link);
      }
    } catch {}
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
            <button id="close-banner" class="close-btn" title="Close"><span class=\"material-icons\">close</span></button>
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
      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
      .spinner {
        display: inline-flex;
        animation: spin 1s linear infinite;
      }
    `;
    
    document.head.appendChild(style);
    document.body.appendChild(banner);
    
    // Add event listeners
    document.getElementById('start-notes').addEventListener('click', (e) => {
      const btn = e.currentTarget;
      const sibling = document.getElementById('dismiss-notes');
      btn.disabled = true;
      btn.style.opacity = '0.9';
      btn.innerHTML = '<span class="material-icons spinner" style="vertical-align:middle;margin-right:8px;font-size:18px;">autorenew</span>Loading…';
      // Match height with the "No, Thanks" button
      try {
        const h = sibling ? sibling.offsetHeight : null;
        if (h) {
          btn.style.height = h + 'px';
          btn.style.display = 'inline-flex';
          btn.style.alignItems = 'center';
          btn.style.boxSizing = 'border-box';
        }
      } catch {}
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
      // Ensure Material Icons font is available on the page (in case prompt was bypassed)
      try {
        const existingIcons = document.querySelector('link[href*="fonts.googleapis.com/icon?family=Material+Icons"]');
        if (!existingIcons) {
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = 'https://fonts.googleapis.com/icon?family=Material+Icons';
          document.head.appendChild(link);
        }
      } catch {}
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
                <div class="custom-dropdown" style="position: relative; min-width: 200px; height: 40px;">
                  <div id="banner-page-dropdown-toggle" class="dropdown-toggle" style="height: 40px; padding: 8px 12px; border: 1px solid rgba(255,255,255,0.3); border-radius: 4px; background: rgba(255,255,255,0.1); color: white; font-size: 13px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; box-sizing: border-box;">
                    <span id="banner-page-dropdown-text">Select a page...</span>
                    <span class="material-icons" style="font-size:18px;">expand_more</span>
                  </div>
                  <div id="banner-page-dropdown-menu" class="dropdown-menu" style="display: none; position: absolute; top: 100%; left: 0; right: 0; background: white; border: 1px solid #ddd; border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); z-index: 1000; max-height: 400px; flex-direction: column;">
                    <div class="dropdown-search" style="padding: 8px; border-bottom: 1px solid #eee; flex-shrink: 0;">
                      <input type="text" id="banner-page-search-input" placeholder="Search pages..." style="width: 100%; padding: 4px; border: 1px solid #ddd; border-radius: 2px; font-size: 12px;">
                    </div>
                    <div id="banner-page-dropdown-options" class="dropdown-options" style="flex: 1; overflow-y: auto; max-height: 350px;">
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
                        return `<div class="dropdown-option" data-page-id="${page.id}" style="padding: 8px 12px; cursor: pointer; font-size: 13px; border-bottom: 1px solid #f0f0f0; color: #333;">${title}</div>`;
                      }).join('')}
                    </div>
                    <div class="dropdown-footer" style="border-top: 1px solid #eee; padding: 8px; flex-shrink: 0; background: white;">
                      <button id="add-new-note-banner" class="btn btn-secondary" style="width: 100%; margin: 0; padding: 8px; font-size: 13px; background: #007bff; color: white; border: none;"><span class="material-icons" style="vertical-align:middle;margin-right:6px;">note_add</span>Create Note</button>
                    </div>
                  </div>
                </div>
                <button id="confirm-notes" class="btn btn-primary" disabled style="background: #28a745; color: white; border: none; height:40px; display:flex; align-items:center; padding: 0 12px;"><span class="material-icons" style="vertical-align:middle;margin-right:6px;color:#dc3545;">fiber_manual_record</span>Start Recording</button>
                <button id="cancel-notes" class="btn btn-secondary" style="height:40px; display:flex; align-items:center; padding: 0 12px;">Cancel</button>
              </div>
              <button id="close-banner" class="close-btn" title="Close">×</button>
            </div>
          </div>
        `;

        // Add event listeners for the new buttons
        const pageDropdownToggle = document.getElementById('banner-page-dropdown-toggle');
        const pageDropdownMenu = document.getElementById('banner-page-dropdown-menu');
        const pageDropdownText = document.getElementById('banner-page-dropdown-text');
        const pageDropdownOptions = document.getElementById('banner-page-dropdown-options');
        const pageSearchInput = document.getElementById('banner-page-search-input');
        const confirmBtn = document.getElementById('confirm-notes');
        const cancelBtn = document.getElementById('cancel-notes');
        const addNewBtn = document.getElementById('add-new-note-banner');

        let selectedPageId = null;
        let allPages = response.pages || [];

        // Toggle dropdown
        pageDropdownToggle.addEventListener('click', () => {
          const isOpen = pageDropdownMenu.style.display !== 'none';
          pageDropdownMenu.style.display = isOpen ? 'none' : 'flex';
          if (!isOpen) {
            pageSearchInput.focus();
          }
        });

        // Search functionality
        pageSearchInput.addEventListener('input', () => {
          const searchTerm = pageSearchInput.value.toLowerCase();
          const filteredPages = allPages.filter(page => {
            let title = 'Untitled';
            try {
              const properties = page.properties || {};
              const titleProp = Object.values(properties).find(p => p && p.type === 'title');
              if (titleProp && Array.isArray(titleProp.title) && titleProp.title.length > 0) {
                title = titleProp.title[0]?.text?.content || titleProp.title[0]?.plain_text || 'Untitled';
              }
            } catch {}
            return title.toLowerCase().includes(searchTerm);
          });
          renderPageOptions(filteredPages);
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
          if (!e.target.closest('.custom-dropdown')) {
            pageDropdownMenu.style.display = 'none';
          }
        });

        // Render page options
        function renderPageOptions(pages) {
          pageDropdownOptions.innerHTML = '';
          
          if (pages.length === 0) {
            const noResults = document.createElement('div');
            noResults.className = 'dropdown-option';
            noResults.textContent = 'No pages found';
            noResults.style.color = '#999';
            noResults.style.fontStyle = 'italic';
            pageDropdownOptions.appendChild(noResults);
            return;
          }
          
          pages.forEach(page => {
            let title = 'Untitled';
            try {
              const properties = page.properties || {};
              const titleProp = Object.values(properties).find(p => p && p.type === 'title');
              if (titleProp && Array.isArray(titleProp.title) && titleProp.title.length > 0) {
                title = titleProp.title[0]?.text?.content || titleProp.title[0]?.plain_text || 'Untitled';
              }
            } catch {}
            
            const option = document.createElement('div');
            option.className = 'dropdown-option';
            option.dataset.pageId = page.id;
            option.textContent = title;
            option.style.padding = '8px 12px';
            option.style.cursor = 'pointer';
            option.style.fontSize = '13px';
            option.style.borderBottom = '1px solid #f0f0f0';
            option.style.color = '#333';
            
            if (page.id === selectedPageId) {
              option.style.background = '#007bff';
              option.style.color = 'white';
            }
            
            option.addEventListener('click', () => selectPage(page.id, title));
            pageDropdownOptions.appendChild(option);
          });
        }

        // Select page
        function selectPage(pageId, pageTitle) {
          selectedPageId = pageId;
          pageDropdownText.textContent = pageTitle;
          pageDropdownMenu.style.display = 'none';
          pageSearchInput.value = '';
          confirmBtn.disabled = false;
        }

        // Initialize with all pages
        renderPageOptions(allPages);

        confirmBtn.addEventListener('click', () => {
          if (selectedPageId) {
            // Store the selected page ID for later use
            this.selectedPageId = selectedPageId;
            this.startNoteTaking();
            this.removeBanner();
          }
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

            // Add new page to the in-memory list and UI
            allPages = [{ ...page }, ...allPages];
            renderPageOptions(allPages);
            selectedPageId = page.id;
            pageDropdownText.textContent = extractedTitle;
            pageDropdownMenu.style.display = 'none';
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
        background: #28a745;
        color: white;
        padding: 10px 15px;
        border-radius: 4px;
        z-index: 10001;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
        display: flex;
        align-items: center;
        gap: 10px;
      ">
        <iframe id="recording-lottie" src="https://lottie.host/embed/4ef724f0-57c9-46c3-9528-93bad640c135/jxygEXoASl.lottie" allowtransparency="true" style="
          width: 28px;
          height: 28px;
          border: none;
          background: transparent;
          border-radius: 4px;
        "></iframe>
        <span>Recording Meeting Notes...</span>
        <button id="stop-recording-btn" style="
          background: #dc3545;
          color: white;
          border: none;
          padding: 5px 10px;
          border-radius: 3px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 500;
        ">Stop Recording</button>
      </div>
    `;
    document.body.appendChild(indicator);

    // Add event listener for stop recording button
    const stopBtn = document.getElementById('stop-recording-btn');
    if (stopBtn) {
      stopBtn.addEventListener('click', () => {
        this.stopNoteTaking();
      });
    }
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
