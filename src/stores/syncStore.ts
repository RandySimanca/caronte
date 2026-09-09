import { create } from 'zustand';

interface SyncState {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSync: Date | null;
  setOnlineStatus: (status: boolean) => void;
  setSyncing: (status: boolean) => void;
  setPendingCount: (count: number) => void;
  setLastSync: (date: Date) => void;
}

export const useSyncStore = create<SyncState>((set) => ({
  isOnline: navigator.onLine,
  isSyncing: false,
  pendingCount: 0,
  lastSync: null,

  setOnlineStatus: (status) => set({ isOnline: status }),
  setSyncing: (status) => set({ isSyncing: status }),
  setPendingCount: (count) => set({ pendingCount: count }),
  setLastSync: (date) => set({ lastSync: date }),
}));

// Setup online/offline listeners
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => useSyncStore.getState().setOnlineStatus(true));
  window.addEventListener('offline', () => useSyncStore.getState().setOnlineStatus(false));
}
