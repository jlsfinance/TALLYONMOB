import { useState, useEffect } from 'react';
import './App.css';

interface SyncStatus {
  isTallyConnected: boolean;
  isCloudConnected: boolean;
  lastSyncTime: string | null;
  progressPercentage: number;
  processedRecords: number;
  totalRecords: number;
  ledgersCount: number;
  vouchersCount: number;
  stockItemsCount: number;
  statusText: string;
  message: string;
}

function App() {
  const [status, setStatus] = useState<SyncStatus>({
    isTallyConnected: false,
    isCloudConnected: false,
    lastSyncTime: null,
    progressPercentage: 0,
    processedRecords: 0,
    totalRecords: 0,
    ledgersCount: 0,
    vouchersCount: 0,
    stockItemsCount: 0,
    statusText: '⏸️ Idle',
    message: 'Waiting for sync data...',
  });

  const [logs, setLogs] = useState<string[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);

  // Simulate live updates (in production, this would be a WebSocket or API polling)
  useEffect(() => {
    const interval = setInterval(() => {
      // This would be replaced with actual data fetching
      setStatus((prev) => ({
        ...prev,
        lastSyncTime: prev.lastSyncTime || new Date().toISOString(),
      }));
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const formatTime = (isoString: string | null): string => {
    if (!isoString) return '—';
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  const formatDate = (isoString: string | null): string => {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleDateString('en-US', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const handleManualSync = () => {
    setIsSyncing(true);
    setLogs((prev) => [`[${new Date().toLocaleTimeString()}] 🔄 Manual sync triggered...`, ...prev]);
    // Simulate sync completion
    setTimeout(() => {
      setIsSyncing(false);
      setStatus((prev) => ({
        ...prev,
        lastSyncTime: new Date().toISOString(),
        progressPercentage: 100,
        processedRecords: prev.totalRecords,
        statusText: '✅ Completed',
        message: 'Sync completed successfully',
      }));
      setLogs((prev) => [
        `[${new Date().toLocaleTimeString()}] ✅ Sync completed — ${status.totalRecords} records processed`,
        ...prev,
      ]);
    }, 3000);
  };

  return (
    <div className="dashboard">
      {/* Header */}
      <header className="dashboard-header">
        <div className="header-left">
          <div className="app-logo">
            <span className="logo-icon">⟳</span>
            <div className="logo-text">
              <h1>TallySync</h1>
              <span className="logo-subtitle">Cloud Sync Dashboard</span>
            </div>
          </div>
        </div>
        <div className="header-right">
          <div className="status-badge">
            <span className={`status-dot ${status.isTallyConnected ? 'connected' : 'disconnected'}`} />
            Tally
          </div>
          <div className="status-badge">
            <span className={`status-dot ${status.isCloudConnected ? 'connected' : 'disconnected'}`} />
            Cloud
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="dashboard-content">
        {/* Status Cards */}
        <div className="status-cards">
          <div className="status-card tally-card">
            <div className="card-header">
              <div className="card-icon tally-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
                  <line x1="8" y1="21" x2="16" y2="21"/>
                  <line x1="12" y1="17" x2="12" y2="21"/>
                </svg>
              </div>
              <span className="card-label">Tally Connection</span>
            </div>
            <div className="card-body">
              <div className={`connection-status ${status.isTallyConnected ? 'connected' : 'disconnected'}`}>
                <span className="status-indicator" />
                {status.isTallyConnected ? 'Connected' : 'Disconnected'}
              </div>
            </div>
          </div>

          <div className="status-card cloud-card">
            <div className="card-header">
              <div className="card-icon cloud-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>
                </svg>
              </div>
              <span className="card-label">Cloud Connection</span>
            </div>
            <div className="card-body">
              <div className={`connection-status ${status.isCloudConnected ? 'connected' : 'disconnected'}`}>
                <span className="status-indicator" />
                {status.isCloudConnected ? 'Connected' : 'Disconnected'}
              </div>
            </div>
          </div>

          <div className="status-card last-sync-card">
            <div className="card-header">
              <div className="card-icon sync-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 4 23 10 17 10"/>
                  <polyline points="1 20 1 14 7 14"/>
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                </svg>
              </div>
              <span className="card-label">Last Sync</span>
            </div>
            <div className="card-body">
              <div className="sync-time">
                <span className="time-value">{formatTime(status.lastSyncTime)}</span>
                <span className="date-value">{formatDate(status.lastSyncTime)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Progress Section */}
        <div className="progress-section">
          <div className="progress-header">
            <h2>Sync Progress</h2>
            <span className="sync-status-text">{status.statusText}</span>
          </div>
          <div className="progress-bar-container">
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${status.progressPercentage}%` }}
              />
            </div>
            <span className="progress-percentage">{status.progressPercentage}%</span>
          </div>
          <p className="progress-message">{status.message}</p>
          <div className="progress-stats">
            <div className="stat-item">
              <span className="stat-value">{status.totalRecords}</span>
              <span className="stat-label">Total</span>
            </div>
            <div className="stat-item">
              <span className="stat-value processed">{status.processedRecords}</span>
              <span className="stat-label">Processed</span>
            </div>
            <div className="stat-item">
              <span className="stat-value remaining">{status.totalRecords - status.processedRecords}</span>
              <span className="stat-label">Remaining</span>
            </div>
          </div>
        </div>

        {/* Record Counts */}
        <div className="record-counts">
          <h2>Record Counts</h2>
          <div className="count-cards">
            <div className="count-card ledgers">
              <div className="count-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                </svg>
              </div>
              <div className="count-details">
                <span className="count-number">{status.ledgersCount}</span>
                <span className="count-label">Ledgers</span>
              </div>
            </div>
            <div className="count-card vouchers">
              <div className="count-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                  <line x1="16" y1="2" x2="16" y2="6"/>
                  <line x1="8" y1="2" x2="8" y2="6"/>
                  <line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
              </div>
              <div className="count-details">
                <span className="count-number">{status.vouchersCount}</span>
                <span className="count-label">Vouchers</span>
              </div>
            </div>
            <div className="count-card stock">
              <div className="count-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                  <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
                  <line x1="12" y1="22.08" x2="12" y2="12"/>
                </svg>
              </div>
              <div className="count-details">
                <span className="count-number">{status.stockItemsCount}</span>
                <span className="count-label">Stock Items</span>
              </div>
            </div>
          </div>
        </div>

        {/* Sync Button */}
        <div className="sync-controls">
          <button
            className={`sync-button ${isSyncing ? 'syncing' : ''}`}
            onClick={handleManualSync}
            disabled={isSyncing}
          >
            <span className={`sync-icon-btn ${isSyncing ? 'spinning' : ''}`}>⟳</span>
            {isSyncing ? 'Syncing...' : 'Sync Now'}
          </button>
        </div>

        {/* Live Log Terminal */}
        <div className="log-terminal">
          <div className="terminal-header">
            <div className="terminal-dots">
              <span className="dot red" />
              <span className="dot yellow" />
              <span className="dot green" />
            </div>
            <span className="terminal-title">Live Console Log</span>
            <span className="terminal-badge">terminal</span>
          </div>
          <div className="terminal-body">
            {logs.length === 0 ? (
              <div className="terminal-empty">[System]: Waiting for sync operations...</div>
            ) : (
              logs.map((log, i) => (
                <div key={i} className="terminal-line">
                  {log}
                </div>
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
