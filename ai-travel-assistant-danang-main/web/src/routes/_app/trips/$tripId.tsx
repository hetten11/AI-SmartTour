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
} from "@/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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

  if (trip.isPending) return <Skeleton className="h-48 w-full" />;
  if (trip.isError) {
    return <p className="text-destructive text-sm">{errorMessage(trip.error)}</p>;
  }

  const data = trip.data;
  const filteredPlacesForChecklist = (placesCatalog.data?.places ?? []).filter((place) =>
    selectedCategories.length === 0 ? true : selectedCategories.includes(place.category),
  );

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-xl font-medium">{data.title ?? "Chuyến đi chưa đặt tên"}</h1>
        <p className="text-muted-foreground text-sm">
          {formatDate(data.startDate)} - {formatDate(data.endDate)} · {partyLabel(data)}
        </p>
      </div>

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
