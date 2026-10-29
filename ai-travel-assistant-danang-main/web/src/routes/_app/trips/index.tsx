import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { createTrip, deleteTrip, tripsQueryOptions } from "@/api";
import type { CompanionInput, TripInput } from "@/api";
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

function TripsPage() {
  const queryClient = useQueryClient();
  const query = useQuery(tripsQueryOptions);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<TripInput>(emptyTrip);

  const create = useMutation({
    mutationFn: createTrip,
    onSuccess: async () => {
      setOpen(false);
      setForm(emptyTrip);
      await queryClient.invalidateQueries({ queryKey: ["trips"] });
    },
  });

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
        <Button onClick={() => setOpen(true)}>Thêm chuyến đi</Button>
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
                {query.data.map((trip) => (
                  <TableRow key={trip.id}>
                    <TableCell>
                      <Link
                        className="underline-offset-4 hover:underline"
                        to="/trips/$tripId"
                        params={{ tripId: trip.id }}
                      >
                        {trip.title ?? "Chuyến đi chưa đặt tên"}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {formatDate(trip.startDate)} - {formatDate(trip.endDate)}
                    </TableCell>
                    <TableCell>{partyLabel(trip)}</TableCell>
                    <TableCell>{trip._count?.itineraries ?? 0} phiên bản</TableCell>
                    <TableCell className="text-right">
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
                    </TableCell>
                  </TableRow>
                ))}
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
            <DialogTitle>Thêm chuyến đi</DialogTitle>
            <DialogDescription>
              Nhập ngày đi, số người và người đồng hành.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="trip-title">Tên chuyến đi</Label>
              <Input
                id="trip-title"
                value={form.title}
                onChange={(event) => set("title", event.target.value)}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="trip-start">Ngày bắt đầu</Label>
                <Input
                  id="trip-start"
                  type="date"
                  value={form.startDate}
                  onChange={(event) => set("startDate", event.target.value)}
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

          {create.error ? (
            <p className="text-destructive text-sm">{errorMessage(create.error)}</p>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Huỷ
            </Button>
            <Button
              disabled={create.isPending}
              onClick={() => create.mutate(form)}
            >
              {create.isPending ? "Đang lưu..." : "Lưu chuyến đi"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
