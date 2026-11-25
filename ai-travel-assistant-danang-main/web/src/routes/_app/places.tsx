import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  createPlace,
  deletePlace,
  districtsQueryOptions,
  meQueryOptions,
  placesQueryOptions,
  updatePlace,
} from "@/api";
import type { Place, PlaceInput } from "@/api";
import { MapView } from "@/components/map-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { errorMessage, formatMoney } from "@/lib/display";
import { toCoordinates } from "@/lib/geo";
import type { Coordinates } from "@/lib/geo";

export const Route = createFileRoute("/_app/places")({
  component: PlacesPage,
});

const priceLabels = ["Miễn phí", "Rẻ", "Vừa phải", "Cao cấp"];

const categories = [
  { value: "", label: "Tất cả danh mục" },
  { value: "restaurant", label: "🍽️ Nhà hàng & Ẩm thực (F&B)" },
  { value: "cafe", label: "☕ Cà phê & Nước uống (F&B)" },
  { value: "beach", label: "🏖️ Biển" },
  { value: "attraction", label: "📸 Tham quan" },
  { value: "activity", label: "🎡 Giải trí & Hoạt động" },
  { value: "market", label: "🛍️ Chợ & Mua sắm" },
  { value: "museum", label: "🏛️ Bảo tàng" },
  { value: "temple", label: "⛩️ Chùa & Tâm linh" },
];

const categoryOptions = categories.filter((item) => item.value !== "");

type PlaceForm = {
  id: string | null;
  name: string;
  category: string;
  district: string;
  address: string;
  description: string;
  priceLevel: string;
  estimatedCostVnd: string;
  avgRating: string;
  tags: string;
  coordinates: Coordinates | null;
  isSponsored: boolean;
  sponsorTier: string;
  sponsorPriority: string;
  partnerName: string;
  partnerContact: string;
};

const emptyPlace: PlaceForm = {
  id: null,
  name: "",
  category: "restaurant",
  district: "Hải Châu",
  address: "",
  description: "",
  priceLevel: "2",
  estimatedCostVnd: "150000",
  avgRating: "4.7",
  tags: "",
  coordinates: null,
  isSponsored: false,
  sponsorTier: "gold",
  sponsorPriority: "5",
  partnerName: "",
  partnerContact: "",
};

const asList = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "");

const nullableNumber = (value: string) => (value.trim() === "" ? null : Number(value));

const tierLabel: Record<string, string> = {
  gold: "Đối tác Vàng",
  silver: "Đối tác Bạc",
  bronze: "Đối tác Đồng",
};

