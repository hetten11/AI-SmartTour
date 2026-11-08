import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  activateItinerary,
  addItineraryItem,
  deleteItineraryItem,
  estimateItineraryCosts,
  eventsQueryOptions,
  getItineraryDiff,
  itineraryQueryOptions,
  moveItineraryItem,
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
import { toast } from "@/components/ui/toast";
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

const formatTimeSlot = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
};

function ItineraryPage() {
  const { itineraryId } = Route.useParams();
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const query = useQuery(itineraryQueryOptions(itineraryId));

  const [editing, setEditing] = useState<ItineraryItem | null>(null);
  const [selectedMapDay, setSelectedMapDay] = useState<number | null>(null);
  const [draft, setDraft] = useState({
    title: "",
    notes: "",
    dayNumber: "1",
    orderIndex: "0",
    estimatedCost: "0",
    itemType: "place",
  });
  const [scenario, setScenario] = useState("");
  const [whatIfOpen, setWhatIfOpen] = useState(false);
  const [whatIfResult, setWhatIfResult] = useState<{
    itineraryId: string;
    diff: ItineraryDiff;
  } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    dayNumber: "1",
    title: "",
    eventId: "",
    placeId: "",
    estimatedCost: "",
    notes: "",
    inPlace: true,
  });

  const tripId = query.data?.itinerary.tripId ?? "";
  const trip = useQuery({ ...tripQueryOptions(tripId), enabled: tripId !== "" });
  const weather = useQuery(weatherQueryOptions);
  const placeOptions = useQuery(placesQueryOptions({ take: 60 }));
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
        itemType: draft.itemType,
        estimatedCost: draft.estimatedCost === "" ? 0 : Number(draft.estimatedCost),
      }),
    onSuccess: async () => {
      setEditing(null);
      await refresh();
      toast.add({ type: "success", title: "Đã cập nhật hoạt động & chi phí" });
    },
  });

  const removeItem = useMutation({
    mutationFn: (itemId: string) => deleteItineraryItem(itineraryId, itemId),
    onSuccess: async () => {
      await refresh();
      toast.add({ type: "success", title: "Đã xoá địa điểm khỏi lịch trình" });
    },
    onError: (err) =>
      toast.add({
        type: "error",
        title: "Không xoá được hoạt động",
        description: errorMessage(err),
      }),
  });

  const moveItem = useMutation({
    mutationFn: ({ itemId, direction }: { itemId: string; direction: "up" | "down" }) =>
      moveItineraryItem(itineraryId, itemId, direction),
    onSuccess: refresh,
  });

  const recalculateCosts = useMutation({
    mutationFn: () => estimateItineraryCosts(itineraryId),
    onSuccess: async () => {
      await refresh();
      toast.add({
        type: "success",
        title: "AI đã tự động tính toán chi phí cho từng địa điểm và từng ngày!",
      });
    },
  });

  const addItem = useMutation({
    mutationFn: () => {
      const knownPlaces = placeOptions.data?.places ?? [];
      const pickedPlace = knownPlaces.find((place) => place.id === addForm.placeId);
      const pickedEvent = events.data?.events.find((event) => event.id === addForm.eventId);
      const fallbackTitle =
        pickedEvent?.title ?? pickedPlace?.name ?? "Hoạt động mới";

      return addItineraryItem(itineraryId, {
        dayNumber: Number(addForm.dayNumber),
        title: addForm.title.trim() !== "" ? addForm.title.trim() : fallbackTitle,
        itemType:
          addForm.eventId !== ""
            ? "event"
            : pickedPlace?.category === "restaurant" || pickedPlace?.category === "cafe"
              ? "restaurant"
              : "place",
        eventId: addForm.eventId === "" ? null : addForm.eventId,
        placeId: addForm.placeId === "" ? null : addForm.placeId,
        estimatedCost: addForm.estimatedCost.trim() === "" ? null : Number(addForm.estimatedCost),
        notes: addForm.notes.trim() || null,
        inPlace: addForm.inPlace,
      });
    },
    onSuccess: async (result) => {
      setAddOpen(false);
      setAddForm({
        dayNumber: "1",
        title: "",
        eventId: "",
        placeId: "",
        estimatedCost: "",
        notes: "",
        inPlace: true,
      });
      await refresh();
      toast.add({ type: "success", title: "Đã thêm địa điểm vào lịch trình" });
      if (result.itinerary.id !== itineraryId) {
        await navigate({
          to: "/itineraries/$itineraryId",
          params: { itineraryId: result.itinerary.id },
        });
      }
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
  const eventById = new Map((query.data.events ?? []).map((event) => [event.id, event]));
  const days = [...new Set(itinerary.items.map((item) => item.dayNumber))].sort((a, b) => a - b);
  const weatherByDate = new Map((weather.data?.days ?? []).map((day) => [day.date, day]));

  const coordinatesOf = (item: ItineraryItem) => {
    if (item.placeId) {
      const place = placeById.get(item.placeId);
      if (place) return toCoordinates(place.latitude, place.longitude);
    }
    if (item.eventId) {
      const ev = eventById.get(item.eventId);
      if (ev) return toCoordinates(ev.latitude ?? null, ev.longitude ?? null);
    }
    return null;
  };

  const dayDistance = (day: number) => {
    const points = itinerary.items
      .filter((item) => item.dayNumber === day)
      .map(coordinatesOf)
      .filter((value): value is Coordinates => value !== null);
    let total = 0;
    for (let index = 1; index < points.length; index += 1) {
      total += distanceKm(points[index - 1]!, points[index]!);
    }
    return total;
  };

  // Tổng chi phí dự kiến cho từng ngày
  const dayTotalCost = (day: number) =>
    itinerary.items
      .filter((item) => item.dayNumber === day)
      .reduce((sum, item) => sum + Number(item.estimatedCost ?? 0), 0);

  const mapPoints = itinerary.items
    .filter((item) => (selectedMapDay === null ? true : item.dayNumber === selectedMapDay))
    .flatMap((item, idx) => {
      const coordinates = coordinatesOf(item);
      const linkedPlace = item.placeId ? placeById.get(item.placeId) : undefined;
      return coordinates
        ? [
            {
              id: item.id,
              name: item.title,
              ...coordinates,
              orderNumber: idx + 1,
              dayNumber: item.dayNumber,
              isSponsored: linkedPlace?.isSponsored,
              note: `Ngày ${item.dayNumber} · ${formatMoney(item.estimatedCost)}`,
            },
          ]
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
    ...(placeOptions.data?.places ?? []).map((place) => ({
      value: place.id,
      label: `${place.isSponsored ? "⭐ " : ""}${place.name}${place.estimatedCostVnd ? ` (${formatMoney(place.estimatedCostVnd)})` : ""}`,
    })),
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
          <Button
            variant="outline"
            disabled={recalculateCosts.isPending}
            onClick={() => recalculateCosts.mutate()}
          >
            {recalculateCosts.isPending ? "Đang tính..." : "💰 AI Tính toán chi phí"}
          </Button>
          <Button variant="outline" onClick={() => setWhatIfOpen(true)}>
            Tình huống (What-If)
          </Button>
          <Button onClick={() => setAddOpen(true)}>+ Thêm địa điểm</Button>
          {itinerary.status === "active" ? null : (
            <Button disabled={activate.isPending} onClick={() => activate.mutate(itineraryId)}>
              Đặt làm bản chính
            </Button>
          )}
        </div>
      </div>

      {activate.error ? (
        <p className="text-destructive text-sm">{errorMessage(activate.error)}</p>
      ) : null}
      {compare.error ? (
        <p className="text-destructive text-sm">{errorMessage(compare.error)}</p>
      ) : null}

      {/* Tổng quan ngân sách theo từng ngày */}
      <Card className="border-emerald-500/30 bg-emerald-500/5">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div>
            <div className="text-xs font-medium uppercase text-emerald-700 dark:text-emerald-300">
              Dự toán tổng chi phí toàn chuyến đi ({days.length} ngày · {itinerary.items.length} điểm)
            </div>
            <div className="text-xl font-bold text-emerald-700 dark:text-emerald-400">
              {formatMoney(itinerary.totalEstimatedCost)}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {days.map((d) => (
              <Badge key={d} variant="secondary" className="px-2.5 py-1 text-xs">
                Ngày {d}: {formatMoney(dayTotalCost(d))}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Bản đồ Lộ trình Đường bộ & Định vị Thời gian thực</CardTitle>
              <CardDescription>
                Nối các điểm theo tuyến đường giao thông thực tế (OSRM) thay vì đường chim bay. Bấm chọn từng ngày để xem lộ trình di chuyển chi tiết của ngày đó.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button
                type="button"
                size="sm"
                variant={selectedMapDay === null ? "default" : "outline"}
                onClick={() => setSelectedMapDay(null)}
              >
                Tất cả ({days.length} ngày)
              </Button>
              {days.map((d) => (
                <Button
                  key={d}
                  type="button"
                  size="sm"
                  variant={selectedMapDay === d ? "default" : "outline"}
                  onClick={() => setSelectedMapDay(d)}
                >
                  Ngày {d}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <MapView points={mapPoints} showRoute={true} numbered={true} height={360} />
        </CardContent>
      </Card>

      {days.map((day) => {
        const forecast = startDate === "" ? undefined : weatherByDate.get(dateOfDay(startDate, day));
        const dayItems = itinerary.items.filter((item) => item.dayNumber === day);
        const dayCost = dayTotalCost(day);

        return (
          <Card key={day}>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="flex flex-wrap items-center gap-2">
                  <span>Ngày {day}</span>
                  {startDate ? (
                    <span className="text-muted-foreground text-sm font-normal">
                      ({formatDate(`${dateOfDay(startDate, day)}T00:00:00.000Z`)})
                    </span>
                  ) : null}
                  {forecast ? (
                    <Badge variant={forecast.isRainy ? "destructive" : "secondary"}>
                      {forecast.description} · {forecast.minTemp}-{forecast.maxTemp}°C
                    </Badge>
                  ) : null}
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Badge className="bg-emerald-600 text-white hover:bg-emerald-700">
                    💰 Tổng chi phí Ngày {day}: {formatMoney(dayCost)}
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setAddForm((prev) => ({ ...prev, dayNumber: String(day) }));
                      setAddOpen(true);
                    }}
                  >
                    + Thêm vào Ngày {day}
                  </Button>
                </div>
              </div>
              <CardDescription>
                {dayItems.length} hoạt động (đảm bảo tối thiểu 3 điểm/ngày)
                {dayDistance(day) > 0 ? ` · tổng quãng đường di chuyển ≈ ${dayDistance(day).toFixed(1)} km` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">Thứ tự</TableHead>
                    <TableHead>Khung giờ</TableHead>
                    <TableHead>Địa điểm / Hoạt động</TableHead>
                    <TableHead>Loại</TableHead>
                    <TableHead>Liên kết hệ thống</TableHead>
                    <TableHead>Chi phí dự kiến</TableHead>
                    <TableHead className="text-right">Tùy chỉnh</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dayItems.map((item, index) => {
                    const linkedPlace = item.placeId ? placeById.get(item.placeId) : undefined;
                    const startLabel = formatTimeSlot(item.startTime);
                    const endLabel = formatTimeSlot(item.endTime);
                    return (
                      <TableRow
                        key={item.id}
                        className={linkedPlace?.isSponsored ? "bg-amber-500/5" : undefined}
                      >
                        <TableCell className="font-medium">#{index + 1}</TableCell>
                        <TableCell className="text-muted-foreground whitespace-nowrap text-xs">
                          {startLabel ? `${startLabel}${endLabel ? ` - ${endLabel}` : ""}` : "Linh hoạt"}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1.5 font-medium">
                            <span>{item.title}</span>
                            {linkedPlace?.isSponsored ? (
                              <Badge className="bg-amber-500 text-white">⭐ Đối tác F&B</Badge>
                            ) : null}
                          </div>
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
                          {!item.placeId && !item.eventId ? "Tự nhập" : null}
                        </TableCell>
                        <TableCell className="font-medium">
                          {Number(item.estimatedCost ?? 0) === 0 ? (
                            <Badge variant="secondary">Miễn phí</Badge>
                          ) : (
                            formatMoney(item.estimatedCost)
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="inline-flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={index === 0 || moveItem.isPending}
                              title="Đẩy lên trước"
                              onClick={() =>
                                moveItem.mutate({ itemId: item.id, direction: "up" })
                              }
                            >
                              ↑
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={index === dayItems.length - 1 || moveItem.isPending}
                              title="Đẩy xuống sau"
                              onClick={() =>
                                moveItem.mutate({ itemId: item.id, direction: "down" })
                              }
                            >
                              ↓
                            </Button>
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
                                  estimatedCost: String(Number(item.estimatedCost ?? 0)),
                                  itemType: item.itemType,
                                });
                              }}
                            >
                              Sửa
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              disabled={removeItem.isPending}
                              onClick={() => removeItem.mutate(item.id)}
                            >
                              Xoá
                            </Button>
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        );
      })}

      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm font-medium">
          Tổng chi phí dự kiến toàn lịch trình: {formatMoney(itinerary.totalEstimatedCost)}
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

      {/* Dialog Sửa hoạt động */}
      <Dialog open={editing !== null} onOpenChange={(open) => (open ? null : setEditing(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Chỉnh sửa hoạt động & Chi phí</DialogTitle>
            <DialogDescription>
              Đổi tên, ngày, thứ tự hoặc điều chỉnh chi phí dự kiến của địa điểm.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="item-title">Tên hoạt động / Địa điểm</Label>
              <Input
                id="item-title"
                value={draft.title}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
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
                <Label htmlFor="item-order">Thứ tự (0, 1, 2...)</Label>
                <Input
                  id="item-order"
                  type="number"
                  min={0}
                  value={draft.orderIndex}
                  onChange={(event) => setDraft({ ...draft, orderIndex: event.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="item-cost">Chi phí (VNĐ)</Label>
                <Input
                  id="item-cost"
                  type="number"
                  min={0}
                  step={10000}
                  value={draft.estimatedCost}
                  onChange={(event) => setDraft({ ...draft, estimatedCost: event.target.value })}
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
              {update.isPending ? "Đang lưu..." : "Lưu thay đổi"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Thêm địa điểm / hoạt động */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Thêm địa điểm / hoạt động vào lịch trình</DialogTitle>
            <DialogDescription>
              Chọn từ danh sách địa điểm/sự kiện hệ thống hoặc tự nhập tên. Nếu để trống chi phí, AI sẽ tự động ước tính giá tiền phù hợp.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
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
                <Label htmlFor="add-cost">Chi phí dự kiến (VNĐ)</Label>
                <Input
                  id="add-cost"
                  type="number"
                  min={0}
                  step={10000}
                  placeholder="Để trống = AI tự tính"
                  value={addForm.estimatedCost}
                  onChange={(event) =>
                    setAddForm({ ...addForm, estimatedCost: event.target.value })
                  }
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="add-place">Chọn địa điểm / Đối tác F&B</Label>
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
              <Label htmlFor="add-event">Hoặc chọn sự kiện trong chuyến đi</Label>
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
              <Label htmlFor="add-title">
                Tên hoạt động (bỏ trống sẽ lấy theo tên địa điểm/sự kiện)
              </Label>
              <Input
                id="add-title"
                placeholder="VD: Thưởng thức hải sản biển Mỹ Khê..."
                value={addForm.title}
                onChange={(event) => setAddForm({ ...addForm, title: event.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="add-notes">Ghi chú</Label>
              <Input
                id="add-notes"
                placeholder="Ghi chú giờ giấc, món ăn..."
                value={addForm.notes}
                onChange={(event) => setAddForm({ ...addForm, notes: event.target.value })}
              />
            </div>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={addForm.inPlace}
                onChange={(e) => setAddForm({ ...addForm, inPlace: e.target.checked })}
              />
              <span>Thêm trực tiếp vào phiên bản lịch trình hiện tại (bỏ tích để tạo phiên bản mới)</span>
            </label>
          </div>
          {addItem.error ? (
            <p className="text-destructive text-sm">{errorMessage(addItem.error)}</p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Huỷ
            </Button>
            <Button disabled={addItem.isPending} onClick={() => addItem.mutate()}>
              {addItem.isPending ? "Đang thêm..." : "Thêm vào lịch trình"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog What-if */}
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
            <DialogTitle>Giả lập Tình huống & So sánh Phiên bản</DialogTitle>
            <DialogDescription>
              Để AI điều chỉnh lịch trình theo tình huống (vẫn đảm bảo tối thiểu 3-4 điểm/ngày và tính lại chi phí).
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            {whatIfResult ? null : (
              <>
                <div className="grid gap-1.5">
                  <Label htmlFor="scenario">Kịch bản thay đổi</Label>
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
                      + Ngày {item.dayNumber}: {item.title} ({formatMoney(item.estimatedCost)})
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
