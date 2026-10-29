import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { RotateCcw, Search } from "lucide-react";
import { useState } from "react";
import { createEvent, deleteEvent, eventsQueryOptions, meQueryOptions, updateEvent } from "@/api";
import type { Event, EventInput } from "@/api";
import { MapView } from "@/components/map-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { errorMessage, formatDateTime } from "@/lib/display";
import { toCoordinates } from "@/lib/geo";
import type { Coordinates } from "@/lib/geo";

export const Route = createFileRoute("/_app/events/")({
  component: EventsPage,
});

const asList = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "");

const nullableNumber = (value: string) => (value.trim() === "" ? null : Number(value));

// <input type="datetime-local"> dùng giờ địa phương, không phải ISO UTC.
const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

type EventForm = {
  id: string | null;
  title: string;
  venue: string;
  address: string;
  description: string;
  startAt: string;
  endAt: string;
  isFree: boolean;
  priceMin: string;
  priceMax: string;
  ticketUrl: string;
  tags: string;
  coordinates: Coordinates | null;
};

const emptyEvent: EventForm = {
  id: null,
  title: "",
  venue: "",
  address: "",
  description: "",
  startAt: "",
  endAt: "",
  isFree: false,
  priceMin: "",
  priceMax: "",
  ticketUrl: "",
  tags: "",
  coordinates: null,
};

