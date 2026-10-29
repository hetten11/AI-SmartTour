import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  activateItinerary,
  addItineraryItem,
  eventsQueryOptions,
  getItineraryDiff,
  itineraryQueryOptions,
  placesQueryOptions,
  runWhatIf,
  tripQueryOptions,
  updateItineraryItem,
  weatherQueryOptions,
} from "@/api";
import type { ItineraryDiff, ItineraryItem } from "@/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage, formatDate, formatMoney } from "@/lib/display";
import { distanceKm, toCoordinates } from "@/lib/geo";
import type { Coordinates } from "@/lib/geo";
import { MapView } from "@/components/map-view";

export const Route = createFileRoute("/_app/itineraries/$itineraryId")({
  component: ItineraryPage,
});

const scenarios = [
  "Trời mưa cả ngày, đổi sang hoạt động trong nhà",
  "Không muốn nơi đông người",
  "Thêm sự kiện cuối tuần vào lịch",
  "Giảm di chuyển, gom hoạt động gần nhau",
];

const dateOfDay = (startDate: string, dayNumber: number) =>
  new Date(
    new Date(`${startDate}T00:00:00.000Z`).getTime() + (dayNumber - 1) * 24 * 60 * 60 * 1000,
  )
    .toISOString()
    .slice(0, 10);

