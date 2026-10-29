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

function TripPage() {
  const { tripId } = Route.useParams();
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState("");

  const trip = useQuery(tripQueryOptions(tripId));
  const itineraries = useQuery(itinerariesQueryOptions(tripId));
  const impacts = useQuery(impactsQueryOptions(tripId));

  const generate = useMutation({
    mutationFn: () => generateItinerary(tripId, { notes }),
    onSuccess: async () => {
      setNotes("");
      await queryClient.invalidateQueries({ queryKey: ["itineraries", tripId] });
    },
  });

  const apply = useMutation({
    mutationFn: ({ itineraryId, impactId }: { itineraryId: string; impactId: string }) =>
      applyImpact(itineraryId, impactId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["impacts", tripId] });
      await queryClient.invalidateQueries({ queryKey: ["itineraries", tripId] });
      // Cảnh báo đã xử lý không còn tính vào badge chuông, làm mới ngay.
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
          <CardTitle>Lịch trình do AI tạo</CardTitle>
          <CardDescription>
            AI chỉ dùng địa điểm và sự kiện có trong hệ thống. Mỗi lần tạo là một phiên bản mới.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex gap-2">
            <Input
              placeholder="Yêu cầu thêm: ít di chuyển, nhiều đồ ăn địa phương..."
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
            <Button disabled={generate.isPending} onClick={() => generate.mutate()}>
              {generate.isPending ? "Đang tạo..." : "Tạo lịch trình"}
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
                  <TableHead>Tiêu đề</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead>Hoạt động</TableHead>
                  <TableHead>Chi phí</TableHead>
                  <TableHead>Tạo lúc</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {itineraries.data.map((itinerary) => (
                  <TableRow key={itinerary.id}>
                    <TableCell>v{itinerary.version}</TableCell>
                    <TableCell>
                      <div>{itinerary.title ?? "—"}</div>
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
                    <TableCell>{itinerary._count?.items ?? 0}</TableCell>
                    <TableCell>{formatMoney(itinerary.totalEstimatedCost)}</TableCell>
                    <TableCell>{formatDateTime(itinerary.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      <span className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          render={
                            <Link
                              to="/itineraries/$itineraryId"
                              params={{ itineraryId: itinerary.id }}
                            />
                          }
                        >
                          Xem
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
