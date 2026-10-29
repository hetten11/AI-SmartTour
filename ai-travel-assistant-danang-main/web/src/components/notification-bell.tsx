import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  Bell,
  CalendarClock,
  CloudRain,
  Info,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import {
  markAllNotificationsRead,
  markNotificationRead,
  notificationsQueryOptions,
} from "@/api";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { errorMessage, formatDateTime } from "@/lib/display";
import { cn } from "@/lib/utils";

const typeIcons: Record<string, LucideIcon> = {
  event_change: TriangleAlert,
  weather: CloudRain,
  reminder: CalendarClock,
  system: Info,
};

const itemClass =
  "flex items-start gap-2 rounded-md border p-2 text-left transition-colors hover:bg-muted";

export function NotificationBell() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const query = useQuery(notificationsQueryOptions);

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["notifications"] });

  const markOne = useMutation({ mutationFn: markNotificationRead, onSuccess: refresh });
  const markAll = useMutation({ mutationFn: markAllNotificationsRead, onSuccess: refresh });

  const notifications = query.data?.notifications ?? [];
  const unread = query.data?.unread ?? 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "relative")}
        aria-label={
          unread > 0 ? `Thông báo, ${unread} chưa đọc` : "Thông báo"
        }
      >
        <Bell />
        {unread > 0 ? (
          <span className="bg-destructive pointer-events-none absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full text-[10px] text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[22rem] max-w-[calc(100vw-2rem)] gap-0 p-0"
      >
        <div className="flex items-center justify-between gap-2 border-b p-3">
          <span className="text-sm font-medium">Thông báo</span>
          <Button
            variant="ghost"
            size="sm"
            disabled={markAll.isPending || unread === 0}
            onClick={() => markAll.mutate()}
          >
            Đọc hết
          </Button>
        </div>

        <div className="grid max-h-80 gap-2 overflow-y-auto p-3">
          {query.isPending ? (
            <p className="text-muted-foreground text-sm">Đang tải...</p>
          ) : notifications.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Không có thông báo nào.
            </p>
          ) : (
            notifications.map((notification) => {
              const Icon = typeIcons[notification.type] ?? Info;
              const close = () => {
                setOpen(false);
                if (!notification.isRead) markOne.mutate(notification.id);
              };
              const inner = (
                <>
                  <Icon
                    className={cn(
                      "mt-0.5 size-4 shrink-0",
                      notification.isRead ? "text-muted-foreground" : "text-sky-500",
                    )}
                  />
                  <div className="grid min-w-0 gap-0.5">
                    <span
                      className={cn(
                        "text-sm",
                        notification.isRead ? "text-muted-foreground" : "font-medium",
                      )}
                    >
                      {notification.title}
                    </span>
                    {notification.body ? (
                      <span className="text-muted-foreground text-xs">
                        {notification.body}
                      </span>
                    ) : null}
                    <span className="text-muted-foreground text-xs">
                      {formatDateTime(notification.createdAt)}
                    </span>
                  </div>
                  {notification.isRead ? null : (
                    <>
                      <span className="sr-only">Chưa đọc</span>
                      <span className="bg-destructive mt-1.5 size-2 shrink-0 rounded-full" />
                    </>
                  )}
                </>
              );

              return notification.tripId ? (
                <Link
                  key={notification.id}
                  to="/trips/$tripId"
                  params={{ tripId: notification.tripId }}
                  className={itemClass}
                  onClick={close}
                >
                  {inner}
                </Link>
              ) : (
                <button
                  key={notification.id}
                  type="button"
                  className={itemClass}
                  onClick={close}
                >
                  {inner}
                </button>
              );
            })
          )}
        </div>

        {query.error ? (
          <div className="flex items-center justify-between gap-2 border-t p-3">
            <p className="text-destructive text-xs">
              {errorMessage(query.error)}
            </p>
            <Button variant="outline" size="xs" onClick={() => void query.refetch()}>
              Thử lại
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
