import React, { useEffect, useState } from 'react';
import { X, Bell, Check, ArrowLeft, ArrowDownLeft, ArrowUpRight, MessageSquare, Trash2, KeyRound, Megaphone, Info, Gamepad2, BellRing, BellOff } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { Notification } from '../types';
import { markNotificationRead, markAllNotificationsForUserRead, deleteNotification, supabase } from '../lib/supabase';

// Sahi VAPID Public Key
const PUBLIC_VAPID_KEY =
  'BNV-wpFWCVbRfyTYJi-1Q3Iq5OL6zYahjmzVy5O89Ogd1ga739ng' +'8RC2nHeoTb3u4L0r3YPULxUOUuab9nMfdHM';

// Helper function - VAPID key ko Uint8Array mein convert karta hai
function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

interface NotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: Notification[];
  onRefresh: () => void;
  onMarkPublicRead?: (id: string) => void;
  onHidePublic?: (id: string) => void;
  onMarkAllPublicRead?: (ids: string[]) => void;
}

export const NotificationModal: React.FC<NotificationModalProps> = ({ 
  isOpen, 
  onClose, 
  notifications, 
  onRefresh,
  onMarkPublicRead,
  onHidePublic,
  onMarkAllPublicRead
}) => {
  const [isNotifyOn, setIsNotifyOn] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        setIsNotifyOn(true);
      }
    }
  }, []);

  const handleToggleNotifications = async () => {
    if (!isNotifyOn) {
      try {
        // 1. Service Worker register + ready
        const registration = await navigator.serviceWorker.register('/sw.js');
        await navigator.serviceWorker.ready;

        // 2. Permission maango
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          alert("Permission blocked. Please allow notifications from browser settings.");
          return;
        }

        // 3. Push subscription lo
        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(PUBLIC_VAPID_KEY)
          });
        }

        // 4. Details nikaalo
        const subJson = subscription.toJSON();
        const endpoint = subJson.endpoint;
        const p256dh = subJson.keys?.p256dh;
        const auth = subJson.keys?.auth;

        if (!endpoint || !p256dh || !auth) {
          throw new Error("Invalid subscription data");
        }

        // 5. Current logged-in user
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) {
          alert("Please login first to enable push notifications");
          return;
        }

        // 6. Supabase mein save / update
        const { error } = await supabase
          .from('push_subscriptions')
          .upsert(
            {
              user_id: user.id,
              endpoint: endpoint,
              p256dh: p256dh,
              auth: auth
            },
            { onConflict: 'user_id' }
          );

      if (error) {
          console.error("Supabase save error:", error);
          alert("Failed to save subscription:\n\n" + (error.message || JSON.stringify(error)));
          return;
        }

        setIsNotifyOn(true);
        alert("✅ Push notifications enabled successfully!");
      } catch (err) {
        console.error("Push subscription failed:", err);
        alert("Failed to enable notifications. Check console for details.");
      }
    } else {
      setIsNotifyOn(false);
      alert("Notifications turned off for this session.");
    }
  };

  const handleMarkRead = async (notification: Notification) => {
    if (notification.user_id) {
      await markNotificationRead(notification.id);
    } else if (onMarkPublicRead) {
      onMarkPublicRead(notification.id);
    }
    onRefresh();
  };

  const handleDelete = async (notification: Notification) => {
    if (notification.user_id) {
      await deleteNotification(notification.id);
    } else if (onHidePublic) {
      onHidePublic(notification.id);
    }
    onRefresh();
  };

  const handleMarkAllRead = async () => {
    const unread = notifications.filter(n => !n.is_read);
    if (unread.length === 0) return;

    const privateUnread = unread.filter(n => n.user_id);
    const publicUnreadIds = unread.filter(n => !n.user_id).map(n => n.id);

    if (privateUnread.length > 0) {
      const userIds = Array.from(new Set(privateUnread.map(n => n.user_id!).filter(Boolean)));
      for (const uid of userIds) {
        await markAllNotificationsForUserRead(uid);
      }
    }
    if (publicUnreadIds.length > 0 && onMarkAllPublicRead) {
      onMarkAllPublicRead(publicUnreadIds);
    }
    onRefresh();
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'deposit':
        return (
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 flex-shrink-0">
            <ArrowDownLeft className="w-5 h-5 text-emerald-400" />
          </div>
        );
      case 'withdrawal':
        return (
          <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center border border-red-500/20 flex-shrink-0">
            <ArrowUpRight className="w-5 h-5 text-red-400" />
          </div>
        );
      case 'chat':
        return (
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20 flex-shrink-0">
            <MessageSquare className="w-5 h-5 text-blue-400" />
          </div>
        );
      case 'deletion':
        return (
          <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center border border-rose-500/20 flex-shrink-0">
            <Trash2 className="w-5 h-5 text-rose-400" />
          </div>
        );
      case 'match_credentials':
        return (
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20 flex-shrink-0">
            <KeyRound className="w-5 h-5 text-amber-400" />
          </div>
        );
      case 'announcement':
        return (
          <div className="w-10 h-10 rounded-xl bg-[#00e5ff]/10 flex items-center justify-center border border-[#00e5ff]/20 flex-shrink-0">
            <Megaphone className="w-5 h-5 text-[#00e5ff]" />
          </div>
        );
      case 'slot_booking':
      case 'match':
        return (
          <div className="w-10 h-10 rounded-xl bg-[#00e5ff]/10 flex items-center justify-center border border-[#00e5ff]/20 flex-shrink-0">
            <Gamepad2 className="w-5 h-5 text-[#00e5ff]" />
          </div>
        );
      default:
        return (
          <div className="w-10 h-10 rounded-xl bg-gray-500/10 flex items-center justify-center border border-gray-500/20 flex-shrink-0">
            <Info className="w-5 h-5 text-gray-400" />
          </div>
        );
    }
  };

  const uniqueNotifications = React.useMemo(() => {
    const seen = new Set<string>();
    const result: Notification[] = [];
    for (const n of notifications) {
      if (!n || !n.id || seen.has(n.id)) continue;
      seen.add(n.id);
      result.push(n);
    }
    return result;
  }, [notifications]);
