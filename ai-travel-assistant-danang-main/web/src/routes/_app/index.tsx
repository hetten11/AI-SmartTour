import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  CalendarDays,
  CircleAlert,
  CloudRain,
  Compass,
  MapPin,
  Sparkles,
  Sun,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";
import {
  eventsQueryOptions,
  impactsQueryOptions,
  itineraryQueryOptions,
  profileQueryOptions,
  tripQueryOptions,
  tripsQueryOptions,
  weatherQueryOptions,
} from "@/api";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { errorMessage, formatDate, formatDateTime, formatMoney, partyLabel } from "@/lib/display";

export const Route = createFileRoute("/_app/")({
  component: DashboardPage,
});

// Ngày trong DB là ISO, chỉ cần phần ngày để so sánh và đếm.
const day = (value: string) => value.slice(0, 10);

const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

const dayGap = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

const countdown = (start: string, end: string, today: string) => {
  if (day(start) > today) return `Còn ${dayGap(today, day(start))} ngày`;
  if (day(end) >= today) return "Đang diễn ra";
  return "Đã kết thúc";
};

const progressPercent = (start: string, end: string, today: string) => {
  const total = dayGap(day(start), day(end)) + 1;
  const passed = dayGap(day(start), today) + 1;
  return Math.min(100, Math.max(0, Math.round((passed / total) * 100)));
};

const tempChart = {
  maxTemp: { label: "Cao nhất", color: "var(--chart-3)" },
  minTemp: { label: "Thấp nhất", color: "var(--chart-1)" },
} satisfies ChartConfig;

