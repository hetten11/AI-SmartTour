import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { syncRunsQueryOptions } from "@/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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

export const Route = createFileRoute("/_app/admin/sync-runs")({
  component: SyncRunsPage,
});

function SyncRunsPage() {
  const query = useQuery(syncRunsQueryOptions());

  return (
    <Card>
      <CardContent>
        {query.isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : query.isError ? (
          <p className="text-destructive text-sm">{errorMessage(query.error)}</p>
        ) : query.data.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Chưa có lần đồng bộ nào. Bấm "Đồng bộ ngay" ở trang Nguồn dữ liệu.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nguồn</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead>Lấy về</TableHead>
                <TableHead>Thêm</TableHead>
                <TableHead>Sửa</TableHead>
                <TableHead>Huỷ</TableHead>
                <TableHead>Bắt đầu</TableHead>
                <TableHead>Kết thúc</TableHead>
                <TableHead>Lỗi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data.map((run) => (
                <TableRow key={run.id}>
                  <TableCell>{run.source?.name ?? "—"}</TableCell>
                  <TableCell>
                    {run.status === "success" ? (
                      <Badge variant="secondary">success</Badge>
                    ) : run.status === "failed" ? (
                      <Badge variant="destructive">failed</Badge>
                    ) : (
                      <Badge>running</Badge>
                    )}
                  </TableCell>
                  <TableCell>{run.itemsFetched}</TableCell>
                  <TableCell>{run.itemsCreated}</TableCell>
                  <TableCell>{run.itemsUpdated}</TableCell>
                  <TableCell>{run.itemsDeleted}</TableCell>
                  <TableCell>{formatDateTime(run.startedAt)}</TableCell>
                  <TableCell>{formatDateTime(run.finishedAt)}</TableCell>
                  <TableCell className="max-w-64 text-xs">{run.errorMessage ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
