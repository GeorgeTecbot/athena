// Popup script for the Chrome extension
document.addEventListener('DOMContentLoaded', function() {
  const geminiApiKeyInput = document.getElementById('geminiApiKey');
  const notionTokenInput = document.getElementById('notionToken');
  const notionDatabaseSelect = document.getElementById('notionDatabaseSelect');
  const loadDatabasesBtn = document.getElementById('loadDatabases');
  const saveConfigBtn = document.getElementById('saveConfig');
  const testConnectionBtn = document.getElementById('testConnection');
  const saveDatabaseBtn = document.getElementById('saveDatabase');
  const connectionStatus = document.getElementById('connectionStatus');
  const databaseStatus = document.getElementById('databaseStatus');
  const databasePanel = document.getElementById('databasePanel');
  const mainView = document.getElementById('mainView');
  const settingsView = document.getElementById('settingsView');
  const backBtn = document.getElementById('backBtn');
  const startNoteTakingBtn = document.getElementById('startNoteTaking');
  const stopNoteTakingBtn = document.getElementById('stopNoteTaking');
  const meetingStatus = document.getElementById('meetingStatus');
  const statusDiv = document.getElementById('status');
  const notionPageSelect = document.getElementById('notionPageSelect');
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
  const addNewNoteBtn = document.getElementById('addNewNote');
  const newNoteModal = document.getElementById('newNoteModal');
  const newNoteTitleInput = document.getElementById('newNoteTitle');
  const createNewNoteBtn = document.getElementById('createNewNote');
  const cancelNewNoteBtn = document.getElementById('cancelNewNote');

  // Load saved configuration
  loadConfig();

  // Event listeners
  testConnectionBtn.addEventListener('click', testConnection);
  saveConfigBtn.addEventListener('click', saveConfig);
  loadDatabasesBtn.addEventListener('click', loadNotionDatabases);
  saveDatabaseBtn.addEventListener('click', saveDatabase);
  startNoteTakingBtn.addEventListener('click', startNoteTaking);
  stopNoteTakingBtn.addEventListener('click', stopNoteTaking);
  loadNotionPagesBtn.addEventListener('click', loadNotionPages);
  saveDefaultPageBtn.addEventListener('click', saveDefaultPage);
  clearDefaultPageBtn.addEventListener('click', clearDefaultPage);
  debugToggle.addEventListener('change', saveDebugToggle);
  refreshLogsBtn.addEventListener('click', loadLogs);
  clearLogsBtn.addEventListener('click', clearLogs);
  settingsBtn.addEventListener('click', showSettings);
  backBtn.addEventListener('click', showMain);
  addNewNoteBtn.addEventListener('click', openNewNoteModal);
  createNewNoteBtn.addEventListener('click', createNewNote);
  cancelNewNoteBtn.addEventListener('click', closeNewNoteModal);

  // Check for active meeting
  checkMeetingStatus();

  async function loadConfig() {
    try {
      const config = await chrome.storage.sync.get(['geminiApiKey', 'notionToken', 'notionDatabaseId', 'notionDatabaseTitle', 'defaultNotionPageId', 'defaultNotionPageTitle', 'debugEnabled']);
      geminiApiKeyInput.value = config.geminiApiKey || '';
      notionTokenInput.value = config.notionToken || '';
      
      // Show database panel if API keys are configured
      if (config.geminiApiKey && config.notionToken) {
        databasePanel.style.display = 'block';
        if (config.notionDatabaseId && config.notionDatabaseTitle) {
          notionDatabaseSelect.innerHTML = `<option value="${config.notionDatabaseId}">${config.notionDatabaseTitle}</option>`;
        }
      }
      
      if (config.defaultNotionPageId && config.defaultNotionPageTitle) {
        notionPageSelect.innerHTML = `<option value="${config.defaultNotionPageId}">${config.defaultNotionPageTitle}</option>`;
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
      
      notionDatabaseSelect.innerHTML = '<option value="">— Select a database —</option>';
      
      resp.databases.forEach(database => {
        const title = database.title?.[0]?.text?.content || database.title?.[0]?.plain_text || 'Untitled Database';
        const option = document.createElement('option');
        option.value = database.id;
        option.textContent = title;
        notionDatabaseSelect.appendChild(option);
      });
      
      showInline(databaseStatus, 'Databases loaded successfully', 'success');
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
        showInline(defaultPageStatus, 'Configure Notion token and database first', 'error');
        return;
      }

      const res = await fetch(`https://api.notion.com/v1/databases/${notionDatabaseId}/query`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${notionToken}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ page_size: 100 })
      });

      if (!res.ok) throw new Error('Failed to fetch pages');
      const data = await res.json();
      notionPageSelect.innerHTML = '<option value="">— Select a page —</option>';
      
      // Debug: Log the first page structure to see what Notion returns
      if (data.results.length > 0) {
        console.log('First Notion page structure:', JSON.stringify(data.results[0], null, 2));
        console.log('Available properties:', Object.keys(data.results[0].properties || {}));
      }
      
      data.results.forEach(page => {
        // Debug: Log each page's properties
        console.log('Page properties:', Object.keys(page.properties || {}));

        // Find the property whose type is 'title' regardless of its name (handles cases like 'Title ')
        let title = 'Untitled';
        try {
          const properties = page.properties || {};
          const titleProp = Object.values(properties).find(p => p && p.type === 'title');
          if (titleProp && Array.isArray(titleProp.title) && titleProp.title.length > 0) {
            title = titleProp.title[0]?.text?.content || titleProp.title[0]?.plain_text || 'Untitled';
          }
        } catch {}

        console.log('Extracted title:', title);

        const opt = document.createElement('option');
        opt.value = page.id;
        opt.textContent = title;
        notionPageSelect.appendChild(opt);
      });
      showInline(defaultPageStatus, 'Pages loaded', 'success');
    } catch (e) {
      showInline(defaultPageStatus, `Error: ${e.message}`, 'error');
    }
  }

  async function saveDefaultPage() {
    const pageId = notionPageSelect.value;
    const title = notionPageSelect.options[notionPageSelect.selectedIndex]?.text || '';
    if (!pageId) {
      showInline(defaultPageStatus, 'Please select a page', 'error');
      return;
    }
    await chrome.storage.sync.set({ defaultNotionPageId: pageId, defaultNotionPageTitle: title });
    showInline(defaultPageStatus, `Saved default page: ${title}`, 'success');
  }

  async function clearDefaultPage() {
    await chrome.storage.sync.remove(['defaultNotionPageId', 'defaultNotionPageTitle']);
    notionPageSelect.innerHTML = '<option value="">— Load pages to choose —</option>';
    showInline(defaultPageStatus, 'Cleared default page', 'success');
  }

  async function startNoteTaking() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await chrome.tabs.sendMessage(tab.id, { action: 'startNoteTaking' });
      showStatus('Note taking started', 'success');
      updateButtonStates();
    } catch (error) {
      showStatus('Error starting note taking', 'error');
    }
  }

  async function stopNoteTaking() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await chrome.tabs.sendMessage(tab.id, { action: 'stopNoteTaking' });
      showStatus('Note taking stopped', 'success');
      updateButtonStates();
    } catch (error) {
      showStatus('Error stopping note taking', 'error');
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
    const isInMeeting = meetingStatus.classList.contains('active');
    
    // Test connection button - enabled when both API keys are entered
    testConnectionBtn.disabled = !hasApiKeys;
    
    // Save database button - enabled when database is selected
    saveDatabaseBtn.disabled = !hasDatabase;
    
    // Note taking buttons - enabled when both API keys and database are configured
    const hasFullConfig = hasApiKeys && hasDatabase;
    startNoteTakingBtn.disabled = !hasFullConfig || !isInMeeting;
    stopNoteTakingBtn.disabled = !hasFullConfig || !isInMeeting;
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
  [geminiApiKeyInput, notionTokenInput].forEach(input => {
    input.addEventListener('input', updateButtonStates);
  });
  
  // Database selection change handler
  notionDatabaseSelect.addEventListener('change', updateButtonStates);
});
