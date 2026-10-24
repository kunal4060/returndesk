"use client";

import { Drawer } from "@/components/ui/Drawer";
import type { NotificationItem } from "@/wording/library";

/**
 * NotificationDrawer — simulated notifications. Every line is derived
 * from the wording library, so a notification can never promise more
 * than the state page itself says.
 */
export function NotificationDrawer({
  open,
  onClose,
  notifications,
}: {
  open: boolean;
  onClose: () => void;
  notifications: NotificationItem[];
}) {
  return (
    <Drawer open={open} onClose={onClose} title="Notifications (simulated)">
      <p className="mb-4 text-[13px] text-ink-2">
        Generated from the same wording library as the status pages — the words cannot
        disagree, and money is never described as arrived before the credited state.
      </p>
      {notifications.length === 0 && (
        <p className="text-sm text-ink-2">No notifications yet.</p>
      )}
      <ul className="flex flex-col">
        {notifications.map((n) => (
          <li key={n.id} className="border-b border-rule py-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[13px] font-semibold">{n.title}</span>
              <span className="font-mono text-[11px] text-ink-2">{n.state}</span>
            </div>
            <p className="mt-1 text-[13px] text-ink-2">{n.body}</p>
          </li>
        ))}
      </ul>
    </Drawer>
  );
}
