// Background script for audio processing and Notion integration
class MeetingNotesProcessor {
  constructor() {
    this.setupMessageListener();
    this.buffer = [];
    this.maxLogs = 500;
  }

  setupMessageListener() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      switch (request.action) {
        case 'processAudio':
          this.processAudioWithGemini(request.audioData, request.platform, request.selectedPageId);
          break;
        case 'createNotionPage':
          this.createNotionPage(request.title).then(sendResponse);
          return true;
        case 'log':
          this.addLog(request.level || 'info', request.msg || '', request.meta || {});
          sendResponse({ success: true });
          break;
        case 'getLogs':
          sendResponse({ success: true, logs: this.buffer });
          break;
        case 'clearLogs':
          this.buffer = [];
          sendResponse({ success: true });
          break;
        case 'getNotionPages':
          this.getNotionPages().then(sendResponse);
          return true; // Keep message channel open for async response
        case 'getNotionDatabases':
          this.getNotionDatabases().then(sendResponse);
          return true; // Keep message channel open for async response
        case 'appendToNotionPage':
          this.appendToNotionPage(request.pageId, request.notes).then(sendResponse);
          return true; // Keep message channel open for async response
        default:
          sendResponse({ success: false, error: 'Unknown action' });
      }
    });
  }

  async isDebugEnabled() {
    const { debugEnabled } = await chrome.storage.sync.get(['debugEnabled']);
    return !!debugEnabled;
  }

  async addLog(level, msg, meta) {
    const debug = await this.isDebugEnabled();
    if (!debug && level !== 'error') return;
    const entry = { t: Date.now(), level, msg, meta };
    this.buffer.push(entry);
    if (this.buffer.length > this.maxLogs) this.buffer.shift();
    // Also mirror to console for dev
    try { console[level] ? console[level](msg, meta) : console.log(msg, meta); } catch {}
  }

  async processAudioWithGemini(audioData, platform, selectedPageId = null) {
    try {
      await this.addLog('info', 'Processing audio with Gemini', { platform, size: audioData?.length });
      const config = await chrome.storage.sync.get(['geminiApiKey', 'notionToken', 'notionDatabaseId']);
      
      if (!config.geminiApiKey) {
        throw new Error('Gemini API key not configured');
      }

      // Convert base64 audio to blob for Gemini API
      const audioBlob = this.base64ToBlob(audioData, 'audio/webm');
      
      // Use Gemini API to process audio
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${config.geminiApiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: "Please transcribe this meeting audio and provide a structured summary with key points, action items, and decisions made. Format the response as JSON with the following structure: { \"transcript\": \"full transcript\", \"summary\": \"bullet point summary\", \"actionItems\": [\"item1\", \"item2\"], \"decisions\": [\"decision1\", \"decision2\"], \"attendees\": [\"name1\", \"name2\"] }"
            }, {
              inline_data: {
                mime_type: "audio/webm",
                data: audioData
              }
            }]
          }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json"
          }
        })
      });

      if (!response.ok) {
        await this.addLog('error', 'Gemini API error', { status: response.status });
        throw new Error(`Gemini API error: ${response.status}`);
      }

      const result = await response.json();
      await this.addLog('info', 'Gemini response received');
      
      // Log the raw response from Gemini
      const rawResponse = result.candidates[0].content.parts[0].text;
      await this.addLog('info', 'Raw Gemini response', { response: rawResponse });
      
      const notes = JSON.parse(rawResponse);
      
      // Log the parsed structured notes
      await this.addLog('info', 'Parsed structured notes', { 
        transcript: notes.transcript?.substring(0, 200) + '...',
        summary: notes.summary,
        actionItems: notes.actionItems,
        decisions: notes.decisions,
        attendees: notes.attendees
      });

      // Determine which page to use: selected page, default page, or show selection
      let targetPageId = selectedPageId;
      
      if (!targetPageId) {
        const { defaultNotionPageId } = await chrome.storage.sync.get(['defaultNotionPageId']);
        targetPageId = defaultNotionPageId;
      }

      if (targetPageId) {
        await this.addLog('info', 'Appending to selected/default Notion page', { page: targetPageId });
        const appendRes = await this.appendToNotionPage(targetPageId, notes);
        if (!appendRes.success) {
          await this.addLog('error', 'Append failed; falling back to manual selection', { error: appendRes.error });
          // Fallback to manual selection if append fails
          this.showNotionPageSelection(notes, platform);
        } else {
          await this.addLog('info', 'Notes appended to page');
          // Notify success in active tab
          this.notifyInActiveTab('Notes appended to your Notion page.');
        }
      } else {
        await this.addLog('info', 'No page selected; showing selection modal');
        // Show Notion page selection modal
        this.showNotionPageSelection(notes, platform);
      }
      
    } catch (error) {
      console.error('Error processing audio with Gemini:', error);
      await this.addLog('error', 'Processing audio failed', { error: String(error) });
      this.showError('Failed to process meeting notes. Please try again.');
    }
  }

  base64ToBlob(base64, mimeType) {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
  }

  async getNotionPages() {
    try {
      await this.addLog('info', 'Fetching Notion pages');
      const config = await chrome.storage.sync.get(['notionToken', 'notionDatabaseId']);
      
      if (!config.notionToken || !config.notionDatabaseId) {
        throw new Error('Notion configuration missing');
      }

      // Load pages with pagination
      let allPages = [];
      let hasMore = true;
      let startCursor = undefined;

      while (hasMore) {
        const response = await fetch(`https://api.notion.com/v1/databases/${config.notionDatabaseId}/query`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${config.notionToken}`,
            'Notion-Version': '2022-06-28',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            page_size: 50,
            start_cursor: startCursor
          })
        });

        if (!response.ok) {
          await this.addLog('error', 'Notion query failed', { status: response.status });
          throw new Error(`Notion API error: ${response.status}`);
        }

        const data = await response.json();
        allPages = allPages.concat(data.results);
        hasMore = data.has_more;
        startCursor = data.next_cursor;
      }

      await this.addLog('info', 'Fetched Notion pages', { count: allPages.length });
      return { success: true, pages: allPages };
      
    } catch (error) {
      console.error('Error fetching Notion pages:', error);
      await this.addLog('error', 'Fetching Notion pages failed', { error: String(error) });
      return { success: false, error: error.message };
    }
  }

  async getNotionDatabases() {
    try {
      await this.addLog('info', 'Fetching Notion databases');
      const config = await chrome.storage.sync.get(['notionToken']);
      
      if (!config.notionToken) {
        throw new Error('Notion token not configured');
      }

      // Load databases with pagination
      let allDatabases = [];
      let hasMore = true;
      let startCursor = undefined;

      while (hasMore) {
        const response = await fetch('https://api.notion.com/v1/search', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${config.notionToken}`,
            'Notion-Version': '2022-06-28',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            filter: {
              property: 'object',
              value: 'database'
            },
            page_size: 50,
            start_cursor: startCursor
          })
        });

        if (!response.ok) {
          await this.addLog('error', 'Notion search failed', { status: response.status });
          throw new Error(`Notion API error: ${response.status}`);
        }

        const data = await response.json();
        allDatabases = allDatabases.concat(data.results);
        hasMore = data.has_more;
        startCursor = data.next_cursor;
      }

      await this.addLog('info', 'Fetched Notion databases', { count: allDatabases.length });
      return { success: true, databases: allDatabases };

    } catch (error) {
      console.error('Error fetching Notion databases:', error);
      await this.addLog('error', 'Fetching Notion databases failed', { error: String(error) });
      return { success: false, error: error.message };
    }
  }

  async appendToNotionPage(pageId, notes) {
    try {
      await this.addLog('info', 'Appending to Notion page', { pageId });
      const config = await chrome.storage.sync.get(['notionToken']);
      
      if (!config.notionToken) {
        throw new Error('Notion token not configured');
      }

      const meetingDate = new Date().toISOString().split('T')[0];
      const meetingTime = new Date().toLocaleTimeString();
      
      // Create the content to append
      const content = [
        {
          object: "block",
          type: "heading_2",
          heading_2: {
            rich_text: [{
              type: "text",
              text: { content: `Meeting Notes - ${meetingDate} ${meetingTime}` }
            }]
          }
        },
        {
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: [{
              type: "text",
              text: { content: notes.summary || "No summary available" }
            }]
          }
        }
      ];

      // Add action items as checkbox to-dos if available
      if (notes.actionItems && notes.actionItems.length > 0) {
        content.push({
          object: "block",
          type: "heading_3",
          heading_3: {
            rich_text: [{
              type: "text",
              text: { content: "Action Items" }
            }]
          }
        });

        notes.actionItems.forEach(item => {
          // Support either string or object with task/owner/due
          let line = '';
          if (typeof item === 'string') {
            line = item;
          } else if (item && typeof item === 'object') {
            const task = item.task || '';
            const owner = item.owner ? ` • Owner: ${item.owner}` : '';
            const due = item.due ? ` • Due: ${item.due}` : '';
            line = `${task}${owner}${due}`.trim();
          }
          if (!line) return;
          content.push({
            object: "block",
            type: "to_do",
            to_do: {
              rich_text: [{ type: "text", text: { content: line } }],
              checked: false
            }
          });
        });
      }

      // Add decisions if available
      if (notes.decisions && notes.decisions.length > 0) {
        content.push({
          object: "block",
          type: "heading_3",
          heading_3: {
            rich_text: [{
              type: "text",
              text: { content: "Decisions Made" }
            }]
          }
        });

        notes.decisions.forEach(decision => {
          content.push({
            object: "block",
            type: "bulleted_list_item",
            bulleted_list_item: {
              rich_text: [{
                type: "text",
                text: { content: decision }
              }]
            }
          });
        });
      }

      // Add full transcript
      if (notes.transcript) {
        content.push({
          object: "block",
          type: "heading_3",
          heading_3: {
            rich_text: [{
              type: "text",
              text: { content: "Full Transcript" }
            }]
          }
        });

        content.push({
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: [{
              type: "text",
              text: { content: notes.transcript }
            }]
          }
        });
      }

      // Append content to the page
      const response = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${config.notionToken}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          children: content
        })
      });

      if (!response.ok) {
        await this.addLog('error', 'Notion append failed', { status: response.status });
        throw new Error(`Notion API error: ${response.status}`);
      }

      await this.addLog('info', 'Append to Notion page succeeded');
      return { success: true };
      
    } catch (error) {
      console.error('Error appending to Notion page:', error);
      await this.addLog('error', 'Append to Notion page failed', { error: String(error) });
      return { success: false, error: error.message };
    }
  }

  async createNotionPage(title) {
    try {
      await this.addLog('info', 'Creating Notion page', { title });
      const { notionToken, notionDatabaseId } = await chrome.storage.sync.get(['notionToken', 'notionDatabaseId']);
      if (!notionToken || !notionDatabaseId) throw new Error('Notion not configured');

      // Get database to find the title property key
      const dbRes = await fetch(`https://api.notion.com/v1/databases/${notionDatabaseId}`, {
        headers: {
          'Authorization': `Bearer ${notionToken}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json'
        }
      });
      if (!dbRes.ok) throw new Error(`Failed to load DB: ${dbRes.status}`);
      const db = await dbRes.json();
      const props = db.properties || {};
      const titleEntry = Object.entries(props).find(([, v]) => v && v.type === 'title');
      if (!titleEntry) throw new Error('No title property found in database');
      const [titlePropName] = titleEntry;

      const pageRes = await fetch('https://api.notion.com/v1/pages', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${notionToken}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          parent: { database_id: notionDatabaseId },
          properties: {
            [titlePropName]: {
              title: [{ type: 'text', text: { content: title } }]
            }
          }
        })
      });
      if (!pageRes.ok) throw new Error(`Notion create page failed: ${pageRes.status}`);
      const page = await pageRes.json();
      await this.addLog('info', 'Notion page created', { pageId: page.id });
      return { success: true, page };
    } catch (error) {
      await this.addLog('error', 'Create Notion page failed', { error: String(error) });
      return { success: false, error: String(error) };
    }
  }

  async showNotionPageSelection(notes, platform) {
    try {
      // Get available Notion pages
      const pagesResult = await this.getNotionPages();
      
      if (!pagesResult.success) {
        throw new Error(pagesResult.error);
      }

      // Create and show the page selection modal
      const modalData = this.createPageSelectionModal(notes, pagesResult.pages);
      this.injectModal(modalData, notes);
      
    } catch (error) {
      console.error('Error showing page selection:', error);
      this.showError('Failed to load Notion pages. Please try again.');
    }
  }

  createPageSelectionModal(notes, pages) {
    const modalId = 'notion-page-selection-modal';
    const modalHTML = `
      <div id="${modalId}">
        <div class="notion-selection-overlay">
          <div class="notion-selection-modal">
            <h3>Select Notion Page</h3>
            <p>Choose which page to append the meeting notes to:</p>
            
            <div class="notes-preview">
              <h4>Notes Preview:</h4>
              <div class="preview-content">
                <strong>Summary:</strong>
                <p>${notes.summary || 'No summary available'}</p>
                
                ${notes.actionItems && notes.actionItems.length > 0 ? `
                  <strong>Action Items:</strong>
                  <ul>
                    ${notes.actionItems.map(item => `<li>${item}</li>`).join('')}
                  </ul>
                ` : ''}
                
                ${notes.decisions && notes.decisions.length > 0 ? `
                  <strong>Decisions:</strong>
                  <ul>
                    ${notes.decisions.map(decision => `<li>${decision}</li>`).join('')}
                  </ul>
                ` : ''}
              </div>
            </div>
            
            <div class="page-selection">
              <div class="custom-dropdown">
                <div id="page-dropdown-toggle" class="dropdown-toggle">
                  <span id="page-dropdown-text">Select a page...</span>
                  <span class=\"material-icons\">expand_more</span>
                </div>
                <div id="page-dropdown-menu" class="dropdown-menu">
                  <div class="dropdown-search">
                    <input type="text" id="page-search-input" placeholder="Search pages..." />
                  </div>
                  <div id="page-dropdown-options" class="dropdown-options">
                    ${pages.map(page => {
                      // Find the property whose type is 'title' regardless of its name
                      let title = 'Untitled';
                      try {
                        const properties = page.properties || {};
                        const titleProp = Object.values(properties).find(p => p && p.type === 'title');
                        if (titleProp && Array.isArray(titleProp.title) && titleProp.title.length > 0) {
                          title = titleProp.title[0]?.text?.content || titleProp.title[0]?.plain_text || 'Untitled';
                        }
                      } catch {}
                      return `<div class="dropdown-option" data-page-id="${page.id}">${title}</div>`;
                    }).join('')}
                  </div>
                  <div class="dropdown-footer">
                    <button id="create-new-note-modal" class="btn btn-secondary" style="width: 100%; margin: 0; background: #17a2b8; color: white; border: none;"><span class=\"material-icons\" style=\"vertical-align:middle;margin-right:6px;\">note_add</span>Create New Note</button>
                  </div>
                </div>
              </div>
            </div>
            
            <div class="modal-buttons">
              <button id="append-notes" class="btn btn-primary" disabled>Append Notes</button>
              <button id="cancel-notes" class="btn btn-outline">Cancel</button>
            </div>
          </div>
        </div>
      </div>
    `;

    const styleHTML = `
      <style id="notion-selection-styles">
        .notion-selection-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.5);
          z-index: 10000;
          display: flex;
          justify-content: center;
          align-items: center;
        }
        .notion-selection-modal {
          background: white;
          padding: 30px;
          border-radius: 8px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
          max-width: 600px;
          max-height: 80vh;
          overflow-y: auto;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        .notion-selection-modal h3 {
          margin: 0 0 15px 0;
          color: #333;
        }
        .notion-selection-modal p {
          margin: 0 0 20px 0;
          color: #666;
        }
        .notes-preview {
          background: #f8f9fa;
          padding: 15px;
          border-radius: 4px;
          margin-bottom: 20px;
          max-height: 200px;
          overflow-y: auto;
        }
        .notes-preview h4 {
          margin: 0 0 10px 0;
          color: #333;
          font-size: 14px;
        }
        .preview-content {
          font-size: 12px;
          color: #666;
        }
        .preview-content ul {
          margin: 5px 0;
          padding-left: 20px;
        }
        .page-selection {
          margin-bottom: 20px;
        }
        .custom-dropdown {
          position: relative;
          width: 100%;
        }
        .dropdown-toggle {
          width: 100%;
          padding: 10px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 14px;
          background: white;
          cursor: pointer;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .dropdown-toggle:hover {
          border-color: #007bff;
        }
        .dropdown-menu {
          display: none;
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          background: white;
          border: 1px solid #ddd;
          border-radius: 4px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          z-index: 1000;
          max-height: 400px;
          flex-direction: column;
        }
        .dropdown-search {
          padding: 8px;
          border-bottom: 1px solid #eee;
          flex-shrink: 0;
        }
        .dropdown-search input {
          width: 100%;
          padding: 4px;
          border: 1px solid #ddd;
          border-radius: 2px;
          font-size: 12px;
        }
        .dropdown-options {
          flex: 1;
          overflow-y: auto;
          max-height: 350px;
        }
        .dropdown-option {
          padding: 8px 12px;
          cursor: pointer;
          font-size: 13px;
          border-bottom: 1px solid #f0f0f0;
        }
        .dropdown-option:hover {
          background: #f8f9fa;
        }
        .dropdown-option.selected {
          background: #007bff;
          color: white;
        }
        .dropdown-footer {
          border-top: 1px solid #eee;
          padding: 8px;
          flex-shrink: 0;
          background: white;
        }
        .modal-buttons {
          display: flex;
          gap: 10px;
          justify-content: flex-end;
        }
        .btn {
          padding: 10px 20px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
        }
        .btn:disabled {
          background: #ccc;
          cursor: not-allowed;
        }
        .btn-primary {
          background: #007bff;
          color: white;
        }
        .btn-primary:hover:not(:disabled) {
          background: #0056b3;
        }
        .btn-secondary {
          background: #6c757d;
          color: white;
        }
        .btn-secondary:hover {
          background: #545b62;
        }
        .btn-outline {
          background: transparent;
          color: #6c757d;
          border: 1px solid #6c757d;
        }
        .btn-outline:hover {
          background: #6c757d;
          color: white;
        }
      </style>
    `;

    return { modalHTML, styleHTML };
  }

  injectModal(modalData, notes) {
    console.log('Injecting modal with data:', { modalData, notes });
    // Inject into the active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          func: (modalHTML, styleHTML, notesData) => {
            console.log('Executing script in tab, modalHTML length:', modalHTML.length);
            // Remove existing modal and styles if present
            const existingModal = document.getElementById('notion-page-selection-modal');
            const existingStyles = document.getElementById('notion-selection-styles');
            if (existingModal) existingModal.remove();
            if (existingStyles) existingStyles.remove();
            
            // Store notes data globally for access in event handlers
            window.meetingNotes = notesData;
            
            // Add styles first
            document.head.insertAdjacentHTML('beforeend', styleHTML);
            
            // Add modal
            console.log('About to insert modal HTML:', modalHTML.substring(0, 1000));
            document.body.insertAdjacentHTML('beforeend', modalHTML);
            console.log('Modal inserted, checking for elements...');
            
            // Add event listeners
            const pageDropdownToggle = document.getElementById('page-dropdown-toggle');
            const pageDropdownMenu = document.getElementById('page-dropdown-menu');
            const pageDropdownText = document.getElementById('page-dropdown-text');
            const pageDropdownOptions = document.getElementById('page-dropdown-options');
            const pageSearchInput = document.getElementById('page-search-input');
            const createNewNoteModal = document.getElementById('create-new-note-modal');
            const appendBtn = document.getElementById('append-notes');
            const cancelBtn = document.getElementById('cancel-notes');
            
            // Debug: Check if elements exist
            console.log('Modal elements found:', {
              pageDropdownToggle: !!pageDropdownToggle,
              pageDropdownMenu: !!pageDropdownMenu,
              pageDropdownText: !!pageDropdownText,
              pageDropdownOptions: !!pageDropdownOptions,
              pageSearchInput: !!pageSearchInput,
              createNewNoteModal: !!createNewNoteModal,
              appendBtn: !!appendBtn,
              cancelBtn: !!cancelBtn
            });
            
            // Check if old select element exists (fallback)
            const oldSelect = document.getElementById('notion-page-select');
            if (oldSelect) {
              console.log('Old select element found, removing it');
              oldSelect.remove();
            }
            
            let selectedPageId = null;
            let allPages = window.meetingNotes.pages || [];
            
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
                
                if (page.id === selectedPageId) {
                  option.classList.add('selected');
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
              appendBtn.disabled = false;
            }
            
            // Create new note from dropdown
            createNewNoteModal.addEventListener('click', () => {
              pageDropdownMenu.style.display = 'none';
              // For now, just show a message about creating new pages
              alert('Creating new pages is not yet implemented. Please select an existing page.');
            });
            
            // Initialize with all pages
            renderPageOptions(allPages);
            
            // Debug: Log the modal HTML to verify it's correct
            console.log('Modal HTML generated:', modalHTML.substring(0, 500) + '...');
            
            appendBtn.addEventListener('click', () => {
              if (selectedPageId) {
                // Send message to background script to append notes
                chrome.runtime.sendMessage({
                  action: 'appendToNotionPage',
                  pageId: selectedPageId,
                  notes: window.meetingNotes
                }, (response) => {
                  if (response.success) {
                    alert('Notes successfully appended to Notion page!');
                    const modal = document.getElementById('notion-page-selection-modal');
                    if (modal) modal.remove();
                  } else {
                    alert('Failed to append notes: ' + response.error);
                  }
                });
              }
            });
            
            
            cancelBtn.addEventListener('click', () => {
              const modal = document.getElementById('notion-page-selection-modal');
              if (modal) modal.remove();
            });
          },
          args: [modalData.modalHTML, modalData.styleHTML, notes]
        });
      }
    });
  }

  showError(message) {
    // Show error in the active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          func: (message) => {
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
          },
          args: [message]
        });
      }
    });
  }

  notifyInActiveTab(message) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          func: (message) => {
            const div = document.createElement('div');
            div.style.cssText = `
              position: fixed;
              top: 20px;
              right: 20px;
              background: #28a745;
              color: white;
              padding: 12px 16px;
              border-radius: 4px;
              z-index: 10001;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              font-size: 14px;
              box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
            `;
            div.textContent = message;
            document.body.appendChild(div);
            setTimeout(() => div.remove(), 4000);
          },
          args: [message]
        });
      }
    });
  }
}

// Initialize the processor
const processor = new MeetingNotesProcessor();
