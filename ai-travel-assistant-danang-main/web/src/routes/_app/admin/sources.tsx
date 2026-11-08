import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  crawlPlaces,
  createSource,
  deleteSource,
  runSource,
  sourcesQueryOptions,
  updateSource,
} from "@/api";
import type { DataSource, DataSourceInput } from "@/api";
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
import { describeCron } from "@/lib/cron";

export const Route = createFileRoute("/_app/admin/sources")({
  component: SourcesPage,
});

const emptySource: DataSourceInput = {
  name: "",
  sourceType: "danang_web",
  cronExpression: "0 0 * * *",
  isActive: true,
};

// Đếm bản ghi để báo ngay trên form; server vẫn kiểm tra lại.
const countRecords = (text: string): number => {
  const parsed: unknown = JSON.parse(text);
  if (Array.isArray(parsed)) return parsed.length;
  if (parsed !== null && typeof parsed === "object" && "events" in parsed) {
    const events = (parsed as { events: unknown }).events;
    return Array.isArray(events) ? events.length : -1;
  }
  return -1;
};

function SourcesPage() {
  const queryClient = useQueryClient();
  const query = useQuery(sourcesQueryOptions);
  const [editing, setEditing] = useState<DataSource | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<DataSourceInput>(emptySource);
  const [fileLabel, setFileLabel] = useState("");
  const [fileError, setFileError] = useState("");
  const [autoName, setAutoName] = useState("");

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin", "sources"] });

  const save = useMutation({
    mutationFn: async () => {
      if (editing) return updateSource(editing.id, form);
      return createSource(form);
    },
    onSuccess: async () => {
      setOpen(false);
      setEditing(null);
      setForm(emptySource);
      setFileLabel("");
      setFileError("");
      setAutoName("");
      await refresh();
    },
  });

  const pickFile = async (file: File | undefined) => {
    setFileError("");
    if (!file) return;
    const text = await file.text();

    let count = -1;
    try {
      count = countRecords(text);
    } catch {
      count = -1;
    }

    setFileLabel(file.name);
    if (count < 1) {
      setForm((previous) => ({ ...previous, content: undefined }));
      setFileError("File phải là mảng sự kiện hoặc object có trường events, và không được rỗng");
      return;
    }

    // Tự điền tên nguồn theo tên file, nhưng không ghi đè tên người dùng đã gõ.
    const suggested = file.name.replace(/\.json$/i, "");
    setForm((previous) => ({
      ...previous,
      content: text,
      url: undefined,
      name:
        previous.name === "" || previous.name === autoName ? suggested : previous.name,
    }));
    setAutoName(suggested);
    setFileLabel(`${file.name} · ${count} bản ghi`);
  };

  const remove = useMutation({
    mutationFn: deleteSource,
    onSuccess: refresh,
  });

  const run = useMutation({
    mutationFn: runSource,
    onSuccess: async () => {
      await refresh();
      await queryClient.invalidateQueries({ queryKey: ["sync-runs"] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
    },
  });

  const toggle = useMutation({
    mutationFn: (source: DataSource) => updateSource(source.id, { isActive: !source.isActive }),
    onSuccess: refresh,
  });

  const crawlPlacesMutation = useMutation({
    mutationFn: () => crawlPlaces({ limit: 80, includeOsm: true }),
    onSuccess: async (res) => {
      await queryClient.invalidateQueries({ queryKey: ["places"] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
      toast.add({
        type: "success",
        title: "Đã cào dữ liệu Địa điểm Đà Nẵng",
        description: `Tổng xử lý: ${res.totalProcessed} (${res.created} mới, ${res.updated} cập nhật)`,
      });
    },
  });

  const set = <K extends keyof DataSourceInput>(field: K, value: DataSourceInput[K]) =>
    setForm((previous) => ({ ...previous, [field]: value }));

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">
          Tự động cào dữ liệu sự kiện Web Đà Nẵng lúc 0h00 mỗi ngày (0 0 * * *) và cào dữ liệu địa điểm du lịch, ẩm thực.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={crawlPlacesMutation.isPending}
            onClick={() => crawlPlacesMutation.mutate()}
          >
            {crawlPlacesMutation.isPending ? "Đang cào địa điểm..." : "🕷️ Cào dữ liệu Địa điểm Đà Nẵng"}
          </Button>
          <Button
            onClick={() => {
              setEditing(null);
              setForm(emptySource);
              setFileLabel("");
              setFileError("");
              setAutoName("");
              setOpen(true);
            }}
          >
            + Thêm nguồn sự kiện
          </Button>
        </div>
      </div>

      <Card>
        <CardContent>
          {query.isPending ? (
            <Skeleton className="h-40 w-full" />
          ) : query.isError ? (
            <p className="text-destructive text-sm">{errorMessage(query.error)}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nguồn</TableHead>
                  <TableHead>Loại</TableHead>
                  <TableHead>Lịch chạy</TableHead>
                  <TableHead>Sự kiện</TableHead>
                  <TableHead>Lần cuối</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.map((source) => (
                  <TableRow key={source.id}>
                    <TableCell>
                      <div>{source.name}</div>
                      <div className="text-muted-foreground text-xs">{source.url}</div>
                    </TableCell>
                    <TableCell>{source.sourceType ?? "api"}</TableCell>
                    <TableCell className="text-sm">
                      <div>{describeCron(source.cronExpression)}</div>
                      {describeCron(source.cronExpression) !== source.cronExpression ? (
                        <div className="text-muted-foreground font-mono text-xs">
                          {source.cronExpression}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>{source._count?.events ?? 0}</TableCell>
                    <TableCell>{formatDateTime(source.lastSyncedAt)}</TableCell>
                    <TableCell>
                      {source.isActive ? (
                        <Badge variant="secondary">Bật</Badge>
                      ) : (
                        <Badge variant="outline">Tắt</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          disabled={run.isPending}
                          onClick={() => run.mutate(source.id)}
                        >
                          Đồng bộ ngay
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditing(source);
                            setForm({
                              name: source.name,
                              sourceType:
                                source.sourceType === "file"
                                  ? "file"
                                  : source.sourceType === "danang_web"
                                    ? "danang_web"
                                    : "api",
                              url: source.sourceType === "file" ? undefined : source.url,
                              cronExpression: source.cronExpression,
                              isActive: source.isActive,
                            });
                            setFileLabel("");
                            setFileError("");
                            setAutoName("");
                            setOpen(true);
                          }}
                        >
                          Sửa
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={toggle.isPending}
                          onClick={() => toggle.mutate(source)}
                        >
                          {source.isActive ? "Tắt" : "Bật"}
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={remove.isPending}
                          onClick={() => {
                            if (window.confirm("Xoá nguồn này và toàn bộ lịch sử đồng bộ?")) {
                              remove.mutate(source.id);
                            }
                          }}
                        >
                          Xoá
                        </Button>
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {run.error ? (
            <p className="text-destructive mt-3 text-sm">{errorMessage(run.error)}</p>
          ) : null}
          {remove.error ? (
            <p className="text-destructive mt-3 text-sm">{errorMessage(remove.error)}</p>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Sửa nguồn dữ liệu" : "Thêm nguồn dữ liệu"}</DialogTitle>
            <DialogDescription>
              Nguồn loại file dùng file JSON sự kiện tải lên, mỗi lần sửa có thể chọn file mới để
              thay. Nguồn loại api thì gọi URL trả JSON.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="source-name">Tên</Label>
              <Input
                id="source-name"
                placeholder="Tự điền theo tên file khi tải lên"
                value={form.name}
                onChange={(event) => set("name", event.target.value)}
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="source-type">Loại nguồn dữ liệu</Label>
              <select
                id="source-type"
                className="border-input h-8 w-full rounded-lg border bg-transparent px-2 text-sm"
                value={form.sourceType}
                onChange={(event) =>
                  set(
                    "sourceType",
                    event.target.value === "file"
                      ? "file"
                      : event.target.value === "danang_web"
                        ? "danang_web"
                        : "api",
                  )
                }
              >
                <option value="danang_web">danang_web (Tự động cào Web Sự kiện Đà Nẵng)</option>
                <option value="file">file (tải file JSON lên)</option>
                <option value="api">api (URL JSON)</option>
              </select>
            </div>

            {form.sourceType === "file" ? (
              <div className="grid gap-1.5">
                <Label htmlFor="source-file">File JSON sự kiện</Label>
                <input
                  id="source-file"
                  type="file"
                  accept="application/json,.json"
                  className="text-muted-foreground w-full text-sm file:mr-3 file:cursor-pointer file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1 file:text-sm file:font-medium file:text-foreground hover:file:bg-muted"
                  onChange={(event) => void pickFile(event.target.files?.[0])}
                />
                {fileLabel ? (
                  <span className={fileError ? "text-destructive text-xs" : "text-xs"}>
                    {fileLabel}
                  </span>
                ) : (
                  <span className="text-muted-foreground text-xs">
                    Mảng sự kiện hoặc object có trường events. Cần externalId (hoặc id), title,
                    startAt.
                  </span>
                )}
                {fileError ? <span className="text-destructive text-xs">{fileError}</span> : null}
                {editing && form.content === undefined ? (
                  <span className="text-muted-foreground text-xs">
                    Đang dùng file: {editing.url}. Chọn file mới nếu muốn thay.
                  </span>
                ) : null}
              </div>
            ) : (
              <div className="grid gap-1.5">
                <Label htmlFor="source-url">URL (tùy chọn cho danang_web)</Label>
                <Input
                  id="source-url"
                  placeholder="https://danangfantastiCity.com/events"
                  value={form.url ?? ""}
                  onChange={(event) => set("url", event.target.value)}
                />
              </div>
            )}

            <div className="grid gap-1.5">
              <Label htmlFor="source-cron">Lịch chạy tự động (Cron - mặc định 0 0 * * * = 0h00 mỗi ngày)</Label>
              <Input
                id="source-cron"
                value={form.cronExpression}
                onChange={(event) => set("cronExpression", event.target.value)}
              />
              <span className="text-muted-foreground text-xs">
                {describeCron(form.cronExpression)}
              </span>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) => set("isActive", event.target.checked)}
              />
              Bật lịch chạy tự động
            </label>
          </div>

          {save.error ? (
            <p className="text-destructive text-sm">{errorMessage(save.error)}</p>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Huỷ
            </Button>
            <Button
              disabled={
                save.isPending ||
                (form.sourceType === "file" && form.content === undefined && editing === null) ||
                (form.sourceType === "api" && (form.url ?? "") === "")
              }
              onClick={() => save.mutate()}
            >
              {save.isPending ? "Đang lưu..." : "Lưu nguồn"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
