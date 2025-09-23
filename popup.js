// Popup script for the Chrome extension
document.addEventListener('DOMContentLoaded', function() {
  const geminiApiKeyInput = document.getElementById('geminiApiKey');
  const notionTokenInput = document.getElementById('notionToken');
  const notionDatabaseSelect = document.getElementById('notionDatabaseSelect');
  const pageDropdownToggle = document.getElementById('pageDropdownToggle');
  const pageDropdownMenu = document.getElementById('pageDropdownMenu');
  const pageDropdownText = document.getElementById('pageDropdownText');
  const pageDropdownOptions = document.getElementById('pageDropdownOptions');
  const pageSearchInput = document.getElementById('pageSearchInput');
  const createNewNoteInDropdown = document.getElementById('createNewNoteInDropdown');
  const refreshDatabasesBtn = document.getElementById('refreshDatabases');
  const refreshPagesBtn = document.getElementById('refreshPages');
  const saveConfigBtn = document.getElementById('saveConfig');
  const testConnectionBtn = document.getElementById('testConnection');
  const connectionStatus = document.getElementById('connectionStatus');
  const databaseStatus = document.getElementById('databaseStatus');
  const databasePanel = document.getElementById('databasePanel');
  const mainView = document.getElementById('mainView');
  const settingsView = document.getElementById('settingsView');
  const backBtn = document.getElementById('backBtn');
  const startStopRecordingBtn = document.getElementById('startStopRecording');
  const meetingStatus = document.getElementById('meetingStatus');
  const statusDiv = document.getElementById('status');
  
  // Store pages data for search functionality
  let allPages = [];
  let selectedPageId = null;
  const loadNotionPagesBtn = document.getElementById('loadNotionPages');
  const saveDefaultPageBtn = document.getElementById('saveDefaultPage');
  const clearDefaultPageBtn = document.getElementById('clearDefaultPage');
  const defaultPageStatus = document.getElementById('defaultPageStatus');
  const debugToggle = document.getElementById('debugToggle');
  const logsDiv = document.getElementById('logs');
  const refreshLogsBtn = document.getElementById('refreshLogs');
  const clearLogsBtn = document.getElementById('clearLogs');
  const settingsBtn = document.getElementById('settingsBtn');
  const settingsPanel = document.getElementById('settingsPanel');
  const newNoteModal = document.getElementById('newNoteModal');
  const newNoteTitleInput = document.getElementById('newNoteTitle');
  const createNewNoteBtn = document.getElementById('createNewNote');
  const cancelNewNoteBtn = document.getElementById('cancelNewNote');

  // Load saved configuration
  loadConfig();

  // Event listeners
  testConnectionBtn.addEventListener('click', testConnection);
  saveConfigBtn.addEventListener('click', saveConfig);
  refreshDatabasesBtn.addEventListener('click', loadNotionDatabases);
  refreshPagesBtn.addEventListener('click', loadNotionPages);
  notionDatabaseSelect.addEventListener('change', onDatabaseChange);
  pageDropdownToggle.addEventListener('click', togglePageDropdown);
  pageSearchInput.addEventListener('input', filterPages);
  createNewNoteInDropdown.addEventListener('click', createNewNoteFromDropdown);
  startStopRecordingBtn.addEventListener('click', onStartStopClick);
  debugToggle.addEventListener('change', () => {
    const on = debugToggle.checked;
    const controls = document.getElementById('debugControls');
    if (controls) controls.style.display = on ? 'block' : 'none';
    saveDebugToggle();
  });
  refreshLogsBtn.addEventListener('click', loadLogs);
  clearLogsBtn.addEventListener('click', clearLogs);
  settingsBtn.addEventListener('click', showSettings);
  backBtn.addEventListener('click', showMain);
  createNewNoteBtn.addEventListener('click', createNewNote);
  cancelNewNoteBtn.addEventListener('click', closeNewNoteModal);

  // Check for active meeting
  checkMeetingStatus();

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.custom-dropdown')) {
      pageDropdownMenu.style.display = 'none';
    }
  });

  async function loadConfig() {
    try {
      const config = await chrome.storage.sync.get([
        'geminiApiKey', 'notionToken', 'notionDatabaseId', 'notionDatabaseTitle', 
        'defaultNotionPageId', 'defaultNotionPageTitle', 'debugEnabled',
        'storedDatabases'
      ]);
      
      // Also check local storage for pages (fallback)
      const localConfig = await chrome.storage.local.get(['storedPages']);
      
      geminiApiKeyInput.value = config.geminiApiKey || '';
      notionTokenInput.value = config.notionToken || '';
      
      // Show database panel if API keys are configured
      if (config.geminiApiKey && config.notionToken) {
        databasePanel.style.display = 'block';
        
        // Load stored databases
        if (config.storedDatabases && config.storedDatabases.length > 0) {
          populateDatabaseDropdown(config.storedDatabases);
        }
        
        // Load stored pages if database is selected
        if (config.notionDatabaseId && config.notionDatabaseTitle) {
          // If we already populated the list, just select the saved DB.
          // If the saved DB isn't in the list for some reason, ensure it appears.
          const hasOptions = notionDatabaseSelect.options && notionDatabaseSelect.options.length > 0;
          const hasStoredList = !!(config.storedDatabases && config.storedDatabases.length > 0);
          if (!hasOptions || !hasStoredList) {
            populateDatabaseDropdown([{ id: config.notionDatabaseId, title: config.notionDatabaseTitle }]);
          }
          notionDatabaseSelect.value = config.notionDatabaseId;
          pageDropdownToggle.disabled = false;
          refreshPagesBtn.disabled = false;
          
          // Check both sync and local storage for pages
          const storedPages = config.storedPages || localConfig.storedPages;
          if (storedPages && storedPages.length > 0) {
            populatePagesDropdown(storedPages);
          } else {
            await loadNotionPages();
          }
          
          // Set selected page if available
      if (config.defaultNotionPageId && config.defaultNotionPageTitle) {
            selectedPageId = config.defaultNotionPageId;
            pageDropdownText.textContent = config.defaultNotionPageTitle;
          }
        }
      }
      
      debugToggle.checked = !!config.debugEnabled;
      await loadLogs();
    } catch (error) {
      showStatus('Error loading configuration', 'error');
    }
  }

  async function saveDebugToggle() {
    await chrome.storage.sync.set({ debugEnabled: debugToggle.checked });
    showStatus(`Debug ${debugToggle.checked ? 'enabled' : 'disabled'}`, 'success');
  }

  async function saveConfig() {
    const config = {
      geminiApiKey: geminiApiKeyInput.value.trim(),
      notionToken: notionTokenInput.value.trim()
    };

    if (!config.geminiApiKey || !config.notionToken) {
      showInline(connectionStatus, 'Please fill in both API keys', 'error');
      return;
    }

    try {
      await chrome.storage.sync.set(config);
      showInline(connectionStatus, 'API configuration saved successfully', 'success');
      
      // Disable save button after successful save
      saveConfigBtn.disabled = true;
      saveConfigBtn.textContent = 'Configuration Saved';
      
      // Show database panel in main view after successful save
      databasePanel.style.display = 'block';
      
      updateButtonStates();
    } catch (error) {
      showInline(connectionStatus, 'Error saving configuration', 'error');
    }
  }

  async function onDatabaseChange() {
    const databaseId = notionDatabaseSelect.value;
    const databaseTitle = notionDatabaseSelect.options[notionDatabaseSelect.selectedIndex]?.text || '';
    
    if (databaseId) {
      // Save database selection
      await chrome.storage.sync.set({ 
        notionDatabaseId: databaseId, 
        notionDatabaseTitle: databaseTitle 
      });
      
      // Clear stored pages and reset page selection
      await chrome.storage.sync.remove(['storedPages', 'defaultNotionPageId', 'defaultNotionPageTitle']);
      await chrome.storage.local.remove(['storedPages']);
      
      // Enable pages dropdown and load pages
      pageDropdownToggle.disabled = false;
      refreshPagesBtn.disabled = false;
      pageDropdownText.textContent = '— Loading pages... —';
      selectedPageId = null;
      
      // Load pages from selected database
      await loadNotionPages();
      
      showInline(databaseStatus, `Database selected: ${databaseTitle}`, 'success');
    } else {
      // Disable pages dropdown
      pageDropdownToggle.disabled = true;
      refreshPagesBtn.disabled = true;
      pageDropdownText.textContent = '— Select a database first —';
      selectedPageId = null;
      allPages = [];
      pageDropdownOptions.innerHTML = '';
    }
    
    updateButtonStates();
  }

  async function onPageChange() {
    if (selectedPageId) {
      const selectedPage = allPages.find(page => page.id === selectedPageId);
      const pageTitle = selectedPage ? selectedPage.title : '';
      
      // Save page selection
      await chrome.storage.sync.set({ 
        defaultNotionPageId: selectedPageId, 
        defaultNotionPageTitle: pageTitle 
      });
      
      showInline(databaseStatus, `Page selected: ${pageTitle}`, 'success');
    }
    
    updateButtonStates();
  }

  function populateDatabaseDropdown(databases) {
    notionDatabaseSelect.innerHTML = '<option value="">— Select a database —</option>';
    
    databases.forEach(database => {
      const option = document.createElement('option');
      option.value = database.id;
      option.textContent = database.title;
      notionDatabaseSelect.appendChild(option);
    });
  }

  function populatePagesDropdown(pages) {
    allPages = pages;
    renderPageOptions(pages);
  }

  function renderPageOptions(pages) {
    pageDropdownOptions.innerHTML = '';
    
    if (pages.length === 0) {
      const noResults = document.createElement('div');
      noResults.className = 'dropdown-option';
      noResults.textContent = 'No notes found';
      noResults.style.color = '#999';
      noResults.style.fontStyle = 'italic';
      pageDropdownOptions.appendChild(noResults);
      return;
    }
    
    pages.forEach(page => {
      const option = document.createElement('div');
      option.className = 'dropdown-option';
      option.dataset.pageId = page.id;
      option.textContent = page.title;
      
      if (page.id === selectedPageId) {
        option.classList.add('selected');
      }
      
      option.addEventListener('click', () => selectPage(page.id, page.title));
      pageDropdownOptions.appendChild(option);
    });
  }

  function togglePageDropdown() {
    if (pageDropdownToggle.disabled) return;
    
    const isOpen = pageDropdownMenu.style.display !== 'none';
    pageDropdownMenu.style.display = isOpen ? 'none' : 'flex';
    
    if (!isOpen) {
      pageSearchInput.focus();
    }
  }

  function filterPages() {
    const searchTerm = pageSearchInput.value.toLowerCase();
    const filteredPages = allPages.filter(page => 
      page.title.toLowerCase().includes(searchTerm)
    );
    renderPageOptions(filteredPages);
  }

  function selectPage(pageId, pageTitle) {
    selectedPageId = pageId;
    pageDropdownText.textContent = pageTitle;
    pageDropdownText.style.color = '#333333';
    pageDropdownMenu.style.display = 'none';
    pageSearchInput.value = '';
    
    // Trigger page change event
    onPageChange();
  }

  function createNewNoteFromDropdown() {
    pageDropdownMenu.style.display = 'none';
    // Open the existing new note modal
    openNewNoteModal();
  }

  async function loadNotionDatabases() {
    try {
      const { notionToken } = await chrome.storage.sync.get(['notionToken']);
      if (!notionToken) {
        showInline(databaseStatus, 'Configure Notion token first', 'error');
        return;
      }

      showInline(databaseStatus, 'Loading databases...', 'info');
      
      const resp = await chrome.runtime.sendMessage({ action: 'getNotionDatabases' });
      if (!resp || !resp.success) throw new Error(resp?.error || 'Failed to fetch databases');
      
      // Extract only essential data to reduce storage size
      const essentialDatabases = resp.databases.map(database => {
        const title = database.title?.[0]?.text?.content || database.title?.[0]?.plain_text || 'Untitled Database';
        return {
          id: database.id,
          title: title
        };
      });
      
      // Store databases in Chrome storage
      await chrome.storage.sync.set({ 
        storedDatabases: essentialDatabases,
        lastDatabasesRefreshedAt: Date.now()
      });
      
      // Populate dropdown
      populateDatabaseDropdown(essentialDatabases);
      
      showInline(databaseStatus, `Databases loaded successfully (${essentialDatabases.length} databases)`, 'success');
    } catch (e) {
      showInline(databaseStatus, `Error loading databases: ${e.message}`, 'error');
    }
  }

  async function saveDatabase() {
    const databaseId = notionDatabaseSelect.value.trim();
    const databaseTitle = notionDatabaseSelect.options[notionDatabaseSelect.selectedIndex]?.text || '';
    
    if (!databaseId) {
      showInline(databaseStatus, 'Please select a database first', 'error');
      return;
    }

    try {
      await chrome.storage.sync.set({ 
        notionDatabaseId: databaseId, 
        notionDatabaseTitle: databaseTitle 
      });
      
      showInline(databaseStatus, `Database saved: ${databaseTitle}`, 'success');
      
      // Disable save button after successful save
      saveDatabaseBtn.disabled = true;
      saveDatabaseBtn.textContent = 'Database Saved';
      
      updateButtonStates();
    } catch (error) {
      showInline(databaseStatus, 'Error saving database', 'error');
    }
  }

  async function loadLogs() {
    try {
      const resp = await chrome.runtime.sendMessage({ action: 'getLogs' });
      if (!resp || !resp.success) throw new Error(resp?.error || 'Failed to fetch logs');
      const lines = resp.logs.map(l => `${new Date(l.t).toLocaleTimeString()} [${l.level}] ${l.msg}`);
      logsDiv.textContent = lines.join('\n');
      logsDiv.scrollTop = logsDiv.scrollHeight;
    } catch (e) {
      logsDiv.textContent = 'Error loading logs: ' + e.message;
    }
  }

  async function clearLogs() {
    await chrome.runtime.sendMessage({ action: 'clearLogs' });
    await loadLogs();
  }

  function showSettings() {
    mainView.style.display = 'none';
    settingsView.style.display = 'block';
  }

  function showMain() {
    settingsView.style.display = 'none';
    mainView.style.display = 'block';
  }

  function openNewNoteModal() {
    newNoteTitleInput.value = '';
    newNoteModal.style.display = 'flex';
    newNoteTitleInput.focus();
  }

  function closeNewNoteModal() {
    newNoteModal.style.display = 'none';
  }

  async function createNewNote() {
    try {
      const title = newNoteTitleInput.value.trim();
      if (!title) {
        showInline(defaultPageStatus, 'Please enter a title', 'error');
        return;
      }
      const resp = await chrome.runtime.sendMessage({ action: 'createNotionPage', title });
      if (!resp || !resp.success) throw new Error(resp?.error || 'Failed to create page');

      // Add to the dropdown and select it
      const page = resp.page;
      const properties = page.properties || {};
      const titleProp = Object.values(properties).find(p => p && p.type === 'title');
      let extractedTitle = title;
      try {
        if (titleProp && Array.isArray(titleProp.title) && titleProp.title.length > 0) {
          extractedTitle = titleProp.title[0]?.text?.content || titleProp.title[0]?.plain_text || title;
        }
      } catch {}

      const opt = document.createElement('option');
      opt.value = page.id;
      opt.textContent = extractedTitle;
      notionPageSelect.appendChild(opt);
      notionPageSelect.value = page.id;
      await chrome.storage.sync.set({ defaultNotionPageId: page.id, defaultNotionPageTitle: extractedTitle });
      showInline(defaultPageStatus, 'New note created and selected', 'success');
      closeNewNoteModal();
    } catch (e) {
      showInline(defaultPageStatus, `Error: ${e.message}`, 'error');
    }
  }

  async function testConnection() {
    const geminiApiKey = geminiApiKeyInput.value.trim();
    const notionToken = notionTokenInput.value.trim();
    
    if (!geminiApiKey || !notionToken) {
      showInline(connectionStatus, 'Please enter both API keys first', 'error');
      return;
    }

    try {
      showInline(connectionStatus, 'Testing connections...', 'info');
      
      // Test Gemini API
      const geminiResponse = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=' + geminiApiKey, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: "Test connection"
            }]
          }]
        })
      });

      if (!geminiResponse.ok) {
        throw new Error('Gemini API test failed');
      }

      // Test Notion API (just test authentication, not specific database)
      const notionResponse = await fetch('https://api.notion.com/v1/users/me', {
        headers: {
          'Authorization': `Bearer ${notionToken}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json'
        }
      });

      if (!notionResponse.ok) {
        throw new Error('Notion API test failed');
      }

      showInline(connectionStatus, 'Connection test successful! You can now save your configuration.', 'success');
      
      // Enable save button on successful test
      saveConfigBtn.disabled = false;
      
    } catch (error) {
      showInline(connectionStatus, `Connection test failed: ${error.message}`, 'error');
      saveConfigBtn.disabled = true;
    }
  }

  async function loadNotionPages() {
    try {
      const { notionToken, notionDatabaseId } = await chrome.storage.sync.get(['notionToken', 'notionDatabaseId']);
      if (!notionToken || !notionDatabaseId) {
        showInline(databaseStatus, 'Configure Notion token and database first', 'error');
        return;
      }

      showInline(databaseStatus, 'Loading pages...', 'info');

      // Load pages with pagination
      let allPages = [];
      let hasMore = true;
      let startCursor = undefined;

      while (hasMore) {
      const res = await fetch(`https://api.notion.com/v1/databases/${notionDatabaseId}/query`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${notionToken}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json'
        },
          body: JSON.stringify({ 
            page_size: 50,
            start_cursor: startCursor
          })
      });

      if (!res.ok) throw new Error('Failed to fetch pages');
      const data = await res.json();
        
        allPages = allPages.concat(data.results);
        hasMore = data.has_more;
        startCursor = data.next_cursor;
      }
      
      // Extract only essential data to reduce storage size
      const essentialPages = allPages.map(page => {
        let title = 'Untitled';
        try {
          const properties = page.properties || {};
          const titleProp = Object.values(properties).find(p => p && p.type === 'title');
          if (titleProp && Array.isArray(titleProp.title) && titleProp.title.length > 0) {
            title = titleProp.title[0]?.text?.content || titleProp.title[0]?.plain_text || 'Untitled';
          }
        } catch {}

        return {
          id: page.id,
          title: title
        };
      });
      
      // Try to store in sync storage, fallback to local storage if quota exceeded
      try {
        await chrome.storage.sync.set({ storedPages: essentialPages });
      } catch (syncError) {
        console.warn('Sync storage quota exceeded, using local storage:', syncError);
        await chrome.storage.local.set({ storedPages: essentialPages });
      }
      
      // Populate dropdown
      populatePagesDropdown(essentialPages);
      
      showInline(databaseStatus, `Pages loaded successfully (${essentialPages.length} pages)`, 'success');
    } catch (e) {
      showInline(databaseStatus, `Error loading pages: ${e.message}`, 'error');
    }
  }


  async function startNoteTaking() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await chrome.tabs.sendMessage(tab.id, { action: 'startNoteTaking' });
      showStatus('Note taking started', 'success');
      setRecordingUI(true);
    } catch (error) {
      showStatus('Error starting note taking', 'error');
    }
  }

  async function stopNoteTaking() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await chrome.tabs.sendMessage(tab.id, { action: 'stopNoteTaking' });
      showStatus('Note taking stopped', 'success');
      setRecordingUI(false);
    } catch (error) {
      showStatus('Error stopping note taking', 'error');
    }
  }

  function onStartStopClick() {
    const isRecording = startStopRecordingBtn.dataset.state === 'recording';
    if (isRecording) {
      stopNoteTaking();
    } else {
      startNoteTaking();
    }
  }

  function setRecordingUI(isRecording) {
    if (isRecording) {
      startStopRecordingBtn.innerHTML = '<span class="material-icons" style="margin-right:6px;">stop_circle</span>Stop Recording';
      startStopRecordingBtn.style.background = '#dc3545';
      startStopRecordingBtn.dataset.state = 'recording';
    } else {
      startStopRecordingBtn.innerHTML = '<span class="material-icons" style="margin-right:6px;color:#dc3545;">fiber_manual_record</span>Start Recording';
      startStopRecordingBtn.style.background = '#28a745';
      startStopRecordingBtn.dataset.state = '';
    }
  }

  async function checkMeetingStatus() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'getMeetingStatus' });
      
      if (response && response.isInMeeting) {
        meetingStatus.innerHTML = '<div>Active meeting detected</div>';
        meetingStatus.className = 'meeting-status active';
        updateButtonStates();
      } else {
        meetingStatus.innerHTML = '<div>No active meeting detected</div>';
        meetingStatus.className = 'meeting-status';
        updateButtonStates();
      }
    } catch (error) {
      // Meeting detection failed, likely not on a meeting page
      meetingStatus.innerHTML = '<div>No active meeting detected</div>';
      meetingStatus.className = 'meeting-status';
    }
  }

  function updateButtonStates() {
    const hasApiKeys = geminiApiKeyInput.value && notionTokenInput.value;
    const hasDatabase = notionDatabaseSelect.value;
    const hasPage = selectedPageId !== null;
    const isInMeeting = meetingStatus.classList.contains('active');
    
    // Test connection button - enabled when both API keys are entered
    testConnectionBtn.disabled = !hasApiKeys;
    
    // Note taking buttons - enabled when API keys, database, and page are configured
    const hasFullConfig = hasApiKeys && hasDatabase && hasPage;
    startStopRecordingBtn.disabled = !hasFullConfig || !isInMeeting;
  }

  function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
    statusDiv.style.display = 'block';
    setTimeout(() => {
      statusDiv.style.display = 'none';
    }, 3000);
  }

  function showInline(el, message, type) {
    el.textContent = message;
    el.className = `status ${type}`;
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 2500);
  }

  // Update button states when inputs change
  [geminiApiKeyInput, notionTokenInput, notionDatabaseSelect].forEach(input => {
    input.addEventListener('input', updateButtonStates);
    input.addEventListener('change', updateButtonStates);
  });
});

