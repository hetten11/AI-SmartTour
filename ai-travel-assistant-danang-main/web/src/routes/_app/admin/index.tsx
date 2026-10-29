import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  adminStatsQueryOptions,
  adminUsersQueryOptions,
  reindexKnowledge,
  updateAdminUser,
} from "@/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { errorMessage, formatDate } from "@/lib/display";

export const Route = createFileRoute("/_app/admin/")({
  component: AdminOverviewPage,
});

function AdminOverviewPage() {
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);

  const stats = useQuery(adminStatsQueryOptions);
  const users = useQuery(adminUsersQueryOptions({ q, page }));

  const reindex = useMutation({
    mutationFn: reindexKnowledge,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
    },
  });

  const toggleUser = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: { isActive?: boolean; role?: string };
    }) => updateAdminUser(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "users"] }),
  });

  const totalPages = users.data ? Math.max(1, Math.ceil(users.data.total / 20)) : 1;

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: "Người dùng", value: stats.data?.users },
          { label: "Địa điểm", value: stats.data?.places },
          { label: "Sự kiện", value: stats.data?.events },
          { label: "Chunk RAG", value: stats.data?.knowledgeChunks },
          { label: "Đang đồng bộ", value: stats.data?.runningRuns },
          { label: "Thông báo chưa đọc", value: stats.data?.unreadNotifications },
        ].map((item) => (
          <Card key={item.label}>
            <CardHeader>
              <CardTitle className="text-muted-foreground text-xs font-normal">
                {item.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-lg font-medium">
              {stats.isPending ? <Skeleton className="h-6 w-12" /> : (item.value ?? 0)}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Kho tri thức RAG</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <p className="text-muted-foreground text-sm">
            Đánh lại chỉ mục sẽ xoá toàn bộ chunk và tạo lại từ địa điểm, sự kiện và file chính
            sách. Cần cấu hình GEMINI_API_KEY vì bước này gọi API embedding.
          </p>
          <div className="flex items-center gap-3">
            <Button disabled={reindex.isPending} onClick={() => reindex.mutate()}>
              {reindex.isPending ? "Đang đánh chỉ mục..." : "Đánh lại chỉ mục"}
            </Button>
            {reindex.data ? (
              <span className="text-muted-foreground text-sm">
                {reindex.data.places} địa điểm, {reindex.data.events} sự kiện,{" "}
                {reindex.data.policies} chính sách
              </span>
            ) : null}
          </div>
          {reindex.error ? (
            <p className="text-destructive text-sm">{errorMessage(reindex.error)}</p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Người dùng</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Input
            placeholder="Tìm theo email"
            value={q}
            onChange={(event) => {
              setQ(event.target.value);
              setPage(0);
            }}
          />

          {users.isPending ? (
            <Skeleton className="h-40 w-full" />
          ) : users.isError ? (
            <p className="text-destructive text-sm">{errorMessage(users.error)}</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Vai trò</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <TableHead>Chuyến đi</TableHead>
                    <TableHead>Tạo lúc</TableHead>
                    <TableHead className="w-72" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.data.users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div>{user.email}</div>
                        <div className="text-muted-foreground text-xs">
                          {user.fullName ?? "chưa có tên"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={user.role === "admin" ? "default" : "outline"}>
                          {user.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {user.isActive ? (
                          <Badge variant="secondary">Hoạt động</Badge>
                        ) : (
                          <Badge variant="destructive">Đã khoá</Badge>
                        )}
                      </TableCell>
                      <TableCell>{user._count?.trips ?? 0}</TableCell>
                      <TableCell>{formatDate(user.createdAt)}</TableCell>
                      <TableCell className="w-72 text-right">
                        <span className="grid grid-cols-2 gap-2">
                          <Button
                            className="w-full"
                            variant="outline"
                            size="sm"
                            disabled={toggleUser.isPending}
                            onClick={() =>
                              toggleUser.mutate({
                                id: user.id,
                                data: { isActive: !user.isActive },
                              })
                            }
                          >
                            {user.isActive ? "Khoá" : "Mở khoá"}
                          </Button>
                          <Button
                            className="w-full"
                            variant="ghost"
                            size="sm"
                            disabled={toggleUser.isPending}
                            onClick={() =>
                              toggleUser.mutate({
                                id: user.id,
                                data: { role: user.role === "admin" ? "traveler" : "admin" },
                              })
                            }
                          >
                            {user.role === "admin" ? "Bỏ quyền admin" : "Cấp quyền admin"}
                          </Button>
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {users.data.total} người dùng · trang {page + 1}/{totalPages}
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
          {toggleUser.error ? (
            <p className="text-destructive text-sm">{errorMessage(toggleUser.error)}</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
