import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  activateItinerary,
  applyImpact,
  deleteItinerary,
  generateItinerary,
  impactsQueryOptions,
  itinerariesQueryOptions,
  placesQueryOptions,
  tripQueryOptions,
  updateTrip,
} from "@/api";
import type { CompanionInput, TripInput } from "@/api";
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
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { errorMessage, formatDate, formatDateTime, formatMoney, partyLabel } from "@/lib/display";

export const Route = createFileRoute("/_app/trips/$tripId")({
  component: TripPage,
});

const CATEGORY_CHECKLIST = [
  { value: "beach", label: "🏖️ Biển & Nghỉ dưỡng" },
  { value: "attraction", label: "📸 Danh thắng & Tham quan" },
  { value: "restaurant", label: "🍽️ Nhà hàng & Đặc sản F&B" },
  { value: "cafe", label: "☕ Cà phê & Nước uống" },
  { value: "activity", label: "🎡 Vui chơi & Giải trí" },
  { value: "market", label: "🛍️ Chợ đêm & Mua sắm" },
  { value: "museum", label: "🏛️ Bảo tàng & Nghệ thuật" },
  { value: "temple", label: "⛩️ Chùa & Tâm linh" },
];

function TripPage() {
  const { tripId } = Route.useParams();
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();

  const [mode, setMode] = useState<"auto" | "checklist">("auto");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([
    "beach",
    "attraction",
    "restaurant",
    "cafe",
  ]);
  const [selectedPlaceIds, setSelectedPlaceIds] = useState<string[]>([]);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [notes, setNotes] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<TripInput>({
    title: "",
    startDate: "",
    endDate: "",
    adults: 1,
    children: 0,
    notes: "",
    companions: [],
  });

  const calcTripDays = (startDate: string, endDate: string): number => {
    if (!startDate || !endDate) return 1;
    const s = new Date(`${startDate}T00:00:00Z`).getTime();
    const e = new Date(`${endDate}T00:00:00Z`).getTime();
    if (Number.isNaN(s) || Number.isNaN(e) || e < s) return 1;
    return Math.max(1, Math.min(30, Math.round((e - s) / 86_400_000) + 1));
  };

  const addDaysToIso = (startDate: string, daysCount: number): string => {
    const s = new Date(`${startDate}T00:00:00Z`);
    if (Number.isNaN(s.getTime())) return startDate;
    const target = new Date(s.getTime() + Math.max(0, daysCount - 1) * 86_400_000);
    return target.toISOString().slice(0, 10);
  };

  const trip = useQuery(tripQueryOptions(tripId));
  const itineraries = useQuery(itinerariesQueryOptions(tripId));
  const impacts = useQuery(impactsQueryOptions(tripId));
  const placesCatalog = useQuery(placesQueryOptions({ take: 60 }));

  const toggleCategory = (cat: string) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((item) => item !== cat) : [...prev, cat],
    );
  };

  const togglePlace = (placeId: string) => {
    setSelectedPlaceIds((prev) =>
      prev.includes(placeId) ? prev.filter((id) => id !== placeId) : [...prev, placeId],
    );
  };

  const detectLocation = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      () => {
        // Fallback vị trí trung tâm Cầu Rồng Đà Nẵng nếu trình duyệt chặn quyền GPS
        setUserLocation({ lat: 16.0611, lng: 108.2275 });
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  const generate = useMutation({
    mutationFn: () =>
      generateItinerary(tripId, {
        mode,
        categories: mode === "checklist" ? selectedCategories : undefined,
        preferredPlaceIds: mode === "checklist" ? selectedPlaceIds : undefined,
        userLatitude: userLocation?.lat ?? null,
        userLongitude: userLocation?.lng ?? null,
        notes,
      }),
    onSuccess: async (created) => {
      setNotes("");
      await queryClient.invalidateQueries({ queryKey: ["itineraries", tripId] });
      void navigate({
        to: "/itineraries/$itineraryId",
        params: { itineraryId: created.id },
      });
    },
  });

  const apply = useMutation({
    mutationFn: ({ itineraryId, impactId }: { itineraryId: string; impactId: string }) =>
      applyImpact(itineraryId, impactId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["impacts", tripId] });
      await queryClient.invalidateQueries({ queryKey: ["itineraries", tripId] });
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const activate = useMutation({
    mutationFn: activateItinerary,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["itineraries", tripId] });
    },
  });

  const removeItinerary = useMutation({
    mutationFn: deleteItinerary,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["itineraries", tripId] });
    },
  });

  const saveEditTrip = useMutation({
    mutationFn: (input: TripInput) => updateTrip(tripId, input),
    onSuccess: async () => {
      setEditOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["trips"] });
      await queryClient.invalidateQueries({ queryKey: ["trips", tripId] });
      await queryClient.invalidateQueries({ queryKey: ["itineraries", tripId] });
      await queryClient.invalidateQueries({ queryKey: ["itinerary"] });
      toast.add({ type: "success", title: "Đã cập nhật chuyến đi thành công" });
    },
  });

  if (trip.isPending) return <Skeleton className="h-48 w-full" />;
  if (trip.isError) {
    return <p className="text-destructive text-sm">{errorMessage(trip.error)}</p>;
  }

  const data = trip.data;
  const filteredPlacesForChecklist = (placesCatalog.data?.places ?? []).filter((place) =>
    selectedCategories.length === 0 ? true : selectedCategories.includes(place.category),
  );

  const currentTripDays = calcTripDays(
    data.startDate.slice(0, 10),
    data.endDate.slice(0, 10),
  );

  const openEditModal = () => {
    const comps: CompanionInput[] = (data.companions ?? []).map((c) => ({
      name: c.name ?? "",
      age: c.age !== null && c.age !== undefined ? String(c.age) : "",
      gender: c.gender ?? "",
      notes: c.notes ?? "",
    }));
    setEditForm({
      title: data.title ?? "",
      startDate: data.startDate.slice(0, 10),
      endDate: data.endDate.slice(0, 10),
      adults: data.adults,
      children: data.children,
      notes: data.notes ?? "",
      companions: comps,
    });
    setEditOpen(true);
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-medium">{data.title ?? "Chuyến đi chưa đặt tên"}</h1>
          <p className="text-muted-foreground text-sm">
            {formatDate(data.startDate)} - {formatDate(data.endDate)} ({currentTripDays} ngày) ·{" "}
            {partyLabel(data)}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={openEditModal}>
          ✏️ Sửa chuyến đi / Đổi số ngày
        </Button>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Sửa thông tin chuyến đi</DialogTitle>
            <DialogDescription>
              Bạn có thể nhập trực tiếp số ngày (ví dụ đổi từ 10 ngày thành 5 ngày) hoặc chọn lại ngày kết thúc.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="detail-trip-title">Tên chuyến đi *</Label>
              <Input
                id="detail-trip-title"
                value={editForm.title}
                onChange={(e) => setEditForm((p) => ({ ...p, title: e.target.value }))}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="grid gap-1.5">
                <Label htmlFor="detail-trip-start">Ngày bắt đầu</Label>
                <Input
                  id="detail-trip-start"
                  type="date"
                  value={editForm.startDate}
                  onChange={(e) => {
                    const nextStart = e.target.value;
                    const days = calcTripDays(editForm.startDate, editForm.endDate);
                    setEditForm((p) => ({
                      ...p,
                      startDate: nextStart,
                      endDate: addDaysToIso(nextStart, days),
                    }));
                  }}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="detail-trip-end">Ngày kết thúc</Label>
                <Input
                  id="detail-trip-end"
                  type="date"
                  value={editForm.endDate}
                  onChange={(e) => setEditForm((p) => ({ ...p, endDate: e.target.value }))}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="detail-trip-days">Số ngày đi (1–30)</Label>
                <Input
                  id="detail-trip-days"
                  type="number"
                  min={1}
                  max={30}
                  value={calcTripDays(editForm.startDate, editForm.endDate)}
                  onChange={(e) => {
                    const days = Math.max(1, Math.min(30, Number(e.target.value) || 1));
                    const baseStart =
                      editForm.startDate || new Date().toISOString().slice(0, 10);
                    setEditForm((p) => ({
                      ...p,
                      startDate: baseStart,
                      endDate: addDaysToIso(baseStart, days),
                    }));
                  }}
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="detail-trip-adults">Người lớn</Label>
                <Input
                  id="detail-trip-adults"
                  type="number"
                  min={1}
                  value={editForm.adults}
                  onChange={(e) =>
                    setEditForm((p) => ({ ...p, adults: Number(e.target.value) || 1 }))
                  }
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="detail-trip-children">Trẻ em</Label>
                <Input
                  id="detail-trip-children"
                  type="number"
                  min={0}
                  value={editForm.children}
                  onChange={(e) =>
                    setEditForm((p) => ({ ...p, children: Number(e.target.value) || 0 }))
                  }
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="detail-trip-notes">Ghi chú</Label>
              <Textarea
                id="detail-trip-notes"
                rows={2}
                value={editForm.notes}
                onChange={(e) => setEditForm((p) => ({ ...p, notes: e.target.value }))}
              />
            </div>
          </div>
          {saveEditTrip.error ? (
            <p className="text-destructive text-sm">{errorMessage(saveEditTrip.error)}</p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Huỷ
            </Button>
            <Button
              disabled={saveEditTrip.isPending}
              onClick={() => {
                if (editForm.title.trim() === "") {
                  toast.add({
                    type: "warning",
                    title: "Thiếu tên chuyến đi",
                    description: "Vui lòng nhập tên chuyến đi!",
                  });
                  return;
                }
                if (!editForm.startDate || !editForm.endDate || editForm.endDate < editForm.startDate) {
                  toast.add({
                    type: "warning",
                    title: "Ngày không hợp lệ",
                    description: "Ngày kết thúc phải bằng hoặc sau ngày bắt đầu!",
                  });
                  return;
                }
                saveEditTrip.mutate(editForm);
              }}
            >
              {saveEditTrip.isPending ? "Đang lưu..." : "Lưu thay đổi"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {data.companions.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Người đồng hành</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {data.companions.map((companion) => (
              <Badge key={companion.id} variant="secondary">
                {companion.name ?? "Không tên"}
                {companion.age ? ` · ${companion.age} tuổi` : ""}
              </Badge>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Tạo lịch trình thông minh với AI (2 Phương thức)</CardTitle>
          <CardDescription>
            Đảm bảo tối thiểu 3–4 địa điểm/ngày, tự động tính toán chi phí cho từng địa điểm và tổng chi phí theo ngày, ưu tiên Đối tác F&B đề xuất.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {/* Chọn 1 trong 2 phương thức tạo lịch trình */}
          <div className="grid gap-2.5 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setMode("auto")}
              className={`rounded-xl border p-3.5 text-left transition ${
                mode === "auto"
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-border hover:bg-muted/50"
              }`}
            >
              <div className="flex items-center justify-between font-medium">
                <span>✨ Option 2: Gợi ý tự động từ AI</span>
                {mode === "auto" ? <Badge>Đang chọn</Badge> : null}
              </div>
              <p className="text-muted-foreground mt-1 text-xs">
                AI tự động đề xuất toàn bộ lịch trình tối ưu dựa trên vị trí hiện tại, thời tiết, sự kiện và xu hướng tại Đà Nẵng.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setMode("checklist")}
              className={`rounded-xl border p-3.5 text-left transition ${
                mode === "checklist"
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-border hover:bg-muted/50"
              }`}
            >
              <div className="flex items-center justify-between font-medium">
                <span>☑️ Option 1: Tùy chọn theo danh mục (Checklist)</span>
                {mode === "checklist" ? <Badge>Đang chọn</Badge> : null}
              </div>
              <p className="text-muted-foreground mt-1 text-xs">
                Tích chọn danh mục tiêu chí và các địa điểm/nhà hàng ưa thích để hệ thống tự động xếp lịch trình và tính chi phí.
              </p>
            </button>
          </div>

          {mode === "checklist" ? (
            <div className="grid gap-3 rounded-xl border bg-muted/20 p-3.5">
              <div className="grid gap-1.5">
                <span className="text-sm font-medium">
                  1. Chọn danh mục trải nghiệm mong muốn ({selectedCategories.length} đã chọn):
                </span>
                <div className="flex flex-wrap gap-2">
                  {CATEGORY_CHECKLIST.map((cat) => {
                    const checked = selectedCategories.includes(cat.value);
                    return (
                      <label
                        key={cat.value}
                        className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                          checked
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background hover:bg-muted"
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={checked}
                          onChange={() => toggleCategory(cat.value)}
                        />
                        <span>{cat.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    2. Tích chọn địa điểm / quán F&B muốn đưa vào lịch trình ({selectedPlaceIds.length} địa điểm):
                  </span>
                  {selectedPlaceIds.length > 0 ? (
                    <button
                      type="button"
                      className="text-muted-foreground text-xs hover:underline"
                      onClick={() => setSelectedPlaceIds([])}
                    >
                      Bỏ chọn tất cả
                    </button>
                  ) : null}
                </div>
                <div className="grid max-h-48 gap-1.5 overflow-y-auto rounded-lg border bg-background p-2 sm:grid-cols-2">
                  {filteredPlacesForChecklist.map((place) => {
                    const checked = selectedPlaceIds.includes(place.id);
                    return (
                      <label
                        key={place.id}
                        className={`flex cursor-pointer items-start gap-2 rounded-md border p-2 text-xs transition ${
                          checked
                            ? "border-primary bg-primary/5"
                            : place.isSponsored
                              ? "border-amber-500/30 bg-amber-500/5"
                              : "border-transparent hover:bg-muted/60"
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={checked}
                          onChange={() => togglePlace(place.id)}
                        />
                        <div className="grid gap-0.5">
                          <span className="font-medium">
                            {place.isSponsored ? "⭐ " : ""}
                            {place.name}
                          </span>
                          <span className="text-muted-foreground">
                            {place.district ?? "Đà Nẵng"} ·{" "}
                            {place.estimatedCostVnd
                              ? `${formatMoney(place.estimatedCostVnd)}/người`
                              : "Miễn phí"}
                          </span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-muted/20 p-3 text-xs">
              <span className="text-muted-foreground">
                {userLocation
                  ? `📍 Đã gắn vị trí xuất phát của bạn: (${userLocation.lat.toFixed(4)}, ${userLocation.lng.toFixed(4)})`
                  : "💡 Bạn có thể đính kèm vị trí GPS hiện tại để AI ưu tiên điểm gần bạn trong ngày đầu."}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={locating}
                onClick={detectLocation}
              >
                {locating ? "Đang lấy GPS..." : "📍 Lấy vị trí hiện tại của tôi"}
              </Button>
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              placeholder="Ghi chú thêm (VD: ưu tiên hải sản, ít leo bộ, đi cùng người lớn tuổi...)"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
            <Button disabled={generate.isPending} onClick={() => generate.mutate()}>
              {generate.isPending
                ? "Đang tạo & tính chi phí..."
                : mode === "checklist"
                  ? "Tạo lịch trình theo Checklist"
                  : "✨ AI Tự động Tạo lịch trình"}
            </Button>
          </div>
          {generate.error ? (
            <p className="text-destructive text-sm">{errorMessage(generate.error)}</p>
          ) : null}

          {itineraries.isPending ? (
            <Skeleton className="h-24 w-full" />
          ) : itineraries.data && itineraries.data.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Phiên bản</TableHead>
                  <TableHead>Tiêu đề & Lý do</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead>Số hoạt động</TableHead>
                  <TableHead>Tổng chi phí dự kiến</TableHead>
                  <TableHead>Tạo lúc</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {itineraries.data.map((itinerary) => (
                  <TableRow key={itinerary.id}>
                    <TableCell>v{itinerary.version}</TableCell>
                    <TableCell>
                      <div className="font-medium">{itinerary.title ?? "—"}</div>
                      {itinerary.reason ? (
                        <div className="text-muted-foreground text-xs">{itinerary.reason}</div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {itinerary.status === "active" ? (
                        <Badge>Đang dùng</Badge>
                      ) : (
                        <Badge variant="outline">{itinerary.status}</Badge>
                      )}
                    </TableCell>
                    <TableCell>{itinerary._count?.items ?? 0} điểm</TableCell>
                    <TableCell className="font-medium text-emerald-600">
                      {formatMoney(itinerary.totalEstimatedCost)}
                    </TableCell>
                    <TableCell>{formatDateTime(itinerary.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      <span className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          render={
                            <Link
                              to="/itineraries/$itineraryId"
                              params={{ itineraryId: itinerary.id }}
                            />
                          }
                        >
                          Xem & Chỉnh sửa
                        </Button>
                        {itinerary.status === "active" ? null : (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={activate.isPending}
                              onClick={() => activate.mutate(itinerary.id)}
                            >
                              Đặt làm bản chính
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              disabled={removeItinerary.isPending}
                              onClick={() => {
                                if (window.confirm(`Xoá phiên bản v${itinerary.version}?`)) {
                                  removeItinerary.mutate(itinerary.id);
                                }
                              }}
                            >
                              Xoá
                            </Button>
                          </>
                        )}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-muted-foreground text-sm">Chưa có lịch trình nào.</p>
          )}
          {activate.error ? (
            <p className="text-destructive mt-3 text-sm">{errorMessage(activate.error)}</p>
          ) : null}
          {removeItinerary.error ? (
            <p className="text-destructive mt-3 text-sm">{errorMessage(removeItinerary.error)}</p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cảnh báo ảnh hưởng</CardTitle>
          <CardDescription>
            Sinh ra khi sự kiện trong lịch trình thay đổi hoặc bị huỷ sau khi đồng bộ.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {impacts.isPending ? (
            <Skeleton className="h-20 w-full" />
          ) : impacts.data && impacts.data.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sự kiện</TableHead>
                  <TableHead>Hoạt động</TableHead>
                  <TableHead>Mức độ</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {impacts.data.map((impact) => (
                  <TableRow key={impact.id}>
                    <TableCell>{impact.eventVersion.event.title}</TableCell>
                    <TableCell>{impact.itineraryItem?.title ?? "—"}</TableCell>
                    <TableCell>{impact.severity}</TableCell>
                    <TableCell>
                      {impact.isResolved ? (
                        <Badge variant="secondary">Đã xử lý</Badge>
                      ) : (
                        <Badge>Chưa xử lý</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {impact.isResolved ? null : (
                        <Button
                          size="sm"
                          disabled={apply.isPending}
                          onClick={() =>
                            apply.mutate({
                              itineraryId: impact.itineraryId,
                              impactId: impact.id,
                            })
                          }
                        >
                          Áp dụng đề xuất
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-muted-foreground text-sm">Không có cảnh báo nào.</p>
          )}
          {apply.error ? (
            <p className="text-destructive mt-3 text-sm">{errorMessage(apply.error)}</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