function PlacesPage() {
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [district, setDistrict] = useState("");
  const [category, setCategory] = useState("");
  const [sponsoredOnly, setSponsoredOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [form, setForm] = useState<PlaceForm | null>(null);

  const districts = useQuery(districtsQueryOptions);
  const query = useQuery(
    placesQueryOptions({
      q,
      district,
      category,
      sponsored: sponsoredOnly ? true : undefined,
      page,
    }),
  );
  const me = useQuery(meQueryOptions);
  const isAdmin = me.data?.role === "admin";

  const totalPages = query.data ? Math.max(1, Math.ceil(query.data.total / query.data.pageSize)) : 1;

  const save = useMutation({
    mutationFn: (input: PlaceForm) => {
      const payload: PlaceInput = {
        name: input.name.trim(),
        category: input.category,
        district: input.district.trim() || null,
        address: input.address.trim() || null,
        description: input.description.trim() || null,
        priceLevel: nullableNumber(input.priceLevel),
        estimatedCostVnd: nullableNumber(input.estimatedCostVnd),
        avgRating: nullableNumber(input.avgRating),
        tags: asList(input.tags),
        latitude: input.coordinates?.latitude ?? null,
        longitude: input.coordinates?.longitude ?? null,
        isSponsored: input.isSponsored,
        sponsorTier: input.isSponsored ? input.sponsorTier || "gold" : null,
        sponsorPriority: input.isSponsored ? Number(input.sponsorPriority) || 5 : 0,
        partnerName: input.isSponsored ? input.partnerName.trim() || null : null,
        partnerContact: input.isSponsored ? input.partnerContact.trim() || null : null,
      };
      return input.id === null ? createPlace(payload) : updatePlace(input.id, payload);
    },
    onSuccess: async () => {
      setForm(null);
      await queryClient.invalidateQueries({ queryKey: ["places"] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
      toast.add({ type: "success", title: "Đã lưu thông tin địa điểm & đối tác" });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => deletePlace(id),
    onSuccess: async () => {
      setForm(null);
      await queryClient.invalidateQueries({ queryKey: ["places"] });
      toast.add({ type: "success", title: "Đã xoá địa điểm" });
    },
    onError: (error) =>
      toast.add({ type: "error", title: "Xoá địa điểm thất bại", description: errorMessage(error) }),
  });

  const confirmDelete = (id: string, name: string) =>
    toast.add({
      type: "warning",
      title: "Xoá địa điểm?",
      description: `${name} — không hoàn tác được.`,
      actionProps: { children: "Xóa", onClick: () => remove.mutate(id) },
    });

  const openEdit = (place: Place) =>
    setForm({
      id: place.id,
      name: place.name,
      category: place.category,
      district: place.district ?? "",
      address: place.address ?? "",
      description: place.description ?? "",
      priceLevel: place.priceLevel === null ? "" : String(place.priceLevel),
      estimatedCostVnd:
        place.estimatedCostVnd === null || place.estimatedCostVnd === undefined
          ? ""
          : String(place.estimatedCostVnd),
      avgRating: place.avgRating === null ? "" : String(place.avgRating),
      tags: place.tags.join(", "),
      coordinates: toCoordinates(place.latitude, place.longitude),
      isSponsored: Boolean(place.isSponsored),
      sponsorTier: place.sponsorTier ?? "gold",
      sponsorPriority: String(place.sponsorPriority ?? 5),
      partnerName: place.partnerName ?? "",
      partnerContact: place.partnerContact ?? "",
    });

  const pins = (query.data?.places ?? []).flatMap((place) => {
    const coordinates = toCoordinates(place.latitude, place.longitude);
    return coordinates
      ? [
          {
            id: place.id,
            name: place.name,
            ...coordinates,
            isSponsored: place.isSponsored,
            note: `${place.category}${place.estimatedCostVnd ? ` · ≈ ${formatMoney(place.estimatedCostVnd)}` : ""}`,
          },
        ]
      : [];
  });

  const districtItems = [
    { value: "", label: "Không chọn" },
    ...(districts.data ?? []).map((item) => ({ value: item, label: item })),
  ];

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-medium">Địa điểm & Đối tác F&B Đà Nẵng</h1>
          <p className="text-muted-foreground text-sm">
            Định vị thời gian thực, dữ liệu cào tự động và ưu tiên hiển thị Đối tác F&B (Sponsored).
          </p>
        </div>
        {isAdmin ? (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() =>
                setForm({
                  ...emptyPlace,
                  category: "restaurant",
                  isSponsored: true,
                })
              }
            >
              ⭐ Thêm Đối tác F&B
            </Button>
            <Button onClick={() => setForm({ ...emptyPlace })}>+ Thêm địa điểm</Button>
          </div>
        ) : null}
      </div>

      <Card>
        <CardContent className="grid gap-3">
          <div className="grid gap-2 sm:grid-cols-4">
            <Input
              placeholder="Tìm theo tên, món ăn, mô tả, địa chỉ..."
              value={q}
              onChange={(event) => {
                setQ(event.target.value);
                setPage(0);
              }}
            />
            <select
              className="border-input h-8 rounded-lg border bg-transparent px-2 text-sm"
              value={district}
              onChange={(event) => {
                setDistrict(event.target.value);
                setPage(0);
              }}
            >
              <option value="">Tất cả khu vực</option>
              {(districts.data ?? []).map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <select
              className="border-input h-8 rounded-lg border bg-transparent px-2 text-sm"
              value={category}
              onChange={(event) => {
                setCategory(event.target.value);
                setPage(0);
              }}
            >
              {categories.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant={sponsoredOnly ? "default" : "outline"}
              size="sm"
              className="h-8"
              onClick={() => {
                setSponsoredOnly((prev) => !prev);
                setPage(0);
              }}
            >
              ⭐ {sponsoredOnly ? "Đang lọc Đối tác F&B" : "Chỉ xem Đối tác F&B"}
            </Button>
          </div>

          {query.isPending ? (
            <Skeleton className="h-48 w-full" />
          ) : query.isError ? (
            <p className="text-destructive text-sm">{errorMessage(query.error)}</p>
          ) : (
            <>
              <MapView points={pins} height={290} />
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tên địa điểm / Đối tác</TableHead>
                    <TableHead>Loại</TableHead>
                    <TableHead>Khu vực</TableHead>
                    <TableHead>Chi phí dự kiến</TableHead>
                    <TableHead>Đánh giá</TableHead>
                    <TableHead>Thẻ</TableHead>
                    {isAdmin ? <TableHead /> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {query.data.places.map((place) => (
                    <TableRow
                      key={place.id}
                      className={place.isSponsored ? "bg-amber-500/5" : undefined}
                    >
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1.5 font-medium">
                          <span>{place.name}</span>
                          {place.isSponsored ? (
                            <Badge className="bg-amber-500 text-white hover:bg-amber-600">
                              ⭐ {tierLabel[place.sponsorTier ?? "gold"] ?? "Đối tác F&B"}
                            </Badge>
                          ) : null}
                        </div>
                        <div className="text-muted-foreground text-xs">
                          {place.address ?? "—"}
                          {place.isSponsored && place.partnerName
                            ? ` · Hợp đồng: ${place.partnerName}`
                            : ""}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{place.category}</Badge>
                      </TableCell>
                      <TableCell>{place.district ?? "—"}</TableCell>
                      <TableCell>
                        {place.estimatedCostVnd !== null && place.estimatedCostVnd !== undefined ? (
                          place.estimatedCostVnd === 0 ? (
                            <Badge variant="secondary">Miễn phí</Badge>
                          ) : (
                            <span className="text-sm font-medium">
                              {formatMoney(place.estimatedCostVnd)}/người
                            </span>
                          )
                        ) : (
                          priceLabels[place.priceLevel ?? 0] ?? "—"
                        )}
                      </TableCell>
                      <TableCell>{place.avgRating ? `⭐ ${place.avgRating}` : "—"}</TableCell>
                      <TableCell className="max-w-44">
                        <div className="flex flex-wrap gap-1">
                          {place.tags.slice(0, 3).map((tag) => (
                            <Badge key={tag} variant="secondary">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      {isAdmin ? (
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(place)}>
                            Sửa
                          </Button>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {query.data.total} địa điểm · trang {query.data.page + 1}/{totalPages}
                </span>
                <span className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page === 0}
                    onClick={() => setPage((current) => Math.max(0, current - 1))}
                  >
                    Trước
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page + 1 >= totalPages}
                    onClick={() => setPage((current) => current + 1)}
                  >
                    Sau
                  </Button>
                </span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={form !== null} onOpenChange={(open) => (open ? null : setForm(null))}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{form?.id ? "Sửa địa điểm / Đối tác F&B" : "Thêm địa điểm / Đối tác F&B"}</DialogTitle>
            <DialogDescription>
              Cấu hình thông tin địa điểm, chi phí dự kiến để AI tính ngân sách và gói hợp đồng Đối tác F&B (Sponsored).
            </DialogDescription>
          </DialogHeader>
          {form ? (
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="place-name">Tên địa điểm / Quán F&B</Label>
                <Input
                  id="place-name"
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                />
              </div>
              <div className="grid gap-1.5 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="place-category">Loại</Label>
                  <Select
                    items={categoryOptions}
                    value={form.category}
                    onValueChange={(value) => setForm({ ...form, category: String(value) })}
                  >
                    <SelectTrigger id="place-category" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {categoryOptions.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="place-district">Khu vực</Label>
                  <Select
                    items={districtItems}
                    value={form.district}
                    onValueChange={(value) => setForm({ ...form, district: String(value) })}
                  >
                    <SelectTrigger id="place-district" className="w-full">
                      <SelectValue placeholder="Không chọn" />
                    </SelectTrigger>
                    <SelectContent>
                      {districtItems.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="place-address">Địa chỉ</Label>
                <Input
                  id="place-address"
                  value={form.address}
                  onChange={(event) => setForm({ ...form, address: event.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="place-description">Mô tả</Label>
                <textarea
                  id="place-description"
                  rows={2}
                  className="border-input w-full rounded-lg border bg-transparent px-2 py-1.5 text-sm"
                  value={form.description}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                />
              </div>
              <div className="grid gap-1.5 sm:grid-cols-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="place-cost-vnd">Giá dự kiến (VNĐ/người)</Label>
                  <Input
                    id="place-cost-vnd"
                    type="number"
                    min={0}
                    step={10000}
                    placeholder="VD: 150000"
                    value={form.estimatedCostVnd}
                    onChange={(event) => setForm({ ...form, estimatedCostVnd: event.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="place-price">Mức giá (0-3)</Label>
                  <Input
                    id="place-price"
                    type="number"
                    min={0}
                    max={3}
                    value={form.priceLevel}
                    onChange={(event) => setForm({ ...form, priceLevel: event.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="place-rating">Đánh giá (0-5)</Label>
                  <Input
                    id="place-rating"
                    type="number"
                    min={0}
                    max={5}
                    step={0.1}
                    value={form.avgRating}
                    onChange={(event) => setForm({ ...form, avgRating: event.target.value })}
                  />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="place-tags">Thẻ (cách nhau dấu phẩy)</Label>
                <Input
                  id="place-tags"
                  value={form.tags}
                  onChange={(event) => setForm({ ...form, tags: event.target.value })}
                />
              </div>

              {/* Khối Hợp đồng Đối tác F&B Bên thứ 3 (Sponsored / Featured Listing) */}
              <div className="grid gap-2.5 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={form.isSponsored}
                    onChange={(event) => setForm({ ...form, isSponsored: event.target.checked })}
                  />
                  <span>⭐ Kích hoạt Hợp đồng Đối tác F&B (Ưu tiên hiển thị đầu danh sách & AI gợi ý)</span>
                </label>

                {form.isSponsored ? (
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    <div className="grid gap-1">
                      <Label htmlFor="sponsor-tier">Hạng gói tài trợ</Label>
                      <select
                        id="sponsor-tier"
                        className="border-input h-8 rounded-lg border bg-background px-2 text-sm"
                        value={form.sponsorTier}
                        onChange={(e) => setForm({ ...form, sponsorTier: e.target.value })}
                      >
                        <option value="gold">Hạng Vàng (Gold Partner)</option>
                        <option value="silver">Hạng Bạc (Silver Partner)</option>
                        <option value="bronze">Hạng Đồng (Bronze Partner)</option>
                      </select>
                    </div>
                    <div className="grid gap-1">
                      <Label htmlFor="sponsor-priority">Điểm ưu tiên (1 - 10)</Label>
                      <Input
                        id="sponsor-priority"
                        type="number"
                        min={1}
                        max={10}
                        value={form.sponsorPriority}
                        onChange={(e) => setForm({ ...form, sponsorPriority: e.target.value })}
                      />
                    </div>
                    <div className="grid gap-1">
                      <Label htmlFor="partner-name">Tên đơn vị / Đối tác ký HĐ</Label>
                      <Input
                        id="partner-name"
                        placeholder="VD: Công ty TNHH Ẩm thực..."
                        value={form.partnerName}
                        onChange={(e) => setForm({ ...form, partnerName: e.target.value })}
                      />
                    </div>
                    <div className="grid gap-1">
                      <Label htmlFor="partner-contact">SĐT / Email hợp đồng</Label>
                      <Input
                        id="partner-contact"
                        placeholder="0905 xxx xxx · email@..."
                        value={form.partnerContact}
                        onChange={(e) => setForm({ ...form, partnerContact: e.target.value })}
                      />
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="grid gap-1.5">
                <Label>Toạ độ</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input
                    aria-label="Vĩ độ"
                    placeholder="Vĩ độ"
                    value={form.coordinates === null ? "" : String(form.coordinates.latitude)}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        coordinates:
                          event.target.value === ""
                            ? null
                            : {
                                latitude: Number(event.target.value),
                                longitude: form.coordinates?.longitude ?? 108.2022,
                              },
                      })
                    }
                  />
                  <Input
                    aria-label="Kinh độ"
                    placeholder="Kinh độ"
                    value={form.coordinates === null ? "" : String(form.coordinates.longitude)}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        coordinates:
                          event.target.value === ""
                            ? null
                            : {
                                latitude: form.coordinates?.latitude ?? 16.0544,
                                longitude: Number(event.target.value),
                              },
                      })
                    }
                  />
                </div>
                <MapView
                  points={
                    form.coordinates
                      ? [{ id: "draft", name: form.name || "Vị trí mới", ...form.coordinates }]
                      : []
                  }
                  onPick={(latitude, longitude) =>
                    setForm({ ...form, coordinates: { latitude, longitude } })
                  }
                  height={200}
                />
              </div>
              {save.error ? (
                <p className="text-destructive text-sm">{errorMessage(save.error)}</p>
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            {form?.id ? (
              <Button
                variant="destructive"
                className="mr-auto"
                disabled={remove.isPending}
                onClick={() => {
                  const id = form?.id;
                  if (!id) return;
                  confirmDelete(id, form?.name ?? "");
                  setForm(null);
                }}
              >
                {remove.isPending ? "Đang xoá..." : "Xóa"}
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => setForm(null)}>
              Hủy
            </Button>
            <Button
              disabled={save.isPending || !form || form.name.trim() === ""}
              onClick={() => (form ? save.mutate(form) : null)}
            >
              {save.isPending ? "Đang lưu..." : "Lưu"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