function EventsPage() {
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(0);
  const [form, setForm] = useState<EventForm | null>(null);

  const hasFilters = Boolean(q || from || to);
  const clearFilters = () => {
    setQ("");
    setFrom("");
    setTo("");
    setPage(0);
  };

  const query = useQuery(eventsQueryOptions({ q, from, to, page }));
  const me = useQuery(meQueryOptions);
  const isAdmin = me.data?.role === "admin";
  const totalPages = query.data
    ? Math.max(1, Math.ceil(query.data.total / query.data.pageSize))
    : 1;

  const save = useMutation({
    mutationFn: (input: EventForm) => {
      const payload: EventInput = {
        title: input.title.trim(),
        venue: input.venue.trim() || null,
        address: input.address.trim() || null,
        description: input.description.trim() || null,
        startAt: new Date(input.startAt).toISOString(),
        endAt: input.endAt === "" ? null : new Date(input.endAt).toISOString(),
        isFree: input.isFree,
        priceMin: nullableNumber(input.priceMin),
        priceMax: nullableNumber(input.priceMax),
        ticketUrl: input.ticketUrl.trim() || null,
        tags: asList(input.tags),
        latitude: input.coordinates?.latitude ?? null,
        longitude: input.coordinates?.longitude ?? null,
      };
      return input.id === null ? createEvent(payload) : updateEvent(input.id, payload);
    },
    onSuccess: async () => {
      setForm(null);
      await queryClient.invalidateQueries({ queryKey: ["events"] });
    },
  });

  // Xoá cứng: dọn notification, impact và phiên bản trước (EventVersion chặn xoá).
  const remove = useMutation({
    mutationFn: (id: string) => deleteEvent(id),
    onSuccess: async () => {
      setForm(null);
      await queryClient.invalidateQueries({ queryKey: ["events"] });
      toast.add({ type: "success", title: "Đã xoá sự kiện" });
    },
    onError: (error) =>
      toast.add({ type: "error", title: "Xoá sự kiện thất bại", description: errorMessage(error) }),
  });

  // Xác nhận bằng toast có nút Xóa, thay cho confirm() của trình duyệt.
  const confirmDelete = (id: string, title: string) =>
    toast.add({
      type: "warning",
      title: "Xoá sự kiện?",
      description: `${title} — phiên bản, cảnh báo và thông báo liên quan cũng bị xoá.`,
      actionProps: { children: "Xóa", onClick: () => remove.mutate(id) },
    });

  const openEdit = (event: Event) =>
    setForm({
      id: event.id,
      title: event.title,
      venue: event.venue ?? "",
      address: event.address ?? "",
      description: event.description ?? "",
      startAt: toLocalInput(event.startAt),
      endAt: toLocalInput(event.endAt),
      isFree: event.isFree === true,
      priceMin: event.priceMin === null ? "" : String(Number(event.priceMin)),
      priceMax: event.priceMax === null ? "" : String(Number(event.priceMax)),
      ticketUrl: event.ticketUrl ?? "",
      tags: event.tags.join(", "),
      coordinates: toCoordinates(event.latitude, event.longitude),
    });

  const pins = (query.data?.events ?? []).flatMap((event) => {
    const coordinates = toCoordinates(event.latitude, event.longitude);
    return coordinates
      ? [{ id: event.id, name: event.title, ...coordinates, note: event.venue ?? undefined }]
      : [];
  });

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-medium">Sự kiện</h1>
          <p className="text-muted-foreground text-sm">
            Dữ liệu do Data Sync nhập về hoặc admin nhập tay, mỗi lần đổi lưu thành một phiên bản.
          </p>
        </div>
        {isAdmin ? <Button onClick={() => setForm({ ...emptyEvent })}>Thêm sự kiện</Button> : null}
      </div>

      <Card>
        <CardHeader>
          <div className="grid gap-1">
            <CardTitle>Tìm kiếm và lọc</CardTitle>
            <CardDescription>
              Tìm sự kiện theo từ khóa hoặc khoảng ngày diễn ra.
            </CardDescription>
          </div>
          {hasFilters ? (
            <CardAction>
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <RotateCcw data-icon="inline-start" />
                Xóa bộ lọc
              </Button>
            </CardAction>
          ) : null}
        </CardHeader>

        <CardContent className="grid gap-4">
          <FieldGroup className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field className="gap-1.5 sm:col-span-2">
              <FieldLabel htmlFor="event-search">Từ khóa</FieldLabel>
              <div className="relative">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  id="event-search"
                  type="search"
                  className="pl-9"
                  placeholder="Tên, mô tả hoặc địa điểm"
                  value={q}
                  onChange={(event) => {
                    setQ(event.target.value);
                    setPage(0);
                  }}
                />
              </div>
            </Field>
            <Field className="gap-1.5">
              <FieldLabel htmlFor="event-from">Từ ngày</FieldLabel>
              <Input
                id="event-from"
                type="date"
                value={from}
                onChange={(event) => {
                  setFrom(event.target.value);
                  setPage(0);
                }}
              />
            </Field>
            <Field className="gap-1.5">
              <FieldLabel htmlFor="event-to">Đến ngày</FieldLabel>
              <Input
                id="event-to"
                type="date"
                value={to}
                onChange={(event) => {
                  setTo(event.target.value);
                  setPage(0);
                }}
              />
            </Field>
          </FieldGroup>

          {query.isPending ? (
            <Skeleton className="h-48 w-full" />
          ) : query.isError ? (
            <p className="text-destructive text-sm">
              {errorMessage(query.error)}
            </p>
          ) : query.data.events.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {hasFilters
                ? "Không tìm thấy sự kiện phù hợp. Thử đổi từ khóa hoặc khoảng ngày."
                : "Chưa có sự kiện. Vào Quản trị, chạy đồng bộ nguồn dữ liệu trước."}
            </p>
          ) : (
            <>
              <MapView points={pins} height={260} />
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sự kiện</TableHead>
                    <TableHead>Bắt đầu</TableHead>
                    <TableHead>Địa điểm</TableHead>
                    <TableHead>Giá</TableHead>
                    <TableHead>Phiên bản</TableHead>
                    {isAdmin ? <TableHead /> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {query.data.events.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell>
                        <Link
                          className="underline-offset-4 hover:underline"
                          to="/events/$eventId"
                          params={{ eventId: event.id }}
                        >
                          {event.title}
                        </Link>
                      </TableCell>
                      <TableCell>{formatDateTime(event.startAt)}</TableCell>
                      <TableCell>{event.venue ?? "—"}</TableCell>
                      <TableCell>
                        {event.isFree ? (
                          <Badge variant="secondary">Miễn phí</Badge>
                        ) : (
                          <span className="text-sm">
                            {event.priceMin
                              ? Number(event.priceMin).toLocaleString("vi-VN")
                              : "—"}{" "}
                            đ
                          </span>
                        )}
                      </TableCell>
                      <TableCell>v{event.currentVersion}</TableCell>
                      {isAdmin ? (
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(event)}>
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
                  Hiển thị {query.data.page * query.data.pageSize + 1}–
                  {Math.min(
                    (query.data.page + 1) * query.data.pageSize,
                    query.data.total,
                  )}{" "}
                  trong {query.data.total} sự kiện · trang {query.data.page + 1}
                  /{totalPages}
                </span>
                <span className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page === 0}
                    onClick={() =>
                      setPage((current) => Math.max(0, current - 1))
                    }
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
            <DialogTitle>{form?.id ? "Sửa sự kiện" : "Thêm sự kiện"}</DialogTitle>
            <DialogDescription>
              Sự kiện nhập tay vẫn ghi phiên bản mới và phát thông báo cho itinerary đang dùng nó.
              Bấm lên bản đồ để lấy toạ độ.
            </DialogDescription>
          </DialogHeader>
          {form ? (
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="event-title">Tên sự kiện</Label>
                <Input
                  id="event-title"
                  value={form.title}
                  onChange={(event) => setForm({ ...form, title: event.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="event-venue">Địa điểm tổ chức</Label>
                <Input
                  id="event-venue"
                  value={form.venue}
                  onChange={(event) => setForm({ ...form, venue: event.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="event-address">Địa chỉ</Label>
                <Input
                  id="event-address"
                  value={form.address}
                  onChange={(event) => setForm({ ...form, address: event.target.value })}
                />
              </div>
              <div className="grid gap-1.5 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="event-start">Bắt đầu</Label>
                  <Input
                    id="event-start"
                    type="datetime-local"
                    value={form.startAt}
                    onChange={(event) => setForm({ ...form, startAt: event.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="event-end">Kết thúc (bỏ trống nếu không rõ)</Label>
                  <Input
                    id="event-end"
                    type="datetime-local"
                    value={form.endAt}
                    onChange={(event) => setForm({ ...form, endAt: event.target.value })}
                  />
                </div>
              </div>
              <div className="grid items-center gap-2 sm:grid-cols-3">
                <Label htmlFor="event-free" className="flex items-center gap-2">
                  <input
                    id="event-free"
                    type="checkbox"
                    checked={form.isFree}
                    onChange={(event) => setForm({ ...form, isFree: event.target.checked })}
                  />
                  Miễn phí
                </Label>
                <div className="grid gap-1.5">
                  <Label htmlFor="event-price-min">Giá thấp nhất</Label>
                  <Input
                    id="event-price-min"
                    type="number"
                    min={0}
                    value={form.priceMin}
                    onChange={(event) => setForm({ ...form, priceMin: event.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="event-price-max">Giá cao nhất</Label>
                  <Input
                    id="event-price-max"
                    type="number"
                    min={0}
                    value={form.priceMax}
                    onChange={(event) => setForm({ ...form, priceMax: event.target.value })}
                  />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="event-ticket">Link vé</Label>
                <Input
                  id="event-ticket"
                  value={form.ticketUrl}
                  onChange={(event) => setForm({ ...form, ticketUrl: event.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="event-description">Mô tả</Label>
                <textarea
                  id="event-description"
                  rows={3}
                  className="border-input w-full rounded-lg border bg-transparent px-2 py-1.5 text-sm"
                  value={form.description}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="event-tags">Thẻ (cách nhau phẩy)</Label>
                <Input
                  id="event-tags"
                  value={form.tags}
                  onChange={(event) => setForm({ ...form, tags: event.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Toạ độ</Label>
                <MapView
                  points={
                    form.coordinates
                      ? [{ id: "draft", name: form.title || "Vị trí mới", ...form.coordinates }]
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
                  confirmDelete(id, form?.title ?? "");
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
              disabled={
                save.isPending || !form || form.title.trim() === "" || form.startAt === ""
              }
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
