import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { createTrip, deleteTrip, tripsQueryOptions, updateTrip } from "@/api";
import type { CompanionInput, Trip, TripInput } from "@/api";
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
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage, formatDate, partyLabel } from "@/lib/display";

export const Route = createFileRoute("/_app/trips/")({
  component: TripsPage,
});

const emptyTrip: TripInput = {
  title: "",
  startDate: "",
  endDate: "",
  adults: 1,
  children: 0,
  notes: "",
  companions: [],
};

const emptyCompanion: CompanionInput = { name: "", age: "", gender: "", notes: "" };

const toIsoDate = (val: string | null | undefined): string =>
  val ? val.slice(0, 10) : "";

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

function TripsPage() {
  const queryClient = useQueryClient();
  const query = useQuery(tripsQueryOptions);
  const [open, setOpen] = useState(false);
  const [editingTripId, setEditingTripId] = useState<string | null>(null);
  const [form, setForm] = useState<TripInput>(emptyTrip);
  const [validationError, setValidationError] = useState<string | null>(null);

  const openCreate = () => {
    setEditingTripId(null);
    setForm(emptyTrip);
    setValidationError(null);
    setOpen(true);
  };

  const openEdit = (trip: Trip) => {
    setEditingTripId(trip.id);
    setForm({
      title: trip.title ?? "",
      startDate: toIsoDate(trip.startDate),
      endDate: toIsoDate(trip.endDate),
      adults: trip.adults,
      children: trip.children,
      notes: trip.notes ?? "",
      companions: (trip.companions ?? []).map((c) => ({
        name: c.name ?? "",
        age: c.age !== null && c.age !== undefined ? String(c.age) : "",
        gender: c.gender ?? "",
        notes: c.notes ?? "",
      })),
    });
    setValidationError(null);
    setOpen(true);
  };

  const create = useMutation({
    mutationFn: createTrip,
    onSuccess: async () => {
      setOpen(false);
      setForm(emptyTrip);
      setValidationError(null);
      await queryClient.invalidateQueries({ queryKey: ["trips"] });
      toast.add({ type: "success", title: "Đã tạo chuyến đi mới thành công" });
    },
  });

  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: TripInput }) => updateTrip(id, data),
    onSuccess: async (_res, vars) => {
      setOpen(false);
      setEditingTripId(null);
      setForm(emptyTrip);
      setValidationError(null);
      await queryClient.invalidateQueries({ queryKey: ["trips"] });
      await queryClient.invalidateQueries({ queryKey: ["trips", vars.id] });
      await queryClient.invalidateQueries({ queryKey: ["itineraries", vars.id] });
      await queryClient.invalidateQueries({ queryKey: ["itinerary"] });
      toast.add({ type: "success", title: "Đã cập nhật thông tin chuyến đi thành công" });
    },
  });

  const handleSubmit = () => {
    if (form.title.trim() === "") {
      const msg = "Vui lòng nhập tên chuyến đi trước khi lưu!";
      setValidationError(msg);
      toast.add({ type: "warning", title: "Thiếu tên chuyến đi", description: msg });
      return;
    }
    if (form.startDate === "" || form.endDate === "") {
      const msg = "Vui lòng chọn đầy đủ ngày bắt đầu và ngày kết thúc!";
      setValidationError(msg);
      toast.add({ type: "warning", title: "Thiếu ngày đi", description: msg });
      return;
    }
    if (form.endDate < form.startDate) {
      const msg = "Ngày kết thúc phải bằng hoặc sau ngày bắt đầu!";
      setValidationError(msg);
      toast.add({ type: "warning", title: "Ngày đi không hợp lệ", description: msg });
      return;
    }
    setValidationError(null);
    if (editingTripId) {
      update.mutate({ id: editingTripId, data: form });
    } else {
      create.mutate(form);
    }
  };

  const remove = useMutation({
    mutationFn: deleteTrip,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["trips"] }),
  });

  const set = <K extends keyof TripInput>(field: K, value: TripInput[K]) =>
    setForm((previous) => ({ ...previous, [field]: value }));

  const setCompanion = (index: number, field: keyof CompanionInput, value: string) =>
    setForm((previous) => ({
      ...previous,
      companions: previous.companions.map((companion, position) =>
        position === index ? { ...companion, [field]: value } : companion,
      ),
    }));

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-medium">Chuyến đi</h1>
          <p className="text-muted-foreground text-sm">
            Mỗi chuyến đi là một lịch trình riêng, dùng cho trợ lý AI.
          </p>
        </div>
        <Button onClick={openCreate}>Thêm chuyến đi</Button>
      </div>

      <Card>
        <CardContent>
          {query.isPending ? (
            <Skeleton className="h-32 w-full" />
          ) : query.isError ? (
            <p className="text-destructive text-sm">{errorMessage(query.error)}</p>
          ) : query.data.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Chưa có chuyến đi nào. Bấm "Thêm chuyến đi" để bắt đầu.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tên</TableHead>
                  <TableHead>Thời gian</TableHead>
                  <TableHead>Số người</TableHead>
                  <TableHead>Lịch trình</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.map((trip) => {
                  const daysCount = calcTripDays(
                    toIsoDate(trip.startDate),
                    toIsoDate(trip.endDate),
                  );
                  return (
                    <TableRow key={trip.id}>
                      <TableCell>
                        <Link
                          className="font-medium underline-offset-4 hover:underline"
                          to="/trips/$tripId"
                          params={{ tripId: trip.id }}
                        >
                          {trip.title ?? "Chuyến đi chưa đặt tên"}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {formatDate(trip.startDate)} - {formatDate(trip.endDate)}{" "}
                        <span className="text-muted-foreground text-xs">({daysCount} ngày)</span>
                      </TableCell>
                      <TableCell>{partyLabel(trip)}</TableCell>
                      <TableCell>{trip._count?.itineraries ?? 0} phiên bản</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openEdit(trip)}
                          >
                            Sửa
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            disabled={remove.isPending}
                            onClick={() => {
                              if (window.confirm("Xoá chuyến đi này?")) remove.mutate(trip.id);
                            }}
                          >
                            Xoá
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          {remove.error ? (
            <p className="text-destructive mt-3 text-sm">{errorMessage(remove.error)}</p>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingTripId ? "Sửa thông tin chuyến đi" : "Thêm chuyến đi"}
            </DialogTitle>
            <DialogDescription>
              {editingTripId
                ? "Thay đổi số ngày (VD: từ 10 ngày xuống 5 ngày), ngày bắt đầu/kết thúc hoặc số người."
                : "Nhập ngày đi, số người và người đồng hành."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="trip-title">Tên chuyến đi *</Label>
              <Input
                id="trip-title"
                placeholder="VD: Khám phá Đà Nẵng 4 ngày 3 đêm..."
                value={form.title}
                onChange={(event) => {
                  set("title", event.target.value);
                  if (validationError) setValidationError(null);
                }}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="grid gap-1.5">
                <Label htmlFor="trip-start">Ngày bắt đầu</Label>
                <Input
                  id="trip-start"
                  type="date"
                  value={form.startDate}
                  onChange={(event) => {
                    const nextStart = event.target.value;
                    const currentDays = calcTripDays(form.startDate, form.endDate);
                    setForm((prev) => ({
                      ...prev,
                      startDate: nextStart,
                      endDate:
                        prev.endDate && prev.endDate >= nextStart
                          ? prev.endDate
                          : addDaysToIso(nextStart, currentDays),
                    }));
                  }}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="trip-end">Ngày kết thúc</Label>
                <Input
                  id="trip-end"
                  type="date"
                  value={form.endDate}
                  onChange={(event) => set("endDate", event.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="trip-days">Số ngày đi (1–30)</Label>
                <Input
                  id="trip-days"
                  type="number"
                  min={1}
                  max={30}
                  value={calcTripDays(form.startDate, form.endDate)}
                  onChange={(event) => {
                    const days = Math.max(1, Math.min(30, Number(event.target.value) || 1));
                    const baseStart =
                      form.startDate || new Date().toISOString().slice(0, 10);
                    setForm((prev) => ({
                      ...prev,
                      startDate: baseStart,
                      endDate: addDaysToIso(baseStart, days),
                    }));
                  }}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="trip-adults">Người lớn</Label>
                <Input
                  id="trip-adults"
                  type="number"
                  min={1}
                  value={form.adults}
                  onChange={(event) => set("adults", Number(event.target.value))}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="trip-children">Trẻ em</Label>
                <Input
                  id="trip-children"
                  type="number"
                  min={0}
                  value={form.children}
                  onChange={(event) => set("children", Number(event.target.value))}
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="trip-notes">Ghi chú</Label>
              <Textarea
                id="trip-notes"
                rows={2}
                value={form.notes}
                onChange={(event) => set("notes", event.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label>Người đồng hành</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    set("companions", [...form.companions, { ...emptyCompanion }])
                  }
                >
                  Thêm người
                </Button>
              </div>
              {form.companions.map((companion, index) => (
                <div key={index} className="grid grid-cols-[1fr_5rem_1fr_auto] gap-2">
                  <Input
                    placeholder="Tên"
                    value={companion.name}
                    onChange={(event) => setCompanion(index, "name", event.target.value)}
                  />
                  <Input
                    type="number"
                    min={0}
                    placeholder="Tuổi"
                    value={companion.age}
                    onChange={(event) => setCompanion(index, "age", event.target.value)}
                  />
                  <Select
                    value={companion.gender === "" ? null : companion.gender}
                    onValueChange={(value) => setCompanion(index, "gender", value ?? "")}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Giới tính" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="male">Nam</SelectItem>
                        <SelectItem value="female">Nữ</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      set(
                        "companions",
                        form.companions.filter((_, position) => position !== index),
                      )
                    }
                  >
                    ×
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {validationError ? (
            <p className="text-destructive font-medium text-sm" role="alert">
              ⚠️ {validationError}
            </p>
          ) : null}
          {create.error || update.error ? (
            <p className="text-destructive text-sm">
              {errorMessage(create.error ?? update.error)}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setOpen(false);
                setEditingTripId(null);
                setValidationError(null);
              }}
            >
              Huỷ
            </Button>
            <Button
              disabled={create.isPending || update.isPending}
              onClick={handleSubmit}
            >
              {create.isPending || update.isPending
                ? "Đang lưu..."
                : editingTripId
                  ? "Cập nhật chuyến đi"
                  : "Lưu chuyến đi"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
