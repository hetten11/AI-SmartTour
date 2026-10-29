import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  CalendarClock,
  CalendarDays,
  Compass,
  Landmark,
  LayoutDashboard,
  Loader2,
  LogOut,
  Palmtree,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import { logout } from "@/api";
import type { User } from "@/api";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";

// Danh mục menu khám phá & AI
const travelNavItems = [
  {
    to: "/assistant",
    label: "Trợ lý AI",
    icon: Sparkles,
    badge: "AI",
  },
  {
    to: "/trips",
    label: "Chuyến đi",
    icon: Compass,
  },
  {
    to: "/places",
    label: "Địa điểm",
    icon: Landmark,
  },
  {
    to: "/events",
    label: "Sự kiện",
    icon: CalendarDays,
  },
] as const;

// Danh mục menu hệ thống & quản lý tài khoản
const systemNavItems = [
  { to: "/", label: "Tổng quan", icon: LayoutDashboard },
  { to: "/profile", label: "Hồ sơ du khách", icon: UserRound },
  { to: "/sessions", label: "Phiên đăng nhập", icon: CalendarClock },
] as const;

/**
 * Lấy chữ cái đầu để hiển thị trong Avatar Fallback
 */
function getInitials(name?: string | null, email?: string): string {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return parts[0].slice(0, 2).toUpperCase();
  }
  if (email) {
    return email.slice(0, 2).toUpperCase();
  }
  return "DN";
}

export function AppSidebar({ user }: { user: User }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  const mutation = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.clear();
      void navigate({ to: "/login" });
    },
  });

  const userDisplayName = user.fullName || user.email.split("@")[0];
  const initials = getInitials(user.fullName, user.email);
  // Mục "/" chỉ sáng khi đúng trang chủ, các mục khác sáng cả route con.
  const isActive = (to: string) =>
    to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(`${to}/`);

  return (
    <Sidebar variant="inset">
      {/* Header Sidebar: Branding Đà Nẵng Travel */}
      <SidebarHeader className="border-b border-sidebar-border/60 pb-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link to="/" />}>
              <div className="flex size-9 items-center justify-center rounded-lg bg-sky-500/15 text-sky-600 ring-1 ring-sky-500/20 dark:bg-sky-400/20 dark:text-sky-400">
                <Palmtree className="size-5" />
              </div>
              <div className="flex flex-col gap-0.5 leading-none">
                <div className="flex items-center gap-1.5">
                  <span className="font-heading font-semibold tracking-tight">
                    Đà Nẵng Travel
                  </span>
                  <span className="rounded bg-muted px-1.5 py-0.2 text-[10px] font-medium text-muted-foreground">
                    AI
                  </span>
                </div>
                <span className="text-[11px] text-muted-foreground">
                  Trợ lý Du lịch Thông minh
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      {/* Content Sidebar: Các nhóm tính năng */}
      <SidebarContent>
        {/* Nhóm 1: Khám phá & Trợ lý du lịch AI */}
        <SidebarGroup>
          <SidebarGroupLabel className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground/80">
            <Sparkles className="size-3.5 text-sky-500" />
            Trợ lý & Khám phá
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {travelNavItems.map((item) => (
                <SidebarMenuItem key={item.label}>
                  <SidebarMenuButton
                    isActive={isActive(item.to)}
                    tooltip={item.label}
                    render={<Link to={item.to} />}
                  >
                    <item.icon />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                  {"badge" in item && item.badge ? (
                    <SidebarMenuBadge className="bg-sky-500/10 text-sky-600 dark:text-sky-400">
                      {item.badge}
                    </SidebarMenuBadge>
                  ) : null}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator className="mx-2" />

        {/* Nhóm 2: Hệ thống & Quản lý */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-semibold text-muted-foreground/80">
            Hệ thống & Tài khoản
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {systemNavItems.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton
                    isActive={isActive(item.to)}
                    tooltip={item.label}
                    render={<Link to={item.to} />}
                  >
                    <item.icon />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              {user.role === "admin" ? (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={isActive("/admin")}
                    tooltip="Quản trị"
                    render={<Link to="/admin" />}
                  >
                    <ShieldCheck />
                    <span>Quản trị</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ) : null}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Footer Sidebar: User Profile & Đăng xuất */}
      <SidebarFooter className="border-t border-sidebar-border/60 p-3">
        <div className="flex items-center justify-between gap-2 rounded-lg bg-sidebar-accent/50 p-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <Avatar size="sm" className="size-8 ring-1 ring-border">
              <AvatarImage src={user.avatarUrl} alt={userDisplayName} />
              <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-xs font-medium text-sidebar-foreground">
                {userDisplayName}
              </span>
              <span className="truncate text-[11px] text-muted-foreground">
                {user.email}
              </span>
            </div>
          </div>

          <Button
            variant="ghost"
            size="icon-sm"
            title="Đăng xuất"
            aria-label="Đăng xuất"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
            className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive shrink-0"
          >
            {mutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <LogOut className="size-4" />
            )}
          </Button>
        </div>

        {mutation.error ? (
          <p className="px-1 text-xs text-destructive">
            {mutation.error.message}
          </p>
        ) : null}
      </SidebarFooter>
    </Sidebar>
  );
}
