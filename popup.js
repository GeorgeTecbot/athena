// Popup script for the Chrome extension
document.addEventListener('DOMContentLoaded', function() {
  const geminiApiKeyInput = document.getElementById('geminiApiKey');
  const notionTokenInput = document.getElementById('notionToken');
  const notionDatabaseIdInput = document.getElementById('notionDatabaseId');
  const saveConfigBtn = document.getElementById('saveConfig');
  const testConnectionBtn = document.getElementById('testConnection');
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
  saveConfigBtn.addEventListener('click', saveConfig);
  testConnectionBtn.addEventListener('click', testConnection);
  startNoteTakingBtn.addEventListener('click', startNoteTaking);
  stopNoteTakingBtn.addEventListener('click', stopNoteTaking);
  loadNotionPagesBtn.addEventListener('click', loadNotionPages);
  saveDefaultPageBtn.addEventListener('click', saveDefaultPage);
  clearDefaultPageBtn.addEventListener('click', clearDefaultPage);
  debugToggle.addEventListener('change', saveDebugToggle);
  refreshLogsBtn.addEventListener('click', loadLogs);
  clearLogsBtn.addEventListener('click', clearLogs);
  settingsBtn.addEventListener('click', toggleSettings);
  addNewNoteBtn.addEventListener('click', openNewNoteModal);
  createNewNoteBtn.addEventListener('click', createNewNote);
  cancelNewNoteBtn.addEventListener('click', closeNewNoteModal);

  // Check for active meeting
  checkMeetingStatus();

  async function loadConfig() {
    try {
      const config = await chrome.storage.sync.get(['geminiApiKey', 'notionToken', 'notionDatabaseId', 'defaultNotionPageId', 'defaultNotionPageTitle', 'debugEnabled']);
      geminiApiKeyInput.value = config.geminiApiKey || '';
      notionTokenInput.value = config.notionToken || '';
      notionDatabaseIdInput.value = config.notionDatabaseId || '';
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
      notionToken: notionTokenInput.value.trim(),
      notionDatabaseId: notionDatabaseIdInput.value.trim()
    };

    if (!config.geminiApiKey || !config.notionToken || !config.notionDatabaseId) {
      showStatus('Please fill in all configuration fields', 'error');
      return;
    }

    try {
      await chrome.storage.sync.set(config);
      showStatus('Configuration saved successfully', 'success');
      updateButtonStates();
    } catch (error) {
      showStatus('Error saving configuration', 'error');
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

  function toggleSettings() {
    const isVisible = settingsPanel.style.display !== 'none';
    settingsPanel.style.display = isVisible ? 'none' : 'block';
    settingsBtn.textContent = isVisible ? '⚙️' : '✕';
    settingsBtn.title = isVisible ? 'Settings' : 'Close Settings';
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
    const config = await chrome.storage.sync.get(['geminiApiKey', 'notionToken', 'notionDatabaseId']);
    
    if (!config.geminiApiKey || !config.notionToken || !config.notionDatabaseId) {
      showStatus('Please configure API keys first', 'error');
      return;
    }

    try {
      // Test Gemini API
      const geminiResponse = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=' + config.geminiApiKey, {
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

      // Test Notion API
      const notionResponse = await fetch(`https://api.notion.com/v1/databases/${config.notionDatabaseId}`, {
        headers: {
          'Authorization': `Bearer ${config.notionToken}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json'
        }
      });

      if (!notionResponse.ok) {
        throw new Error('Notion API test failed');
      }

      showStatus('Connection test successful!', 'success');
    } catch (error) {
      showStatus(`Connection test failed: ${error.message}`, 'error');
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
    const hasConfig = geminiApiKeyInput.value && notionTokenInput.value && notionDatabaseIdInput.value;
    const isInMeeting = meetingStatus.classList.contains('active');
    
    testConnectionBtn.disabled = !hasConfig;
    startNoteTakingBtn.disabled = !hasConfig || !isInMeeting;
    stopNoteTakingBtn.disabled = !hasConfig || !isInMeeting;
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
  [geminiApiKeyInput, notionTokenInput, notionDatabaseIdInput].forEach(input => {
    input.addEventListener('input', updateButtonStates);
  });
});
