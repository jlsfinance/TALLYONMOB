'use client';

import { useEffect, useState, useCallback } from 'react';
import { useCompanyStore } from '@/stores/company-store';
import { fetchApi } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import { Smartphone, Wifi, WifiOff, Monitor, Clock } from 'lucide-react';
import type { Device } from '@/types';

interface DeviceWithUser extends Device {
  user?: { name: string; email: string } | null;
}

export default function DevicesPage() {
  const { activeCompany } = useCompanyStore();
  const [devices, setDevices] = useState<DeviceWithUser[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!activeCompany) return;
    setLoading(true);
    try {
      const res = await fetchApi<DeviceWithUser[]>(`/api/devices?companyId=${activeCompany.id}`);
      setDevices(res);
    } catch {
      // handled by fetchApi
    } finally {
      setLoading(false);
    }
  }, [activeCompany]);

  useEffect(() => {
    load();
  }, [load]);

  const isActive = (device: DeviceWithUser) => {
    if (!device.lastSeenAt) return false;
    const lastSeen = new Date(device.lastSeenAt).getTime();
    return Date.now() - lastSeen < 24 * 60 * 60 * 1000; // active within 24h
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text)]">Devices</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          {devices.length > 0 ? `${devices.length} registered device${devices.length > 1 ? 's' : ''}` : 'Tally sync devices'}
        </p>
      </div>

      {!activeCompany ? (
        <div className="text-center py-12 text-[var(--text-secondary)]">
          <Smartphone className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>Select a company to view devices.</p>
        </div>
      ) : loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-48 bg-[var(--bg-card)] rounded-xl border border-[var(--border)] animate-pulse" />
          ))}
        </div>
      ) : devices.length === 0 ? (
        <div className="text-center py-16">
          <Smartphone className="w-12 h-12 mx-auto mb-3 text-[var(--text-secondary)] opacity-50" />
          <p className="text-[var(--text-secondary)] mb-2">No devices registered yet.</p>
          <p className="text-sm text-[var(--text-secondary)]">
            Install the Tally sync agent on your desktop to start syncing data.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {devices.map((device) => {
            const active = isActive(device);
            return (
              <div
                key={device.id}
                className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] p-5 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`p-3 rounded-lg ${active ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500'}`}>
                      <Monitor className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-[var(--text)]">{device.deviceName}</h3>
                      {device.user && (
                        <p className="text-xs text-[var(--text-secondary)]">{device.user.name}</p>
                      )}
                    </div>
                  </div>
                  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${
                    active
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                  }`}>
                    {active ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                    {active ? 'Online' : 'Offline'}
                  </span>
                </div>

                <div className="space-y-2 text-sm">
                  {device.tallyVersion && (
                    <div className="flex items-center justify-between">
                      <span className="text-[var(--text-secondary)]">Tally Version</span>
                      <span className="text-[var(--text)]">{device.tallyVersion}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--text-secondary)]">Status</span>
                    <span className={`${device.isActive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {device.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  {device.lastSeenAt && (
                    <div className="flex items-center justify-between">
                      <span className="text-[var(--text-secondary)]">Last Seen</span>
                      <span className="text-[var(--text)] flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDateTime(device.lastSeenAt)}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--text-secondary)]">Registered</span>
                    <span className="text-[var(--text)]">{formatDateTime(device.createdAt)}</span>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-[var(--border)]">
                  <div className="flex items-center gap-1 text-xs text-[var(--text-secondary)] font-mono">
                    <span className="truncate">API Key: {device.apiKey.slice(0, 12)}...{device.apiKey.slice(-4)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