// Jab notification section open ho → sab auto-read
  useEffect(() => {
    if (!isOpen || uniqueNotifications.length === 0) return;

    const run = async () => {
      const unread = uniqueNotifications.filter((n) => !n.is_read);
      if (unread.length === 0) return;

      const privateUnread = unread.filter((n) => n.user_id);
      const publicUnreadIds = unread.filter((n) => !n.user_id).map((n) => n.id);

      if (privateUnread.length > 0) {
        const userIds = Array.from(
          new Set(privateUnread.map((n) => n.user_id!).filter(Boolean))
        );
        for (const uid of userIds) {
          await markAllNotificationsForUserRead(uid);
        }
      }
      if (publicUnreadIds.length > 0 && onMarkAllPublicRead) {
        onMarkAllPublicRead(publicUnreadIds);
      }
      onRefresh();
    };

    run();
}, [isOpen]);

  const unreadCount = uniqueNotifications.filter((n) => !n.is_read).length;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[150] w-full h-screen bg-slate-950 flex flex-col text-white overflow-hidden"
        >
          {/* Subtle Background Ambience */}
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-red-600/5 rounded-full blur-[120px] pointer-events-none" />
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-[#00e5ff]/5 rounded-full blur-[120px] pointer-events-none" />

          {/* Fullscreen Header */}
          <header className="safe-top bg-slate-900/80 border-b border-gray-800 backdrop-blur-md px-4 py-4 flex items-center justify-between z-10 flex-shrink-0">
            <div className="flex items-center gap-3">
              <button 
                onClick={onClose} 
                className="p-2 hover:bg-white/5 rounded-full transition-colors flex items-center justify-center border border-gray-800"
                aria-label="Back"
              >
                <ArrowLeft className="w-5 h-5 text-gray-300" />
              </button>
              <div>
                <h1 className="text-base font-black tracking-wider text-white">NOTIFICATIONS</h1>
                <p className="text-[10px] text-gray-400 font-medium">
                  {unreadCount > 0 ? `${unreadCount} unread messages` : 'All caught up'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Notification Permission Toggle Button */}
              <button
                onClick={handleToggleNotifications}
                className={`px-3 py-1.5 rounded-lg border text-[10px] font-bold tracking-wider transition-all flex items-center gap-1.5 uppercase ${
                  isNotifyOn 
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                }`}
              >
                {isNotifyOn ? <BellRing className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
                <span>{isNotifyOn ? 'Alerts ON' : 'Alerts OFF'}</span>
              </button>

              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="px-3 py-1.5 rounded-lg border border-[#00e5ff]/30 bg-[#00e5ff]/10 hover:bg-[#00e5ff]/20 text-[10px] font-bold text-[#00e5ff] tracking-wider transition-all uppercase"
                >
                  Mark All Read
                </button>
              )}
            </div>
          </header>

          {/* Swipe tutorial alert bar for mobile screens */}
          {uniqueNotifications.length > 0 && (
            <div className="bg-slate-900/40 border-b border-gray-800/40 px-5 py-2 flex items-center justify-center gap-2 text-center text-[10px] text-gray-500 flex-shrink-0">
              <Info className="w-3.5 h-3.5 text-red-500/80" />
              <span>Tip: Swipe left or right on any card to quickly delete it</span>
            </div>
          )}

          {/* Scrollable List */}
          <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4 custom-scrollbar select-none">
            {uniqueNotifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
                <div className="w-16 h-16 rounded-full bg-slate-900 flex items-center justify-center border border-gray-800 mb-4 shadow-inner">
                  <Bell className="w-8 h-8 text-gray-600" />
                </div>
                <h3 className="text-sm font-bold text-white mb-1">No Notifications Yet</h3>
                <p className="text-xs text-gray-500 max-w-xs">
                  We will let you know when you receive deposits, match details, payouts, or alerts.
                </p>
              </div>
            ) : (
              <div className="max-w-2xl mx-auto space-y-3.5 relative">
                <AnimatePresence mode="popLayout">
                  {uniqueNotifications.map(n => (
                    <motion.div
                      key={n.id}
                      layout
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9, x: 200 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                      drag="x"
                      dragConstraints={{ left: 0, right: 0 }}
                      dragElastic={0.6}
                      onDragEnd={(e, info) => {
                        if (Math.abs(info.offset.x) > 120) {
                          handleDelete(n);
                        }
                      }}
                      className="group relative cursor-grab active:cursor-grabbing touch-pan-y"
                    >
                      {/* Swipe background indicator */}
                      <div className="absolute inset-0 bg-red-600/20 border border-red-500/30 rounded-2xl -z-10 flex items-center justify-between px-6">
                        <Trash2 className="w-5 h-5 text-red-400 animate-pulse" />
                        <Trash2 className="w-5 h-5 text-red-400 animate-pulse" />
                      </div>

                      {/* Main Card */}
                      <div className="p-4 rounded-2xl border transition-all bg-slate-900 border-[#00e5ff]/20 shadow-md shadow-[#00e5ff]/5">
                        <div className="flex items-start gap-3">
                          {/* Colored category icon */}
                          {getNotificationIcon(n.type)}

                          {/* Details */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <h3 className="font-black text-sm tracking-wide leading-snug truncate text-[#00e5ff]">
                                {n.title}
                              </h3>
                              
                              {/* Only show Red Dot indicator if the notification is NOT read */}
                              {!n.is_read && (
                                <span className="w-2 h-2 rounded-full bg-red-500 animate-ping flex-shrink-0 mt-1.5" />
                              )}
                            </div>
                            
                            <p className="text-xs text-gray-300 font-medium leading-relaxed mt-1">
                              {n.message}
                            </p>

                            <div className="flex items-center justify-between mt-3.5 pt-2 border-t border-slate-800/50">
                              <span className="text-[10px] text-gray-500 font-bold tracking-wider">
                                {new Date(n.created_at).toLocaleString()}
                              </span>

                              {/* Card Action Controls */}
                              <div className="flex items-center gap-1.5">
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleMarkRead(n);
                                  }}
                                  className={`px-2.5 py-1 rounded-lg text-[10px] font-black tracking-wider flex items-center gap-1 transition-all border active:scale-95 ${
                                    n.is_read
                                      ? 'bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border-blue-500/30'
                                      : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/20'
                                  }`}
                                  title={n.is_read ? 'Read' : 'Mark as Read'}
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>{n.is_read ? 'READ ✓' : 'READ'}</span>
                                </button>
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDelete(n);
                                  }}
                                  className="p-1 rounded-lg bg-slate-800 hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/30 text-gray-400 border border-transparent transition-all active:scale-95 flex items-center justify-center"
                                  title="Delete Notification"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};