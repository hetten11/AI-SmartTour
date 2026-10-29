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
import { errorMessage } from "@/lib/display";
import { toCoordinates } from "@/lib/geo";
import type { Coordinates } from "@/lib/geo";

export const Route = createFileRoute("/_app/places")({
  component: PlacesPage,
});

const priceLabels = ["Miễn phí", "Rẻ", "Vừa phải", "Cao cấp"];

const categories = [
  { value: "", label: "Tất cả" },
  { value: "beach", label: "Biển" },
  { value: "attraction", label: "Tham quan" },
  { value: "restaurant", label: "Nhà hàng" },
  { value: "cafe", label: "Cà phê" },
  { value: "market", label: "Chợ" },
  { value: "museum", label: "Bảo tàng" },
  { value: "temple", label: "Chùa" },
  { value: "activity", label: "Hoạt động" },
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
  avgRating: string;
  tags: string;
  coordinates: Coordinates | null;
};

const emptyPlace: PlaceForm = {
  id: null,
  name: "",
  category: "attraction",
  district: "",
  address: "",
  description: "",
  priceLevel: "",
  avgRating: "",
  tags: "",
  coordinates: null,
};

const asList = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "");

const nullableNumber = (value: string) => (value.trim() === "" ? null : Number(value));

function PlacesPage() {
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [district, setDistrict] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(0);
  const [form, setForm] = useState<PlaceForm | null>(null);

  const districts = useQuery(districtsQueryOptions);
  const query = useQuery(placesQueryOptions({ q, district, category, page }));
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
        avgRating: nullableNumber(input.avgRating),
        tags: asList(input.tags),
        latitude: input.coordinates?.latitude ?? null,
        longitude: input.coordinates?.longitude ?? null,
      };
      return input.id === null ? createPlace(payload) : updatePlace(input.id, payload);
    },
    onSuccess: async () => {
      setForm(null);
      await queryClient.invalidateQueries({ queryKey: ["places"] });
    },
  });

  // Xoá cứng: knowledge chunk cascade, item lịch trình chuyển place_id về null.
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

  // Xác nhận bằng toast có nút Xóa, thay cho confirm() của trình duyệt.
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
      avgRating: place.avgRating === null ? "" : String(place.avgRating),
      tags: place.tags.join(", "),
      coordinates: toCoordinates(place.latitude, place.longitude),
    });

  const pins = (query.data?.places ?? []).flatMap((place) => {
    const coordinates = toCoordinates(place.latitude, place.longitude);
    return coordinates
      ? [{ id: place.id, name: place.name, ...coordinates, note: place.category }]
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
          <h1 className="text-xl font-medium">Địa điểm</h1>
          <p className="text-muted-foreground text-sm">
            Dữ liệu nền cho đề xuất và lịch trình của trợ lý AI.
          </p>
        </div>
        {isAdmin ? (
          <Button onClick={() => setForm({ ...emptyPlace })}>Thêm địa điểm</Button>
        ) : null}
      </div>

      <Card>
        <CardContent className="grid gap-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <Input
              placeholder="Tìm theo tên, mô tả, địa chỉ"
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
          </div>

          {query.isPending ? (
            <Skeleton className="h-48 w-full" />
          ) : query.isError ? (
            <p className="text-destructive text-sm">{errorMessage(query.error)}</p>
          ) : (
            <>
              <MapView points={pins} height={260} />
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tên</TableHead>
                    <TableHead>Loại</TableHead>
                    <TableHead>Khu vực</TableHead>
                    <TableHead>Giá</TableHead>
                    <TableHead>Đánh giá</TableHead>
                    <TableHead>Thẻ</TableHead>
                    {isAdmin ? <TableHead /> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {query.data.places.map((place) => (
                    <TableRow key={place.id}>
                      <TableCell>
                        <div>{place.name}</div>
                        <div className="text-muted-foreground text-xs">{place.address ?? "—"}</div>
                      </TableCell>
                      <TableCell>{place.category}</TableCell>
                      <TableCell>{place.district ?? "—"}</TableCell>
                      <TableCell>{priceLabels[place.priceLevel ?? 0] ?? "—"}</TableCell>
                      <TableCell>{place.avgRating ?? "—"}</TableCell>
                      <TableCell className="max-w-40">
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
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEdit(place)}
                          >
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
            <DialogTitle>{form?.id ? "Sửa địa điểm" : "Thêm địa điểm"}</DialogTitle>
            <DialogDescription>
              Bấm lên bản đồ để lấy toạ độ, hoặc nhập tay. Nhớ chạy lại chỉ mục RAG sau khi lưu để
              trợ lý AI thấy dữ liệu mới.
            </DialogDescription>
          </DialogHeader>
          {form ? (
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="place-name">Tên</Label>
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
                  rows={3}
                  className="border-input w-full rounded-lg border bg-transparent px-2 py-1.5 text-sm"
                  value={form.description}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                />
              </div>
              <div className="grid gap-1.5 sm:grid-cols-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="place-price">Mức giá 0-3</Label>
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
                  <Label htmlFor="place-rating">Đánh giá 0-5</Label>
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
                <div className="grid gap-1.5">
                  <Label htmlFor="place-tags">Thẻ (cách nhau phẩy)</Label>
                  <Input
                    id="place-tags"
                    value={form.tags}
                    onChange={(event) => setForm({ ...form, tags: event.target.value })}
                  />
                </div>
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
                  onPick={(latitude, longitude) => setForm({ ...form, coordinates: { latitude, longitude } })}
                  height={220}
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
                  // Đóng dialog ngay, việc xoá chờ bấm nút trong toast.
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
