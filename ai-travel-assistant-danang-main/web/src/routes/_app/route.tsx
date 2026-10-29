import { useQuery } from "@tanstack/react-query";
import {
  Link,
  Outlet,
  createFileRoute,
  redirect,
  useRouterState,
} from "@tanstack/react-router";
import { CloudRain, Sun } from "lucide-react";
import { Fragment } from "react";
import {
  itineraryQueryOptions,
  meQueryOptions,
  tripQueryOptions,
  weatherQueryOptions,
} from "@/api";
import { AppSidebar } from "@/components/app-sidebar";
import { NotificationBell } from "@/components/notification-bell";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

const pageTitles: Record<string, string> = {
  "/": "Tổng quan",
  "/assistant": "Trợ lý AI",
  "/trips": "Chuyến đi",
  "/places": "Địa điểm",
  "/events": "Sự kiện",
  "/profile": "Hồ sơ du khách",
  "/sessions": "Phiên đăng nhập",
  "/admin": "Quản trị",
  "/admin/sources": "Nguồn dữ liệu",
  "/admin/sync-runs": "Lịch sử đồng bộ",
};

// Cấp cha của route hai tầng, dùng cho breadcrumb.
const parents = {
  trips: { label: "Chuyến đi", to: "/trips" },
  events: { label: "Sự kiện", to: "/events" },
  admin: { label: "Quản trị", to: "/admin" },
} as const;

type ParentKey = keyof typeof parents;

type Crumb = {
  label: string;
  to?: "/" | "/trips" | "/events" | "/admin";
  tripId?: string;
};

const parentsOf = (segment: string) =>
  segment in parents ? parents[segment as ParentKey] : undefined;

function useCrumbs(pathname: string): Crumb[] {
  const segments = pathname.split("/").filter(Boolean);
  const [first, second] = segments;

  const tripIdFromPath = first === "trips" ? (second ?? "") : "";
  const itineraryId = first === "itineraries" ? (second ?? "") : "";
  // Header hỏi tên chuyến đi; react-query dùng chung cache với trang lịch trình.
  const itinerary = useQuery({
    ...itineraryQueryOptions(itineraryId),
    enabled: itineraryId !== "",
  });
  const tripId = tripIdFromPath || itinerary.data?.itinerary.tripId || "";
  const trip = useQuery({
    ...tripQueryOptions(tripId),
    enabled: tripId !== "",
  });
  const tripTitle = trip.data?.title ?? undefined;

  if (segments.length === 0) return [{ label: pageTitles["/"] }];

  if (first === "itineraries" && second) {
    return [
      { label: "Đà Nẵng Travel", to: "/" },
      parents.trips,
      { label: tripTitle ?? "Chi tiết chuyến đi", tripId: tripId || undefined },
      { label: "Chi tiết lịch trình" },
    ];
  }

  if (first === "trips" && second) {
    return [
      { label: "Đà Nẵng Travel", to: "/" },
      parents.trips,
      { label: tripTitle ?? "Chi tiết chuyến đi" },
    ];
  }

  if (first === "events" && second) {
    return [
      { label: "Đà Nẵng Travel", to: "/" },
      parents.events,
      { label: "Chi tiết sự kiện" },
    ];
  }

  if (second) {
    const parent = parentsOf(first);
    return [
      { label: "Đà Nẵng Travel", to: "/" },
      ...(parent ? [parent] : []),
      { label: pageTitles[pathname] ?? "Đà Nẵng Travel" },
    ];
  }

  const single = pageTitles[pathname];
  if (single) {
    return pathname === "/"
      ? [{ label: single }]
      : [{ label: "Đà Nẵng Travel", to: "/" }, { label: single }];
  }

  return [{ label: "Đà Nẵng Travel", to: "/" }, { label: "Chi tiết" }];
}

export const Route = createFileRoute("/_app")({
  // ponytail: cookie phiên chỉ có ở browser. Bỏ SSR thì guard không chạy trên
  // server, tránh việc server thấy 401 rồi đá người đã đăng nhập về /login.
  ssr: false,
  beforeLoad: async ({ context }) => {
    const user = await context.queryClient
      .ensureQueryData(meQueryOptions)
      .catch(() => null);
    if (!user) throw redirect({ to: "/login" });
    return { user };
  },
  component: AppLayout,
});

function AppLayout() {
  const { user } = Route.useRouteContext();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const crumbs = useCrumbs(pathname);
  const current = useQuery(weatherQueryOptions).data?.current;

  return (
    <SidebarProvider>
      <AppSidebar user={user} />
      <SidebarInset>
        <header className="sticky top-2 z-10 flex h-[4.3rem] shrink-0 items-center justify-between gap-2 border-b bg-background px-4 before:absolute before:inset-x-0 before:-top-2 before:h-2 before:bg-background before:content-['']">
          <div className="flex items-center gap-2 h-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" />
            <Breadcrumb>
              <BreadcrumbList className="flex-nowrap">
                {crumbs.map((crumb, index) => (
                  <Fragment key={`${crumb.label}-${index}`}>
                    {index > 0 ? <BreadcrumbSeparator /> : null}
                    <BreadcrumbItem>
                      {crumb.tripId ? (
                        <BreadcrumbLink
                          render={
                            <Link
                              to="/trips/$tripId"
                              params={{ tripId: crumb.tripId }}
                            />
                          }
                        >
                          {crumb.label}
                        </BreadcrumbLink>
                      ) : crumb.to ? (
                        <BreadcrumbLink render={<Link to={crumb.to} />}>
                          {crumb.label}
                        </BreadcrumbLink>
                      ) : (
                        <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                      )}
                    </BreadcrumbItem>
                  </Fragment>
                ))}
              </BreadcrumbList>
            </Breadcrumb>
          </div>

          <div className="flex items-center gap-2">
            {current ? (
              <span
                title={current.description}
                className={cn(
                  "hidden items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs sm:inline-flex",
                  current.isRainy
                    ? "border-sky-500/20 bg-sky-500/5 text-sky-700 dark:text-sky-300"
                    : "border-amber-500/20 bg-amber-500/5 text-amber-700 dark:text-amber-300",
                )}
              >
                {current.isRainy ? (
                  <CloudRain className="size-3" />
                ) : (
                  <Sun className="size-3" />
                )}
                Đà Nẵng • {Math.round(current.temp)}°C
              </span>
            ) : null}
            <NotificationBell />
          </div>
        </header>
        <div className="flex-1 p-4 md:p-6">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
