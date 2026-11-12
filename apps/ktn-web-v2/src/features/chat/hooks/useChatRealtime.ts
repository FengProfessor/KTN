import { useEffect, useState, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ChatConnectionState } from '../types/chat.types';
import { useUiStore } from '@/stores/useUiStore';

const CHANNEL_NAME = 'ktn_v2_chat_realtime_bus';

export interface RealtimeChatBroadcastPayload {
  type: 'NEW_MESSAGE' | 'REACTION_UPDATED' | 'PIN_UPDATED' | 'ROOM_READ';
  roomId: string;
  senderEmail?: string;
  timestamp: number;
}

export function useChatRealtime(activeRoomId: string | null, isDemoMode: boolean) {
  const queryClient = useQueryClient();
  const isOfflineSimulated = useUiStore((s) => s.isOfflineSimulated);
  const [connectionState, setConnectionState] = useState<ChatConnectionState>(
    typeof navigator !== 'undefined' && (!navigator.onLine || isOfflineSimulated)
      ? 'offline'
      : 'connected'
  );
  const channelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    if (isOfflineSimulated) {
      setConnectionState('offline');
    } else if (typeof navigator === 'undefined' || navigator.onLine) {
      setConnectionState('connected');
    }
  }, [isOfflineSimulated]);

  const invalidateRoomQueries = useCallback(
    (roomId?: string) => {
      queryClient.invalidateQueries({ queryKey: ['chat-rooms'] });
      if (roomId) {
        queryClient.invalidateQueries({ queryKey: ['chat-messages', roomId] });
      } else if (activeRoomId) {
        queryClient.invalidateQueries({ queryKey: ['chat-messages', activeRoomId] });
      }
      queryClient.invalidateQueries({ queryKey: ['ktn-notifications'] });
    },
    [queryClient, activeRoomId]
  );

  const broadcastChatEvent = useCallback((payload: RealtimeChatBroadcastPayload) => {
    try {
      if (channelRef.current) {
        channelRef.current.postMessage(payload);
      }
    } catch {
      // Ignore BroadcastChannel errors in restricted contexts
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if ('BroadcastChannel' in window) {
      const bc = new BroadcastChannel(CHANNEL_NAME);
      channelRef.current = bc;
      bc.onmessage = (event: MessageEvent<RealtimeChatBroadcastPayload>) => {
        const data = event.data;
        if (!data || !data.type) return;
        invalidateRoomQueries(data.roomId);
      };
    }

    const handleOnline = () => {
      if (useUiStore.getState().isOfflineSimulated) return;
      setConnectionState('reconnecting');
      invalidateRoomQueries(activeRoomId || undefined);
      setTimeout(() => setConnectionState('connected'), 400);
    };

    const handleOffline = () => {
      setConnectionState('offline');
    };

    const handleVisibilityChange = () => {
      if (
        document.visibilityState === 'visible' &&
        navigator.onLine &&
        !useUiStore.getState().isOfflineSimulated
      ) {
        invalidateRoomQueries(activeRoomId || undefined);
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (channelRef.current) {
        channelRef.current.close();
        channelRef.current = null;
      }
    };
  }, [activeRoomId, invalidateRoomQueries, isDemoMode]);

  return {
    connectionState,
    broadcastChatEvent,
    refreshNow: () => invalidateRoomQueries(activeRoomId || undefined),
  };
}