function DashboardPage() {
  const { user } = Route.useRouteContext();
  const today = new Date().toISOString().slice(0, 10);

  const trips = useQuery(tripsQueryOptions);
  const list = trips.data ?? [];
  // Ưu tiên chuyến gần nhất chưa kết thúc, không có thì lấy chuyến mới nhất.
  const focus =
    [...list]
      .sort((a, b) => day(a.startDate).localeCompare(day(b.startDate)))
      .find((trip) => day(trip.endDate) >= today) ?? list[0];

  const focusId = focus?.id ?? "";
  const trip = useQuery({ ...tripQueryOptions(focusId), enabled: focusId !== "" });
  const versions = trip.data?.itineraries ?? [];
  const active = versions.find((row) => row.status === "active") ?? versions[0];
  const activeId = active?.id ?? "";

  const itinerary = useQuery({ ...itineraryQueryOptions(activeId), enabled: activeId !== "" });
  const impacts = useQuery({ ...impactsQueryOptions(focusId), enabled: focusId !== "" });
  const weather = useQuery(weatherQueryOptions);
  const profile = useQuery(profileQueryOptions);
  const events = useQuery(eventsQueryOptions({ from: today, to: addDays(today, 14), page: 0 }));

  const openImpacts = (impacts.data ?? []).filter((impact) => !impact.isResolved);
  const current = weather.data?.current;
  const forecast = weather.data?.days ?? [];
  const upcoming = events.data?.events ?? [];
  const detail = itinerary.data?.itinerary;
  const itemDays = new Set((detail?.items ?? []).map((item) => item.dayNumber)).size;
  const travelStyle = profile.data?.travelStyle;
  const profileEmpty =
    !profile.data ||
    (!travelStyle && profile.data.interests.length === 0 && !profile.data.budgetMin);
  const tempData = forecast.map((row) => ({
    ngay: row.date.slice(5),
    maxTemp: row.maxTemp,
    minTemp: row.minTemp,
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-medium">Xin chào, {user.fullName ?? user.email}</h1>
          <p className="text-muted-foreground text-sm">
            Tổng quan chuyến đi, thời tiết và sự kiện tại Đà Nẵng.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button render={<Link to="/trips" />}>
            <CalendarDays data-icon="inline-start" />
            Tạo chuyến đi
          </Button>
          <Button
            variant="outline"
            render={<Link to="/assistant" search={{ session: undefined }} />}
          >
            <Sparkles data-icon="inline-start" />
            Hỏi trợ lý
          </Button>
        </div>
      </div>

      {trips.isError ? (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>Không tải được chuyến đi</AlertTitle>
          <AlertDescription>{errorMessage(trips.error)}</AlertDescription>
        </Alert>
      ) : null}

      {openImpacts.length > 0 ? (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>{openImpacts.length} cảnh báo lịch trình chưa xử lý</AlertTitle>
          <AlertDescription>
            {openImpacts[0]?.eventVersion.event.title} ·{" "}
            {openImpacts[0]?.description ?? "sự kiện trong lịch trình đã thay đổi"}
          </AlertDescription>
          <AlertAction>
            <Button
              variant="outline"
              size="xs"
              render={<Link to="/trips/$tripId" params={{ tripId: focusId }} />}
            >
              Xem chuyến đi
            </Button>
          </AlertAction>
        </Alert>
      ) : null}

      <Card>
        {trips.isPending ? (
          <CardContent>
            <Skeleton className="h-24 w-full" />
          </CardContent>
        ) : focus ? (
          <>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                {focus.title ?? "Chuyến đi"}
                {active ? (
                  <Badge variant={active.status === "active" ? "default" : "secondary"}>
                    v{active.version} · {active.status === "active" ? "đang dùng" : "bản nháp"}
                  </Badge>
                ) : (
                  <Badge variant="outline">chưa có lịch trình</Badge>
                )}
              </CardTitle>
              <CardDescription>
                {formatDate(focus.startDate)} – {formatDate(focus.endDate)} · {partyLabel(focus)}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {countdown(focus.startDate, focus.endDate, today)}
                </span>
                {detail ? (
                  <span className="font-medium">{formatMoney(detail.totalEstimatedCost)}</span>
                ) : null}
              </div>
              <Progress value={progressPercent(focus.startDate, focus.endDate, today)} />
              {detail ? (
                <p className="text-muted-foreground text-sm">
                  {detail.items.length} hoạt động trong {itemDays} ngày
                </p>
              ) : (
                <p className="text-muted-foreground text-sm">
                  Chuyến đi này chưa có lịch trình, mở chuyến đi để nhờ trợ lý lên kế hoạch.
                </p>
              )}
            </CardContent>
            <CardFooter>
              <Button
                variant="outline"
                render={<Link to="/trips/$tripId" params={{ tripId: focus.id }} />}
              >
                <Compass data-icon="inline-start" />
                Xem chuyến đi
              </Button>
            </CardFooter>
          </>
        ) : (
          <CardContent>
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Compass />
                </EmptyMedia>
                <EmptyTitle>Chưa có chuyến đi nào</EmptyTitle>
                <EmptyDescription>
                  Tạo chuyến đi để lưu ngày, số người và nhờ trợ lý lên lịch trình.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button render={<Link to="/trips" />}>
                  <CalendarDays data-icon="inline-start" />
                  Tạo chuyến đi
                </Button>
              </EmptyContent>
            </Empty>
          </CardContent>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {current?.isRainy ? <CloudRain /> : <Sun />}
              Thời tiết Đà Nẵng
            </CardTitle>
            <CardDescription>
              {current
                ? `${Math.round(current.temp)}°C · ${current.description}`
                : "Chưa lấy được thời tiết hiện tại."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {weather.isPending ? (
              <Skeleton className="h-32 w-full" />
            ) : weather.isError ? (
              <Alert variant="destructive">
                <CircleAlert />
                <AlertTitle>Không tải được thời tiết</AlertTitle>
                <AlertDescription>{errorMessage(weather.error)}</AlertDescription>
              </Alert>
            ) : tempData.length === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Sun />
                  </EmptyMedia>
                  <EmptyTitle>Chưa có dự báo</EmptyTitle>
                  <EmptyDescription>
                    Open-Meteo chưa trả về ngày nào trong 7 ngày tới.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="flex flex-col gap-4">
                <ChartContainer config={tempChart} className="aspect-auto h-40 w-full">
                  <AreaChart data={tempData} margin={{ left: 0, right: 8, top: 4 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="ngay" tickLine={false} axisLine={false} tickMargin={8} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Area
                      dataKey="maxTemp"
                      type="monotone"
                      stroke="var(--color-maxTemp)"
                      fill="var(--color-maxTemp)"
                      fillOpacity={0.3}
                    />
                    <Area
                      dataKey="minTemp"
                      type="monotone"
                      stroke="var(--color-minTemp)"
                      fill="var(--color-minTemp)"
                      fillOpacity={0.3}
                    />
                  </AreaChart>
                </ChartContainer>
                <ul className="flex flex-col gap-2">
                {forecast.map((row) => (
                  <li
                    key={row.date}
                    className="flex flex-wrap items-center justify-between gap-2 text-sm"
                  >
                    <span className="text-muted-foreground">{formatDate(row.date)}</span>
                    <span className="flex items-center gap-2">
                      {row.isRainy ? (
                        <Badge variant="destructive">{row.description}</Badge>
                      ) : (
                        <Badge variant="secondary">{row.description}</Badge>
                      )}
                      <span className="tabular-nums">
                        {row.minTemp}–{row.maxTemp}°C
                      </span>
                    </span>
                  </li>
                ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Hồ sơ du khách</CardTitle>
            <CardDescription>Trợ lý dùng hồ sơ này để gợi ý sát ý bạn hơn.</CardDescription>
          </CardHeader>
          <CardContent>
            {profile.isPending ? (
              <Skeleton className="h-16 w-full" />
            ) : profile.isError ? (
              <Alert variant="destructive">
                <CircleAlert />
                <AlertTitle>Không tải được hồ sơ</AlertTitle>
                <AlertDescription>{errorMessage(profile.error)}</AlertDescription>
              </Alert>
            ) : profileEmpty ? (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <UserRound />
                  </EmptyMedia>
                  <EmptyTitle>Hồ sơ còn trống</EmptyTitle>
                  <EmptyDescription>
                    Thêm sở thích, phong cách và ngân sách để trợ lý gợi ý sát ý bạn hơn.
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button variant="outline" render={<Link to="/profile" />}>
                    Cập nhật hồ sơ
                  </Button>
                </EmptyContent>
              </Empty>
            ) : profile.data ? (
              <div className="flex flex-wrap gap-2">
                {travelStyle ? <Badge variant="outline">{travelStyle}</Badge> : null}
                {profile.data.interests.map((interest) => (
                  <Badge key={interest} variant="secondary">
                    {interest}
                  </Badge>
                ))}
                {profile.data.budgetMin ? (
                  <Badge variant="outline">
                    {formatMoney(profile.data.budgetMin)} – {formatMoney(profile.data.budgetMax)}
                  </Badge>
                ) : null}
              </div>
            ) : null}
          </CardContent>
          <CardFooter>
            <Button variant="outline" render={<Link to="/profile" />}>
              Cập nhật hồ sơ
            </Button>
          </CardFooter>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin />
            Sự kiện 14 ngày tới
          </CardTitle>
          <CardDescription>
            {upcoming.length > 0
              ? `${events.data?.total ?? upcoming.length} sự kiện đang diễn ra tại Đà Nẵng.`
              : "Sự kiện lấy từ nguồn dữ liệu đã đồng bộ."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {events.isPending ? (
            <Skeleton className="h-32 w-full" />
          ) : events.isError ? (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertTitle>Không tải được sự kiện</AlertTitle>
              <AlertDescription>{errorMessage(events.error)}</AlertDescription>
            </Alert>
          ) : upcoming.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <CalendarDays />
                </EmptyMedia>
                <EmptyTitle>Chưa có sự kiện nào</EmptyTitle>
                <EmptyDescription>
                  Không có sự kiện nào trong 14 ngày tới. Dữ liệu cập nhật theo lịch đồng bộ của
                  nguồn.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button variant="outline" render={<Link to="/events" />}>
                  Xem toàn bộ sự kiện
                </Button>
              </EmptyContent>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sự kiện</TableHead>
                  <TableHead>Địa điểm</TableHead>
                  <TableHead>Bắt đầu</TableHead>
                  <TableHead>Giá</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {upcoming.slice(0, 5).map((event) => (
                  <TableRow key={event.id}>
                    <TableCell className="max-w-72 whitespace-normal">
                      <Link
                        to="/events/$eventId"
                        params={{ eventId: event.id }}
                        className="font-medium hover:underline"
                      >
                        {event.title}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{event.venue ?? "—"}</TableCell>
                    <TableCell>{formatDateTime(event.startAt)}</TableCell>
                    <TableCell>
                      {event.isFree ? (
                        <Badge variant="secondary">Miễn phí</Badge>
                      ) : (
                        formatMoney(event.priceMin)
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
        <CardFooter>
          <Button variant="ghost" size="sm" render={<Link to="/events" />}>
            Xem tất cả sự kiện
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
