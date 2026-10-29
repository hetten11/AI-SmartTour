import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { Compass, MapPin, Palmtree, UtensilsCrossed } from "lucide-react";
import { meQueryOptions } from "@/api";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_auth")({
  // ponytail: cookie phiên chỉ có ở browser, render phía server luôn thấy 401
  // nên bỏ SSR cho cả nhánh auth.
  ssr: false,
  beforeLoad: async ({ context }) => {
    const user = await context.queryClient
      .ensureQueryData(meQueryOptions)
      .catch(() => null);
    if (user) throw redirect({ to: "/" });
  },
  component: AuthLayout,
});

const features = [
  {
    icon: Compass,
    title: "Lịch trình tự động",
    desc: "Tối ưu thời gian và điểm đến theo sở thích",
  },
  {
    icon: UtensilsCrossed,
    title: "Gợi ý ẩm thực bản địa",
    desc: "Mì Quảng, bánh tráng cuốn thịt heo, hải sản tươi sống",
  },
  {
    icon: MapPin,
    title: "Bản đồ & Danh thắng",
    desc: "Bãi biển Mỹ Khê, Ngũ Hành Sơn, Chùa Linh Ứng",
  },
];

function AuthLayout() {
  return (
    <div className="grid min-h-svh w-full lg:grid-cols-2">
      {/* Trái: hero, đảo màu theo theme (đen ở light, trắng ở dark) */}
      <div className="bg-primary text-primary-foreground hidden flex-col justify-between p-10 lg:flex">
        <div className="flex items-center gap-3">
          <div className="bg-primary-foreground/10 flex size-10 items-center justify-center rounded-xl">
            <Palmtree className="size-5" />
          </div>
          <div className="flex flex-col">
            <span className="font-heading text-lg font-semibold tracking-tight">
              Đà Nẵng Travel
            </span>
            <span className="text-primary-foreground/70 text-xs">
              Trợ lý Du lịch Thông minh AI
            </span>
          </div>
          <Badge variant="secondary" className="ml-2">
            AI Powered
          </Badge>
        </div>

        <div className="my-auto flex flex-col gap-8 py-12">
          <div className="flex flex-col gap-3">
            <h1 className="font-heading text-4xl font-bold tracking-tight">
              Khám phá Đà Nẵng <br />
              theo cách riêng của bạn.
            </h1>
            <p className="text-primary-foreground/70 max-w-md leading-relaxed">
              Lên lịch trình khám phá Cầu Rồng, Bà Nà Hills, Sơn Trà và thưởng
              thức ẩm thực bản địa với sự hỗ trợ từ trí tuệ nhân tạo.
            </p>
          </div>

          <ul className="grid gap-3">
            {features.map(({ icon: Icon, title, desc }) => (
              <li
                key={title}
                className="border-primary-foreground/15 bg-primary-foreground/5 flex items-center gap-3 rounded-lg border p-3"
              >
                <div className="bg-primary-foreground/10 flex size-8 shrink-0 items-center justify-center rounded-md">
                  <Icon className="size-4" />
                </div>
                <div className="flex flex-col text-xs">
                  <span className="font-medium">{title}</span>
                  <span className="text-primary-foreground/60">{desc}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="border-primary-foreground/15 text-primary-foreground/60 border-t pt-4 text-xs italic leading-relaxed">
          &ldquo;Đà Nẵng &mdash; thành phố đáng sống với những bãi biển thơ mộng
          và sự nồng hậu của người dân miền Trung.&rdquo;
        </p>
      </div>

      {/* Phải: form */}
      <div className="bg-background flex min-h-svh flex-col items-center justify-center p-4 sm:p-8">
        <div className="mb-6 flex items-center gap-2 lg:hidden">
          <div className="bg-primary text-primary-foreground flex size-9 items-center justify-center rounded-lg">
            <Palmtree className="size-5" />
          </div>
          <span className="font-heading text-lg font-bold tracking-tight">
            Đà Nẵng Travel
          </span>
        </div>

        <div className="w-full max-w-md">
          <Outlet />
        </div>

        <p className="text-muted-foreground mt-8 text-center text-xs">
          © 2026 Trợ lý Du lịch Đà Nẵng. Bảo lưu mọi quyền.
        </p>
      </div>
    </div>
  );
}
