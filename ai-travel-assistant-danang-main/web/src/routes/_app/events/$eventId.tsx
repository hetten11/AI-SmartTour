import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { eventQueryOptions, eventVersionsQueryOptions } from "@/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { errorMessage, formatDateTime } from "@/lib/display";

export const Route = createFileRoute("/_app/events/$eventId")({
  component: EventPage,
});

function EventPage() {
  const { eventId } = Route.useParams();
  const event = useQuery(eventQueryOptions(eventId));
  const versions = useQuery(eventVersionsQueryOptions(eventId));

  if (event.isPending) return <Skeleton className="h-48 w-full" />;
  if (event.isError) {
    return <p className="text-destructive text-sm">{errorMessage(event.error)}</p>;
  }

  const data = event.data;

  return (
    <div className="grid gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-medium">{data.title}</h1>
          <p className="text-muted-foreground text-sm">
            {formatDateTime(data.startAt)}
            {data.endAt ? ` - ${formatDateTime(data.endAt)}` : ""} · {data.venue ?? "chưa rõ địa điểm"}
          </p>
        </div>
        <Button variant="outline" render={<Link to="/events" />}>
          Về danh sách
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Thông tin</CardTitle>
          <CardDescription>
            Nguồn: {data.source?.name ?? "không rõ"} · phiên bản hiện tại v{data.currentVersion}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          <p>{data.description ?? "Không có mô tả."}</p>
          <p className="text-muted-foreground">Địa chỉ: {data.address ?? "—"}</p>
          <div className="flex flex-wrap gap-1">
            {data.tags.map((tag) => (
              <Badge key={tag} variant="secondary">
                {tag}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lịch sử thay đổi</CardTitle>
          <CardDescription>Mỗi lần đồng bộ phát hiện khác biệt thì thêm một phiên bản.</CardDescription>
        </CardHeader>
        <CardContent>
          {versions.isPending ? (
            <Skeleton className="h-24 w-full" />
          ) : versions.data && versions.data.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Phiên bản</TableHead>
                  <TableHead>Loại</TableHead>
                  <TableHead>Trường đổi</TableHead>
                  <TableHead>Thời điểm</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {versions.data.map((version) => (
                  <TableRow key={version.id}>
                    <TableCell>v{version.versionNumber}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{version.changeType}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {version.changedFields.length > 0 ? version.changedFields.join(", ") : "—"}
                    </TableCell>
                    <TableCell>{formatDateTime(version.detectedAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-muted-foreground text-sm">Chưa có phiên bản nào.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
