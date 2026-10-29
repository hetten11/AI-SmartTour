import { Link, Outlet, createFileRoute, redirect, useRouterState } from "@tanstack/react-router";
import { meQueryOptions } from "@/api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/admin")({
  beforeLoad: async ({ context }) => {
    const user = await context.queryClient.ensureQueryData(meQueryOptions).catch(() => null);
    if (!user) throw redirect({ to: "/login" });
    if (user.role !== "admin") throw redirect({ to: "/" });
  },
  component: AdminLayout,
});

const tabs = [
  { to: "/admin", label: "Tổng quan" },
  { to: "/admin/sources", label: "Nguồn dữ liệu" },
  { to: "/admin/sync-runs", label: "Lịch sử đồng bộ" },
];

function AdminLayout() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-xl font-medium">Quản trị</h1>
        <p className="text-muted-foreground text-sm">
          Người dùng, nguồn dữ liệu, đồng bộ và kho tri thức cho RAG.
        </p>
      </div>

      <nav className="flex gap-2 border-b pb-2">
        {tabs.map((tab) => (
          <Link
            key={tab.to}
            to={tab.to}
            className={cn(
              "rounded-md px-2 py-1 text-sm",
              pathname === tab.to
                ? "bg-muted font-medium"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      <Outlet />
    </div>
  );
}