function ItineraryPage() {
  const { itineraryId } = Route.useParams();
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const query = useQuery(itineraryQueryOptions(itineraryId));
  const [editing, setEditing] = useState<ItineraryItem | null>(null);
  const [draft, setDraft] = useState({ title: "", notes: "", dayNumber: "1", orderIndex: "0" });
  const [scenario, setScenario] = useState("");
  const [whatIfOpen, setWhatIfOpen] = useState(false);
  const [whatIfResult, setWhatIfResult] = useState<{
    itineraryId: string;
    diff: ItineraryDiff;
  } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ dayNumber: "1", title: "", eventId: "", placeId: "" });

  const tripId = query.data?.itinerary.tripId ?? "";
  const trip = useQuery({ ...tripQueryOptions(tripId), enabled: tripId !== "" });
  const weather = useQuery(weatherQueryOptions);
  // ponytail: select lấy 20 địa điểm active (/api/places) và 20 sự kiện sớm nhất
  // (/api/events), không lọc theo ngày chuyến đi và không phân trang. Thêm ô tìm
  // hoặc trang khi dữ liệu vượt 20.
  const placeOptions = useQuery(placesQueryOptions());
  const startDate = trip.data?.startDate.slice(0, 10) ?? "";
  const events = useQuery(eventsQueryOptions());

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["itinerary", itineraryId] });
    await queryClient.invalidateQueries({ queryKey: ["itineraries"] });
  };

  const update = useMutation({
    mutationFn: (item: ItineraryItem) =>
      updateItineraryItem(itineraryId, item.id, {
        title: draft.title,
        notes: draft.notes === "" ? null : draft.notes,
        dayNumber: Number(draft.dayNumber),
        orderIndex: Number(draft.orderIndex),
      }),
    onSuccess: async () => {
      setEditing(null);
      await refresh();
    },
  });

  const addItem = useMutation({
    mutationFn: () => {
      const knownPlaces = placeOptions.data?.places ?? [];
      const fallbackTitle =
        events.data?.events.find((event) => event.id === addForm.eventId)?.title ??
        knownPlaces.find((place) => place.id === addForm.placeId)?.name ??
        "Hoạt động mới";

      return addItineraryItem(itineraryId, {
        dayNumber: Number(addForm.dayNumber),
        title: addForm.title !== "" ? addForm.title : fallbackTitle,
        itemType: addForm.eventId !== "" ? "event" : "place",
        eventId: addForm.eventId === "" ? null : addForm.eventId,
        placeId: addForm.placeId === "" ? null : addForm.placeId,
      });
    },
    onSuccess: async (result) => {
      setAddOpen(false);
      setAddForm({ dayNumber: "1", title: "", eventId: "", placeId: "" });
      await refresh();
      // Mỗi lần đổi là một phiên bản mới, mở luôn bản vừa tạo.
      await navigate({
        to: "/itineraries/$itineraryId",
        params: { itineraryId: result.itinerary.id },
      });
    },
  });

  const whatIf = useMutation({
    mutationFn: () =>
      runWhatIf(tripId, {
        itineraryId,
        scenario,
        chatSessionId: query.data?.itinerary.chatSessionId ?? null,
      }),
    onSuccess: (result) =>
      setWhatIfResult({ itineraryId: result.itinerary.id, diff: result.diff }),
  });

  const activate = useMutation({ mutationFn: activateItinerary, onSuccess: refresh });

  const compare = useMutation({
    mutationFn: () => {
      const previous = query.data?.itinerary.parentItineraryId;
      if (!previous) throw new Error("Bản này là bản gốc, không có bản trước để so");
      return getItineraryDiff(previous, itineraryId);
    },
    onSuccess: (diff) => {
      // Kết quả diff hiện trong dialog what-if, phải mở dialog thì mới thấy.
      setScenario("");
      setWhatIfResult({ itineraryId, diff });
      setWhatIfOpen(true);
    },
  });

  if (query.isPending) return <Skeleton className="h-64 w-full" />;
  if (query.isError) {
    return <p className="text-destructive text-sm">{errorMessage(query.error)}</p>;
  }

  const { itinerary, places } = query.data;
  const placeNames = new Map(places.map((place) => [place.id, place.name]));
  const placeById = new Map(places.map((place) => [place.id, place]));
  const eventNames = new Map((query.data.events ?? []).map((event) => [event.id, event.title]));
  const days = [...new Set(itinerary.items.map((item) => item.dayNumber))].sort((a, b) => a - b);
  const weatherByDate = new Map((weather.data?.days ?? []).map((day) => [day.date, day]));

  const coordinatesOf = (item: ItineraryItem) => {
    const place = item.placeId ? placeById.get(item.placeId) : undefined;
    return place ? toCoordinates(place.latitude, place.longitude) : null;
  };

  // Khoảng cách chim bay giữa các hoạt động liên tiếp trong ngày, chỉ tính khi
  // hoạt động có gắn địa điểm có toạ độ.
  const dayDistance = (day: number) => {
    const points = itinerary.items
      .filter((item) => item.dayNumber === day)
      .map(coordinatesOf)
      .filter((value): value is Coordinates => value !== null);
    let total = 0;
    for (let index = 1; index < points.length; index += 1) {
      total += distanceKm(points[index - 1], points[index]);
    }
    return total;
  };

  const mapPoints = itinerary.items.flatMap((item) => {
    const coordinates = coordinatesOf(item);
    return coordinates
      ? [{ id: item.id, name: item.title, ...coordinates, note: `Ngày ${item.dayNumber}` }]
      : [];
  });

  const eventItems = [
    { value: "", label: "Không chọn" },
    ...(events.data?.events ?? []).map((event) => ({
      value: event.id,
      label: `${event.title} · ${formatDate(event.startAt)}`,
    })),
  ];

  const placeItems = [
    { value: "", label: "Không chọn" },
    ...(placeOptions.data?.places ?? []).map((place) => ({ value: place.id, label: place.name })),
  ];

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-medium">
            {itinerary.title ?? "Lịch trình"} · v{itinerary.version}
            {itinerary.status === "active" ? <Badge>Đang dùng</Badge> : null}
          </h1>
          <p className="text-muted-foreground text-sm">
            {itinerary.reason ?? "Không có ghi chú thay đổi."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            render={<Link to="/trips/$tripId" params={{ tripId: itinerary.tripId }} />}
          >
            Về chuyến đi
          </Button>
          {itinerary.status === "active" ? null : (
            <Button disabled={activate.isPending} onClick={() => activate.mutate(itineraryId)}>
              Đặt làm bản chính
            </Button>
          )}
          <Button variant="outline" onClick={() => setWhatIfOpen(true)}>
            Tình huống
          </Button>
          <Button variant="outline" onClick={() => setAddOpen(true)}>
            Thêm hoạt động
          </Button>
        </div>
      </div>

      {activate.error ? (
        <p className="text-destructive text-sm">{errorMessage(activate.error)}</p>
      ) : null}
      {compare.error ? (
        <p className="text-destructive text-sm">{errorMessage(compare.error)}</p>
      ) : null}

      {mapPoints.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Bản đồ lịch trình</CardTitle>
            <CardDescription>
              Bấm vào ghim để xem hoạt động. Khoảng cách là đường chim bay.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MapView points={mapPoints} height={340} />
          </CardContent>
        </Card>
      ) : null}

      {days.map((day) => {
        const forecast = startDate === "" ? undefined : weatherByDate.get(dateOfDay(startDate, day));
        return (
          <Card key={day}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                Ngày {day}
                {startDate ? (
                  <span className="text-muted-foreground text-sm font-normal">
                    {formatDate(`${dateOfDay(startDate, day)}T00:00:00.000Z`)}
                  </span>
                ) : null}
                {forecast ? (
                  <Badge variant={forecast.isRainy ? "destructive" : "secondary"}>
                    {forecast.description} · {forecast.minTemp}-{forecast.maxTemp}°C
                  </Badge>
                ) : null}
              </CardTitle>
              <CardDescription>
                {itinerary.items.filter((item) => item.dayNumber === day).length} hoạt động
                {dayDistance(day) > 0 ? ` · di chuyển ≈ ${dayDistance(day).toFixed(1)} km` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Hoạt động</TableHead>
                    <TableHead>Loại</TableHead>
                    <TableHead>Liên kết</TableHead>
                    <TableHead>Chi phí</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itinerary.items
                    .filter((item) => item.dayNumber === day)
                    .map((item, index) => (
                      <TableRow key={item.id}>
                        <TableCell>{index + 1}</TableCell>
                        <TableCell>
                          <div>{item.title}</div>
                          {item.notes ? (
                            <div className="text-muted-foreground text-xs">{item.notes}</div>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{item.itemType}</Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {item.placeId ? (placeNames.get(item.placeId) ?? "—") : null}
                          {item.eventId ? (eventNames.get(item.eventId) ?? "—") : null}
                          {!item.placeId && !item.eventId ? "—" : null}
                        </TableCell>
                        <TableCell>{formatMoney(item.estimatedCost)}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditing(item);
                              setDraft({
                                title: item.title,
                                notes: item.notes ?? "",
                                dayNumber: String(item.dayNumber),
                                orderIndex: String(item.orderIndex),
                              });
                            }}
                          >
                            Sửa
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        );
      })}

      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm">
          Tổng chi phí dự kiến: {formatMoney(itinerary.totalEstimatedCost)}
        </p>
        {itinerary.parentItineraryId ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={compare.isPending}
            onClick={() => compare.mutate()}
          >
            {compare.isPending ? "Đang so..." : "So sánh với bản trước"}
          </Button>
        ) : null}
      </div>

      <Dialog open={editing !== null} onOpenChange={(open) => (open ? null : setEditing(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sửa hoạt động</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="item-title">Tên hoạt động</Label>
              <Input
                id="item-title"
                value={draft.title}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="item-day">Ngày thứ</Label>
                <Input
                  id="item-day"
                  type="number"
                  min={1}
                  value={draft.dayNumber}
                  onChange={(event) => setDraft({ ...draft, dayNumber: event.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="item-order">Thứ tự</Label>
                <Input
                  id="item-order"
                  type="number"
                  min={0}
                  value={draft.orderIndex}
                  onChange={(event) => setDraft({ ...draft, orderIndex: event.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="item-notes">Ghi chú</Label>
              <Textarea
                id="item-notes"
                rows={3}
                value={draft.notes}
                onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
              />
            </div>
          </div>
          {update.error ? (
            <p className="text-destructive text-sm">{errorMessage(update.error)}</p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Huỷ
            </Button>
            <Button
              disabled={update.isPending || editing === null}
              onClick={() => editing && update.mutate(editing)}
            >
              {update.isPending ? "Đang lưu..." : "Lưu"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Thêm hoạt động</DialogTitle>
            <DialogDescription>Lưu thành phiên bản mới, không sửa bản đang xem.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="add-day">Ngày thứ</Label>
              <Input
                id="add-day"
                type="number"
                min={1}
                value={addForm.dayNumber}
                onChange={(event) => setAddForm({ ...addForm, dayNumber: event.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="add-event">Sự kiện trong chuyến đi</Label>
              <Select
                items={eventItems}
                value={addForm.eventId}
                onValueChange={(value) =>
                  setAddForm({ ...addForm, eventId: String(value), placeId: "" })
                }
              >
                <SelectTrigger id="add-event" className="w-full">
                  <SelectValue placeholder="Không chọn" />
                </SelectTrigger>
                <SelectContent>
                  {eventItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="add-place">Hoặc địa điểm</Label>
              <Select
                items={placeItems}
                value={addForm.placeId}
                onValueChange={(value) =>
                  setAddForm({ ...addForm, placeId: String(value), eventId: "" })
                }
              >
                <SelectTrigger id="add-place" className="w-full">
                  <SelectValue placeholder="Không chọn" />
                </SelectTrigger>
                <SelectContent>
                  {placeItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="add-title">Tên hoạt động (bỏ trống thì lấy tên sự kiện/địa điểm)</Label>
              <Input
                id="add-title"
                value={addForm.title}
                onChange={(event) => setAddForm({ ...addForm, title: event.target.value })}
              />
            </div>
          </div>
          {addItem.error ? (
            <p className="text-destructive text-sm">{errorMessage(addItem.error)}</p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Huỷ
            </Button>
            <Button disabled={addItem.isPending} onClick={() => addItem.mutate()}>
              {addItem.isPending ? "Đang lưu..." : "Lưu phiên bản mới"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={whatIfOpen}
        onOpenChange={(open) => {
          setWhatIfOpen(open);
          if (!open) {
            setWhatIfResult(null);
            setScenario("");
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>So sánh phiên bản lịch trình</DialogTitle>
            <DialogDescription>
              Chênh lệch so với bản trước, hoặc để AI sinh một phiên bản mới theo
              kịch bản. Bản mới chỉ thành bản chính khi bạn bấm Áp dụng.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            {whatIfResult ? null : (
              <>
                <div className="grid gap-1.5">
                  <Label htmlFor="scenario">Kịch bản</Label>
                  <Textarea
                    id="scenario"
                    rows={2}
                    value={scenario}
                    onChange={(event) => setScenario(event.target.value)}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {scenarios.map((preset) => (
                    <Button
                      key={preset}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setScenario(preset)}
                    >
                      {preset}
                    </Button>
                  ))}
                </div>
              </>
            )}

            {whatIfResult ? (
              <div className="grid gap-2 rounded-lg p-3 ring-1 ring-foreground/10">
                <p className="text-sm font-medium">
                  v{whatIfResult.diff.from.version} → v{whatIfResult.diff.to.version}
                  {whatIfResult.diff.costDelta !== 0
                    ? ` · chi phí ${whatIfResult.diff.costDelta > 0 ? "+" : ""}${formatMoney(whatIfResult.diff.costDelta)}`
                    : ""}
                </p>
                <p className="text-muted-foreground text-sm">{whatIfResult.diff.to.reason}</p>
                <div className="grid gap-1 text-sm">
                  {whatIfResult.diff.added.map((item) => (
                    <span key={item.id} className="text-emerald-600">
                      + Ngày {item.dayNumber}: {item.title}
                    </span>
                  ))}
                  {whatIfResult.diff.removed.map((item) => (
                    <span key={item.id} className="text-destructive">
                      − Ngày {item.dayNumber}: {item.title}
                    </span>
                  ))}
                  {whatIfResult.diff.added.length === 0 && whatIfResult.diff.removed.length === 0 ? (
                    <span className="text-muted-foreground">
                      Không có hoạt động nào thêm hoặc bớt.
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>

          {whatIf.error ? (
            <p className="text-destructive text-sm">{errorMessage(whatIf.error)}</p>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setWhatIfOpen(false)}>
              Đóng
            </Button>
            {whatIfResult && whatIfResult.itineraryId !== itineraryId ? (
              <Button
                disabled={activate.isPending}
                onClick={() => {
                  const target = whatIfResult.itineraryId;
                  activate.mutate(target);
                  setWhatIfOpen(false);
                  setWhatIfResult(null);
                  void navigate({
                    to: "/itineraries/$itineraryId",
                    params: { itineraryId: target },
                  });
                }}
              >
                Áp dụng
              </Button>
            ) : (
              <Button
                disabled={whatIf.isPending || scenario.trim().length < 3}
                onClick={() => whatIf.mutate()}
              >
                {whatIf.isPending ? "Đang sinh..." : "Sinh phiên bản mới"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
